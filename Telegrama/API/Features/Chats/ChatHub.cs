using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.IdentityModel.Tokens.Experimental;
using System.Security.Claims;
using System.Text.RegularExpressions;
using Telegrama.API.Data;
using Telegrama.API.Extensions;
using Telegrama.API.Features.Chats.Dtos;
using Telegrama.API.Features.Messages;
using Telegrama.Repositories.Chat;
using Telegrama.Repositories.Message;
using Telegrama.Repositories.User;

namespace Telegrama.API.Features.Chats
{
    [Authorize]   
    public class ChatHub : Hub
    {
        
        private readonly IChatRepository _chatRepository;
        //private readonly IHttpContextAccessor _contextAccessor;
        private readonly IMessageRepository _messages;
        private readonly IChatMemberRepository _member;
        public ChatHub(IChatMemberRepository member, IMessageRepository messages, IChatRepository chatRepository)
        { 
            _chatRepository = chatRepository;                            
            _messages = messages;
            _member = member;
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
        public async Task SendToRoom(Guid chatId, string message)
        {
            Guid userId = Context.User!.GetUserId();
            if (string.IsNullOrEmpty(message) || message.Length > 2000)
            {
                throw new HubException("Message is empty"); 
            }
            var member = await _member.GetByUserChat(chatId, userId);
            if (member == null)
            {
                throw new HubException("User not in room or not found");
            }
            var entity = new MessageEntity
            {
                ChatId = chatId,
                SenderId = member.Id,
                Message = message,
                IsChanged = false
            };
            
            bool res = await _messages.CreateAsync(entity);
            if (!res)
            {
                throw new HubException("Fail with sending message");
            }
            var name = Context.User?.FindFirst("UserName")?.Value ?? "unknown";
            var dto = new MessageDto
            {
                Id = entity.Id,
                ChatId = chatId,
                MemberName = member.ChatProfileName,
                Text = message,
                SentAt = entity.Time    
            };

            await Clients.Group(chatId.ToString()).SendAsync("ReceiveMessage", dto);
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
        public async Task Typing(Guid chatId)
        {
            Guid userId = Context.User!.GetUserId();

            var member = await _member.GetByUserChat(chatId, userId);

            if (member == null)
            {
                throw new HubException("User not in this chat");
            }
            await Clients.OthersInGroup(chatId.ToString()).SendAsync(
                    "UserTyping",
                    new
                    {
                        chatId,
                        userId,
                        member.ChatProfileName
                    }
                );
        }
    }
}