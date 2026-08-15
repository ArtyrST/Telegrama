namespace Telegrama.API.Features
{
    public class ServiceResponse
    {
        public bool IsSuccess { get; set; }
        public string Message { get; set; } = string.Empty;
        public object? PayLoad { get; set; }

        public static ServiceResponse Success(string message, object? obj)
        {
            return new ServiceResponse
            {
                IsSuccess = true,
                Message = message,
                PayLoad = obj,
            };
        }
        public static ServiceResponse Fail(string? message, object? obj)
        {
            return new ServiceResponse
            {
                IsSuccess = false,
                Message = message,
                PayLoad = obj,
            };
        }
    }
}
