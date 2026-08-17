using Microsoft.Extensions.Options;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using System.Text;

namespace Telegrama.API.Features.Users.Auth
{
    public class JwtService(IOptions<AuthSettings> options) : IJwtService
    {
        public string GenerateToken(UserEntity user)
        {
            var claims = new List<Claim>()
            {
                new Claim("UserName", user.Name),
                new Claim("UserTag", user.UserTag),
                new Claim("UserId", user.Id.ToString())

            };
            var jwtToken = new JwtSecurityToken
                (
                expires: DateTime.UtcNow.Add(options.Value.Expires),
                claims: claims,
                signingCredentials: new SigningCredentials
                    (
                    new SymmetricSecurityKey
                        (
                            Encoding.UTF8.GetBytes(options.Value.SecretKey)
                        ), 
                        SecurityAlgorithms.HmacSha256
                    )

                );

            return new JwtSecurityTokenHandler().WriteToken(jwtToken);
        }
    }
}
