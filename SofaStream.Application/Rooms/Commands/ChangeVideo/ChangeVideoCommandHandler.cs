using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain;
using SofaStream.Domain.Common.Models;
using SofaStream.Domain.Entities;

namespace SofaStream.Application.Rooms.Commands.ChangeVideo;

/// <summary>
/// Handles the execution of a <see cref="ChangeVideoCommand"/>.
/// </summary>
public class ChangeVideoCommandHandler(IRoomRepository roomRepository) : ICommandHandler<ChangeVideoCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> HandleAsync(ChangeVideoCommand command, CancellationToken cancellationToken = default)
    {
        var room = await roomRepository.GetByIdAsync(command.RoomId, cancellationToken);
        if (room == null)
            return Result.Failure(DomainErrors.Room.NotFound);
        
        if (!double.IsFinite(command.DurationSeconds) || command.DurationSeconds < 0 || command.DurationSeconds >= TimeSpan.MaxValue.TotalSeconds)
            return Result.Failure(DomainErrors.Room.InvalidDuration);
        var newVideo = new Video(
            command.VideoUrl, 
            command.Title, 
            TimeSpan.FromSeconds(command.DurationSeconds));

        var result = room.ChangeVideoContent(newVideo, command.UserId);
        
        if (result.IsSuccess)
            await roomRepository.UpdateAsync(room, cancellationToken);
        
        return result;
    }
}
