const state = {
    token: localStorage.getItem("telegrama_token"),
    user: readSavedUser(),
    chats: [],
    activeChat: null,
    connection: null
};
let resendCooldownTimer = null;

const $ = id => document.getElementById(id);

function readSavedUser() {
    try { return JSON.parse(localStorage.getItem("telegrama_user") || "null"); }
    catch { return null; }
}

function log(message, data = null) {
    const box = $("log");
    const detail = data === null ? "" : `\n${JSON.stringify(data, null, 2)}`;
    box.textContent += `[${new Date().toLocaleTimeString()}] ${message}${detail}\n\n`;
    box.scrollTop = box.scrollHeight;
}

function setConnection(text, online = false) {
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
    const headers = new Headers(options.headers || {});
    if (state.token) headers.set("Authorization", `Bearer ${state.token}`);

    const response = await fetch(url, { ...options, headers });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; }
    catch { data = text; }

    $("apiStatus").textContent = `API: ${response.status} ${response.statusText}`;
    log(`${options.method || "GET"} ${url} → ${response.status}`, data);

    if (!response.ok || data?.isSuccess === false) {
        const validation = data?.errors ? Object.values(data.errors).flat().join("; ") : "";
        const error = new Error(data?.message || data?.title || validation || `HTTP ${response.status}`);
        error.statusCode = response.status;
        throw error;
    }
    return data;
}

function formBody(values) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) body.append(key, value ?? "");
    return body;
}

function payloadOf(response) {
    return response?.payLoad ?? response?.PayLoad ?? null;
}

function showAuthenticated() {
    $("authPanel").classList.add("hidden");
    $("userPanel").classList.remove("hidden");
    $("welcome").classList.add("hidden");
    $("chatView").classList.remove("hidden");

    const name = state.user?.name || "Користувач";
    $("userName").textContent = name;
    $("userTag").textContent = state.user?.userTag || "";
    $("userAvatar").textContent = name.charAt(0).toUpperCase();
    $("screenTitle").textContent = "Мої чати";
    $("screenSubtitle").textContent = "Авторизовано через JWT · SignalR підключається";

    loadChats();
    connectSignalR();
}

function showLoggedOut() {
    $("authPanel").classList.remove("hidden");
    $("userPanel").classList.add("hidden");
    $("welcome").classList.remove("hidden");
    $("chatView").classList.add("hidden");
    $("screenTitle").textContent = "Тест чату";
    $("screenSubtitle").textContent = "Увійди або зареєструй тестового користувача";
    setConnection("SignalR: не підключено");
}

function decodeJwt(token) {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = part.padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(decodeURIComponent(atob(padded).split("").map(char =>
        `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
}

async function login(email, password) {
    const result = await api("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ Email: email, Password: password })
    });
    const token = payloadOf(result);
    if (typeof token !== "string") throw new Error("API не повернув JWT у payLoad.");

    const claims = decodeJwt(token);
    saveAuth(token, {
        name: claims.UserName || claims.userName || "Користувач",
        userTag: claims.UserTag || claims.userTag || "",
        id: claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] || claims.sub || ""
    });
    showAuthenticated();
}

async function register(values) {
    return api("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody(values)
    });
}

function setVerificationNotice(message, kind = "info") {
    const notice = $("verificationNotice");
    notice.textContent = message;
    notice.dataset.kind = kind;
}

function startResendCooldown(seconds = 60) {
    clearInterval(resendCooldownTimer);
    const button = $("resendVerificationBtn");
    const endsAt = Date.now() + seconds * 1000;
    button.disabled = true;

    const update = () => {
        const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        if (remaining === 0) {
            clearInterval(resendCooldownTimer);
            resendCooldownTimer = null;
            button.disabled = false;
            button.textContent = "Надіслати код ще раз";
            return;
        }
        button.textContent = `Повторне надсилання через ${remaining} с`;
    };

    update();
    resendCooldownTimer = setInterval(update, 1000);
}

function showVerification(email, notice = "Введи код із листа, щоб підтвердити адресу.", cooldownSeconds = 0) {
    $("loginForm").classList.add("hidden");
    $("registerForm").classList.add("hidden");
    $("verificationForm").classList.remove("hidden");
    document.querySelector(".tabs").classList.add("hidden");
    $("verificationEmailLabel").textContent = email;
    $("verificationEmailLabel").dataset.email = email;
    $("verificationCode").value = "";
    setVerificationNotice(notice);
    clearInterval(resendCooldownTimer);
    resendCooldownTimer = null;
    $("resendVerificationBtn").disabled = false;
    $("resendVerificationBtn").textContent = "Надіслати код ще раз";
    if (cooldownSeconds > 0) startResendCooldown(cooldownSeconds);
}

function showLoginTab(email = "", notice = "") {
    clearInterval(resendCooldownTimer);
    resendCooldownTimer = null;
    document.querySelector(".tabs").classList.remove("hidden");
    $("verificationForm").classList.add("hidden");
    $("registerForm").classList.add("hidden");
    $("loginForm").classList.remove("hidden");
    document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.tab === "login"));
    $("loginEmail").value = email;
    $("authNotice").textContent = notice;
    $("authNotice").classList.toggle("hidden", !notice);
}

async function verifyEmail(email, code) {
    await api("/api/users/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ Email: email, Code: code })
    });
}

async function resendVerification(email) {
    await api("/api/users/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ Email: email })
    });
}

async function loadChats() {
    try {
        const result = await api("/api/chats/my");
        state.chats = payloadOf(result) || [];
        renderChats();
    } catch (error) {
        $("chatList").innerHTML = `<div class="empty">Не вдалося завантажити чати.<br>${escapeHtml(error.message)}</div>`;
    }
}

function renderChats() {
    const list = $("chatList");
    if (!state.chats.length) {
        list.innerHTML = `<div class="empty">Чатів поки немає. Знайди користувача або створи групу.</div>`;
        return;
    }

    list.innerHTML = state.chats.map((chat, index) => `
      <button class="chat-item ${state.activeChat?.id === chat.id ? "active" : ""}" data-index="${index}" type="button">
        <strong>${escapeHtml(chat.name || "Без назви")}</strong>
        <small>${chat.chatType === 3 ? "Direct" : `Група · тип ${chat.chatType}`} · ${chat.usersCount ?? 0} учасн.</small>
      </button>`).join("");

    list.querySelectorAll(".chat-item").forEach(button => {
        button.addEventListener("click", () => selectChat(state.chats[Number(button.dataset.index)]));
    });
}

async function createGroup(name, chatType) {
    await api("/api/chats/create", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ Name: name, ChatType: chatType })
    });
    await loadChats();
    const created = state.chats.find(chat => chat.name === name.trim());
    if (created) await selectChat(created);
}

async function searchTag(tag) {
    const result = await api(`/api/users/by-tag?${new URLSearchParams({ tag })}`);
    const user = payloadOf(result);
    if (!user?.id) throw new Error("У відповіді пошуку немає ID користувача.");

    const box = $("tagSearchResult");
    box.className = "result-box user-result";
    box.innerHTML = `<div><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.userTag)}</span></div><button id="createDirectBtn" class="primary" type="button">Відкрити direct</button>`;
    $("createDirectBtn").addEventListener("click", () => createDirect(user));
}

async function createDirect(user) {
    try {
        await api("/api/chats/create-direct", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formBody({ GuestId: user.id })
        });
        await loadChats();
        const direct = state.chats.find(chat => chat.chatType === 3 && chat.name === user.name);
        if (direct) await selectChat(direct);
        log(`Direct-чат із ${user.name} створено.`);
    } catch (error) {
        await loadChats();
        const existing = state.chats.find(chat => chat.chatType === 3 && chat.name === user.name);
        if (existing && /already exist|вже існує/i.test(error.message)) {
            await selectChat(existing);
            return;
        }
        showError(error);
    }
}

async function joinChat(chatId) {
    await api(`/api/chats/join-chat?${new URLSearchParams({ chatId })}`, { method: "POST" });
    await loadChats();
    const joined = state.chats.find(chat => chat.id.toLowerCase() === chatId.toLowerCase());
    if (joined) await selectChat(joined);
}

async function connectSignalR() {
    if (!state.token) return;
    if (!window.signalR) {
        setConnection("SignalR: бібліотека не завантажилась");
        log("Не завантажено SignalR JS. Перевір доступ до CDN.");
        return;
    }
    if (state.connection) {
        try { await state.connection.stop(); } catch { /* connection already stopped */ }
    }

    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/hubs/chat", { accessTokenFactory: () => state.token })
        .withAutomaticReconnect()
        .build();
    state.connection = connection;

    connection.on("ReceiveMessage", message => {
        const chatId = message?.chatId ?? message?.ChatId;
        if (state.activeChat?.id === chatId) appendMessage(message);
        log("SignalR ReceiveMessage", message);
    });
    connection.on("UserTyping", payload => log("SignalR UserTyping", payload));
    connection.onreconnecting(error => {
        setConnection("SignalR: перепідключення…");
        log("SignalR reconnecting", error?.message);
    });
    connection.onreconnected(async () => {
        setConnection("SignalR: підключено", true);
        log("SignalR reconnect complete");
        if (state.activeChat) await joinRoom(state.activeChat.id);
    });
    connection.onclose(error => {
        setConnection("SignalR: відключено");
        if (error) log("SignalR closed", error.message);
    });

    try {
        await connection.start();
        setConnection("SignalR: підключено", true);
        log("SignalR connection established");
        if (state.activeChat) await joinRoom(state.activeChat.id);
    } catch (error) {
        setConnection("SignalR: помилка підключення");
        log("SignalR start failed", error.message);
    }
}

async function joinRoom(chatId) {
    if (!state.connection || state.connection.state !== signalR.HubConnectionState.Connected) return;
    try {
        await state.connection.invoke("JoinRoom", chatId);
        log(`JoinRoom ${chatId}: успішно`);
    } catch (error) {
        log("JoinRoom failed", error.message);
    }
}

async function selectChat(chat) {
    state.activeChat = chat;
    $("activeChatName").textContent = chat.name || "Чат";
    $("activeChatId").textContent = chat.id || "";
    $("messages").innerHTML = `<div class="empty">Завантажую історію…</div>`;
    $("messageInput").disabled = false;
    $("messageForm").querySelector("button").disabled = false;
    $("joinRoomBtn").classList.remove("hidden");
    $("chatView").classList.remove("hidden");
    $("welcome").classList.add("hidden");
    renderChats();

    const selectedId = chat.id;
    await joinRoom(selectedId);
    try {
        const result = await api(`/api/chats/${encodeURIComponent(selectedId)}/last-messages?limit=50`);
        if (state.activeChat?.id !== selectedId) return;
        renderMessages(payloadOf(result) || []);
    } catch (error) {
        if (state.activeChat?.id === selectedId) {
            $("messages").innerHTML = `<div class="empty">Не вдалося завантажити історію: ${escapeHtml(error.message)}</div>`;
        }
    }
}

function renderMessages(messages) {
    const container = $("messages");
    container.replaceChildren();
    if (!messages.length) {
        container.innerHTML = `<div class="empty">Повідомлень ще немає. Напиши перше!</div>`;
        return;
    }
    for (const message of messages) appendMessage(message, false);
    container.scrollTop = container.scrollHeight;
}

function appendMessage(message, scroll = true) {
    const container = $("messages");
    container.querySelector(".empty")?.remove();

    const sender = message?.memberName ?? message?.MemberName ?? "Невідомий";
    const text = message?.text ?? message?.Text ?? "";
    const sentAt = message?.sentAt ?? message?.SentAt;
    const changed = message?.isChanged ?? message?.IsChanged ?? false;

    const item = document.createElement("article");
    item.className = "message";
    const senderElement = document.createElement("div");
    senderElement.className = "sender";
    senderElement.textContent = sender;
    const textElement = document.createElement("div");
    textElement.className = "text";
    textElement.textContent = text;
    const timeElement = document.createElement("div");
    timeElement.className = "time";
    const parsedDate = sentAt ? new Date(sentAt) : new Date();
    timeElement.textContent = `${Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toLocaleTimeString()}${changed ? " · змінено" : ""}`;
    item.append(senderElement, textElement, timeElement);
    container.appendChild(item);
    if (scroll) container.scrollTop = container.scrollHeight;
}

async function sendMessage(text) {
    if (!state.activeChat) throw new Error("Спочатку обери чат.");
    if (!state.connection || state.connection.state !== signalR.HubConnectionState.Connected) {
        throw new Error("SignalR ще не підключився.");
    }
    await state.connection.invoke("SendToRoom", state.activeChat.id, text);
}

function showError(error) {
    log("Помилка", error.message);
    alert(error.message);
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
}

document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
    document.querySelector(".tabs").classList.remove("hidden");
    $("verificationForm").classList.add("hidden");
    document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab === button));
    $("loginForm").classList.toggle("hidden", button.dataset.tab !== "login");
    $("registerForm").classList.toggle("hidden", button.dataset.tab !== "register");
    $("authNotice").classList.add("hidden");
}));

$("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    try { await login($("loginEmail").value, $("loginPassword").value); }
    catch (error) {
        if (error.statusCode === 403) {
            showVerification($("loginEmail").value.trim(), "Цю адресу ще не підтверджено. Введи код із листа або запроси новий.");
            return;
        }
        showError(error);
    }
});

$("registerForm").addEventListener("submit", async event => {
    event.preventDefault();
    try {
        const values = {
            Name: $("regName").value.trim(),
            Email: $("regEmail").value.trim(),
            PhoneNumber: $("regPhone").value.trim(),
            UserTag: $("regTag").value.trim(),
            Password: $("regPassword").value
        };
        await register(values);
        showVerification(values.Email, "Код надіслано. Перевір пошту та введи його нижче.", 60);
    } catch (error) {
        if (error.statusCode === 503) {
            const email = $("regEmail").value.trim();
            showVerification(email, "Акаунт створений, але лист не відправився. Перевір пошту пізніше або звернись до адміністратора.", 60);
            return;
        }
        showError(error);
    }
});

$("verificationForm").addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("verificationEmailLabel").dataset.email;
    try {
        await verifyEmail(email, $("verificationCode").value.trim());
        showLoginTab(email, "Адресу підтверджено. Тепер увійди з email і паролем.");
    } catch (error) {
        setVerificationNotice(error.message, "error");
    }
});

$("resendVerificationBtn").addEventListener("click", async () => {
    const email = $("verificationEmailLabel").dataset.email;
    try {
        await resendVerification(email);
        setVerificationNotice("Якщо акаунт існує та не підтверджений, новий код надіслано. Перевір пошту.", "success");
        startResendCooldown(60);
    } catch (error) {
        if (error.statusCode === 429) {
            setVerificationNotice("Зачекай перед повторним запитом коду.", "error");
            startResendCooldown(60);
            return;
        }
        setVerificationNotice(error.message, "error");
    }
});

$("backToAuthBtn").addEventListener("click", () => showLoginTab($("verificationEmailLabel").dataset.email));

$("tagSearchForm").addEventListener("submit", async event => {
    event.preventDefault();
    try { await searchTag($("tagSearch").value.trim()); }
    catch (error) {
        $("tagSearchResult").className = "result-box empty error-text";
        $("tagSearchResult").textContent = error.message;
        log("Пошук за тегом не вдався", error.message);
    }
});

$("createChatForm").addEventListener("submit", async event => {
    event.preventDefault();
    try {
        await createGroup($("chatName").value.trim(), $("chatType").value);
        $("chatName").value = "";
        log("Груповий чат створено.");
    } catch (error) { showError(error); }
});

$("joinChatForm").addEventListener("submit", async event => {
    event.preventDefault();
    try {
        await joinChat($("joinChatId").value.trim());
        $("joinChatId").value = "";
        log("Успішно приєднано до чату.");
    } catch (error) { showError(error); }
});

$("messageForm").addEventListener("submit", async event => {
    event.preventDefault();
    const input = $("messageInput");
    const text = input.value.trim();
    if (!text) return;
    try { await sendMessage(text); input.value = ""; }
    catch (error) { showError(error); }
});

$("refreshChatsBtn").addEventListener("click", loadChats);
$("joinRoomBtn").addEventListener("click", () => state.activeChat && joinRoom(state.activeChat.id));
$("clearLogBtn").addEventListener("click", () => { $("log").textContent = ""; });

$("logoutBtn").addEventListener("click", async () => {
    if (state.connection) {
        try { await state.connection.stop(); } catch { /* ignore stop errors */ }
    }
    state.connection = null;
    state.chats = [];
    state.activeChat = null;
    clearAuth();
    renderChats();
    showLoggedOut();
});

if (state.token) showAuthenticated();
else showLoggedOut();
