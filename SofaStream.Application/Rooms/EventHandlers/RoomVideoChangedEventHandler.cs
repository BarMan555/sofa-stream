using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain.Events;

namespace SofaStream.Application.Rooms.EventHandlers;

/// <summary>
/// Responds to the <see cref="RoomVideoChangedEvent"/> by triggering external video change notifications.
/// </summary>
/// <param name="roomNotificationService">The service used to send real-time notifications to clients.</param>
public class RoomVideoChangedEventHandler(IRoomNotificationService roomNotificationService) : IDomainEventHandler<RoomVideoChangedEvent>
{
    /// <inheritdoc />
    public async Task HandleAsync(RoomVideoChangedEvent domainEvent, CancellationToken cancellationToken = default)
    {
        await roomNotificationService.NotifyVideoChangedAsync(
            domainEvent.RoomId, 
            domainEvent.Video,  
            cancellationToken);
    }
}