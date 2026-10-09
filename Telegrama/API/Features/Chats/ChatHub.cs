using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using Telegrama.API.Data;
using Telegrama.API.Extensions;
using Telegrama.API.Features.Messages;
using Telegrama.Repositories.Chat;
using Telegrama.Repositories.Message;

namespace Telegrama.API.Features.Chats
{
    [Authorize]   
    public class ChatHub : Hub
    {
        
        private readonly IChatRepository _chatRepository;
        private readonly IHttpContextAccessor _contextAccessor;
        private readonly MessageRepository _messages;
        public ChatHub(MessageRepository messages, IChatRepository chatRepository, IHttpContextAccessor contextAccessor)
        { 
            _chatRepository = chatRepository;
            _contextAccessor = contextAccessor;
            _messages = messages;
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
            Guid userId = Context.User!.GetUserId();
            
            var entity = new MessageEntity
            {
                ChatId = Guid.Parse(chatId),
                SenderId = userId,
                Message = message,
                IsChanged = false
            };
            if (!await _chatRepository.IsUserExistInChat(userId, Guid.Parse(chatId)))
            {
                throw new HubException("User is not in this chat");
            }
            await _messages.CreateAsync(entity);
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