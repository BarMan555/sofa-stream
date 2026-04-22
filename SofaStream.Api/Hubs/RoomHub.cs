using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Application.Rooms.Commands.LeaveRoom;
using SofaStream.Domain.Common.Models;

namespace SofaStream.Api.Hubs;

/// <summary>
/// The SignalR Hub responsible for managing real-time WebSocket connections.
/// Maps physical connections to domain users and handles lifecycle events (connect/disconnect).
/// </summary>
public class RoomHub : Hub
{
    private static readonly ConcurrentDictionary<string, UserConnectionInfo> Connections = new();
    
    /// <summary>
    /// Registers a user in a specific room group for real-time broadcasting.
    /// </summary>
    /// <param name="roomId">The target room identifier.</param>
    /// <param name="userId">The identifier of the connecting user.</param>
    public async Task JoinRoom(Guid roomId, Guid userId)
    {
        var connectionId = Context.ConnectionId;
        Connections.TryAdd(connectionId, new(roomId, userId));
        await Groups.AddToGroupAsync(connectionId, roomId.ToString());
    }

    /// <summary>
    /// Automatically triggered by SignalR when a client disconnects (closes tab, loses network, etc.).
    /// </summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var connectionId = Context.ConnectionId;
        if (Connections.TryRemove(connectionId, out var userInfo))
        {
            await Groups.RemoveFromGroupAsync(connectionId, userInfo.RoomId.ToString());
            
            var serviceProvider = Context.GetHttpContext()?.RequestServices;
            if (serviceProvider != null)
            {
                using var scope = serviceProvider.CreateScope();
                var handler = scope.ServiceProvider.GetRequiredService<ICommandHandler<LeaveRoomCommand, Result>>();
                
                await handler.HandleAsync(new LeaveRoomCommand(userInfo.RoomId, userInfo.UserId));                
            }
        }
        
        await base.OnDisconnectedAsync(exception);
    }
}

/// <summary>
/// Internal record to store routing information for a physical WebSocket connection.
/// </summary>
internal record UserConnectionInfo(Guid RoomId, Guid UserId);