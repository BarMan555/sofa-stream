using System.ComponentModel;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain;
using SofaStream.Domain.Common.Models;
using SofaStream.Domain.Entities;

namespace SofaStream.Application.Rooms.Commands.ChangePlaybackState;

/// <summary>
/// Handles the execution of a <see cref="ChangePlaybackStateCommand"/>.
/// Validates user permissions and coordinates the update of the room's synchronization state.
/// </summary>
/// <param name="roomRepository">The repository used to fetch and save room data.</param>
public class ChangePlaybackStateCommandHandler(IRoomRepository roomRepository)
    : ICommandHandler<ChangePlaybackStateCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> HandleAsync(ChangePlaybackStateCommand request,
        CancellationToken cancellationToken = default)
    {
        var room = await roomRepository.GetByIdAsync(request.RoomId, cancellationToken);
        if (room == null)
            return Result.Failure(DomainErrors.Room.NotFound);

        var participant = room.Participants.FirstOrDefault(p => p.UserId == request.UserId);
        if (participant == null)
            return Result.Failure(DomainErrors.Room.ParticipantNotFound);

        Result operationResult;
        
        switch (request.RequestedState)
        {
            case PlaybackState.Playing:
                operationResult = room.Play(request.ClientPosition);
                break;
            case PlaybackState.Paused:
                operationResult = room.Pause(request.ClientPosition);
                break;
            case PlaybackState.Buffering:
                operationResult = room.ReportBuffering(request.UserId, request.ClientPosition);
                break;
            default:
                operationResult = Result.Failure(DomainErrors.Room.InvalidPlaybackState);
                break;
        }

        if (operationResult.IsFailure)
        {
            return operationResult;
        }
            
        await roomRepository.UpdateAsync(room, cancellationToken);

        return Result.Success();
    }
}