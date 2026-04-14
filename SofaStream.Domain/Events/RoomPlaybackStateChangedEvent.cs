using SofaStream.Domain.Common;
using SofaStream.Domain.Entities;

namespace SofaStream.Domain.Events;

/// <summary>
/// Domain event published when a room's playback state (e.g., Playing, Paused, or Buffering) is modified.
/// Triggers real-time synchronization across all connected participant clients.
/// </summary>
/// <param name="RoomId">The unique identifier of the room session where the state transition occurred.</param>
/// <param name="NewState">The target playback status that participants must adopt.</param>
/// <param name="CurrentPosition">The master video timestamp for precise playback synchronization.</param>
/// <param name="TriggeredAt">The UTC timestamp of the event, used by clients for network latency compensation.</param>
public record RoomPlaybackStateChangedEvent (
    Guid RoomId,
    PlaybackState NewState,
    TimeSpan CurrentPosition,
    DateTimeOffset TriggeredAt
    ) : IDomainEvent;