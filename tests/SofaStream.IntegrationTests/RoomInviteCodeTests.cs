using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SofaStream.Application.Rooms.Queries.GetRoomState;
using SofaStream.Domain.Entities;
using SofaStream.Infrastructure.Persistence;
using SofaStream.Infrastructure.Repositories;
using SofaStream.Infrastructure.Services;

namespace SofaStream.IntegrationTests;

[Collection("PostgreSQL API")]
public sealed class RoomInviteCodeTests(ApiFixture fixture)
{
    [Fact]
    public async Task Code_IsPersisted_AndAcceptsLowerCaseAndSeparators_WhileUuidStillWorks()
    {
        var host = Guid.NewGuid();
        var room = await Create(host);
        var state = (await fixture.ClientFor(host).GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!;
        Assert.Matches("^[A-HJ-NP-Z2-9]{8}$", state.InviteCode);
        var formatted = state.InviteCode.Insert(4, "- ").ToLowerInvariant();
        var guest = Guid.NewGuid();
        var joined = await JoinCode(formatted, guest);
        joined.EnsureSuccessStatusCode();
        Assert.Equal(room, (await joined.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("roomId").GetGuid());
        var snapshot = (await fixture.ClientFor(guest).GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!;
        Assert.Equal(state.InviteCode, snapshot.InviteCode);
        Assert.Equal(2, snapshot.Participants.Count);
        // Joining twice is idempotent, and UUID clients remain compatible.
        (await JoinCode(state.InviteCode, guest)).EnsureSuccessStatusCode();
        var legacyGuest = Guid.NewGuid();
        (await fixture.ClientFor(legacyGuest).PostAsJsonAsync($"/api/room/{room}/join", new { userId = legacyGuest })).EnsureSuccessStatusCode();
        Assert.Equal(3, (await fixture.ClientFor(host).GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!.Participants.Count);
    }

    [Fact]
    public async Task CodeJoin_EnforcesIdentityAndCapacity_AndRejectsExpiredAndInvalidCodes()
    {
        var host = Guid.NewGuid();
        var room = await Create(host);
        var state = (await fixture.ClientFor(host).GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!;
        var attacker = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await fixture.ClientFor(attacker).PostAsJsonAsync(
            $"/api/room/code/{state.InviteCode}/join", new { userId = host })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await fixture.Client.PostAsJsonAsync(
            $"/api/room/code/{state.InviteCode}/join", new { userId = attacker })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await JoinCode("O0I1", attacker)).StatusCode);
        for (var n = 0; n < 3; n++) (await JoinCode(state.InviteCode, Guid.NewGuid())).EnsureSuccessStatusCode();
        var full = await JoinCode(state.InviteCode, attacker);
        Assert.Equal(HttpStatusCode.BadRequest, full.StatusCode);
        Assert.Equal("Room.RoomFull", (await full.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        var emptyHost = Guid.NewGuid();
        var emptyRoom = await Create(emptyHost);
        var empty = (await fixture.ClientFor(emptyHost).GetFromJsonAsync<RoomStateDto>($"/api/room/{emptyRoom}"))!;
        (await fixture.ClientFor(emptyHost).PostAsync($"/api/room/{emptyRoom}/leave", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await JoinCode(empty.InviteCode, attacker)).StatusCode);
    }

    [Fact]
    public async Task Collision_RetriesInsert_WithoutChangingExistingRoomOrLosingEvents()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var repository = new RoomRepository(db);
        var first = new Room("First", Guid.NewGuid());
        await repository.AddAsync(first, default);
        var second = new Room("Second", Guid.NewGuid());
        second.ChangeVideoContent(new Video("https://www.youtube.com/watch?v=M7lc1UVf-VE", "Test", TimeSpan.FromMinutes(1)), second.HostId);
        Assert.NotEmpty(second.DomainEvents);
        // Force the actual PostgreSQL unique-index failure, not a simulated query result.
        db.Entry(second).Property(room => room.InviteCode).CurrentValue = first.InviteCode;
        await repository.AddAsync(second, default);
        Assert.NotEqual(first.InviteCode, second.InviteCode);
        Assert.Empty(second.DomainEvents);
        db.ChangeTracker.Clear();
        Assert.Equal(first.InviteCode, (await db.Rooms.FindAsync(first.Id))!.InviteCode);
        Assert.Single((await db.Rooms.Include(room => room.Participants).SingleAsync(room => room.Id == second.Id)).Participants);

        var failed = new Room("Failed", Guid.NewGuid());
        failed.ChangeVideoContent(new Video("https://www.youtube.com/watch?v=M7lc1UVf-VE", "Test", TimeSpan.FromMinutes(1)), failed.HostId);
        await db.Rooms.AddAsync(failed);
        db.Entry(failed).Property(room => room.InviteCode).CurrentValue = first.InviteCode;
        Assert.NotEmpty(failed.DomainEvents);
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.NotEmpty(failed.DomainEvents);
    }

    [Fact]
    public async Task Migration_BackfillsExistingRooms_AndKeepsMembershipAndUuid()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var source = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var schema = "invite_migration_" + Guid.NewGuid().ToString("N");
        await using var admin = new NpgsqlConnection(source.Database.GetConnectionString());
        await admin.OpenAsync();
        // This identifier is generated locally from a Guid, never from request data.
        await using var create = new NpgsqlCommand($"CREATE SCHEMA \"{schema}\"", admin);
        await create.ExecuteNonQueryAsync();
        try
        {
            var connection = new NpgsqlConnectionStringBuilder(source.Database.GetConnectionString()) { SearchPath = schema };
            var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connection.ConnectionString).Options;
            await using var db = new ApplicationDbContext(options, scope.ServiceProvider.GetRequiredService<DomainEventDispatcher>());
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync("20261016144000_TrackVideoRevision");
            var ids = new[] { Guid.NewGuid(), Guid.NewGuid() };
            var host = Guid.NewGuid();
            foreach (var id in ids)
            {
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO "Rooms" ("Id", "Name", "HostId", "Theme", "State", "CurrentPosition", "LastUpdatedAt", "VideoRevision")
                    VALUES ({id}, 'Existing room', {host}, 'Princess', 0, interval '0 seconds', now(), 0);
                    INSERT INTO "RoomParticipant" ("RoomId", "UserId", "IsHost", "IsBuffering") VALUES ({id}, {host}, true, false);
                    """);
            }
            await migrator.MigrateAsync();
            var rooms = await db.Rooms.Include(room => room.Participants).OrderBy(room => room.Id).ToListAsync();
            Assert.Equal(2, rooms.Count);
            Assert.Equal(2, rooms.Select(room => room.InviteCode).Distinct().Count());
            Assert.All(rooms, room =>
            {
                Assert.Contains(room.Id, ids);
                Assert.Equal("Existing room", room.Name);
                Assert.Equal("Princess", room.Theme);
                Assert.Matches("^[A-HJ-NP-Z2-9]{8}$", room.InviteCode);
                Assert.Equal(host, Assert.Single(room.Participants).UserId);
            });
        }
        finally
        {
            await using var drop = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }

    private async Task<Guid> Create(Guid host)
    {
        var response = await fixture.ClientFor(host).PostAsJsonAsync("/api/room", new { name = "Invitation room", hostId = host });
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<Guid>();
    }

    private Task<HttpResponseMessage> JoinCode(string code, Guid user) => fixture.ClientFor(user)
        .PostAsJsonAsync($"/api/room/code/{Uri.EscapeDataString(code)}/join", new { userId = user });
}
