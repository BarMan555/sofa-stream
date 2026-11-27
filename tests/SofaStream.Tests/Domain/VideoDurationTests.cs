using SofaStream.Domain.Entities;

namespace SofaStream.Tests.Domain;

public sealed class VideoDurationTests
{
    [Fact]
    public void UnknownDuration_DoesNotImposeAHourLimit_AndMetadataDoesNotResetPlayback()
    {
        var host = Guid.NewGuid();
        var room = new Room("Long video", host);
        room.ChangeVideoContent(new Video("video", "Unknown metadata", TimeSpan.Zero), host);
        Assert.True(room.Pause(TimeSpan.FromSeconds(3610)).IsSuccess);
        Assert.Equal(3610, PlaybackPosition.At(room.State, room.CurrentPosition, null, DateTimeOffset.UtcNow, TimeSpan.Zero).TotalSeconds);
        Assert.True(room.UpdateVideoDuration(host, room.VideoRevision, TimeSpan.FromSeconds(7200)).IsSuccess);
        Assert.Equal(TimeSpan.FromSeconds(3610), room.CurrentPosition);
        Assert.Equal(PlaybackState.Paused, room.State);
        Assert.True(room.Pause(TimeSpan.FromSeconds(7201)).IsFailure);
    }

    [Fact]
    public void OldMetadata_CannotOverwriteTheNextVideo_AndGuestsCannotSetDuration()
    {
        var host = Guid.NewGuid();
        var guest = Guid.NewGuid();
        var room = new Room("Metadata revision", host);
        room.AddParticipant(new RoomParticipant(guest));
        room.ChangeVideoContent(new Video("first", "First", TimeSpan.Zero), host);
        var oldRevision = room.VideoRevision;
        room.ChangeVideoContent(new Video("next", "Next", TimeSpan.Zero), host);
        Assert.True(room.UpdateVideoDuration(host, oldRevision, TimeSpan.FromHours(2)).IsFailure);
        Assert.True(room.UpdateVideoDuration(guest, room.VideoRevision, TimeSpan.FromHours(2)).IsFailure);
        Assert.True(room.UpdateVideoDuration(host, room.VideoRevision, TimeSpan.FromSeconds(-1)).IsFailure);
        Assert.Equal(TimeSpan.Zero, room.CurrentVideo!.Duration);
    }
}
