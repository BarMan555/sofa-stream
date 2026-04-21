using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain.Common.Models;
using SofaStream.Domain.Entities;

namespace SofaStream.Application.Rooms.Commands.CreateRoom;

/// <summary>
/// Handles the execution of a <see cref="CreateRoomCommand"/>.
/// Encapsulates the logic for initializing a new room aggregate and persisting it.
/// </summary>
/// <param name="roomRepository">The repository used to persist the new room.</param>
public class CreateRoomCommandHandler(IRoomRepository roomRepository)
    : ICommandHandler<CreateRoomCommand, Result<Guid>>
{
    /// <inheritdoc />
    public async Task<Result<Guid>> HandleAsync(CreateRoomCommand command, CancellationToken cancellationToken = default)
    {
        var newRoom = new Room(command.Name, command.HostId);
        await roomRepository.AddAsync(newRoom, cancellationToken);
        
        return Result<Guid>.Success(newRoom.Id);
    }
}