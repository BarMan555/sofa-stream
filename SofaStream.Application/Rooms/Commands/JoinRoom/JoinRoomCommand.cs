using SofaStream.Domain.Common.Models;
namespace SofaStream.Application.Rooms.Commands.JoinRoom;

public record JoinRoomCommand(Guid RoomId, Guid UserId);