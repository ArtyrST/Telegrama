using Telegrama.API.Features.Chats;

namespace Telegrama.API.Features.Messages
{
    public class MessageEntity : IBaseEntity
    {
        public Guid Id { get; set; }
        public DateTime Time { get; set; } = DateTime.UtcNow;
        public bool IsChanged { get; set; }
        public string Message { get; set; } = string.Empty;


        //relations
        //UserProfile
        public ChatMemberEntity Sender { get; set; }
        public Guid? SenderId { get; set; }
        //chat
        public ChatEntity Chat { get; set; }
        public Guid ChatId { get; set; }

    }
}
