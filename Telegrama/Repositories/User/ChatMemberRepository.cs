using Microsoft.EntityFrameworkCore;
using Telegrama.API.Data;
using Telegrama.API.Features.Chats;
using Telegrama.Repositories.GenericRepository;

namespace Telegrama.Repositories.User
{
    public class ChatMemberRepository : GenericRepository<ChatMemberEntity>, IChatMemberRepository
    {
        private readonly AppDbContext _context;
        public ChatMemberRepository(AppDbContext context) : base(context)
        {
            _context = context;
        }

        public async Task<ChatMemberEntity> GetByUserChat(Guid chatId, Guid userId)
        {
            return await _context.ChatMembersProfiles.FirstOrDefaultAsync
                (member => member.ChatId == chatId
                    && member.UserId == userId);
        }
    }
}
