using Microsoft.EntityFrameworkCore;
using SofaStream.Domain.Common;
using SofaStream.Domain.Entities;
using SofaStream.Infrastructure.Services;

namespace SofaStream.Infrastructure.Persistence;

public class ApplicationDbContext(
    DbContextOptions<ApplicationDbContext> options,
    DomainEventDispatcher dispatcher) : DbContext(options)
{
    public DbSet<Room> Rooms => Set<Room>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var entitiesWithEvents = ChangeTracker.Entries<AggregateRoot>()
            .Select(e => e.Entity)
            .Where(e => e.DomainEvents.Any())
            .ToList();

        var events = entitiesWithEvents.SelectMany(e => e.DomainEvents).ToList();
        
        entitiesWithEvents.ForEach(e => e.ClearDomainEvents());

        var result = await base.SaveChangesAsync(cancellationToken);

        await dispatcher.DispatchAsync(events, cancellationToken);
        
        return result;
    }
}