using System.Data;
using SofaStream.Domain.Common;
using SofaStream.Domain.Entities;

namespace SofaStream.Domain.Events;

/// <summary>
/// Domain event published when the active video content in a room is changed.
/// Instructs all connected clients to load the new video source.
/// </summary>
/// <param name="RoomId">The unique identifier of the room.</param>
/// <param name="NewVideo">The new video content. Can be null if the video was cleared.</param>
/// <param name="TriggeredAt">The UTC timestamp when the video was changed.</param>
public record RoomVideoChangedEvent(
    Guid RoomId,
    Video? Video,
    DateTimeOffset TriggeredAt) : IDomainEvent;