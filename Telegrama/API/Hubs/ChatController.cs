using Microsoft.AspNetCore.Mvc;
using Telegrama.API.Data;
using Telegrama.API.Features.Chats.Dtos;

namespace Telegrama.API.Hubs
{
    [ApiController]
    [Route("api/chats")]
    public class ChatController : ControllerBase
    {
        private readonly HubService _hubService;
        public ChatController(HubService hubService)
        {
            _hubService = hubService;
        }
        [HttpPost("create")]
        public async Task<IActionResult> CreateChatAsync([FromForm]CreateChatDto dto)
        {
            var response = await _hubService.CreateChatAsync(dto.Name, dto.ChatType);
            return this.GetResult(response);
        }
        [HttpPost("join-chat")]
        public async Task<IActionResult> JoinToChatAsync(string chatId)
        {
            var response = await _hubService.JoinToChatAsync(chatId);
            return this.GetResult(response);
        }
    }
}
