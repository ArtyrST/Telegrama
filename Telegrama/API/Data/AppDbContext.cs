using Microsoft.EntityFrameworkCore;
using Telegrama.API.Features.Chats;
using Telegrama.API.Features.Messages;
using Telegrama.API.Features.Users;
using Telegrama.API.Features.Users.Verif;
using Telegrama.API.Features.Users.Auth;
using Telegrama.Migrations;

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
        public DbSet<VerifCodeEntity> VerifCodes { get; set; }
        public DbSet<RefreshTokenEntity> RefreshTokens { get; set; }

        protected override void OnModelCreating(ModelBuilder context)
        {
            base.OnModelCreating(context);

            context.Entity<UserEntity>(entity =>
            {
                entity.HasKey(u => u.Id);
                entity.Property(entity => entity.Name).IsRequired(true).HasMaxLength(30);
                entity.Property(entity => entity.Email).IsRequired(true).HasMaxLength(40);
                entity.Property(entity => entity.Password).IsRequired(true);
                entity.Property(entity => entity.E2eePublicKey).HasMaxLength(512);
                entity.HasIndex(entity => entity.UserTag).IsUnique(true);
                entity.HasIndex(entity => entity.Email).IsUnique(true);
            });

            context.Entity<VerifCodeEntity>(code =>
            {

                code.Property(c => c.CodeHash).IsRequired().HasMaxLength(64);
                code.Property(c => c.ExpiresAt).IsRequired();
                code.Property(c => c.LastSentAt);
                code.Property(c => c.AttemptCount).IsRequired();
            });

            context.Entity<RefreshTokenEntity>(token =>
            {
                token.HasKey(x => x.Id);
                token.Property(x => x.TokenHash).IsRequired().HasMaxLength(64);
                token.Property(x => x.ReplacedByTokenHash).HasMaxLength(64);
                token.HasIndex(x => x.TokenHash).IsUnique();
                token.HasIndex(x => new { x.UserId, x.ExpiresAt });
                token.HasOne(x => x.User)
                    .WithMany(x => x.RefreshTokens)
                    .HasForeignKey(x => x.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
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
                c.Property(c => c.DirectKey).HasMaxLength(80);
                c.HasIndex(c => c.DirectKey).IsUnique();
                c.Property(x => x.NormalizedName)
                    .IsRequired()
                    .HasMaxLength(50);

                c.HasIndex(x => x.NormalizedName)
                    .IsUnique()
                    .HasFilter("\"ChatType\" <> 3");
            });

            context.Entity<ChatMemberEntity>(cm =>
            {
                cm.HasKey(cm => cm.Id);
                
            });




            //relations
            //code with user
            context.Entity<UserEntity>(user =>
            {
                user.HasOne(u => u.Code)
                .WithOne(c => c.User)
                .HasForeignKey<VerifCodeEntity>(c => c.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            });

            //userProfile with messages (one to many)
            context.Entity<ChatMemberEntity>(sender =>
            {
                sender.HasMany(messages => messages.Messages)
                .WithOne(sender => sender.Sender)
                .HasForeignKey(sender => sender.SenderId)
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

                chat.HasIndex(x => x.Name)
                 .IsUnique()
                 .HasFilter("\"ChatType\" <> 3");
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
