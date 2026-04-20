namespace SofaStream.Application.Rooms.Commands.CreateRoom;

/// <summary>
/// Command to create a new synchronized viewing room.
/// </summary>
/// <param name="Name">The display name of the room.</param>
/// <param name="HostId">The unique identifier of the user creating the room, who will become the host.</param>
public record CreateRoomCommand (string Name, Guid HostId);

/// <summary>
/// The result of a successful room creation.
/// </summary>
/// <param name="RoomId">The generated unique identifier for the new room.</param>
public record CreateRoomResult(Guid RoomId);