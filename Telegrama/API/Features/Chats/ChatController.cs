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
        private readonly ChatService _chat;
        public ChatController(ChatService hubService)
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
        public async Task<IActionResult> JoinToChatAsync(string chatId)
        {
            var response = await _chat.JoinToChatAsync(Guid.Parse(chatId));
            return this.GetResult(response);
        }
        [HttpPost("create-direct")]
        public async Task<IActionResult> CreateDirectAsync([FromForm]CreateDirectDto dto)
        {
            var response = await _chat.CreateDirectAsync(dto);
            return this.GetResult(response);
        }
    }
}
