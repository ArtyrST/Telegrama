using Microsoft.EntityFrameworkCore;
using Telegrama.API.Data;
using Telegrama.API.Features.Users;
using Telegrama.Repositories.GenericRepository;

namespace Telegrama.Repositories.User
{
    public class UserRepository : GenericRepository<UserEntity>, IUserRepositoty
    {
        private readonly AppDbContext _context;

        public UserRepository(AppDbContext context)    
            :base (context)
        {
            _context = context;
        }

        

        public async Task<UserEntity> GetByIdAsync(Guid id)
        {
            
            return await _context.Users.FirstOrDefaultAsync(user => user.Id == id);
        }

        public async Task<UserEntity> GetByEmailAsync(string email)
        {
            var normilized = email.Trim().ToLowerInvariant();
            return await _context.Users.FirstOrDefaultAsync(user => user.Email == normilized);
        }
        public async Task<UserEntity?> GetByTagAsync(string tag)
        {
            return await _context.Users.FirstOrDefaultAsync(user => user.UserTag.ToLower().Equals("@" + tag.ToLower()));
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

        public async Task<bool> EmailUnique(string email)
        {
            var normalized = email.Trim().ToLowerInvariant();
            return await _context.Users.AnyAsync(u => u.Email.Equals(normalized));
        }
        public async Task<bool> TagUnique(string tag)
        {
            var normalized = "@" + tag.Trim().TrimStart('@').ToLowerInvariant();
            return await _context.Users.AnyAsync(u => u.UserTag.ToLower() == normalized);
        }
    }
}
