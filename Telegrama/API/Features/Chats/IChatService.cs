using Telegrama.API.Features.Chats.Dtos;
using Telegrama.API.Features.Chats.Enums;

namespace Telegrama.API.Features.Chats
{
    public interface IChatService
    {
        public Task<ServiceResponse> CreateDirectAsync(CreateDirectDto dto);
        public Task<ServiceResponse> CreateChatAsync(string name, ChatsEnum chatType);
        public Task<ServiceResponse> JoinToChatAsync(Guid chatId);

    }
}
