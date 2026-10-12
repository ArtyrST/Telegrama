using Microsoft.EntityFrameworkCore;
using Telegrama.API.Data;
using Telegrama.API.Features.Messages;
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
    }
}
