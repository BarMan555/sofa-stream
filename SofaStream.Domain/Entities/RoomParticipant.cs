namespace SofaStream.Domain.Entities;

/// <summary>
/// Represents a participant within a synchronized viewing room.
/// Tracks individual player states and administrative roles to maintain group synchronization.
/// </summary>
/// <param name="userId">The unique identifier of the participating user.</param>
/// <param name="isHost">Indicates if the user is granted host-level playback control.</param>
public class RoomParticipant(Guid userId, bool isHost = false)
{
    /// <summary>
    /// Gets the unique identifier of the user account participating in the session.
    /// </summary>
    public Guid UserId { get; private set; } = userId;
    
    /// <summary>
    /// Gets the unique identifier of the viewing room currently associated with this participant.
    /// </summary>
    public Guid RoomId { get; private set; }
    
    /// <summary>
    /// Gets a value indicating whether this participant has administrative control over the room's playback.
    /// </summary>
    public bool IsHost { get; private set; } = isHost;

    /// <summary>
    /// Gets a value indicating whether the participant's local player is currently experiencing technical buffering.
    /// A buffering state may trigger a global pause to ensure all participants remain synchronized.
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