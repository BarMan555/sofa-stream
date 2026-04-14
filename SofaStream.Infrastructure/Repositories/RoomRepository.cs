using Microsoft.EntityFrameworkCore;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain.Entities;
using SofaStream.Infrastructure.Persistence;

namespace SofaStream.Infrastructure.Repositories;

public class RoomRepository(ApplicationDbContext dbContext) : IRoomRepository
{
    public async Task<Room?> GetByIdAsync(Guid roomId, CancellationToken cancellationToken)
    {
        return await dbContext.Rooms
            .Include(r => r.Participants)
            .FirstOrDefaultAsync(r => r.Id == roomId, cancellationToken);
    }

    public async Task UpdateAsync(Room room, CancellationToken cancellationToken)
    {
        dbContext.Rooms.Update(room);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}