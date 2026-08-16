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
        public DbSet<UserEntity> Users { get; set; }

        protected override void OnModelCreating(ModelBuilder context)
        {
            base.OnModelCreating(context);

            context.Entity<UserEntity>(entity =>
            {
                entity.Property(entity => entity.Name).IsRequired(true).HasMaxLength(30);
                entity.Property(entity => entity.Email).IsRequired(true).HasMaxLength(40);
                entity.Property(entity => entity.Password).IsRequired(true);
            });


        }

    }
}
