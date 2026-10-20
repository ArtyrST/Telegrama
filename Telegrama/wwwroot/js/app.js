const state = {
    token: sessionStorage.getItem("telegrama_token"),
    user: readSavedUser(),
    chats: [],
    activeChat: null,
    connection: null
};
let resendCooldownTimer = null;
let toastTimer = null;
let refreshTimer = null;
let refreshPromise = null;
const DEBUG_ENABLED = new URLSearchParams(window.location.search).get("debug") === "1";

const $ = id => document.getElementById(id);
document.querySelector(".debug").classList.toggle("hidden", !DEBUG_ENABLED);
try {
    // Remove tokens left by the earlier test client version.
    localStorage.removeItem("telegrama_token");
    localStorage.removeItem("telegrama_user");
} catch { /* Storage may be disabled by the browser. */ }

function readSavedUser() {
    try { return JSON.parse(sessionStorage.getItem("telegrama_user") || "null"); }
    catch { return null; }
}

function log(message) {
    if (!DEBUG_ENABLED) return;
    const box = $("log");
    box.textContent += `[${new Date().toLocaleTimeString()}] ${message}\n\n`;
    const entries = box.textContent.split("\n\n").filter(Boolean);
    if (entries.length > 100) box.textContent = `${entries.slice(-100).join("\n\n")}\n\n`;
    box.scrollTop = box.scrollHeight;
}

function showToast(message, kind = "info") {
    const toast = $("toast");
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 5000);
}

function setConnection(text, online = false) {
    $("connectionText").textContent = text;
    $("connectionDot").className = `dot ${online ? "online" : "offline"}`;
}

function saveAuth(token, user) {
    state.token = token;
    state.user = user;
    sessionStorage.setItem("telegrama_token", token);
    sessionStorage.setItem("telegrama_user", JSON.stringify(user));
    scheduleTokenRefresh();
}

function clearAuth() {
    state.token = null;
    state.user = null;
    sessionStorage.removeItem("telegrama_token");
    sessionStorage.removeItem("telegrama_user");
    clearTimeout(refreshTimer);
    refreshTimer = null;
}

async function api(url, options = {}) {
    const hadToken = Boolean(state.token);
    const headers = new Headers(options.headers || {});
    if (state.token) headers.set("Authorization", `Bearer ${state.token}`);

    let response;
    try {
        const send = () => fetch(url, { ...options, headers });
        response = await send();
        if (response.status === 401 && hadToken) {
            try {
                await refreshAccessToken();
                headers.set("Authorization", `Bearer ${state.token}`);
                response = await send();
                if (state.connection) void connectSignalR();
                if (response.status === 401) expireSession();
            } catch {
                expireSession();
            }
        }
    } catch (cause) {
        $("apiStatus").textContent = "API: немає з’єднання";
        log(`${options.method || "GET"} ${new URL(url, window.location.origin).pathname} → network error`);
        const error = new Error("Не вдалося з’єднатися із сервером. Перевір інтернет і спробуй ще раз.");
        error.cause = cause;
        throw error;
    }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; }
    catch { data = text; }

    $("apiStatus").textContent = `API: ${response.status} ${response.statusText}`;
    // Do not write API response bodies to the browser journal: login responses contain JWTs.
    log(`${options.method || "GET"} ${new URL(url, window.location.origin).pathname} → ${response.status}`);

    if (response.status === 401 && hadToken) expireSession();

    if (!response.ok || data?.isSuccess === false) {
        const validation = data?.errors
            ? Object.values(data.errors).flat().filter(value => typeof value === "string").join("; ")
            : "";
        const error = new Error(data?.message || data?.Message || data?.title || validation || `Помилка запиту (${response.status}).`);
        error.statusCode = response.status;
        throw error;
    }
    return data;
}

async function refreshAccessToken() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
        const sendRefreshRequest = () => fetch("/api/users/session/refresh", {
            method: "POST",
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        });
        let response = await sendRefreshRequest();
        // Two browser tabs can reach refresh at once; allow the winning rotation to update the shared cookie.
        if (response.status === 401) {
            await new Promise(resolve => setTimeout(resolve, 150));
            response = await sendRefreshRequest();
        }
        const text = await response.text();
        let result = null;
        try { result = text ? JSON.parse(text) : null; }
        catch { result = null; }

        const token = payloadOf(result);
        if (!response.ok || result?.isSuccess === false || typeof token !== "string") {
            throw new Error("Не вдалося оновити сесію.");
        }

        state.token = token;
        sessionStorage.setItem("telegrama_token", token);
        scheduleTokenRefresh();
        log("POST /api/users/session/refresh → успішно");
        return token;
    })().finally(() => {
        refreshPromise = null;
    });
    return refreshPromise;
}

function scheduleTokenRefresh() {
    clearTimeout(refreshTimer);
    if (!state.token) return;

    let delay = 1000;
    try {
        const expiresAt = Number(decodeJwt(state.token).exp) * 1000;
        if (Number.isFinite(expiresAt)) delay = Math.max(1000, expiresAt - Date.now() - 60_000);
    } catch { /* An invalid/expired access token will be replaced on startup or next request. */ }

    refreshTimer = setTimeout(async () => {
        try {
            await refreshAccessToken();
            if (state.connection) await connectSignalR();
        } catch {
            expireSession();
        }
    }, delay);
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
    $("screenSubtitle").textContent = "Ваші особисті та групові розмови";

    loadChats();
    connectSignalR();
}

function showLoggedOut() {
    $("authPanel").classList.remove("hidden");
    $("userPanel").classList.add("hidden");
    $("welcome").classList.remove("hidden");
    $("chatView").classList.add("hidden");
    $("screenTitle").textContent = "Вітаємо в Telegrama";
    $("screenSubtitle").textContent = "Увійдіть або створіть обліковий запис";
    setConnection("SignalR: не підключено");
}

function expireSession() {
    clearAuth();
    if (state.connection) state.connection.stop().catch(() => {});
    state.connection = null;
    state.chats = [];
    state.activeChat = null;
    showLoggedOut();
    showToast("Сесія завершилась. Увійдіть знову.", "error");
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
        <span class="chat-item-title"><strong>${escapeHtml(chat.name || "Без назви")}</strong>${chat.unreadCount > 0 ? `<span class="unread-badge" aria-label="Непрочитаних: ${Number(chat.unreadCount)}">${Number(chat.unreadCount) > 99 ? "99+" : Number(chat.unreadCount)}</span>` : ""}</span>
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
    const existingIds = new Set(state.chats.filter(chat => chat.chatType === 3).map(chat => chat.id.toLowerCase()));
    try {
        await api("/api/chats/create-direct", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formBody({ GuestId: user.id })
        });
        await loadChats();
        const direct = state.chats.find(chat => chat.chatType === 3 && !existingIds.has(chat.id.toLowerCase()));
        if (direct) {
            // The current API returns a placeholder name for direct chats.
            // This local label is only a convenience for the account that created it.
            direct.name = user.name;
            renderChats();
            await selectChat(direct);
        } else {
            showToast("Чат створено. Онови список чатів, якщо він не з’явився.", "success");
        }
        log("Direct-чат створено.");
    } catch (error) {
        await loadChats();
        const directChats = state.chats.filter(chat => chat.chatType === 3);
        const existing = directChats.find(chat => chat.name === user.name)
            || (directChats.length === 1 ? directChats[0] : null);
        if (existing && /already exist|вже існує/i.test(error.message)) {
            existing.name = user.name;
            renderChats();
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
        if (sameId(state.activeChat?.id, chatId)) {
            appendMessage(message);
            markChatRead(chatId);
        } else {
            loadChats();
        }
        log("SignalR: отримано повідомлення");
    });
    connection.on("MessageEdited", message => updateMessage(message, false));
    connection.on("MessageDeleted", message => updateMessage(message, true));
    connection.on("UserTyping", () => log("SignalR: подія набору тексту"));
    connection.onreconnecting(error => {
        setConnection("SignalR: перепідключення…");
        log("SignalR: повторне підключення");
    });
    connection.onreconnected(async () => {
        setConnection("SignalR: підключено", true);
        log("SignalR reconnect complete");
        if (state.activeChat) await joinRoom(state.activeChat.id);
    });
    connection.onclose(error => {
        setConnection("SignalR: відключено");
        if (error) log("SignalR: з’єднання закрито з помилкою");
    });

    try {
        await connection.start();
        setConnection("SignalR: підключено", true);
        log("SignalR connection established");
        if (state.activeChat) await joinRoom(state.activeChat.id);
    } catch (error) {
        setConnection("SignalR: помилка підключення");
        log("SignalR: не вдалося підключитися");
    }
}

async function joinRoom(chatId) {
    if (!state.connection || state.connection.state !== signalR.HubConnectionState.Connected) return;
    try {
        await state.connection.invoke("JoinRoom", chatId);
        log(`JoinRoom ${chatId}: успішно`);
    } catch (error) {
        log("SignalR: не вдалося приєднатися до чату");
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
        await markChatRead(selectedId);
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
    const deleted = message?.isDeleted ?? message?.IsDeleted ?? false;
    const id = message?.id ?? message?.Id;

    const item = document.createElement("article");
    item.className = "message";
    if (id) item.dataset.messageId = id;
    if (deleted) item.classList.add("message-deleted");
    const senderElement = document.createElement("div");
    senderElement.className = "sender";
    senderElement.textContent = sender;
    const textElement = document.createElement("div");
    textElement.className = "text";
    textElement.textContent = deleted ? "Повідомлення видалено" : text;
    const timeElement = document.createElement("div");
    timeElement.className = "time";
    const parsedDate = sentAt ? new Date(sentAt) : new Date();
    timeElement.textContent = `${Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toLocaleTimeString()}${changed ? " · змінено" : ""}`;
    item.append(senderElement, textElement, timeElement);
    container.appendChild(item);
    if (scroll) container.scrollTop = container.scrollHeight;
}

function sameId(first, second) {
    return typeof first === "string" && typeof second === "string" && first.toLowerCase() === second.toLowerCase();
}

function updateMessage(message, deleted) {
    const id = message?.id ?? message?.Id;
    const item = [...$("messages").querySelectorAll("[data-message-id]")]
        .find(element => sameId(element.dataset.messageId, id));
    if (!item) return;
    const text = item.querySelector(".text");
    const time = item.querySelector(".time");
    const isDeleted = deleted || (message?.isDeleted ?? message?.IsDeleted ?? false);
    text.textContent = isDeleted ? "Повідомлення видалено" : (message?.text ?? message?.Text ?? "");
    item.classList.toggle("message-deleted", isDeleted);
    const changed = message?.isChanged ?? message?.IsChanged ?? false;
    if (changed && time && !time.textContent.includes("змінено")) time.textContent += " · змінено";
    log(isDeleted ? "SignalR: повідомлення видалено" : "SignalR: повідомлення змінено");
}

async function markChatRead(chatId) {
    try {
        await api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: "POST" });
        const chat = state.chats.find(item => sameId(item.id, chatId));
        if (chat) chat.unreadCount = 0;
        renderChats();
    } catch (error) {
        log("Не вдалося оновити стан прочитання чату");
    }
}

async function sendMessage(text) {
    if (!state.activeChat) throw new Error("Спочатку обери чат.");
    if (!state.connection || state.connection.state !== signalR.HubConnectionState.Connected) {
        throw new Error("SignalR ще не підключився.");
    }
    await state.connection.invoke("SendToRoom", state.activeChat.id, text);
}

function showError(error) {
    log("Операція завершилась помилкою");
    showToast(error.message || "Сталася помилка. Спробуйте ще раз.", "error");
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
        log("Пошук за тегом завершився помилкою");
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
    try { await api("/api/users/session/logout", { method: "POST" }); }
    catch { log("POST /api/users/session/logout → помилка"); }
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

async function restoreSession() {
    if (state.token) {
        try {
            const expiresAt = Number(decodeJwt(state.token).exp) * 1000;
            if (expiresAt > Date.now() + 30_000) {
                scheduleTokenRefresh();
                showAuthenticated();
                return;
            }
        } catch { /* Try the HttpOnly refresh cookie below. */ }
    }

    try {
        await refreshAccessToken();
        showAuthenticated();
    } catch {
        showLoggedOut();
    }
}

restoreSession();
