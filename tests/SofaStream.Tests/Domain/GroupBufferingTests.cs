using SofaStream.Domain.Entities;

namespace SofaStream.Tests.Domain;

public sealed class GroupBufferingTests
{
    private static (Room Room, Guid Host, Guid Guest) PlayingRoom()
    {
        var host = Guid.NewGuid();
        var guest = Guid.NewGuid();
        var room = new Room("Group buffering", host);
        room.AddParticipant(new RoomParticipant(guest));
        room.ChangeVideoContent(new Video("https://www.youtube.com/watch?v=M7lc1UVf-VE", "Video", TimeSpan.FromMinutes(20)), host);
        room.Play(TimeSpan.FromSeconds(60));
        return (room, host, guest);
    }

    [Fact]
    public void BufferingGuest_CannotChooseTheRoomsPlaybackPosition()
    {
        var (room, _, guest) = PlayingRoom();
        Assert.True(room.ReportBuffering(guest, TimeSpan.FromSeconds(999)).IsSuccess);
        Assert.Equal(PlaybackState.Buffering, room.State);
        Assert.InRange(room.CurrentPosition.TotalSeconds, 60, 61);
    }

    [Fact]
    public void LeavingLastBufferingParticipant_ResumesTheWaitingRoom()
    {
        var (room, host, guest) = PlayingRoom();
        room.ReportBuffering(host, TimeSpan.FromSeconds(60));
        room.ReportBuffering(guest, TimeSpan.FromSeconds(60));
        room.ReportBufferingCompleted(host);
        Assert.Equal(PlaybackState.Buffering, room.State);
        room.RemoveParticipant(guest);
        Assert.Equal(PlaybackState.Playing, room.State);
        Assert.NotNull(room.PlaybackStartedAt);
    }

    [Fact]
    public void ChangingVideo_ClearsAllOldBufferingFlags()
    {
        var (room, host, guest) = PlayingRoom();
        room.ReportBuffering(guest, TimeSpan.FromSeconds(60));
        room.ChangeVideoContent(new Video("next-video", "Next", TimeSpan.FromMinutes(20)), host);
        Assert.All(room.Participants, participant => Assert.False(participant.IsBuffering));
        Assert.True(room.Play(TimeSpan.Zero).IsSuccess);
    }

    [Fact]
    public void LoadingASeekWhilePaused_DoesNotLeaveAFlagThatBlocksTheNextPlay()
    {
        var (room, _, guest) = PlayingRoom();
        room.Pause(TimeSpan.FromSeconds(70));
        room.ReportBuffering(guest, TimeSpan.FromSeconds(70));
        Assert.False(room.Participants.Single(p => p.UserId == guest).IsBuffering);
        Assert.True(room.Play(TimeSpan.FromSeconds(70)).IsSuccess);
    }

    [Fact]
    public void ManualPause_CancelsAutomaticBufferingResume()
    {
        var (room, _, guest) = PlayingRoom();
        room.ReportBuffering(guest, TimeSpan.FromSeconds(60));
        room.Pause(TimeSpan.FromSeconds(60));
        Assert.All(room.Participants, participant => Assert.False(participant.IsBuffering));
        room.ReportBufferingCompleted(guest);
        Assert.Equal(PlaybackState.Paused, room.State);
        Assert.True(room.Play(TimeSpan.FromSeconds(60)).IsSuccess);
    }
}
