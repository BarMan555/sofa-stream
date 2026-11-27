using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SofaStream.Api.Hubs;
using SofaStream.Domain.Entities;
using SofaStream.Infrastructure.Persistence;

namespace SofaStream.Api.Infrastructure;

// Call under RoomMutationGate so expiry, reconnect and HTTP writes cannot race.
public sealed class RoomConnectionLifecycle(
    ApplicationDbContext db, TimeProvider clock, IConfiguration configuration, IHubContext<RoomHub> hub)
{
    public TimeSpan GracePeriod => TimeSpan.FromSeconds(Math.Clamp(
        configuration.GetValue("Rooms:ReconnectGraceSeconds", 30), 1, 300));

    public async Task DisconnectAsync(string connectionId)
    {
        var participant = await db.Set<RoomParticipant>().SingleOrDefaultAsync(p => p.ConnectionId == connectionId);
        if (participant is null) return; // A replacement connection owns this membership now.
        participant.MarkDisconnected(clock.GetUtcNow());
        await db.SaveChangesAsync();
    }

    public async Task<bool> LeaveAsync(Guid roomId, Guid userId)
    {
        var room = await db.Rooms.Include(r => r.Participants).SingleOrDefaultAsync(r => r.Id == roomId);
        if (room is null || room.Participants.All(p => p.UserId != userId)) return false;
        var connectionId = room.Participants.Single(p => p.UserId == userId).ConnectionId;
        room.RemoveParticipant(userId);
        if (room.Participants.Count == 0) db.Rooms.Remove(room);
        await db.SaveChangesAsync();
        if (connectionId is not null) await hub.Groups.RemoveFromGroupAsync(connectionId, roomId.ToString());
        await hub.Clients.Group(roomId.ToString()).SendAsync("OnUserLeft", userId.ToString());
        return true;
    }

    public async Task ExpireAsync(CancellationToken token = default)
    {
        var cutoff = clock.GetUtcNow() - GracePeriod;
        var rooms = await db.Rooms.Include(r => r.Participants).Where(r => r.Participants.Any(p =>
            p.ConnectionId == null && p.DisconnectedAt != null && p.DisconnectedAt <= cutoff)).ToListAsync(token);
        foreach (var room in rooms)
        {
            var expired = room.Participants.Where(p => p.ConnectionId is null && p.DisconnectedAt <= cutoff).ToArray();
            foreach (var participant in expired) room.RemoveParticipant(participant.UserId);
            if (room.Participants.Count == 0) db.Rooms.Remove(room);
            await db.SaveChangesAsync(token);
            foreach (var participant in expired)
                await hub.Clients.Group(room.Id.ToString()).SendAsync("OnUserLeft", participant.UserId.ToString(), token);
        }
    }

    public async Task MarkPreviousProcessConnectionsAsync(CancellationToken token)
    {
        var connected = await db.Set<RoomParticipant>().Where(p => p.ConnectionId != null).ToListAsync(token);
        foreach (var participant in connected) participant.MarkDisconnected(clock.GetUtcNow());
        await db.SaveChangesAsync(token);
    }
}

public sealed class RoomConnectionReaper(IServiceScopeFactory scopes, RoomMutationGate gate,
    ILogger<RoomConnectionReaper> logger) : BackgroundService
{
    public override async Task StartAsync(CancellationToken cancellationToken)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        using var scope = scopes.CreateScope();
        await scope.ServiceProvider.GetRequiredService<RoomConnectionLifecycle>().MarkPreviousProcessConnectionsAsync(cancellationToken);
        await base.StartAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    using var lease = await gate.EnterAsync(stoppingToken);
                    using var scope = scopes.CreateScope();
                    await scope.ServiceProvider.GetRequiredService<RoomConnectionLifecycle>().ExpireAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch (Exception error) { logger.LogError(error, "Unable to expire disconnected room participants."); }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
