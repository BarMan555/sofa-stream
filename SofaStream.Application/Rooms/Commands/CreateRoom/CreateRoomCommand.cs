namespace SofaStream.Application.Rooms.Commands.CreateRoom;

/// <summary>
/// Command to create a new synchronized viewing room.
/// </summary>
/// <param name="Name">The display name of the room.</param>
/// <param name="HostId">The unique identifier of the user creating the room, who will become the host.</param>
public record CreateRoomCommand (string Name, Guid HostId);