using SofaStream.Domain.Common.Models;
namespace SofaStream.Application.Rooms.Commands.JoinRoom;

/// <summary>
/// Command to add a participant to an existing room.
/// </summary>
/// <param name="RoomId">The unique identifier of the room to join.</param>
/// <param name="UserId">The unique identifier of the user who is joining the room.</param>
public record JoinRoomCommand(Guid RoomId, Guid UserId);