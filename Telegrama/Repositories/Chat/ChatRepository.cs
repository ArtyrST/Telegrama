using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Query;
using Telegrama.API.Data;
using Telegrama.API.Features.Chats;
using Telegrama.API.Features.Chats.Enums;
using Telegrama.API.Features.Users;

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
            return await _context.Chats
                .Where(chat => chat.Members
                                   .Any(member => member.UserId.Equals(userId)))
                .ToListAsync();
        }

        public async Task<ChatEntity> GetByIdAsync(Guid chatId)
        {
            return await _context.Chats.FirstOrDefaultAsync(c => c.Id.Equals(chatId));
        }

        public async Task<ChatEntity> GetByNameAsync(string name)
        {
            return await _context.Chats.FirstOrDefaultAsync(c => c.Name.ToLower().Equals(name.ToLower()));
        }

        public async Task AddAsync(ChatEntity entity)
        {
            await _context.Chats.AddAsync(entity);
            await _context.SaveChangesAsync();
        }
        public async Task<ChatEntity?> FindDirectChatAsync(Guid User1, Guid User2)
        {
            return await _context.Chats
                .FirstOrDefaultAsync(chat => chat.ChatType
                                                    .Equals(ChatsEnum.Private) &&
                                                    chat.Members.Any(member => member.UserId == User1) &&
                                                    chat.Members.Any(member => member.UserId == User2));
        }
    }
}
