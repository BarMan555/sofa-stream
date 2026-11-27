using System.Net.Http.Json;
using Microsoft.AspNetCore.SignalR.Client;
using SofaStream.Application.Rooms.Queries.GetRoomState;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SofaStream.Api.Infrastructure;
using SofaStream.Infrastructure.Persistence;

namespace SofaStream.IntegrationTests;

[Collection("PostgreSQL API")]
public sealed class ReconnectionTests(ApiFixture fixture)
{
    [Fact]
    public async Task ShortDisconnect_PreservesHostAndMembership_AndRejoinRestoresNotifications()
    {
        var host = Guid.NewGuid();
        var guest = Guid.NewGuid();
        using var hostClient = fixture.ClientFor(host);
        var created = await hostClient.PostAsJsonAsync("/api/room", new { name = "Reconnect", hostId = host });
        var room = await created.Content.ReadFromJsonAsync<Guid>();
        (await fixture.ClientFor(guest).PostAsJsonAsync($"/api/room/{room}/join", new { userId = guest })).EnsureSuccessStatusCode();
        await using var first = fixture.CreateConnection(host);
        await first.StartAsync();
        await first.InvokeAsync("JoinRoom", room, host);
        await first.StopAsync();
        var snapshot = (await hostClient.GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!;
        Assert.Equal(2, snapshot.Participants.Count);
        Assert.True(snapshot.Participants.Single(p => p.UserId == host).IsHost);

        await using var replacement = fixture.CreateConnection(host);
        var received = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        replacement.On<object>("OnPlaybackStateChanged", _ => received.TrySetResult(true));
        await replacement.StartAsync();
        await replacement.InvokeAsync("JoinRoom", room, host);
        (await hostClient.PostAsJsonAsync($"/api/room/{room}/playback", new
        { userId = host, requestedState = 1, clientPosition = TimeSpan.Zero })).EnsureSuccessStatusCode();
        Assert.True(await received.Task.WaitAsync(TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public async Task OldDisconnect_CannotRemoveReplacementConnection()
    {
        var host = Guid.NewGuid();
        using var client = fixture.ClientFor(host);
        var created = await client.PostAsJsonAsync("/api/room", new { name = "Replace socket", hostId = host });
        var room = await created.Content.ReadFromJsonAsync<Guid>();
        await using var old = fixture.CreateConnection(host);
        await using var current = fixture.CreateConnection(host);
        await old.StartAsync();
        await old.InvokeAsync("JoinRoom", room, host);
        await current.StartAsync();
        await current.InvokeAsync("JoinRoom", room, host);
        await old.StopAsync();
        Assert.True((await client.GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!.Participants.Single().IsHost);
    }

    [Fact]
    public async Task GraceExpiry_PromotesRemainingGuest_AndExplicitExitDeletesEmptyRoom()
    {
        var host = Guid.NewGuid();
        var guest = Guid.NewGuid();
        using var client = fixture.ClientFor(host);
        using var guestClient = fixture.ClientFor(guest);
        var created = await client.PostAsJsonAsync("/api/room", new { name = "Grace expiry", hostId = host });
        var room = await created.Content.ReadFromJsonAsync<Guid>();
        (await guestClient.PostAsJsonAsync($"/api/room/{room}/join", new { userId = guest })).EnsureSuccessStatusCode();
        await using var hostHub = fixture.CreateConnection(host);
        await using var guestHub = fixture.CreateConnection(guest);
        var promoted = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        guestHub.On<string>("OnHostChanged", id => promoted.TrySetResult(id));
        await hostHub.StartAsync();
        await hostHub.InvokeAsync("JoinRoom", room, host);
        await guestHub.StartAsync();
        await guestHub.InvokeAsync("JoinRoom", room, guest);
        await hostHub.StopAsync();
        DateTimeOffset? disconnectedAt = null;
        for (var attempt = 0; attempt < 100 && disconnectedAt is null; attempt++)
        {
            using var scope = fixture.Factory.Services.CreateScope();
            disconnectedAt = await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Set<SofaStream.Domain.Entities.RoomParticipant>()
                .Where(p => p.RoomId == room && p.UserId == host).Select(p => p.DisconnectedAt).SingleAsync();
            if (disconnectedAt is null) await Task.Delay(20);
        }
        Assert.NotNull(disconnectedAt);
        try
        {
            fixture.Clock.FixedUtcNow = disconnectedAt.Value.AddSeconds(29);
            using (await fixture.Factory.Services.GetRequiredService<RoomMutationGate>().EnterAsync())
            using (var scope = fixture.Factory.Services.CreateScope())
                await scope.ServiceProvider.GetRequiredService<RoomConnectionLifecycle>().ExpireAsync();
            Assert.Equal(2, (await guestClient.GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!.Participants.Count);
            fixture.Clock.FixedUtcNow = disconnectedAt.Value.AddSeconds(31);
            Assert.Equal(guest.ToString(), await promoted.Task.WaitAsync(TimeSpan.FromSeconds(5)));
            var survivor = Assert.Single((await guestClient.GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!.Participants);
            Assert.True(survivor.IsHost);
            await guestHub.InvokeAsync("LeaveRoom");
            using var finalScope = fixture.Factory.Services.CreateScope();
            Assert.False(await finalScope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Rooms.AnyAsync(r => r.Id == room));
        }
        finally { fixture.Clock.FixedUtcNow = null; }
    }
}
