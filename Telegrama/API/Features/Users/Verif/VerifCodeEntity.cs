namespace Telegrama.API.Features.Users.Verif
{
    public class VerifCodeEntity : IBaseEntity
    {
        public Guid Id { get; set; }
        public string CodeHash { get; set; } = string.Empty;
        public bool IsVerified { get; set; }
        public bool IsUsed { get; set; }
        public DateTimeOffset ExpiresAt { get; set; }
        public DateTimeOffset? LastSentAt { get; set; }
        public int AttemptCount { get; set; }
        public UserEntity User { get; set; } = null!;
        public Guid UserId { get; set; }
    }
}
