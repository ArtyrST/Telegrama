using System.ComponentModel.DataAnnotations;

namespace Telegrama.API.Features.Users.Dtos;

public sealed class VerifyEmailDto
{
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    [RegularExpression("^\\d{6}$", ErrorMessage = "Verification code must contain 6 digits.")]
    public string Code { get; set; } = string.Empty;
}

public sealed class ResendVerificationDto
{
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;
}
