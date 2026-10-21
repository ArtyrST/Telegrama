
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src


COPY ["Telegrama/Telegrama.csproj", "Telegrama/"]
RUN dotnet restore "Telegrama/Telegrama.csproj"


COPY . .
WORKDIR /src/Telegrama
RUN dotnet publish "Telegrama.csproj" -c Release -o /app/publish /p:UseAppHost=false


FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app


COPY --from=build /app/publish .


ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080


ENTRYPOINT ["dotnet", "Telegrama.dll"]