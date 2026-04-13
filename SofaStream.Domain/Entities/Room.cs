using SofaStream.Domain.Common;
using SofaStream.Domain.Events;

namespace SofaStream.Domain.Entities;

public enum PlaybackState
{
    Paused,
    Playing,
    Buffering
}

public class Room : AggregateRoot
{
    private readonly List<RoomParticipant> _participants = [];
    public IReadOnlyCollection<RoomParticipant> Participants => _participants;
    
    public Guid Id { get; } = Guid.NewGuid();

    public string Name
    {
        get;
        private set => field = string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Room name cannot be null or empty")
            : value;
    }
    
    public Guid HostId { get; private set; }
    
    public PlaybackState State { get;  private set; } = PlaybackState.Paused;
    public TimeSpan CurrentPosition { get; private set; } = TimeSpan.Zero;
    public DateTimeOffset LastUpdatedAt { get; private set; } = DateTimeOffset.UtcNow;

    public Room(string name, Guid hostId)
    {
        Name = name;
        HostId = hostId;
        AddParticipant(new RoomParticipant(hostId, isHost: true));
    }

    public void AddParticipant(RoomParticipant participant)
    {
        if (participant is null) throw new ArgumentException("Participant must not be null");
        if (_participants.Any(p => p.UserId == participant.UserId)) return;
        
        _participants.Add(participant);
    }
    
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
        }
        
        AddDomainEvent(new RoomPlaybackStateChangedEvent(
            RoomId: Id, 
            NewState: State, 
            CurrentPosition: CurrentPosition, 
            TriggeredAt: LastUpdatedAt));
    }

    public void ReportBufferingCompleted(Guid userId)
    {
        var participant = _participants.FirstOrDefault(p => p.UserId == userId)
            ?? throw new ArgumentException("Participant was not found");
        
        participant.SetBufferingState(isBuffering: false);

        if (State == PlaybackState.Buffering && !_participants.Any(p => p.IsBuffering))
        {
            State = PlaybackState.Playing;
            LastUpdatedAt = DateTimeOffset.UtcNow;
        }
        
        AddDomainEvent(new RoomPlaybackStateChangedEvent(
            RoomId: Id, 
            NewState: State, 
            CurrentPosition: CurrentPosition, 
            TriggeredAt: LastUpdatedAt));
    }
}