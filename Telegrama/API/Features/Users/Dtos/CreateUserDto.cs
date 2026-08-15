namespace Telegrama.API.Features.Users.Dtos
{
    public class CreateUserDto
    {
        public string Name { get; set; } = string.Empty;
        public string email { get; set; } = string.Empty;
        public string PhoneNumber {  get; set; } = string.Empty;
    }
}
