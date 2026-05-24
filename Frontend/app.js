// --- Configuration ---
const API_BASE_URL = window.location.origin;

// --- Time Synchronization (NTP) ---
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

let currentRoomId = null;
let isHost = false;

const PlaybackState = {
    Paused: 0,
    Playing: 1,
    Buffering: 2
};

// --- Player Adapter (Pattern) ---
class YouTubeAdapter {
    constructor(containerId, onStateChangeCallback, onPlayerReadyCallback) {
        this.player = new YT.Player(containerId, {
            height: '390',
            width: '640',
            videoId: '',
            playerVars: {
                'playsinline': 1,
                'disablekb': 1,
                'controls': 0,
                'rel': 0,
                'showinfo': 0,
                'modestbranding': 1,
                'origin': window.location.origin
            },
            events: {
                'onStateChange': (event) => {
                    let domainState = null;
                    if (event.data === YT.PlayerState.PLAYING) domainState = PlaybackState.Playing;
                    else if (event.data === YT.PlayerState.PAUSED) domainState = PlaybackState.Paused;
                    else if (event.data === YT.PlayerState.BUFFERING) domainState = PlaybackState.Buffering;

                    if (domainState !== null) {
                        onStateChangeCallback(domainState);
                    }
                },
                'onReady': () => {
                    console.log("YouTube Player is fully READY.");
                    onPlayerReadyCallback();
                }
            }
        });
    }

    play() { if (this.player && this.player.playVideo) this.player.playVideo(); }
    pause() { if (this.player && this.player.pauseVideo) this.player.pauseVideo(); }
    seekTo(seconds) { if (this.player && this.player.seekTo) this.player.seekTo(seconds, true); }
    getCurrentTime() { return (this.player && this.player.getCurrentTime) ? this.player.getCurrentTime() : 0; }

    loadVideo(videoId, startSeconds = 0) {
        if (this.player && this.player.loadVideoById) {
            this.player.loadVideoById(videoId, startSeconds);
        }
    }

    cueVideo(videoId, startSeconds = 0) {
        if (this.player && this.player.cueVideoById) {
            this.player.cueVideoById(videoId, startSeconds);
        }
    }
}

// --- Finite State Machine (FSM) ---
const MachineState = {
    IDLE: 'IDLE',
    WAITING_SERVER: 'WAITING_SERVER',
    SYNCING: 'SYNCING',
    SCHEDULED_PLAY: 'SCHEDULED_PLAY'
};

class SyncStateMachine {
    constructor(sendUpdateCallback) {
        this.player = null;
        this.sendUpdate = sendUpdateCallback;
        this.currentState = MachineState.IDLE;
        this.isHost = false;
    }

    setPlayer(player) {
        this.player = player;
    }

    setHostStatus(isHostStatus) {
        this.isHost = isHostStatus;
        console.log(`FSM: Host status updated to: ${isHostStatus}`);
    }

    handleLocalEvent(domainState) {
        if (this.currentState === MachineState.SYNCING || this.currentState === MachineState.SCHEDULED_PLAY) return;
        if (!currentRoomId) return;
        if (!this.player) return;

        // ЗАЩИТА ГОСТЯ
        if (!this.isHost) {
            this.enterSyncingState(() => {
                this.player.pause();
                const statusEl = document.getElementById('status');
                if (statusEl) {
                    const oldText = statusEl.innerText;
                    statusEl.innerText = "⚠️ Только Host может управлять просмотром!";
                    statusEl.style.color = "red";
                    setTimeout(() => { statusEl.innerText = oldText; statusEl.style.color = ""; }, 3000);
                }
            });
            return;
        }

        // ЛОГИКА ХОСТА
        if (this.currentState === MachineState.IDLE) {
            if (domainState === PlaybackState.Playing) {
                this.currentState = MachineState.WAITING_SERVER;
                this.player.pause();
                this.sendUpdate(PlaybackState.Playing);
            }
            else if (domainState === PlaybackState.Paused) {
                this.sendUpdate(PlaybackState.Paused);
            }
        }
    }

    handleRemoteEvent(data) {
        if (!this.player) return;

        const currentTime = this.player.getCurrentTime();
        if (Math.abs(currentTime - data.positionInSeconds) > 0.6) {
            this.enterSyncingState(() => {
                this.player.seekTo(data.positionInSeconds);
            });
        }

        if (data.state === "Playing" && data.scheduledFor) {
            const exactServerTimeNow = getExactServerTimeNow();
            const targetTime = new Date(data.scheduledFor).getTime();
            const delayMs = targetTime - exactServerTimeNow;

            if (delayMs > 0) {
                console.log(`FSM: Запланирован старт через ${delayMs} мс`);
                this.currentState = MachineState.SCHEDULED_PLAY;
                this.player.pause();

                setTimeout(() => {
                    if (this.currentState === MachineState.SCHEDULED_PLAY) {
                        this.enterSyncingState(() => { this.player.play(); });
                    }
                }, delayMs);
            } else {
                this.enterSyncingState(() => { this.player.play(); });
            }
        }
        else if (data.state === "Paused" || data.state === "Buffering") {
            this.enterSyncingState(() => { this.player.pause(); });
        }
    }

    lockForSync() { this.currentState = MachineState.SYNCING; }
    unlockAfterSync() { this.currentState = MachineState.IDLE; }

    enterSyncingState(action) {
        this.currentState = MachineState.SYNCING;
        action();
        setTimeout(() => { this.currentState = MachineState.IDLE; }, 500);
    }
}

// --- Initialization ---
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
document.getElementById('userIdInput').value = uuidv4();

let videoPlayer = null;
let syncMachine = new SyncStateMachine(sendPlaybackStateUpdate);

// Инициализация плеера YouTube
function onYouTubeIframeAPIReady() {
    videoPlayer = new YouTubeAdapter("youtubePlayer", onPlayerStateChange, () => {
        syncMachine.setPlayer(videoPlayer);
        if (isHost) syncMachine.setHostStatus(true);
        console.log("FSM: State Machine activated safely after Player Ready.");
    });
}

// SignalR Hub Connection
const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${API_BASE_URL}/hubs/room`)
    .withAutomaticReconnect()
    .build();

connection.on("OnVideoChanged", (videoData) => {
    if (!videoData || !videoData.url) return;
    const videoId = extractYouTubeId(videoData.url);
    if (videoId && videoPlayer) {
        syncMachine.enterSyncingState(() => { videoPlayer.cueVideo(videoId); });
    }
});

connection.on("OnPlaybackStateChanged", (data) => {
    syncMachine.handleRemoteEvent(data);
});

function onPlayerStateChange(domainState) {
    syncMachine.handleLocalEvent(domainState);
}

// --- Подключение кастомных HTML-контроллеров ---
let isDraggingProgressBar = false;

document.getElementById('customPlayBtn').addEventListener('click', () => {
    if (!currentRoomId) return;
    syncMachine.handleLocalEvent(PlaybackState.Playing);
});

document.getElementById('customPauseBtn').addEventListener('click', () => {
    if (!currentRoomId) return;
    syncMachine.handleLocalEvent(PlaybackState.Paused);
});

// Отслеживаем действия мыши на ползунке
const progressBar = document.getElementById('customProgressBar');
progressBar.addEventListener('mousedown', () => { isDraggingProgressBar = true; });
progressBar.addEventListener('mouseup', () => { isDraggingProgressBar = false; });
progressBar.addEventListener('touchstart', () => { isDraggingProgressBar = true; });
progressBar.addEventListener('touchend', () => { isDraggingProgressBar = false; });

// Перемотка ползунком
progressBar.addEventListener('change', () => {
    if (!currentRoomId) return;

    if (!isHost) {
        alert("Только Host может перематывать видео!");
        progressBar.value = videoPlayer.getCurrentTime();
        return;
    }
    const targetSeconds = parseFloat(progressBar.value);
    sendPlaybackStateUpdate(PlaybackState.Paused, targetSeconds);
});

// Секундный Heartbeat-таймер для обновления ползунка
setInterval(() => {
    if (!videoPlayer || !videoPlayer.player || typeof videoPlayer.player.getDuration !== 'function') return;
    if (isDraggingProgressBar) return;

    const currentTime = videoPlayer.getCurrentTime();
    const duration = videoPlayer.player.getDuration() || 0;

    if (duration > 0) {
        progressBar.max = duration;
        progressBar.value = currentTime;
    }
    document.getElementById('customTimeLabel').innerText = `${formatTime(currentTime)} / ${formatTime(duration)}`;
}, 500);

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// --- HTTP API Calls ---
async function createRoom() {
    const roomName = document.getElementById('roomNameInput').value || "Cozy Room";
    const userId = document.getElementById('userIdInput').value;

    const response = await fetch(`${API_BASE_URL}/api/room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName, hostId: userId })
    });

    if (response.ok) {
        const roomId = await response.text();
        document.getElementById('roomIdInput').value = roomId.replace(/"/g, '');
        isHost = true;
        syncMachine.setHostStatus(true);
        await joinRoom();
    } else {
        alert("Failed to create room.");
    }
}

async function joinRoom() {
    const roomId = document.getElementById('roomIdInput').value;
    const userId = document.getElementById('userIdInput').value;

    if (!roomId || !userId) {
        alert("Please provide both User ID and Room ID.");
        return;
    }

    // ИСПРАВЛЕНО: Безопасный прогрев автоплея через интерфейс нашего адаптера, а не напрямую через плеер гугла
    if (videoPlayer) {
        try {
            videoPlayer.play();
            videoPlayer.pause();
        } catch (e) {
            console.log("Warmup handled safely", e);
        }
    }

    try {
        // Устанавливаем ID комнаты внутри защищенного блока
        currentRoomId = roomId;
        if (isHost === false) syncMachine.setHostStatus(false);

        await fetch(`${API_BASE_URL}/api/room/${roomId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId })
        });

        if (connection.state === signalR.HubConnectionState.Disconnected) {
            await connection.start();
        }

        await connection.invoke("JoinRoom", roomId, userId);
        await fetchAndSyncCurrentState(roomId);

        const statusEl = document.getElementById('status');
        statusEl.innerText = `Connected to Room: ${roomId.substring(0, 8)}...`;
        statusEl.className = "status-badge connected";
    } catch (err) {
        console.error("SignalR Connection Error: ", err);
        alert("Failed to connect to the room.");
        currentRoomId = null; // Сбрасываем в null, если подключение сорвалось
    }
}

async function changeVideo() {
    if (!currentRoomId) return alert("Join a room first!");

    const videoUrl = document.getElementById('videoUrlInput').value;
    const userId = document.getElementById('userIdInput').value;
    const videoId = extractYouTubeId(videoUrl);

    if (!videoId) return alert("Invalid YouTube URL");

    const payload = {
        userId: userId,
        videoUrl: videoUrl,
        title: "YouTube Video",
        durationSeconds: 3600
    };

    const response = await fetch(`${API_BASE_URL}/api/room/${currentRoomId}/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.description}`);
    }
}

async function sendPlaybackStateUpdate(stateEnum, manualSeconds = null) {
    if (!videoPlayer) return;
    if (!currentRoomId) return;

    const userId = document.getElementById('userIdInput').value;
    const currentTimeSeconds = manualSeconds !== null ? manualSeconds : (videoPlayer.getCurrentTime() || 0);

    if (manualSeconds !== null) {
        videoPlayer.seekTo(manualSeconds);
    }

    const h = Math.floor(currentTimeSeconds / 3600);
    const m = Math.floor((currentTimeSeconds % 3600) / 60);
    const s = Math.floor(currentTimeSeconds % 60);
    const timeSpan = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    const payload = {
        userId: userId,
        requestedState: stateEnum,
        clientPosition: timeSpan
    };

    fetch(`${API_BASE_URL}/api/room/${currentRoomId}/playback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

async function fetchAndSyncCurrentState(roomId) {
    const response = await fetch(`${API_BASE_URL}/api/room/${roomId}`);
    if (response.ok) {
        const state = await response.json();
        console.log("Initial State Fetched:", state);

        if (state.currentVideo && state.currentVideo.url && videoPlayer) {
            const videoId = extractYouTubeId(state.currentVideo.url);
            syncMachine.lockForSync();

            if (state.playbackState === "Playing" || state.playbackState === 1) {
                videoPlayer.loadVideo(videoId, state.currentPositionSeconds);
            } else {
                videoPlayer.cueVideo(videoId, state.currentPositionSeconds);
            }

            setTimeout(() => { syncMachine.unlockAfterSync(); }, 4000);
        }
    }
}

function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}