using SofaStream.Domain.Common;
using SofaStream.Domain.Entities;

namespace SofaStream.Domain.Events;

public record RoomPlaybackStateChangedEvent(
    Guid RoomId,
    PlaybackState NewState,
    TimeSpan CurrentPosition,
    DateTimeOffset TriggeredAt) : IDomainEvent;