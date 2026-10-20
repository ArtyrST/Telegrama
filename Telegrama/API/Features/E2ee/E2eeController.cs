using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Telegrama.API.Data;
using Telegrama.API.Extensions;

namespace Telegrama.API.Features.E2ee;

[Authorize]
[ApiController]
[Route("api/e2ee")]
public sealed class E2eeController(E2eeService e2ee) : ControllerBase
{
    [HttpPut("public-key")]
    public async Task<IActionResult> PublishPublicKey([FromBody] PublishE2eeKeyRequest request)
    {
        var response = await e2ee.PublishPublicKeyAsync(User.GetUserId(), request);
        return this.GetResult(response);
    }

    [HttpGet("chats/{chatId:guid}/peer-key")]
    public async Task<IActionResult> GetPeerPublicKey([FromRoute] Guid chatId)
    {
        var response = await e2ee.GetPeerPublicKeyAsync(chatId, User.GetUserId());
        return this.GetResult(response);
    }
}
