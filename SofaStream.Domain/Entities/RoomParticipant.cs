namespace SofaStream.Domain.Entities;

public class RoomParticipant(Guid userId, bool isHost)
{
    public Guid UserId { get; } = userId;
    public bool IsHost { get; private set; } = isHost;
    public bool IsBuffering { get; private set; } = false;

    internal void SetBufferingState(bool isBuffering)
    {
        this.IsBuffering = isBuffering;
    }
    
    internal void SetHostState(bool isHost)
    {
        this.IsHost = isHost;
    }
}