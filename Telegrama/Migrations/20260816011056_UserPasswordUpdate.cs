using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Telegrama.Migrations
{
    /// <inheritdoc />
    public partial class UserPasswordUpdate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "UserTag",
                table: "Users",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UserTag",
                table: "Users");
        }
    }
}
