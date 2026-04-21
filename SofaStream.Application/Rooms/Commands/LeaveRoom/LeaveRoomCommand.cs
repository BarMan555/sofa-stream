namespace SofaStream.Application.Rooms.Commands.LeaveRoom;

/// <summary>
/// Command to remove a participant from a room.
/// Typically triggered when a user explicitly leaves or their WebSocket connection drops.
/// </summary>
/// <param name="RoomId">The unique identifier of the room.</param>
/// <param name="UserId">The unique identifier of the user leaving the room.</param>
public record LeaveRoomCommand(Guid RoomId, Guid UserId);