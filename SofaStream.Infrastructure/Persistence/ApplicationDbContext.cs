using Microsoft.EntityFrameworkCore;
using SofaStream.Domain.Common;
using SofaStream.Domain.Entities;
using SofaStream.Infrastructure.Services;

namespace SofaStream.Infrastructure.Persistence;

/// <summary>
/// The primary database context for the SofaStream application.
/// Manages the persistence of room aggregates and coordinates domain event dispatching.
/// </summary>
/// <param name="options">The options for configuring the database context.</param>
/// <param name="dispatcher">The service responsible for broadcasting domain events after successful persistence.</param>
public class ApplicationDbContext(
    DbContextOptions<ApplicationDbContext> options,
    DomainEventDispatcher dispatcher) : DbContext(options)
{
    /// <summary>
    /// Gets or sets the collection of synchronized viewing rooms.
    /// </summary>
    public DbSet<Room> Rooms => Set<Room>();

    /// <summary>
    /// Configures the database schema and entity mappings for SofaStream.
    /// </summary>
    /// <param name="modelBuilder">The builder used to define the database model.</param>
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }

    /// <summary>
    /// Persists changes to the database and dispatches accumulated domain events.
    /// Ensures that event handlers only run if the state change was successfully committed.
    /// </summary>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A task that represents the asynchronous operation, containing the number of affected rows.</returns>
    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var entitiesWithEvents = ChangeTracker.Entries<AggregateRoot>()
            .Select(r => r.Entity)
            .Where(r => r.DomainEvents.Count != 0)
            .ToList();

        var events = entitiesWithEvents.SelectMany(r => r.DomainEvents).ToList();
        
        entitiesWithEvents.ForEach(r => r.ClearDomainEvents());

        var result = await base.SaveChangesAsync(cancellationToken);

        await dispatcher.DispatchAsync(events, cancellationToken);
        
        return result;
    }
}