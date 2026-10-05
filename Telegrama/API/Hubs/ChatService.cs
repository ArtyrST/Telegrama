using Telegrama.API.Features;
using Telegrama.API.Features.Chats;
using Telegrama.API.Features.Chats.Enums;
using Telegrama.Repositories.Chat;
using System.Security.Claims;
using Telegrama.Repositories.User;

namespace Telegrama.API.Hubs
{
    public class ChatService
    {
        private readonly IChatRepository _chat;
        private readonly IHttpContextAccessor _httpContext;
        private readonly IUserRepositoty _user;
        public ChatService(IChatRepository chat, IHttpContextAccessor httpContext, IUserRepositoty user)
        {
            _chat = chat;
            _httpContext = httpContext;
            _user = user;
        }

        public async Task<ServiceResponse> CreateChatAsync(string name, ChatsEnum chatType)
        {
            if (await _chat.IsChatNameExist(name))
            {
                return ServiceResponse.Fail("Chat with this name already exist", null);
            }
            var userId = _httpContext.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier).ToString();
            var userName = _httpContext.HttpContext.User.FindFirstValue(ClaimTypes.Name);

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

        public async Task<ServiceResponse> JoinToChatAsync(string chatId)
        {
            var userId = _httpContext.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier);
            var entity = await _user.GetByIdAsync(userId);
            if (entity == null)
            {
                return ServiceResponse.Fail("This user not found(((", null);
            }
            if (!await _chat.IsChatExist(chatId))
            {
                return ServiceResponse.Fail("This chat not exist", null);
            }
            if (!await _chat.IsUserExistInChat(chatId, userId)) return ServiceResponse.Fail("This user already in chat", null);
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
    }
}
