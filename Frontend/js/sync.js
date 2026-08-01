// --- Synchronization State Machine ---
class SyncStateMachine {
    constructor(sendUpdateCallback) {
        this.player = null;
        this.sendUpdate = sendUpdateCallback;
        this.isHost = false;

        this.isProcessingRemoteEvent = false;
        this.scheduledPlayTimer = null;
        this.unlockTimer = null;
        this.isLocallyBuffering = false;
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

    handleKeyboardSeek(targetSeconds) {
        if (!currentRoomId || !this.player || !this.isHost) return;

        const currentState = this.player.getPlayerState();
        const isPlaying = (currentState === 1);

        this.player.seekTo(targetSeconds);

        if (isPlaying) {
            this.player.play();
            this.sendUpdate(PlaybackState.Playing, targetSeconds);
        } else {
            this.player.pause();
            this.sendUpdate(PlaybackState.Paused, targetSeconds);
        }
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

        if (domainState === PlaybackState.Buffering) {
            this.isLocallyBuffering = true;
            if (this.isHost && currentRoomId) {
                this.sendUpdate(PlaybackState.Buffering);
            }
        } else if (domainState === PlaybackState.Playing || domainState === PlaybackState.Paused) {
            if (this.isLocallyBuffering) {
                this.isLocallyBuffering = false;
                if (typeof sendBufferingCompleted === "function") {
                    sendBufferingCompleted();
                }
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
window.SyncStateMachine = SyncStateMachine;
