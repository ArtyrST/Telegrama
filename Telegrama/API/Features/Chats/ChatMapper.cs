using AutoMapper;
using Telegrama.API.Features.Users;

namespace Telegrama.API.Features.Chats
{
    public class ChatMapper : Profile
    {
        public ChatMapper()
        {
            CreateMap<UserEntity, ChatMemberEntity>()
                .ForMember(dest => dest.ChatProfileName, opt => opt.Ignore())
                .ForMember(dest => dest.Role, opt => opt.Ignore());
        }
    }
}
