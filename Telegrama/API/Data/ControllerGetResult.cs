using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Telegrama.API.Features;

namespace Telegrama.API.Data
{
    public static class ControllerGetResult
    {
        public static IActionResult GetResult(this ControllerBase controller, ServiceResponse response)
        {
            
            if (response.IsSuccess)
            {
                return controller.Ok(response);
            }
            return controller.StatusCode(response.statusCode, response);
        }
    }
}
