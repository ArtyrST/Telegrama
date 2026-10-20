namespace Telegrama.Repositories.E2ee;

public interface IE2eeRepository
{
    Task<PublicKeyRegistrationResult> RegisterPublicKeyAsync(Guid userId, string publicKeyJson);
    Task<PeerPublicKeyLookup> GetPeerPublicKeyAsync(Guid chatId, Guid requesterId);
}

public enum PublicKeyRegistrationResult
{
    Registered,
    AlreadyRegistered,
    UserNotFound,
    KeyConflict
}

public enum PeerPublicKeyLookupStatus
{
    Found,
    ChatNotFound,
    NotDirectChat,
    RequesterNotMember,
    InvalidMemberCount,
    PeerKeyNotRegistered
}

public sealed record PeerPublicKeyLookup(
    PeerPublicKeyLookupStatus Status,
    Guid? PeerUserId = null,
    string? PublicKeyJson = null);
