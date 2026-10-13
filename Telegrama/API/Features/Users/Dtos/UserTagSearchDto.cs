namespace Telegrama.API.Features.Users.Dtos
{
    public class UserTagSearchDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string UserTag { get; set; } = string.Empty;
    }
}
