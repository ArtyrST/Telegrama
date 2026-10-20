(() => {
"use strict";

const PREFIX = "TG-E2EE:v1:";
const DATABASE = "telegrama-e2ee";
const STORE = "identities";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
let databasePromise;

function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Не вдалося відкрити сховище ключів."));
    });
    return databasePromise;
}

async function readIdentity(userId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE, "readonly").objectStore(STORE).get(userId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("Не вдалося прочитати ключ."));
    });
}

async function saveIdentity(userId, identity) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, "readwrite");
        transaction.objectStore(STORE).put(identity, userId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("Не вдалося зберегти ключ."));
        transaction.onabort = () => reject(transaction.error || new Error("Не вдалося зберегти ключ."));
    });
}

async function ensureIdentity(userId) {
    if (!globalThis.isSecureContext) {
        throw new Error("Для E2EE потрібен HTTPS. На цьому комп’ютері можна використовувати http://localhost, але для підключення з іншого пристрою налаштуйте HTTPS.");
    }
    if (!globalThis.crypto?.subtle || !globalThis.indexedDB) {
        throw new Error("Цей браузер не підтримує потрібне сховище або Web Crypto API.");
    }

    const existing = await readIdentity(userId);
    if (existing?.privateKey && existing?.publicKey) return existing;

    const pair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveBits"]);
    const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const identity = {
        privateKey: pair.privateKey,
        publicKey: { kty: exported.kty, crv: exported.crv, x: exported.x, y: exported.y }
    };
    await saveIdentity(userId, identity);
    return identity;
}

function fromBase64Url(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function toBase64Url(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function keyInfo(chatId, firstUserId, secondUserId) {
    const users = [firstUserId.toLowerCase(), secondUserId.toLowerCase()].sort();
    return encoder.encode(`Telegrama direct E2EE v1|${chatId.toLowerCase()}|${users[0]}|${users[1]}`);
}

function associatedData(chatId, senderId, recipientId) {
    return encoder.encode(`${PREFIX}${chatId.toLowerCase()}|${senderId.toLowerCase()}|${recipientId.toLowerCase()}`);
}

async function deriveMessageKey(privateKey, peerJwk, salt, chatId, userId, peerUserId) {
    const publicKey = await crypto.subtle.importKey(
        "jwk",
        { kty: peerJwk.kty, crv: peerJwk.crv, x: peerJwk.x, y: peerJwk.y },
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []);
    const sharedSecret = await crypto.subtle.deriveBits(
        { name: "ECDH", public: publicKey }, privateKey, 256);
    const hkdfKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt, info: keyInfo(chatId, userId, peerUserId) },
        hkdfKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]);
}

async function encrypt(chatId, senderId, recipientId, identity, recipientPublicKey, plaintext) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveMessageKey(
        identity.privateKey, recipientPublicKey, salt, chatId, senderId, recipientId);
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: associatedData(chatId, senderId, recipientId), tagLength: 128 },
        key,
        encoder.encode(plaintext));

    return PREFIX + JSON.stringify({
        v: 1,
        chatId,
        from: senderId,
        salt: toBase64Url(salt),
        iv: toBase64Url(iv),
        ciphertext: toBase64Url(new Uint8Array(ciphertext))
    });
}

function parseEnvelope(payload) {
    if (typeof payload !== "string" || !payload.startsWith(PREFIX)) return null;
    try { return JSON.parse(payload.slice(PREFIX.length)); }
    catch { throw new Error("Формат зашифрованого повідомлення пошкоджений."); }
}

async function decrypt(chatId, senderId, recipientId, identity, peerPublicKey, payload) {
    const envelope = parseEnvelope(payload);
    if (!envelope) return null;
    if (envelope.v !== 1 || envelope.chatId?.toLowerCase() !== chatId.toLowerCase()
        || envelope.from?.toLowerCase() !== senderId.toLowerCase()) {
        throw new Error("Не збігаються дані зашифрованого повідомлення.");
    }

    const salt = fromBase64Url(envelope.salt);
    const iv = fromBase64Url(envelope.iv);
    const ciphertext = fromBase64Url(envelope.ciphertext);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > 12_000) {
        throw new Error("Некоректний розмір зашифрованого повідомлення.");
    }

    const key = await deriveMessageKey(
        identity.privateKey, peerPublicKey, salt, chatId, senderId, recipientId);
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: associatedData(chatId, senderId, recipientId), tagLength: 128 },
        key,
        ciphertext);
    return decoder.decode(plaintext);
}

globalThis.TelegramaE2EE = Object.freeze({
    prefix: PREFIX,
    isEncrypted: payload => typeof payload === "string" && payload.startsWith(PREFIX),
    ensureIdentity,
    encrypt,
    decrypt
});
})();
