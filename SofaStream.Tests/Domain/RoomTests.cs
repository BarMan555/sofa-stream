using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SofaStream.Domain.Entities;
using SofaStream.Domain.Events;
using SofaStream.Infrastructure.Persistence;
using SofaStream.Infrastructure.Services;
using Xunit;

namespace SofaStream.Tests.Domain;

public class RoomTests
{
    // [Fact] - атрибут xUnit, который говорит, что это обычный тест без параметров
    [Fact]
    public void ChangePlaybackState_ShouldUpdateState_WhenCalled()
    {
        // 1. Arrange (Подготовка: создаем нужные объекты)
        var room = new Room ("Movie Night", Guid.NewGuid());
        var newTime = TimeSpan.FromSeconds(120.5);
        var isPlaying = true;

        // 2. Act (Действие: вызываем метод, который хотим протестировать)
        room.Play(newTime);

        // 3. Assert (Проверка: убеждаемся, что всё сработало как надо)
        Assert.Equal(newTime, room.CurrentPosition);
        Assert.Equal(isPlaying, room.State == PlaybackState.Playing);
    }

    [Fact]
    public void AddParticipant_ShouldReturnFailure_WhenRoomIsFull()
    {
        // Arrange
        var hostId = Guid.NewGuid();
        var room = new Room("Full Room", hostId); // Host is 1st participant
        
        var res2 = room.AddParticipant(new RoomParticipant(Guid.NewGuid(), isHost: false));
        var res3 = room.AddParticipant(new RoomParticipant(Guid.NewGuid(), isHost: false));
        var res4 = room.AddParticipant(new RoomParticipant(Guid.NewGuid(), isHost: false));
        
        // Act
        var res5 = room.AddParticipant(new RoomParticipant(Guid.NewGuid(), isHost: false));
        
        // Assert
        Assert.True(res2.IsSuccess);
        Assert.True(res3.IsSuccess);
        Assert.True(res4.IsSuccess);
        Assert.True(res5.IsFailure);
        Assert.Equal("Room.RoomFull", res5.Error.Code);
        Assert.Equal(4, room.Participants.Count);
    }

    [Fact]
    public void Constructor_ShouldInitializeTheme_WhenProvided()
    {
        // Arrange & Act
        var room = new Room("Themed Room", Guid.NewGuid(), "Princess");

        // Assert
        Assert.Equal("Princess", room.Theme);
    }

    [Fact]
    public void Constructor_ShouldFallbackToDefaultTheme_WhenThemeIsNull()
    {
        // Arrange & Act
        var room = new Room("Default Themed Room", Guid.NewGuid(), null!);

        // Assert
        Assert.Equal("Dark", room.Theme);
    }

    [Fact]
    public void RemoveParticipant_ShouldPromoteNewHostAndRaiseEvent_WhenHostLeaves()
    {
        // Arrange
        var hostId = Guid.NewGuid();
        var secondParticipantId = Guid.NewGuid();
        var room = new Room("Host Transition Room", hostId);
        room.AddParticipant(new RoomParticipant(secondParticipantId, isHost: false));

        // Act
        var result = room.RemoveParticipant(hostId);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(secondParticipantId, room.HostId);
        
        var hostChangedEvent = room.DomainEvents
            .OfType<RoomHostChangedEvent>()
            .FirstOrDefault();
            
        Assert.NotNull(hostChangedEvent);
        Assert.Equal(room.Id, hostChangedEvent!.RoomId);
        Assert.Equal(secondParticipantId, hostChangedEvent!.NewHostId);
    }

    [Fact]
    public async Task EFCore_Should_UpdateHostId_And_RaiseDomainEvent()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        var services = new ServiceCollection();
        var dispatcher = new DomainEventDispatcher(services.BuildServiceProvider());
        using var context = new ApplicationDbContext(options, dispatcher);

        var hostId = Guid.NewGuid();
        var guestId = Guid.NewGuid();
        var room = new Room("EF Test Room", hostId);
        room.AddParticipant(new RoomParticipant(guestId, isHost: false));

        context.Rooms.Add(room);
        await context.SaveChangesAsync();

        // Clear tracking to simulate loading from database in a new request/scope
        context.ChangeTracker.Clear();

        // Act
        var loadedRoom = await context.Rooms
            .Include(r => r.Participants)
            .FirstOrDefaultAsync(r => r.Id == room.Id);

        loadedRoom!.RemoveParticipant(hostId);
        await context.SaveChangesAsync();

        // Assert
        using var verifyContext = new ApplicationDbContext(options, dispatcher);
        var verifiedRoom = await verifyContext.Rooms
            .Include(r => r.Participants)
            .FirstOrDefaultAsync(r => r.Id == room.Id);

        Assert.Equal(guestId, verifiedRoom!.HostId);
        Assert.Single(verifiedRoom.Participants);
        Assert.True(verifiedRoom.Participants.First().IsHost);
    }
}