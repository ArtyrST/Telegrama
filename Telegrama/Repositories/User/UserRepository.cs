
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

        

        public async Task<UserEntity> GetByIdAsync(string id)
        {
            
            return await _context.Users.FirstOrDefaultAsync(user => user.Id.ToString() == id);
        }

        public async Task<UserEntity> GetByEmailAsync(string email)
        {
            return await _context.Users.FirstOrDefaultAsync(user => user.Email == email);
        }
        public async Task<UserEntity> GetByTagAsync(string tag)
        {
            return await _context.Users.FirstOrDefaultAsync(user => user.UserTag.ToLower().Equals(tag.ToLower()));
        }

        public async Task<bool> AddAsync(UserEntity user)
        {
            
            await _context.AddAsync(user);
            int res = await _context.SaveChangesAsync();
            return res != 0;
            
        }   

        public async Task<List<UserEntity>> GetAllAsync()
        {
            return await _context.Users.ToListAsync();
        }

        public async Task<bool> IsUserEmailUnique(string email)
        {
            return await _context.Users.AnyAsync(u => u.Email.Equals(email));
        }
        public async Task<bool> IsUserTagUnique(string tag)
        {
            return await _context.Users.AnyAsync(u => u.UserTag.Equals(tag));
        }
    }
}
