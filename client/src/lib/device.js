// A random id for this browser, kept in localStorage.
// The server uses it (with the IP address) for the anonymous daily chat limit,
// reports and bans. It is not linked to any account.

const KEY = 'blinktalk:device';
let memoryId = null;

function newId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getDeviceId() {
    try {
        const saved = localStorage.getItem(KEY);
        if (saved) return saved;
        const id = memoryId || newId();
        localStorage.setItem(KEY, id);
        return id;
    } catch {
        // Storage blocked (private mode, strict settings): keep one id for this page load
        memoryId ??= newId();
        return memoryId;
    }
}
