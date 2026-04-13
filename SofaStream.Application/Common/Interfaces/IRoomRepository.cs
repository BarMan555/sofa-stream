using SofaStream.Domain.Entities;

namespace SofaStream.Application.Common.Interfaces;

public interface IRoomRepository
{
    Task<Room?> GetByIdAsync(Guid roomId, CancellationToken cancellationToken);
    Task UpdateAsync(Room room, CancellationToken cancellationToken);
}