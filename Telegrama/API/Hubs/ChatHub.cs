using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using Telegrama.API.Data;
using Telegrama.API.Extensions;
using Telegrama.Repositories.Chat;

namespace Telegrama.API.Hubs
{
    [Authorize]   
    public class ChatHub : Hub
    {
        
        private readonly IChatRepository _chatRepository;
        private readonly IHttpContextAccessor _contextAccessor;
        public ChatHub(IChatRepository chatRepository, IHttpContextAccessor contextAccessor)
        { 
            _chatRepository = chatRepository;
            _contextAccessor = contextAccessor;
        }

        public async Task JoinRoom(Guid room)
        {
            Guid userId = Context.User!.GetUserId();
            if (!await _chatRepository.IsUserExistInChat(userId, room))
            {
                throw new HubException("User not in this chat");
            }
            await Groups.AddToGroupAsync(Context.ConnectionId, room.ToString());
        }
        public async Task SendToRoom(string chatId, string message)
        {
            var name = Context.User?.FindFirst("UserName")?.Value ?? "unknown";
            await Clients.Group(chatId).SendAsync("ReceiveMessage", name, message);
        }
        public override async Task OnConnectedAsync()
        {
            Guid userId = Context.User!.GetUserId();
            var chats = await _chatRepository.GetAllByUserAsync(userId);
            foreach(var chat in chats)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, chat.Id.ToString());
            }
            await base.OnConnectedAsync();
        }
    }
}