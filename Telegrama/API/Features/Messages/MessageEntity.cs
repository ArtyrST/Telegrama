using Telegrama.API.Features.Users;

namespace Telegrama.API.Features.Messages
{
    public class MessageEntity
    {
        public Guid Id { get; set; }
        public DateTime Time { get; set; } = DateTime.UtcNow;
        public bool IsChanged { get; set; }
        public string Message { get; set; } = string.Empty;


        //relations
        public Guid UserId { get; set; }
        public UserEntity? User { get; set; }

    }
}
