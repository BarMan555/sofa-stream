using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using SofaStream.Application.Rooms.Queries.GetRoomState;
using SofaStream.Infrastructure.Persistence;

namespace SofaStream.IntegrationTests;

[Collection("PostgreSQL API")]
public sealed class LateJoinTests(ApiFixture fixture)
{
    private readonly Dictionary<Guid, Guid> _hosts = new();
    [Fact]
    public async Task SnapshotBeforeScheduledStart_ExposesTheDeadline_WithoutAdvancingPosition()
    {
        var (room, _) = await CreatePlayingRoom();
        try
        {
            var updated = await LastUpdated(room);
            fixture.Clock.FixedUtcNow = updated.AddMilliseconds(250);
            var snapshot = await Snapshot(room);
            Assert.Equal(60, snapshot.CurrentPositionSeconds);
            Assert.Equal(updated.AddSeconds(1), snapshot.ScheduledFor);
            Assert.Equal(fixture.Clock.FixedUtcNow, snapshot.SnapshotAt);
            Assert.Equal(updated, snapshot.LastUpdatedAt);
        }
        finally { fixture.Clock.FixedUtcNow = null; }
    }

    [Fact]
    public async Task PlayingSnapshot_IncludesElapsedTime_AfterScheduledStart()
    {
        var (room, _) = await CreatePlayingRoom();
        try
        {
            fixture.Clock.FixedUtcNow = (await LastUpdated(room)).AddSeconds(16);
            var snapshot = await Snapshot(room);
            Assert.Equal("Playing", snapshot.PlaybackState);
            Assert.Equal(75, snapshot.CurrentPositionSeconds, 3); // 60 + 16 - the one-second scheduled start.
            Assert.Null(snapshot.ScheduledFor);
        }
        finally { fixture.Clock.FixedUtcNow = null; }
    }

    [Fact]
    public async Task Migration_BackfillsLegacyPlayingRooms_AndMatchesTheCurrentModel()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        using var lease = await fixture.Factory.Services.GetRequiredService<SofaStream.Api.Infrastructure.RoomMutationGate>().EnterAsync();
        var migrator = db.GetService<IMigrator>();
        var room = Guid.NewGuid();
        var host = Guid.NewGuid();
        var updated = new DateTimeOffset(2026, 10, 16, 0, 0, 0, TimeSpan.Zero);
        try
        {
            // This fixture owns a disposable PostgreSQL database; the collection runs serially.
            await migrator.MigrateAsync("20260529095351_AddRoomTheme");
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "Rooms" ("Id", "Name", "HostId", "Theme", "State", "CurrentPosition", "LastUpdatedAt")
                VALUES ({room}, 'Legacy playing room', {host}, 'Dark', 1, {TimeSpan.FromSeconds(60)}, {updated});
                """);
        }
        finally { await migrator.MigrateAsync(); }

        var legacy = await db.Rooms.SingleAsync(value => value.Id == room);
        Assert.Equal(updated.AddSeconds(1), legacy.PlaybackStartedAt);
        Assert.False(db.Database.HasPendingModelChanges());
    }

    [Theory]
    [InlineData(0, "Paused")]
    [InlineData(2, "Buffering")]
    public async Task PausedOrBufferingSnapshot_DoesNotAdvance(int state, string expected)
    {
        var (room, host) = await CreatePlayingRoom();
        await Playback(room, host, state);
        try
        {
            fixture.Clock.FixedUtcNow = (await LastUpdated(room)).AddSeconds(30);
            var snapshot = await Snapshot(room);
            Assert.Equal(expected, snapshot.PlaybackState);
            Assert.Equal(60, snapshot.CurrentPositionSeconds);
        }
        finally { fixture.Clock.FixedUtcNow = null; }
    }

    [Fact]
    public async Task ResumedSnapshot_AdvancesFromImmediateBufferingRecovery()
    {
        var (room, host) = await CreatePlayingRoom();
        await Playback(room, host, 2);
        (await fixture.ClientFor(host).PostAsJsonAsync($"/api/room/{room}/playback/buffering-completed", new { userId = host, videoRevision = 1 })).EnsureSuccessStatusCode();
        try
        {
            fixture.Clock.FixedUtcNow = (await LastUpdated(room)).AddSeconds(5);
            Assert.Equal(65, (await Snapshot(room)).CurrentPositionSeconds, 3);
        }
        finally { fixture.Clock.FixedUtcNow = null; }
    }

    [Fact]
    public async Task PlayingSnapshot_DoesNotPassTheEndOfVideo()
    {
        var (room, _) = await CreatePlayingRoom();
        try
        {
            fixture.Clock.FixedUtcNow = (await LastUpdated(room)).AddMinutes(10);
            Assert.Equal(120, (await Snapshot(room)).CurrentPositionSeconds);
        }
        finally { fixture.Clock.FixedUtcNow = null; }
    }

    private async Task<(Guid Room, Guid Host)> CreatePlayingRoom()
    {
        var host = Guid.NewGuid();
        var created = await fixture.ClientFor(host).PostAsJsonAsync("/api/room", new { name = "Late join", hostId = host });
        created.EnsureSuccessStatusCode();
        var room = await created.Content.ReadFromJsonAsync<Guid>();
        _hosts[room] = host;
        (await fixture.ClientFor(host).PostAsJsonAsync($"/api/room/{room}/video", new
        {
            userId = host, videoUrl = "https://www.youtube.com/watch?v=M7lc1UVf-VE", title = "Snapshot", durationSeconds = 120,
        })).EnsureSuccessStatusCode();
        await Playback(room, host, 1);
        return (room, host);
    }

    private async Task Playback(Guid room, Guid host, int state) =>
        (await fixture.ClientFor(host).PostAsJsonAsync($"/api/room/{room}/playback", new
        {
            userId = host, requestedState = state, clientPosition = TimeSpan.FromSeconds(60), videoRevision = 1,
        })).EnsureSuccessStatusCode();

    private async Task<DateTimeOffset> LastUpdated(Guid room)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Rooms
            .Where(value => value.Id == room).Select(value => value.LastUpdatedAt).SingleAsync();
    }

    private async Task<RoomStateDto> Snapshot(Guid room) =>
        (await fixture.ClientFor(_hosts[room]).GetFromJsonAsync<RoomStateDto>($"/api/room/{room}"))!;
}
