using Telegrama.API.Features.Chats.Dtos;

namespace Telegrama.API.Features.Chats
{
    public interface IChatService
    {
        public Task<ServiceResponse> CreateDirectAsync(CreateDirectDto dto);

    }
}
