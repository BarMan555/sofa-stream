namespace SofaStream.Application.Rooms.Queries.GetRoomState;

/// <summary>
/// Query to retrieve the current playback state and participant list of a specific room.
/// </summary>
/// <param name="RoomId">The unique identifier of the target room.</param>
public record GetRoomStateQuery(Guid RoomId);

/// <summary>
/// Read model representing the current state of a room for the client UI.
/// </summary>
public record RoomStateDto(
    Guid Id,
    string Name,
    string PlaybackState,
    double CurrentPositionSeconds,
    List<ParticipantDto> Participants);

/// <summary>
/// Read model representing a participant within a room.
/// </summary>
public record ParticipantDto(
    Guid UserId,
    bool IsHost,
    bool IsBuffering);