using Microsoft.EntityFrameworkCore;
using Telegrama.API.Features.Chats;
using Telegrama.API.Features.Messages;
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
        public DbSet<MessageEntity> Messages { get; set; }
        public DbSet<ChatEntity> Chats { get; set; } 
        public DbSet<ChatMemberEntity> ChatMembersProfiles { get; set; }

        protected override void OnModelCreating(ModelBuilder context)
        {
            base.OnModelCreating(context);

            context.Entity<UserEntity>(entity =>
            {
                entity.HasKey(u => u.Id);
                entity.Property(entity => entity.Name).IsRequired(true).HasMaxLength(30);
                entity.Property(entity => entity.Email).IsRequired(true).HasMaxLength(40);
                entity.Property(entity => entity.Password).IsRequired(true);
            });

            context.Entity<MessageEntity>(entity =>
            {
                entity.HasKey(m => m.Id);
            });

            context.Entity<ChatEntity>(c =>
            {
                c.HasKey(c => c.Id);
                c.Property(c => c.Name).IsRequired(true).HasMaxLength(50);
                c.Property(c => c.ChatType).IsRequired(true);
            });

            context.Entity<ChatMemberEntity>(cm =>
            {
                cm.HasKey(cm => cm.Id);
            });




            //relations
            //users with messages (one to many)
            context.Entity<UserEntity>(u =>
            {
                u.HasMany(u => u.Messages)
                .WithOne(m => m.User)
                .HasForeignKey(u => u.UserId)
                .OnDelete(DeleteBehavior.NoAction);
            });
            //users with chats (many to many)
            context.Entity<UserEntity>(u =>
            {
                u.HasMany(u => u.Chats)
                .WithMany(c => c.Users);
            });
            //users with chatprofile (one to one)
            context.Entity<UserEntity>(u =>
            {
                u.HasOne(u => u.UserChatProfileId)
                .WithOne(p => p.ChatMemberId)
                .OnDelete(DeleteBehavior.SetNull);
            });

            //todo: chat -> messages, chatprofile -> chats
        }

    }
}
