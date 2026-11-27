using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SofaStream.Api.Infrastructure;
using SofaStream.Domain.Entities;
using SofaStream.Infrastructure.Persistence;

namespace SofaStream.Api.Hubs;

[Authorize]
public sealed class RoomHub(ApplicationDbContext db, RoomMutationGate gate, RoomConnectionLifecycle lifecycle) : Hub
{
    private Guid Actor => ParticipantSession.UserId(Context.User!);

    public async Task JoinRoom(Guid roomId, Guid userId)
    {
        if (userId != Actor) throw new HubException("The participant identity does not match this session.");
        using var lease = await gate.EnterAsync(Context.ConnectionAborted);
        await lifecycle.ExpireAsync(Context.ConnectionAborted);
        if (Context.Items.TryGetValue("RoomId", out var existing) && !Equals(existing, roomId))
            throw new HubException("Leave the current room before joining another room.");
        var participant = await db.Set<RoomParticipant>().SingleOrDefaultAsync(
            p => p.RoomId == roomId && p.UserId == Actor, Context.ConnectionAborted);
        if (participant is null) throw new HubException("Join the room through HTTP first.");
        if (await db.Set<RoomParticipant>().CountAsync(p => p.RoomId == roomId) > 4)
            throw new HubException("The room is full.");
        var oldConnection = participant.ConnectionId;
        participant.SetConnectionId(Context.ConnectionId);
        await db.SaveChangesAsync(Context.ConnectionAborted);
        if (oldConnection is not null && oldConnection != Context.ConnectionId)
            await Groups.RemoveFromGroupAsync(oldConnection, roomId.ToString());
        Context.Items["RoomId"] = roomId;
        await Groups.AddToGroupAsync(Context.ConnectionId, roomId.ToString());
        if (oldConnection != Context.ConnectionId)
            await Clients.OthersInGroup(roomId.ToString()).SendAsync("OnUserJoined", Actor.ToString());
    }

    public async Task SendSignal(string roomId, string senderUserId, string targetUserId, string signal)
    {
        if (!Guid.TryParse(roomId, out var room) ||
            !await db.Set<RoomParticipant>().AnyAsync(p => p.RoomId == room && p.UserId == Actor && p.ConnectionId == Context.ConnectionId))
            throw new HubException("This connection is not a member of the room.");
        if (targetUserId != "all" && (!Guid.TryParse(targetUserId, out var target) ||
            !await db.Set<RoomParticipant>().AnyAsync(p => p.RoomId == room && p.UserId == target)))
            throw new HubException("The target is not a member of the room.");
        // Retain the transport signature for compatibility, but never trust its sender argument.
        await Clients.OthersInGroup(room.ToString()).SendAsync("OnSignalReceived", Actor.ToString(), targetUserId, signal);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        using (await gate.EnterAsync())
        {
            await lifecycle.DisconnectAsync(Context.ConnectionId);
        }
        await base.OnDisconnectedAsync(exception);
    }

    public async Task LeaveRoom()
    {
        using var lease = await gate.EnterAsync();
        var participant = await db.Set<RoomParticipant>().SingleOrDefaultAsync(p =>
            p.ConnectionId == Context.ConnectionId && p.UserId == Actor);
        if (participant is not null) await lifecycle.LeaveAsync(participant.RoomId, Actor);
        Context.Items.Remove("RoomId");
    }
}
