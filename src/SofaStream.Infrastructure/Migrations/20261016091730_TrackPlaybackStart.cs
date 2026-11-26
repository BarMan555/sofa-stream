using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SofaStream.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TrackPlaybackStart : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PlaybackStartedAt",
                table: "Rooms",
                type: "timestamp with time zone",
                nullable: true);

            // Old rows did not distinguish scheduled Play from immediate buffering recovery.
            // Preserve the normal one-second Play delay until the next playback command.
            migrationBuilder.Sql("""
                UPDATE "Rooms"
                SET "PlaybackStartedAt" = "LastUpdatedAt" + INTERVAL '1 second'
                WHERE "State" = 1;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PlaybackStartedAt",
                table: "Rooms");
        }
    }
}
