using AlaBackEnd.DAL.Repositories;
using Telegrama.API.Features.Chats;
using Telegrama.API.Features.Messages;
using Telegrama.Repositories.GenericRepository;

namespace Telegrama.Repositories.Message
{
    public interface IMessageRepository : IGenericRepository<MessageEntity>
    {
    }
}
