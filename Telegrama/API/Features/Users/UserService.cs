using Telegrama.API.Features.Users.Dtos;
using Telegrama.Repositories.User;
using AutoMapper;
using Microsoft.AspNetCore.Identity;
using Telegrama.API.Features.Users.Auth;

namespace Telegrama.API.Features.Users
{
    public class UserService
    {
        private readonly IUserRepositoty _user;
        private readonly IMapper _mapper;
        private readonly IJwtService _jwtService;

        public UserService(IUserRepositoty user, IMapper mapper, IJwtService jwtService)
        {
            _user = user;
            _mapper = mapper;
            _jwtService = jwtService;
        }
        public async Task<ServiceResponse> CreateUserAsync(CreateUserDto dto)
        {
            if (dto == null )
            {
                return ServiceResponse.Fail("The form is empty", null);
            }
            if (await _user.IsUserEmailUnique(dto.Email))
            {
                return ServiceResponse.Fail($"The user with email: {dto.Email}, already create", null);
            }
            if (await _user.IsUserTagUnique(dto.UserTag))
            {
                return ServiceResponse.Fail($"The user with tag: {dto.UserTag}, already create", null);
            }

            var entity = _mapper.Map<UserEntity>(dto);
            
            entity.UserTag = "@" + entity.UserTag;

            var passwordHash = new PasswordHasher<UserEntity>();
            entity.Password = passwordHash.HashPassword(
                entity,
                dto.Password
                );
            


            if (entity == null)
            {
                return ServiceResponse.Fail("Something wrong", null);
            }
            await _user.AddAsync(entity);
            var response = _mapper.Map<UserDto>(entity);
            return ServiceResponse.Success("Success", response);
        }

        public async Task<ServiceResponse> LoginUserAsync(LoginUserDto dto)
        {
            if (!await _user.IsUserEmailUnique(dto.Email))
            {
                return ServiceResponse.Fail("No user with this email adress", null);
            }

            var entity = await _user.GetByEmailAsync(dto.Email);
            var result = new PasswordHasher<UserEntity>()
                .VerifyHashedPassword(
                    entity, entity.Password, dto.Password
                );
            if (result != PasswordVerificationResult.Success)
            {
                return ServiceResponse.Fail("Wrong password!", null);
            }

            var jwt = _jwtService.GenerateToken(entity);

            return ServiceResponse.Success("Successful login!", jwt);

        }

        public async Task<ServiceResponse> GetByIdAsync(Guid id)
        {
            if (id == Guid.Empty)
            {
                return ServiceResponse.Fail("Something wrong with getting user...",null);
            }
            var entity = _mapper.Map<UserDto>(await _user.GetByIdAsync(id));

            if ( entity == null )
            {
                return ServiceResponse.Fail("No user with this id", null);
            }
            return ServiceResponse.Success("Success", entity);
        }
        
    }
}
