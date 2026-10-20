using Telegrama.API.Features.Chats;
using Telegrama.API.Features.Messages;
using Telegrama.API.Features.Users.Verif;
using Telegrama.API.Features.Users.Auth;

namespace Telegrama.API.Features.Users
{
    public class UserEntity : IBaseEntity
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Password {  get; set; } = string.Empty;
        public string UserTag { get; set; } = string.Empty;
        public string PhoneNumber {  get; set; } = string.Empty;
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
        // Public ECDH identity key used by the direct-chat E2EE prototype.
        // The matching private key must stay in the user's browser.
        public string? E2eePublicKey { get; set; }


        //relations
        //ChatMember
        public ICollection<ChatMemberEntity> Profiles { get; set; } = new List<ChatMemberEntity>();


        //code
        public VerifCodeEntity? Code { get; set; }
        public ICollection<RefreshTokenEntity> RefreshTokens { get; set; } = new List<RefreshTokenEntity>();
        
    }
}
