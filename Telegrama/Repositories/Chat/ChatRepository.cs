using Microsoft.EntityFrameworkCore;
using Telegrama.API.Data;
using Telegrama.API.Features.Chats;

namespace Telegrama.Repositories.Chat
{
    public class ChatRepository : IChatRepository
    {
        private readonly AppDbContext _context;
        public ChatRepository(AppDbContext context)
        {
            _context = context;
        }
        public async Task<List<ChatEntity>> GetAllByUserAsync(Guid userId)
        {
            return await _context.Chats.Where(c => c.Id.Equals(userId)).ToListAsync();
        }

        public async Task<ChatEntity> GetByIdAsync(Guid chatId)
        {
            return await _context.Chats.FirstOrDefaultAsync(c => c.Id.Equals(chatId));
        }

        public async Task<ChatEntity> GetByNameAsync(string name)
        {
            return await _context.Chats.FirstOrDefaultAsync(c => c.Name.ToLower().Equals(name.ToLower()));
        }
    }
}
