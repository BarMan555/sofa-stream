using SofaStream.Domain.Common;

namespace SofaStream.Domain.Events;

/// <summary>
/// Domain event published when a room's host is reassigned.
/// </summary>
/// <param name="RoomId">The unique identifier of the room.</param>
/// <param name="NewHostId">The unique identifier of the new host user.</param>
/// <param name="TriggeredAt">The UTC timestamp when the host was changed.</param>
public record RoomHostChangedEvent(
    Guid RoomId,
    Guid NewHostId,
    DateTimeOffset TriggeredAt) : IDomainEvent;
