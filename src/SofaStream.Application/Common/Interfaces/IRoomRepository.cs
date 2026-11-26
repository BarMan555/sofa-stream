using SofaStream.Domain.Entities;

namespace SofaStream.Application.Common.Interfaces;

/// <summary>
/// Provides an abstraction for persisting and retrieving room session data.
/// </summary>
public interface IRoomRepository
{
    /// <summary>
    /// Retrieves a room session by its unique identifier.
    /// </summary>
    /// <param name="roomId">The unique identifier of the room.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A task that represents the asynchronous operation. The task result contains the Room if found; otherwise, null.</returns>
    Task<Room?> GetByIdAsync(Guid roomId, CancellationToken cancellationToken);

    /// <summary>
    /// Updates the state of an existing room in the persistent store.
    /// </summary>
    /// <param name="room">The room entity with updated data.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A task that represents the asynchronous operation.</returns>
    Task UpdateAsync(Room room, CancellationToken cancellationToken);
    
    /// <summary>
    /// Adds a new room session to the persistent store.
    /// </summary>
    /// <param name="room">The room entity to add.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A task that represents the asynchronous operation.</returns>
    Task AddAsync(Room room, CancellationToken cancellationToken);
}