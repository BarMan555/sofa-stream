using MediatR;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Application.Common.Models;
using SofaStream.Domain.Events;

namespace SofaStream.Application.Rooms.EventHandlers;

public class RoomPlaybackStateChangedEventHandler(IRoomNotificationService notificationService) 
    : INotificationHandler<DomainEventNotification<RoomPlaybackStateChangedEvent>>
{
    public async Task Handle(DomainEventNotification<RoomPlaybackStateChangedEvent> notification, CancellationToken cancellationToken)
    {
        var domainEvent = notification.DomainEvent;
        
        await notificationService.NotifyPlaybackStateChangedAsync(
            domainEvent.RoomId, 
            domainEvent.NewState, 
            domainEvent.CurrentPosition, 
            domainEvent.TriggeredAt, 
            cancellationToken);
    }
}