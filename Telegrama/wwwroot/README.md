# Telegrama Frontend Tester

Це простий frontend без React/Vite/Node. Він працює прямо через ASP.NET Core static files.

## Як встановити

Скопіюй:

- `index.html`
- `css/styles.css`
- `js/app.js`

у папку:

`Telegrama/Telegrama/wwwroot/`

Структура:

wwwroot/
├── index.html
├── css/
│   └── styles.css
└── js/
    └── app.js

Після цього запускай ASP.NET API.

Відкрий:

http://localhost:5022/

або HTTPS:

https://localhost:7198/

## Що вже перевіряє

- POST `/api/users/register`
- POST `/api/users/login`
- JWT зберігається у localStorage
- GET `/api/users/test-get` з Bearer token
- GET `/api/chats/my`
- POST `/api/chats/create`
- SignalR `/hubs/chat`
- `JoinRoom`
- `SendToRoom`
- `ReceiveMessage`

## Важливо

Backend зараз має кілька місць, які фронт не може виправити:

1. `ChatHub` використовує `MessageRepository`, але в `Program.cs` немає його DI registration:
   `builder.Services.AddScoped<MessageRepository>();`

2. `JoinToChatAsync` у `ChatService` схоже має перевернуті умови:
   `IsChatExist` та `IsUserExistInChat`.

3. GET історії повідомлень ще немає, тому frontend показує тільки повідомлення, які прийшли через SignalR після підключення.

4. `/api/chats/my` повертає EF entities. Якщо з'явиться JSON cycle exception через navigation properties, краще зробити `ChatDto`.

Цей frontend спеціально зроблений як тестовий стенд, а не як фінальний UI.
