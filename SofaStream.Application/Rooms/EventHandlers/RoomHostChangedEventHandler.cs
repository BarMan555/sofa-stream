using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain.Events;

namespace SofaStream.Application.Rooms.EventHandlers;

/// <summary>
/// Responds to the <see cref="RoomHostChangedEvent"/> by triggering external host reassignment notifications.
/// </summary>
/// <param name="roomNotificationService">The service used to send real-time notifications to clients.</param>
public class RoomHostChangedEventHandler(IRoomNotificationService roomNotificationService) : IDomainEventHandler<RoomHostChangedEvent>
{
    /// <inheritdoc />
    public async Task HandleAsync(RoomHostChangedEvent domainEvent, CancellationToken cancellationToken = default)
    {
        Console.WriteLine($"[ROOM APP] RoomHostChangedEventHandler handling event for Room {domainEvent.RoomId}. New Host: {domainEvent.NewHostId}");
        await roomNotificationService.NotifyHostChangedAsync(
            domainEvent.RoomId,
            domainEvent.NewHostId,
            cancellationToken);
    }
}
