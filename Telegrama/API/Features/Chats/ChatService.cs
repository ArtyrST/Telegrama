using AutoMapper;
using System.Security.Claims;
using Telegrama.API.Features.Chats.Dtos;
using Telegrama.API.Features.Chats.Enums;
using Telegrama.API.Features.Users;
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



            var guestEntity = await _user.GetByIdAsync(dto.GuestId.ToString());
            var creatorEntity = await _user.GetByIdAsync(userId.ToString());
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
    }
}
