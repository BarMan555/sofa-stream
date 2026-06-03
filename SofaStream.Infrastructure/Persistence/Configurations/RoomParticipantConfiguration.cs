using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SofaStream.Domain.Entities;

namespace SofaStream.Infrastructure.Persistence.Configurations;

public class RoomParticipantConfiguration : IEntityTypeConfiguration<RoomParticipant>
{
    public void Configure(EntityTypeBuilder<RoomParticipant> builder)
    {
        builder.HasKey(p => new { p.RoomId, p.UserId });
        builder.Property(p => p.RoomId).ValueGeneratedNever();
        builder.Property(p => p.UserId).ValueGeneratedNever();
        builder.Property(p => p.ConnectionId).HasMaxLength(100);
    }
}