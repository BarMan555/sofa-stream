using SofaStream.Domain.Entities;

namespace SofaStream.Application.Rooms.Commands.ChangePlaybackState;

/// <summary>
/// Command to request a change in the room's shared playback state.
/// Sent when a user interacts with the video player controls (Play, Pause) or encounters technical buffering.
/// </summary>
/// <param name="RoomId">The unique identifier of the synchronized room session to be updated.</param>
/// <param name="UserId">The unique identifier of the participant who initiated the state change request.</param>
/// <param name="RequestedState">The target playback status (e.g., Playing, Paused, or Buffering).</param>
/// <param name="ClientPosition">The current video timestamp of the initiating participant's player for synchronization.</param>
public record ChangePlaybackStateCommand(
    Guid RoomId, 
    Guid UserId,
    PlaybackState RequestedState, 
    TimeSpan ClientPosition);