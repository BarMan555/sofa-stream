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
        builder.OwnsOne(r => r.CurrentVideo, v =>
            {
                v.Property(p => p.Url).IsRequired().HasMaxLength(2000);
                v.Property(p => p.Title).IsRequired().HasMaxLength(500);
                v.Property(p => p.Duration).IsRequired();
            }
        );
    }
}