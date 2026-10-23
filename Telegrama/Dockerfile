FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

WORKDIR /src

COPY ["Telegrama/Telegrama.csproj", "Telegrama/"]

RUN dotnet restore "Telegrama/Telegrama.csproj"

COPY . .

WORKDIR /src/Telegrama

RUN dotnet publish "Telegrama.csproj" \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false


FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled-extra AS runtime

WORKDIR /app

COPY --from=build /app/publish .

ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_HTTP_PORTS=8080

USER $APP_UID

EXPOSE 8080

ENTRYPOINT ["dotnet", "Telegrama.dll"]
