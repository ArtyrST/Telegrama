using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Telegrama.Migrations
{
    /// <inheritdoc />
    public partial class ChatMemberLastRead : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "LastRead",
                table: "ChatMembersProfiles",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LastRead",
                table: "ChatMembersProfiles");
        }
    }
}
