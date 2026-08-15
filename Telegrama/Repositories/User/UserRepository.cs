
using Microsoft.EntityFrameworkCore;
using Telegrama.API.Data;
using Telegrama.API.Features.Users;

namespace Telegrama.Repositories.User
{
    public class UserRepository : IUserRepositoty
    {
        private readonly AppDbContext _context;

        public UserRepository(AppDbContext context)    
        {
            _context = context;
        }

        

        public async Task<UserEntity> GetByIdAsync(Guid id)
        {
            
            return await _context.Users.FirstOrDefaultAsync(user => user.Id == id);
        }

        public async Task<UserEntity> GetByEmailAsync(string email)
        {
            return await _context.Users.FirstOrDefaultAsync(user => user.Email == email);
        }

        public async Task<UserEntity> AddAsync(UserEntity user)
        {
            
            await _context.AddAsync(user);
            await _context.SaveChangesAsync();
            return user;
            
        }   

        public async Task<List<UserEntity>> GetAllAsync()
        {
            return await _context.Users.ToListAsync();
        }
    }
}
