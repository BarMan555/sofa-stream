using SofaStream.Domain.Entities;
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
}