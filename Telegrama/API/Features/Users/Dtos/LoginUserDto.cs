using System.ComponentModel.DataAnnotations;

namespace Telegrama.API.Features.Users.Dtos
{
    public class LoginUserDto
    {
        [EmailAddress]
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }
}
