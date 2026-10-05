using Telegrama.API.Features.Chats;

namespace Telegrama.Repositories.Chat
{
    public interface IChatRepository
    {
        public Task<ChatEntity> GetByIdAsync(Guid chatId);
        public Task<ChatEntity> GetByNameAsync(string name);
        public Task<bool> AddAsync(ChatEntity entity);
        public Task<List<ChatEntity>> GetAllByUserAsync(Guid userId);
        public Task<bool> IsDirectExist(Guid User1, Guid User2);
        public Task<bool> IsChatNameExist(string name);
        public Task<bool> IsChatExist(Guid id);
        public Task<bool> JoinChatAsync(ChatMemberEntity member, Guid chatId);
        public Task<bool> IsUserExistInChat(Guid memberId, Guid chatId);
        public Task<ChatEntity> FindChatByIdAsync(string id);
        public Task<ChatEntity?> FindDirectChatAsync(Guid User1, Guid User2);
    }
}
