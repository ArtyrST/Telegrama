using Telegrama.API.Features;
using Telegrama.API.Features.Users;

namespace Telegrama.Repositories.User

{
    public interface IUserRepositoty
    {
        public Task<UserEntity> GetByIdAsync(Guid id);
        public Task<UserEntity> GetByEmailAsync(string email);
        public Task<UserEntity> GetByTagAsync(string tag);
        public Task<bool> AddAsync(UserEntity user);
        public Task<List<UserEntity>> GetAllAsync();
        public Task<bool> EmailUnique(string email);
        public Task<bool> TagUnique(string tag);


    }
}
