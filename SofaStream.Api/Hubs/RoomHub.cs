using Microsoft.AspNetCore.SignalR;

namespace SofaStream.Api.Hubs;

public class RoomHub : Hub
{
    public async Task JoinRoom(Guid roomId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, roomId.ToString());
    }

    public async Task LeaveRoom(Guid roomId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomId.ToString());
    }
}