using System.ComponentModel.DataAnnotations;

namespace Telegrama.API.Features.Users.Dtos
{
    public class CreateUserDto
    {
        public string Name { get; set; } = string.Empty;
        [EmailAddress]
        public string Email { get; set; } = string.Empty;
        [Phone]
        public string PhoneNumber {  get; set; } = string.Empty;
        public string UserTag {  get; set; } = string.Empty;
        public string Password {  get; set; } = string.Empty;
    }
}
