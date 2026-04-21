using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain;
using SofaStream.Domain.Common.Models;

namespace SofaStream.Application.Rooms.Commands.LeaveRoom;

/// <summary>
/// Handles the execution of a <see cref="LeaveRoomCommand"/>.
/// Ensures the participant is removed and domain rules (like host reassignment) are applied.
/// </summary>
/// <param name="roomRepository">The repository used to fetch and update the room.</param>
public class LeaveRoomCommandHandler(IRoomRepository roomRepository) : ICommandHandler<LeaveRoomCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> HandleAsync(LeaveRoomCommand command, CancellationToken cancellationToken = default)
    {
        var room = await roomRepository.GetByIdAsync(command.RoomId, cancellationToken);
        if (room == null)
            return Result.Failure(DomainErrors.Room.NotFound);
        
        var result = room.RemoveParticipant(command.UserId);
        if (result.IsSuccess) 
            await roomRepository.UpdateAsync(room, cancellationToken);
        
        return result;
    }
}