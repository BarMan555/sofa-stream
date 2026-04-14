using SofaStream.Domain.Common;

namespace SofaStream.Application.Common.Interfaces;

/// <summary>
/// Defines a contract for handlers that process commands which do not return a result.
/// These handlers execute business logic that typically modifies the state of the system.
/// </summary>
/// <typeparam name="TCommand">The type of the command being handled.</typeparam>
public interface ICommandHandler<in TCommand>
{
    /// <summary>
    /// Executes the business logic associated with the command.
    /// </summary>
    /// <param name="command">The command instance containing request data.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A task that represents the asynchronous operation.</returns>
    Task HandleAsync(TCommand command, CancellationToken cancellationToken = default);
}

/// <summary>
/// Defines a contract for handlers that process commands and return a result.
/// Used when the execution of a business command must provide feedback or data back to the caller.
/// </summary>
/// <typeparam name="TCommand">The type of the command being handled.</typeparam>
/// <typeparam name="TResult">The type of the result returned after processing.</typeparam>
public interface ICommandHandler<in TCommand, TResult>
{
    /// <summary>
    /// Executes the business logic associated with the command and returns a result.
    /// </summary>
    /// <param name="command">The command instance containing request data.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A task that represents the asynchronous operation, containing the result of the command execution.</returns>
    Task<TResult> HandleAsync(TCommand command, CancellationToken cancellationToken = default);
}

/// <summary>
/// Defines a contract for handlers that respond to domain events.
/// Domain event handlers facilitate decoupling by allowing the system to react to changes 
/// without the initiating aggregate being aware of the side effects.
/// </summary>
/// <typeparam name="TDomainEvent">The type of the domain event being handled.</typeparam>
public interface IDomainEventHandler<in TDomainEvent> where TDomainEvent : Domain.Common.IDomainEvent
{
    /// <summary>
    /// Reacts to the occurrence of a domain event.
    /// </summary>
    /// <param name="domainEvent">The domain event instance containing the details of the change.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A task that represents the asynchronous operation.</returns>
    Task HandleAsync(TDomainEvent domainEvent, CancellationToken cancellationToken = default);
}