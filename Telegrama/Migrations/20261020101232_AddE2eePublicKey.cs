using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Telegrama.Migrations
{
    /// <inheritdoc />
    public partial class AddE2eePublicKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "E2eePublicKey",
                table: "Users",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "E2eePublicKey",
                table: "Users");
        }
    }
}
