using Telegrama.API.Features.Chats;
using Telegrama.API.Features.Messages;

namespace Telegrama.API.Features.Users
{
    public class UserEntity
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Password {  get; set; } = string.Empty;
        public string UserTag { get; set; } = string.Empty;
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;


        //relations
        //ChatMember
        public ICollection<ChatMemberEntity> Profiles { get; set; } = new List<ChatMemberEntity>();

    }
}
