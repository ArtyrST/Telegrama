using Telegrama.API.Features.Chats.Enums;
using Telegrama.API.Features.Users;

namespace Telegrama.API.Features.Chats
{
    public class ChatMemberEntity
    {
        public Guid Id {  get; set; }
        public string ChatProfileName { get; set; } = string.Empty;
        public ChatRoleEnum Role { get; set; }

        //relations
        //users
        public Guid UserId { get; set; }
        public UserEntity? User { get; set; }
        //chats
        public Guid ChatId { get; set; }
        public ChatEntity? Chat { get; set; }

    }
}
