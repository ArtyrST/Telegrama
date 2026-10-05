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
        public async Task<bool> IsChatNameExist(string name)
        {
            return await _context.Chats.AnyAsync(chat => chat.Name == name);
        }
        public async Task<bool> IsChatExist(Guid id)
        {
            return await _context.Chats.AnyAsync(chat => chat.Id == id);
        }
        public async Task<ChatEntity> FindChatByIdAsync(string id)
        {
            return await _context.Chats.FirstOrDefaultAsync(chats => chats.Id.ToString() == id);
        }
        public async Task<bool> IsUserExistInChat(Guid userId, Guid chatId)
        {
            return await _context.ChatMembersProfiles.AnyAsync(member => member.UserId == userId && member.ChatId == chatId);
        }
        public async Task<bool> JoinChatAsync(ChatMemberEntity member, Guid chatId)
        {
            var chat = await _context.Chats.FirstOrDefaultAsync(chat => chat.Id == chatId);
            if (chat == null) return false;
            if (chat.ChatType != ChatsEnum.Public) return false;
            member.ChatId = chat.Id;
            chat.Members.Add(member);
            chat.UsersCount++;
            int res = await _context.SaveChangesAsync();
            return res != 0;
        }

        public async Task<ChatEntity> GetByIdAsync(Guid chatId)
        {
            return await _context.Chats.FirstOrDefaultAsync(c => c.Id.Equals(chatId));
        }

        public async Task<ChatEntity> GetByNameAsync(string name)
        {
            return await _context.Chats.FirstOrDefaultAsync(c => c.Name.ToLower().Equals(name.ToLower()));
        }

        public async Task<bool> AddAsync(ChatEntity entity)
        {
            await _context.Chats.AddAsync(entity);
            
            int res = await _context.SaveChangesAsync();
            return res != 0;
        }
        public async Task<ChatEntity?> FindDirectChatAsync(Guid User1, Guid User2)
        {
            return await _context.Chats
                .FirstOrDefaultAsync(chat => chat.ChatType
                                                    .Equals(ChatsEnum.Direct) &&
                                                    chat.Members.Any(member => member.UserId == User1) &&
                                                    chat.Members.Any(member => member.UserId == User2));
        }
        public async Task<bool> IsDirectExist(Guid User1, Guid User2)
        {
            return await _context.Chats
                .AnyAsync(chat => chat.ChatType
                                                    .Equals(ChatsEnum.Direct) &&
                                                    chat.Members.Any(member => member.UserId == User1) &&
                                                    chat.Members.Any(member => member.UserId == User2));
        }
    }
}
