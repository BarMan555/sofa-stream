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

// --- Fullscreen Controls Auto-Hide & Hover Interactive Blueprint ---
let inactivityTimer;
const INACTIVITY_DURATION_MS = 3000;

const theaterContainer = document.getElementById('theaterContainer');
const controlsPanel = document.querySelector('.custom-controls-panel');

function showControls() {
    controlsPanel.classList.add('controls-visible');
}

function hideControls() {
    if (document.fullscreenElement) {
        controlsPanel.classList.remove('controls-visible');
    }
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (controlsPanel.matches(':hover')) {
        return;
    }
    inactivityTimer = setTimeout(hideControls, INACTIVITY_DURATION_MS);
}

function handleMouseMove() {
    showControls();
    resetInactivityTimer();
}

theaterContainer.addEventListener('mousemove', handleMouseMove);
theaterContainer.addEventListener('mouseenter', handleMouseMove);
theaterContainer.addEventListener('mouseleave', hideControls);

controlsPanel.addEventListener('mouseenter', () => {
    clearTimeout(inactivityTimer);
    showControls();
});

controlsPanel.addEventListener('mouseleave', () => {
    resetInactivityTimer();
});

// --- UI Authorization Management Helper ---
let currentRoomId = null;
let isHost = false;

/**
 * FIXED: Dynamically adjusts the visibility of host-restricted interface components based on user role status.
 */
function updateHostUiVisibility() {
    const hostPanel = document.getElementById('hostControlsPanel');
    if (hostPanel) {
        hostPanel.style.display = isHost ? 'block' : 'none';
    }
}

function showPlayerBlock() {
    const theater = document.getElementById('theaterContainer');
    if (theater) {
        theater.style.display = 'flex';
    }
}

function hidePlayerBlock() {
    const theater = document.getElementById('theaterContainer');
    if (theater) {
        theater.style.display = 'none';
    }
}

const PlaybackState = {
    Paused: 0,
    Playing: 1,
    Buffering: 2
};

// --- Universal Player Adapter ---
class UniversalPlayer {
    constructor(ytContainerId, rtIframeId, onStateChangeCallback, onPlayerReadyCallback) {
        this.ytContainerId = ytContainerId;
        this.rtIframeId = rtIframeId;
        this.onStateChangeCallback = onStateChangeCallback;
        this.onPlayerReadyCallback = onPlayerReadyCallback;
        
        this.currentType = null; // 'youtube' | 'rutube' | null
        this.currentVideoId = null;
        
        this.rutubeDuration = 0;
        this.rutubeCurrentTime = 0;
        this.rutubeState = PlaybackState.Paused;

        // Initialize YouTube Player
        this.ytPlayer = new YT.Player(ytContainerId, {
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
                    if (this.currentType !== 'youtube') return;
                    let domainState = null;
                    if (event.data === YT.PlayerState.PLAYING) domainState = PlaybackState.Playing;
                    else if (event.data === YT.PlayerState.PAUSED) domainState = PlaybackState.Paused;
                    else if (event.data === YT.PlayerState.BUFFERING) domainState = PlaybackState.Buffering;

                    if (domainState !== null) {
                        this.onStateChangeCallback(domainState);
                    }
                },
                'onReady': () => {
                    console.log("YouTube Player is fully READY.");
                    this.onPlayerReadyCallback();
                }
            }
        });
        
        // Setup Rutube message listener
        window.addEventListener("message", (event) => {
            if (typeof event.origin !== 'string' || !event.origin.includes("rutube.ru")) return;
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (e) {
                return;
            }
            if (!message || !message.type) return;
            if (this.currentType === 'rutube') {
                this.handleRutubeMessage(message);
            }
        });
    }

    get player() {
        return this;
    }

    handleRutubeMessage(message) {
        if (message.type === 'player:currentTime') {
            this.rutubeCurrentTime = parseFloat(message.data.time);
        } else if (message.type === 'player:durationChange') {
            this.rutubeDuration = parseFloat(message.data.duration);
        } else if (message.type === 'player:changeState') {
            const rtStateStr = message.data.state;
            let domainState = null;
            if (rtStateStr === 'playing') {
                domainState = PlaybackState.Playing;
            } else if (rtStateStr === 'paused' || rtStateStr === 'stopped') {
                domainState = PlaybackState.Paused;
            }
            if (domainState !== null) {
                this.rutubeState = domainState;
                this.onStateChangeCallback(domainState);
            }
        }
    }

    sendRutubeCommand(command, data = {}) {
        const rtIframe = document.getElementById(this.rtIframeId);
        if (rtIframe && rtIframe.contentWindow) {
            rtIframe.contentWindow.postMessage(
                JSON.stringify({
                    type: `player:${command}`,
                    data: data
                }),
                "*"
            );
        }
    }

    play() {
        if (this.currentType === 'youtube') {
            if (this.ytPlayer && this.ytPlayer.playVideo) this.ytPlayer.playVideo();
        } else if (this.currentType === 'rutube') {
            this.sendRutubeCommand('play');
            this.rutubeState = PlaybackState.Playing;
        }
    }

    pause() {
        if (this.currentType === 'youtube') {
            if (this.ytPlayer && this.ytPlayer.pauseVideo) this.ytPlayer.pauseVideo();
        } else if (this.currentType === 'rutube') {
            this.sendRutubeCommand('pause');
            this.rutubeState = PlaybackState.Paused;
        }
    }

    seekTo(seconds) {
        if (this.currentType === 'youtube') {
            if (this.ytPlayer && this.ytPlayer.seekTo) this.ytPlayer.seekTo(seconds, true);
        } else if (this.currentType === 'rutube') {
            this.sendRutubeCommand('setCurrentTime', { time: seconds });
            this.rutubeCurrentTime = seconds;
        }
    }

    getCurrentTime() {
        if (this.currentType === 'youtube') {
            return (this.ytPlayer && this.ytPlayer.getCurrentTime) ? this.ytPlayer.getCurrentTime() : 0;
        } else if (this.currentType === 'rutube') {
            return this.rutubeCurrentTime;
        }
        return 0;
    }

    getDuration() {
        if (this.currentType === 'youtube') {
            return (this.ytPlayer && this.ytPlayer.getDuration) ? this.ytPlayer.getDuration() : 0;
        } else if (this.currentType === 'rutube') {
            return this.rutubeDuration;
        }
        return 0;
    }

    getPlayerState() {
        if (this.currentType === 'youtube') {
            return (this.ytPlayer && this.ytPlayer.getPlayerState) ? this.ytPlayer.getPlayerState() : -1;
        } else if (this.currentType === 'rutube') {
            if (this.rutubeState === PlaybackState.Playing) return 1; // YT.PlayerState.PLAYING
            if (this.rutubeState === PlaybackState.Paused) return 2;  // YT.PlayerState.PAUSED
            return -1;
        }
        return -1;
    }

    loadVideo(videoId, startSeconds = 0) {
        this.cueVideo(videoId, startSeconds);
    }

    switchToType(type, videoId, startSeconds = 0) {
        this.currentType = type;
        this.currentVideoId = videoId;
        
        const ytEl = document.getElementById(this.ytContainerId);
        const rtEl = document.getElementById(this.rtIframeId);
        
        if (type === 'youtube') {
            if (rtEl) rtEl.style.display = 'none';
            if (ytEl) ytEl.style.display = 'block';
            
            if (this.ytPlayer && this.ytPlayer.cueVideoById) {
                this.ytPlayer.cueVideoById(videoId, startSeconds);
            }
            showPlayerBlock();
        } else if (type === 'rutube') {
            if (ytEl) ytEl.style.display = 'none';
            if (rtEl) {
                rtEl.style.display = 'block';
                rtEl.src = `https://rutube.ru/play/embed/${videoId}?rtBorders=0&rtButtons=0&rtLogo=0&skinColor=ff4500`;
            }
            this.rutubeDuration = 0;
            this.rutubeCurrentTime = startSeconds;
            this.rutubeState = PlaybackState.Paused;
            
            setTimeout(() => {
                this.seekTo(startSeconds);
            }, 1000);

            showPlayerBlock();
        }
    }

    cueVideo(videoId, startSeconds = 0) {
        const detectedType = (videoId.length === 32) ? 'rutube' : 'youtube';
        this.switchToType(detectedType, videoId, startSeconds);
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
            return;
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

const globalUserId = uuidv4();
document.getElementById('userIdDisplay').innerText = globalUserId;

let videoPlayer = null;
let syncMachine = new SyncStateMachine(sendPlaybackStateUpdate);

function onYouTubeIframeAPIReady() {
    videoPlayer = new UniversalPlayer("youtubePlayer", "rutubePlayer", onPlayerStateChange, () => {
        syncMachine.setPlayer(videoPlayer);
        if (isHost) syncMachine.setHostStatus(true);
        console.log("FSM: State Machine activated safely after Player Ready.");
        if (currentRoomId) {
            fetchAndSyncCurrentState(currentRoomId);
        }
    });
}

const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${API_BASE_URL}/hubs/room`)
    .withAutomaticReconnect()
    .build();

connection.on("OnVideoChanged", (videoData) => {
    if (!videoData || !videoData.url) return;
    const videoId = extractVideoId(videoData.url);
    if (videoId && videoPlayer) {
        syncMachine.handleRemoteVideoChange(videoId, 0);
    }
});

connection.on("OnPlaybackStateChanged", (data) => {
    syncMachine.handleRemoteEvent(data);
});

connection.on("OnUserJoined", (userId) => {
    if (userId === globalUserId) return;
    console.log(`WebRTC: User joined room: ${userId}`);
});

connection.on("OnUserLeft", (userId) => {
    if (userId === globalUserId) return;
    console.log(`WebRTC: User left room: ${userId}`);
    closePeerConnection(userId);
});

connection.on("OnSignalReceived", async (senderUserId, targetUserId, signalStr) => {
    if (targetUserId !== globalUserId) return;
    try {
        const signal = JSON.parse(signalStr);
        if (signal.type === "offer") {
            await handleOffer(senderUserId, signal.sdp);
        } else if (signal.type === "answer") {
            await handleAnswer(senderUserId, signal.sdp);
        } else if (signal.type === "candidate") {
            await handleCandidate(senderUserId, signal.candidate);
        }
    } catch (e) {
        console.error("WebRTC: Error handling signal from peer", e);
    }
});

function onPlayerStateChange(domainState) {
    syncMachine.handlePlayerStateNotification(domainState);
}

// --- Custom HTML Control Triggers ---
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

document.getElementById('customFullscreenBtn').addEventListener('click', () => {
    const theater = document.getElementById('theaterContainer');

    if (!document.fullscreenElement) {
        theater.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
        });
        showControls();
        resetInactivityTimer();
    } else {
        document.exitFullscreen();
        clearTimeout(inactivityTimer);
        showControls();
    }
});

setInterval(() => {
    if (!videoPlayer || !videoPlayer.player || typeof videoPlayer.player.getDuration !== 'function') return;

    const playBtn = document.getElementById('customPlayBtn');
    const pauseBtn = document.getElementById('customPauseBtn');

    if (!currentRoomId) {
        playBtn.disabled = true;
        pauseBtn.disabled = true;
        return;
    }

    if (!isHost) {
        playBtn.disabled = true;
        pauseBtn.disabled = true;
    }

    if (!isDraggingProgressBar) {
        const currentTime = videoPlayer.getCurrentTime();
        const duration = videoPlayer.player.getDuration() || 0;

        if (duration > 0) {
            progressBar.max = duration;
            progressBar.value = currentTime;

            const percentage = (currentTime / duration) * 100;
            progressBar.style.background = `linear-gradient(to right, var(--primary) ${percentage}%, #232228 ${percentage}%)`;
        }
        document.getElementById('customTimeLabel').innerText = `${formatTime(currentTime, duration)} / ${formatTime(duration, duration)}`;
    }

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

progressBar.addEventListener('input', () => {
    if (!videoPlayer || !videoPlayer.player || typeof videoPlayer.player.getDuration !== 'function') return;
    const value = parseFloat(progressBar.value);
    const duration = videoPlayer.player.getDuration() || 0;

    const percentage = (value / duration) * 100 || 0;
    progressBar.style.background = `linear-gradient(to right, var(--primary) ${percentage}%, #232228 ${percentage}%)`;

    document.getElementById('customTimeLabel').innerText = `${formatTime(value, duration)} / ${formatTime(duration, duration)}`;
});

function formatTime(seconds, duration = 0) {
    if (isNaN(seconds)) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (duration >= 3600 || h > 0) {
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    } else {
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
}

// --- HTTP API Calls ---
async function createRoom() {
    const roomNameInput = document.getElementById('roomNameInput').value.trim();

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
        updateHostUiVisibility(); // FIXED: Force reveal host authorization controls panel dynamically
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

    try { stopVideoChat(); } catch (e) {}

    try {
        currentRoomId = roomId;
        if (isHost === false) syncMachine.setHostStatus(false);

        updateHostUiVisibility(); // FIXED: Secure sync execution path to keep panel hidden for guests

        const joinResponse = await fetch(`${API_BASE_URL}/api/room/${roomId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: globalUserId })
        });

        if (!joinResponse.ok) {
            const errorText = await joinResponse.text();
            let errorMsg = "Failed to join room.";
            try {
                const errorObj = JSON.parse(errorText);
                if (errorObj && errorObj.description) {
                    errorMsg = errorObj.description;
                }
            } catch (e) {}
            alert(errorMsg);
            currentRoomId = null;
            return;
        }

        if (connection.state === signalR.HubConnectionState.Disconnected) {
            await connection.start();
        }

        await connection.invoke("JoinRoom", roomId, globalUserId);
        await startVideoChat();
        await fetchAndSyncCurrentState(roomId);
    } catch (err) {
        console.error("SignalR Connection Error: ", err);
        alert("Failed to connect to the room.");
        currentRoomId = null;
    }
}

async function changeVideo() {
    if (!currentRoomId) return alert("Join a room first!");

    const videoUrl = document.getElementById('videoUrlInput').value.trim();
    const videoId = extractVideoId(videoUrl);

    if (!videoId) return alert("Invalid Video URL (supports YouTube & RuTube)");

    const isRutube = videoUrl.includes("rutube.ru");
    const payload = {
        userId: globalUserId,
        videoUrl: videoUrl,
        title: isRutube ? "RuTube Video" : "YouTube Video",
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

        const statusEl = document.getElementById('status');
        statusEl.innerText = `Connected to Room: "${state.name || 'Cozy Room'}"\nID: ${roomId}`;
        statusEl.className = "status-badge connected";

        if (state.currentVideo && state.currentVideo.url && videoPlayer) {
            const videoId = extractVideoId(state.currentVideo.url);
            syncMachine.handleRemoteVideoChange(videoId, state.currentPositionSeconds);
        } else {
            if (videoPlayer) {
                try { videoPlayer.pause(); } catch (e) {}
            }
            hidePlayerBlock();
        }

        if (state.participants) {
            await initiateConnectionsWithExistingParticipants(state.participants);
        }
    }
}

function extractVideoId(url) {
    if (!url) return null;
    
    const ytReg = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const ytMatch = url.match(ytReg);
    if (ytMatch && ytMatch[2].length === 11) {
        return ytMatch[2];
    }
    
    const rtReg = /rutube\.ru\/(video|play\/embed)\/([a-zA-Z0-9]+)/;
    const rtMatch = url.match(rtReg);
    if (rtMatch) {
        return rtMatch[2];
    }
    
    return null;
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
window.switchTab = switchTab;

// --- Video Chat (WebRTC mesh and draggable UI overlay) ---

let peerConnections = {};
let localStream = null;
let mockCanvasAnimationId = null;
let isMinimized = false;
let isAudioMuted = false;
let isVideoDisabled = false;

async function startVideoChat() {
    console.log("WebRTC: Starting video chat session...");
    document.getElementById("videoChatOverlay").style.display = "flex";
    document.getElementById("videoChatRestoreBtn").style.display = "none";
    
    // Initialize media streams
    await initLocalMedia();
    
    // Set up dragging
    makeOverlayDraggable();
    
    // Reset control values
    isMinimized = false;
    isAudioMuted = false;
    isVideoDisabled = false;
    
    const btnAudio = document.getElementById("btnToggleAudio");
    const btnVideo = document.getElementById("btnToggleVideo");
    if (btnAudio) { btnAudio.innerText = "🎤 Mute"; btnAudio.classList.remove("muted"); }
    if (btnVideo) { btnVideo.innerText = "📷 Disable"; btnVideo.classList.remove("muted"); }
    
    const localMicIndicator = document.getElementById("localMicIndicator");
    const localVideoIndicator = document.getElementById("localVideoIndicator");
    if (localMicIndicator) { localMicIndicator.className = "mic-indicator active"; localMicIndicator.innerText = "🎙️"; }
    if (localVideoIndicator) { localVideoIndicator.className = "video-indicator active"; }
    
    // Clear any previous remote slots
    const grid = document.getElementById("videoGrid");
    const slots = grid.querySelectorAll(".video-slot:not(.local-slot)");
    slots.forEach(s => s.remove());
    
    updateGridLayout();
}

function stopVideoChat() {
    console.log("WebRTC: Stopping video chat session...");
    document.getElementById("videoChatOverlay").style.display = "none";
    document.getElementById("videoChatRestoreBtn").style.display = "none";
    
    stopLocalMedia();
    
    // Close all peer connections
    for (const peerUserId in peerConnections) {
        closePeerConnection(peerUserId);
    }
    peerConnections = {};
}

function stopLocalMedia() {
    if (mockCanvasAnimationId) {
        cancelAnimationFrame(mockCanvasAnimationId);
        mockCanvasAnimationId = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
}

async function initLocalMedia() {
    try {
        console.log("WebRTC: Requesting camera and microphone permissions...");
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        console.log("WebRTC: Successfully initialized camera and microphone streams.");
    } catch (e) {
        console.warn("WebRTC: Camera/microphone not accessible. Generating glowing canvas mockup...", e);
        localStream = generateMockMediaStream();
    }
    
    const localVideo = document.getElementById("localVideo");
    if (localVideo) {
        localVideo.srcObject = localStream;
    }
}

function generateMockMediaStream() {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    canvas.className = "mock-stream-canvas";
    const ctx = canvas.getContext("2d");
    
    let hue = Math.random() * 360;
    let radiusPulse = 0;
    let angle = 0;
    
    function drawMockFrame() {
        if (!localStream) return;
        
        angle += 0.05;
        radiusPulse = Math.sin(angle) * 15 + 40;
        hue = (hue + 0.2) % 360;
        
        const grad = ctx.createRadialGradient(160, 120, 10, 160, 120, 180);
        grad.addColorStop(0, `hsl(${hue}, 60%, 15%)`);
        grad.addColorStop(1, "#0c0b0e");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 320, 240);
        
        ctx.strokeStyle = `hsla(${(hue + 180) % 360}, 80%, 60%, 0.3)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(160, 120, radiusPulse + 20, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
        ctx.beginPath();
        ctx.arc(160, 120, radiusPulse, 0, Math.PI * 2);
        ctx.shadowColor = `hsl(${hue}, 80%, 50%)`;
        ctx.shadowBlur = 20;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = "#ffffff";
        ctx.font = "24px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🎙️", 160, 118);
        
        ctx.fillStyle = "#f5f5f7";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText("Sofa Stream", 160, 190);
        
        ctx.fillStyle = "#8e8d94";
        ctx.font = "10px monospace";
        ctx.fillText(`Camera Mocked`, 160, 210);
        
        mockCanvasAnimationId = requestAnimationFrame(drawMockFrame);
    }
    
    drawMockFrame();
    
    const stream = canvas.captureStream(24);
    
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const mediaStreamDestination = audioContext.createMediaStreamDestination();
        
        const osc = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.0;
        osc.connect(gainNode);
        gainNode.connect(mediaStreamDestination);
        osc.start();
        
        const audioTrack = mediaStreamDestination.stream.getAudioTracks()[0];
        if (audioTrack) {
            stream.addTrack(audioTrack);
        }
    } catch(err) {
        console.error("WebRTC: Failed to synthesize audio track", err);
    }
    
    return stream;
}

function makeOverlayDraggable() {
    const overlay = document.getElementById("videoChatOverlay");
    const header = document.getElementById("videoChatHeader");
    const container = document.getElementById("theaterContainer");
    
    if (!overlay || !header || !container) return;
    
    let active = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    
    header.addEventListener("mousedown", dragStart, false);
    document.addEventListener("mouseup", dragEnd, false);
    document.addEventListener("mousemove", drag, false);
    
    header.addEventListener("touchstart", dragStart, { passive: false });
    document.addEventListener("touchend", dragEnd, { passive: false });
    document.addEventListener("touchmove", drag, { passive: false });
    
    function dragStart(e) {
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }
        
        if (e.target === header || header.contains(e.target)) {
            active = true;
        }
    }
    
    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        active = false;
    }
    
    function drag(e) {
        if (!active) return;
        
        e.preventDefault();
        
        if (e.type === "touchmove") {
            currentX = e.touches[0].clientX - initialX;
            currentY = e.touches[0].clientY - initialY;
        } else {
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
        }
        
        xOffset = currentX;
        yOffset = currentY;
        
        setTranslate(currentX, currentY, overlay);
    }
    
    function setTranslate(xPos, yPos, el) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        
        const defaultLeft = containerRect.width - elRect.width - 20;
        const defaultTop = 20;
        
        const minX = -defaultLeft;
        const maxX = 20;
        
        const minY = -defaultTop;
        const maxY = containerRect.height - elRect.height - defaultTop;
        
        const clampedX = Math.max(minX, Math.min(maxX, xPos));
        const clampedY = Math.max(minY, Math.min(maxY, yPos));
        
        xOffset = clampedX;
        yOffset = clampedY;
        currentX = clampedX;
        currentY = clampedY;
        
        el.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
    }
    
    window.resetOverlayPosition = () => {
        xOffset = 0;
        yOffset = 0;
        currentX = 0;
        currentY = 0;
        overlay.style.transform = "translate3d(0, 0, 0)";
    };
}

function toggleMinimize() {
    const overlay = document.getElementById("videoChatOverlay");
    const grid = document.getElementById("videoGrid");
    const btn = document.getElementById("btnToggleMinimize");
    
    isMinimized = !isMinimized;
    if (isMinimized) {
        overlay.classList.add("minimized");
        grid.classList.add("single-layout");
        btn.innerText = "🗗";
        btn.title = "Restore Grid View";
    } else {
        overlay.classList.remove("minimized");
        grid.classList.remove("single-layout");
        btn.innerText = "🗖";
        btn.title = "Minimize to Single View";
    }
    
    updateGridLayout();
    if (window.resetOverlayPosition) {
        window.resetOverlayPosition();
    }
}

function collapseCompletely() {
    const overlay = document.getElementById("videoChatOverlay");
    const restoreBtn = document.getElementById("videoChatRestoreBtn");
    
    overlay.style.display = "none";
    restoreBtn.style.display = "flex";
}

function restoreCompletely() {
    const overlay = document.getElementById("videoChatOverlay");
    const restoreBtn = document.getElementById("videoChatRestoreBtn");
    
    overlay.style.display = "flex";
    restoreBtn.style.display = "none";
    if (window.resetOverlayPosition) {
        window.resetOverlayPosition();
    }
}

function toggleAudio() {
    if (!localStream) return;
    isAudioMuted = !isAudioMuted;
    
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isAudioMuted;
    });
    
    const btn = document.getElementById("btnToggleAudio");
    const indicator = document.getElementById("localMicIndicator");
    
    if (isAudioMuted) {
        btn.innerText = "🎤 Unmute";
        btn.classList.add("muted");
        if (indicator) {
            indicator.classList.remove("active");
            indicator.classList.add("muted");
            indicator.innerText = "🔇";
        }
    } else {
        btn.innerText = "🎤 Mute";
        btn.classList.remove("muted");
        if (indicator) {
            indicator.classList.add("active");
            indicator.classList.remove("muted");
            indicator.innerText = "🎙️";
        }
    }
}

function toggleVideo() {
    if (!localStream) return;
    isVideoDisabled = !isVideoDisabled;
    
    localStream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoDisabled;
    });
    
    const btn = document.getElementById("btnToggleVideo");
    const indicator = document.getElementById("localVideoIndicator");
    
    if (isVideoDisabled) {
        btn.innerText = "📷 Enable";
        btn.classList.add("muted");
        if (indicator) {
            indicator.classList.remove("active");
        }
    } else {
        btn.innerText = "📷 Disable";
        btn.classList.remove("muted");
        if (indicator) {
            indicator.classList.add("active");
        }
    }
}

async function initiateConnectionsWithExistingParticipants(participants) {
    console.log("WebRTC: Initiating connections with existing participants:", participants);
    for (const p of participants) {
        if (p.userId === globalUserId) continue;
        
        const pc = getOrCreatePeerConnection(p.userId, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        await connection.invoke("SendSignal", currentRoomId, globalUserId, p.userId, JSON.stringify({
            type: "offer",
            sdp: offer.sdp
        })).catch(err => console.error("WebRTC: Error sending offer signal", err));
    }
}

function getOrCreatePeerConnection(peerUserId, isInitiator) {
    if (peerConnections[peerUserId]) {
        return peerConnections[peerUserId];
    }

    console.log(`WebRTC: Creating RTCPeerConnection for ${peerUserId}, initiator: ${isInitiator}`);
    
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
        ]
    });

    peerConnections[peerUserId] = pc;

    // Add local tracks to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // ICE candidate handler
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            connection.invoke("SendSignal", currentRoomId, globalUserId, peerUserId, JSON.stringify({
                type: "candidate",
                candidate: event.candidate
            })).catch(err => console.error("WebRTC: Error sending ICE candidate", err));
        }
    };

    // Remote stream handler
    pc.ontrack = (event) => {
        console.log(`WebRTC: Remote track received from ${peerUserId}`);
        const remoteStream = event.streams[0];
        displayRemoteStream(peerUserId, remoteStream);
    };

    pc.onconnectionstatechange = () => {
        console.log(`WebRTC: Connection state with ${peerUserId} changed to ${pc.connectionState}`);
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
            closePeerConnection(peerUserId);
        }
    };

    return pc;
}

async function handleOffer(peerUserId, sdp) {
    const pc = getOrCreatePeerConnection(peerUserId, false);
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    await connection.invoke("SendSignal", currentRoomId, globalUserId, peerUserId, JSON.stringify({
        type: "answer",
        sdp: answer.sdp
    })).catch(err => console.error("WebRTC: Error sending answer signal", err));
}

async function handleAnswer(peerUserId, sdp) {
    const pc = peerConnections[peerUserId];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: sdp }));
    }
}

async function handleCandidate(peerUserId, candidate) {
    const pc = peerConnections[peerUserId];
    if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

function displayRemoteStream(peerUserId, remoteStream) {
    let slot = document.getElementById(`slot-${peerUserId}`);
    if (slot) {
        const video = slot.querySelector("video");
        if (video && video.srcObject !== remoteStream) {
            video.srcObject = remoteStream;
        }
        return;
    }

    console.log(`WebRTC: Displaying remote stream for peer: ${peerUserId}`);
    
    const totalSlots = document.querySelectorAll(".video-slot").length;
    if (totalSlots >= 4) {
        console.warn("WebRTC: Maximum UI camera slots (4) reached, ignoring video stream display.");
        return;
    }

    const grid = document.getElementById("videoGrid");
    slot = document.createElement("div");
    slot.className = "video-slot";
    slot.id = `slot-${peerUserId}`;
    
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsinline = true;
    video.srcObject = remoteStream;
    
    const label = document.createElement("div");
    label.className = "video-label";
    label.innerText = `User ID: ${peerUserId.substring(0, 8)}`;
    
    const controls = document.createElement("div");
    controls.className = "slot-controls";
    
    const micInd = document.createElement("span");
    micInd.className = "mic-indicator active";
    micInd.innerText = "🎙️";
    
    const vidInd = document.createElement("span");
    vidInd.className = "video-indicator active";
    vidInd.innerText = "📷";
    
    controls.appendChild(micInd);
    controls.appendChild(vidInd);
    
    slot.appendChild(video);
    slot.appendChild(label);
    slot.appendChild(controls);
    
    grid.appendChild(slot);
    
    updateGridLayout();
}

function closePeerConnection(peerUserId) {
    console.log(`WebRTC: Closing PeerConnection for ${peerUserId}`);
    const pc = peerConnections[peerUserId];
    if (pc) {
        try { pc.close(); } catch(e) {}
        delete peerConnections[peerUserId];
    }
    
    const slot = document.getElementById(`slot-${peerUserId}`);
    if (slot) {
        slot.remove();
    }
    
    updateGridLayout();
}

function updateGridLayout() {
    const grid = document.getElementById("videoGrid");
    if (!grid) return;
    const slots = grid.querySelectorAll(".video-slot");
    
    if (slots.length === 1 || grid.classList.contains("single-layout")) {
        grid.classList.add("single-layout");
    } else {
        grid.classList.remove("single-layout");
    }
}

// Register click events for Video Chat
document.getElementById("btnToggleMinimize").addEventListener("click", toggleMinimize);
document.getElementById("btnToggleCollapse").addEventListener("click", collapseCompletely);
document.getElementById("videoChatRestoreBtn").addEventListener("click", restoreCompletely);
document.getElementById("btnToggleAudio").addEventListener("click", toggleAudio);
document.getElementById("btnToggleVideo").addEventListener("click", toggleVideo);