namespace Telegrama.API.Features.Chats.Dtos
{
    public class MessageDto
    {
        public Guid Id { get; set; }
        public Guid ChatId { get; set; }
        public string MemberName { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
        public DateTime SentAt { get; set; } = DateTime.UtcNow;
        public bool IsChanged { get; set; }
        public bool IsDeleted { get; set; } 
    }
}
