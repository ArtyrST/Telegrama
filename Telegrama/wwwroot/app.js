(() => {
"use strict";

/* =====================================================================
 * Telegrama web client
 *  - access JWT живе лише в пам'яті; після перезавантаження сторінки його
 *    відновлює HttpOnly refresh-cookie (POST /api/users/session/refresh)
 *  - SignalR перепідключається необмежено, токен береться свіжим при кожній спробі
 *  - усе, що приходить із сервера, потрапляє в DOM лише через textContent
 * ===================================================================== */

/* ---------- конфігурація ---------- */
const MAX_MESSAGE_LENGTH = 2000;        // ліміт у ChatHub.SendToRoom / EditMessage
const HISTORY_LIMIT = 100;              // бекенд: limit > 100 мовчки замінюється на 50
const CHAT_POLL_MS = 30_000;            // як часто підтягувати нові чати (їх можуть створити інші)
const TYPING_SEND_THROTTLE_MS = 2_500;
const TYPING_SHOW_MS = 4_000;
const REFRESH_MARGIN_MS = 60_000;       // оновлювати access-токен за хвилину до кінця
const API_TIMEOUT_MS = 20_000;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAT_TYPE_LABEL = ["Приватна група", "Публічна група", "Група за посиланням", "Особистий чат"];
const DIRECT = 3;
const DEBUG = new URLSearchParams(location.search).get("debug") === "1";

/* ---------- стан ---------- */
const newView = () => ({ messages: [], loading: false, pending: [], error: null });
const state = {
    token: null,
    user: null,                 // { id, name, userTag }
    chats: [],                  // [{ id, name, type, usersCount, unreadCount }]
    activeId: null,
    view: newView(),            // повідомлення активного чату
    connection: null,
    hubStatus: "offline",       // online | connecting | retry | offline
    joined: new Set(),          // чати, у які ми зробили JoinRoom на поточному з'єднанні
    drafts: new Map(),          // chatId -> незавершений текст
    editing: null,              // { id } поки редагуємо повідомлення
    sending: false,
    e2ee: { identity: null, peerKeys: new Map(), pending: new Map(), readyChatId: null, errors: new Map() },
    typing: new Map(),          // "chatId|name" -> { name, timer }
    activity: new Map(),        // chatId -> час останньої активності (для сортування списку)
    directNames: {},            // chatId -> ім'я співрозмовника (сервер віддає "Заглушка")
    pendingJoinId: null         // GUID із посилання-запрошення #join=...
};

let refreshTimer = null, refreshPromise = null, pollTimer = null;
let toastTimer = null, resendTimer = null, hubGeneration = 0, lastTypingSentAt = 0;
let lastChatsSignature = "", chatsLoading = null, authChannel = null;
const readTimers = new Map();

/* ---------- утиліти ---------- */
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pick = (obj, camel, pascal) => obj?.[camel] ?? obj?.[pascal];
const payloadOf = response => response?.payLoad ?? response?.PayLoad ?? null;
const sameId = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const backoff = attempt => Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5)) + Math.random() * 500;

function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
            if (value == null || value === false) continue;
            if (key === "class") el.className = value;
            else if (key === "text") el.textContent = value;
            else if (key === "dataset") Object.assign(el.dataset, value);
            else el.setAttribute(key, value === true ? "" : value);
        }
    }
    for (const child of children.flat()) if (child != null && child !== false) el.append(child);
    return el;
}

function log(message) {
    if (!DEBUG) return;                 // у журнал ніколи не пишемо тіла відповідей і тексти повідомлень
    const box = $("log");
    box.textContent += `[${new Date().toLocaleTimeString()}] ${message}\n`;
    const lines = box.textContent.split("\n");
    if (lines.length > 300) box.textContent = lines.slice(-200).join("\n");
    box.scrollTop = box.scrollHeight;
}

function showToast(message, kind = "info") {
    const toast = $("toast");
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 5_000);
}
const showError = error => showToast(error?.message || "Сталася помилка. Спробуйте ще раз.", "error");

/* Відомі англомовні відповіді бекенда → українська. Невідомі показуємо як є. */
const MESSAGE_MAP = [
    [/Invalid credentials/i, "Невірний email або пароль."],
    [/Verify your email before logging in/i, "Спершу підтвердіть email."],
    [/Verification code is invalid/i, "Невірний код підтвердження."],
    [/Verification code is expired/i, "Код прострочений. Запросіть новий."],
    [/Too many attempts/i, "Забагато спроб. Запросіть новий код."],
    [/Wait at least 60 seconds/i, "Зачекайте хвилину перед повторним запитом коду."],
    [/Unable to send verification email|could not be sent/i, "Не вдалося надіслати лист. Спробуйте пізніше."],
    [/with email.*already create|with this email already exists/i, "Користувач із такою поштою вже існує."],
    [/with tag.*already create|tag is already taken/i, "Цей тег уже зайнятий."],
    [/Session expired|Refresh token is missing/i, "Сесія завершилась. Увійдіть знову."],
    [/This user already in chat/i, "Ви вже є учасником цього чату."],
    [/This chat not exist/i, "Чат із таким ID не знайдено."],
    [/Chat with this name already exist|Чат із такою назвою вже існує/i, "Чат із такою назвою вже існує."],
    [/Chat name must be between/i, "Назва чату має містити від 3 до 50 символів."],
    [/Chat name is required/i, "Вкажіть назву чату."],
    [/You cant create this type of chat/i, "Цей тип чату створити не можна."],
    [/This direct already exist/i, "Особистий чат із цим користувачем уже існує."],
    [/Failed to get this user/i, "Користувача з таким тегом не знайдено."],
    [/The tag is empty/i, "Введіть тег."],
    [/User are not in chat|User not in this chat|User not in room|User is not exist in this chat|Member not in chat/i, "Ви не є учасником цього чату."],
    [/Message is empty|text is empty/i, "Повідомлення порожнє."],
    [/too long/i, `Повідомлення задовге (максимум ${MAX_MESSAGE_LENGTH} символів).`],
    [/only edit your own/i, "Редагувати можна лише власні повідомлення."],
    [/only delete your own/i, "Видаляти можна лише власні повідомлення."],
    [/cant edit deleted/i, "Видалене повідомлення редагувати не можна."],
    [/cant delete already deleted/i, "Повідомлення вже видалено."],
    [/No find this message|Message not in chat/i, "Повідомлення не знайдено."],
    [/other user has not registered an E2EE key yet/i, "Попросіть співрозмовника відкрити цей direct-чат у новій версії сайту, щоб створити ключ."],
    [/An E2EE key is already registered for this account/i, "Для акаунта вже зареєстрований ключ. Потрібен браузер, де зберігається відповідний приватний ключ."]
];
function translate(message) {
    const text = String(message ?? "");
    const hit = MESSAGE_MAP.find(([pattern]) => pattern.test(text));
    return hit ? hit[1] : text;
}

function networkError(cause) {
    const error = new Error("Не вдалося з’єднатися із сервером. Перевірте інтернет і спробуйте ще раз.");
    error.isNetwork = true;
    error.cause = cause;
    return error;
}

/* Помилки SignalR приходять як "An unexpected error occurred invoking 'X' on the server. HubException: <текст>". */
function hubError(error) {
    const raw = String(error?.message ?? error ?? "");
    const marker = raw.indexOf("HubException:");
    if (marker >= 0) return new Error(translate(raw.slice(marker + "HubException:".length).trim()));
    if (!hubConnected()) return new Error("Немає з’єднання із сервером. Спробуйте за мить.");
    return new Error("Не вдалося виконати дію. Спробуйте ще раз.");
}

function parseServerDate(value) {
    if (!value) return new Date();
    let text = String(value);
    if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(text)) text += "Z";   // час на сервері завжди UTC
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? new Date() : date;
}
const dayKey = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const fmtTime = date => date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function fmtDay(date) {
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (dayKey(date) === dayKey(today)) return "Сьогодні";
    if (dayKey(date) === dayKey(yesterday)) return "Вчора";
    return date.toLocaleDateString([], { day: "numeric", month: "long", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
        const area = h("textarea", { "aria-hidden": "true", class: "clipboard-proxy", tabindex: "-1" });
        area.value = text;
        document.body.append(area);
        area.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch { /* ignore */ }
        area.remove();
        return ok;
    }
}

/* ---------- JWT і сесія ---------- */
function decodeJwt(token) {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = part.padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(decodeURIComponent(atob(padded).split("").map(ch =>
        `%${ch.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
}

function userFromToken(token) {
    const claims = decodeJwt(token);
    return {
        id: claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] || claims.sub || "",
        name: claims.UserName || claims.userName || "Користувач",
        userTag: claims.UserTag || claims.userTag || ""
    };
}

function tokenExpiresInMs() {
    try { return Number(decodeJwt(state.token).exp) * 1000 - Date.now(); }
    catch { return -1; }
}

function saveToken(token) {
    state.token = token;
    state.user = userFromToken(token);
    scheduleTokenRefresh();
}

function clearAuth() {
    state.token = null;
    state.user = null;
    clearTimeout(refreshTimer);
    refreshTimer = null;
    state.e2ee.identity = null;
    state.e2ee.peerKeys.clear();
    state.e2ee.pending.clear();
    state.e2ee.readyChatId = null;
    state.e2ee.errors.clear();
}

function scheduleTokenRefresh() {
    clearTimeout(refreshTimer);
    if (!state.token) return;
    const delay = Math.max(1_000, tokenExpiresInMs() - REFRESH_MARGIN_MS);
    refreshTimer = setTimeout(() => refreshAccessToken().catch(handleRefreshFailure), delay);
}

function handleRefreshFailure(error) {
    if (error.authFailed) { expireSession(); return; }
    // тимчасова проблема (мережа/5xx) — пробуємо ще
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshAccessToken().catch(handleRefreshFailure), 15_000);
}

function refreshAccessToken() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
        const send = () => fetch("/api/users/session/refresh", {
            method: "POST", credentials: "same-origin", headers: { Accept: "application/json" }
        });
        let response;
        try {
            response = await send();
            // дві вкладки можуть оновлювати одночасно: refresh-токен одноразовий, переможець виставляє нову cookie
            if (response.status === 401) { await sleep(150); response = await send(); }
        } catch (cause) { throw networkError(cause); }

        const text = await response.text();
        let result = null;
        try { result = text ? JSON.parse(text) : null; } catch { result = null; }
        const token = payloadOf(result);
        if (!response.ok || result?.isSuccess === false || typeof token !== "string") {
            const error = new Error("Не вдалося оновити сесію.");
            error.statusCode = response.status;
            error.authFailed = response.status === 401 || response.status === 403;
            throw error;
        }
        saveToken(token);
        log("session/refresh → успішно");
        return token;
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
}

/* ---------- HTTP ---------- */
const formBody = values => new URLSearchParams(Object.entries(values).map(([k, v]) => [k, v ?? ""]));

async function api(path, { method = "GET", form = null, json = null, auth = true } = {}) {
    const hadToken = auth && Boolean(state.token);
    const send = async () => {
        const headers = new Headers({ Accept: "application/json" });
        if (form) headers.set("Content-Type", "application/x-www-form-urlencoded");
        if (json) headers.set("Content-Type", "application/json");
        if (hadToken && state.token) headers.set("Authorization", `Bearer ${state.token}`);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        try {
            return await fetch(path, {
                method, headers, credentials: "same-origin", signal: controller.signal,
                body: form ? formBody(form) : json ? JSON.stringify(json) : undefined
            });
        } finally { clearTimeout(timer); }
    };

    let response;
    try {
        response = await send();
        if (response.status === 401 && hadToken) {
            // access-токен прострочився: тихо оновлюємо та повторюємо запит один раз.
            // SignalR при цьому НЕ перепідключаємо — з'єднання авторизується лише при старті.
            try { await refreshAccessToken(); } catch (error) {
                if (error.authFailed) { expireSession(); throw new Error("Сесія завершилась. Увійдіть знову."); }
                throw error;
            }
            response = await send();
            if (response.status === 401) { expireSession(); throw new Error("Сесія завершилась. Увійдіть знову."); }
        }
    } catch (cause) {
        if (cause.isNetwork || cause.statusCode || cause.message?.startsWith("Сесія")) throw cause;
        log(`${method} ${path.split("?")[0]} → мережева помилка`);
        throw networkError(cause);
    }

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    log(`${method} ${path.split("?")[0]} → ${response.status}`);

    if (!response.ok || data?.isSuccess === false) {
        const validation = data?.errors
            ? Object.values(data.errors).flat().filter(v => typeof v === "string").join("; ") : "";
        const raw = data?.message || data?.Message || data?.title || validation || `Помилка запиту (${response.status}).`;
        const error = new Error(translate(raw));
        error.statusCode = response.status;
        error.rawMessage = raw;
        throw error;
    }
    return data;
}

/* ---------- імена direct-чатів ----------
 * Бекенд зберігає для direct-чату назву-заглушку, а API не віддає співрозмовника.
 * Тому ім'я запам'ятовуємо локально: при створенні чату й за відправником у історії. */
const nameCacheKey = () => `telegrama:direct-names:${state.user?.id || ""}`;
function loadDirectNames() {
    try { state.directNames = JSON.parse(localStorage.getItem(nameCacheKey()) || "{}") || {}; }
    catch { state.directNames = {}; }
}
function rememberDirectName(chatId, name) {
    const key = String(chatId).toLowerCase();
    if (!key || !name || state.directNames[key] === name) return;
    state.directNames[key] = name;
    try { localStorage.setItem(nameCacheKey(), JSON.stringify(state.directNames)); } catch { /* сховище вимкнене */ }
    renderChats(true);
    renderHeader();
}
function displayName(chat) {
    if (chat.type === DIRECT) return state.directNames[chat.id.toLowerCase()] || "Особистий чат";
    return chat.name || "Без назви";
}
const getChat = id => state.chats.find(chat => sameId(chat.id, id));

/* ---------- чати ---------- */
function normalizeChat(raw) {
    return {
        id: String(pick(raw, "id", "Id") ?? ""),
        name: String(pick(raw, "name", "Name") ?? ""),
        type: Number(pick(raw, "chatType", "ChatType")),
        usersCount: Number(pick(raw, "usersCount", "UsersCount")) || 0,
        unreadCount: Number(pick(raw, "unreadCount", "UnreadCount")) || 0
    };
}

const isViewing = () => document.visibilityState === "visible" && document.hasFocus();

function sortChats() {
    state.chats.sort((a, b) => (state.activity.get(b.id) || 0) - (state.activity.get(a.id) || 0));
}

function updateTitle() {
    const total = state.chats.reduce((sum, chat) => sum + chat.unreadCount, 0);
    document.title = total > 0 ? `(${total > 99 ? "99+" : total}) Telegrama — чати` : "Telegrama — чати";
}

function renderChats(force = false) {
    const signature = JSON.stringify([state.chats, state.activeId, state.directNames]);
    if (!force && signature === lastChatsSignature) return;
    lastChatsSignature = signature;
    updateTitle();

    const list = $("chatList");
    list.replaceChildren();
    if (!state.chats.length) {
        list.append(h("div", { class: "empty", text: "Чатів поки немає. Знайдіть користувача за тегом або створіть групу." }));
        return;
    }
    for (const chat of state.chats) {
        const active = sameId(chat.id, state.activeId);
        list.append(h("button", {
            class: `chat-item${active ? " active" : ""}`, type: "button",
            "aria-current": active ? "true" : null, dataset: { chatId: chat.id }
        },
        h("span", { class: "chat-item-title" },
            h("strong", { text: displayName(chat) }),
            chat.unreadCount > 0 ? h("span", {
                class: "unread-badge", "aria-label": `Непрочитаних: ${chat.unreadCount}`,
                text: chat.unreadCount > 99 ? "99+" : String(chat.unreadCount)
            }) : null),
        h("small", { text: `${CHAT_TYPE_LABEL[chat.type] ?? "Чат"} · ${chat.usersCount} учасн.` })));
    }
}

function loadChats() {
    if (chatsLoading) return chatsLoading;      // не накладаємо запити один на одного
    chatsLoading = (async () => {
        try {
            const result = await api("/api/chats/my");
            const fresh = (payloadOf(result) || []).map(normalizeChat).filter(chat => chat.id);
            state.chats = fresh;
            const active = getChat(state.activeId);
            if (active && active.unreadCount > 0 && isViewing()) scheduleMarkRead(active.id);
            sortChats();
            renderChats();
            renderHeader();
            void joinNewRooms();
        } catch (error) {
            if (!state.chats.length) {
                $("chatList").replaceChildren(h("div", { class: "empty" },
                    "Не вдалося завантажити чати.", h("br"), error.message));
                lastChatsSignature = "";
            }
            log(`loadChats: ${error.message}`);
        } finally { chatsLoading = null; }
    })();
    return chatsLoading;
}

async function createGroup(name, chatType) {
    await api("/api/chats/create", { method: "POST", form: { Name: name, ChatType: chatType } });
    await loadChats();
    // API не повертає id створеного чату; назви унікальні (без урахування регістру)
    const created = state.chats.find(chat => chat.type !== DIRECT && chat.name.toLowerCase() === name.trim().toLowerCase());
    if (created) await selectChat(created.id);
}

async function joinChat(input) {
    // приймаємо і чистий GUID, і повне посилання-запрошення (…/#join=GUID)
    const chatId = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(input)?.[0];
    if (!chatId || !GUID_RE.test(chatId)) throw new Error("Вставте ID чату (GUID) або посилання-запрошення.");
    await api(`/api/chats/join-chat?${new URLSearchParams({ chatId })}`, { method: "POST" });
    await loadChats();
    if (getChat(chatId)) await selectChat(getChat(chatId).id);
}

async function searchTag(tag) {
    const result = await api(`/api/users/by-tag?${new URLSearchParams({ tag })}`);
    const user = payloadOf(result);
    if (!user?.id) throw new Error("Користувача не знайдено.");

    const box = $("tagSearchResult");
    box.className = "result-box user-result";
    box.replaceChildren(h("div", null, h("strong", { text: user.name }), h("span", { text: user.userTag })));
    if (sameId(user.id, state.user?.id)) {
        box.append(h("span", { class: "muted", text: "Це ви" }));
        return;
    }
    const button = h("button", { class: "primary", type: "button", text: "Відкрити чат" });
    button.addEventListener("click", () => busy(button, () => createDirect(user)));
    box.append(button);
}

async function createDirect(user) {
    const knownIds = new Set(state.chats.filter(chat => chat.type === DIRECT).map(chat => chat.id.toLowerCase()));
    try {
        await api("/api/chats/create-direct", { method: "POST", form: { GuestId: user.id } });
        await loadChats();
        const created = state.chats.find(chat => chat.type === DIRECT && !knownIds.has(chat.id.toLowerCase()));
        if (!created) { showToast("Чат створено. Оновіть список, якщо він не з’явився.", "success"); return; }
        rememberDirectName(created.id, user.name);
        await selectChat(created.id);
    } catch (error) {
        if (!/already exist/i.test(error.rawMessage || "")) { showError(error); return; }
        // чат уже є — знаходимо його за збереженим іменем, а якщо direct лише один, то це він
        await loadChats();
        const directs = state.chats.filter(chat => chat.type === DIRECT);
        const existing = directs.find(chat => state.directNames[chat.id.toLowerCase()] === user.name)
            || (directs.length === 1 ? directs[0] : null);
        if (existing) { rememberDirectName(existing.id, user.name); await selectChat(existing.id); }
        else showToast("Чат із цим користувачем уже існує — знайдіть його у списку.", "info");
    }
}

/* ---------- SignalR ---------- */
const hubConnected = () =>
    Boolean(window.signalR && state.connection?.state === signalR.HubConnectionState.Connected);

const STATUS_TEXT = { online: "Онлайн", connecting: "Підключення…", retry: "Перепідключення…", offline: "Не підключено" };
function setHubStatus(status) {
    state.hubStatus = status;
    $("connectionText").textContent = STATUS_TEXT[status];
    $("connectionDot").className = `dot ${status === "online" ? "online" : status === "offline" ? "offline" : "pending"}`;
    updateComposer();
}

async function disconnectHub() {
    hubGeneration++;                           // анулює всі відкладені перепідключення
    const connection = state.connection;
    state.connection = null;
    state.joined.clear();
    if (connection) { try { await connection.stop(); } catch { /* вже зупинено */ } }
    setHubStatus("offline");
}

async function connectHub() {
    if (!state.token) return;
    if (!window.signalR) { showToast("Не вдалося завантажити клієнт реального часу. Оновіть сторінку.", "error"); return; }
    await disconnectHub();
    const generation = ++hubGeneration;

    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/hubs/chat", {
            // викликається при кожному (пере)підключенні, тож токен завжди свіжий
            accessTokenFactory: async () => {
                if (!state.token || tokenExpiresInMs() < 30_000) {
                    try { await refreshAccessToken(); }
                    catch (error) { if (error.authFailed) expireSession(); throw error; }
                }
                return state.token;
            }
        })
        .withAutomaticReconnect({ nextRetryDelayInMilliseconds: ctx => backoff(ctx.previousRetryCount) })   // ніколи не здаємось
        .configureLogging(DEBUG ? signalR.LogLevel.Information : signalR.LogLevel.Warning)
        .build();
    state.connection = connection;
    const current = () => generation === hubGeneration && state.connection === connection;

    connection.on("ReceiveMessage", payload => current() && void processHubMessage(payload, "received").catch(error => log(`SignalR receive processing failed: ${error.message}`)));
    connection.on("MessageEdited", payload => current() && void processHubMessage(payload, "edited").catch(error => log(`SignalR edit processing failed: ${error.message}`)));
    connection.on("MessageDeleted", payload => current() && void processHubMessage(payload, "deleted").catch(error => log(`SignalR delete processing failed: ${error.message}`)));
    connection.on("UserTyping", payload => current() && onUserTyping(payload));
    connection.onreconnecting(() => { if (current()) { setHubStatus("retry"); log("SignalR: reconnecting"); } });
    connection.onreconnected(async () => { if (current()) { setHubStatus("online"); log("SignalR: reconnected"); await onHubReady(true); } });
    connection.onclose(async () => {
        if (!current()) return;
        setHubStatus("retry");
        await sleep(backoff(0));
        if (current() && state.token) void connectHub();
    });

    let attempt = 0;
    while (current() && state.token) {
        setHubStatus(attempt === 0 ? "connecting" : "retry");
        try {
            await connection.start();
            if (!current()) { connection.stop().catch(() => {}); return; }
            setHubStatus("online");
            log("SignalR: connected");
            await onHubReady(false);
            return;
        } catch (error) {
            if (!current() || error?.authFailed) return;
            log(`SignalR: start failed (${attempt + 1})`);
            await sleep(backoff(attempt++));
        }
    }
}

/* Нове (пере)підключення: сервер у OnConnectedAsync сам додає у групи чатів, що існували на цей момент,
   а решту (чати, створені пізніше) ми додаємо через JoinRoom. Після розриву дозавантажуємо пропущене. */
async function onHubReady(wasReconnect) {
    state.joined.clear();
    await loadChats();
    await joinNewRooms();
    if (state.activeId && wasReconnect) await loadHistory(state.activeId, { preserve: true });
    updateComposer();
}

async function joinRoom(chatId) {
    if (!hubConnected()) return false;
    const key = chatId.toLowerCase();
    if (state.joined.has(key)) return true;      // позначаємо одразу, щоб паралельні виклики не дублювали JoinRoom
    state.joined.add(key);
    try { await state.connection.invoke("JoinRoom", chatId); return true; }
    catch { state.joined.delete(key); log("JoinRoom: відмовлено"); return false; }
}

async function joinNewRooms() {
    if (!hubConnected()) return;
    const pending = state.chats.filter(chat => !state.joined.has(chat.id.toLowerCase()));
    for (let i = 0; i < pending.length; i += 10) {
        await Promise.allSettled(pending.slice(i, i + 10).map(chat => joinRoom(chat.id)));
    }
}

/* ---------- повідомлення ---------- */
function normalizeMessage(raw) {
    return {
        id: String(pick(raw, "id", "Id") ?? ""),
        chatId: String(pick(raw, "chatId", "ChatId") ?? ""),
        senderId: String(pick(raw, "senderUserId", "SenderUserId") ?? ""),
        sender: String(pick(raw, "memberName", "MemberName") ?? "Невідомий"),
        text: String(pick(raw, "text", "Text") ?? ""),
        sentAt: parseServerDate(pick(raw, "sentAt", "SentAt")),
        changed: Boolean(pick(raw, "isChanged", "IsChanged")),
        deleted: Boolean(pick(raw, "isDeleted", "IsDeleted"))
    };
}

/* DTO не містить id відправника, тому «моє» визначаємо за ім'ям профілю в чаті (= ім'я акаунта).
   Права доступу все одно перевіряє сервер, тож помилка тут не дає чужих прав. */
const isMine = message => Boolean(state.user) && (message.senderId
    ? sameId(message.senderId, state.user.id)
    : message.sender === state.user.name);

async function decryptDirectMessage(message, chat) {
    if (chat?.type !== DIRECT || message.deleted) return message;
    if (!TelegramaE2EE.isEncrypted(message.text)) {
        message.legacyPlaintext = true;
        return message;
    }

    try {
        const context = await prepareE2eeChat(chat);
        if (!message.senderId) throw new Error("У повідомлення немає ID відправника.");
        const senderIsCurrentUser = sameId(message.senderId, state.user.id);
        if (!senderIsCurrentUser && !sameId(message.senderId, context.peerUserId)) {
            throw new Error("ID відправника не відповідає учаснику direct-чату.");
        }
        const recipientId = senderIsCurrentUser ? context.peerUserId : state.user.id;
        message.text = await TelegramaE2EE.decrypt(
            message.chatId,
            message.senderId,
            recipientId,
            context.identity,
            context.peerPublicKey,
            message.text);
        message.encrypted = true;
    } catch (error) {
        message.text = "Не вдалося розшифрувати. Перевірте, чи це той самий браузер і ключі не змінювались.";
        message.decryptError = true;
        log(`E2EE decrypt failed for message ${message.id}: ${error.message}`);
    }
    return message;
}

async function processHubMessage(raw, kind) {
    const message = normalizeMessage(raw);
    if (sameId(message.chatId, state.activeId)) {
        const chat = getChat(message.chatId);
        if (chat?.type === DIRECT) await decryptDirectMessage(message, chat);
    }
    if (kind === "received") onReceiveMessage(message);
    else if (kind === "deleted") onMessageChanged({ ...message, deleted: true });
    else onMessageChanged(message);
}

const emptyEl = text => h("div", { class: "empty", text });
const isNearBottom = () => { const b = $("messages"); return b.scrollHeight - b.scrollTop - b.clientHeight < 80; };
function scrollToBottom() { const b = $("messages"); b.scrollTop = b.scrollHeight; $("jumpBtn").classList.add("hidden"); }

function messageEl(message, prev) {
    const mine = isMine(message);
    const grouped = Boolean(prev) && prev.sender === message.sender
        && dayKey(prev.sentAt) === dayKey(message.sentAt) && message.sentAt - prev.sentAt < 5 * 60_000;
    const meta = h("div", { class: "meta" },
        h("span", { class: "time", text: fmtTime(message.sentAt) }),
        message.changed && !message.deleted ? h("span", { class: "edited", text: "змінено" }) : null);
    if (mine && !message.deleted) {
        meta.append(h("span", { class: "actions" },
            h("button", { type: "button", class: "msg-action", "data-action": "edit", title: "Редагувати", "aria-label": "Редагувати повідомлення", text: "✎" }),
            h("button", { type: "button", class: "msg-action", "data-action": "delete", title: "Видалити", "aria-label": "Видалити повідомлення", text: "🗑" })));
    }
    return h("article", {
        class: `message${mine ? " mine" : ""}${message.deleted ? " message-deleted" : ""}${grouped ? " grouped" : ""}`,
        dataset: { messageId: message.id }
    },
    !mine && !grouped ? h("div", { class: "sender", text: message.sender }) : null,
    message.legacyPlaintext ? h("span", { class: "message-security-label", text: "СТАРЕ ПОВІДОМЛЕННЯ · БЕЗ E2EE" }) : null,
    h("div", { class: "text", text: message.deleted ? "Повідомлення видалено" : message.text }),
    meta);
}

function appendMessageEl(message, prev) {
    const box = $("messages");
    box.querySelector(".empty")?.remove();
    if (!prev || dayKey(prev.sentAt) !== dayKey(message.sentAt)) {
        box.append(h("div", { class: "day-sep", role: "separator" }, h("span", { text: fmtDay(message.sentAt) })));
    }
    box.append(messageEl(message, prev));
}

function renderMessages({ stick = true } = {}) {
    const box = $("messages");
    const wasBottom = isNearBottom();
    const previousTop = box.scrollTop;
    box.replaceChildren();
    const { messages } = state.view;
    if (!messages.length) { box.append(emptyEl("Повідомлень ще немає. Напишіть перше!")); return; }
    messages.forEach((message, index) => appendMessageEl(message, messages[index - 1] ?? null));
    if (stick || wasBottom) scrollToBottom(); else box.scrollTop = previousTop;   // не збиваємо читання історії
}

function findMessageEl(id) {
    return [...$("messages").querySelectorAll("[data-message-id]")].find(el => sameId(el.dataset.messageId, id));
}

function upsertMessage(message) {
    const { messages } = state.view;
    const index = messages.findIndex(m => sameId(m.id, message.id));
    if (index >= 0) {
        messages[index] = message;
        findMessageEl(message.id)?.replaceWith(messageEl(message, messages[index - 1] ?? null));
    } else {
        const prev = messages.at(-1) ?? null;
        messages.push(message);
        appendMessageEl(message, prev);
    }
}

async function loadHistory(chatId, { preserve = false } = {}) {
    const view = state.view;
    view.loading = true;
    view.error = null;
    try {
        const result = await api(`/api/chats/${encodeURIComponent(chatId)}/last-messages?limit=${HISTORY_LIMIT}`);
        if (state.view !== view || !sameId(state.activeId, chatId)) return;
        const history = (payloadOf(result) || []).map(normalizeMessage);
        const activeChat = getChat(chatId);
        if (activeChat?.type === DIRECT) {
            await Promise.all(history.map(message => decryptDirectMessage(message, activeChat)));
            if (state.view !== view || !sameId(state.activeId, chatId)) return;
        }
        // події, що прийшли під час завантаження, накладаємо поверх історії
        const merged = new Map(history.map(m => [m.id.toLowerCase(), m]));
        for (const event of view.pending) merged.set(event.id.toLowerCase(), event);
        view.messages = [...merged.values()];
        view.pending = [];
        view.loading = false;
        renderMessages({ stick: !preserve });
        learnDirectName(chatId);
        if (isViewing()) scheduleMarkRead(chatId);
    } catch (error) {
        if (state.view !== view) return;
        view.loading = false;
        view.error = error;
        if (preserve && view.messages.length) { showError(error); return; }
        const retry = h("button", { class: "secondary", type: "button", text: "Спробувати ще раз" });
        retry.addEventListener("click", () => selectChat(chatId, { force: true }));
        $("messages").replaceChildren(h("div", { class: "empty" }, `Не вдалося завантажити історію: ${error.message}`, h("br"), retry));
    }
}

function learnDirectName(chatId) {
    const chat = getChat(chatId);
    if (!chat || chat.type !== DIRECT || state.directNames[chat.id.toLowerCase()]) return;
    const other = state.view.messages.find(m => !isMine(m));
    if (other) rememberDirectName(chat.id, other.sender);
}

function bumpActivity(chatId) {
    state.activity.set(getChat(chatId)?.id ?? chatId, Date.now());
    sortChats();
}

function onReceiveMessage(message) {
    clearTyping(message.chatId, message.sender);
    bumpActivity(message.chatId);
    const active = sameId(message.chatId, state.activeId);
    const mine = isMine(message);

    if (active) {
        if (state.view.loading) state.view.pending.push(message);
        else {
            const stick = mine || isNearBottom();
            upsertMessage(message);
            if (stick) scrollToBottom(); else $("jumpBtn").classList.remove("hidden");
            learnDirectName(message.chatId);
        }
        if (!mine && isViewing()) scheduleMarkRead(message.chatId);
    }
    if (!mine && !(active && isViewing())) {
        const chat = getChat(message.chatId);
        if (chat) chat.unreadCount += 1;
        else { void loadChats(); return; }          // чат ще невідомий клієнту
    }
    renderChats();
    // звіряємо локальний лічильник із сервером, але не на кожне повідомлення
    clearTimeout(onReceiveMessage.reconcile);
    onReceiveMessage.reconcile = setTimeout(loadChats, 2_000);
}

function onMessageChanged(message) {
    if (!sameId(message.chatId, state.activeId)) return;
    if (state.view.loading) { state.view.pending.push(message); return; }
    if (!state.view.messages.some(m => sameId(m.id, message.id))) return;   // повідомлення старіше за завантажену історію
    const old = state.view.messages.find(m => sameId(m.id, message.id));
    upsertMessage({ ...message, sentAt: old.sentAt });
    if (state.editing && sameId(state.editing.id, message.id) && message.deleted) cancelEdit(true);
}

function scheduleMarkRead(chatId) {
    const key = chatId.toLowerCase();
    clearTimeout(readTimers.get(key));
    readTimers.set(key, setTimeout(async () => {
        readTimers.delete(key);
        try {
            await api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: "POST" });
            const chat = getChat(chatId);
            if (chat) { chat.unreadCount = 0; renderChats(); }
        } catch (error) { log(`read: ${error.message}`); }
    }, 300));
}

/* ---------- індикатор набору ---------- */
function onUserTyping(payload) {
    const chatId = pick(payload, "chatId", "ChatId");
    const name = pick(payload, "chatProfileName", "ChatProfileName") || "Хтось";
    if (!sameId(chatId, state.activeId)) return;
    const key = `${chatId}|${name}`.toLowerCase();
    clearTimeout(state.typing.get(key)?.timer);
    const timer = setTimeout(() => { state.typing.delete(key); renderTyping(); }, TYPING_SHOW_MS);
    state.typing.set(key, { name, timer });
    renderTyping();
}
function clearTyping(chatId, name) {
    const key = `${chatId}|${name}`.toLowerCase();
    const entry = state.typing.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    state.typing.delete(key);
    if (sameId(chatId, state.activeId)) renderTyping();
}
function renderTyping() {
    const names = [...state.typing.values()].map(entry => entry.name);
    $("typingIndicator").textContent = !names.length ? ""
        : names.length === 1 ? `${names[0]} друкує…`
        : `${names.slice(0, 2).join(", ")}${names.length > 2 ? " та ще" : ""} друкують…`;
}
function sendTyping() {
    if (!state.activeId || !hubConnected() || Date.now() - lastTypingSentAt < TYPING_SEND_THROTTLE_MS) return;
    lastTypingSentAt = Date.now();
    state.connection.invoke("Typing", state.activeId).catch(() => {});
}

/* ---------- екран чату і поле вводу ---------- */
function renderHeader() {
    const chat = getChat(state.activeId);
    $("chatView").classList.toggle("no-chat", !chat);
    if (!chat) {
        setEncryptionStatus(null);
        return;
    }
    $("activeChatName").textContent = displayName(chat);
    $("activeChatMeta").textContent = `${CHAT_TYPE_LABEL[chat.type] ?? "Чат"} · ${chat.usersCount} учасн.`;
    $("copyInviteBtn").classList.toggle("hidden", chat.type === DIRECT);
    if (chat.type === DIRECT) {
        const context = state.e2ee.peerKeys.get(chat.id.toLowerCase());
        if (context) setEncryptionStatus(chat, "🔒 E2EE увімкнено", "ready");
        else if (state.e2ee.errors.has(chat.id.toLowerCase())) setEncryptionStatus(chat, "⚠ E2EE не готове", "error");
        else setEncryptionStatus(chat, "Налаштування E2EE…", "pending");
    } else {
        setEncryptionStatus(null);
    }
}

function setEncryptionStatus(chat, text = "", stateName = "") {
    const status = $("chatEncryptionStatus");
    status.classList.toggle("hidden", !chat || chat.type !== DIRECT);
    status.dataset.state = stateName;
    status.textContent = text;
}

function prepareE2eeChat(chat) {
    const cacheKey = chat.id.toLowerCase();
    const cached = state.e2ee.peerKeys.get(cacheKey);
    if (cached) {
        state.e2ee.readyChatId = chat.id;
        state.e2ee.errors.delete(cacheKey);
        if (sameId(chat.id, state.activeId)) { renderHeader(); updateComposer(); }
        return Promise.resolve(cached);
    }
    if (state.e2ee.pending.has(cacheKey)) return state.e2ee.pending.get(cacheKey);

    const pending = (async () => {
        state.e2ee.errors.delete(cacheKey);
        if (sameId(chat.id, state.activeId)) {
            setEncryptionStatus(chat, "Налаштування E2EE…", "pending");
            updateComposer();
        }

        const identity = state.e2ee.identity || await TelegramaE2EE.ensureIdentity(state.user.id);
        state.e2ee.identity = identity;
        await api("/api/e2ee/public-key", {
            method: "PUT",
            json: { publicKey: identity.publicKey }
        });
        const result = await api(`/api/e2ee/chats/${encodeURIComponent(chat.id)}/peer-key`);
        const peer = payloadOf(result);
        if (!peer?.userId || !peer?.publicKey) throw new Error("Сервер не повернув ключ співрозмовника.");

        const context = { identity, peerUserId: String(peer.userId), peerPublicKey: peer.publicKey };
        state.e2ee.peerKeys.set(cacheKey, context);
        state.e2ee.readyChatId = chat.id;
        state.e2ee.errors.delete(cacheKey);
        if (sameId(chat.id, state.activeId)) { renderHeader(); updateComposer(); }
        return context;
    })().catch(error => {
        state.e2ee.errors.set(cacheKey, error.message);
        if (sameId(chat.id, state.activeId)) {
            setEncryptionStatus(chat, "⚠ E2EE не готове", "error");
            updateComposer();
        }
        throw error;
    }).finally(() => state.e2ee.pending.delete(cacheKey));

    state.e2ee.pending.set(cacheKey, pending);
    return pending;
}

function autosizeInput() {
    const input = $("messageInput");
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}

function updateComposer() {
    const input = $("messageInput");
    const length = input.value.length;
    const online = hubConnected();
    const chat = getChat(state.activeId);
    const encryptionReady = chat?.type !== DIRECT || state.e2ee.peerKeys.has(chat.id.toLowerCase());
    $("sendBtn").disabled = !online || !encryptionReady || state.sending || !input.value.trim();
    $("sendBtn").textContent = state.editing ? "Зберегти" : "Надіслати";
    $("composerHint").textContent = !online
        ? "Немає з’єднання із сервером — надсилання тимчасово недоступне."
        : !encryptionReady ? (state.e2ee.errors.get(chat?.id.toLowerCase()) || "Підготуйте E2EE-ключі, щоб писати в особистому чаті.") : "";
    $("charCounter").textContent = length >= MAX_MESSAGE_LENGTH - 200 ? `${length}/${MAX_MESSAGE_LENGTH}` : "";
}

function saveDraft() {
    if (state.activeId && !state.editing) {
        const text = $("messageInput").value;
        if (text) state.drafts.set(state.activeId.toLowerCase(), text); else state.drafts.delete(state.activeId.toLowerCase());
    }
}

function startEdit(messageId) {
    const message = state.view.messages.find(m => sameId(m.id, messageId));
    if (!message || !isMine(message) || message.deleted) return;
    if (!state.editing) saveDraft();
    state.editing = { id: message.id };
    $("editBannerText").textContent = message.text.length > 80 ? `${message.text.slice(0, 80)}…` : message.text;
    $("editBanner").classList.remove("hidden");
    const input = $("messageInput");
    input.value = message.text;
    autosizeInput();
    updateComposer();
    input.focus();
}

function cancelEdit(keepText = false) {
    if (!state.editing) return;
    state.editing = null;
    $("editBanner").classList.add("hidden");
    if (!keepText) {
        $("messageInput").value = state.drafts.get(state.activeId?.toLowerCase()) || "";
        autosizeInput();
    }
    updateComposer();
}

async function submitComposer() {
    if (state.sending || !state.activeId) return;
    const input = $("messageInput");
    const text = input.value.trim();
    if (!text) return;
    if (text.length > MAX_MESSAGE_LENGTH) { showToast(`Повідомлення задовге (максимум ${MAX_MESSAGE_LENGTH} символів).`, "error"); return; }
    if (!hubConnected()) { showToast("Немає з’єднання із сервером. Спробуйте за мить.", "error"); return; }

    const chatId = state.activeId;
    const chat = getChat(chatId);
    state.sending = true;
    updateComposer();
    try {
        let payload = text;
        if (chat?.type === DIRECT) {
            const context = await prepareE2eeChat(chat);
            payload = await TelegramaE2EE.encrypt(
                chatId, state.user.id, context.peerUserId, context.identity, context.peerPublicKey, text);
        }
        if (state.editing) {
            const original = state.view.messages.find(m => sameId(m.id, state.editing.id));
            if (original && original.text === text) { cancelEdit(); return; }
            await state.connection.invoke("EditMessage", chatId, state.editing.id, payload);
            cancelEdit();
        } else {
            await state.connection.invoke("SendToRoom", chatId, payload);
            state.drafts.delete(chatId.toLowerCase());
            input.value = "";
            autosizeInput();
        }
    } catch (error) { showError(hubError(error)); }
    finally { state.sending = false; updateComposer(); input.focus(); }
}

async function deleteMessage(messageId) {
    if (!state.activeId || !hubConnected()) { showToast("Немає з’єднання із сервером.", "error"); return; }
    if (!window.confirm("Видалити це повідомлення для всіх?")) return;
    try { await state.connection.invoke("DeleteMessageAsync", state.activeId, messageId); }
    catch (error) { showError(hubError(error)); }
}

async function selectChat(id, { force = false } = {}) {
    const chat = getChat(id);
    if (!chat) return;
    if (!force && sameId(chat.id, state.activeId) && !state.view.error) { $("messageInput").focus(); return; }

    saveDraft();
    cancelEdit(true);
    state.activeId = chat.id;
    state.e2ee.readyChatId = null;
    state.view = newView();
    state.view.loading = true;
    for (const entry of state.typing.values()) clearTimeout(entry.timer);
    state.typing.clear();
    renderTyping();

    $("welcome").classList.add("hidden");
    $("chatView").classList.remove("hidden");
    $("messages").replaceChildren(emptyEl("Завантажую історію…"));
    $("jumpBtn").classList.add("hidden");
    $("messageInput").value = state.drafts.get(chat.id.toLowerCase()) || "";
    autosizeInput();
    renderHeader();
    renderChats(true);
    updateComposer();
    if (window.matchMedia?.("(max-width: 850px)").matches) $("chatView").scrollIntoView?.({ block: "start" });

    await joinRoom(chat.id);
    if (chat.type === DIRECT) {
        try { await prepareE2eeChat(chat); }
        catch (error) { showToast(error.message, "error"); }
    }
    await loadHistory(chat.id);
    if (window.matchMedia?.("(pointer: fine)").matches) $("messageInput").focus();
}

/* ---------- автентифікація: інтерфейс ---------- */
async function busy(button, task) {
    if (button.disabled) return undefined;
    button.disabled = true;
    try { return await task(); } finally { button.disabled = false; }
}

function showAuthenticated() {
    $("authPanel").classList.add("hidden");
    $("userPanel").classList.remove("hidden");
    $("welcome").classList.add("hidden");
    $("chatView").classList.remove("hidden");

    $("userName").textContent = state.user.name;
    $("userTag").textContent = state.user.userTag;
    $("userAvatar").textContent = state.user.name.charAt(0).toUpperCase() || "?";
    $("screenTitle").textContent = "Мої чати";
    $("screenSubtitle").textContent = "Ваші особисті та групові розмови";
    renderHeader();
}

function showLoggedOut() {
    $("authPanel").classList.remove("hidden");
    $("userPanel").classList.add("hidden");
    $("welcome").classList.remove("hidden");
    $("chatView").classList.add("hidden");
    $("screenTitle").textContent = "Вітаємо в Telegrama";
    $("screenSubtitle").textContent = "Увійдіть або створіть обліковий запис";
    $("editBanner").classList.add("hidden");
    document.title = "Telegrama — чати";
    setHubStatus("offline");
}

function resetAppState() {
    clearInterval(pollTimer);
    pollTimer = null;
    for (const timer of readTimers.values()) clearTimeout(timer);
    readTimers.clear();
    for (const entry of state.typing.values()) clearTimeout(entry.timer);
    clearTimeout(onReceiveMessage.reconcile);
    state.typing.clear();
    state.chats = [];
    state.activeId = null;
    state.view = newView();
    state.drafts.clear();
    state.activity.clear();
    state.editing = null;
    state.sending = false;
    lastChatsSignature = "";
    $("chatList").replaceChildren();
    $("messages").replaceChildren();
    $("messageInput").value = "";
    renderTyping();
}

function enterApp() {
    loadDirectNames();
    showAuthenticated();
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
        if (state.token && document.visibilityState === "visible") void loadChats();
    }, CHAT_POLL_MS);
    void loadChats();
    void connectHub();
    if (state.pendingJoinId) {
        $("joinPanel").open = true;
        $("joinChatId").value = state.pendingJoinId;
        showToast("Натисніть «Приєднатися», щоб увійти в чат за запрошенням.", "info");
        state.pendingJoinId = null;
    }
}

function expireSession(message = "Сесія завершилась. Увійдіть знову.") {
    if (!state.token && !state.user) return;
    clearAuth();
    void disconnectHub();
    resetAppState();
    showLoggedOut();
    showToast(message, "error");
}

async function logout() {
    try { await api("/api/users/session/logout", { method: "POST" }); } catch { log("logout: помилка"); }
    authChannel?.postMessage("logout");
    clearAuth();
    await disconnectHub();
    resetAppState();
    showLoggedOut();
    showLoginTab();
}

async function login(email, password) {
    const result = await api("/api/users/login", { method: "POST", auth: false, form: { Email: email, Password: password } });
    const token = payloadOf(result);
    if (typeof token !== "string") throw new Error("Сервер не повернув токен доступу.");
    saveToken(token);
    $("loginPassword").value = "";
    enterApp();
}

function setVerificationNotice(message, kind = "info") {
    const notice = $("verificationNotice");
    notice.textContent = message;
    notice.dataset.kind = kind;
}

function startResendCooldown(seconds = 60) {
    clearInterval(resendTimer);
    const button = $("resendVerificationBtn");
    const endsAt = Date.now() + seconds * 1000;
    button.disabled = true;
    const update = () => {
        const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        if (left === 0) {
            clearInterval(resendTimer);
            resendTimer = null;
            button.disabled = false;
            button.textContent = "Надіслати код ще раз";
        } else button.textContent = `Повторне надсилання через ${left} с`;
    };
    update();
    resendTimer = setInterval(update, 1000);
}

function showVerification(email, notice = "Введіть код із листа, щоб підтвердити адресу.", cooldownSeconds = 0) {
    $("loginForm").classList.add("hidden");
    $("registerForm").classList.add("hidden");
    $("verificationForm").classList.remove("hidden");
    document.querySelector(".tabs").classList.add("hidden");
    $("authNotice").classList.add("hidden");
    $("verificationEmailLabel").textContent = email;
    $("verificationEmailLabel").dataset.email = email;
    $("verificationCode").value = "";
    setVerificationNotice(notice);
    clearInterval(resendTimer);
    resendTimer = null;
    $("resendVerificationBtn").disabled = false;
    $("resendVerificationBtn").textContent = "Надіслати код ще раз";
    if (cooldownSeconds > 0) startResendCooldown(cooldownSeconds);
    $("verificationCode").focus();
}

function showLoginTab(email = "", notice = "") {
    clearInterval(resendTimer);
    resendTimer = null;
    document.querySelector(".tabs").classList.remove("hidden");
    $("verificationForm").classList.add("hidden");
    $("registerForm").classList.add("hidden");
    $("loginForm").classList.remove("hidden");
    document.querySelectorAll(".tab").forEach(tab => {
        const active = tab.dataset.tab === "login";
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
    });
    if (email) $("loginEmail").value = email;
    $("authNotice").textContent = notice;
    $("authNotice").classList.toggle("hidden", !notice);
}

/* ---------- обробники подій ---------- */
document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
    document.querySelector(".tabs").classList.remove("hidden");
    $("verificationForm").classList.add("hidden");
    document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.toggle("active", tab === button);
        tab.setAttribute("aria-selected", String(tab === button));
    });
    $("loginForm").classList.toggle("hidden", button.dataset.tab !== "login");
    $("registerForm").classList.toggle("hidden", button.dataset.tab !== "register");
    $("authNotice").classList.add("hidden");
}));

$("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    await busy(event.submitter || event.target.querySelector("[type=submit]"), async () => {
        try { await login($("loginEmail").value.trim(), $("loginPassword").value); }
        catch (error) {
            if (error.statusCode === 403) {
                showVerification($("loginEmail").value.trim(), "Цю адресу ще не підтверджено. Введіть код із листа або запросіть новий.");
                return;
            }
            showError(error);
        }
    });
});

$("registerForm").addEventListener("submit", async event => {
    event.preventDefault();
    await busy(event.submitter || event.target.querySelector("[type=submit]"), async () => {
        const values = {
            Name: $("regName").value.trim(), Email: $("regEmail").value.trim(),
            PhoneNumber: $("regPhone").value.trim(), UserTag: $("regTag").value.trim(), Password: $("regPassword").value
        };
        try {
            await api("/api/users/register", { method: "POST", auth: false, form: values });
            $("regPassword").value = "";
            showVerification(values.Email, "Код надіслано. Перевірте пошту та введіть його нижче.", 60);
        } catch (error) {
            // акаунт створено, але лист не пішов (SMTP) — користувач може запросити код ще раз
            if (error.statusCode === 503 || error.statusCode === 429) {
                showVerification(values.Email, "Акаунт створено, але лист не вдалося надіслати. Запросіть код ще раз за хвилину.", 60);
                return;
            }
            showError(error);
        }
    });
});

$("verificationForm").addEventListener("submit", async event => {
    event.preventDefault();
    await busy(event.submitter || event.target.querySelector("[type=submit]"), async () => {
        const email = $("verificationEmailLabel").dataset.email;
        try {
            await api("/api/users/verify-email", { method: "POST", auth: false, form: { Email: email, Code: $("verificationCode").value.trim() } });
            showLoginTab(email, "Адресу підтверджено. Тепер увійдіть з email і паролем.");
            $("loginPassword").focus();
        } catch (error) { setVerificationNotice(error.message, "error"); }
    });
});

$("resendVerificationBtn").addEventListener("click", async () => {
    const email = $("verificationEmailLabel").dataset.email;
    try {
        await api("/api/users/resend-verification", { method: "POST", auth: false, form: { Email: email } });
        setVerificationNotice("Якщо акаунт існує й не підтверджений, новий код надіслано. Перевірте пошту.", "success");
        startResendCooldown(60);
    } catch (error) {
        setVerificationNotice(error.message, "error");
        if (error.statusCode === 429) startResendCooldown(60);
    }
});

$("backToAuthBtn").addEventListener("click", () => showLoginTab($("verificationEmailLabel").dataset.email));

$("tagSearchForm").addEventListener("submit", async event => {
    event.preventDefault();
    await busy(event.submitter || event.target.querySelector("[type=submit]"), async () => {
        try { await searchTag($("tagSearch").value.trim()); }
        catch (error) {
            $("tagSearchResult").className = "result-box empty error-text";
            $("tagSearchResult").textContent = error.message;
        }
    });
});

$("createChatForm").addEventListener("submit", async event => {
    event.preventDefault();
    await busy(event.submitter || event.target.querySelector("[type=submit]"), async () => {
        try { await createGroup($("chatName").value.trim(), $("chatType").value); $("chatName").value = ""; }
        catch (error) { showError(error); }
    });
});

$("joinChatForm").addEventListener("submit", async event => {
    event.preventDefault();
    await busy(event.submitter || event.target.querySelector("[type=submit]"), async () => {
        try { await joinChat($("joinChatId").value.trim()); $("joinChatId").value = ""; }
        catch (error) { showError(error); }
    });
});

$("chatList").addEventListener("click", event => {
    const item = event.target.closest(".chat-item");
    if (item) void selectChat(item.dataset.chatId);
});

$("messages").addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    const message = button?.closest("[data-message-id]");
    if (!message) return;
    if (button.dataset.action === "edit") startEdit(message.dataset.messageId);
    else if (button.dataset.action === "delete") void deleteMessage(message.dataset.messageId);
});
$("messages").addEventListener("scroll", () => { if (isNearBottom()) $("jumpBtn").classList.add("hidden"); });
$("jumpBtn").addEventListener("click", scrollToBottom);

$("messageForm").addEventListener("submit", event => { event.preventDefault(); void submitComposer(); });
$("messageInput").addEventListener("input", () => {
    autosizeInput();
    updateComposer();
    if (!state.editing && $("messageInput").value.trim()) sendTyping();
});
$("messageInput").addEventListener("keydown", event => {
    if (event.isComposing) return;                                   // не чіпаємо введення через IME
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitComposer(); }
    else if (event.key === "Escape" && state.editing) cancelEdit();
    else if (event.key === "ArrowUp" && !$("messageInput").value && !state.editing) {
        const last = [...state.view.messages].reverse().find(m => isMine(m) && !m.deleted);
        if (last) { event.preventDefault(); startEdit(last.id); }
    }
});
$("cancelEditBtn").addEventListener("click", () => cancelEdit());

$("copyInviteBtn").addEventListener("click", async () => {
    const chat = getChat(state.activeId);
    if (!chat) return;
    const ok = await copyText(`${location.origin}/#join=${chat.id}`);
    showToast(ok ? "Посилання-запрошення скопійовано." : "Не вдалося скопіювати посилання.", ok ? "success" : "error");
});

$("refreshChatsBtn").addEventListener("click", () => void loadChats());
$("clearLogBtn").addEventListener("click", () => { $("log").textContent = ""; });
$("logoutBtn").addEventListener("click", () => busy($("logoutBtn"), logout));

/* ---------- життєвий цикл сторінки ---------- */
function onWake() {
    if (!state.token) return;
    if (tokenExpiresInMs() < REFRESH_MARGIN_MS) refreshAccessToken().catch(handleRefreshFailure);
    void loadChats();
    if (isViewing() && getChat(state.activeId)?.unreadCount > 0) scheduleMarkRead(state.activeId);
    if (state.hubStatus === "offline") void connectHub();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onWake(); });
window.addEventListener("focus", onWake);
window.addEventListener("online", () => {
    $("offlineBanner").classList.add("hidden");
    if (state.token) onWake(); else if (!state.user) void restoreSession();
});
window.addEventListener("offline", () => $("offlineBanner").classList.remove("hidden"));

if ("BroadcastChannel" in window) {
    authChannel = new BroadcastChannel("telegrama-auth");
    authChannel.onmessage = event => {
        if (event.data === "logout" && state.token) {
            clearAuth(); void disconnectHub(); resetAppState(); showLoggedOut(); showLoginTab();
            showToast("Ви вийшли з акаунта в іншій вкладці.", "info");
        }
    };
}

async function restoreSession() {
    try {
        await refreshAccessToken();
        enterApp();
    } catch (error) {
        showLoggedOut();
        if (error.isNetwork) {
            $("authNotice").textContent = "Немає з’єднання із сервером. Спробуємо ще раз, щойно з’явиться інтернет.";
            $("authNotice").classList.remove("hidden");
        }
    } finally { document.body.classList.remove("booting"); }
}

function init() {
    $("debugPanel").classList.toggle("hidden", !DEBUG);
    try {     // прибираємо токени, які зберігали старі версії клієнта
        for (const key of ["telegrama_token", "telegrama_user"]) { sessionStorage.removeItem(key); localStorage.removeItem(key); }
    } catch { /* сховище вимкнене */ }

    const invite = /^#join=([0-9a-f-]{36})$/i.exec(location.hash);
    if (invite && GUID_RE.test(invite[1])) {
        state.pendingJoinId = invite[1];
        history.replaceState(null, "", location.pathname + location.search);
        $("authNotice").textContent = "Увійдіть, щоб приєднатися до чату за запрошенням.";
        $("authNotice").classList.remove("hidden");
    }
    $("messageInput").maxLength = MAX_MESSAGE_LENGTH;
    if (!navigator.onLine) $("offlineBanner").classList.remove("hidden");
    updateComposer();
    void restoreSession();
}

init();
})();
