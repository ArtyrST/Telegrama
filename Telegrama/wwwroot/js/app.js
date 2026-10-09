const state = {
    token: localStorage.getItem("telegrama_token"),
    user: JSON.parse(localStorage.getItem("telegrama_user") || "null"),
    chats: [],
    activeChat: null,
    connection: null
};

const $ = id => document.getElementById(id);

function log(message, data = null) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    $("log").textContent += line + (data ? "\n" + JSON.stringify(data, null, 2) : "") + "\n\n";
    $("log").scrollTop = $("log").scrollHeight;
}

function setStatus(text, online = false) {
    $("connectionText").textContent = text;
    $("connectionDot").className = `dot ${online ? "online" : "offline"}`;
}

function saveAuth(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem("telegrama_token", token);
    localStorage.setItem("telegrama_user", JSON.stringify(user));
}

function clearAuth() {
    state.token = null;
    state.user = null;
    localStorage.removeItem("telegrama_token");
    localStorage.removeItem("telegrama_user");
}

async function api(url, options = {}) {
    const headers = options.headers || {};
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    options.headers = headers;

    const response = await fetch(url, options);
    const text = await response.text();

    let data;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

    $("apiStatus").textContent = `${response.status} ${response.statusText}`;
    log(`${options.method || "GET"} ${url} → ${response.status}`, data);

    if (!response.ok) throw new Error(data?.message || `HTTP ${response.status}`);
    return data;
}

function formBody(values) {
    const body = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => body.append(key, value));
    return body;
}

function showAuthenticated() {
    $("authPanel").classList.add("hidden");
    $("userPanel").classList.remove("hidden");
    $("welcome").classList.add("hidden");
    $("chatView").classList.remove("hidden");

    const name = state.user?.name || "User";
    $("userName").textContent = name;
    $("userTag").textContent = state.user?.userTag || "";
    $("userAvatar").textContent = name.charAt(0).toUpperCase();
    $("screenTitle").textContent = "Чати";
    $("screenSubtitle").textContent = "JWT авторизація активна";

    loadChats();
    connectSignalR();
}

function showLoggedOut() {
    $("authPanel").classList.remove("hidden");
    $("userPanel").classList.add("hidden");
    $("welcome").classList.remove("hidden");
    $("chatView").classList.add("hidden");
    $("screenTitle").textContent = "Авторизація";
    $("screenSubtitle").textContent = "Підключення до Telegrama API";
    setStatus("Не підключено");
}

async function login(email, password) {
    const data = await api("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ Email: email, Password: password })
    });

    if (!data.isSuccess) throw new Error(data.message);

    const token = data.payLoad;
    const claims = decodeJwt(token);

    saveAuth(token, {
        name: claims.UserName || "User",
        userTag: claims.UserTag || "",
        id: claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] || ""
    });

    showAuthenticated();
}

async function register(values) {
    const data = await api("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody(values)
    });

    if (!data.isSuccess) throw new Error(data.message);

    log("Реєстрація успішна. Тепер виконуємо login...");
    await login(values.Email, values.Password);
}

async function loadChats() {
    try {
        const data = await api("/api/chats/my");
        state.chats = data.payLoad || [];
        renderChats();
    } catch (e) {
        $("chatList").innerHTML = `<div class="empty">Не вдалося отримати чати.<br>${escapeHtml(e.message)}</div>`;
    }
}

function renderChats() {
    if (!state.chats.length) {
        $("chatList").innerHTML = `<div class="empty">Чатів поки немає.</div>`;
        return;
    }

    $("chatList").innerHTML = state.chats.map((chat, index) => `
    <button class="chat-item ${state.activeChat?.id === chat.id ? "active" : ""}" data-index="${index}">
      <strong>${escapeHtml(chat.name || "Без назви")}</strong>
      <small>${chat.chatType ?? "?"} · ${chat.usersCount ?? 0} учасників</small>
    </button>
  `).join("");

    document.querySelectorAll(".chat-item").forEach(btn => {
        btn.addEventListener("click", () => selectChat(state.chats[Number(btn.dataset.index)]));
    });
}

async function createChat(name, chatType) {
    const data = await api("/api/chats/create", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ Name: name, ChatType: chatType })
    });

    if (!data.isSuccess) throw new Error(data.message);
    await loadChats();
}

async function testJwt() {
    await api("/api/users/test-get");
    alert("JWT працює: /api/users/test-get повернув 200.");
}

async function connectSignalR() {
    if (!state.token || !window.signalR) return;

    if (state.connection) {
        try {
            await state.connection.stop();
        } catch { }
    }

    state.connection = new signalR.HubConnectionBuilder()
        .withUrl("/hubs/chat", {
            accessTokenFactory: () => state.token
        })
        .withAutomaticReconnect()
        .build();

    state.connection.on("ReceiveMessage", (name, message) => {
        addMessage(name, message);
    });

    state.connection.onreconnecting(() => {
        setStatus("SignalR: перепідключення...");
    });

    state.connection.onreconnected(() => {
        setStatus("SignalR: підключено", true);
    });

    state.connection.onclose(() => {
        setStatus("SignalR: відключено");
    });

    try {
        await state.connection.start();
        setStatus("SignalR: підключено", true);
        log("SignalR connection established");
    } catch (e) {
        setStatus("SignalR: помилка");
        log("SignalR error", e.message);
    }
}

async function selectChat(chat) {
    state.activeChat = chat;
    $("activeChatName").textContent = chat.name || "Чат";
    $("activeChatId").textContent = chat.id || "";
    $("messages").innerHTML = `<div class="empty">Історія повідомлень ще не має GET endpoint у backend.<br>Нові повідомлення прийдуть через SignalR.</div>`;
    $("messageInput").disabled = false;
    $("messageForm button").disabled = false;
    $("joinRoomBtn").classList.remove("hidden");
    renderChats();

    if (state.connection && state.connection.state === "Connected") {
        try {
            await state.connection.invoke("JoinRoom", chat.id);
            log(`Joined SignalR room ${chat.id}`);
        } catch (e) {
            log("JoinRoom error", e.message);
        }
    }
}

async function sendMessage(message) {
    if (!state.connection || state.connection.state !== "Connected") {
        throw new Error("SignalR не підключений");
    }

    if (!state.activeChat) throw new Error("Оберіть чат");

    await state.connection.invoke("SendToRoom", state.activeChat.id, message);
}

function addMessage(name, message) {
    const empty = $("messages").querySelector(".empty");
    if (empty) empty.remove();

    const item = document.createElement("div");
    item.className = "message";

    item.innerHTML = `
    <div class="sender">${escapeHtml(name)}</div>
    <div class="text">${escapeHtml(message)}</div>
    <div class="time">${new Date().toLocaleTimeString()}</div>
  `;

    $("messages").appendChild(item);
    $("messages").scrollTop = $("messages").scrollHeight;
}

function decodeJwt(token) {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");

    return JSON.parse(
        decodeURIComponent(
            atob(normalized).split("").map(c =>
                "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
            ).join("")
        )
    );
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[c]));
}

document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        $("loginForm").classList.toggle("hidden", tab.dataset.tab !== "login");
        $("registerForm").classList.toggle("hidden", tab.dataset.tab !== "register");
    });
});

$("loginForm").addEventListener("submit", async e => {
    e.preventDefault();

    try {
        await login($("loginEmail").value, $("loginPassword").value);
    } catch (err) {
        alert(err.message);
    }
});

$("registerForm").addEventListener("submit", async e => {
    e.preventDefault();

    try {
        await register({
            Name: $("regName").value,
            Email: $("regEmail").value,
            PhoneNumber: $("regPhone").value,
            UserTag: $("regTag").value.replace(/^@/, ""),
            Password: $("regPassword").value
        });
    } catch (err) {
        alert(err.message);
    }
});

$("createChatForm").addEventListener("submit", async e => {
    e.preventDefault();

    try {
        await createChat($("chatName").value, $("chatType").value);
        $("chatName").value = "";
        alert("Чат створено.");
    } catch (err) {
        alert(err.message);
    }
});

$("messageForm").addEventListener("submit", async e => {
    e.preventDefault();

    const input = $("messageInput");
    const text = input.value.trim();

    if (!text) return;

    try {
        await sendMessage(text);
        input.value = "";
    } catch (err) {
        alert(err.message);
    }
});

$("testAuthBtn").addEventListener("click", async () => {
    try {
        await testJwt();
    } catch (e) {
        alert(e.message);
    }
});

$("refreshChatsBtn").addEventListener("click", loadChats);

$("logoutBtn").addEventListener("click", async () => {
    if (state.connection) {
        try {
            await state.connection.stop();
        } catch { }
    }

    clearAuth();
    showLoggedOut();
});

$("clearLogBtn").addEventListener("click", () => {
    $("log").textContent = "";
    $("apiStatus").textContent = "—";
});

$("joinRoomBtn").addEventListener("click", async () => {
    if (!state.activeChat) return;

    try {
        await state.connection.invoke("JoinRoom", state.activeChat.id);
        log(`Joined room manually: ${state.activeChat.id}`);
    } catch (e) {
        alert(e.message);
    }
});

if (state.token) {
    try {
        showAuthenticated();
    } catch {
        clearAuth();
        showLoggedOut();
    }
} else {
    showLoggedOut();
}