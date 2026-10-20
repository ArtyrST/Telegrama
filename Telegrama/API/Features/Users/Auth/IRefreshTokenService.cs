namespace Telegrama.API.Features.Users.Auth
{
    public interface IRefreshTokenService
    {
        Task<RefreshTokenGrant> CreateAsync(UserEntity user, CancellationToken cancellationToken = default);
        Task<RefreshTokenGrant?> RotateAsync(string refreshToken, CancellationToken cancellationToken = default);
        Task RevokeAsync(string refreshToken, CancellationToken cancellationToken = default);
    }
}
