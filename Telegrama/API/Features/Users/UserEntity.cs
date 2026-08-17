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
        //Message
        public ICollection<MessageEntity> Messages { get; set; } = new List<MessageEntity>();
        //Chats
        public ICollection<ChatEntity> Chats { get; set; } = new List<ChatEntity>();
        //ChatMember
        public ChatMemberEntity? UserChatProfileId { get; set; }

    }
}
