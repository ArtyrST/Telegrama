using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Telegrama.API.Features;
using Telegrama.Repositories.E2ee;

namespace Telegrama.API.Features.E2ee;

public sealed class E2eeService(IE2eeRepository repository, ILogger<E2eeService> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly Regex CoordinatePattern = new("^[A-Za-z0-9_-]{43}$", RegexOptions.Compiled);

    public async Task<ServiceResponse> PublishPublicKeyAsync(Guid userId, PublishE2eeKeyRequest request)
    {
        var key = request.PublicKey;
        if (!IsValidPublicKey(key))
        {
            return ServiceResponse.Fail(
                "Expected a P-256 ECDH public key.", null, StatusCodes.Status400BadRequest);
        }

        var serializedKey = JsonSerializer.Serialize(key, JsonOptions);
        var result = await repository.RegisterPublicKeyAsync(userId, serializedKey);

        if (result == PublicKeyRegistrationResult.Registered)
        {
            logger.LogInformation("E2EE public key registered for user {UserId}", userId);
        }
        else if (result == PublicKeyRegistrationResult.KeyConflict)
        {
            logger.LogWarning("User {UserId} attempted to replace an existing E2EE public key", userId);
        }

        return result switch
        {
            PublicKeyRegistrationResult.Registered =>
                ServiceResponse.Success("E2EE public key registered.", key),
            PublicKeyRegistrationResult.AlreadyRegistered =>
                ServiceResponse.Success("E2EE public key is already registered.", key),
            PublicKeyRegistrationResult.UserNotFound =>
                ServiceResponse.Fail("User not found.", null, StatusCodes.Status404NotFound),
            _ => ServiceResponse.Fail(
                "An E2EE key is already registered for this account.", null, StatusCodes.Status409Conflict)
        };
    }

    public async Task<ServiceResponse> GetPeerPublicKeyAsync(Guid chatId, Guid requesterId)
    {
        var lookup = await repository.GetPeerPublicKeyAsync(chatId, requesterId);
        if (lookup.Status == PeerPublicKeyLookupStatus.RequesterNotMember)
        {
            logger.LogWarning("User {UserId} attempted to retrieve an E2EE peer key for chat {ChatId} without membership",
                requesterId, chatId);
        }
        else if (lookup.Status == PeerPublicKeyLookupStatus.InvalidMemberCount)
        {
            logger.LogError("Direct chat {ChatId} has an invalid member count during E2EE key lookup", chatId);
        }
        switch (lookup.Status)
        {
            case PeerPublicKeyLookupStatus.ChatNotFound:
                return ServiceResponse.Fail("Direct chat not found.", null, StatusCodes.Status404NotFound);
            case PeerPublicKeyLookupStatus.NotDirectChat:
                return ServiceResponse.Fail("E2EE key exchange is only available in direct chats.", null,
                    StatusCodes.Status400BadRequest);
            case PeerPublicKeyLookupStatus.RequesterNotMember:
                return ServiceResponse.Fail("User is not a member of this direct chat.", null,
                    StatusCodes.Status403Forbidden);
            case PeerPublicKeyLookupStatus.InvalidMemberCount:
                return ServiceResponse.Fail("Direct chat must have exactly two members.", null,
                    StatusCodes.Status409Conflict);
            case PeerPublicKeyLookupStatus.PeerKeyNotRegistered:
                return ServiceResponse.Fail("The other user has not registered an E2EE key yet.", null,
                    StatusCodes.Status409Conflict);
        }

        E2eePublicKeyDto? publicKey;
        try
        {
            publicKey = JsonSerializer.Deserialize<E2eePublicKeyDto>(lookup.PublicKeyJson!, JsonOptions);
        }
        catch (JsonException)
        {
            publicKey = null;
        }

        if (!IsValidPublicKey(publicKey))
        {
            return ServiceResponse.Fail("The other user's E2EE key is invalid.", null,
                StatusCodes.Status500InternalServerError);
        }

        return ServiceResponse.Success("Peer E2EE public key retrieved.",
            new PeerE2eeKeyDto(lookup.PeerUserId!.Value, publicKey!));
    }

    private static bool IsValidPublicKey(E2eePublicKeyDto? key) =>
        key is not null &&
        key.Kty == "EC" &&
        key.Crv == "P-256" &&
        CoordinatePattern.IsMatch(key.X) &&
        CoordinatePattern.IsMatch(key.Y);
}
