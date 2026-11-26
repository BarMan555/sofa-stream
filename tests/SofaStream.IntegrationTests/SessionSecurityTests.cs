using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;

namespace SofaStream.IntegrationTests;

[Collection("PostgreSQL API")]
public sealed class SessionSecurityTests(ApiFixture fixture)
{
    [Fact]
    public async Task Session_IsIssuedByServer_AndModifiedTokenIsRejected()
    {
        var response = await fixture.Client.PostAsJsonAsync("/api/session", new { userId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var session = (await response.Content.ReadFromJsonAsync<Session>())!;
        Assert.NotEqual(Guid.Empty, session.UserId);
        Assert.False(string.IsNullOrWhiteSpace(session.Token));
        using var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.Token + "changed");
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/room", new { name = "Forged", hostId = session.UserId })).StatusCode);
    }

    [Fact]
    public async Task AnonymousPlayback_CannotUsePublicHostId()
    {
        var (host, client) = await NewSession();
        using (client)
        {
            var room = await Create(client, host.UserId);
            var response = await fixture.Client.PostAsJsonAsync($"/api/room/{room}/playback", new
            {
                userId = host.UserId, requestedState = 1, clientPosition = TimeSpan.Zero,
            });
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
    }

    [Theory]
    [InlineData("playback")]
    [InlineData("video")]
    [InlineData("playback/buffering-completed")]
    [InlineData("join")]
    public async Task AuthenticatedGuest_CannotUseHostsIdentity(string action)
    {
        var (host, hostClient) = await NewSession();
        var (_, guestClient) = await NewSession();
        using (hostClient)
        using (guestClient)
        {
            var room = await Create(hostClient, host.UserId);
            var response = await guestClient.PostAsJsonAsync($"/api/room/{room}/{action}", new
            {
                userId = host.UserId, requestedState = 0, clientPosition = TimeSpan.Zero,
                videoUrl = "https://www.youtube.com/watch?v=M7lc1UVf-VE", title = "Forged", durationSeconds = 120,
            });
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }
    }

    [Fact]
    public async Task Hub_RejectsAnonymousAndNonMembers_AndDerivesSignalSender()
    {
        await using var anonymous = fixture.CreateConnection();
        await Assert.ThrowsAnyAsync<Exception>(() => anonymous.StartAsync());
        var (host, hostClient) = await NewSession();
        var (guest, guestClient) = await NewSession();
        var (outsider, outsiderClient) = await NewSession();
        using (hostClient)
        using (guestClient)
        using (outsiderClient)
        {
            var room = await Create(hostClient, host.UserId);
            await using var outsideHub = Connection(outsider.Token);
            await outsideHub.StartAsync();
            await Assert.ThrowsAsync<HubException>(() => outsideHub.InvokeAsync("JoinRoom", room, outsider.UserId));
            (await guestClient.PostAsJsonAsync($"/api/room/{room}/join", new { userId = guest.UserId })).EnsureSuccessStatusCode();
            await using var hostHub = Connection(host.Token);
            await using var guestHub = Connection(guest.Token);
            var received = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            hostHub.On<string, string, string>("OnSignalReceived", (sender, _, _) => received.TrySetResult(sender));
            await hostHub.StartAsync();
            await hostHub.InvokeAsync("JoinRoom", room, host.UserId);
            await guestHub.StartAsync();
            await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("JoinRoom", room, host.UserId));
            await guestHub.InvokeAsync("JoinRoom", room, guest.UserId);
            await guestHub.InvokeAsync("SendSignal", room.ToString(), host.UserId.ToString(), host.UserId.ToString(), "hello");
            Assert.Equal(guest.UserId.ToString(), await received.Task.WaitAsync(TimeSpan.FromSeconds(5)));
            await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("SendSignal", Guid.NewGuid().ToString(),
                guest.UserId.ToString(), host.UserId.ToString(), "cross-room"));
            await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("SendSignal", room.ToString(),
                guest.UserId.ToString(), outsider.UserId.ToString(), "outside-target"));
        }
    }

    [Fact]
    public async Task ConcurrentAdmission_NeverExceedsFourParticipants()
    {
        var (host, hostClient) = await NewSession();
        using (hostClient)
        {
            var room = await Create(hostClient, host.UserId);
            var guests = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => NewSession()));
            try
            {
                var responses = await Task.WhenAll(guests.Select(g => g.Client.PostAsJsonAsync(
                    $"/api/room/{room}/join", new { userId = g.Session.UserId })));
                Assert.Equal(3, responses.Count(r => r.IsSuccessStatusCode));
                Assert.Equal(3, responses.Count(r => r.StatusCode == HttpStatusCode.BadRequest));
            }
            finally { foreach (var guest in guests) guest.Client.Dispose(); }
        }
    }

    private Microsoft.AspNetCore.SignalR.Client.HubConnection Connection(string? token) =>
        new Microsoft.AspNetCore.SignalR.Client.HubConnectionBuilder().WithUrl("http://localhost/hubs/room", options =>
        {
            options.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.LongPolling;
            options.HttpMessageHandlerFactory = _ => fixture.Factory.Server.CreateHandler();
            options.AccessTokenProvider = () => Task.FromResult(token);
        }).Build();

    private async Task<(Session Session, HttpClient Client)> NewSession()
    {
        var response = await fixture.Client.PostAsync("/api/session", null);
        response.EnsureSuccessStatusCode();
        var session = (await response.Content.ReadFromJsonAsync<Session>())!;
        var client = fixture.Factory.CreateClient();
        if (session.Token is not null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.Token);
        return (session, client);
    }

    private static async Task<Guid> Create(HttpClient client, Guid host)
    {
        var response = await client.PostAsJsonAsync("/api/room", new { name = "Session security", hostId = host });
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<Guid>();
    }

    private sealed record Session(Guid UserId, string? Token);
}
