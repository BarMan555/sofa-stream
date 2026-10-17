// A controlled Iframe API implementation for room-flow tests. No external video is fetched.
(() => {
  const states = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  class Player {
    constructor(id, options) {
      this.options = options;
      this.state = states.UNSTARTED;
      this.position = 0;
      this.startedAt = Date.now();
      this.iframe = document.createElement('iframe');
      this.iframe.id = id;
      this.iframe.title = 'Controlled video player';
      document.getElementById(id).replaceWith(this.iframe);
      if (window.HARNESS_HOLD_PLAYER_READY) window.HARNESS_RELEASE_PLAYER_READY = () => options.events.onReady();
      else setTimeout(() => options.events.onReady(), 0);
    }
    getIframe() { return this.iframe; }
    getDuration() { return 7200; }
    getPlayerState() { return this.state; }
    getCurrentTime() {
      return this.position + (this.state === states.PLAYING ? (Date.now() - this.startedAt) / 1000 : 0);
    }
    setState(state) {
      this.position = this.getCurrentTime();
      this.startedAt = Date.now();
      this.state = state;
      this.options.events.onStateChange({ data: state });
    }
    cueVideoById(id, seconds = 0) {
      this.position = seconds;
      this.startedAt = Date.now();
      this.videoReady = false;
      this.setState(states.UNSTARTED);
      const ready = () => { this.videoReady = true; this.setState(states.CUED); };
      if (window.HARNESS_HOLD_VIDEO_READY) window.HARNESS_RELEASE_VIDEO_READY = ready;
      else setTimeout(ready, 0);
    }
    playVideo() {
      if (!this.videoReady) throw new Error('The video is not cued yet.');
      const revision = this.playRevision = (this.playRevision || 0) + 1;
      if (window.HARNESS_BUFFER_ON_PLAY) {
        this.setState(states.BUFFERING);
        setTimeout(() => { if (this.playRevision === revision) this.setState(states.PLAYING); }, 100);
      } else this.setState(states.PLAYING);
    }
    pauseVideo() { this.playRevision = (this.playRevision || 0) + 1; this.setState(states.PAUSED); }
    seekTo(seconds) {
      if (!this.videoReady) throw new Error('The video is not cued yet.');
      this.position = seconds; this.startedAt = Date.now();
    }
    setVolume(volume) { this.volume = volume; }
  }
  window.YT = { PlayerState: states, Player };
  const ready = () => setTimeout(() => {
    window.onYouTubeIframeAPIReady?.();
  }, 0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
