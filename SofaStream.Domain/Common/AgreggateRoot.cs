namespace SofaStream.Domain.Common;

/// <summary>
/// Base class for domain entities that serve as the root of an aggregate.
/// Orchestrates domain event lifecycle to maintain consistency during state transitions.
/// </summary>
public class AggregateRoot
{
    private readonly List<IDomainEvent> _events = [];

    /// <summary>
    /// Gets a read-only collection of domain events captured during the aggregate's lifecycle.
    /// </summary>
    public IReadOnlyCollection<IDomainEvent> DomainEvents => _events;
    
    /// <summary>
    /// Records a new domain event within the aggregate's internal store for future dispatching.
    /// </summary>
    /// <param name="domainEvent">The domain event instance representing a state change.</param>
    protected void AddDomainEvent(IDomainEvent domainEvent)
    {
        _events.Add(domainEvent);
    }
    
    /// <summary>
    /// Flushes all recorded domain events, typically performed after successful persistence.
    /// </summary>
    public void ClearDomainEvents()
    {
        _events.Clear();
    }
}