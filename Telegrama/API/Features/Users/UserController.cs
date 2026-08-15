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
        [HttpPost]
        public async Task<IActionResult> CreateAsync(CreateUserDto dto)
        {
            var user = await _user.CreateUserAsync(dto);
            return this.GetResult(user);
        }
    }
}
