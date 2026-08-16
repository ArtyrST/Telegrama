using AutoMapper;
using Telegrama.API.Features.Users.Dtos;

namespace Telegrama.API.Features.Users

{
    public class UserMapper : Profile
    {
        public UserMapper()
        {
            CreateMap<CreateUserDto, UserEntity>()
                .ForMember(dest => dest.Id, opt => opt.Ignore())
                .ForMember(dest => dest.Password, opt => opt.Ignore());
                

            CreateMap<UserEntity, UserDto>();
                
        }
    }
}
