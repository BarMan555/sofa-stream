// --- Configuration & Global State Management ---
const API_BASE_URL = window.SOFASTREAM_CONFIG?.apiBaseUrl || ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:5063"
    : window.location.origin);

let appConfig = {
    api: {
        defaultPort: 5063,
        reconnectIntervalMs: 60000,
        interactionGracePeriodMs: 2000,
        inactivityDurationMs: 3000
    },
    defaultTheme: "WarmHome"
};

// Async load external JSON configuration
async function loadAppConfig() {
    try {
        const response = await fetch('data/config.json');
        if (response.ok) {
            const data = await response.json();
            appConfig = { ...appConfig, ...data };
            console.log("App configuration loaded from config.json", appConfig);
        }
    } catch (e) {
        console.warn("Could not load config.json, using defaults.", e);
    }
}
loadAppConfig();

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

let globalUserId = null;
let localNickname = "Me";
let currentRoomId = null;
let isHost = false;
let isJoiningRoom = false;
let lastUiInteractionTime = 0;
const INTERACTION_GRACE_PERIOD_MS = 2000;
let activeParticipants = new Set();
let currentSettingsMode = 'create'; // 'create' or 'join'
let selectedTheme = 'WarmHome';
let serverTimeOffset = 0;

async function syncClockWithServer() {
    try {
        const clientSendTime = Date.now();
        const response = await fetch(`${API_BASE_URL}/api/room/time`);
        const data = await response.json();

        const clientReceiveTime = Date.now();
        const serverTime = new Date(data.serverTimeUtc).getTime();

        const ping = (clientReceiveTime - clientSendTime) / 2;
        const estimatedExactServerTime = serverTime + ping;
        serverTimeOffset = estimatedExactServerTime - clientReceiveTime;

        console.log(`Clock synced! Ping: ${ping}ms, Server Offset: ${serverTimeOffset}ms`);
    } catch (err) {
        console.error("Failed to sync clock with server", err);
    }
}

function getExactServerTimeNow() {
    return Date.now() + serverTimeOffset;
}

syncClockWithServer();
setInterval(syncClockWithServer, 60000);

// Export to window for global module usage
window.API_BASE_URL = API_BASE_URL;
window.globalUserId = globalUserId;
window.getExactServerTimeNow = getExactServerTimeNow;
