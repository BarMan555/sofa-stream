using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain;
using SofaStream.Domain.Common.Models;

namespace SofaStream.Application.Rooms.Commands.UpdateVideoDuration;

public sealed record UpdateVideoDurationCommand(Guid RoomId, Guid UserId, long VideoRevision, double DurationSeconds);

public sealed class UpdateVideoDurationCommandHandler(IRoomRepository rooms) : ICommandHandler<UpdateVideoDurationCommand, Result>
{
    public async Task<Result> HandleAsync(UpdateVideoDurationCommand command, CancellationToken cancellationToken = default)
    {
        if (!double.IsFinite(command.DurationSeconds) || command.DurationSeconds <= 0 || command.DurationSeconds >= TimeSpan.MaxValue.TotalSeconds)
            return Result.Failure(DomainErrors.Room.InvalidDuration);
        var room = await rooms.GetByIdAsync(command.RoomId, cancellationToken);
        if (room is null) return Result.Failure(DomainErrors.Room.NotFound);
        var result = room.UpdateVideoDuration(command.UserId, command.VideoRevision, TimeSpan.FromSeconds(command.DurationSeconds));
        if (result.IsSuccess) await rooms.UpdateAsync(room, cancellationToken);
        return result;
    }
}
