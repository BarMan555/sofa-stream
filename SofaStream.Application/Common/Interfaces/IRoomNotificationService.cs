using SofaStream.Domain.Entities;

namespace SofaStream.Application.Common.Interfaces;

public interface IRoomNotificationService
{
    Task NotifyPlaybackStateChangedAsync(
        Guid roomId, 
        PlaybackState newState, 
        TimeSpan currentPosition, 
        DateTimeOffset triggeredAt,
        CancellationToken cancellationToken);
}