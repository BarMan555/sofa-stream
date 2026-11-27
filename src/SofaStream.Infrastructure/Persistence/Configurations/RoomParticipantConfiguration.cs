using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SofaStream.Domain.Entities;

namespace SofaStream.Infrastructure.Persistence.Configurations;

/// <summary>
/// Entity Framework Core configuration for the <see cref="RoomParticipant"/> entity.
/// Defines database constraints, keys, and property requirements.
/// </summary>
public class RoomParticipantConfiguration : IEntityTypeConfiguration<RoomParticipant>
{
    /// <summary>
    /// Configures the database schema settings for the <see cref="RoomParticipant"/> entity.
    /// </summary>
    /// <param name="builder">The builder to be used to configure the entity type.</param>
    public void Configure(EntityTypeBuilder<RoomParticipant> builder)
    {
        builder.HasKey(p => new { p.RoomId, p.UserId });
        builder.Property(p => p.RoomId).ValueGeneratedNever();
        builder.Property(p => p.UserId).ValueGeneratedNever();
        builder.Property(p => p.ConnectionId).HasMaxLength(100);
    }
}