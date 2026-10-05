using System.Security.Claims;

namespace Telegrama.API.Extensions
{
    public static class ClaimsExtensions
    {
        public static Guid GetUserId(this ClaimsPrincipal user) =>
            Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    }
}