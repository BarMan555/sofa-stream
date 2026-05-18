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
        var newTime = 120.5;
        var isPlaying = true;

        // 2. Act (Действие: вызываем метод, который хотим протестировать)
        room.Play(TimenewTime);

        // 3. Assert (Проверка: убеждаемся, что всё сработало как надо)
        Assert.Equal(newTime, room.CurrentTime);
        Assert.Equal(isPlaying, room.IsPlaying);
    }
}