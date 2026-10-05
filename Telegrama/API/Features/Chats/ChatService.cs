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

        public async Task<ServiceResponse> CreateDirectAsync(CreateDirectDto dto)
        {
            if (dto == null)
            {
                return ServiceResponse.Fail("Something wrong or user dors not exitst", null);
            }
            Guid userId = Guid.Parse(_httpAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier));



            var guestEntity = await _user.GetByIdAsync(dto.GuestId);
            var creatorEntity = await _user.GetByIdAsync(userId);
            if (guestEntity == null || guestEntity.Id == creatorEntity.Id)
            {
                return ServiceResponse.Fail("This user is not exist", null);
            }
            var guest = new ChatMemberEntity
            {
                ChatProfileName = guestEntity.Name,
                Role = ChatRoleEnum.Guest,
                UserId = dto.GuestId

            };
            var creator = new ChatMemberEntity
            {
                ChatProfileName = creatorEntity.Name,
                Role = ChatRoleEnum.Guest,
                UserId = userId

            };



            var chatEntity = new ChatEntity
            {
                Name = "Заглушка, Feat: придумати як можна відображати один в одного імена",
                ChatType = ChatsEnum.Direct,
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

            bool res = await _chat.AddAsync(chatEntity);
            if (!res)
            {
                return ServiceResponse.Fail("Something Wrong with creating chat", null);
            }
            return ServiceResponse.Success("Success", null);

            
        }
        public async Task<ServiceResponse> CreateChatAsync(string name, ChatsEnum chatType)
        {

            if (await _chat.IsChatNameExist(name) && chatType != ChatsEnum.Direct)
            {
                return ServiceResponse.Fail("Chat with this name already exist", null);
            }
            var userId = _httpAccessor.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier)!.ToString();
            var userName = _httpAccessor.HttpContext.User.FindFirstValue(ClaimTypes.Name);

            bool res = await _chat.AddAsync(new ChatEntity
            {
                Name = name,
                ChatType = chatType,
                UsersCount = 1,
                Members = new List<ChatMemberEntity>
                {
                    new ChatMemberEntity {UserId = Guid.Parse(userId), ChatProfileName = userName}
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
            if (await _chat.IsChatExist(chatId))
            {
                return ServiceResponse.Fail("This chat not exist", null);
            }
            if (!await _chat.IsUserExistInChat(userId, chatId)) return ServiceResponse.Fail("This user already in chat", null);
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
            var chats = _chat.GetAllByUserAsync(userId);
            if (chats == null) return ServiceResponse.Fail("No chats for this user", null);
            return ServiceResponse.Success("Successfuly get all user chats", chats);

        }
    }
}
