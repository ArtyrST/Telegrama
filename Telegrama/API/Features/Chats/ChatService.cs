using AutoMapper;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Security.Claims;
using Telegrama.API.Data;
using Telegrama.API.Features.Chats.Dtos;
using Telegrama.API.Features.Chats.Enums;
using Telegrama.Repositories.Chat;
using Telegrama.Repositories.Message;
using Telegrama.Repositories.User;

namespace Telegrama.API.Features.Chats
{
    public class ChatService : IChatService
    {
        private readonly IChatRepository _chat;
        private readonly IHttpContextAccessor _httpAccessor;
        private readonly IUserRepositoty _user;
        private readonly IMapper _mapper;
        private readonly ILogger<ChatService> _logger;
        private readonly IMessageRepository _messages;
        private readonly IChatMemberRepository _member;
        public ChatService(IChatMemberRepository member, IMessageRepository messages, ILogger<ChatService> logger, IChatRepository chat, IHttpContextAccessor httpAccessor, IUserRepositoty user, IMapper mapper)
        {
            _chat = chat;
            _httpAccessor = httpAccessor;
            _user = user;
            _mapper = mapper;
            _logger = logger;
            _messages = messages;
            _member = member;
        }
        private static bool IsDuplicateMembership(DbUpdateException exception)
        {
            return exception.GetBaseException() is PostgresException postgresException
                && postgresException.SqlState == PostgresErrorCodes.UniqueViolation
                && postgresException.ConstraintName == "IX_ChatMembersProfiles_UserId_ChatId";
        }
        private static bool IsChatNameConflict(DbUpdateException ex)
        {
            return ex.GetBaseException() is PostgresException pg
                && pg.SqlState == PostgresErrorCodes.UniqueViolation
                && pg.ConstraintName == "IX_Chats_NormalizedName";
        }
        private static string BuildDirectKey(Guid u1, Guid u2)
        {
            string x = u1.ToString();
            string y = u2.ToString();
            return string.CompareOrdinal(x, y) > 0 ? $"{x}_{y}" : $"{y}_{x}";
        }

        public async Task<ServiceResponse> CreateDirectAsync(CreateDirectDto dto)
        {
            if (dto == null)
            {
                return ServiceResponse.Fail("Something wrong or user dors not exitst", null);
            }
            Guid userId = Guid.Parse(_httpAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier));



            var guestEntity = await _user.GetByIdAsync(dto.GuestId);
            var creatorEntity = await _user.GetByIdAsync(userId);
            if (creatorEntity == null || guestEntity == null)
            {
                return ServiceResponse.Fail("Not find this users", null);
            }
            if (guestEntity == null || guestEntity.Id == creatorEntity.Id)
            {
                return ServiceResponse.Fail("This user is not exist", null);
            }
            var guest = new ChatMemberEntity
            {
                ChatProfileName = guestEntity.Name,
                Role = ChatRoleEnum.Owner,
                UserId = dto.GuestId

            };
            var creator = new ChatMemberEntity
            {
                ChatProfileName = creatorEntity.Name,
                Role = ChatRoleEnum.Owner,
                UserId = userId

            };



            var chatEntity = new ChatEntity
            {
                Name = guest.ChatProfileName + " + " + creator.ChatProfileName + " chat",
                ChatType = ChatsEnum.Direct,
                UsersCount = 2,
                DirectKey = BuildDirectKey(guestEntity.Id, creatorEntity.Id),
                Members = new List<ChatMemberEntity>
                {
                    guest,
                    creator
                }

            };
            if (await _chat.IsDirectExist(creatorEntity.Id, guestEntity.Id))
            {
                _logger.LogDebug("Direct chat creation skipped because it already exists for users {CreatorId} and {GuestId}",
                    creatorEntity.Id, guestEntity.Id);
                return ServiceResponse.Fail("This direct already exist", null);
            }
            try
            {
                bool res = await _chat.AddAsync(chatEntity);
                if (!res)
                {
                    _logger.LogError("Repository returned false while creating direct chat for users {CreatorId} and {GuestId}",
                        creatorEntity.Id, guestEntity.Id);
                    return ServiceResponse.Fail("Something Wrong with creating chat", null);
                }
                _logger.LogInformation("Direct chat {ChatId} created for users {CreatorId} and {GuestId}",
                    chatEntity.Id, creatorEntity.Id, guestEntity.Id);
                return ServiceResponse.Success("Success", null);
            }
            catch (DbUpdateException ex) when (
                ex.GetBaseException() is PostgresException pg &&
                pg.SqlState == PostgresErrorCodes.UniqueViolation &&
                pg.ConstraintName == "IX_Chats_DirectKey")
            {
                _logger.LogDebug(ex, "Concurrent direct-chat creation found an existing chat for users {CreatorId} and {GuestId}",
                    creatorEntity.Id, guestEntity.Id);
                return ServiceResponse.Fail("This direct already exist", null);
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(
                    ex,
                    "Failed to create direct chat for {CreatorId} and {GuestId}",
                    creatorEntity.Id,
                    guestEntity.Id);

                throw;
            }

        }
        public async Task<ServiceResponse> CreateChatAsync(string name, ChatsEnum chatType)
        {

            if (!Enum.IsDefined(chatType)|| chatType == ChatsEnum.Direct)
            {
                return ServiceResponse.Fail("You cant create this type of chat", null);
            }

            if (string.IsNullOrWhiteSpace(name))
            {
                return ServiceResponse.Fail("Chat name is required", null);
            }
            name = name.Trim();
            if (name.Length > 50 || name.Length < 3)
                return ServiceResponse.Fail("Chat name must be between 3 and 50 characters", null);
            string NormalizedName = name.Trim().ToUpperInvariant();
            if (await _chat.IsChatNameExist(NormalizedName))
                return ServiceResponse.Fail("Chat with this name already exist", null);

            var userId = _httpAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier)!.ToString();
            var userName = _httpAccessor.HttpContext?.User.FindFirstValue("UserName");

            try
            {
                bool created = await _chat.AddAsync(new ChatEntity
                {
                    Name = name,
                    ChatType = chatType,
                    UsersCount = 1,
                    NormalizedName = NormalizedName,
                    Members = new List<ChatMemberEntity>
                    {
                        new()
                        {
                            UserId = Guid.Parse(userId),
                            ChatProfileName = userName,
                            Role = ChatRoleEnum.Owner
                        }
                    }
                });

                if (!created)
                    return ServiceResponse.Fail("Не вдалося створити чат", null);

                _logger.LogInformation("Group chat created for user {UserId}", userId);
                return ServiceResponse.Success("Чат успішно створено", null);
            }
            catch (DbUpdateException ex) when (IsChatNameConflict(ex))
            {
                _logger.LogDebug(ex, "Group-chat creation rejected because the normalized name is already in use");
                return ServiceResponse.Fail("Чат із такою назвою вже існує", null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected failure while creating a group chat");
                throw;
            }

        }

        public async Task<ServiceResponse> JoinToChatAsync(Guid chatId)
        {
            var userId = Guid.Parse(_httpAccessor.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier));
            var entity = await _user.GetByIdAsync(userId);
            if (entity == null)
            {
                return ServiceResponse.Fail("This user not found(((", null);
            }
            if (!await _chat.IsChatExist(chatId))
            {
                return ServiceResponse.Fail("This chat not exist", null);
            }
            if (await _chat.IsUserExistInChat(userId, chatId))
            {
                _logger.LogDebug("User {UserId} tried to join chat {ChatId} they already belong to", userId, chatId);
                return ServiceResponse.Fail("This user already in chat", null);
            }
            var member = new ChatMemberEntity
            {
                ChatProfileName = entity.Name,
                UserId = entity.Id,
                Role = ChatRoleEnum.Guest
            };

            bool res;

            try
            {
                res = await _chat.JoinChatAsync(member, chatId);
            }
            catch (DbUpdateException ex) when (IsDuplicateMembership(ex))
            {
                _logger.LogDebug(ex, "Concurrent join attempt found existing membership for user {UserId} in chat {ChatId}",
                    userId, chatId);
                return ServiceResponse.Fail("This user already in chat", null);
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "Database failure while adding user {UserId} to chat {ChatId}", userId, chatId);
                throw;
            }

            if (!res)
            {
                _logger.LogError("Repository returned false while adding user {UserId} to chat {ChatId}", userId, chatId);
                return ServiceResponse.Fail("Something wrong with joining to chat", null);
            }

            _logger.LogInformation("User {UserId} joined chat {ChatId}", userId, chatId);
            return ServiceResponse.Success("Success", null);
        }
        public async Task<ServiceResponse> GetAllChatsAsync()
        {
            Guid userId = Guid.Parse(_httpAccessor.HttpContext!.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            

            var chats = await _chat.GetAllByUserAsync(userId);
            
            var entitys = new List<ChatDto>();
            foreach (var chat in chats)
            {
                var member = await _member.GetByUserChat(chat.Id, userId);

                int count = member is null
                    ? 0
                    : await _messages.GetUnreadMessagesCountAsync(
                        chat.Id, member.Id, member.LastRead);

                entitys.Add(new ChatDto
                {   
                    Id = chat.Id,
                    Name = chat.Name,
                    ChatType = chat.ChatType,
                    UsersCount = chat.UsersCount,
                    UnreadCount =  count
                });
            }
            
            return ServiceResponse.Success("Successfuly get all user chats", entitys);
            
        }

        public async Task<ServiceResponse> GetMessagesAsync(Guid chatId, int limit)
        {
            var userIdClaim = _httpAccessor.HttpContext?
                .User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdClaim, out var userId))
            {
                return ServiceResponse.Fail("User is UnAuthorized", null);
            }
            
            if (!await _chat.IsUserExistInChat(userId, chatId))
            {
                return ServiceResponse.Fail("User are not in chat", null);
            }
            if (limit <= 0 || limit > 100)
            {
                limit = 50;
            }
            var messages = await _messages.GetLatestByChatAsync(chatId, limit);
            
            
            List<MessageDto> messagesList = new List<MessageDto>();
            foreach(var message in messages)
            {
                messagesList.Add(new MessageDto
                {
                    Id = message.Id,
                    ChatId = message.ChatId,
                    SenderUserId = message.Sender?.UserId,
                    MemberName = message.Sender?.ChatProfileName ?? "Profile not found",
                    Text = message.Message,
                    SentAt = message.Time,
                    IsChanged = message.IsChanged,
                    IsDeleted = message.IsDeleted,
                });
            }
            return ServiceResponse.Success("Success!", messagesList);

        }
        public async Task<ServiceResponse> ReadAsync(Guid chatId)
        {
            var userId = Guid.Parse(_httpAccessor.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier));
            if (!await _chat.IsUserExistInChat(userId, chatId))
            {
                return ServiceResponse.Fail("User is not exist in this chat", null);
            }       
            var member = await _member.GetByUserChat(chatId, userId);
            if (member == null)
            {
                return ServiceResponse.Fail("Member not in chat", null);
            }

            member.LastRead = await _messages.GetLatestMessageTimeAsync(chatId);
            bool res = await _member.UpdateAsync(member);
            if (!res)
            {
                _logger.LogError("Failed to save read marker for user {UserId} in chat {ChatId}", userId, chatId);
                return ServiceResponse.Fail("Something wrong with saving changes", null);
            }
            _logger.LogDebug("Read marker updated for user {UserId} in chat {ChatId}", userId, chatId);
            return ServiceResponse.Success("Success", null);
        }
    }
}
