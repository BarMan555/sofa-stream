import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function setup({ savedVolume } = {}) {
  const contexts = [];
  const intervals = new Map();
  const volumes = [];
  const elements = new Map();
  let nextTimer = 0;
  let volume = 100;
  const storage = new Map(savedVolume === undefined ? [] : [['sofastream.volume', String(savedVolume)]]);
  function element(id) {
    const classes = new Set();
    const node = {
      style: {}, value: '', textContent: '', hidden: true, appendChild() {},
      addEventListener() {},
      classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
    };
    elements.set(id, node);
    return node;
  }
  for (const id of ['slot-local', 'videoChatOverlay', 'videoChatRestoreBtn', 'theaterContainer']) element(id);
  for (const id of ['customVolumeSlider', 'customVolumeValue', 'duckingStatus']) element(id);

  class FakeAudioContext {
    constructor() { this.state = 'running'; this.sources = []; this.analysers = []; this.closeCalls = 0; contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; this.closeCalls++; return Promise.resolve(); }
    createMediaStreamSource(stream) {
      const source = {
        disconnectCalls: 0,
        connect(analyser) { analyser.stream = stream; },
        disconnect() { this.disconnectCalls++; },
      };
      this.sources.push(source);
      return source;
    }
    createAnalyser() {
      const analyser = {
        disconnectCalls: 0,
        getFloatTimeDomainData(data) { data.fill(this.stream.level); },
        disconnect() { this.disconnectCalls++; },
      };
      this.analysers.push(analyser);
      return analyser;
    }
  }
  const context = {
    console: { log() {}, error() {}, warn() {} }, AudioContext: FakeAudioContext,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    document: { getElementById: id => elements.get(id) || null },
    setInterval(callback) { const id = ++nextTimer; intervals.set(id, callback); return id; },
    clearInterval: id => intervals.delete(id),
    videoPlayer: { setVolume(value) { volume = value; volumes.push(value); } },
  };
  context.window = context;
  vm.createContext(context);
  // Exercise the production ducking module and its real video-chat teardown caller.
  for (const file of ['audio-ducking.js', 'webrtc.js'])
    vm.runInContext(readFileSync(new URL(`../../Frontend/js/${file}`, import.meta.url), 'utf8'), context);
  function stream(level = 0) {
    const track = { stopped: false, stop() { this.stopped = true; } };
    return { level, track, getAudioTracks: () => [track], getTracks: () => [track] };
  }
  function tick(count = 1) {
    for (let index = 0; index < count; index++) for (const callback of [...intervals.values()]) callback();
  }
  return { context, contexts, intervals, volumes, elements, storage, element, stream, tick, get volume() { return volume; } };
}

test('speech smoothly lowers movie volume to 30 without overshooting', () => {
  const env = setup();
  env.context.registerAudioAnalyser('local', env.stream(0.1));
  env.context.startDuckingLoop();
  env.tick();
  assert.ok(env.volume < 100 && env.volume > 30, 'The first speech sample must lower volume gradually.');
  env.tick(100);
  assert.equal(env.volume, 30);
  assert.ok(env.volumes.every((value, index) => value >= 30 && value <= 100 && (!index || value <= env.volumes[index - 1])));
  assert.ok(env.elements.get('slot-local').classList.contains('active-speaker'));
});

test('silence after speech smoothly restores movie volume to 100', () => {
  const env = setup();
  const microphone = env.stream(0.1);
  env.context.registerAudioAnalyser('local', microphone);
  env.context.startDuckingLoop();
  env.tick(100);
  assert.equal(env.volume, 30);
  microphone.level = 0;
  env.tick();
  assert.ok(env.volume > 30 && env.volume < 100);
  env.tick(100);
  assert.equal(env.volume, 100);
  assert.equal(env.elements.get('slot-local').classList.contains('active-speaker'), false);
});

test('movie stays quiet while any remaining participant is speaking', () => {
  const env = setup();
  env.element('slot-guest');
  env.context.registerAudioAnalyser('local', env.stream(0.1));
  const guest = env.stream(0.1);
  env.context.registerAudioAnalyser('GUEST', guest);
  env.context.startDuckingLoop();
  env.tick(100);
  assert.equal(env.volume, 30);
  env.context.unregisterAudioAnalyser('LOCAL');
  env.tick(100);
  assert.equal(env.volume, 30);
  guest.level = 0;
  env.tick(100);
  assert.equal(env.volume, 100);
});

test('replacing and removing a participant disconnects their audio nodes without stopping their media', () => {
  const env = setup();
  const oldStream = env.stream(0.1);
  env.context.registerAudioAnalyser('LOCAL', oldStream);
  const audio = env.contexts[0];
  env.context.registerAudioAnalyser('local', env.stream());
  assert.equal(audio.sources[0].disconnectCalls, 1);
  assert.equal(audio.analysers[0].disconnectCalls, 1);
  assert.equal(oldStream.track.stopped, false, 'WebRTC owns the media tracks.');
  env.context.unregisterAudioAnalyser('LOCAL');
  env.context.unregisterAudioAnalyser('local');
  assert.equal(audio.sources[1].disconnectCalls, 1);
  assert.equal(audio.analysers[1].disconnectCalls, 1);
});

test('leaving video chat restores normal volume and stops further volume changes', () => {
  const env = setup();
  env.context.registerAudioAnalyser('local', env.stream(0.1));
  env.context.startDuckingLoop();
  env.tick(100);
  assert.equal(env.volume, 30);
  env.context.stopVideoChat();
  assert.equal(env.volume, 100);
  assert.equal(env.intervals.size, 0);
  const changes = env.volumes.length;
  env.tick(100);
  assert.equal(env.volumes.length, changes);
});

test('video chat teardown closes its context, disconnects nodes and clears speaker indicators', () => {
  const env = setup();
  const slot = env.element('slot-guest');
  env.context.registerAudioAnalyser('guest', env.stream(0.1));
  env.context.startDuckingLoop();
  env.tick();
  assert.ok(slot.classList.contains('active-speaker'));
  const audio = env.contexts[0];
  env.context.stopVideoChat();
  env.context.stopVideoChat();
  assert.equal(audio.sources[0].disconnectCalls, 1);
  assert.equal(audio.analysers[0].disconnectCalls, 1);
  assert.equal(audio.closeCalls, 1);
  assert.equal(audio.state, 'closed');
  assert.equal(slot.classList.contains('active-speaker'), false);
});

test('a later video chat session uses a fresh audio context and can duck again', () => {
  const env = setup();
  env.context.registerAudioAnalyser('local', env.stream(0.1));
  env.context.startDuckingLoop();
  env.context.stopVideoChat();
  env.context.registerAudioAnalyser('local', env.stream(0.1));
  env.context.startDuckingLoop();
  assert.equal(env.contexts.length, 2);
  assert.equal(env.contexts[0].state, 'closed');
  env.tick(100);
  assert.equal(env.volume, 30);
});

test('missing audio tracks stay silent and starting twice creates only one loop', () => {
  const env = setup();
  env.context.registerAudioAnalyser('local', null);
  env.context.registerAudioAnalyser('guest', { getAudioTracks: () => [] });
  env.context.startDuckingLoop();
  env.context.startDuckingLoop();
  assert.equal(env.intervals.size, 1);
  env.tick(100);
  assert.equal(env.volume, 100);
  assert.equal(env.contexts.length, 0);
  env.context.stopVideoChat();
  assert.equal(env.intervals.size, 0);
});

test('speech uses 30 percent of the chosen level and silence restores that level', () => {
  const env = setup();
  const microphone = env.stream(0.1);
  env.context.setMovieVolume(60);
  assert.equal(env.volume, 60);
  env.context.registerAudioAnalyser('local', microphone);
  env.context.startDuckingLoop();
  env.tick(100);
  assert.equal(env.volume, 18);
  assert.equal(env.elements.get('customVolumeSlider').value, '60');
  assert.match(env.elements.get('duckingStatus').textContent, /18%/);
  assert.equal(env.elements.get('duckingStatus').hidden, false);
  microphone.level = 0;
  env.tick(100);
  assert.equal(env.volume, 60);
  assert.equal(env.elements.get('duckingStatus').hidden, true);
});

test('changing volume during speech applies the new level and teardown preserves it', () => {
  const env = setup();
  env.context.registerAudioAnalyser('local', env.stream(0.1));
  env.context.startDuckingLoop();
  env.tick(100);
  env.context.setMovieVolume(40);
  assert.equal(env.volume, 12);
  env.context.stopVideoChat();
  assert.equal(env.volume, 40);
  assert.equal(env.storage.get('sofastream.volume'), '40');
});

test('zero stays silent through speech, recovery and a later page load', () => {
  const env = setup();
  env.context.setMovieVolume(0);
  const microphone = env.stream(0.1);
  env.context.registerAudioAnalyser('local', microphone);
  env.context.startDuckingLoop();
  env.tick(100);
  assert.equal(env.volume, 0);
  microphone.level = 0;
  env.tick(100);
  env.context.stopDuckingLoop();
  assert.equal(env.volume, 0);
  const restored = setup({ savedVolume: env.storage.get('sofastream.volume') });
  restored.context.setupMovieVolumeControls();
  assert.equal(restored.volume, 0);
  assert.equal(restored.elements.get('customVolumeSlider').value, '0');
});

test('saved preferences are restored, invalid values are ignored and storage may be unavailable', () => {
  const env = setup({ savedVolume: 65 });
  env.context.setupMovieVolumeControls();
  assert.equal(env.volume, 65);
  env.context.setMovieVolume(NaN);
  assert.equal(env.volume, 65);
  env.context.localStorage.setItem = () => { throw new Error('Storage blocked'); };
  env.context.setMovieVolume(150);
  assert.equal(env.volume, 100);
  env.context.setMovieVolume(-5);
  assert.equal(env.volume, 0);
  const invalid = setup({ savedVolume: 'invalid' });
  invalid.context.setupMovieVolumeControls();
  assert.equal(invalid.volume, 100);
});
