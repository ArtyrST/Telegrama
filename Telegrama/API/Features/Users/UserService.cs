using Telegrama.API.Features.Users.Dtos;
using Telegrama.Repositories.User;
using AutoMapper;

namespace Telegrama.API.Features.Users
{
    public class UserService
    {
        private readonly IUserRepositoty _user;
        private readonly IMapper _mapper;

        public UserService(IUserRepositoty user, IMapper mapper   )
        {
            _user = user;
            _mapper = mapper;
        }
        public async Task<ServiceResponse> CreateUserAsync(CreateUserDto dto)
        {
            if (dto == null )
            {
                return ServiceResponse.Fail("The form is empty", null);
            }
            var entity = _mapper.Map<UserEntity>(dto);
            if (entity == null)
            {
                return ServiceResponse.Fail("Something wrong", null);
            }
            await _user.AddAsync(entity);
            return ServiceResponse.Success("Success", dto);
        }
    }
}
