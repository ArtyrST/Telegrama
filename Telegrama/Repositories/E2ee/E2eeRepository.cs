using Microsoft.EntityFrameworkCore;
using Telegrama.API.Data;
using Telegrama.API.Features.Chats.Enums;

namespace Telegrama.Repositories.E2ee;

public sealed class E2eeRepository(AppDbContext db) : IE2eeRepository
{
    public async Task<PublicKeyRegistrationResult> RegisterPublicKeyAsync(Guid userId, string publicKeyJson)
    {
        // Compare-and-set prevents simultaneous first-time registrations from
        // silently replacing each other.
        var updated = await db.Users
            .Where(user => user.Id == userId && user.E2eePublicKey == null)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(user => user.E2eePublicKey, publicKeyJson));

        if (updated == 1)
        {
            return PublicKeyRegistrationResult.Registered;
        }

        var currentKey = await db.Users
            .Where(user => user.Id == userId)
            .Select(user => user.E2eePublicKey)
            .SingleOrDefaultAsync();

        if (currentKey is null)
        {
            var userExists = await db.Users.AnyAsync(user => user.Id == userId);
            return userExists
                ? PublicKeyRegistrationResult.KeyConflict
                : PublicKeyRegistrationResult.UserNotFound;
        }

        return currentKey == publicKeyJson
            ? PublicKeyRegistrationResult.AlreadyRegistered
            : PublicKeyRegistrationResult.KeyConflict;
    }

    public async Task<PeerPublicKeyLookup> GetPeerPublicKeyAsync(Guid chatId, Guid requesterId)
    {
        var chat = await db.Chats
            .Include(item => item.Members)
            .SingleOrDefaultAsync(item => item.Id == chatId);

        if (chat is null)
        {
            return new(PeerPublicKeyLookupStatus.ChatNotFound);
        }

        if (chat.ChatType != ChatsEnum.Direct)
        {
            return new(PeerPublicKeyLookupStatus.NotDirectChat);
        }

        var members = chat.Members;
        if (members.All(member => member.UserId != requesterId))
        {
            return new(PeerPublicKeyLookupStatus.RequesterNotMember);
        }

        if (members.Count != 2)
        {
            return new(PeerPublicKeyLookupStatus.InvalidMemberCount);
        }

        var peerUserId = members.Single(member => member.UserId != requesterId).UserId;
        var publicKeyJson = await db.Users
            .Where(user => user.Id == peerUserId)
            .Select(user => user.E2eePublicKey)
            .SingleOrDefaultAsync();

        return publicKeyJson is null
            ? new(PeerPublicKeyLookupStatus.PeerKeyNotRegistered)
            : new(PeerPublicKeyLookupStatus.Found, peerUserId, publicKeyJson);
    }
}
