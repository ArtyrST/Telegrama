using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.IdentityModel.Tokens.Experimental;
using System.Security.Claims;
using System.Text.RegularExpressions;
using Telegrama.API.Data;
using Telegrama.API.Extensions;
using Telegrama.API.Features.Chats.Dtos;
using Telegrama.API.Features.Chats.Enums;
using Telegrama.API.Features.Messages;
using Telegrama.Repositories.Chat;
using Telegrama.Repositories.Message;
using Telegrama.Repositories.User;

namespace Telegrama.API.Features.Chats
{
    [Authorize]   
    public class ChatHub : Hub
    {
        private const string E2eeEnvelopePrefix = "TG-E2EE:v1:";
        private const int MaxPlaintextMessageLength = 2000;
        private const int MaxEncryptedPayloadLength = 16000;
        
        private readonly IChatRepository _chatRepository;
        //private readonly IHttpContextAccessor _contextAccessor;
        private readonly IMessageRepository _messages;
        private readonly IChatMemberRepository _member;
        private readonly ILogger<ChatHub> _logger;
        public ChatHub(
            IChatMemberRepository member,
            IMessageRepository messages,
            IChatRepository chatRepository,
            ILogger<ChatHub> logger)
        { 
            _chatRepository = chatRepository;                            
            _messages = messages;
            _member = member;
            _logger = logger;
        }

        public async Task JoinRoom(Guid room)
        {
            Guid userId = Context.User!.GetUserId();
            if (!await _chatRepository.IsUserExistInChat(userId, room))
            {
                _logger.LogWarning("User {UserId} attempted to join SignalR group for chat {ChatId} without membership",
                    userId, room);
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
            var chat = await _chatRepository.GetByIdAsync(chatId);
            if (chat is null)
            {
                throw new HubException("This chat not exist");
            }
            var member = await _member.GetByUserChat(chatId, userId);
            if (member == null)
            {
                _logger.LogWarning("User {UserId} attempted to send a message to chat {ChatId} without membership",
                    userId, chatId);
                throw new HubException("User not in room or not found");
            }
            ValidateMessagePayload(chat, message);
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
                _logger.LogError("Message persistence failed for user {UserId} in chat {ChatId}", userId, chatId);
                throw new HubException("Fail with sending message");
            }
            var name = Context.User?.FindFirst("UserName")?.Value ?? "unknown";
            var dto = new MessageDto
            {
                Id = entity.Id,
                ChatId = chatId,
                SenderUserId = userId,
                MemberName = member.ChatProfileName,
                Text = message,
                SentAt = entity.Time    
            };

            await Clients.Group(chatId.ToString()).SendAsync("ReceiveMessage", dto);
            _logger.LogInformation("Message {MessageId} sent by user {UserId} to chat {ChatId}",
                entity.Id, userId, chatId);
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
                _logger.LogWarning("User {UserId} attempted to send a typing event to chat {ChatId} without membership",
                    userId, chatId);
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
                _logger.LogWarning("User {UserId} attempted to edit a message in chat {ChatId} without membership",
                    userId, chatId);
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
                _logger.LogWarning("User {UserId} attempted to edit another member's message {MessageId} in chat {ChatId}",
                    userId, messageId, chatId);
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
            var chat = await _chatRepository.GetByIdAsync(chatId);
            if (chat is null)
            {
                throw new HubException("This chat not exist");
            }
            ValidateMessagePayload(chat, newText);
            message.Message = newText;
            message.IsChanged = true;
            bool res = await _messages.UpdateAsync(message);
            if (!res)
            {
                _logger.LogError("Message edit persistence failed for message {MessageId} by user {UserId}",
                    messageId, userId);
                throw new HubException("Something wrong with updating message");
            }
            var dto = new MessageDto
            {
                Id = message.Id,
                ChatId = message.ChatId,
                SenderUserId = userId,
                MemberName = member.ChatProfileName,
                Text = message.Message,
                SentAt = message.Time,
                IsChanged = true,
                IsDeleted = false
            };

            await Clients.Group(chatId.ToString()).SendAsync("MessageEdited", dto);
            _logger.LogInformation("Message {MessageId} edited by user {UserId} in chat {ChatId}",
                messageId, userId, chatId);

        }
        public async Task DeleteMessageAsync(Guid chatId, Guid messageId)
        {
            Guid userId = Context.User!.GetUserId();
            var member = await _member.GetByUserChat(chatId, userId);

            if (member is null)
            {
                _logger.LogWarning("User {UserId} attempted to delete a message in chat {ChatId} without membership",
                    userId, chatId);
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
                _logger.LogWarning("User {UserId} attempted to delete another member's message {MessageId} in chat {ChatId}",
                    userId, messageId, chatId);
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
                _logger.LogError("Message deletion persistence failed for message {MessageId} by user {UserId}",
                    messageId, userId);
                throw new HubException("Something wrong with updating");
            }
            var dto = new MessageDto
            {
                Id = message.Id,
                ChatId = message.ChatId,
                SenderUserId = userId,
                MemberName = member.ChatProfileName,
                Text = message.Message,
                SentAt = message.Time,
                IsChanged = false,
                IsDeleted = true
            };

            await Clients.Group(chatId.ToString()).SendAsync("MessageDeleted", dto);
            _logger.LogInformation("Message {MessageId} deleted by user {UserId} in chat {ChatId}",
                messageId, userId, chatId);


        }

        private static void ValidateMessagePayload(ChatEntity? chat, string payload)
        {
            var isEncrypted = payload.StartsWith(E2eeEnvelopePrefix, StringComparison.Ordinal);
            if (chat?.ChatType == ChatsEnum.Direct)
            {
                if (!isEncrypted)
                {
                    throw new HubException("Direct chat messages must be end-to-end encrypted");
                }

                if (payload.Length > MaxEncryptedPayloadLength)
                {
                    throw new HubException("Encrypted message is too long");
                }

                return;
            }

            if (isEncrypted)
            {
                throw new HubException("End-to-end encryption is currently available only in direct chats");
            }

            if (payload.Length > MaxPlaintextMessageLength)
            {
                throw new HubException("Message is too long");
            }
        }
    }
}
