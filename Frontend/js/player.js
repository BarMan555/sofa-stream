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
                    if (this.ytPlayer && typeof this.ytPlayer.getIframe === 'function') {
                        const ytIframe = this.ytPlayer.getIframe();
                        if (ytIframe) {
                            ytIframe.setAttribute("sandbox", "allow-scripts allow-forms allow-presentation allow-popups");
                        }
                    }
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

    setVolume(volume) {
        if (this.currentType === 'youtube') {
            if (this.ytPlayer && typeof this.ytPlayer.setVolume === 'function') {
                this.ytPlayer.setVolume(volume);
            }
        } else if (this.currentType === 'rutube') {
            this.sendRutubeCommand('setVolume', { volume: volume / 100 });
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
        this.currentType = type;
        this.currentVideoId = videoId;
        
        const ytEl = document.getElementById(this.ytContainerId);
        const rtEl = document.getElementById(this.rtIframeId);
        
        if (type === 'youtube') {
            if (window.youtubeBlocked) {
                if (ytEl) ytEl.style.display = 'none';
                if (rtEl) {
                    rtEl.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-presentation allow-popups");
                    rtEl.style.display = 'block';
                    rtEl.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&enablejsapi=0`;
                }
                showPlayerBlock();
                return;
            }
            if (rtEl) {
                rtEl.style.display = 'none';
                rtEl.src = 'about:blank';
            }
            if (ytEl) ytEl.style.display = 'block';
            
            if (this.ytPlayer && this.ytPlayer.cueVideoById) {
                this.ytPlayer.cueVideoById(videoId, startSeconds);
            }
            showPlayerBlock();
        } else if (type === 'rutube') {
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
window.UniversalPlayer = UniversalPlayer;

// YouTube API loading with fallback mechanism
window.youtubeBlocked = false;

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
    let timeoutTriggered = false;

    window.onYouTubeIframeAPIReady = function() {
        if (timeoutTriggered) {
            console.warn("YouTube API loaded but after 4s timeout.");
            return;
        }
        apiLoaded = true;
        window.youtubeBlocked = false;
        if (typeof window.initPlayerAfterAPIReady === "function") {
            window.initPlayerAfterAPIReady();
        }
    };

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            if (!apiLoaded) {
                timeoutTriggered = true;
                reject(new Error("YouTube API ERR_TIMED_OUT (4s limit reached)"));
            }
        }, 4000);
    });

    const scriptLoadPromise = new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        tag.onload = () => resolve();
        tag.onerror = (err) => reject(err || new Error("YouTube API script failed to load"));

        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
            document.head.appendChild(tag);
        }
    });

    Promise.race([scriptLoadPromise, timeoutPromise])
        .catch((err) => {
            window.youtubeBlocked = true;
            console.warn("YouTube API blocked or timed out. Falling back to alternative methods.", err.message);
            
            if (typeof window.YT === "undefined") {
                window.YT = {};
            }
            if (!window.YT.PlayerState) {
                window.YT.PlayerState = {
                    UNSTARTED: -1,
                    ENDED: 0,
                    PLAYING: 1,
                    PAUSED: 2,
                    BUFFERING: 3,
                    CUED: 5
                };
            }
            if (!window.YT.Player) {
                window.YT.Player = class StubPlayer {
                    constructor(ytContainerId, config) {
                        this.ytContainerId = ytContainerId;
                        this.config = config;
                        console.warn(`Stub YouTube Player created for element: ${ytContainerId}`);
                        if (config && config.events && typeof config.events.onReady === "function") {
                            setTimeout(() => {
                                try { config.events.onReady(); } catch (e) {}
                            }, 50);
                        }
                    }
                    cueVideoById(videoId, startSeconds = 0) {}
                    playVideo() {}
                    pauseVideo() {}
                    seekTo(seconds, allowSeekAhead) {}
                    setVolume(volume) {}
                    getCurrentTime() { return 0; }
                    getDuration() { return 0; }
                    getPlayerState() { return -1; }
                };
            }

            if (typeof window.initPlayerAfterAPIReady === "function") {
                window.initPlayerAfterAPIReady();
            }
        });
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
