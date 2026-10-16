using Telegrama.API.Features.Chats.Enums;

namespace Telegrama.API.Features.Chats.Dtos
{
    public class ChatDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int UsersCount { get; set; }
        public ChatsEnum ChatType { get; set; }
        public int UnreadCount { get; set; }
    }
}
