using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SofaStream.Infrastructure.Migrations;

public partial class TrackDisconnectedParticipants : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AddColumn<DateTimeOffset>(
        name: "DisconnectedAt", table: "RoomParticipant", type: "timestamp with time zone", nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropColumn(
        name: "DisconnectedAt", table: "RoomParticipant");
}
