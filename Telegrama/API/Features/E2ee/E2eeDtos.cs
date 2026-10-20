namespace Telegrama.API.Features.E2ee;

public sealed class PublishE2eeKeyRequest
{
    public E2eePublicKeyDto PublicKey { get; set; } = new();
}

public sealed record E2eePublicKeyDto(string Kty = "", string Crv = "", string X = "", string Y = "");

public sealed record PeerE2eeKeyDto(Guid UserId, E2eePublicKeyDto PublicKey);
