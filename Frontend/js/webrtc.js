// --- WebRTC Video Chat & Overlay Logic ---
let peerConnections = {};
let localStream = null;
let mockCanvasAnimationId = null;
let isMinimized = false;
let isAudioMuted = false;
let isVideoDisabled = false;
let peerNicknames = {};
let peerMediaStates = {};

async function startVideoChat() {
    console.log("WebRTC: Starting video chat session...");
    
    const overlay = document.getElementById("videoChatOverlay");
    const restoreBtn = document.getElementById("videoChatRestoreBtn");
    const theater = document.getElementById("theaterContainer");
    if (overlay && restoreBtn && theater) {
        if (document.fullscreenElement !== theater) {
            document.body.appendChild(overlay);
            document.body.appendChild(restoreBtn);
        } else {
            theater.appendChild(overlay);
            theater.appendChild(restoreBtn);
        }
    }

    if (overlay) overlay.style.display = "flex";
    if (restoreBtn) restoreBtn.style.display = "none";
    
    await initLocalMedia();
    makeOverlayDraggable();
    
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
    
    const grid = document.getElementById("videoGrid");
    const slots = grid.querySelectorAll(".video-slot:not(.local-slot)");
    slots.forEach(s => s.remove());
    
    updateGridLayout();
    if (typeof startDuckingLoop === "function") {
        startDuckingLoop();
    }

    const localLabel = document.querySelector("#slot-local .video-label");
    if (localLabel) {
        localLabel.innerText = `${localNickname} (You)`;
    }

    if (currentRoomId && window.connection) {
        window.connection.invoke("SendSignal", currentRoomId, globalUserId, "all", JSON.stringify({
            type: "nickname",
            nickname: localNickname,
            audio: !isAudioMuted,
            video: !isVideoDisabled
        })).catch(err => console.error("WebRTC: Error broadcasting nickname", err));
    }
}

function stopVideoChat() {
    console.log("WebRTC: Stopping video chat session...");
    const overlay = document.getElementById("videoChatOverlay");
    const restoreBtn = document.getElementById("videoChatRestoreBtn");
    const theater = document.getElementById("theaterContainer");
    
    if (overlay) overlay.style.display = "none";
    if (restoreBtn) restoreBtn.style.display = "none";
    
    if (overlay && restoreBtn && theater) {
        theater.appendChild(overlay);
        theater.appendChild(restoreBtn);
    }
    
    if (typeof stopDuckingLoop === "function") {
        stopDuckingLoop();
    }
    if (typeof resetAudioAnalysers === "function") {
        resetAudioAnalysers();
    }
    stopLocalMedia();
    
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
    
    if (typeof registerAudioAnalyser === "function") {
        registerAudioAnalyser("local", localStream);
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
    let currentX, currentY, initialX, initialY;
    let xOffset = 0, yOffset = 0;
    
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
    
    function dragEnd() {
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
        const isInFullscreen = (document.fullscreenElement === container);
        let containerWidth, containerHeight;
        
        if (isInFullscreen) {
            const containerRect = container.getBoundingClientRect();
            containerWidth = containerRect.width;
            containerHeight = containerRect.height;
        } else {
            containerWidth = window.innerWidth;
            containerHeight = window.innerHeight;
        }
        
        const elRect = el.getBoundingClientRect();
        const defaultLeft = containerWidth - elRect.width - 20;
        const defaultTop = 20;
        
        const minX = -defaultLeft;
        const maxX = 20;
        const minY = -defaultTop;
        const maxY = containerHeight - elRect.height - defaultTop;
        
        const clampedX = Math.max(minX, Math.min(maxX, xPos));
        const clampedY = Math.max(minY, Math.min(maxY, yPos));
        
        xOffset = clampedX;
        yOffset = clampedY;
        currentX = clampedX;
        currentY = clampedY;
        
        el.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
    }
    
    window.resetOverlayPosition = () => {
        xOffset = 0; yOffset = 0; currentX = 0; currentY = 0;
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
        btn.innerText = "👥";
        btn.title = "Restore Grid View";
    } else {
        overlay.classList.remove("minimized");
        grid.classList.remove("single-layout");
        btn.innerText = "👤";
        btn.title = "Minimize to Single View";
    }
    
    updateGridLayout();
    if (window.resetOverlayPosition) window.resetOverlayPosition();
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
    if (window.resetOverlayPosition) window.resetOverlayPosition();
}

function toggleAudio() {
    if (!localStream) return;
    isAudioMuted = !isAudioMuted;
    
    localStream.getAudioTracks().forEach(track => { track.enabled = !isAudioMuted; });
    
    const btn = document.getElementById("btnToggleAudio");
    const indicator = document.getElementById("localMicIndicator");
    
    if (isAudioMuted) {
        btn.innerText = "🎤 Unmute";
        btn.classList.add("muted");
        if (indicator) { indicator.className = "mic-indicator muted"; indicator.innerText = "🔇"; }
    } else {
        btn.innerText = "🎤 Mute";
        btn.classList.remove("muted");
        if (indicator) { indicator.className = "mic-indicator active"; indicator.innerText = "🎙️"; }
    }

    if (currentRoomId && window.connection) {
        window.connection.invoke("SendSignal", currentRoomId, globalUserId, "all", JSON.stringify({
            type: "mediaState",
            audio: !isAudioMuted,
            video: !isVideoDisabled
        })).catch(err => console.error("WebRTC: Error broadcasting audio state change", err));
    }
}

function toggleVideo() {
    if (!localStream) return;
    isVideoDisabled = !isVideoDisabled;
    
    localStream.getVideoTracks().forEach(track => { track.enabled = !isVideoDisabled; });
    
    const btn = document.getElementById("btnToggleVideo");
    const indicator = document.getElementById("localVideoIndicator");
    
    if (isVideoDisabled) {
        btn.innerText = "📷 Enable";
        btn.classList.add("muted");
        if (indicator) indicator.classList.remove("active");
    } else {
        btn.innerText = "📷 Disable";
        btn.classList.remove("muted");
        if (indicator) indicator.classList.add("active");
    }

    if (currentRoomId && window.connection) {
        window.connection.invoke("SendSignal", currentRoomId, globalUserId, "all", JSON.stringify({
            type: "mediaState",
            audio: !isAudioMuted,
            video: !isVideoDisabled
        })).catch(err => console.error("WebRTC: Error broadcasting video state change", err));
    }
}

async function initiateConnectionsWithExistingParticipants(participants) {
    console.log("WebRTC: Initiating connections with existing participants:", participants);
    for (const p of participants) {
        if (p.userId && globalUserId && p.userId.toLowerCase() === globalUserId.toLowerCase()) continue;
        
        const pc = getOrCreatePeerConnection(p.userId, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        await window.connection.invoke("SendSignal", currentRoomId, globalUserId, p.userId, JSON.stringify({
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

    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    pc.onicecandidate = (event) => {
        if (event.candidate && window.connection) {
            window.connection.invoke("SendSignal", currentRoomId, globalUserId, peerUserId, JSON.stringify({
                type: "candidate",
                candidate: event.candidate
            })).catch(err => console.error("WebRTC: Error sending ICE candidate", err));
        }
    };

    pc.ontrack = (event) => {
        console.log(`WebRTC: Remote track received from ${peerUserId}`);
        const remoteStream = event.streams[0];
        displayRemoteStream(peerUserId, remoteStream);
        if (typeof registerAudioAnalyser === "function") {
            registerAudioAnalyser(peerUserId, remoteStream);
        }
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
    
    await window.connection.invoke("SendSignal", currentRoomId, globalUserId, peerUserId, JSON.stringify({
        type: "answer",
        sdp: answer.sdp
    })).catch(err => console.error("WebRTC: Error sending answer signal", err));

    window.connection.invoke("SendSignal", currentRoomId, globalUserId, peerUserId, JSON.stringify({
        type: "nickname",
        nickname: localNickname,
        audio: !isAudioMuted,
        video: !isVideoDisabled
    })).catch(err => console.error("WebRTC: Error sending nickname on offer", err));
}

async function handleAnswer(peerUserId, sdp) {
    const pc = peerConnections[peerUserId];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: sdp }));

        window.connection.invoke("SendSignal", currentRoomId, globalUserId, peerUserId, JSON.stringify({
            type: "nickname",
            nickname: localNickname,
            audio: !isAudioMuted,
            video: !isVideoDisabled
        })).catch(err => console.error("WebRTC: Error sending nickname on answer", err));
    }
}

async function handleCandidate(peerUserId, candidate) {
    const pc = peerConnections[peerUserId];
    if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

function displayRemoteStream(peerUserId, remoteStream) {
    let slot = document.getElementById(`slot-${peerUserId.toLowerCase()}`);
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
    slot.id = `slot-${peerUserId.toLowerCase()}`;
    
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsinline = true;
    video.srcObject = remoteStream;
    
    const label = document.createElement("div");
    label.className = "video-label";
    
    const cachedNick = peerNicknames[peerUserId.toLowerCase()];
    label.innerText = cachedNick || `User: ${peerUserId.substring(0, 8)}`;
    
    const controls = document.createElement("div");
    controls.className = "slot-controls";
    
    const cachedMedia = peerMediaStates[peerUserId.toLowerCase()];
    const audioActive = cachedMedia ? cachedMedia.audio : true;
    const videoActive = cachedMedia ? cachedMedia.video : true;
    
    const micInd = document.createElement("span");
    if (audioActive) {
        micInd.className = "mic-indicator active";
        micInd.innerText = "🎙️";
    } else {
        micInd.className = "mic-indicator muted";
        micInd.innerText = "🔇";
    }
    
    const vidInd = document.createElement("span");
    vidInd.className = videoActive ? "video-indicator active" : "video-indicator";
    vidInd.innerText = "📷";
    
    controls.appendChild(micInd);
    controls.appendChild(vidInd);
    
    slot.appendChild(video);
    slot.appendChild(label);
    slot.appendChild(controls);
    
    grid.appendChild(slot);
    updateGridLayout();
}

function updateRemoteMediaIndicators(peerUserId, audioActive, videoActive) {
    const slot = document.getElementById(`slot-${peerUserId.toLowerCase()}`);
    if (slot) {
        const micInd = slot.querySelector(".mic-indicator");
        const vidInd = slot.querySelector(".video-indicator");
        if (micInd) {
            micInd.className = audioActive ? "mic-indicator active" : "mic-indicator muted";
            micInd.innerText = audioActive ? "🎙️" : "🔇";
        }
        if (vidInd) {
            vidInd.className = videoActive ? "video-indicator active" : "video-indicator";
        }
    }
}

function closePeerConnection(peerUserId) {
    console.log(`WebRTC: Closing PeerConnection for ${peerUserId}`);
    const pc = peerConnections[peerUserId];
    if (pc) {
        try { pc.close(); } catch(e) {}
        delete peerConnections[peerUserId];
    }
    
    if (typeof unregisterAudioAnalyser === "function") {
        unregisterAudioAnalyser(peerUserId);
    }
    
    const slot = document.getElementById(`slot-${peerUserId.toLowerCase()}`);
    if (slot) {
        slot.remove();
    }
    
    updateGridLayout();
}

function updateGridLayout() {
    const grid = document.getElementById("videoGrid");
    if (!grid) return;
    const slots = grid.querySelectorAll(".video-slot");
    
    if (slots.length === 1 || slots.length > 2 || grid.classList.contains("single-layout")) {
        grid.classList.add("single-layout");
    } else {
        grid.classList.remove("single-layout");
    }
}

// Global functions exports
window.startVideoChat = startVideoChat;
window.stopVideoChat = stopVideoChat;
window.initiateConnectionsWithExistingParticipants = initiateConnectionsWithExistingParticipants;
window.handleOffer = handleOffer;
window.handleAnswer = handleAnswer;
window.handleCandidate = handleCandidate;
window.closePeerConnection = closePeerConnection;
window.peerNicknames = peerNicknames;
window.peerMediaStates = peerMediaStates;
window.updateRemoteMediaIndicators = updateRemoteMediaIndicators;
window.toggleMinimize = toggleMinimize;
window.collapseCompletely = collapseCompletely;
window.restoreCompletely = restoreCompletely;
window.toggleAudio = toggleAudio;
window.toggleVideo = toggleVideo;
