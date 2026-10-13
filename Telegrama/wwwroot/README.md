# Telegrama backend test client

Це простий браузерний клієнт для ручної перевірки API та SignalR. Він не використовує React, Vite чи окремий frontend-сервер: ASP.NET Core віддає файли з `wwwroot` на кореневій адресі сайту.

## Запуск

Запусти проєкт `Telegrama` у Visual Studio або виконай з кореня репозиторію:

```powershell
dotnet run --project .\Telegrama\Telegrama.csproj --launch-profile http
```

Відкрий `http://localhost:5022/`. Для HTTPS профілю адреса — `https://localhost:7198/`.

Бібліотека SignalR JS завантажується з CDN, тому браузеру потрібен доступ до інтернету. API-виклики й SignalR ідуть на той самий origin, що й сторінка.

## Сценарій перевірки чату

1. Зареєструй або увійди першим користувачем.
2. Відкрий той самий сайт в іншому профілі браузера або в приватному вікні та увійди другим користувачем.
3. На першій сесії знайди другого користувача за тегом і створи direct-чат.
4. В обох сесіях відкрий direct-чат і надішли повідомлення. Нові повідомлення мають з’являтися через SignalR; історія завантажується при відкритті чату.

Також сторінка дозволяє створити групу, приєднатися до групи за її GUID, оновити список чатів і переглядати журнал HTTP/SignalR подій.

## API, який використовує сторінка

- `POST /api/users/register`
- `POST /api/users/login`
- `GET /api/users/by-tag?tag=...`
- `GET /api/chats/my`
- `POST /api/chats/create`
- `POST /api/chats/create-direct`
- `POST /api/chats/join-chat?chatId=...`
- `GET /api/chats/{chatId}/last-messages?limit=50`
- SignalR hub `/hubs/chat`: `JoinRoom`, `SendToRoom`, `ReceiveMessage`

JWT зберігається в `localStorage` браузера для зручності тестування. Кнопка виходу видаляє локально збережений токен.
