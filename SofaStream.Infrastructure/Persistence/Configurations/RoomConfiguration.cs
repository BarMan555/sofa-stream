using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SofaStream.Domain.Entities;

namespace SofaStream.Infrastructure.Persistence.Configurations;

internal class RoomConfiguration : IEntityTypeConfiguration<Room>
{
    public void Configure(EntityTypeBuilder<Room> builder)
    {
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Name).IsRequired().HasMaxLength(100);
        builder.Ignore(r => r.DomainEvents);
        builder.HasMany(r => r.Participants)
            .WithOne()
            .HasForeignKey(p => p.RoomId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}