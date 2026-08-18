using Microsoft.EntityFrameworkCore;
using Telegrama.API.Data;
using Telegrama.API.Features.Users;
using Telegrama.API.Features.Users.Auth;
using Telegrama.Repositories.Chat;
using Telegrama.Repositories.User;

namespace Telegrama.API
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);
            //services
            builder.Services.AddScoped<UserService>();
            builder.Services.AddScoped<IJwtService, JwtService>();

            //repository
            builder.Services.AddScoped<IUserRepositoty, UserRepository>();
            builder.Services.AddScoped<IChatRepository, ChatRepository>();

            //Settings
            builder.Services.Configure<AuthSettings>(builder.Configuration.GetSection("AuthSettings"));
            
            // Add services to the container.



            builder.Services.AddAutoMapper(cfg => { }, typeof(UserMapper));

            builder.Services.AddControllers();
            // Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
            builder.Services.AddOpenApi();

            builder.Services.AddDbContext<AppDbContext>(options =>
            {
                options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"));
            });

            var app = builder.Build();

            // Configure the HTTP request pipeline.
            if (app.Environment.IsDevelopment())
            {
                app.MapOpenApi();
                app.UseSwaggerUI(options =>
                {
                    options.SwaggerEndpoint("/openapi/v1.json", "Telegrama API v1");
                });
            }

            app.UseHttpsRedirection();

            app.UseAuthorization();


            app.MapControllers();

            app.Run();
        }
    }
}
