using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Telegrama.API.Data;
using Telegrama.API.Features.Users.Dtos;

namespace Telegrama.API.Features.Users
{
    [ApiController]
    [Route("api/users")]
    public class UserController : ControllerBase
    {
        private readonly UserService _user;
        public UserController(UserService user)
        {
            _user = user;
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
            var user = await _user.LoginUserAsync(dto);
            return this.GetResult(user);
        }
        [Authorize]
        [HttpGet("test-get")]
        public async Task<IActionResult> Test()
        {
            var response = new ServiceResponse
            {
                IsSuccess = true,
                Message = "good",
                PayLoad = ":)"
            };
            return this.GetResult(response);
        }
    }
}
