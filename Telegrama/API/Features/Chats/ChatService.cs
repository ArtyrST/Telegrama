using AutoMapper;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Telegrama.API.Data;
using Telegrama.API.Features.Chats.Dtos;
using Telegrama.API.Features.Chats.Enums;
using Telegrama.Repositories.Chat;
using Telegrama.Repositories.User;

namespace Telegrama.API.Features.Chats
{
    public class ChatService : IChatService
    {
        private readonly IChatRepository _chat;
        private readonly IHttpContextAccessor _httpAccessor;
        private readonly IUserRepositoty _user;
        private readonly IMapper _mapper;
        public ChatService(IChatRepository chat, IHttpContextAccessor httpAccessor, IUserRepositoty user, IMapper mapper)
        {
            _chat = chat;
            _httpAccessor = httpAccessor;
            _user = user;
            _mapper = mapper;
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
            catch (DbUpdateException)
            {
                return ServiceResponse.Fail("This direct already exist", null);
            }
            
        }
        public async Task<ServiceResponse> CreateChatAsync(string name, ChatsEnum chatType)
        {

            if (await _chat.IsChatNameExist(name) || chatType == ChatsEnum.Direct)
            {
                return ServiceResponse.Fail("Chat with this name already exist", null);
            }
            if (name.Length > 50 || string.IsNullOrEmpty(name) || name.Length < 3)
            {
                return ServiceResponse.Fail("Name is not in good form :(", null);
            }
            var userId = _httpAccessor.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier)!.ToString();
            var userName = _httpAccessor.HttpContext.User.FindFirstValue("UserName");

            bool res = await _chat.AddAsync(new ChatEntity
            {
                Name = name,
                ChatType = chatType,
                UsersCount = 1,
                Members = new List<ChatMemberEntity>
                {
                    new ChatMemberEntity {UserId = Guid.Parse(userId), ChatProfileName = userName, Role = ChatRoleEnum.Owner}
                }
            });
            if (!res)
            {
                return ServiceResponse.Fail("Something wrong with creating chat", null);
            }
            return ServiceResponse.Success("Successfuly create a chat", null);

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
            bool res = await _chat.JoinChatAsync(member, chatId);
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
            if (entitys == null) return ServiceResponse.Fail("No chats for this user", null);
            return ServiceResponse.Success("Successfuly get all user chats", entitys);

        }
    }
}
