using System.ComponentModel.DataAnnotations;
using Telegrama.API.Features.Chats.Enums;

namespace Telegrama.API.Features.Users.Dtos
{
    public class CreateChatDto
    {
        [Required]
        public string Name { get; set; } = string.Empty;
        [Required]
        public ChatsEnum ChatType {  get; set; }
    }
}
