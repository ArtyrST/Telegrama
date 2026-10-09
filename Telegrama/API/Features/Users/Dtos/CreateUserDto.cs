using System.ComponentModel.DataAnnotations;

namespace Telegrama.API.Features.Users.Dtos
{
    public class CreateUserDto
    {
        [Required]
        [MaxLength(30)]
        public string Name { get; set; } = string.Empty;
        [EmailAddress]
        [Required]
        [MaxLength(40)]
        public string Email { get; set; } = string.Empty;
        [Phone]
        [Required]
        public string PhoneNumber {  get; set; } = string.Empty;
        [Required]
        public string UserTag {  get; set; } = string.Empty;
        [Required]
        public string Password {  get; set; } = string.Empty;
    }
}
