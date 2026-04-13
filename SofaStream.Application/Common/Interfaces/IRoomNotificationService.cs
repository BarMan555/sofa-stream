using SofaStream.Domain.Entities;

namespace SofaStream.Application.Common.Interfaces;

/// <summary>
/// Defines a service for real-time communication with room participants.
/// Responsible for broadcasting synchronization signals to connected clients.
/// </summary>
public interface IRoomNotificationService
{
    /// <summary>
    /// Broadcasts a playback state change to all participants in a specific room.
    /// </summary>
    /// <param name="roomId">The target room for the notification.</param>
    /// <param name="newState">The new playback state clients should adopt.</param>
    /// <param name="currentPosition">The current position in the video to seek to.</param>
    /// <param name="triggeredAt">The timestamp when the state change occurred for latency compensation.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A task that represents the asynchronous operation.</returns>
    Task NotifyPlaybackStateChangedAsync(
        Guid roomId, 
        PlaybackState newState, 
        TimeSpan currentPosition, 
        DateTimeOffset triggeredAt,
        CancellationToken cancellationToken);
}