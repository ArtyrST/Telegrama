namespace Telegrama.API.Features.Users.Auth
{
    public sealed record RefreshTokenGrant(
        string AccessToken,
        string RefreshToken,
        DateTimeOffset RefreshTokenExpiresAt);
}
