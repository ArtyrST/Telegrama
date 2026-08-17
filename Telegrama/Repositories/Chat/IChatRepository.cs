using Telegrama.API.Features.Chats;

namespace Telegrama.Repositories.Chat
{
    public interface IChatRepository
    {
        public Task<ChatEntity> GetByIdAsync(Guid chatId);
        public Task<ChatEntity> GetByNameAsync(string name);
        public Task<List<ChatEntity>> GetAllByUserAsync(Guid userId);
    }
}
