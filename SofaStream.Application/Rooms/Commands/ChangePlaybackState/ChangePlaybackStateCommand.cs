using SofaStream.Domain.Entities;

namespace SofaStream.Application.Rooms.Commands.ChangePlaybackState;

/// <summary>
/// Command to request a change in the room's shared playback state.
/// Sent when a user interacts with the video player controls (Play, Pause) or encounters buffering.
/// </summary>
/// <param name="RoomId">The identifier of the room to update.</param>
/// <param name="UserId">The identifier of the user who initiated the request.</param>
/// <param name="RequestedState">The desired state (e.g., Playing or Paused).</param>
/// <param name="ClientPosition">The video timestamp on the user's local player at the moment of request.</param>
public record ChangePlaybackStateCommand(
    Guid RoomId, 
    Guid UserId,
    PlaybackState RequestedState, 
    TimeSpan ClientPosition);