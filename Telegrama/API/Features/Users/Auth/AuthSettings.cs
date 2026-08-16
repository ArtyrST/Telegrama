namespace Telegrama.API.Features.Users.Auth
{
    public class AuthSettings
    {
        public TimeSpan Expires {  get; set; }
        public string SecretKey { get; set; }
    }
}
