import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function setup() {
  let now = 5000;
  const actions = [];
  const commands = [];
  const elements = new Map(['youtubePlayer', 'rutubePlayer'].map(id => [id, {
    style: {}, setAttribute() {}, contentWindow: { postMessage: value => commands.push(JSON.parse(value)) },
  }]));
  class YoutubePlayer {
    constructor(id, options) { this.options = options; this.position = 0; this.ready = false; this.state = -1; }
    cueVideoById(id, seconds) { this.id = id; this.position = seconds; this.ready = false; this.volume = 100; actions.push('cue'); }
    setVolume(volume) { if (this.ready) this.volume = volume; }
    getVideoUrl() { return `https://www.youtube.com/watch?v=${this.id}`; }
    getCurrentTime() { return this.position; }
    getDuration() { return 120; }
    getPlayerState() { return this.state; }
    seekTo(seconds) { assert.ok(this.ready, 'Seek must wait for the cued video.'); this.position = seconds; actions.push('seek'); }
    playVideo() { assert.ok(this.ready, 'Play must wait for the cued video.'); actions.push('play'); this.state = 1; }
    pauseVideo() { actions.push('pause'); this.state = 2; }
    emitCued() { this.ready = true; this.state = 5; this.options.events.onStateChange({ data: 5 }); }
  }
  const context = {
    console: { log() {}, warn() {} }, currentRoomId: 'room',
    location: { origin: 'http://local' },
    YT: { Player: YoutubePlayer, PlayerState: { PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } },
    addEventListener() {}, showPlayerBlock() {}, getExactServerTimeNow: () => now,
    setTimeout() { return 1; }, clearTimeout() {},
    document: { getElementById: id => elements.get(id), createElement: () => ({}), getElementsByTagName: () => [], head: { appendChild() {} } },
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['player.js', 'sync.js'])
    vm.runInContext(readFileSync(new URL(`../../Frontend/js/${file}`, import.meta.url), 'utf8'), context);
  const player = new context.UniversalPlayer('youtubePlayer', 'rutubePlayer', () => {}, () => {});
  const machine = new context.SyncStateMachine(() => { throw new Error('Initial playback must not send a command.'); });
  player.onStateChangeCallback = state => machine.handlePlayerStateNotification(state);
  machine.setPlayer(player);
  player.ytPlayer.options.events.onReady();
  const snapshot = {
    playbackState: 'Playing', currentPositionSeconds: 42, snapshotAt: new Date(2000).toISOString(),
    lastUpdatedAt: new Date(1000).toISOString(), scheduledFor: null, currentVideo: { durationSeconds: 120 },
  };
  return { player, machine, actions, commands, snapshot, setNow: value => { now = value; } };
}

test('initial playback waits for YouTube CUED and compensates the video loading delay', () => {
  const env = setup();
  env.machine.handleRoomSnapshot(env.snapshot, 'M7lc1UVf-VE');
  assert.deepEqual(env.actions, ['cue']);
  env.setNow(8000);
  env.player.ytPlayer.emitCued();
  assert.equal(env.player.getCurrentTime(), 48);
  assert.equal(env.player.getPlayerState(), 1);
});

test('a pause received while the video loads replaces pending play', () => {
  const env = setup();
  env.machine.handleRoomSnapshot(env.snapshot, 'M7lc1UVf-VE');
  env.machine.handleRemoteEvent({ state: 'Paused', positionInSeconds: 99, triggeredAt: new Date(4000).toISOString() }, true);
  env.player.ytPlayer.emitCued();
  assert.equal(env.actions.includes('play'), false);
  assert.equal(env.player.getCurrentTime(), 99);
  assert.equal(env.player.getPlayerState(), 2);
});

test('a late native start cannot override a paused room after the first video is cued', () => {
  const env = setup();
  env.machine.handleRoomSnapshot({ ...env.snapshot, playbackState: 'Paused', currentPositionSeconds: 0 }, 'M7lc1UVf-VE');
  env.player.ytPlayer.emitCued();
  env.player.ytPlayer.state = 1;
  env.player.ytPlayer.options.events.onStateChange({ data: 1 });
  assert.notEqual(env.player.getPlayerState(), 1, 'The guest must remain paused until the host starts playback.');
});

test('a paused first load does not seek a cued video that is already at the requested position', () => {
  const env = setup();
  env.machine.handleRoomSnapshot({ ...env.snapshot, playbackState: 'Paused', currentPositionSeconds: 0 }, 'M7lc1UVf-VE');
  env.player.ytPlayer.emitCued();
  assert.equal(env.actions.includes('seek'), false, 'Seeking a cued YouTube video would start playback.');
});

test('reset prevents a video that finishes loading from starting after leave', () => {
  const env = setup();
  env.machine.handleRoomSnapshot(env.snapshot, 'M7lc1UVf-VE');
  env.machine.reset();
  env.player.ytPlayer.emitCued();
  assert.equal(env.actions.includes('play'), false);
});

test('RuTube waits for readiness of the requested video before seeking and playing', () => {
  const env = setup();
  const videoId = '7716bd3e665725c3c008ae7ab4ff02e2';
  env.machine.handleRoomSnapshot(env.snapshot, videoId);
  assert.deepEqual(env.commands, []);
  env.player.handleRutubeMessage({ type: 'player:ready', data: { videoId: 'different-video' } });
  assert.deepEqual(env.commands, []);
  env.setNow(8000);
  env.player.handleRutubeMessage({ type: 'player:ready', data: { videoId } });
  assert.equal(env.commands.at(-1).type, 'player:play');
  assert.equal(env.commands.filter(command => command.type === 'player:setCurrentTime').at(-1).data.time, 48);
});

test('volume selected before video readiness is applied after cue and retained for the next video', () => {
  const env = setup();
  env.player.setVolume(60);
  env.player.cueVideo('M7lc1UVf-VE');
  env.player.ytPlayer.emitCued();
  assert.equal(env.player.ytPlayer.volume, 60);
  env.player.cueVideo('Y2VF8tmLFHw');
  env.player.ytPlayer.emitCued();
  assert.equal(env.player.ytPlayer.volume, 60);
});

test('RuTube receives the retained volume once its video becomes ready', () => {
  const env = setup();
  const id = '7716bd3e665725c3c008ae7ab4ff02e2';
  env.player.setVolume(60);
  env.player.cueVideo(id);
  env.player.handleRutubeMessage({ type: 'player:ready', data: { videoId: id } });
  const command = env.commands.filter(command => command.type === 'player:setVolume').at(-1);
  assert.equal(command?.data.volume, 0.6);
});
