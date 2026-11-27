using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SofaStream.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRoomInviteCode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "InviteCode",
                table: "Rooms",
                type: "character varying(8)",
                maxLength: 8,
                nullable: true);

            // Existing live rooms keep their UUID and receive distinct invitation codes.
            migrationBuilder.Sql("""
                DO $$
                DECLARE existing record; candidate text;
                BEGIN
                    FOR existing IN SELECT "Id" FROM "Rooms" LOOP
                        LOOP
                            SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                                1 + get_byte(uuid_send(gen_random_uuid()), 0) % 32, 1), '' ORDER BY n)
                            INTO candidate FROM generate_series(1, 8) n;
                            EXIT WHEN NOT EXISTS (SELECT 1 FROM "Rooms" WHERE "InviteCode" = candidate);
                        END LOOP;
                        UPDATE "Rooms" SET "InviteCode" = candidate WHERE "Id" = existing."Id";
                    END LOOP;
                END $$;
                """);

            migrationBuilder.AlterColumn<string>(
                name: "InviteCode", table: "Rooms", type: "character varying(8)",
                maxLength: 8, nullable: false, oldClrType: typeof(string),
                oldType: "character varying(8)", oldMaxLength: 8, oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Rooms_InviteCode",
                table: "Rooms",
                column: "InviteCode",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Rooms_InviteCode",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "InviteCode",
                table: "Rooms");
        }
    }
}
