// --- Configuration ---
const API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:5063"
    : window.location.origin;

// --- Time Synchronization (NTP Protocol) ---
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

// --- Simplified & Stable Synchronization Manager ---
class SyncStateMachine {
    constructor(sendUpdateCallback) {
        this.player = null;
        this.sendUpdate = sendUpdateCallback;
        this.isHost = false;

        this.isProcessingRemoteEvent = false;
        this.scheduledPlayTimer = null;
        this.unlockTimer = null;
    }

    setPlayer(player) { this.player = player; }
    setHostStatus(isHostStatus) {
        this.isHost = isHostStatus;
        console.log(`FSM: Host status updated to: ${isHostStatus}`);
    }

    handleUiAction(domainState) {
        if (!currentRoomId || !this.player) return;

        if (!this.isHost) {
            return; // Hard block for non-host interface commands
        }

        if (domainState === PlaybackState.Paused) {
            this.player.pause();
        }

        this.sendUpdate(domainState);
    }

    handleSliderSeek(targetSeconds) {
        if (!currentRoomId || !this.player || !this.isHost) return;

        this.player.seekTo(targetSeconds);
        this.player.pause();
        this.sendUpdate(PlaybackState.Paused, targetSeconds);
    }

    handleRemoteEvent(data) {
        if (!this.player) return;

        this.isProcessingRemoteEvent = true;
        if (this.unlockTimer) clearTimeout(this.unlockTimer);

        const currentTime = this.player.getCurrentTime();
        if (Math.abs(currentTime - data.positionInSeconds) > 1.5) {
            this.player.seekTo(data.positionInSeconds);
        }

        if (data.state === "Playing") {
            if (this.scheduledPlayTimer) clearTimeout(this.scheduledPlayTimer);

            const exactServerTimeNow = getExactServerTimeNow();
            const targetTime = new Date(data.scheduledFor).getTime();
            const delayMs = targetTime - exactServerTimeNow;

            if (delayMs > 0) {
                this.player.pause();
                this.scheduledPlayTimer = setTimeout(() => {
                    this.player.play();
                }, delayMs);

                this.unlockTimer = setTimeout(() => { this.isProcessingRemoteEvent = false; }, delayMs + 500);
            } else {
                this.player.play();
                this.unlockTimer = setTimeout(() => { this.isProcessingRemoteEvent = false; }, 500);
            }
        } else {
            if (this.scheduledPlayTimer) clearTimeout(this.scheduledPlayTimer);
            this.player.pause();

            this.unlockTimer = setTimeout(() => { this.isProcessingRemoteEvent = false; }, 400);
        }
    }

    handlePlayerStateNotification(domainState) {
        if (this.isProcessingRemoteEvent) return;

        if (this.isHost && currentRoomId) {
            if (domainState === PlaybackState.Buffering) {
                this.sendUpdate(PlaybackState.Buffering);
            }
        }
    }

    handleRemoteVideoChange(videoId, startSeconds = 0) {
        this.isProcessingRemoteEvent = true;
        if (this.scheduledPlayTimer) clearTimeout(this.scheduledPlayTimer);

        this.player.cueVideo(videoId, startSeconds);

        setTimeout(() => {
            this.isProcessingRemoteEvent = false;
        }, 1500);
    }
}

// --- Initialization ---
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// FIXED: Save generated unique string and display it as raw plain text
const globalUserId = uuidv4();
document.getElementById('userIdDisplay').innerText = globalUserId;

let videoPlayer = null;
let syncMachine = new SyncStateMachine(sendPlaybackStateUpdate);

function onYouTubeIframeAPIReady() {
    videoPlayer = new YouTubeAdapter("youtubePlayer", onPlayerStateChange, () => {
        syncMachine.setPlayer(videoPlayer);
        if (isHost) syncMachine.setHostStatus(true);
        console.log("FSM: State Machine activated safely after Player Ready.");
    });
}

// SignalR Hub Connection Setup
const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${API_BASE_URL}/hubs/room`)
    .withAutomaticReconnect()
    .build();

connection.on("OnVideoChanged", (videoData) => {
    if (!videoData || !videoData.url) return;
    const videoId = extractYouTubeId(videoData.url);
    if (videoId && videoPlayer) {
        syncMachine.handleRemoteVideoChange(videoId, 0);
    }
});

connection.on("OnPlaybackStateChanged", (data) => {
    syncMachine.handleRemoteEvent(data);
});

function onPlayerStateChange(domainState) {
    syncMachine.handlePlayerStateNotification(domainState);
}

// --- Custom HTML Control Layers ---
let isDraggingProgressBar = false;

document.getElementById('customPlayBtn').addEventListener('click', () => {
    syncMachine.handleUiAction(PlaybackState.Playing);
});

document.getElementById('customPauseBtn').addEventListener('click', () => {
    syncMachine.handleUiAction(PlaybackState.Paused);
});

const progressBar = document.getElementById('customProgressBar');
progressBar.addEventListener('mousedown', () => { isDraggingProgressBar = true; });
progressBar.addEventListener('mouseup', () => { isDraggingProgressBar = false; });
progressBar.addEventListener('touchstart', () => { isDraggingProgressBar = true; });
progressBar.addEventListener('touchend', () => { isDraggingProgressBar = false; });

progressBar.addEventListener('change', () => {
    const targetSeconds = parseFloat(progressBar.value);
    syncMachine.handleSliderSeek(targetSeconds);
});

// Heartbeat interface loop worker
setInterval(() => {
    if (!videoPlayer || !videoPlayer.player || typeof videoPlayer.player.getDuration !== 'function') return;

    const playBtn = document.getElementById('customPlayBtn');
    const pauseBtn = document.getElementById('customPauseBtn');

    // State 1: Room context is absent (Lock controls entirely)
    if (!currentRoomId) {
        playBtn.disabled = true;
        pauseBtn.disabled = true;
        return;
    }

    // FIXED (Req 4): If user is a Guest, permanently lock playback buttons
    if (!isHost) {
        playBtn.disabled = true;
        pauseBtn.disabled = true;
    }

    // Render timeline progress updates if not dragging playhead manually
    if (!isDraggingProgressBar) {
        const currentTime = videoPlayer.getCurrentTime();
        const duration = videoPlayer.player.getDuration() || 0;

        if (duration > 0) {
            progressBar.max = duration;
            progressBar.value = currentTime;

            // FIXED (Req 5): Dynamic color gradient filling behind the elapsed track
            const percentage = (currentTime / duration) * 100;
            progressBar.style.background = `linear-gradient(to right, var(--primary) ${percentage}%, #e0e0e0 ${percentage}%)`;
        }
        document.getElementById('customTimeLabel').innerText = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    }

    // Handle button toggle overrides only for the active Room Host
    if (isHost && typeof videoPlayer.player.getPlayerState === 'function') {
        const state = videoPlayer.player.getPlayerState();

        if (state === YT.PlayerState.PLAYING) {
            playBtn.disabled = true;
            pauseBtn.disabled = false;
        }
        else if (
            state === YT.PlayerState.PAUSED ||
            state === YT.PlayerState.ENDED ||
            state === YT.PlayerState.CUED ||
            state === -1
        ) {
            playBtn.disabled = false;
            pauseBtn.disabled = true;
        }
        else if (state === YT.PlayerState.BUFFERING) {
            playBtn.disabled = true;
            pauseBtn.disabled = true;
        }
    }
}, 500);

// Fluid fill scaling when dragging the timeline manually
progressBar.addEventListener('input', () => {
    if (!videoPlayer || !videoPlayer.player || typeof videoPlayer.player.getDuration !== 'function') return;
    const value = parseFloat(progressBar.value);
    const duration = videoPlayer.player.getDuration() || 0;

    const percentage = (value / duration) * 100 || 0;
    progressBar.style.background = `linear-gradient(to right, var(--primary) ${percentage}%, #e0e0e0 ${percentage}%)`;

    document.getElementById('customTimeLabel').innerText = `${formatTime(value)} / ${formatTime(duration)}`;
});

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// --- HTTP API Calls ---
async function createRoom() {
    const roomNameInput = document.getElementById('roomNameInput').value.trim();

    // FIXED (Req 2): Abort action with warning alert if field is blank
    if (!roomNameInput) {
        alert("Please enter a valid Room Name before proceeding!");
        return;
    }

    const response = await fetch(`${API_BASE_URL}/api/room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomNameInput, hostId: globalUserId })
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
    const roomId = document.getElementById('roomIdInput').value.trim();

    if (!roomId) {
        alert("Please provide a valid Room ID.");
        return;
    }

    if (videoPlayer) {
        try { videoPlayer.play(); videoPlayer.pause(); } catch (e) {}
    }

    try {
        currentRoomId = roomId;
        if (isHost === false) syncMachine.setHostStatus(false);

        await fetch(`${API_BASE_URL}/api/room/${roomId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: globalUserId })
        });

        if (connection.state === signalR.HubConnectionState.Disconnected) {
            await connection.start();
        }

        await connection.invoke("JoinRoom", roomId, globalUserId);
        await fetchAndSyncCurrentState(roomId);
    } catch (err) {
        console.error("SignalR Connection Error: ", err);
        alert("Failed to connect to the room.");
        currentRoomId = null;
    }
}

async function changeVideo() {
    if (!currentRoomId) return alert("Join a room first!");

    const videoUrl = document.getElementById('videoUrlInput').value;
    const videoId = extractYouTubeId(videoUrl);

    if (!videoId) return alert("Invalid YouTube URL");

    const payload = {
        userId: globalUserId,
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

    const currentTimeSeconds = manualSeconds !== null ? manualSeconds : (videoPlayer.getCurrentTime() || 0);

    if (manualSeconds !== null) {
        videoPlayer.seekTo(manualSeconds);
    }

    const h = Math.floor(currentTimeSeconds / 3600);
    const m = Math.floor((currentTimeSeconds % 3600) / 60);
    const s = Math.floor(currentTimeSeconds % 60);
    const timeSpan = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    const payload = {
        userId: globalUserId,
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

        // FIXED (Req 3): Renders line breaks containing the full Room Name and full target Room ID
        const statusEl = document.getElementById('status');
        statusEl.innerText = `Connected to Room: "${state.name || 'Cozy Room'}"\nID: ${roomId}`;
        statusEl.className = "status-badge connected";

        if (state.currentVideo && state.currentVideo.url && videoPlayer) {
            const videoId = extractYouTubeId(state.currentVideo.url);
            syncMachine.handleRemoteVideoChange(videoId, state.currentPositionSeconds);
        }
    }
}

function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// --- Dynamic Gateway Injector ---
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// --- Tab Navigation Switcher ---
function switchTab(tabName) {
    const createBtn = document.getElementById('tabCreateBtn');
    const joinBtn = document.getElementById('tabJoinBtn');
    const createContent = document.getElementById('tabCreateContent');
    const joinContent = document.getElementById('tabJoinContent');

    if (tabName === 'create') {
        createBtn.classList.add('active');
        joinBtn.classList.remove('active');
        createContent.classList.add('active');
        joinContent.classList.remove('active');
    } else {
        createBtn.classList.remove('active');
        joinBtn.classList.add('active');
        createContent.classList.remove('active');
        joinContent.classList.add('active');
    }
}
// Securely map the tab control method to global window scope for inline markup visibility
window.switchTab = switchTab;