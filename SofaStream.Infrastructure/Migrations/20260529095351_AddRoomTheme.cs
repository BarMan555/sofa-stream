using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SofaStream.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRoomTheme : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Theme",
                table: "Rooms",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Dark");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Theme",
                table: "Rooms");
        }
    }
}
