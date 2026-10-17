// --- SignalR Connection & HTTP REST API Gateway ---
const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${API_BASE_URL}/hubs/room`, { accessTokenFactory: () => participantSession?.token || "" })
    .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
    .build();
window.connection = connection;
let roomStateRequestSequence = 0;
let roomLifecycleRevision = 0;
let currentRoomVideo = null;
let playbackRequestSequence = 0;
let participantSession = null;
let sessionRequest = null;

async function apiFetch(url, options = {}) {
    const headers = { ...options.headers };
    if (participantSession?.token) headers.Authorization = `Bearer ${participantSession.token}`;
    return fetch(url, { ...options, headers });
}

async function ensureParticipantSession() {
    if (sessionRequest) return sessionRequest;
    sessionRequest = (async () => {
        if (!participantSession) {
            try { participantSession = JSON.parse(sessionStorage.getItem('sofastream.session')); } catch { }
        }
        if (participantSession?.token) {
            const current = await apiFetch(`${API_BASE_URL}/api/session`);
            if (current.ok) {
                const identity = await current.json();
                globalUserId = identity.userId;
                window.globalUserId = globalUserId;
                return;
            }
            if (current.status !== 401) throw new Error('Unable to verify the participant session.');
        }
        const response = await fetch(`${API_BASE_URL}/api/session`, { method: 'POST' });
        if (!response.ok) throw new Error('Unable to create the participant session.');
        participantSession = await response.json();
        globalUserId = participantSession.userId;
        window.globalUserId = globalUserId;
        try { sessionStorage.setItem('sofastream.session', JSON.stringify(participantSession)); } catch { }
    })();
    try { await sessionRequest; } finally { sessionRequest = null; }
}
window.apiFetch = apiFetch;


function rememberRoomVideo(video, revision) {
    const id = extractVideoId(video?.url);
    if (!id) { currentRoomVideo = null; return; }
    if (currentRoomVideo?.revision !== revision || currentRoomVideo?.url !== video.url)
        currentRoomVideo = { id, url: video.url, revision, durationSeconds: Number(video.durationSeconds) || 0, request: null };
    else if (Number(video.durationSeconds) > 0) currentRoomVideo.durationSeconds = Number(video.durationSeconds);
}

async function responseError(response) {
    try {
        const body = await response.json();
        return new Error(body.description || body.title || `Request failed (${response.status}).`);
    } catch { return new Error(`Request failed (${response.status}).`); }
}

async function syncVideoDuration() {
    const video = currentRoomVideo;
    const room = currentRoomId;
    if (!room || !isHost || !video || window.videoPlayer?.currentVideoId !== video.id) return;
    const duration = Number(window.videoPlayer.getDuration());
    if (!Number.isFinite(duration) || duration <= 0 || duration === video.durationSeconds) return;
    if (video.request) return video.request;
    video.request = (async () => {
        const response = await apiFetch(`${API_BASE_URL}/api/room/${room}/video/duration`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: globalUserId, videoRevision: video.revision, durationSeconds: duration })
        });
        if (!response.ok) throw await responseError(response);
        video.durationSeconds = duration;
    })();
    try { await video.request; } finally { video.request = null; }
}
window.syncVideoDuration = syncVideoDuration;

function observeVideoDuration() {
    const room = currentRoomId;
    const revision = roomLifecycleRevision;
    const video = currentRoomVideo;
    window.videoPlayer?.whenVideoReady?.(() => {
        if (room === currentRoomId && revision === roomLifecycleRevision && video === currentRoomVideo)
            void syncVideoDuration().catch(error => console.warn('Video metadata could not be saved:', error));
    });
}

async function restoreAfterCommandFailure(room, error, notify = true) {
    if (room !== currentRoomId) return false;
    if (notify) alert(error.message || 'The command could not be completed.');
    try {
        if (await fetchAndSyncCurrentState(room, { restorePeers: false }) === false)
            showConnectionStatus('Unable to synchronize the room. Please reconnect.');
    } catch (syncError) {
        console.error('Unable to restore the room state:', syncError);
        showConnectionStatus('Unable to synchronize the room. Please reconnect.');
    }
    return false;
}

function playbackTimeSpan(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('The playback position is invalid.');
    const totalMs = Math.floor(seconds * 1000);
    const days = Math.floor(totalMs / 86400000);
    const hours = Math.floor(totalMs / 3600000) % 24;
    const minutes = Math.floor(totalMs / 60000) % 60;
    const wholeSeconds = Math.floor(totalMs / 1000) % 60;
    const fraction = totalMs % 1000;
    return `${days ? `${days}.` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}${fraction ? `.${String(fraction).padStart(3, '0')}` : ''}`;
}

connection.on("OnVideoChanged", (videoData) => {
    if (!videoData || !videoData.url) return;
    const videoId = extractVideoId(videoData.url);
    if (videoId && window.syncMachine) {
        if (Number.isFinite(videoData.revision) && videoData.revision < window.syncMachine.serverVideoRevision) return;
        rememberRoomVideo(videoData, videoData.revision);
        window.syncMachine.handleRemoteVideoChange(videoId, 0, videoData.revision);
        observeVideoDuration();
    }
});

connection.on("OnPlaybackStateChanged", (data) => {
    if (window.syncMachine) {
        window.syncMachine.handleRemoteEvent(data);
    }
});

connection.on("OnUserJoined", (userId) => {
    if (userId && globalUserId && userId.toLowerCase() === globalUserId.toLowerCase()) return;
    console.log(`WebRTC: User joined room: ${userId}`);
    if (typeof closePeerConnection === "function") closePeerConnection(userId);
    activeParticipants.add(userId);
    updateParticipantUi();
    
    connection.invoke("SendSignal", currentRoomId, globalUserId, userId, JSON.stringify({
        type: "nickname",
        nickname: localNickname,
        audio: !isAudioMuted,
        video: !isVideoDisabled
    })).catch(err => console.error("WebRTC: Error sending nickname to joined user", err));
});

connection.on("OnUserLeft", (userId) => {
    if (userId && globalUserId && userId.toLowerCase() === globalUserId.toLowerCase()) return;
    console.log(`WebRTC: User left room: ${userId}`);
    if (typeof closePeerConnection === "function") {
        closePeerConnection(userId);
    }
    activeParticipants.delete(userId);
    updateParticipantUi();
});

connection.on("OnHostChanged", (newHostId) => {
    console.log(`FSM: Host changed to: ${newHostId}`);
    isHost = (newHostId && globalUserId && newHostId.toLowerCase() === globalUserId.toLowerCase());
    if (window.syncMachine) {
        window.syncMachine.setHostStatus(isHost);
    }
    updateHostUiVisibility();
});

connection.on("OnSignalReceived", async (senderUserId, targetUserId, signalStr) => {
    const isBroadcast = (targetUserId === "all");
    if (!isBroadcast && (!targetUserId || !globalUserId || targetUserId.toLowerCase() !== globalUserId.toLowerCase())) return;
    try {
        const signal = JSON.parse(signalStr);
        if (signal.type === "offer") {
            await handleOffer(senderUserId, signal.sdp);
        } else if (signal.type === "answer") {
            await handleAnswer(senderUserId, signal.sdp);
        } else if (signal.type === "candidate") {
            await handleCandidate(senderUserId, signal.candidate);
        } else if (signal.type === "nickname") {
            const peerKey = senderUserId.toLowerCase();
            peerNicknames[peerKey] = signal.nickname;
            
            const slot = document.getElementById(`slot-${senderUserId.toLowerCase()}`);
            if (slot) {
                const label = slot.querySelector(".video-label");
                if (label) {
                    label.innerText = signal.nickname;
                }
            }
            
            if (signal.audio !== undefined && signal.video !== undefined) {
                peerMediaStates[peerKey] = { audio: signal.audio, video: signal.video };
                updateRemoteMediaIndicators(senderUserId.toLowerCase(), signal.audio, signal.video);
            }
            
            if (isBroadcast) {
                connection.invoke("SendSignal", currentRoomId, globalUserId, senderUserId, JSON.stringify({
                    type: "nickname",
                    nickname: localNickname,
                    audio: !isAudioMuted,
                    video: !isVideoDisabled
                })).catch(err => console.error("WebRTC: Error replying with nickname", err));
            }
        } else if (signal.type === "mediaState") {
            const peerKey = senderUserId.toLowerCase();
            peerMediaStates[peerKey] = { audio: signal.audio, video: signal.video };
            updateRemoteMediaIndicators(senderUserId.toLowerCase(), signal.audio, signal.video);
        }
    } catch (e) {
        console.error("WebRTC: Error handling signal from peer", e);
    }
});

function showConnectionStatus(message, connected = false) {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = message;
        status.className = `status-badge ${connected ? 'connected' : 'disconnected'}`;
        status.style.setProperty('display', connected ? 'none' : 'block', 'important');
    }
}

connection.onreconnecting?.(() => {
    if (!currentRoomId) return;
    roomStateRequestSequence++;
    window.syncMachine?.reset();
    isHost = false;
    window.syncMachine?.setHostStatus(false);
    updateHostUiVisibility();
    if (window.syncMachine) window.syncMachine.isProcessingRemoteEvent = true;
    window.videoPlayer?.pause();
    if (typeof peerConnections !== 'undefined') Object.keys(peerConnections).forEach(closePeerConnection);
    showConnectionStatus('Reconnecting to the room…');
});

connection.onreconnected?.(async () => {
    const room = currentRoomId;
    const revision = roomLifecycleRevision;
    if (!room) return;
    try {
        const joined = await apiFetch(`${API_BASE_URL}/api/room/${room}/join`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: globalUserId })
        });
        if (room !== currentRoomId || revision !== roomLifecycleRevision) {
            if (joined.ok) await apiFetch(`${API_BASE_URL}/api/room/${room}/leave`, { method: 'POST' });
            return;
        }
        if (!joined.ok) throw new Error('The room is no longer available or is full.');
        await connection.invoke('JoinRoom', room, globalUserId);
        if (room !== currentRoomId || revision !== roomLifecycleRevision) return;
        await fetchAndSyncCurrentState(room);
    } catch (error) {
        if (room !== currentRoomId || revision !== roomLifecycleRevision) return;
        console.error('Unable to restore the room:', error);
        await leaveRoom();
        alert('The connection could not be restored. Please join the room again.');
    }
});

connection.onclose?.(() => {
    if (currentRoomId) {
        showConnectionStatus('Connection lost. Please join the room again.');
        void leaveRoom();
    }
});

// HTTP API Calls
async function createRoom() {
    const roomNameInput = document.getElementById('roomNameInput').value.trim();

    if (!roomNameInput) {
        alert("Please enter a valid Room Name before proceeding!");
        return;
    }

    try { await ensureParticipantSession(); } catch (error) { alert(error.message); return; }
    const response = await apiFetch(`${API_BASE_URL}/api/room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomNameInput, hostId: globalUserId, theme: selectedTheme })
    });

    if (response.ok) {
        const roomId = await response.text();
        document.getElementById('roomIdInput').value = roomId.replace(/"/g, '');
        isHost = true;
        window.syncMachine.setHostStatus(true);
        updateHostUiVisibility();
        await joinRoom();
    } else {
        alert("Failed to create room.");
    }
}

async function joinRoom() {
    try { await ensureParticipantSession(); } catch (error) { alert(error.message); return; }
    const roomId = document.getElementById('roomIdInput').value.trim();

    if (!roomId) {
        alert("Please provide a valid Room ID.");
        return;
    }

    if (window.videoPlayer) {
        try { window.videoPlayer.play(); window.videoPlayer.pause(); } catch (e) {}
    }

    try { stopVideoChat(); } catch (e) {}

    const joiningRevision = ++roomLifecycleRevision;
    isJoiningRoom = true;
    try {
        const joinResponse = await apiFetch(`${API_BASE_URL}/api/room/${roomId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: globalUserId })
        });

        if (joiningRevision !== roomLifecycleRevision) {
            if (joinResponse.ok) await apiFetch(`${API_BASE_URL}/api/room/${roomId}/leave`, { method: 'POST' });
            return;
        }
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
            isJoiningRoom = false;
            return;
        }

        currentRoomId = roomId;

        try {
            const stateResponse = await apiFetch(`${API_BASE_URL}/api/room/${roomId}`);
            if (joiningRevision !== roomLifecycleRevision || currentRoomId !== roomId) return;
            if (stateResponse.ok) {
                const state = await stateResponse.json();
                if (state && state.participants) {
                    const me = state.participants.find(p => p.userId && globalUserId && p.userId.toLowerCase() === globalUserId.toLowerCase());
                    if (me) {
                        isHost = me.isHost;
                    }
                }
            }
        } catch (e) {
            console.error("Error validating host status during join:", e);
        }

        window.syncMachine.setHostStatus(isHost);
        updateHostUiVisibility();

        if (connection.state === signalR.HubConnectionState.Disconnected) {
            await connection.start();
        }

        if (joiningRevision !== roomLifecycleRevision || currentRoomId !== roomId) return;
        await connection.invoke("JoinRoom", roomId, globalUserId);
        if (joiningRevision !== roomLifecycleRevision || currentRoomId !== roomId) return;
        await startVideoChat();
        await fetchAndSyncCurrentState(roomId);
    } catch (err) {
        if (joiningRevision !== roomLifecycleRevision) return;
        console.error("SignalR Connection Error: ", err);
        await leaveRoom();
        alert("Failed to connect to the room.");
    } finally {
        if (joiningRevision === roomLifecycleRevision) isJoiningRoom = false;
    }
}

async function leaveRoom() {
    const leavingRoom = currentRoomId;
    roomLifecycleRevision++;
    playbackRequestSequence++;
    currentRoomVideo = null;
    isJoiningRoom = false;
    console.log("Leaving room...");
    currentRoomId = null;
    roomStateRequestSequence++;
    window.syncMachine?.reset();
    if (leavingRoom && participantSession?.token) {
        try {
            const response = await apiFetch(`${API_BASE_URL}/api/room/${leavingRoom}/leave`, { method: 'POST' });
            if (!response.ok && response.status !== 403) console.warn('Room exit could not be confirmed.');
        } catch (error) { console.warn('Room exit will be completed after the reconnect grace period.', error); }
    }
    if (connection) {
        try {
            await connection.stop();
        } catch (e) {
            console.error("Error stopping SignalR connection:", e);
        }
    }
    
    stopVideoChat();
    hidePlayerBlock();
    
    if (window.videoPlayer) {
        try {
            window.videoPlayer.pause();
            const rtEl = document.getElementById(window.videoPlayer.rtIframeId);
            if (rtEl) {
                rtEl.src = 'about:blank';
            }
        } catch (e) {
            console.warn("Error pausing/unloading video player on leave", e);
        }
    }
    
    currentRoomId = null;
    isHost = false;
    window.syncMachine.setHostStatus(false);
    updateHostUiVisibility();
    applyRoomTheme('WarmHome');
    
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = "Disconnected";
        statusEl.className = "status-badge disconnected";
    }
    
    switchView('main-menu');
}

async function changeVideo() {
    if (!currentRoomId && isJoiningRoom) {
        console.log("Session establishment in progress, waiting...");
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (currentRoomId) break;
        }
    }

    if (!currentRoomId) return alert("Join a room first!");

    const videoUrl = document.getElementById('videoUrlInput').value.trim();
    const videoId = extractVideoId(videoUrl);

    if (!videoId) return alert("Invalid Video URL (supports YouTube & RuTube)");

    const isRutube = videoUrl.includes("rutube.ru");
    const payload = {
        userId: globalUserId,
        videoUrl: videoUrl,
        title: isRutube ? "RuTube Video" : "YouTube Video",
        durationSeconds: 0
    };

    const room = currentRoomId;
    try {
        const response = await apiFetch(`${API_BASE_URL}/api/room/${room}/video`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (!response.ok) throw await responseError(response);
    } catch (error) { await restoreAfterCommandFailure(room, error); }
}

async function sendPlaybackStateUpdate(stateEnum, manualSeconds = null) {
    if (!window.videoPlayer || !currentRoomId) return false;
    const room = currentRoomId;
    const lifecycle = roomLifecycleRevision;
    const request = ++playbackRequestSequence;
    const videoRevision = window.syncMachine?.serverVideoRevision ?? 0;
    const seconds = manualSeconds !== null ? manualSeconds : Number(window.videoPlayer.getCurrentTime());
    try {
        const clientPosition = playbackTimeSpan(seconds);
        if (manualSeconds !== null) window.videoPlayer.seekTo(manualSeconds);
        await syncVideoDuration();
        if (room !== currentRoomId || lifecycle !== roomLifecycleRevision || videoRevision !== (window.syncMachine?.serverVideoRevision ?? 0)) return false;
        const response = await apiFetch(`${API_BASE_URL}/api/room/${room}/playback`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: globalUserId, requestedState: stateEnum, clientPosition, videoRevision })
        });
        if (!response.ok) throw await responseError(response);
        return true;
    } catch (error) {
        if (request !== playbackRequestSequence) return false;
        return restoreAfterCommandFailure(room, error, stateEnum !== PlaybackState.Buffering);
    }
}

async function sendBufferingCompleted(videoRevision = window.syncMachine?.serverVideoRevision ?? 0) {
    if (!currentRoomId) return;

    const payload = {
        userId: globalUserId,
        videoRevision
    };

    return apiFetch(`${API_BASE_URL}/api/room/${currentRoomId}/playback/buffering-completed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(response => {
        if (!response.ok) {
            console.error("Failed to report buffering completed status to server");
        }
        return response.ok;
    }).catch(err => {
        console.error("Error sending buffering completed status", err);
        return false;
    });
}

async function fetchAndSyncCurrentState(roomId, { restorePeers = true } = {}) {
    const requestSequence = ++roomStateRequestSequence;
    const videoRevision = window.syncMachine?.videoRevision;
    const response = await apiFetch(`${API_BASE_URL}/api/room/${roomId}`);
    if (response.ok) {
        const state = await response.json();
        if (roomId !== currentRoomId || requestSequence !== roomStateRequestSequence) return;
        console.log("Initial State Fetched:", state);

        if (state && (state.theme || state.Theme)) {
            applyRoomTheme(state.theme || state.Theme);
        }

        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = `Connected to Room: "${state.name || 'Cozy Room'}"\nID: ${roomId}`;
            statusEl.className = "status-badge connected";
            statusEl.style.setProperty('display', 'none', 'important');
        }

        const roomDisplayEl = document.getElementById('room-name-display');
        if (roomDisplayEl) {
            roomDisplayEl.textContent = state.name || 'Cozy Room';
        }

        const roomIdValEl = document.getElementById('room-id-value');
        if (roomIdValEl) {
            roomIdValEl.textContent = roomId;
        }
        
        if (state.participants) {
            isHost = Boolean(state.participants.find(p => p.userId?.toLowerCase() === globalUserId?.toLowerCase())?.isHost);
            window.syncMachine.setHostStatus(isHost);
            updateHostUiVisibility();
        }

        activeParticipants.clear();
        activeParticipants.add(globalUserId);
        if (state.participants) {
            state.participants.forEach(p => activeParticipants.add(p.userId));
        }
        updateParticipantUi();
        switchView('room-view');

        const videoId = state.currentVideo?.url ? extractVideoId(state.currentVideo.url) : null;
        const me = state.participants?.find(p => p.userId?.toLowerCase() === globalUserId?.toLowerCase());
        window.syncMachine.handleRoomSnapshot(state, videoId, videoRevision, Boolean(me?.isBuffering));
        if (!window.syncMachine.currentVideoId) hidePlayerBlock();
        if (videoId === window.syncMachine.currentVideoId && (state.videoRevision ?? 0) === window.syncMachine.serverVideoRevision) {
            rememberRoomVideo(state.currentVideo, state.videoRevision ?? 0);
            observeVideoDuration();
        }

        if (restorePeers && state.participants) {
            await initiateConnectionsWithExistingParticipants(state.participants);
        }
        return state;
    }
    return false;
}

function extractVideoId(url) {
    if (typeof url !== 'string') return null;
    
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return null;
    
    try {
        const ytReg = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]{11})/;
        const ytMatch = trimmedUrl.match(ytReg);
        if (ytMatch && ytMatch[2] && ytMatch[2].length === 11) {
            return ytMatch[2];
        }
        
        const rtReg = /rutube\.ru\/(?:video|play\/embed)\/(?:private\/)?([a-zA-Z0-9]+)/;
        const rtMatch = trimmedUrl.match(rtReg);
        if (rtMatch && rtMatch[1]) {
            return rtMatch[1];
        }
    } catch (e) {
        console.error("Error parsing video URL:", e);
    }
    
    return null;
}

window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.leaveRoom = leaveRoom;
window.changeVideo = changeVideo;
window.sendPlaybackStateUpdate = sendPlaybackStateUpdate;
window.sendBufferingCompleted = sendBufferingCompleted;
window.fetchAndSyncCurrentState = fetchAndSyncCurrentState;
window.extractVideoId = extractVideoId;
