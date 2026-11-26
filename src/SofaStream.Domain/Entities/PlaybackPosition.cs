namespace SofaStream.Domain.Entities;

/// <summary>Projects a saved position onto the room's playback timeline.</summary>
public static class PlaybackPosition
{
    public static TimeSpan At(PlaybackState state, TimeSpan position, DateTimeOffset? startedAt,
        DateTimeOffset now, TimeSpan? duration = null)
    {
        var seconds = Math.Max(0, position.TotalSeconds);
        if (state == PlaybackState.Playing && startedAt.HasValue)
            seconds += Math.Max(0, (now - startedAt.Value).TotalSeconds);

        // Zero means metadata has not arrived yet, so it is not a playback boundary.
        if (duration > TimeSpan.Zero) seconds = Math.Min(seconds, duration.Value.TotalSeconds);
        return TimeSpan.FromSeconds(seconds);
    }
}
