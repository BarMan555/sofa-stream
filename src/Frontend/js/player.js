// --- Universal Player Adapter & Video Utilities ---
const PlaybackState = {
    Paused: 0,
    Playing: 1,
    Buffering: 2
};
window.PlaybackState = PlaybackState;

class UniversalPlayer {
    constructor(ytContainerId, rtIframeId, onStateChangeCallback, onPlayerReadyCallback) {
        this.ytContainerId = ytContainerId;
        this.rtIframeId = rtIframeId;
        this.onStateChangeCallback = onStateChangeCallback;
        this.onPlayerReadyCallback = onPlayerReadyCallback;
        
        this.currentType = null; // 'youtube' | 'rutube' | null
        this.currentVideoId = null;
        this.startSeconds = 0;
        this.videoReady = false;
        this.videoReadyCallbacks = new Set();
        this.ytPlayer = null;
        this.youtubeReady = false;
        this.volume = 100;
        
        this.rutubeDuration = 0;
        this.rutubeCurrentTime = 0;
        this.rutubeState = PlaybackState.Paused;

        this.initializeYoutubePlayer();
        // The room and RuTube remain available while the YouTube API is loading.
        if (!this.ytPlayer) setTimeout(() => this.onPlayerReadyCallback(), 0);

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

    initializeYoutubePlayer() {
        if (this.ytPlayer || window.youtubeBlocked || typeof window.YT?.Player !== 'function') return;
        this.ytPlayer = new YT.Player(this.ytContainerId, {
            height: '390',
            width: '640',
            videoId: '',
            playerVars: {
                'autoplay': 0,
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
                    if (event.data === YT.PlayerState.CUED &&
                        (typeof this.ytPlayer.getVideoUrl !== 'function' || this.ytPlayer.getVideoUrl().includes(this.currentVideoId))) {
                        this.markVideoReady();
                    }
                    let domainState = null;
                    if (event.data === YT.PlayerState.PLAYING) domainState = PlaybackState.Playing;
                    else if (event.data === YT.PlayerState.PAUSED) domainState = PlaybackState.Paused;
                    else if (event.data === YT.PlayerState.BUFFERING) domainState = PlaybackState.Buffering;

                    if (domainState !== null) {
                        this.onStateChangeCallback(domainState);
                    }
                },
                'onReady': () => {
                    this.youtubeReady = true;
                    console.log("YouTube Player is fully READY.");
                    if (this.ytPlayer && typeof this.ytPlayer.getIframe === 'function') {
                        const ytIframe = this.ytPlayer.getIframe();
                        if (ytIframe) {
                            ytIframe.setAttribute("sandbox", "allow-scripts allow-forms allow-presentation allow-popups");
                        }
                    }
                    if (this.currentType === 'youtube') this.cueYoutubeVideo();
                    this.onPlayerReadyCallback();
                }
            }
        });
        
    }

    showPlayerStatus(message = '') {
        const status = document.getElementById('playerStatus');
        if (!status) return;
        status.textContent = message;
        status.hidden = !message;
    }

    refreshYoutubeStatus() {
        if (this.currentType !== 'youtube' || this.youtubeReady) return;
        this.showPlayerStatus(window.youtubeApiFailed
            ? 'Unable to load YouTube. Reload the page to try again.'
            : 'YouTube is still loading. Please wait.');
    }

    cueYoutubeVideo() {
        if (!this.youtubeReady) {
            this.refreshYoutubeStatus();
            return;
        }
        this.showPlayerStatus();
        const element = document.getElementById(this.ytContainerId);
        if (element) element.style.display = 'block';
        this.ytPlayer.cueVideoById(this.currentVideoId, this.startSeconds);
    }

    get player() {
        return this;
    }

    whenVideoReady(callback) {
        if (this.videoReady) {
            callback();
            return null;
        }
        this.videoReadyCallbacks.add(callback);
        return () => this.videoReadyCallbacks.delete(callback);
    }

    markVideoReady() {
        this.videoReady = true;
        this.setVolume(this.volume);
        const callbacks = [...this.videoReadyCallbacks];
        this.videoReadyCallbacks.clear();
        callbacks.forEach(callback => callback());
    }

    handleRutubeMessage(message) {
        if (message.type === 'player:ready') {
            if (message.data?.videoId && message.data.videoId !== this.currentVideoId) return;
            this.markVideoReady();
        } else if (message.type === 'player:currentTime') {
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

    setVolume(volume) {
        const level = Number(volume);
        if (!Number.isFinite(level)) return;
        this.volume = Math.max(0, Math.min(100, level));
        if (!this.videoReady) return;
        if (this.currentType === 'youtube') {
            if (this.ytPlayer && typeof this.ytPlayer.setVolume === 'function') {
                this.ytPlayer.setVolume(this.volume);
            }
        } else if (this.currentType === 'rutube') {
            this.sendRutubeCommand('setVolume', { volume: this.volume / 100 });
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
            if (this.rutubeState === PlaybackState.Playing) return 1;
            if (this.rutubeState === PlaybackState.Paused) return 2;
            return -1;
        }
        return -1;
    }

    loadVideo(videoId, startSeconds = 0) {
        this.cueVideo(videoId, startSeconds);
    }

    switchToType(type, videoId, startSeconds = 0) {
        this.videoReady = false;
        this.videoReadyCallbacks.clear();
        this.currentType = type;
        this.currentVideoId = videoId;
        this.startSeconds = startSeconds;
        
        const ytEl = document.getElementById(this.ytContainerId);
        const rtEl = document.getElementById(this.rtIframeId);
        
        if (type === 'youtube') {
            if (rtEl) {
                rtEl.style.display = 'none';
                rtEl.src = 'about:blank';
            }
            if (ytEl) ytEl.style.display = this.youtubeReady ? 'block' : 'none';
            this.cueYoutubeVideo();
            showPlayerBlock();
        } else if (type === 'rutube') {
            this.showPlayerStatus();
            if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
                try {
                    this.ytPlayer.pauseVideo();
                } catch (e) {
                    console.warn("Could not pause YouTube player", e);
                }
            }
            if (ytEl) ytEl.style.display = 'none';
            if (rtEl) {
                rtEl.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-presentation allow-popups");
                rtEl.style.display = 'block';
                rtEl.src = `https://rutube.ru/play/embed/${videoId}?rtBorders=0&rtButtons=0&rtLogo=0&skinColor=ff4500`;
            }
            this.rutubeDuration = 0;
            this.rutubeCurrentTime = startSeconds;
            this.rutubeState = PlaybackState.Paused;
            
            this.whenVideoReady(() => this.seekTo(startSeconds));

            showPlayerBlock();
        }
    }

    cueVideo(videoId, startSeconds = 0) {
        const detectedType = (videoId.length === 32) ? 'rutube' : 'youtube';
        this.switchToType(detectedType, videoId, startSeconds);
    }
}
window.UniversalPlayer = UniversalPlayer;

// YouTube loading can be slow; only the real API may control room playback.
window.youtubeBlocked = false;
window.youtubeApiFailed = false;

(function loadYouTubeWithTimeout() {
    if (typeof window.YT === "undefined") {
        window.YT = {
            PlayerState: {
                UNSTARTED: -1,
                ENDED: 0,
                PLAYING: 1,
                PAUSED: 2,
                BUFFERING: 3,
                CUED: 5
            }
        };
    }

    let apiLoaded = false;
    const loadingTimer = setTimeout(() => {
        if (apiLoaded) return;
        window.youtubeBlocked = true;
        window.initPlayerAfterAPIReady?.();
        window.videoPlayer?.refreshYoutubeStatus();
        console.warn('YouTube API is taking longer than expected; waiting for the controllable player.');
    }, 4000);

    window.onYouTubeIframeAPIReady = function() {
        if (apiLoaded) return;
        apiLoaded = true;
        clearTimeout(loadingTimer);
        window.youtubeBlocked = false;
        window.youtubeApiFailed = false;
        if (window.videoPlayer) window.videoPlayer.initializeYoutubePlayer();
        else window.initPlayerAfterAPIReady?.();
    };

    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = () => {
        if (apiLoaded) return;
        clearTimeout(loadingTimer);
        window.youtubeBlocked = true;
        window.youtubeApiFailed = true;
        window.initPlayerAfterAPIReady?.();
        window.videoPlayer?.refreshYoutubeStatus();
        console.warn('YouTube API could not be loaded.');
    };
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag?.parentNode) firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    else document.head.appendChild(tag);
})();

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
window.formatTime = formatTime;
