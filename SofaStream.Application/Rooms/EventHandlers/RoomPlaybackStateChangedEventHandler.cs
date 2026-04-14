using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain.Events;

namespace SofaStream.Application.Rooms.EventHandlers;

/// <summary>
/// Responds to room playback state changes by triggering external notifications.
/// Ensures that every synchronized change in the domain is broadcasted to real-time clients.
/// </summary>
/// <param name="notificationService">The service used to send real-time notifications to clients.</param>
public class RoomPlaybackStateChangedEventHandler(IRoomNotificationService notificationService) 
    : IDomainEventHandler<RoomPlaybackStateChangedEvent>
{
    /// <inheritdoc />
    public async Task HandleAsync(RoomPlaybackStateChangedEvent domainEvent, CancellationToken cancellationToken = default)
    {
        await notificationService.NotifyPlaybackStateChangedAsync(
            domainEvent.RoomId, 
            domainEvent.NewState, 
            domainEvent.CurrentPosition, 
            domainEvent.TriggeredAt, 
            cancellationToken);
    }
}