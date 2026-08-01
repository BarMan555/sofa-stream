// --- SignalR Connection & HTTP REST API Gateway ---
const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${API_BASE_URL}/hubs/room`)
    .withAutomaticReconnect()
    .build();
window.connection = connection;

connection.on("OnVideoChanged", (videoData) => {
    if (!videoData || !videoData.url) return;
    const videoId = extractVideoId(videoData.url);
    if (videoId && window.videoPlayer) {
        window.syncMachine.handleRemoteVideoChange(videoId, 0);
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

// HTTP API Calls
async function createRoom() {
    const roomNameInput = document.getElementById('roomNameInput').value.trim();

    if (!roomNameInput) {
        alert("Please enter a valid Room Name before proceeding!");
        return;
    }

    const response = await fetch(`${API_BASE_URL}/api/room`, {
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
    const roomId = document.getElementById('roomIdInput').value.trim();

    if (!roomId) {
        alert("Please provide a valid Room ID.");
        return;
    }

    if (window.videoPlayer) {
        try { window.videoPlayer.play(); window.videoPlayer.pause(); } catch (e) {}
    }

    try { stopVideoChat(); } catch (e) {}

    isJoiningRoom = true;
    try {
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
            isJoiningRoom = false;
            return;
        }

        currentRoomId = roomId;

        try {
            const stateResponse = await fetch(`${API_BASE_URL}/api/room/${roomId}`);
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

        await connection.invoke("JoinRoom", roomId, globalUserId);
        await startVideoChat();
        await fetchAndSyncCurrentState(roomId);
    } catch (err) {
        console.error("SignalR Connection Error: ", err);
        alert("Failed to connect to the room.");
        currentRoomId = null;
    } finally {
        isJoiningRoom = false;
    }
}

async function leaveRoom() {
    console.log("Leaving room...");
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
    if (!window.videoPlayer) return;
    if (!currentRoomId) return;

    const currentTimeSeconds = manualSeconds !== null ? manualSeconds : (window.videoPlayer.getCurrentTime() || 0);

    if (manualSeconds !== null) {
        window.videoPlayer.seekTo(manualSeconds);
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

async function sendBufferingCompleted() {
    if (!currentRoomId) return;

    const payload = {
        userId: globalUserId
    };

    fetch(`${API_BASE_URL}/api/room/${currentRoomId}/playback/buffering-completed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(response => {
        if (!response.ok) {
            console.error("Failed to report buffering completed status to server");
        }
    }).catch(err => {
        console.error("Error sending buffering completed status", err);
    });
}

async function fetchAndSyncCurrentState(roomId) {
    const response = await fetch(`${API_BASE_URL}/api/room/${roomId}`);
    if (response.ok) {
        const state = await response.json();
        console.log("Initial State Fetched:", state);

        if (state && (state.theme || state.Theme)) {
            applyRoomTheme(state.theme || state.Theme);
        }

        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = `Connected to Room: "${state.name || 'Cozy Room'}"\nID: ${roomId}`;
            statusEl.className = "status-badge connected";
        }

        const roomDisplayEl = document.getElementById('room-name-display');
        if (roomDisplayEl) {
            roomDisplayEl.textContent = state.name || 'Cozy Room';
        }

        const roomIdValEl = document.getElementById('room-id-value');
        if (roomIdValEl) {
            roomIdValEl.textContent = roomId;
        }
        
        activeParticipants.clear();
        activeParticipants.add(globalUserId);
        if (state.participants) {
            state.participants.forEach(p => activeParticipants.add(p.userId));
        }
        updateParticipantUi();
        switchView('room-view');

        if (state.currentVideo && state.currentVideo.url && window.videoPlayer) {
            const videoId = extractVideoId(state.currentVideo.url);
            window.syncMachine.handleRemoteVideoChange(videoId, state.currentPositionSeconds);
        } else {
            if (window.videoPlayer) {
                try { window.videoPlayer.pause(); } catch (e) {}
            }
            hidePlayerBlock();
        }

        if (state.participants) {
            await initiateConnectionsWithExistingParticipants(state.participants);
        }
    }
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
