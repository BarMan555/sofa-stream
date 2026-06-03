using Microsoft.AspNetCore.SignalR;
using SofaStream.Api.Hubs;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain.Entities;

namespace SofaStream.Api.Services;

public class SignalRRoomNotificationService(IHubContext<RoomHub> hubContext) : IRoomNotificationService
{
    public async Task NotifyPlaybackStateChangedAsync(
        Guid roomId, 
        PlaybackState newState, 
        TimeSpan currentPosition, 
        DateTimeOffset triggeredAt, 
        DateTimeOffset? scheduledFor,
        CancellationToken cancellationToken)
    {
        await hubContext.Clients.Group(roomId.ToString()).SendAsync(
            "OnPlaybackStateChanged", 
            new 
            {
                State = newState.ToString(),
                PositionInSeconds = currentPosition.TotalSeconds,
                TriggeredAt = triggeredAt,
                ScheduledFor = scheduledFor
            }, 
            cancellationToken);
    }

    public async Task NotifyVideoChangedAsync(
        Guid roomId, 
        Video? video, 
        CancellationToken cancellationToken)
    {
        await hubContext.Clients.Group(roomId.ToString()).SendAsync(
            "OnVideoChanged",
            video,
            cancellationToken);
    }

    public async Task NotifyHostChangedAsync(
        Guid roomId,
        Guid newHostId,
        CancellationToken cancellationToken)
    {
        Console.WriteLine($"[ROOM INFRA] SignalRRoomNotificationService sending OnHostChanged for Room {roomId}. New Host: {newHostId}");
        await hubContext.Clients.Group(roomId.ToString()).SendAsync(
            "OnHostChanged",
            newHostId.ToString(),
            cancellationToken);
    }
}