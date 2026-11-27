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
        this.currentVideoId = null;
        this.videoRevision = 0;
        this.pendingVideoChange = null;
        this.pendingPlayback = null;
        this.latestPlaybackEvent = null;
        this.cancelVideoReady = null;
        this.serverVideoRevision = 0;
        this.bufferingGeneration = 0;
        this.bufferingReport = null;
    }

    setPlayer(player) {
        this.player = player;
        const video = this.pendingVideoChange;
        const playback = this.pendingPlayback;
        this.pendingVideoChange = null;
        this.pendingPlayback = null;
        if (video) this.handleRemoteVideoChange(video.videoId, video.startSeconds);
        if (playback) this.handleRemoteEvent(playback.data, playback.forceSeek);
    }

    clearTimers() {
        this.cancelVideoReady?.();
        this.cancelVideoReady = null;
        if (this.scheduledPlayTimer !== null) clearTimeout(this.scheduledPlayTimer);
        if (this.unlockTimer !== null) clearTimeout(this.unlockTimer);
        this.scheduledPlayTimer = null;
        this.unlockTimer = null;
    }

    reset() {
        this.clearTimers();
        this.pendingVideoChange = null;
        this.pendingPlayback = null;
        this.latestPlaybackEvent = null;
        this.currentVideoId = null;
        this.videoRevision++;
        this.isLocallyBuffering = false;
        this.serverVideoRevision = 0;
        this.bufferingGeneration++;
        this.bufferingReport = null;
        this.isProcessingRemoteEvent = false;
    }
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

    handleRoomSnapshot(state, videoId, requestedVideoRevision = this.videoRevision, wasBuffering = false) {
        if (Number.isFinite(state.videoRevision) && state.videoRevision < this.serverVideoRevision) return;
        const changedVersion = Number.isFinite(state.videoRevision) && state.videoRevision !== this.serverVideoRevision;
        if (requestedVideoRevision !== this.videoRevision && videoId !== this.currentVideoId) return;
        const newerEvent = this.latestPlaybackEvent &&
            Date.parse(this.latestPlaybackEvent.triggeredAt) > Date.parse(state.lastUpdatedAt);
        let data = newerEvent ? this.latestPlaybackEvent : {
            state: state.playbackState,
            positionInSeconds: state.currentPositionSeconds,
            positionAt: state.snapshotAt,
            triggeredAt: state.lastUpdatedAt,
            scheduledFor: state.scheduledFor,
            durationSeconds: state.currentVideo?.durationSeconds,
        };
        if (wasBuffering && data.state === 'Buffering') data = { ...data, reportBufferingReady: true,
            bufferingVideoRevision: state.videoRevision ?? this.serverVideoRevision };
        if (!videoId && !newerEvent) {
            this.reset();
            this.player?.pause();
            return;
        }
        if (videoId && (!newerEvent || !this.currentVideoId) && (videoId !== this.currentVideoId || changedVersion))
            this.handleRemoteVideoChange(videoId, state.currentPositionSeconds, state.videoRevision);
        this.handleRemoteEvent(data, true);
    }

    targetPosition(data) {
        let position = Math.max(0, Number(data.positionInSeconds) || 0);
        const reference = Date.parse(data.scheduledFor ?? data.positionAt ?? data.triggeredAt);
        if (data.state === "Playing" && Number.isFinite(reference))
            position += Math.max(0, (getExactServerTimeNow() - reference) / 1000);
        const snapshotDuration = Number(data.durationSeconds);
        const duration = snapshotDuration > 0 ? snapshotDuration : Number(this.player?.getDuration?.());
        return duration > 0 ? Math.min(position, duration) : position;
    }

    handleRemoteEvent(data, forceSeek = false) {
        if (this.latestPlaybackEvent && Date.parse(data.triggeredAt) < Date.parse(this.latestPlaybackEvent.triggeredAt)) return;
        this.latestPlaybackEvent = data;
        if (data.state === 'Paused') {
            this.isLocallyBuffering = false;
            this.bufferingGeneration++;
        }
        this.clearTimers();
        if (!this.player) {
            this.pendingPlayback = { data, forceSeek };
            return;
        }
        if (data.state === 'Buffering' && !data.reportBufferingReady && this.player.getPlayerState?.() === 3)
            this.reportLocalBuffering();

        this.isProcessingRemoteEvent = true;
        const ready = () => {
            this.cancelVideoReady = null;
            const seek = (exact) => {
                const position = this.targetPosition(data);
                const difference = Math.abs(this.player.getCurrentTime() - position);
                // YouTube seekTo starts a CUED video, even when seeking to zero.
                if (this.player.getPlayerState?.() === 5 && difference < 0.001) return;
                if (exact || difference > 1.5) this.player.seekTo(position);
            };
            const delayMs = data.state === "Playing" && data.scheduledFor
                ? Date.parse(data.scheduledFor) - getExactServerTimeNow() : 0;
            const apply = () => {
                this.scheduledPlayTimer = null;
                // A buffering player must keep loading until its native ready notification.
                if (!(data.state === 'Buffering' && this.isLocallyBuffering)) {
                    seek(forceSeek || delayMs > 0);
                    if (data.state === "Playing") this.player.play();
                    else this.player.pause();
                }
                if (data.reportBufferingReady && typeof sendBufferingCompleted === 'function') {
                    data.reportBufferingReady = false;
                    sendBufferingCompleted(data.bufferingVideoRevision);
                }
                this.unlockTimer = setTimeout(() => {
                    this.isProcessingRemoteEvent = false;
                    this.unlockTimer = null;
                    if (this.latestPlaybackEvent?.state === 'Playing' && this.player.getPlayerState?.() === 3)
                        this.reportLocalBuffering();
                }, data.state === "Playing" ? 500 : 400);
            };
            if (delayMs > 0) {
                seek(forceSeek);
                this.player.pause();
                this.scheduledPlayTimer = setTimeout(apply, delayMs);
            } else {
                apply();
            }
        };
        if (typeof this.player.whenVideoReady === 'function') this.cancelVideoReady = this.player.whenVideoReady(ready);
        else ready();
    }

    handlePlayerStateNotification(domainState) {
        // Native seek/load notifications may arrive after pauseVideo was sent.
        if (domainState === PlaybackState.Playing &&
            (this.latestPlaybackEvent?.state === 'Paused' || this.scheduledPlayTimer !== null)) {
            this.player.pause();
            return;
        }
        if (domainState === PlaybackState.Buffering && this.latestPlaybackEvent?.state === 'Paused') return;
        if (this.isLocallyBuffering && (domainState === PlaybackState.Playing || domainState === PlaybackState.Paused)) {
            this.isLocallyBuffering = false;
            const generation = this.bufferingGeneration;
            const revision = this.serverVideoRevision;
            if (domainState === PlaybackState.Playing && this.latestPlaybackEvent?.state === 'Buffering') this.player.pause();
            const complete = accepted => {
                if (accepted !== false && generation === this.bufferingGeneration && currentRoomId &&
                    typeof sendBufferingCompleted === 'function') sendBufferingCompleted(revision);
            };
            if (this.bufferingReport?.then) this.bufferingReport.then(complete);
            else complete(true);
            return;
        }
        if (this.isProcessingRemoteEvent) return;

        if (domainState === PlaybackState.Buffering) this.reportLocalBuffering();
    }

    reportLocalBuffering() {
        if (this.isLocallyBuffering || !currentRoomId) return;
        this.isLocallyBuffering = true;
        this.bufferingGeneration++;
        const report = this.sendUpdate(PlaybackState.Buffering);
        this.bufferingReport = report?.then ? report.catch(() => false) : null;
    }

    handleRemoteVideoChange(videoId, startSeconds = 0, serverVideoRevision = null) {
        if (Number.isFinite(serverVideoRevision) && serverVideoRevision < this.serverVideoRevision) return;
        if (Number.isFinite(serverVideoRevision)) this.serverVideoRevision = serverVideoRevision;
        this.isLocallyBuffering = false;
        this.bufferingGeneration++;
        this.bufferingReport = null;
        this.clearTimers();
        this.currentVideoId = videoId;
        this.videoRevision++;
        this.pendingPlayback = null;
        if (!this.player) {
            this.pendingVideoChange = { videoId, startSeconds };
            return;
        }
        this.isProcessingRemoteEvent = true;

        this.player.cueVideo(videoId, startSeconds);

        this.unlockTimer = setTimeout(() => {
            this.isProcessingRemoteEvent = false;
            this.unlockTimer = null;
        }, 1500);
    }
}
window.SyncStateMachine = SyncStateMachine;
