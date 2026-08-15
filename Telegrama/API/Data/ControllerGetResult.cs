using Microsoft.AspNetCore.Mvc;
using Telegrama.API.Features;

namespace Telegrama.API.Data
{
    public static class ControllerGetResult
    {
        public static IActionResult GetResult(this ControllerBase controller, ServiceResponse response)
        {
            return response.IsSuccess
                ? controller.Ok(response)
                : controller.BadRequest(response);
        }
    }
}
