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
        CancellationToken cancellationToken)
    {
        await hubContext.Clients.Group(roomId.ToString()).SendAsync(
            "OnPlaybackStateChanged", 
            new 
            {
                State = newState.ToString(),
                PositionInSeconds = currentPosition.TotalSeconds,
                TriggeredAt = triggeredAt
            }, 
            cancellationToken);
    }
}