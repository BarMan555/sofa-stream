using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Application.Rooms.Commands.ChangePlaybackState;
using SofaStream.Domain.Common;
using SofaStream.Domain.Events;

namespace SofaStream.Infrastructure.Services;

/// <summary>
/// Service responsible for identifying and invoking domain event handlers.
/// Facilitates the side effects of business logic across the SofaStream system.
/// </summary>
/// <param name="serviceProvider">The service provider used to resolve event handler implementations.</param>
public class DomainEventDispatcher(IServiceProvider serviceProvider)
{
    /// <summary>
    /// Dispatches a collection of domain events to their respective registered handlers.
    /// </summary>
    /// <param name="domainEvents">The set of events to be processed.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A task representing the asynchronous dispatch process.</returns>
    /// <exception cref="InvalidOperationException">Thrown if a handler for a specific event type cannot be resolved.</exception>
    public async Task DispatchAsync(IEnumerable<IDomainEvent> domainEvents, CancellationToken cancellationToken = default)
    {
        foreach (var domainEvent in domainEvents)
        {
            var eventType = domainEvent.GetType();
            
            var handlerType = typeof(IDomainEventHandler<>).MakeGenericType(eventType);
            
            var handlers = serviceProvider.GetServices(handlerType);

            var method = handlerType.GetMethod("HandleAsync");
            if (method == null)
            {
                throw new InvalidOperationException($"EventHandler not found: {handlerType.Name} - {eventType.Name}");
            }
            
            foreach (var handler in handlers)
            {
                await (Task)method.Invoke(handler, [domainEvent, cancellationToken])!;
            }
        }
    }
}