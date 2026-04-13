namespace SofaStream.Domain.Common;

/// <summary>
/// Base class for domain entities that serve as the root of an aggregate.
/// It manages a collection of domain events to ensure consistency and coordinate state changes.
/// </summary>
public class AggregateRoot
{
    private readonly List<IDomainEvent> _events = [];

    /// <summary>
    /// Gets a read-only collection of domain events occurred within the aggregate.
    /// </summary>
    public IReadOnlyCollection<IDomainEvent> DomainEvents => _events;
    
    /// <summary>
    /// Adds a new domain event to the aggregate's internal event store.
    /// </summary>
    /// <param name="domainEvent">The domain event to record.</param>
    protected void AddDomainEvent(IDomainEvent domainEvent)
    {
        _events.Add(domainEvent);
    }
    
    /// <summary>
    /// Clears all recorded domain events. Usually called after events have been successfully dispatched.
    /// </summary>
    public void ClearDomainEvents()
    {
        _events.Clear();
    }
}