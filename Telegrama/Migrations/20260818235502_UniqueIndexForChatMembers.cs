using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Telegrama.Migrations
{
    /// <inheritdoc />
    public partial class UniqueIndexForChatMembers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Messages_Users_UserId",
                table: "Messages");

            migrationBuilder.DropIndex(
                name: "IX_Messages_UserId",
                table: "Messages");

            migrationBuilder.DropIndex(
                name: "IX_ChatMembersProfiles_UserId",
                table: "ChatMembersProfiles");

            migrationBuilder.RenameColumn(
                name: "UserId",
                table: "Messages",
                newName: "SenderId");

            migrationBuilder.AddColumn<Guid>(
                name: "ChatId",
                table: "Messages",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "JoinedAt",
                table: "ChatMembersProfiles",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.CreateIndex(
                name: "IX_Messages_ChatId",
                table: "Messages",
                column: "ChatId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatMembersProfiles_UserId_ChatId",
                table: "ChatMembersProfiles",
                columns: new[] { "UserId", "ChatId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Messages_ChatMembersProfiles_Id",
                table: "Messages",
                column: "Id",
                principalTable: "ChatMembersProfiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Messages_Chats_ChatId",
                table: "Messages",
                column: "ChatId",
                principalTable: "Chats",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Messages_ChatMembersProfiles_Id",
                table: "Messages");

            migrationBuilder.DropForeignKey(
                name: "FK_Messages_Chats_ChatId",
                table: "Messages");

            migrationBuilder.DropIndex(
                name: "IX_Messages_ChatId",
                table: "Messages");

            migrationBuilder.DropIndex(
                name: "IX_ChatMembersProfiles_UserId_ChatId",
                table: "ChatMembersProfiles");

            migrationBuilder.DropColumn(
                name: "ChatId",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "JoinedAt",
                table: "ChatMembersProfiles");

            migrationBuilder.RenameColumn(
                name: "SenderId",
                table: "Messages",
                newName: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Messages_UserId",
                table: "Messages",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatMembersProfiles_UserId",
                table: "ChatMembersProfiles",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Messages_Users_UserId",
                table: "Messages",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id");
        }
    }
}
