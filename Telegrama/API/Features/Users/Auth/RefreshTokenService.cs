using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Telegrama.API.Data;

namespace Telegrama.API.Features.Users.Auth
{
    public sealed class RefreshTokenService : IRefreshTokenService
    {
        private readonly AppDbContext _db;
        private readonly IJwtService _jwtService;
        private readonly AuthSettings _settings;
        private readonly ILogger<RefreshTokenService> _logger;

        public RefreshTokenService(
            AppDbContext db,
            IJwtService jwtService,
            IOptions<AuthSettings> settings,
            ILogger<RefreshTokenService> logger)
        {
            _db = db;
            _jwtService = jwtService;
            _settings = settings.Value;
            _logger = logger;
        }

        public async Task<RefreshTokenGrant> CreateAsync(
            UserEntity user,
            CancellationToken cancellationToken = default)
        {
            var now = DateTimeOffset.UtcNow;
            var rawToken = CreateRawToken();
            var expiresAt = now.Add(_settings.RefreshTokenExpires);

            _db.RefreshTokens.Add(new RefreshTokenEntity
            {
                UserId = user.Id,
                TokenHash = HashToken(rawToken),
                CreatedAt = now,
                ExpiresAt = expiresAt
            });
            await _db.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Refresh-token session created for user {UserId}", user.Id);

            return new RefreshTokenGrant(
                _jwtService.GenerateToken(user),
                rawToken,
                expiresAt);
        }

        public async Task<RefreshTokenGrant?> RotateAsync(
            string refreshToken,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(refreshToken)) return null;

            var now = DateTimeOffset.UtcNow;
            var oldHash = HashToken(refreshToken);
            await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);

            var current = await _db.RefreshTokens
                .Include(token => token.User)
                .SingleOrDefaultAsync(token => token.TokenHash == oldHash, cancellationToken);

            if (current is null || current.RevokedAt is not null || current.ExpiresAt <= now)
            {
                _logger.LogDebug("Refresh-token rotation rejected because token is invalid or expired");
                return null;
            }

            var newRawToken = CreateRawToken();
            var newHash = HashToken(newRawToken);
            var newExpiresAt = now.Add(_settings.RefreshTokenExpires);

            // Conditional update makes a refresh token single-use, including parallel refresh requests.
            var revoked = await _db.RefreshTokens
                .Where(token => token.Id == current.Id
                    && token.RevokedAt == null
                    && token.ExpiresAt > now)
                .ExecuteUpdateAsync(updates => updates
                    .SetProperty(token => token.RevokedAt, now)
                    .SetProperty(token => token.ReplacedByTokenHash, newHash), cancellationToken);

            if (revoked != 1)
            {
                _logger.LogDebug("Concurrent refresh-token rotation lost the single-use update race for user {UserId}",
                    current.UserId);
                return null;
            }

            _db.RefreshTokens.Add(new RefreshTokenEntity
            {
                UserId = current.UserId,
                TokenHash = newHash,
                CreatedAt = now,
                ExpiresAt = newExpiresAt
            });
            await _db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            _logger.LogInformation("Refresh token rotated for user {UserId}", current.UserId);

            return new RefreshTokenGrant(
                _jwtService.GenerateToken(current.User),
                newRawToken,
                newExpiresAt);
        }

        public async Task RevokeAsync(
            string refreshToken,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(refreshToken)) return;

            var hash = HashToken(refreshToken);
            var now = DateTimeOffset.UtcNow;
            var revoked = await _db.RefreshTokens
                .Where(token => token.TokenHash == hash && token.RevokedAt == null)
                .ExecuteUpdateAsync(updates => updates
                    .SetProperty(token => token.RevokedAt, now), cancellationToken);
            if (revoked > 0)
            {
                _logger.LogInformation("Refresh-token session revoked");
            }
        }

        private static string CreateRawToken() =>
            Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(64));

        private static string HashToken(string token) =>
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    }
}
