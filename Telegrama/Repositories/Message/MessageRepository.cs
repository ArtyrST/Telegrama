using AlaBackEnd.DAL.Repositories;
using Telegrama.API.Data;
using Telegrama.API.Features.Messages;

namespace Telegrama.Repositories.Message
{
    public class MessageRepository : GenericRepository<MessageEntity>
    {
        public MessageRepository(AppDbContext context) 
            : base(context)
        {

        }
        //public async Task<ICollection<MessageEntity>> GetAll()
    }
}
