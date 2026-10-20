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
            if (string.IsNullOrWhiteSpace(message))
            {
                throw new HubException("Message is empty"); 
            }
            message = message.Trim();
            if (message.Length > 2000)
            {
                throw new HubException("Message is too long");
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
        public async Task EditMessage(Guid chatId, Guid messageId, string newText)
        {
            Guid userId = Context.User!.GetUserId();
            var member = await _member.GetByUserChat(chatId, userId);

            if (member is null)
            {
                throw new HubException("User not in this chat");
            }

            var message = await _messages.GetByIdAsync(messageId);

            if (message == null)
            {
                throw new HubException("No find this message");
            }
            if (message.ChatId != chatId)
            {
                throw new HubException("Message not in chat");
            }
            if (message.SenderId != member.Id)
            {
                throw new HubException("You can only edit your own messages");
            }
            
            if (string.IsNullOrWhiteSpace(newText))
            {
                throw new HubException("text is empty");
            }
            if (message.IsDeleted)
            {
                throw new HubException("You cant edit deleted message");
            }
            newText = newText.Trim();
            if (newText.Length > 2000)
            {
                throw new HubException("This message is too long");
            }
            message.Message = newText;
            message.IsChanged = true;
            bool res = await _messages.UpdateAsync(message);
            if (!res)
            {
                throw new HubException("Something wrong with updating message");
            }
            var dto = new MessageDto
            {
                Id = message.Id,
                ChatId = message.ChatId,
                MemberName = member.ChatProfileName,
                Text = message.Message,
                SentAt = message.Time,
                IsChanged = true,
                IsDeleted = false
            };

            await Clients.Group(chatId.ToString()).SendAsync("MessageEdited", dto);

        }
        public async Task DeleteMessageAsync(Guid chatId, Guid messageId)
        {
            Guid userId = Context.User!.GetUserId();
            var member = await _member.GetByUserChat(chatId, userId);

            if (member is null)
            {
                throw new HubException("User not in this chat");
            }

            var message = await _messages.GetByIdAsync(messageId);
            if (message == null)
            {
                throw new HubException("No find this message");
            }
            if (message.ChatId != chatId)
            {
                throw new HubException("Message not in chat");
            }
            if (message.SenderId != member.Id)
            {
                throw new HubException("You can only delete your own messages");
            }
            if (message.IsDeleted)
            {
                throw new HubException("You cant delete already deleted message");
            }
            message.Message = "";
            message.IsDeleted = true;
            bool res = await _messages.UpdateAsync(message);
            if (!res)
            {
                throw new HubException("Something wrong with updating");
            }
            var dto = new MessageDto
            {
                Id = message.Id,
                ChatId = message.ChatId,
                MemberName = member.ChatProfileName,
                Text = message.Message,
                SentAt = message.Time,
                IsChanged = false,
                IsDeleted = true
            };

            await Clients.Group(chatId.ToString()).SendAsync("MessageDeleted", dto);


        }
    }
}