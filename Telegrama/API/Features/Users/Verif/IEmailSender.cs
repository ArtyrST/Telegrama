namespace Telegrama.API.Features.Users.Verif;

public interface IEmailSender
{
    Task SendVerificationCodeAsync(string recipient, string recipientName, string code);
}
