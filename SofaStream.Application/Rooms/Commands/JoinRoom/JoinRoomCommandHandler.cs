using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain;
using SofaStream.Domain.Common.Models;
using SofaStream.Domain.Entities;

namespace SofaStream.Application.Rooms.Commands.JoinRoom;

public class JoinRoomCommandHandler(IRoomRepository roomRepository) : ICommandHandler<JoinRoomCommand, Result>
{
    public async Task<Result> HandleAsync(JoinRoomCommand command, CancellationToken cancellationToken = default)
    {
        var room = await roomRepository.GetByIdAsync(command.RoomId, cancellationToken);
        if (room == null) return Result.Failure(DomainErrors.Room.NotFound);
        
        // Add spectator in room
        var result = room.AddParticipant(new RoomParticipant(command.UserId, isHost: false));
        if (result.IsFailure) return result;
        
        await roomRepository.UpdateAsync(room, cancellationToken);
        
        return Result.Success();
    }
}