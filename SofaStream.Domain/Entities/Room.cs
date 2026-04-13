using SofaStream.Domain.Common;
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
    public Guid Id { get; } = Guid.NewGuid();

    /// <summary>
    /// Gets the display name of the room.
    /// </summary>
    /// <exception cref="ArgumentException">Thrown when setting an empty or null name.</exception>
    public string Name
    {
        get;
        private set => field = string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Room name cannot be null or empty")
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
    /// Adds a new user to the room if they are not already present.
    /// </summary>
    /// <param name="participant">The participant to add.</param>
    /// <exception cref="ArgumentException">Thrown when the participant is null.</exception>
    public void AddParticipant(RoomParticipant participant)
    {
        if (participant is null) throw new ArgumentException("Participant must not be null");
        if (_participants.Any(p => p.UserId == participant.UserId)) return;
        
        _participants.Add(participant);
    }
    
    /// <summary>
    /// Removes a user from the room and reassigns host privileges if necessary.
    /// </summary>
    /// <param name="userId">The identifier of the user to remove.</param>
    /// <exception cref="ArgumentException">Thrown if the user is not found in the room.</exception>
    public void RemoveParticipant(Guid userId)
    {
        var participant = Participants.FirstOrDefault(p => p.UserId == userId)
            ?? throw new ArgumentException("Participant was not found");
        
        _participants.Remove(participant);

        if (participant.IsHost && _participants.Count > 0)
        {
            HostId = _participants[0].UserId;
            _participants[0].SetHostState(isHost: true);
        }
        
    }

    /// <summary>
    /// Switches the room to the playing state if all participants have finished buffering.
    /// </summary>
    /// <param name="currentClientPosition">The current playback time provided by the triggering client.</param>
    /// <exception cref="InvalidOperationException">Thrown if someone is still buffering.</exception>
    public void Play(TimeSpan currentClientPosition)
    {
        if (State == PlaybackState.Playing) return;

        if (_participants.Any(p => p.IsBuffering))
        {
            throw new InvalidOperationException("Cannot play while participants are buffering.");
        }
        
        State = PlaybackState.Playing;
        CurrentPosition = currentClientPosition;
        LastUpdatedAt = DateTimeOffset.UtcNow;
        
        AddDomainEvent(new RoomPlaybackStateChangedEvent(
            RoomId: Id, 
            NewState: State, 
            CurrentPosition: CurrentPosition, 
            TriggeredAt: LastUpdatedAt));
    }

    /// <summary>
    /// Pauses the playback for everyone in the room.
    /// </summary>
    /// <param name="currentClientPosition">The current playback time provided by the triggering client.</param>
    public void Pause(TimeSpan currentClientPosition)
    {
        if (State == PlaybackState.Paused) return;
        
        State = PlaybackState.Paused;
        CurrentPosition = currentClientPosition;
        LastUpdatedAt = DateTimeOffset.UtcNow;
        
        AddDomainEvent(new RoomPlaybackStateChangedEvent(
            RoomId: Id, 
            NewState: State, 
            CurrentPosition: CurrentPosition, 
            TriggeredAt: LastUpdatedAt));
    }

    /// <summary>
    /// Reports that a participant has started buffering, potentially suspending playback for the entire room.
    /// </summary>
    /// <param name="userId">The identifier of the buffering participant.</param>
    /// <param name="currentClientPosition">The current playback time where buffering started.</param>
    /// <exception cref="ArgumentException">Thrown if the user is not in the room.</exception>
    public void ReportBuffering(Guid userId, TimeSpan currentClientPosition)
    {
        var participant = _participants.FirstOrDefault(p => p.UserId == userId)
            ?? throw new ArgumentException("Participant was not found");

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
    }

    /// <summary>
    /// Reports that a participant has finished buffering. Resumes playback if no other participants are buffering.
    /// </summary>
    /// <param name="userId">The identifier of the participant who finished loading.</param>
    /// <exception cref="ArgumentException">Thrown if the user is not in the room.</exception>
    public void ReportBufferingCompleted(Guid userId)
    {
        var participant = _participants.FirstOrDefault(p => p.UserId == userId)
            ?? throw new ArgumentException("Participant was not found");
        
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
    }
}