namespace SofaStream.Domain.Entities;

/// <summary>
/// Represents the video content associated with a room.
/// Implemented as a record (Value Object) since it has no identity of its own.
/// </summary>
public record Video(string Url, string Title, TimeSpan Duration);