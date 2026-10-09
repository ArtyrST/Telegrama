using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using System.Text;
using Telegrama.API.Data;
using Telegrama.API.Features.Users;
using Telegrama.API.Features.Users.Auth;
using Telegrama.Repositories.Chat;
using Telegrama.Repositories.User;
using Microsoft.OpenApi;
using Telegrama.API.Features.Chats;

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
            builder.Services.AddScoped<IChatService, ChatService>();

            //repository
            builder.Services.AddScoped<IUserRepositoty, UserRepository>();
            builder.Services.AddScoped<IChatRepository, ChatRepository>();

            //Settings
            builder.Services.Configure<AuthSettings>(builder.Configuration.GetSection("AuthSettings"));

            // Add services to the container.

            builder.Services.AddSignalR();
            builder.Services.AddHttpContextAccessor();
            builder.Services.AddAutoMapper(cfg => { }, typeof(UserMapper));

            builder.Services.AddControllers();
            // Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
            builder.Services.AddOpenApi(options =>
            {
                options.AddDocumentTransformer((document, context, ct) =>
                {
                    // 1. Описуємо схему: «Bearer-токен у заголовку Authorization»
                    document.Components ??= new OpenApiComponents();
                    document.Components.SecuritySchemes = new Dictionary<string, IOpenApiSecurityScheme>
                    {
                        ["Bearer"] = new OpenApiSecurityScheme
                        {
                            Type = SecuritySchemeType.Http,
                            Scheme = "bearer",
                            BearerFormat = "JWT",
                            In = ParameterLocation.Header
                        }
                    };

                    // 2. Вимагаємо її для всіх ендпоінтів
                    foreach (var operation in document.Paths.Values.SelectMany(p => p.Operations!))
                    {
                        operation.Value.Security ??= [];
                        operation.Value.Security.Add(new OpenApiSecurityRequirement
                        {
                            [new OpenApiSecuritySchemeReference("Bearer", document)] = []
                        });
                    }

                    return Task.CompletedTask;
                });
            });

            builder.Services.AddDbContext<AppDbContext>(options =>
            {
                options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"));
            });

            var auth = builder.Configuration.GetSection("AuthSettings").Get<AuthSettings>()!;

            builder.Services
                .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(options =>
                {
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateIssuer = true,
                        ValidIssuer = auth.Issuer,
                        ValidateAudience = true,
                        ValidAudience = auth.Audience,
                        ValidateLifetime = true,
                        ValidateIssuerSigningKey = true,
                        IssuerSigningKey = new SymmetricSecurityKey(
                            Encoding.UTF8.GetBytes(auth.SecretKey)),
                        ClockSkew = TimeSpan.Zero   // за замовчуванням токен «живе» ще +5 хв
                    };

                    // Для SignalR: браузерний WebSocket не вміє слати заголовок Authorization,
                    // тому токен приходить у ?access_token=...
                    options.Events = new JwtBearerEvents
                    {
                        OnMessageReceived = context =>
                        {
                            var token = context.Request.Query["access_token"];
                            if (!string.IsNullOrEmpty(token) &&
                                context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                            {
                                context.Token = token;
                            }
                            return Task.CompletedTask;
                        }
                    };
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
            app.UseDefaultFiles();
            app.UseStaticFiles();
            app.MapHub<ChatHub>("/hubs/chat");
            app.UseHttpsRedirection();

            app.UseAuthentication();
            app.UseAuthorization();


            app.MapControllers();

            app.Run();
        }
    }
}
