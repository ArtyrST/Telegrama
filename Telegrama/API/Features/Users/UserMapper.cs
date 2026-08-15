using AutoMapper;
using Telegrama.API.Features.Users.Dtos;

namespace Telegrama.API.Features.Users

{
    public class UserMapper : Profile
    {
        public UserMapper()
        {
            CreateMap<CreateUserDto, UserEntity>()
                .ForMember(dest => dest.Id, opt => opt.Ignore());
        }
    }
}
