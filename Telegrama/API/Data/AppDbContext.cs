using Microsoft.EntityFrameworkCore;
using Telegrama.API.Features.Users;

namespace Telegrama.API.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
            : base(options) 
        {
            
        }
        public DbSet<User> Users { get; set; }

    }
}
