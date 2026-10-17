using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SofaStream.Infrastructure.Migrations;

public partial class TrackVideoRevision : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AddColumn<long>(
        name: "VideoRevision", table: "Rooms", type: "bigint", nullable: false, defaultValue: 0L);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropColumn(
        name: "VideoRevision", table: "Rooms");
}
