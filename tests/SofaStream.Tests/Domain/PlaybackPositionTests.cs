using SofaStream.Domain.Entities;
using SofaStream.Domain.Events;

namespace SofaStream.Tests.Domain;

public sealed class PlaybackPositionTests
{
    [Theory]
    [InlineData(PlaybackState.Playing, -5, 60)]
    [InlineData(PlaybackState.Playing, 0, 60)]
    [InlineData(PlaybackState.Playing, 5, 65)]
    [InlineData(PlaybackState.Playing, 1000, 120)]
    [InlineData(PlaybackState.Paused, 30, 60)]
    [InlineData(PlaybackState.Buffering, 30, 60)]
    public void Position_FollowsThePlaybackTimeline(PlaybackState state, int elapsed, int expected)
    {
        var start = new DateTimeOffset(2026, 10, 16, 0, 0, 0, TimeSpan.Zero);
        var position = PlaybackPosition.At(state, TimeSpan.FromSeconds(60), start,
            start.AddSeconds(elapsed), TimeSpan.FromSeconds(120));
        Assert.Equal(TimeSpan.FromSeconds(expected), position);
    }

    [Fact]
    public void PlaybackCommands_KeepTheTimelineConsistentWithTheirEvents()
    {
        var host = Guid.NewGuid();
        var room = new Room("Timeline", host);
        room.Play(TimeSpan.FromSeconds(60));
        Assert.Equal(room.LastUpdatedAt.AddSeconds(1), room.PlaybackStartedAt);
        Assert.Equal(room.PlaybackStartedAt, room.DomainEvents.OfType<RoomPlaybackStateChangedEvent>().Last().ScheduledFor);

        room.Pause(TimeSpan.FromSeconds(60));
        Assert.Null(room.PlaybackStartedAt);
        room.Play(TimeSpan.FromSeconds(60));
        room.ReportBuffering(host, TimeSpan.FromSeconds(60));
        Assert.Null(room.PlaybackStartedAt);
        room.ReportBufferingCompleted(host);
        Assert.Equal(room.LastUpdatedAt, room.PlaybackStartedAt);
        Assert.Null(room.DomainEvents.OfType<RoomPlaybackStateChangedEvent>().Last().ScheduledFor);

        room.ChangeVideoContent(new Video("https://youtu.be/M7lc1UVf-VE", "New movie", TimeSpan.FromSeconds(120)), host);
        Assert.Null(room.PlaybackStartedAt);
    }
}
