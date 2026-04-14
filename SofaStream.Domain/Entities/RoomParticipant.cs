namespace SofaStream.Domain.Entities;

/// <summary>
/// Represents a user participating in a synchronized video watching session.
/// Tracks the user's role and technical state relative to the playback.
/// </summary>
/// <param name="userId">The unique identifier of the user.</param>
/// <param name="isHost">Indicates if the user has administrative control over the playback.</param>
public class RoomParticipant(Guid userId, bool isHost = false)
{
    /// <summary>
    /// Gets the unique identifier of the participating user.
    /// </summary>
    public Guid UserId { get; } = userId;
    
    public Guid RoomId { get; private set; }
    
    /// <summary>
    /// Gets a value indicating whether this participant is the host of the room.
    /// The host is responsible for controlling the shared playback state.
    /// </summary>
    public bool IsHost { get; private set; } = isHost;

    /// <summary>
    /// Gets a value indicating whether the participant's video player is currently buffering.
    /// This state is used to pause the room automatically if any participant falls behind.
    /// </summary>
    public bool IsBuffering { get; private set; } = false;
    
    /// <summary>
    /// Updates the buffering state of the participant.
    /// </summary>
    /// <param name="isBuffering">True if the participant is buffering; otherwise, false.</param>
    internal void SetBufferingState(bool isBuffering)
    {
        this.IsBuffering = isBuffering;
    }
    
    /// <summary>
    /// Updates the host status of the participant.
    /// </summary>
    /// <param name="isHost">True if the participant is now the host; otherwise, false.</param>
    internal void SetHostState(bool isHost)
    {
        this.IsHost = isHost;
    }
}