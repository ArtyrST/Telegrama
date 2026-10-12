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
        public ChatService(IMessageRepository messages, ILogger<ChatService> logger, IChatRepository chat, IHttpContextAccessor httpAccessor, IUserRepositoty user, IMapper mapper)
        {
            _chat = chat;
            _httpAccessor = httpAccessor;
            _user = user;
            _mapper = mapper;
            _logger = logger;
            _messages = messages;
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
                && pg.ConstraintName == "IX_Chats_Name";
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
                Name = "Заглушка",
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
                return ServiceResponse.Fail("This direct already exist", null);
            }
            try
            {
                bool res = await _chat.AddAsync(chatEntity);
                if (!res)
                {
                    return ServiceResponse.Fail("Something Wrong with creating chat", null);
                }
                return ServiceResponse.Success("Success", null);
            }
            catch (DbUpdateException ex) when (
                ex.GetBaseException() is PostgresException pg &&
                pg.SqlState == PostgresErrorCodes.UniqueViolation &&
                pg.ConstraintName == "IX_Chats_DirectKey")
            {
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

            if (await _chat.IsChatNameExist(name))
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

                return ServiceResponse.Success("Чат успішно створено", null);
            }
            catch (DbUpdateException ex) when (IsChatNameConflict(ex))
            {
                return ServiceResponse.Fail("Чат із такою назвою вже існує", null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create chat {ChatName}", name);
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
            if (await _chat.IsUserExistInChat(userId, chatId)) return ServiceResponse.Fail("This user already in chat", null);
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
                return ServiceResponse.Fail("This user already in chat", null);
            }

            if (!res)
            {
                return ServiceResponse.Fail("Something wrong with joining to chat", null);
            }

            return ServiceResponse.Success("Success", null);
        }
        public async Task<ServiceResponse> GetAllChatsAsync()
        {
            Guid userId = Guid.Parse(_httpAccessor.HttpContext!.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var chats = await _chat.GetAllByUserAsync(userId);
            var entitys = new List<ChatDto>();
            foreach (var chat in chats)
            {
                entitys.Add(new ChatDto
                {
                    Id = chat.Id,
                    Name = chat.Name,
                    ChatType = chat.ChatType,
                    UsersCount = chat.UsersCount
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
                    MemberName = message.Sender?.ChatProfileName ?? "Profile not found",
                    Text = message.Message,
                    SentAt = message.Time
                });
            }
            return ServiceResponse.Success("Success!", messagesList);

        }
    }
}
