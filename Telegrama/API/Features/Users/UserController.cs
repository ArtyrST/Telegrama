using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Telegrama.API.Data;
using Telegrama.API.Features.Users.Dtos;
using Telegrama.API.Features.Users.Auth;

namespace Telegrama.API.Features.Users
{
    [ApiController]
    [Route("api/users")]
    public class UserController : ControllerBase
    {
        private readonly UserService _user;
        private readonly IWebHostEnvironment _environment;
        private const string RefreshCookieName = "telegrama_refresh";
        private const string RefreshCookiePath = "/api/users/session";

        public UserController(UserService user, IWebHostEnvironment environment)
        {
            _user = user;
            _environment = environment;
        }
        [HttpPost("register")]
        public async Task<IActionResult> CreateAsync([FromForm]CreateUserDto dto)
        {
            var user = await _user.CreateUserAsync(dto);
            return this.GetResult(user);
        }
        [HttpPost("login")]
        public async Task<IActionResult> LoginAsync([FromForm]LoginUserDto dto)
        {
            var response = await _user.LoginUserAsync(dto);
            if (response.IsSuccess && response.PayLoad is RefreshTokenGrant tokens)
            {
                SetRefreshCookie(tokens.RefreshToken, tokens.RefreshTokenExpiresAt);
                response.PayLoad = tokens.AccessToken;
            }
            return this.GetResult(response);
        }

        [HttpPost("session/refresh")]
        public async Task<IActionResult> RefreshAsync()
        {
            var response = await _user.RefreshSessionAsync(Request.Cookies[RefreshCookieName]);
            if (response.IsSuccess && response.PayLoad is RefreshTokenGrant tokens)
            {
                SetRefreshCookie(tokens.RefreshToken, tokens.RefreshTokenExpiresAt);
                response.PayLoad = tokens.AccessToken;
            }
            return this.GetResult(response);
        }

        [HttpPost("session/logout")]
        public async Task<IActionResult> LogoutAsync()
        {
            var response = await _user.LogoutAsync(Request.Cookies[RefreshCookieName]);
            ClearRefreshCookie();
            return this.GetResult(response);
        }
        [HttpPost("verify-email")]
        public async Task<IActionResult> VerifyEmailAsync([FromForm] VerifyEmailDto dto)
        {
            var response = await _user.VerifyEmailAsync(dto);
            return this.GetResult(response);
        }
        [HttpPost("resend-verification")]
        public async Task<IActionResult> ResendVerificationAsync([FromForm] ResendVerificationDto dto)
        {
            var response = await _user.ResendVerificationAsync(dto);
            return this.GetResult(response);
        }
        [Authorize]
        [HttpGet("by-tag")]
        public async Task<IActionResult> GetByTagAsync([FromQuery] string tag)
        {
            var response = await _user.GetByTagAsync(tag);
            return this.GetResult(response);
        }

        private void SetRefreshCookie(string token, DateTimeOffset expiresAt)
        {
            Response.Cookies.Append(RefreshCookieName, token, new CookieOptions
            {
                HttpOnly = true,
                Secure = !_environment.IsDevelopment() || Request.IsHttps,
                SameSite = SameSiteMode.Strict,
                Path = RefreshCookiePath,
                Expires = expiresAt,
                IsEssential = true
            });
        }

        private void ClearRefreshCookie()
        {
            Response.Cookies.Delete(RefreshCookieName, new CookieOptions
            {
                HttpOnly = true,
                Secure = !_environment.IsDevelopment() || Request.IsHttps,
                SameSite = SameSiteMode.Strict,
                Path = RefreshCookiePath,
                IsEssential = true
            });
        }
    }
}
