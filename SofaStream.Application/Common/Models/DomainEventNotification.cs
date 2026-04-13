using MediatR;
using SofaStream.Domain.Common;

namespace SofaStream.Application.Common.Models;

public class DomainEventNotification<TDomainEvent>(TDomainEvent domainEvent) : INotification 
    where TDomainEvent : IDomainEvent
{
    public TDomainEvent DomainEvent { get; } = domainEvent;
}