using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Application.Rooms.Commands.LeaveRoom;
using SofaStream.Domain.Common.Models;
using SofaStream.Domain.Entities;
using SofaStream.Infrastructure.Persistence;

namespace SofaStream.Api.Hubs;

/// <summary>
/// The SignalR Hub responsible for managing real-time WebSocket connections.
/// Maps physical connections to domain users and handles lifecycle events (connect/disconnect).
/// </summary>
public class RoomHub : Hub
{
    private static readonly ConcurrentDictionary<string, UserConnectionInfo> Connections = new();
    private readonly IServiceScopeFactory _serviceScopeFactory;

    /// <summary>
    /// Initializes a new instance of the <see cref="RoomHub"/> class.
    /// </summary>
    /// <param name="serviceScopeFactory">The service scope factory to safely resolve transient/scoped services.</param>
    public RoomHub(IServiceScopeFactory serviceScopeFactory)
    {
        _serviceScopeFactory = serviceScopeFactory;
    }
    
    /// <summary>
    /// Registers a user in a specific room group for real-time broadcasting.
    /// </summary>
    /// <param name="roomId">The target room identifier.</param>
    /// <param name="userId">The identifier of the connecting user.</param>
    public async Task JoinRoom(Guid roomId, Guid userId)
    {
        var connectionId = Context.ConnectionId;
        
        if (Connections.TryGetValue(connectionId, out var existingInfo))
        {
            if (existingInfo.RoomId != roomId)
            {
                // Remove from old SignalR group
                await Groups.RemoveFromGroupAsync(connectionId, existingInfo.RoomId.ToString());
                
                // Clean up database state in the old room
                using (var scope = _serviceScopeFactory.CreateScope())
                {
                    var handler = scope.ServiceProvider.GetRequiredService<ICommandHandler<LeaveRoomCommand, Result>>();
                    await handler.HandleAsync(new LeaveRoomCommand(existingInfo.RoomId, existingInfo.UserId));                
                }
                
                // Update routing info
                Connections[connectionId] = new UserConnectionInfo(roomId, userId);
            }
        }
        else
        {
            Connections.TryAdd(connectionId, new UserConnectionInfo(roomId, userId));
        }

        await Groups.AddToGroupAsync(connectionId, roomId.ToString());

        // Update database participant with this SignalR connection ID
        using (var scope = _serviceScopeFactory.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var participant = await dbContext.Set<RoomParticipant>()
                .FirstOrDefaultAsync(p => p.RoomId == roomId && p.UserId == userId);
            if (participant != null)
            {
                participant.SetConnectionId(connectionId);
                await dbContext.SaveChangesAsync();
            }
        }
        
        // Notify other participants that a new user joined
        await Clients.Group(roomId.ToString()).SendAsync("OnUserJoined", userId.ToString());
    }

    /// <summary>
    /// Routes WebRTC signaling messages (SDP offer/answer, ICE candidates) between participants in the room.
    /// </summary>
    public async Task SendSignal(string roomId, string senderUserId, string targetUserId, string signal)
    {
        await Clients.Group(roomId).SendAsync("OnSignalReceived", senderUserId, targetUserId, signal);
    }

    /// <summary>
    /// Automatically triggered by SignalR when a client disconnects (closes tab, loses network, etc.).
    /// </summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var connectionId = Context.ConnectionId;
        
        // Remove from the local connection routing dictionary
        Connections.TryRemove(connectionId, out var userInfo);

        try
        {
            using var scope = _serviceScopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // 1. Look up the participant using Context.ConnectionId or fall back to userInfo
            RoomParticipant? participant = null;
            if (!string.IsNullOrEmpty(connectionId))
            {
                participant = await dbContext.Set<RoomParticipant>()
                    .FirstOrDefaultAsync(p => p.ConnectionId == connectionId);
            }

            if (participant == null && userInfo != null)
            {
                participant = await dbContext.Set<RoomParticipant>()
                    .FirstOrDefaultAsync(p => p.RoomId == userInfo.RoomId && p.UserId == userInfo.UserId);
            }

            if (participant != null)
            {
                var roomId = participant.RoomId;
                var userId = participant.UserId;

                // Unregister and notify other participants
                await Groups.RemoveFromGroupAsync(connectionId, roomId.ToString());
                await Clients.Group(roomId.ToString()).SendAsync("OnUserLeft", userId.ToString());

                // Load Room and apply domain rules (like host reassignment) before explicit deletion
                var room = await dbContext.Rooms
                    .Include(r => r.Participants)
                    .FirstOrDefaultAsync(r => r.Id == roomId);

                if (room != null)
                {
                    Console.WriteLine($"[ROOM HUB] Removing participant {userId} from Room {roomId}. Total participants in room before removal: {room.Participants.Count}. HostId: {room.HostId}");
                    room.RemoveParticipant(userId);
                    Console.WriteLine($"[ROOM HUB] Removed participant. New Room HostId: {room.HostId}");
                }
                else
                {
                    Console.WriteLine($"[ROOM HUB] Room {roomId} not found in database.");
                }

                // Explicitly delete the participant from the DbSet to ensure it is deleted in the database
                dbContext.Set<RoomParticipant>().Remove(participant);
                Console.WriteLine($"[ROOM HUB] Saving changes to database for Room {roomId}...");
                await dbContext.SaveChangesAsync();
                Console.WriteLine($"[ROOM HUB] Changes saved to database successfully.");

                // 3. Immediately query the remaining participant count for that specific RoomId
                var remainingCount = await dbContext.Set<RoomParticipant>()
                    .CountAsync(p => p.RoomId == roomId);

                // 4. If the remaining count equals 0, cascade-delete the corresponding room from the Rooms table
                if (remainingCount == 0)
                {
                    var roomToDelete = await dbContext.Rooms.FirstOrDefaultAsync(r => r.Id == roomId);
                    if (roomToDelete != null)
                    {
                        dbContext.Rooms.Remove(roomToDelete);
                        await dbContext.SaveChangesAsync();
                    }
                }
            }
            else if (userInfo != null)
            {
                // Fallback in case we somehow didn't find the participant in the database at all
                await Groups.RemoveFromGroupAsync(connectionId, userInfo.RoomId.ToString());
                await Clients.Group(userInfo.RoomId.ToString()).SendAsync("OnUserLeft", userInfo.UserId.ToString());
            }
        }
        catch (Exception ex)
        {
            // Thread-safe exception handling for abrupt websocket closures and DB conflicts
            Console.WriteLine($"Error during disconnection cleanup: {ex.Message}");
        }
        
        await base.OnDisconnectedAsync(exception);
    }
}

/// <summary>
/// Internal record to store routing information for a physical WebSocket connection.
/// </summary>
internal record UserConnectionInfo(Guid RoomId, Guid UserId);