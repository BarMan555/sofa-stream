namespace SofaStream.Domain.Common;

public class AggregateRoot
{
    private readonly List<IDomainEvent> _events = [];
    public IReadOnlyCollection<IDomainEvent> DomainEvents => _events;
    
    protected void AddDomainEvent(IDomainEvent domainEvent)
    {
        _events.Add(domainEvent);
    }
    
    public void ClearDomainEvents()
    {
        _events.Clear();
    }
}