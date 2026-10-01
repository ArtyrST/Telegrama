using Microsoft.AspNetCore.SignalR;

namespace Telegrama.API.Hubs
{
    public class ChatHub : Hub
    {
        public async Task JoinRoom(string room)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, room); 
        }

        public async Task SendToRoom(string room, string user, string message)
        {
            await Clients.Group(room).SendAsync("ReceiveMessage", user, message);
        }
    }
}
