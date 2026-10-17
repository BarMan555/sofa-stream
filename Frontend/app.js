// --- Sofa Stream Main Application Entry Point ---

let videoPlayer = null;
let syncMachine = null;

function initPlayerAfterAPIReady() {
    if (!syncMachine) return;
    if (videoPlayer) {
        videoPlayer.initializeYoutubePlayer();
        return;
    }
    videoPlayer = new UniversalPlayer("youtubePlayer", "rutubePlayer", onPlayerStateChange, () => {
        window.applyMovieVolume?.();
        syncMachine.setPlayer(videoPlayer);
        if (isHost) syncMachine.setHostStatus(true);
        console.log("FSM: State Machine activated safely after Player Ready.");
        if (currentRoomId) {
            fetchAndSyncCurrentState(currentRoomId);
        }
    });
    window.videoPlayer = videoPlayer;
    window.applyMovieVolume?.();
}
window.initPlayerAfterAPIReady = initPlayerAfterAPIReady;

function onPlayerStateChange(domainState) {
    if (syncMachine) {
        syncMachine.handlePlayerStateNotification(domainState);
        if (domainState === PlaybackState.Playing && window.syncVideoDuration)
            void window.syncVideoDuration().catch(error => console.warn('Video metadata could not be saved:', error));
    }
}

// Bind Main Menu & Settings Actions
function initLayoutActions() {
    const btnAbout = document.getElementById('btn-about');
    if (btnAbout) {
        btnAbout.addEventListener('click', () => {
            const aboutContainer = document.getElementById('about-container');
            if (aboutContainer) aboutContainer.classList.toggle('hidden');
        });
    }

    const btnMenuCreate = document.getElementById('btn-menu-create');
    if (btnMenuCreate) {
        btnMenuCreate.addEventListener('click', () => {
            currentSettingsMode = 'create';
            const heading = document.getElementById('settings-heading');
            if (heading) heading.innerText = 'Create Room Settings';
            
            const rnGroup = document.getElementById('settings-room-name-group');
            const riGroup = document.getElementById('settings-room-id-group');
            const rtGroup = document.getElementById('settings-room-theme-group');
            if (rnGroup) rnGroup.classList.remove('hidden');
            if (riGroup) riGroup.classList.add('hidden');
            if (rtGroup) rtGroup.classList.remove('hidden');
            
            switchView('settings-form');
        });
    }

    const btnMenuJoin = document.getElementById('btn-menu-join');
    if (btnMenuJoin) {
        btnMenuJoin.addEventListener('click', () => {
            currentSettingsMode = 'join';
            const heading = document.getElementById('settings-heading');
            if (heading) heading.innerText = 'Join Room Settings';
            
            const rnGroup = document.getElementById('settings-room-name-group');
            const riGroup = document.getElementById('settings-room-id-group');
            const rtGroup = document.getElementById('settings-room-theme-group');
            if (rnGroup) rnGroup.classList.add('hidden');
            if (riGroup) riGroup.classList.remove('hidden');
            if (rtGroup) rtGroup.classList.add('hidden');
            
            switchView('settings-form');
        });
    }

    const btnSettingsBack = document.getElementById('btn-settings-back');
    if (btnSettingsBack) {
        btnSettingsBack.addEventListener('click', () => {
            switchView('main-menu');
        });
    }

    const btnSettingsConfirm = document.getElementById('btn-settings-confirm');
    if (btnSettingsConfirm) {
        btnSettingsConfirm.addEventListener('click', async () => {
            const userName = document.getElementById('userNameInput').value.trim();
            if (userName) {
                localStorage.setItem('sofastream_username', userName);
                localNickname = userName;
            }
            
            if (currentSettingsMode === 'create') {
                await createRoom();
            } else {
                await joinRoom();
            }
        });
    }

    const btnLeaveRoom = document.getElementById('btn-leave-room');
    if (btnLeaveRoom) {
        btnLeaveRoom.addEventListener('click', leaveRoom);
    }

    const btnCopyId = document.getElementById('btn-copy-id');
    if (btnCopyId) {
        btnCopyId.addEventListener('click', () => {
            const idVal = document.getElementById('room-id-value').textContent;
            navigator.clipboard.writeText(idVal).then(() => {
                btnCopyId.textContent = "✅ Copied";
                setTimeout(() => {
                    btnCopyId.textContent = "📋 Copy";
                }, 2000);
            }).catch(err => {
                console.error("Failed to copy text:", err);
            });
        });
    }

    // Load saved username
    const savedName = localStorage.getItem('sofastream_username');
    if (savedName) {
        const input = document.getElementById('userNameInput');
        if (input) input.value = savedName;
        localNickname = savedName;
    }

    // Interactive room theme grid cards logic
    const themeCards = document.querySelectorAll('.theme-card');
    themeCards.forEach(card => {
        card.addEventListener('click', () => {
            themeCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedTheme = card.getAttribute('data-theme');
            applyRoomTheme(selectedTheme);
        });
    });

    const btnChangeVideo = document.getElementById('btn-change-video');
    if (btnChangeVideo) {
        btnChangeVideo.addEventListener('click', async () => {
            try {
                await changeVideo();
            } catch (err) {
                console.error("Error triggering changeVideo pipeline:", err);
            }
        });
    }

    // Controls setup
    setupFullscreenControls();
    
    // Register click events for Video Chat
    const btnToggleMinimize = document.getElementById("btnToggleMinimize");
    if (btnToggleMinimize) btnToggleMinimize.addEventListener("click", toggleMinimize);

    const btnToggleCollapse = document.getElementById("btnToggleCollapse");
    if (btnToggleCollapse) btnToggleCollapse.addEventListener("click", collapseCompletely);

    const videoChatRestoreBtn = document.getElementById("videoChatRestoreBtn");
    if (videoChatRestoreBtn) videoChatRestoreBtn.addEventListener("click", restoreCompletely);

    const btnToggleAudio = document.getElementById("btnToggleAudio");
    if (btnToggleAudio) btnToggleAudio.addEventListener("click", toggleAudio);

    const btnToggleVideo = document.getElementById("btnToggleVideo");
    if (btnToggleVideo) btnToggleVideo.addEventListener("click", toggleVideo);
}

// Custom HTML Control Triggers
let isDraggingProgressBar = false;

function setupCustomControls() {
    const playBtn = document.getElementById('customPlayBtn');
    const pauseBtn = document.getElementById('customPauseBtn');
    const progressBar = document.getElementById('customProgressBar');
    const fullscreenBtn = document.getElementById('customFullscreenBtn');

    if (playBtn) {
        playBtn.addEventListener('click', () => {
            lastUiInteractionTime = Date.now();
            syncMachine.handleUiAction(PlaybackState.Playing);
        });
    }

    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            lastUiInteractionTime = Date.now();
            syncMachine.handleUiAction(PlaybackState.Paused);
        });
    }

    if (progressBar) {
        progressBar.addEventListener('mousedown', () => { isDraggingProgressBar = true; });
        progressBar.addEventListener('mouseup', () => { isDraggingProgressBar = false; });
        progressBar.addEventListener('touchstart', () => { isDraggingProgressBar = true; });
        progressBar.addEventListener('touchend', () => { isDraggingProgressBar = false; });

        progressBar.addEventListener('change', () => {
            lastUiInteractionTime = Date.now();
            const targetSeconds = parseFloat(progressBar.value);
            syncMachine.handleSliderSeek(targetSeconds);
        });

        progressBar.addEventListener('input', () => {
            if (!videoPlayer || !videoPlayer.player || typeof videoPlayer.player.getDuration !== 'function') return;
            const value = parseFloat(progressBar.value);
            const duration = videoPlayer.player.getDuration() || 0;

            const percentage = (value / duration) * 100 || 0;
            progressBar.style.background = `linear-gradient(to right, var(--primary) ${percentage}%, #232228 ${percentage}%)`;

            document.getElementById('customTimeLabel').textContent = `${formatTime(value, duration)} / ${formatTime(duration, duration)}`;
        });
    }

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
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
    }
}

// Keep the chat in its room dock outside fullscreen.
document.addEventListener("fullscreenchange", () => window.placeVideoChat?.());

// Periodic Progress Bar & State Updater Loop
setInterval(() => {
    if (!videoPlayer || !videoPlayer.player || typeof videoPlayer.player.getDuration !== 'function') return;

    const playBtn = document.getElementById('customPlayBtn');
    const pauseBtn = document.getElementById('customPauseBtn');
    const progressBar = document.getElementById('customProgressBar');

    if (!currentRoomId || isJoiningRoom || !videoPlayer.videoReady) {
        if (playBtn) playBtn.disabled = true;
        if (pauseBtn) pauseBtn.disabled = true;
        return;
    }

    if (!isHost) {
        if (playBtn) playBtn.disabled = true;
        if (pauseBtn) pauseBtn.disabled = true;
    }

    if (!isDraggingProgressBar && progressBar) {
        const currentTime = videoPlayer.getCurrentTime();
        const duration = videoPlayer.player.getDuration() || 0;

        if (duration > 0) {
            progressBar.max = duration;
            progressBar.value = currentTime;

            const percentage = (currentTime / duration) * 100;
            progressBar.style.background = `linear-gradient(to right, var(--primary) ${percentage}%, #232228 ${percentage}%)`;
        }
        document.getElementById('customTimeLabel').textContent = `${formatTime(currentTime, duration)} / ${formatTime(duration, duration)}`;
    }

    if (Date.now() - lastUiInteractionTime < INTERACTION_GRACE_PERIOD_MS) {
        return;
    }

    if (isHost && typeof videoPlayer.player.getPlayerState === 'function') {
        const state = videoPlayer.player.getPlayerState();

        if (state === YT.PlayerState.PLAYING) {
            if (playBtn) playBtn.disabled = true;
            if (pauseBtn) pauseBtn.disabled = false;
        }
        else if (
            state === YT.PlayerState.PAUSED ||
            state === YT.PlayerState.ENDED ||
            state === YT.PlayerState.CUED ||
            state === -1
        ) {
            if (playBtn) playBtn.disabled = false;
            if (pauseBtn) pauseBtn.disabled = true;
        }
        else if (state === YT.PlayerState.BUFFERING) {
            if (playBtn) playBtn.disabled = true;
            if (pauseBtn) pauseBtn.disabled = true;
        }
    }
}, 500);

// Keyboard Seek Listeners
let pendingSeekTimeout = null;
let localTargetTime = null;

document.addEventListener('keydown', (e) => {
    if (!videoPlayer || !videoPlayer.player || !currentRoomId) return;

    const activeEl = document.activeElement;
    if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || activeEl.isContentEditable) {
            return;
        }
    }

    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    e.preventDefault();

    const seekOffset = (e.key === 'ArrowRight') ? 10 : -10;
    const duration = videoPlayer.getDuration() || 0;

    if (localTargetTime === null) {
        localTargetTime = videoPlayer.getCurrentTime() || 0;
    }

    localTargetTime = Math.max(0, Math.min(duration, localTargetTime + seekOffset));

    videoPlayer.seekTo(localTargetTime);

    const progressBar = document.getElementById('customProgressBar');
    if (progressBar && duration > 0) {
        progressBar.value = localTargetTime;
        const percentage = (localTargetTime / duration) * 100;
        progressBar.style.background = `linear-gradient(to right, var(--primary) ${percentage}%, #232228 ${percentage}%)`;
    }
    const timeLabel = document.getElementById('customTimeLabel');
    if (timeLabel && duration > 0) {
        timeLabel.textContent = `${formatTime(localTargetTime, duration)} / ${formatTime(duration, duration)}`;
    }

    if (isHost) {
        if (pendingSeekTimeout) clearTimeout(pendingSeekTimeout);
        pendingSeekTimeout = setTimeout(() => {
            const targetSec = localTargetTime;
            localTargetTime = null;
            pendingSeekTimeout = null;
            syncMachine.handleKeyboardSeek(targetSec);
        }, 500);
    } else {
        if (pendingSeekTimeout) clearTimeout(pendingSeekTimeout);
        pendingSeekTimeout = setTimeout(() => {
            localTargetTime = null;
            pendingSeekTimeout = null;
        }, 500);
    }
});

// App Initialization Bootstrapper
document.addEventListener("DOMContentLoaded", () => {
    syncMachine = new SyncStateMachine(sendPlaybackStateUpdate);
    window.syncMachine = syncMachine;

    initLayoutActions();
    setupCustomControls();
    setupMovieVolumeControls();

    initPlayerAfterAPIReady();
});
