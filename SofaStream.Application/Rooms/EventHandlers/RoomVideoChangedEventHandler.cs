using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain.Events;

namespace SofaStream.Application.Rooms.EventHandlers;

public class RoomVideoChangedEventHandler(IRoomNotificationService roomNotificationService) : IDomainEventHandler<RoomVideoChangedEvent>
{
    public async Task HandleAsync(RoomVideoChangedEvent domainEvent, CancellationToken cancellationToken = default)
    {
        await roomNotificationService.NotifyVideoChangedAsync(
            domainEvent.RoomId, 
            domainEvent.Video,  
            cancellationToken);
    }
}