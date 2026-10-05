using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Telegrama.API.Features;

namespace Telegrama.API.Hubs
{
    [Authorize]   
    public class ChatHub : Hub
    {
        private readonly ChatService _hubService;
        public ChatHub(ChatService hubService)
        {
            _hubService = hubService;
        }

        public Task JoinRoom(string room) =>
            Groups.AddToGroupAsync(Context.ConnectionId, room);

        public async Task SendToRoom(string chatId, string message)
        {
            var name = Context.User?.FindFirst("UserName")?.Value ?? "unknown";
            await Clients.Group(chatId).SendAsync("ReceiveMessage", name, message);
        }
    }
}