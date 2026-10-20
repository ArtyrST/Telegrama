namespace Telegrama.API.Features.Users.Auth
{
    public class RefreshTokenEntity
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public string TokenHash { get; set; } = string.Empty;
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
        public DateTimeOffset ExpiresAt { get; set; }
        public DateTimeOffset? RevokedAt { get; set; }
        public string? ReplacedByTokenHash { get; set; }

        public UserEntity User { get; set; } = null!;
    }
}
