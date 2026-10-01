using Telegrama.API.Features.Chats.Enums;

namespace Telegrama.API.Features.Chats.Dtos
{
    public class CreateChatDto
    {
        public string Name { get; set; } = string.Empty;
        public ChatsEnum ChatType { get; set; }
    }
}
