using Microsoft.EntityFrameworkCore;
using Telegrama.API.Data;
using Telegrama.API.Features.Messages;
using Telegrama.Migrations;
using Telegrama.Repositories.GenericRepository;

namespace Telegrama.Repositories.Message
{
    public class MessageRepository : GenericRepository<MessageEntity>, IMessageRepository
    {
        private readonly AppDbContext _context;
        public MessageRepository(AppDbContext context) 
            : base(context)
        {
            _context = context;
        }

        public async Task<List<MessageEntity>> GetLatestByChatAsync(Guid chatId, int limit)
        {
            var messages = await _context.Messages
                .Where(chat => chat.ChatId == chatId)
                .Include(sender => sender.Sender)
                .OrderByDescending(message => message.Time)
                .ThenByDescending(message => message.Id)
                .Take(limit)    
                .ToListAsync();

            messages.Reverse();
            return messages;
        }
        public Task<int> GetUnreadMessagesCountAsync(
            Guid chatId,
            Guid memberId,
            DateTime? lastReadAt)
        {
            var query = _context.Messages
                .Where(message =>
                    message.ChatId == chatId &&
                    message.SenderId != memberId);

            if (lastReadAt.HasValue)
            {
                query = query.Where(message => message.Time > lastReadAt.Value);
            }

            return query.CountAsync();
        }
        public async Task<DateTime?> GetLatestMessageTimeAsync(Guid chatId)
        {
            return await _context.Messages
                .Where(message => message.ChatId == chatId)
                .OrderByDescending(messages => messages.Time)
                .Select(messages => (DateTime?)messages.Time)
                .FirstOrDefaultAsync();
                
        }
    }
}
