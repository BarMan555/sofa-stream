using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SofaStream.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddVideo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<TimeSpan>(
                name: "CurrentVideo_Duration",
                table: "Rooms",
                type: "interval",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CurrentVideo_Title",
                table: "Rooms",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CurrentVideo_Url",
                table: "Rooms",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CurrentVideo_Duration",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "CurrentVideo_Title",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "CurrentVideo_Url",
                table: "Rooms");
        }
    }
}
