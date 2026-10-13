using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Telegrama.Migrations
{
    /// <inheritdoc />
    public partial class NormalizedNameFix : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NormalizedName",
                table: "Chats",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NormalizedName",
                table: "Chats");
        }
    }
}
