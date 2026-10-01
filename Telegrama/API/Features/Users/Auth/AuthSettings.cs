namespace Telegrama.API.Features.Users.Auth
{
    public class AuthSettings
    {
        public TimeSpan Expires {  get; set; }
        public string SecretKey { get; set; } = string.Empty;   
        public string Issuer { get; set; } = string.Empty;
        public string Audience { get; set; } = string.Empty;
    }
}
