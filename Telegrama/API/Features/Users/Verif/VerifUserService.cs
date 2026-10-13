using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Telegrama.API.Features.Users.Dtos;
using Telegrama.Repositories.User;

namespace Telegrama.API.Features.Users.Verif;

public sealed class VerifUserService
{
    private const int CodeLifetimeMinutes = 10;
    private const int MaxAttempts = 5;

    private readonly IVerifCodeRepository _codes;
    private readonly IEmailSender _emailSender;
    private readonly ILogger<VerifUserService> _logger;

    public VerifUserService(
        IVerifCodeRepository codes,
        IEmailSender emailSender,
        ILogger<VerifUserService> logger)
    {
        _codes = codes;
        _emailSender = emailSender;
        _logger = logger;
    }

    public async Task<VerificationEmailSendResult> SendCodeAsync(UserEntity user)
    {
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var verification = await _codes.GetByUserIdAsync(user.Id);
        var now = DateTimeOffset.UtcNow;

        if (verification?.LastSentAt is { } lastSentAt && lastSentAt > now.AddSeconds(-60))
        {
            return VerificationEmailSendResult.Cooldown;
        }

        if (verification is null)
        {
            verification = new VerifCodeEntity { UserId = user.Id };
        }

        verification.CodeHash = HashCode(code);
        verification.IsVerified = false;
        verification.IsUsed = false;
        verification.AttemptCount = 0;
        verification.ExpiresAt = now.AddMinutes(CodeLifetimeMinutes);
        verification.LastSentAt = now;

        await _codes.SaveAsync(verification);

        try
        {
            await _emailSender.SendVerificationCodeAsync(user.Email, user.Name, code);
            return VerificationEmailSendResult.Sent;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Verification email could not be sent for user {UserId}", user.Id);
            return VerificationEmailSendResult.Failed;
        }
    }

    public async Task<ServiceResponse> VerifyAsync(VerifyEmailDto dto)
    {
        var email = dto.Email.Trim().ToLowerInvariant();
        var verification = await _codes.GetByEmailAsync(email);

        if (verification is null)
        {
            return InvalidCodeResponse();
        }

        if (verification.IsVerified)
        {
            return ServiceResponse.Success("Email is already verified.", null);
        }

        if (verification.IsUsed || verification.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            return ServiceResponse.Fail("Verification code is expired. Request a new code.", null);
        }

        if (verification.AttemptCount >= MaxAttempts)
        {
            return ServiceResponse.Fail("Too many attempts. Request a new code.", null, StatusCodes.Status429TooManyRequests);
        }

        verification.AttemptCount++;
        var suppliedHash = Convert.FromHexString(HashCode(dto.Code.Trim()));
        byte[] storedHash;
        try
        {
            storedHash = Convert.FromHexString(verification.CodeHash);
        }
        catch (FormatException)
        {
            await _codes.SaveAsync(verification);
            return InvalidCodeResponse();
        }

        var isValid = CryptographicOperations.FixedTimeEquals(storedHash, suppliedHash);
        if (isValid)
        {
            verification.IsVerified = true;
            verification.IsUsed = true;
        }

        await _codes.SaveAsync(verification);

        if (!isValid)
        {
            return verification.AttemptCount >= MaxAttempts
                ? ServiceResponse.Fail("Too many attempts. Request a new code.", null, StatusCodes.Status429TooManyRequests)
                : InvalidCodeResponse();
        }

        return ServiceResponse.Success("Email verified. You can now log in.", null);
    }

    private static string HashCode(string code)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(code)));
    }

    private static ServiceResponse InvalidCodeResponse()
    {
        return ServiceResponse.Fail("Verification code is invalid.", null);
    }
}
