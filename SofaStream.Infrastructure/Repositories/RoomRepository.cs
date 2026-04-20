using Microsoft.EntityFrameworkCore;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain.Entities;
using SofaStream.Infrastructure.Persistence;

namespace SofaStream.Infrastructure.Repositories;

/// <summary>
/// Implementation of the room repository using Entity Framework Core.
/// Handles persistent storage operations for synchronized room sessions.
/// </summary>
/// <param name="dbContext">The database context for room data access.</param>
public class RoomRepository(ApplicationDbContext dbContext) : IRoomRepository
{
    /// <inheritdoc />
    public async Task<Room?> GetByIdAsync(Guid roomId, CancellationToken cancellationToken)
    {
        return await dbContext.Rooms
            .Include(r => r.Participants)
            .FirstOrDefaultAsync(r => r.Id == roomId, cancellationToken);
    }

    /// <inheritdoc />
    public async Task UpdateAsync(Room room, CancellationToken cancellationToken)
    {
        dbContext.Rooms.Update(room);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    /// <inheritdoc />
    public async Task AddAsync(Room room, CancellationToken cancellationToken)
    {
        await dbContext.Rooms.AddAsync(room, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}