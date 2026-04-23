using SofaStream.Domain.Entities;

namespace SofaStream.Application.Common.Interfaces;

/// <summary>
/// Defines a contract for real-time synchronization with viewing session participants.
/// Handles the delivery of playback control signals to remote clients.
/// </summary>
public interface IRoomNotificationService
{
    /// <summary>
    /// Broadcasts a playback state transition to all active participants in the specified room.
    /// </summary>
    /// <param name="roomId">The unique identifier of the room session where participants are located.</param>
    /// <param name="newState">The master playback status that clients are required to adopt.</param>
    /// <param name="currentPosition">The target video timestamp for player seeking and synchronization.</param>
    /// <param name="triggeredAt">The exact time the state change was recorded, enabling clients to calculate latency offsets.</param>
    /// <param name="cancellationToken">Token to cancel the broadcast operation.</param>
    /// <returns>A task representing the asynchronous notification process.</returns>
    Task NotifyPlaybackStateChangedAsync(
        Guid roomId, 
        PlaybackState newState, 
        TimeSpan currentPosition, 
        DateTimeOffset triggeredAt,
        CancellationToken cancellationToken);
    
    Task NotifyVideoChangedAsync(
        Guid roomId,
        Video? video,
        CancellationToken cancellationToken);
}