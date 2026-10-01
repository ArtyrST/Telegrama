using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Telegrama.API.Hubs
{
    [Authorize]   
    public class ChatHub : Hub
    {

        public Task JoinRoom(string room) =>
            Groups.AddToGroupAsync(Context.ConnectionId, room);

        public async Task SendToRoom(string room, string message)
        {
            var name = Context.User?.FindFirst("UserName")?.Value ?? "unknown";
            await Clients.Group(room).SendAsync("ReceiveMessage", name, message);
        }
    }
}