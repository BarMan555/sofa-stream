import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function setup() {
  const timers = new Map();
  const scripts = [];
  const players = [];
  const elements = new Map(['youtubePlayer', 'rutubePlayer', 'playerStatus'].map(id => [id, {
    style: {}, hidden: true, src: '', setAttribute() {}, contentWindow: { postMessage() {} },
  }]));
  let timerId = 0;
  const context = {
    console: { log() {}, warn() {} }, location: { origin: 'http://local' },
    addEventListener() {}, showPlayerBlock() {},
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    document: {
      getElementById: id => elements.get(id), createElement: () => ({}), getElementsByTagName: () => [],
      head: { appendChild: script => scripts.push(script) },
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../../Frontend/js/player.js', import.meta.url), 'utf8'), context);
  context.initPlayerAfterAPIReady = () => {
    if (!context.videoPlayer)
      context.videoPlayer = new context.UniversalPlayer('youtubePlayer', 'rutubePlayer', () => {}, () => {});
  };
  function fireTimers(delay) {
    for (const [id, timer] of [...timers]) {
      if (timer.delay !== delay) continue;
      timers.delete(id);
      timer.callback();
    }
  }
  function loadApi() {
    class Player {
      constructor(id, options) { this.options = options; this.cues = []; players.push(this); }
      cueVideoById(id, seconds) { this.cues.push({ id, seconds }); }
      getIframe() { return elements.get('youtubePlayer'); }
      getVideoUrl() { return `https://www.youtube.com/watch?v=${this.cues.at(-1)?.id}`; }
      ready() { this.options.events.onReady(); }
      cued() { this.options.events.onStateChange({ data: 5 }); }
    }
    context.YT.Player = Player;
    context.onYouTubeIframeAPIReady();
  }
  return { context, elements, scripts, players, fireTimers, loadApi };
}

test('a slow YouTube API never creates an independently playing embed', async () => {
  const env = setup();
  env.fireTimers(4000);
  await new Promise(resolve => setImmediate(resolve));
  env.fireTimers(50);
  env.context.videoPlayer.cueVideo('M7lc1UVf-VE');
  const iframe = env.elements.get('rutubePlayer');
  assert.ok(!iframe.src.includes('/embed/'), 'A room must wait for the controllable player instead of an independent embed.');
  assert.equal(env.context.videoPlayer.videoReady, false);
  assert.equal(env.elements.get('playerStatus').hidden, false);
});

test('the API arriving after the timeout loads the latest requested video into the same adapter', async () => {
  const env = setup();
  env.fireTimers(4000);
  await new Promise(resolve => setImmediate(resolve));
  env.fireTimers(50);
  const adapter = env.context.videoPlayer;
  adapter.cueVideo('M7lc1UVf-VE');
  adapter.cueVideo('Y2VF8tmLFHw', 42);
  let ready = false;
  adapter.whenVideoReady(() => { ready = true; });
  env.loadApi();
  assert.equal(env.players.length, 1, 'A late API must still initialize a real player.');
  assert.equal(env.context.videoPlayer, adapter);
  assert.equal(ready, false);
  env.players[0].ready();
  assert.deepEqual(env.players[0].cues, [{ id: 'Y2VF8tmLFHw', seconds: 42 }]);
  env.players[0].cued();
  assert.equal(ready, true);
  assert.equal(env.elements.get('playerStatus').hidden, true);
  env.context.onYouTubeIframeAPIReady();
  assert.equal(env.players.length, 1, 'Repeated ready notifications must not recreate the player.');
});

test('a failed API shows an unavailable player while RuTube remains usable', async () => {
  const env = setup();
  env.scripts[0].onerror(new Error('API blocked'));
  await new Promise(resolve => setImmediate(resolve));
  env.fireTimers(50);
  env.context.videoPlayer.cueVideo('M7lc1UVf-VE');
  assert.ok(!env.elements.get('rutubePlayer').src.includes('youtube.com/embed/'));
  assert.match(env.elements.get('playerStatus').textContent, /reload/i);
  env.context.videoPlayer.cueVideo('7716bd3e665725c3c008ae7ab4ff02e2');
  assert.match(env.elements.get('rutubePlayer').src, /rutube.ru\/play\/embed\//);
  assert.equal(env.elements.get('playerStatus').hidden, true);
});
