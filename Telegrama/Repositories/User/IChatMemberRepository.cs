using AlaBackEnd.DAL.Repositories;
using Telegrama.API.Features.Chats;
using Telegrama.Repositories.GenericRepository;

namespace Telegrama.Repositories.User
{
    public interface IChatMemberRepository : IGenericRepository<ChatMemberEntity>
    {
        public Task<ChatMemberEntity> GetByUserChat(Guid chatId, Guid userId);
        
    }
}
