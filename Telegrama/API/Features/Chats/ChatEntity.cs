using Telegrama.API.Features.Chats.Enums;
using Telegrama.API.Features.Messages;
using Telegrama.API.Features.Users;

namespace Telegrama.API.Features.Chats
{
    public class ChatEntity
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int UsersCount { get; set; }
        public ChatsEnum ChatType { get; set; }

        //relations
        //UsersProfiles
        public ICollection<ChatMemberEntity> Members { get; set; } = new List<ChatMemberEntity>();
        //messages
        public ICollection<MessageEntity> Messages { get; set; } = new List<MessageEntity>();
        
        
    }
}
