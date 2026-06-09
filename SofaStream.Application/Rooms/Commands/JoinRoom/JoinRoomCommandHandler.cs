using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain;
using SofaStream.Domain.Common.Models;
using SofaStream.Domain.Entities;

namespace SofaStream.Application.Rooms.Commands.JoinRoom;

/// <summary>
/// Handles the execution of a <see cref="JoinRoomCommand"/>.
/// Adds a participant to a room session and persists the change.
/// </summary>
/// <param name="roomRepository">The repository used to fetch and update room data.</param>
public class JoinRoomCommandHandler(IRoomRepository roomRepository) : ICommandHandler<JoinRoomCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> HandleAsync(JoinRoomCommand command, CancellationToken cancellationToken = default)
    {
        var room = await roomRepository.GetByIdAsync(command.RoomId, cancellationToken);
        if (room == null) return Result.Failure(DomainErrors.Room.NotFound);
        
        // Add spectator in room
        var result = room.AddParticipant(new RoomParticipant(command.UserId, isHost: false));
        if (result.IsSuccess)
        {
            await roomRepository.UpdateAsync(room, cancellationToken);
        }

        return result;
    }
}