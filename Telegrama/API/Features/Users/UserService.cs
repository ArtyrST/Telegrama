using Telegrama.API.Features.Users.Dtos;
using Telegrama.Repositories.User;
using AutoMapper;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Telegrama.API.Features.Users.Auth;
using Microsoft.Extensions.Logging;
using Npgsql;
using Microsoft.AspNetCore.Http;
using Telegrama.API.Features.Users.Verif;

namespace Telegrama.API.Features.Users
{
    public class UserService
    {
        private readonly IUserRepositoty _user;
        private readonly IMapper _mapper;
        private readonly IJwtService _jwtService;
        private readonly ILogger<UserService> _logger;
        private readonly VerifUserService _verification;

        public UserService(IUserRepositoty user, IMapper mapper, IJwtService jwtService, ILogger<UserService> logger, VerifUserService verification)
        {
            _user = user;
            _mapper = mapper;
            _jwtService = jwtService;
            _logger = logger;
            _verification = verification;
        }
        public async Task<ServiceResponse> CreateUserAsync(CreateUserDto dto)
        {
            if (dto == null )
            {
                return ServiceResponse.Fail("The form is empty", null);
            }
            dto.Email = dto.Email.Trim().ToLowerInvariant();
            dto.UserTag = dto.UserTag.Trim().TrimStart('@').ToLowerInvariant();
            if (await _user.EmailUnique(dto.Email))
            {
                return ServiceResponse.Fail($"The user with email: {dto.Email}, already create", null);
            }
            if (await _user.TagUnique(dto.UserTag))
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
            try
            {
                bool res = await _user.AddAsync(entity);
                if (!res)
                {
                    return ServiceResponse.Fail("Не вдалось створити обліковий запис", null);
                }
                
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex, "IX_Users_Email"))
            {
                return ServiceResponse.Fail("The user with this email already exists", null);
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex, "IX_Users_UserTag"))
            {
                return ServiceResponse.Fail("This user tag is already taken", null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Registration failed for email {Email}", dto.Email);
                throw;
            }

            var emailResult = await _verification.SendCodeAsync(entity);
            if (emailResult != VerificationEmailSendResult.Sent)
            {
                return ServiceResponse.Fail(
                    "Account created, but the verification email could not be sent. Request a new code.",
                    null,
                    emailResult == VerificationEmailSendResult.Cooldown
                        ? StatusCodes.Status429TooManyRequests
                        : StatusCodes.Status503ServiceUnavailable);
            }

            return ServiceResponse.Success("Account created. Verification code sent to your email.", null);
        }

        private static bool IsUniqueViolation(DbUpdateException ex, string indexName)
        {
            return ex.GetBaseException() is PostgresException pg
                && pg.SqlState == PostgresErrorCodes.UniqueViolation
                && pg.ConstraintName == indexName;
        }

        public async Task<ServiceResponse> LoginUserAsync(LoginUserDto dto)
        {
            var entity = await _user.GetByEmailAsync(dto.Email.Trim().ToLowerInvariant());
            if (entity == null)
            {
                return ServiceResponse.Fail("Invalid credentials", null);
            }
            var result = new PasswordHasher<UserEntity>()
                .VerifyHashedPassword(
                    entity, entity.Password, dto.Password
                );
            if (result != PasswordVerificationResult.Success)
            {
                return ServiceResponse.Fail("Invalid credentials", null);
            }

            if (entity.Code?.IsVerified != true)
            {
                return ServiceResponse.Fail("Verify your email before logging in.", null, StatusCodes.Status403Forbidden);
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
        public async Task<ServiceResponse> GetByTagAsync(string tag)
        {
            tag = tag?.Trim() ?? string.Empty;

            if (tag.StartsWith('@'))
            {
                tag = tag[1..];
            }

            if (string.IsNullOrWhiteSpace(tag))
            {
                return ServiceResponse.Fail("The tag is empty", null);
            }
            var user = await _user.GetByTagAsync(tag);
            if (user ==  null)
            {
                return ServiceResponse.Fail("Failed to get this user", null);
            }
            var response = new UserTagSearchDto
            {
                Id = user.Id,
                Name = user.Name,
                UserTag = user.UserTag
            };

            return ServiceResponse.Success("Success", response);
        }

        public async Task<ServiceResponse> VerifyEmailAsync(VerifyEmailDto dto)
        {
            return await _verification.VerifyAsync(dto);
        }

        public async Task<ServiceResponse> ResendVerificationAsync(ResendVerificationDto dto)
        {
            var email = dto.Email.Trim().ToLowerInvariant();
            var user = await _user.GetByEmailAsync(email);

            if (user is not null && user.Code?.IsVerified != true)
            {
                var sendResult = await _verification.SendCodeAsync(user);
                if (sendResult == VerificationEmailSendResult.Cooldown)
                {
                    return ServiceResponse.Fail("Wait at least 60 seconds before requesting another code.", null, StatusCodes.Status429TooManyRequests);
                }
                if (sendResult == VerificationEmailSendResult.Failed)
                {
                    return ServiceResponse.Fail(
                        "Unable to send verification email. Check the SMTP configuration and try again.",
                        null,
                        StatusCodes.Status503ServiceUnavailable);
                }
            }

            return ServiceResponse.Success(
                "If an unverified account exists for this email, a new code has been sent.",
                null);
        }
        
    }
}
