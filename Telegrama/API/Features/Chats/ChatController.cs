using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Telegrama.API.Data;
using Telegrama.API.Features.Chats.Dtos;

namespace Telegrama.API.Features.Chats
{
    [Authorize]
    [ApiController]
    [Route("api/chats")]
    public class ChatController : ControllerBase
    {
        private readonly IChatService _chat;
        public ChatController(IChatService hubService)
        {
            _chat = hubService;
        }
        [HttpPost("create")]
        public async Task<IActionResult> CreateChatAsync([FromForm]CreateChatDto dto)
        {
            var response = await _chat.CreateChatAsync(dto.Name, dto.ChatType);
            return this.GetResult(response);
        }
        [HttpPost("join-chat")]
        public async Task<IActionResult> JoinToChatAsync([FromQuery] Guid chatId)
        {
            var response = await _chat.JoinToChatAsync(chatId);
            return this.GetResult(response);
        }
        [HttpPost("create-direct")]
        public async Task<IActionResult> CreateDirectAsync([FromForm]CreateDirectDto dto)
        {
            var response = await _chat.CreateDirectAsync(dto);
            return this.GetResult(response);
        }
        [HttpGet("my")]
        public async Task<IActionResult> GetAllChatsAsync()
        {
            var response = await _chat.GetAllChatsAsync();
            return this.GetResult(response);
        }
        [HttpGet("{chatId:guid}/last-messages")]
        public async Task<IActionResult> GetLastMessagesAsync([FromRoute] Guid chatId, [FromQuery]int limit = 50)
        {
            var response = await _chat.GetMessagesAsync(chatId, limit);
            return this.GetResult(response);
        }
        [HttpPost("{chatId}/read")]
        public async Task<IActionResult> Read([FromRoute] Guid chatId)
        {
            var response = await _chat.ReadAsync(chatId);
            return this.GetResult(response);
        }

    }
}
