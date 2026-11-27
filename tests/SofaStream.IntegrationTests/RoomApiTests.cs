using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR.Client;
using SofaStream.Application.Rooms.Queries.GetRoomState;

namespace SofaStream.IntegrationTests;

[Collection("PostgreSQL API")]
public sealed class RoomApiTests(ApiFixture fixture)
{
    private HttpClient Client => fixture.Client;
    private readonly Dictionary<Guid, Guid> _readers = new();

    [Fact]
    public async Task CreateRoom_PersistsHostAndTheme_AndDapperReadsThem()
    {
        var host = Guid.NewGuid();
        var roomId = await CreateRoom(host, "Persisted room", "Princess");
        var state = await GetRoom(roomId);

        Assert.Equal("Persisted room", state.Name);
        Assert.Equal("Princess", state.Theme);
        Assert.Equal("Paused", state.PlaybackState);
        Assert.Null(state.CurrentVideo);
        var participant = Assert.Single(state.Participants);
        Assert.Equal(host, participant.UserId);
        Assert.True(participant.IsHost);
    }

    [Fact]
    public async Task JoinRoom_RejectsFifthParticipant_WithoutPersistingThem()
    {
        var roomId = await CreateRoom(Guid.NewGuid());
        for (var index = 0; index < 3; index++) await Join(roomId, Guid.NewGuid());
        var rejected = Guid.NewGuid();
        var response = await fixture.ClientFor(rejected).PostAsJsonAsync($"/api/room/{roomId}/join", new { userId = rejected });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Room.RoomFull", await ErrorCode(response));
        var state = await GetRoom(roomId);
        Assert.Equal(4, state.Participants.Count);
        Assert.DoesNotContain(state.Participants, participant => participant.UserId == rejected);
    }

    [Fact]
    public async Task GuestCannotChangeVideoOrPauseRoom()
    {
        var host = Guid.NewGuid();
        var guest = Guid.NewGuid();
        var roomId = await CreateRoom(host);
        await Join(roomId, guest);
        var videoResponse = await fixture.ClientFor(guest).PostAsJsonAsync($"/api/room/{roomId}/video", new
        {
            userId = guest, videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            title = "Denied video", durationSeconds = 120,
        });
        var playbackResponse = await Playback(roomId, guest, 0, 10);

        Assert.Equal("Room.NotHost", await ErrorCode(videoResponse));
        Assert.Equal("Room.NotHost", await ErrorCode(playbackResponse));
        var state = await GetRoom(roomId);
        Assert.Null(state.CurrentVideo);
        Assert.Equal(0, state.CurrentPositionSeconds);
    }

    [Fact]
    public async Task Playback_IsSaved_AndBroadcastToTwoRealSignalRClients()
    {
        var host = Guid.NewGuid();
        var guest = Guid.NewGuid();
        var roomId = await CreateRoom(host);
        await Join(roomId, guest);
        await using var hostConnection = fixture.CreateConnection(host);
        await using var guestConnection = fixture.CreateConnection(guest);
        var hostEvent = new TaskCompletionSource<PlaybackNotification>(TaskCreationOptions.RunContinuationsAsynchronously);
        var guestEvent = new TaskCompletionSource<PlaybackNotification>(TaskCreationOptions.RunContinuationsAsynchronously);
        hostConnection.On<PlaybackNotification>("OnPlaybackStateChanged", value => hostEvent.TrySetResult(value));
        guestConnection.On<PlaybackNotification>("OnPlaybackStateChanged", value => guestEvent.TrySetResult(value));
        await hostConnection.StartAsync();
        await hostConnection.InvokeAsync("JoinRoom", roomId, host);
        await guestConnection.StartAsync();
        await guestConnection.InvokeAsync("JoinRoom", roomId, guest);

        (await Playback(roomId, host, 1, 42)).EnsureSuccessStatusCode();
        var notifications = await Task.WhenAll(
            hostEvent.Task.WaitAsync(TimeSpan.FromSeconds(10)), guestEvent.Task.WaitAsync(TimeSpan.FromSeconds(10)));
        foreach (var notification in notifications)
        {
            Assert.Equal("Playing", notification.State);
            Assert.Equal(42, notification.PositionInSeconds);
            Assert.NotNull(notification.ScheduledFor);
            Assert.Equal(TimeSpan.FromSeconds(1), notification.ScheduledFor!.Value - notification.TriggeredAt);
        }
        var state = await GetRoom(roomId);
        Assert.Equal("Playing", state.PlaybackState);
        var scheduledFor = notifications[0].ScheduledFor!.Value;
        Assert.Equal(42 + Math.Max(0, (state.SnapshotAt - scheduledFor).TotalSeconds), state.CurrentPositionSeconds, 3);
    }

    [Fact]
    public async Task ExplicitLeave_PromotesGuest_ThenDeletesEmptyRoom()
    {
        var host = Guid.NewGuid();
        var guest = Guid.NewGuid();
        var roomId = await CreateRoom(host);
        await Join(roomId, guest);
        await using var hostConnection = fixture.CreateConnection(host);
        await using var guestConnection = fixture.CreateConnection(guest);
        var promotion = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        guestConnection.On<string>("OnHostChanged", value => promotion.TrySetResult(value));
        await hostConnection.StartAsync();
        await hostConnection.InvokeAsync("JoinRoom", roomId, host);
        await guestConnection.StartAsync();
        await guestConnection.InvokeAsync("JoinRoom", roomId, guest);

        await hostConnection.InvokeAsync("LeaveRoom");
        await hostConnection.StopAsync();
        Assert.Equal(guest.ToString(), await promotion.Task.WaitAsync(TimeSpan.FromSeconds(10)));
        _readers[roomId] = guest;
        var promotedState = await GetRoom(roomId);
        var remaining = Assert.Single(promotedState.Participants);
        Assert.Equal(guest, remaining.UserId);
        Assert.True(remaining.IsHost);

        await guestConnection.InvokeAsync("LeaveRoom");
        await guestConnection.StopAsync();
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (DateTime.UtcNow < deadline)
        {
            var response = await fixture.ClientFor(guest).GetAsync($"/api/room/{roomId}");
            if (response.StatusCode == HttpStatusCode.Forbidden)
            {
                return;
            }
            await Task.Delay(100);
        }
        Assert.Fail("The last disconnect did not delete the empty room.");
    }

    [Fact]
    public async Task ReadyEndpoint_VerifiesActualMigratedDatabase()
    {
        var response = await Client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    private async Task<Guid> CreateRoom(Guid host, string name = "Integration room", string theme = "Dark")
    {
        var response = await fixture.ClientFor(host).PostAsJsonAsync("/api/room", new { name, hostId = host, theme });
        response.EnsureSuccessStatusCode();
        var room = await response.Content.ReadFromJsonAsync<Guid>();
        _readers[room] = host;
        return room;
    }

    private async Task Join(Guid room, Guid user)
    {
        var response = await fixture.ClientFor(user).PostAsJsonAsync($"/api/room/{room}/join", new { userId = user });
        response.EnsureSuccessStatusCode();
    }

    private async Task<RoomStateDto> GetRoom(Guid room) =>
        (await fixture.ClientFor(_readers[room]).GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!;

    private Task<HttpResponseMessage> Playback(Guid room, Guid user, int state, int seconds) =>
        fixture.ClientFor(user).PostAsJsonAsync($"/api/room/{room}/playback", new
        {
            userId = user, requestedState = state, clientPosition = TimeSpan.FromSeconds(seconds),
        });

    private static async Task<string> ErrorCode(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<JsonElement>();
        return error.GetProperty("code").GetString()!;
    }

    private sealed record PlaybackNotification(string State, double PositionInSeconds,
        DateTimeOffset TriggeredAt, DateTimeOffset? ScheduledFor);
}
