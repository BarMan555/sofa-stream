using SofaStream.Domain.Common;
using SofaStream.Domain.Entities;

namespace SofaStream.Domain.Events;

/// <summary>
/// Event captured when the playback state (Play/Pause/Buffering) of a room changes.
/// Used to notify all connected clients to synchronize their local video players.
/// </summary>
/// <param name="RoomId">The identifier of the room where the change occurred.</param>
/// <param name="NewState">The updated playback status.</param>
/// <param name="CurrentPosition">The video timestamp where the state change happened.</param>
/// <param name="TriggeredAt">The UTC timestamp when the event was generated.</param>
public record RoomPlaybackStateChangedEvent (
    Guid RoomId,
    PlaybackState NewState,
    TimeSpan CurrentPosition,
    DateTimeOffset TriggeredAt
    ) : IDomainEvent;