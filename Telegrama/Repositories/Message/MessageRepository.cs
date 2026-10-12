using Telegrama.API.Data;
using Telegrama.API.Features.Messages;
using Telegrama.Repositories.GenericRepository;

namespace Telegrama.Repositories.Message
{
    public class MessageRepository : GenericRepository<MessageEntity>, IMessageRepository
    {
        public MessageRepository(AppDbContext context) 
            : base(context)
        {

        }
        //public async Task<ICollection<MessageEntity>> GetAll()
    }
}
