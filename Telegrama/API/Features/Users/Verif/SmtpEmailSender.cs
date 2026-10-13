using System.Net;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace Telegrama.API.Features.Users.Verif;

public sealed class SmtpEmailSender : IEmailSender
{
    private readonly EmailSettings _settings;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(
        IOptions<EmailSettings> settings,
        ILogger<SmtpEmailSender> logger)
    {
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task SendVerificationCodeAsync(string recipient, string recipientName, string code)
    {
        if (string.IsNullOrWhiteSpace(_settings.Host)
            || string.IsNullOrWhiteSpace(_settings.Email)
            || string.IsNullOrWhiteSpace(_settings.Password))
        {
            throw new InvalidOperationException("Email SMTP settings are not configured.");
        }

        await using var templateStream = typeof(SmtpEmailSender).Assembly
            .GetManifestResourceStream("Telegrama.EmailTemplates.verification-email.html")
            ?? throw new InvalidOperationException("Verification email template is missing from the application.");
        using var reader = new StreamReader(templateStream);
        var template = await reader.ReadToEndAsync();
        var html = template
            .Replace("{{Name}}", WebUtility.HtmlEncode(recipientName), StringComparison.Ordinal)
            .Replace("{{Code}}", WebUtility.HtmlEncode(code), StringComparison.Ordinal)
            .Replace("{{Minutes}}", "10", StringComparison.Ordinal);

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_settings.SenderName, _settings.Email));
        message.To.Add(MailboxAddress.Parse(recipient));
        message.Subject = "Підтвердження електронної пошти — Телеграма";
        message.Body = new BodyBuilder
        {
            HtmlBody = html,
            TextBody = $"Вітаємо, {recipientName}! Код підтвердження Телеграма: {code}. Він дійсний 10 хвилин."
        }.ToMessageBody();

        using var client = new SmtpClient();
        try
        {
            await client.ConnectAsync(_settings.Host, _settings.Port, SecureSocketOptions.StartTls);
            await client.AuthenticateAsync(_settings.Email, _settings.Password);
            await client.SendAsync(message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send verification email to {Email}", recipient);
            throw;
        }
        finally
        {
            if (client.IsConnected)
            {
                try
                {
                    await client.DisconnectAsync(true);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "SMTP disconnect failed after sending verification email");
                }
            }
        }
    }
}
