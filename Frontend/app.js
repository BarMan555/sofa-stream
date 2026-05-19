// --- Configuration ---
const API_BASE_URL = "http://0.0.0.0:5063";

// --- Time Synchronization (NTP) ---
let serverTimeOffset = 0; // Разница в миллисекундах между клиентом и сервером

async function syncClockWithServer() {
    try {
        const clientSendTime = Date.now();
        const response = await fetch(`${API_BASE_URL}/api/room/time`);
        const data = await response.json();

        const clientReceiveTime = Date.now();
        const serverTime = new Date(data.serverTimeUtc).getTime();

        // Пинг в одну сторону (приблизительно)
        const ping = (clientReceiveTime - clientSendTime) / 2;

        // Истинное время сервера в момент, когда мы получили ответ
        const estimatedExactServerTime = serverTime + ping;

        // Разница: если сервер спешит на 5 сек, offset будет +5000
        serverTimeOffset = estimatedExactServerTime - clientReceiveTime;

        console.log(`Clock synced! Ping: ${ping}ms, Server Offset: ${serverTimeOffset}ms`);
    } catch (err) {
        console.error("Failed to sync clock with server", err);
    }
}

// Утилита: получить точное время сервера прямо сейчас
function getExactServerTimeNow() {
    return Date.now() + serverTimeOffset;
}

// Запускаем синхронизацию при загрузке скрипта
syncClockWithServer();

let currentRoomId = null;

// Enums mapping from C# Domain
const PlaybackState = {
    Paused: 0,
    Playing: 1,
    Buffering: 2
};

// --- Player Adapter (Pattern) ---
// Этот класс - универсальная обертка. Завтра мы сможем написать такой же RuTubeAdapter
class YouTubeAdapter {
    constructor(containerId, onStateChangeCallback) {
        this.player = new YT.Player(containerId, {
            height: '390',
            width: '640',
            videoId: '',
            playerVars: {
                'playsinline': 1,
                'disablekb': 1,
                'origin': window.location.origin
            },
            events: {
                // Когда YouTube меняет состояние, мы переводим его на язык нашего Домена
                'onStateChange': (event) => {
                    let domainState = null;
                    if (event.data === YT.PlayerState.PLAYING) domainState = PlaybackState.Playing;
                    else if (event.data === YT.PlayerState.PAUSED) domainState = PlaybackState.Paused;
                    else if (event.data === YT.PlayerState.BUFFERING) domainState = PlaybackState.Buffering;

                    if (domainState !== null) {
                        onStateChangeCallback(domainState);
                    }
                }
            }
        });
    }

    // Стандартный интерфейс, который будет использовать наша бизнес-логика
    play() { this.player.playVideo(); }
    pause() { this.player.pauseVideo(); }
    seekTo(seconds) { this.player.seekTo(seconds, true); }
    getCurrentTime() { return this.player.getCurrentTime() || 0; }

    loadVideo(videoId, startSeconds = 0) {
        this.player.loadVideoById(videoId, startSeconds);
    }

    cueVideo(videoId, startSeconds = 0) {
        this.player.cueVideoById(videoId, startSeconds);
    }
}

// --- Finite State Machine (FSM) ---
// Возможные состояния нашего автомата
const MachineState = {
    IDLE: 'IDLE',                     // Плеер в покое, ждет действий пользователя или сервера
    WAITING_SERVER: 'WAITING_SERVER', // Хост нажал кнопку, ждем подтверждения от сервера
    SYNCING: 'SYNCING'                // Применяем команды сервера (блокируем действия юзера)
};

class SyncStateMachine {
    constructor(player, sendUpdateCallback) {
        this.player = player;
        this.sendUpdate = sendUpdateCallback;
        this.currentState = MachineState.IDLE;
        this.isHost = false;
    }

    setHostStatus(isHost) {
        this.isHost = isHost;
    }

    // Обработка событий от ЛОКАЛЬНОГО плеера (когда юзер кликает сам)
    handleLocalEvent(domainState) {
        // Если мы сейчас синхронизируемся с сервером — игнорируем любые клики
        if (this.currentState === MachineState.SYNCING) return;
        if (!currentRoomId) return;

        // ЗАЩИТА ГОСТЯ
        if (!this.isHost) {
            if (domainState === PlaybackState.Playing) {
                this.enterSyncingState(() => {
                    this.player.pause();
                    alert("Только Host может управлять просмотром!");
                });
            }
            return;
        }

        // ЛОГИКА ХОСТА
        if (this.currentState === MachineState.IDLE) {
            if (domainState === PlaybackState.Playing) {
                // Идем в ожидание сервера, глушим плеер и отправляем запрос
                this.currentState = MachineState.WAITING_SERVER;
                this.player.pause();
                this.sendUpdate(PlaybackState.Playing);
            }
            else if (domainState === PlaybackState.Paused) {
                this.sendUpdate(PlaybackState.Paused);
            }
            else if (domainState === PlaybackState.Buffering) {
                this.sendUpdate(PlaybackState.Buffering);
            }
        }
        else if (this.currentState === MachineState.WAITING_SERVER) {
            // Если мы уже ждем ответа, игнорируем панику пользователя (двойные клики)
            console.log("FSM: Ignoring local click, waiting for server...");
        }
    }

    // Обработка событий от СЕРВЕРА (SignalR)
    handleRemoteEvent(data) {
        // Сервер всегда прав. Переходим в состояние синхронизации.
        this.enterSyncingState(() => {
            const currentTime = this.player.getCurrentTime();

            // Компенсация рассинхрона времени
            if (Math.abs(currentTime - data.positionInSeconds) > 0.5) {
                this.player.seekTo(data.positionInSeconds);
            }

            if (data.state === "Playing") {
                this.player.play();
            } else if (data.state === "Paused" || data.state === "Buffering") {
                this.player.pause();
            }
        });
    }

    // Вспомогательный метод для безопасной работы с плеером без петель
    enterSyncingState(action) {
        this.currentState = MachineState.SYNCING;
        action(); // Выполняем действия с плеером (пауза, плей, перемотка)

        // Через 500мс возвращаемся в режим ожидания новых команд
        setTimeout(() => {
            this.currentState = MachineState.IDLE;
        }, 500);
    }
}

// --- Initialization ---

// Generate a random GUID for the user session
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

document.getElementById('userIdInput').value = uuidv4();

let videoPlayer = null;
let syncMachine = null;

// Вызывается автоматически скриптом YouTube
function onYouTubeIframeAPIReady() {
    videoPlayer = new YouTubeAdapter("youtubePlayer", onPlayerStateChange);
    syncMachine = new SyncStateMachine(videoPlayer, sendPlaybackStateUpdate);
}

// 2. SignalR Hub Connection Setup
const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${API_BASE_URL}/hubs/room`)
    .withAutomaticReconnect()
    .build();

// --- SignalR Event Listeners (Server -> Client) ---

connection.on("OnVideoChanged", (videoData) => {
    console.log("OnVideoChanged event received:", videoData);
    if (!videoData || !videoData.url) return;

    const videoId = extractYouTubeId(videoData.url);
    if (videoId) {
        isRemoteUpdate = true;
        videoPlayer.cueVideo(videoId);
        setTimeout(() => { isRemoteUpdate = false; }, 500);
    }
});

connection.on("OnPlaybackStateChanged", (data) => {
    console.log("OnPlaybackStateChanged event received:", data);
    // Просто отдаем данные автомату, он сам разберется
    syncMachine.handleRemoteEvent(data);
});

// --- YouTube Player Event Listeners (Client -> Server) ---
function onPlayerStateChange(domainState) {
    // Отдаем локальный клик автомату
    syncMachine.handleLocalEvent(domainState);
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

    currentRoomId = roomId;

    if (syncMachine && syncMachine.isHost === false) {
        syncMachine.setHostStatus(false);
    }

    try {
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

async function sendPlaybackStateUpdate(stateEnum) {
    const userId = document.getElementById('userIdInput').value;
    const currentTimeSeconds = videoPlayer.getCurrentTime() || 0;

    const timeSpan = new Date(currentTimeSeconds * 1000).toISOString().substring(11, 19);

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

// Helper: Fetch current state on load
async function fetchAndSyncCurrentState(roomId) {
    const response = await fetch(`${API_BASE_URL}/api/room/${roomId}`);
    if (response.ok) {
        const state = await response.json();
        console.log("Initial State Fetched:", state);

        if (state.currentVideo && state.currentVideo.url) {
            const videoId = extractYouTubeId(state.currentVideo.url);
            isRemoteUpdate = true;

            if (state.playbackState === "Playing") {
                videoPlayer.loadVideo(videoId, state.currentPositionSeconds);
            } else {
                videoPlayer.cueVideo(videoId, state.currentPositionSeconds);
            }

            setTimeout(() => { isRemoteUpdate = false; }, 500);
        }
    }
}

// Helper: Extract YouTube ID from URL
function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}