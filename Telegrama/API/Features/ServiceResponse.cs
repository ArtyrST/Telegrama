namespace Telegrama.API.Features
{
    public class ServiceResponse
    {
        public bool IsSuccess { get; set; }
        public string Message { get; set; } = string.Empty;
        public object? PayLoad { get; set; }
        public int statusCode { get; set; } = 200;

        public static ServiceResponse Success(string message, object? obj)
        {
            return new ServiceResponse
            {
                IsSuccess = true,
                Message = message,
                PayLoad = obj,
                statusCode = 200
            };
        }
        public static ServiceResponse Fail(string? message, object? obj, int statusCode = 400)
        {
            return new ServiceResponse
            {
                IsSuccess = false,
                Message = message,
                PayLoad = obj,
                statusCode = statusCode
            };
        }
    }
}
