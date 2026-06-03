using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain.Events;

namespace SofaStream.Application.Rooms.EventHandlers;

public class RoomHostChangedEventHandler(IRoomNotificationService roomNotificationService) : IDomainEventHandler<RoomHostChangedEvent>
{
    public async Task HandleAsync(RoomHostChangedEvent domainEvent, CancellationToken cancellationToken = default)
    {
        Console.WriteLine($"[ROOM APP] RoomHostChangedEventHandler handling event for Room {domainEvent.RoomId}. New Host: {domainEvent.NewHostId}");
        await roomNotificationService.NotifyHostChangedAsync(
            domainEvent.RoomId,
            domainEvent.NewHostId,
            cancellationToken);
    }
}
