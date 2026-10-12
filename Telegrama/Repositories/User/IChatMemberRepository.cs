using Telegrama.API.Features.Chats;

namespace Telegrama.Repositories.User
{
    public interface IChatMemberRepository
    {
        public Task<ChatMemberEntity> GetByUserChat(Guid chatId, Guid userId);
        
    }
}
