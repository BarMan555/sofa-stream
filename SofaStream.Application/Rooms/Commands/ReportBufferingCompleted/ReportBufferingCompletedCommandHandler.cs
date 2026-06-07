using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain;
using SofaStream.Domain.Common.Models;

namespace SofaStream.Application.Rooms.Commands.ReportBufferingCompleted;

/// <summary>
/// Handles the execution of a <see cref="ReportBufferingCompletedCommand"/>.
/// Clears the participant's buffering state and transitions the room back to Playing if all participants have completed buffering.
/// </summary>
public class ReportBufferingCompletedCommandHandler(IRoomRepository roomRepository)
    : ICommandHandler<ReportBufferingCompletedCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> HandleAsync(ReportBufferingCompletedCommand request,
        CancellationToken cancellationToken = default)
    {
        var room = await roomRepository.GetByIdAsync(request.RoomId, cancellationToken);
        if (room == null)
            return Result.Failure(DomainErrors.Room.NotFound);

        var participant = room.Participants.FirstOrDefault(p => p.UserId == request.UserId);
        if (participant == null)
            return Result.Failure(DomainErrors.Room.ParticipantNotFound);

        var operationResult = room.ReportBufferingCompleted(request.UserId);

        if (operationResult.IsSuccess)
        {
            await roomRepository.UpdateAsync(room, cancellationToken);
        }

        return operationResult;
    }
}
