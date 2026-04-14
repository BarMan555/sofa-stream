using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Application.Rooms.Commands.ChangePlaybackState;
using SofaStream.Domain.Common;
using SofaStream.Domain.Events;

namespace SofaStream.Infrastructure.Services;

public class DomainEventDispatcher(IServiceProvider serviceProvider)
{
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