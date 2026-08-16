namespace Telegrama.API.Features.Users.Auth
{
    public interface IJwtService
    {
        public string GenerateToken(UserEntity user);
    }
}
