using MediatR;
using SofaStream.Domain.Common;

namespace SofaStream.Application.Common.Models;

/// <summary>
/// A wrapper that adapts domain events to MediatR's INotification system.
/// Allows domain events to be handled by application-layer event handlers.
/// </summary>
/// <typeparam name="TDomainEvent">The type of the domain event being wrapped.</typeparam>
/// <param name="domainEvent">The instance of the domain event.</param>
public class DomainEventNotification<TDomainEvent>(TDomainEvent domainEvent) : INotification 
    where TDomainEvent : IDomainEvent
{
    /// <summary>
    /// Gets the underlying domain event.
    /// </summary>
    public TDomainEvent DomainEvent { get; } = domainEvent;
}