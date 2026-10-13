using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Telegrama.Migrations
{
    /// <inheritdoc />
    public partial class EmailVerificationOtp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "code",
                table: "VerifCodes");

            migrationBuilder.AddColumn<int>(
                name: "AttemptCount",
                table: "VerifCodes",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "CodeHash",
                table: "VerifCodes",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ExpiresAt",
                table: "VerifCodes",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastSentAt",
                table: "VerifCodes",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AttemptCount",
                table: "VerifCodes");

            migrationBuilder.DropColumn(
                name: "CodeHash",
                table: "VerifCodes");

            migrationBuilder.DropColumn(
                name: "ExpiresAt",
                table: "VerifCodes");

            migrationBuilder.DropColumn(
                name: "LastSentAt",
                table: "VerifCodes");

            migrationBuilder.AddColumn<string>(
                name: "code",
                table: "VerifCodes",
                type: "text",
                nullable: false,
                defaultValue: "");
        }
    }
}
