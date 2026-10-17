using System.Net;
using System.Net.Http.Json;
using SofaStream.Application.Rooms.Queries.GetRoomState;

namespace SofaStream.IntegrationTests;

[Collection("PostgreSQL API")]
public sealed class GroupBufferingTests(ApiFixture fixture)
{
    [Fact]
    public async Task GuestsCanBufferAndComplete_ButCannotControlPlayback_AndAllMustBeReady()
    {
        var host = Guid.NewGuid();
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();
        using var client = fixture.ClientFor(host);
        var room = await Create(client, host);
        foreach (var guest in new[] { first, second })
        {
            using var guestClient = fixture.ClientFor(guest);
            (await guestClient.PostAsJsonAsync($"/api/room/{room}/join", new { userId = guest })).EnsureSuccessStatusCode();
            (await Playback(guestClient, room, guest, 2)).EnsureSuccessStatusCode();
            Assert.Equal(HttpStatusCode.BadRequest, (await Playback(guestClient, room, guest, 0)).StatusCode);
        }
        var buffered = (await client.GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!;
        Assert.Equal("Buffering", buffered.PlaybackState);
        Assert.Equal(2, buffered.Participants.Count(p => p.IsBuffering));
        using var firstClient = fixture.ClientFor(first);
        (await firstClient.PostAsJsonAsync($"/api/room/{room}/playback/buffering-completed", new { userId = first, videoRevision = 1 })).EnsureSuccessStatusCode();
        Assert.Equal("Buffering", (await client.GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!.PlaybackState);
        using var secondClient = fixture.ClientFor(second);
        (await secondClient.PostAsync($"/api/room/{room}/leave", null)).EnsureSuccessStatusCode();
        var resumed = (await client.GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!;
        Assert.Equal("Playing", resumed.PlaybackState);
        Assert.All(resumed.Participants, p => Assert.False(p.IsBuffering));
    }

    [Fact]
    public async Task CompletionForAnOldVideo_IsRejected()
    {
        var host = Guid.NewGuid();
        using var client = fixture.ClientFor(host);
        var room = await Create(client, host);
        var response = await client.PostAsJsonAsync($"/api/room/{room}/playback/buffering-completed", new { userId = host, videoRevision = 0 });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static async Task<Guid> Create(HttpClient client, Guid host)
    {
        var response = await client.PostAsJsonAsync("/api/room", new { name = "Group buffering", hostId = host });
        response.EnsureSuccessStatusCode();
        var room = await response.Content.ReadFromJsonAsync<Guid>();
        (await client.PostAsJsonAsync($"/api/room/{room}/video", new
        { userId = host, videoUrl = "https://www.youtube.com/watch?v=M7lc1UVf-VE", title = "Test", durationSeconds = 1200 })).EnsureSuccessStatusCode();
        (await Playback(client, room, host, 1)).EnsureSuccessStatusCode();
        return room;
    }

    private static Task<HttpResponseMessage> Playback(HttpClient client, Guid room, Guid user, int state) =>
        client.PostAsJsonAsync($"/api/room/{room}/playback", new
        { userId = user, requestedState = state, clientPosition = TimeSpan.FromSeconds(60), videoRevision = 1 });
}
