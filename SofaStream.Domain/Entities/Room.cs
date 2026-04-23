using SofaStream.Domain.Common;
using SofaStream.Domain.Common.Models;
using SofaStream.Domain.Events;

namespace SofaStream.Domain.Entities;

/// <summary>
/// Represents the possible playback states of a synchronized video session.
/// </summary>
public enum PlaybackState
{
    /// <summary>
    /// Playback is manually stopped by a user.
    /// </summary>
    Paused,
    /// <summary>
    /// Video is actively playing for all participants.
    /// </summary>
    Playing,
    /// <summary>
    /// Playback is temporarily suspended because one or more participants are loading data.
    /// </summary>
    Buffering
}

/// <summary>
/// The core entity representing a virtual room where users watch video content synchronously.
/// It coordinates the shared playback state and manages participant synchronization.
/// </summary>
public class Room : AggregateRoot
{
    private readonly List<RoomParticipant> _participants = [];

    /// <summary>
    /// Gets the list of users currently connected to the room.
    /// </summary>
    public IReadOnlyCollection<RoomParticipant> Participants => _participants;
    
    /// <summary>
    /// Gets the unique identifier for the room session.
    /// </summary>
    public Guid Id { get; private set; } = Guid.NewGuid();

    /// <summary>
    /// Gets the display name of the room.
    /// </summary>
    /// <exception cref="ArgumentException">Thrown when setting an empty or null name.</exception>
    public string Name
    {
        get;
        private set => field = string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Room name must not be null or empty")
            : value;
    }
    
    /// <summary>
    /// Gets the unique identifier of the user who currently controls the room.
    /// </summary>
    public Guid HostId { get; private set; }
    
    /// <summary>
    /// Gets the current playback status of the shared video.
    /// </summary>
    public PlaybackState State { get;  private set; } = PlaybackState.Paused;

    /// <summary>
    /// Gets the timestamp of the video playback where synchronization occurs.
    /// </summary>
    public TimeSpan CurrentPosition { get; private set; } = TimeSpan.Zero;

    /// <summary>
    /// Gets the UTC time when the room state was last modified.
    /// </summary>
    public DateTimeOffset LastUpdatedAt { get; private set; } = DateTimeOffset.UtcNow;
    
    /// <summary>
    /// Gets the video currently playing in the room.
    /// </summary>
    public Video? CurrentVideo { get; private set; }

    /// <summary>
    /// Changes the current video of the room. Resets playback state and position.
    /// Only the host is authorized to change the video.
    /// </summary>
    /// <param name="newVideo">The new video to be played.</param>
    /// <param name="userId">The ID of the user attempting to change the video.</param>
    /// <returns>A result indicating success or failure of the operation.</returns>
    public Result ChangeVideoContent(Video newVideo, Guid userId)
    {
        var participant = _participants.FirstOrDefault(x => x.UserId == userId);
        if (participant == null)
            return Result.Failure(DomainErrors.Room.ParticipantNotFound);
        if (!participant.IsHost)
            return Result.Failure(DomainErrors.Room.NotHost);
        
        CurrentVideo = newVideo;
        CurrentPosition = TimeSpan.Zero;
        LastUpdatedAt = DateTimeOffset.UtcNow;
        State = PlaybackState.Paused;
        
        //AddDomainEvent();
        //AddDomainEvent();
        
        return Result.Success();
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="Room"/> class.
    /// </summary>
    /// <param name="name">The name of the room.</param>
    /// <param name="hostId">The identifier of the user creating the room.</param>
    public Room(string name, Guid hostId)
    {
        Name = name;
        HostId = hostId;
        AddParticipant(new RoomParticipant(hostId, isHost: true));
    }

    /// <summary>
    /// Registers a new participant in the room session, enabling them to synchronize with the shared playback.
    /// </summary>
    /// <param name="participant">The participant entity to be added to the viewing session.</param>
    /// <exception cref="ArgumentException">Thrown when the participant reference is null.</exception>
    public void AddParticipant(RoomParticipant participant)
    {
        if (participant is null) throw new ArgumentException("Participant must not be null");
        if (_participants.Any(p => p.UserId == participant.UserId)) return;
        
        _participants.Add(participant);
    }
    
    /// <summary>
    /// Removes a participant from the room and automatically reassigns host privileges to maintain session control.
    /// </summary>
    /// <param name="userId">The identifier of the participant to be removed.</param>
    /// <exception cref="ArgumentException">Thrown if the participant is not found within the current session.</exception>
    public Result RemoveParticipant(Guid userId)
    {
        var participant = Participants.FirstOrDefault(p => p.UserId == userId);
        if (participant is null) 
            return Result.Failure(DomainErrors.Room.ParticipantNotFound);
        
        _participants.Remove(participant);

        if (participant.IsHost && _participants.Count > 0)
        {
            HostId = _participants[0].UserId;
            _participants[0].SetHostState(isHost: true);
        }
        
        return Result.Success();
    }

    /// <summary>
    /// Transitions the room to a playing state, synchronizing all participants to the specified video position.
    /// </summary>
    /// <param name="currentClientPosition">The master playback position captured from the triggering client.</param>
    /// <exception cref="InvalidOperationException">Thrown if any participant is currently in a buffering state, preventing synchronization.</exception>
    public Result Play(TimeSpan currentClientPosition)
    {
        if (CurrentVideo != null && currentClientPosition > CurrentVideo.Duration
            || currentClientPosition < TimeSpan.Zero)
            return Result.Failure(DomainErrors.Room.InvalidPosition);
        
        if (State == PlaybackState.Playing) return Result.Success();

        if (_participants.Any(p => p.IsBuffering))
        {
            return Result.Failure(DomainErrors.Room.CannotPlayWhileBuffering);
        }
        
        State = PlaybackState.Playing;
        CurrentPosition = currentClientPosition;
        LastUpdatedAt = DateTimeOffset.UtcNow;
        
        AddDomainEvent(new RoomPlaybackStateChangedEvent(
            RoomId: Id, 
            NewState: State, 
            CurrentPosition: CurrentPosition, 
            TriggeredAt: LastUpdatedAt));
        
        return Result.Success();
    }

    /// <summary>
    /// Suspends playback across the entire room to ensure all participants remain synchronized at the same timestamp.
    /// </summary>
    /// <param name="currentClientPosition">The video position where the pause was initiated.</param>
    public Result Pause(TimeSpan currentClientPosition)
    {
        if (CurrentVideo != null && currentClientPosition > CurrentVideo.Duration
            || currentClientPosition < TimeSpan.Zero)
            return Result.Failure(DomainErrors.Room.InvalidPosition);

        if (State == PlaybackState.Paused) return Result.Success();
        
        State = PlaybackState.Paused;
        CurrentPosition = currentClientPosition;
        LastUpdatedAt = DateTimeOffset.UtcNow;
        
        AddDomainEvent(new RoomPlaybackStateChangedEvent(
            RoomId: Id, 
            NewState: State, 
            CurrentPosition: CurrentPosition, 
            TriggeredAt: LastUpdatedAt));
        
        return Result.Success();
    }

    /// <summary>
    /// Signals that a participant has encountered technical lag, forcing the room into a buffering state to wait for recovery.
    /// </summary>
    /// <param name="userId">The identifier of the participant experiencing buffering.</param>
    /// <param name="currentClientPosition">The playback position where the buffering event occurred.</param>
    /// <exception cref="ArgumentException">Thrown if the user is not a member of the room.</exception>
    public Result ReportBuffering(Guid userId, TimeSpan currentClientPosition)
    {
        if (CurrentVideo != null && currentClientPosition > CurrentVideo.Duration
            || currentClientPosition < TimeSpan.Zero)
            return Result.Failure(DomainErrors.Room.InvalidPosition);
        
        var participant = _participants.FirstOrDefault(p => p.UserId == userId);
            
        if(participant == null) 
            return Result.Failure(DomainErrors.Room.ParticipantNotFound);

        participant.SetBufferingState(isBuffering: true);
        
        if (State == PlaybackState.Playing)
        {
            State = PlaybackState.Buffering;
            CurrentPosition = currentClientPosition;
            LastUpdatedAt = DateTimeOffset.UtcNow;
            
            AddDomainEvent(new RoomPlaybackStateChangedEvent(
                RoomId: Id, 
                NewState: State, 
                CurrentPosition: CurrentPosition, 
                TriggeredAt: LastUpdatedAt));
        }
        
        return Result.Success();
    }

    /// <summary>
    /// Notifies the room that a participant's player is ready to resume. 
    /// Restores playback if all other participants have also completed buffering.
    /// </summary>
    /// <param name="userId">The identifier of the participant who has recovered from buffering.</param>
    /// <exception cref="ArgumentException">Thrown if the user is not found in the session.</exception>
    public Result ReportBufferingCompleted(Guid userId)
    {
        var participant = _participants.FirstOrDefault(p => p.UserId == userId);
        
        if(participant == null) 
            return Result.Failure(DomainErrors.Room.ParticipantNotFound);
        
        participant.SetBufferingState(isBuffering: false);

        if (State == PlaybackState.Buffering && !_participants.Any(p => p.IsBuffering))
        {
            State = PlaybackState.Playing;
            LastUpdatedAt = DateTimeOffset.UtcNow;
            
            AddDomainEvent(new RoomPlaybackStateChangedEvent(
                RoomId: Id, 
                NewState: State, 
                CurrentPosition: CurrentPosition, 
                TriggeredAt: LastUpdatedAt));
        }
        
        return Result.Success();
    }
}