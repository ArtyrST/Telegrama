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
            //userProfile with messages (one to many)
            context.Entity<ChatMemberEntity>(sender =>
            {
                sender.HasMany(messages => messages.Messages)
                .WithOne(sender => sender.Sender)
                .HasForeignKey(sender => sender.Id)
                .OnDelete(DeleteBehavior.SetNull);
            });
            
            //users with chatprofile (one to one)
            context.Entity<UserEntity>(user =>
            {
                user.HasMany(profiles => profiles.Profiles)
                .WithOne(user => user.User)
                .HasForeignKey(user => user.UserId)
                .OnDelete(DeleteBehavior.Cascade);
                
            });
            //profiles unique index
            context.Entity<ChatMemberEntity>(member =>
            {
                member.HasIndex(x => new
                {
                    x.UserId,
                    x.ChatId
                })
                .IsUnique();
            });

            //chats with chatsprofiles
            context.Entity<ChatEntity>(chat =>
            {
                chat.HasMany(member => member.Members)
                .WithOne(chat => chat.Chat)
                .HasForeignKey(chat => chat.ChatId)
                .OnDelete(DeleteBehavior.Cascade);
            });
            //chats with messages
            context.Entity<ChatEntity>(chat =>
            {
                chat.HasMany(messages => messages.Messages)
                .WithOne(chat => chat.Chat)
                .HasForeignKey(chat => chat.ChatId)
                .OnDelete(DeleteBehavior.Cascade);
            });

            //todo: chat -> messages, chatprofile -> chats
        }

    }
}
