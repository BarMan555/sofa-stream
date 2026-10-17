import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function setup({ ready = true } = {}) {
  let now = 5000;
  const actions = [];
  const timers = new Map();
  let timerId = 0;
  let position = 0;
  let state = 2;
  const handlers = new Map();
  const connection = { on: (name, callback) => handlers.set(name, callback), async stop() {} };
  class HubConnectionBuilder {
    withUrl() { return this; }
    withAutomaticReconnect() { return this; }
    build() { return connection; }
  }
  const context = {
    console: { log() {}, error() {} }, API_BASE_URL: 'http://local', currentRoomId: 'room', globalUserId: 'guest',
    PlaybackState: { Paused: 0, Playing: 1, Buffering: 2 }, signalR: { HubConnectionBuilder },
    activeParticipants: new Set(), document: { getElementById: () => null },
    getExactServerTimeNow: () => now,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    updateParticipantUi() {}, switchView() {}, applyRoomTheme() {}, hidePlayerBlock() {},
    stopVideoChat() {}, updateHostUiVisibility() {},
    async initiateConnectionsWithExistingParticipants() {},
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['sync.js', 'api.js'])
    vm.runInContext(readFileSync(new URL(`../../Frontend/js/${file}`, import.meta.url), 'utf8'), context);
  const player = {
    currentVideoId: null, getCurrentTime: () => position, getDuration: () => 120, getPlayerState: () => state,
    cueVideo(id, seconds) { this.currentVideoId = id; position = seconds; state = 5; actions.push('cue'); },
    seekTo(seconds) { position = seconds; actions.push('seek'); },
    play() { state = 1; actions.push('play'); }, pause() { state = 2; actions.push('pause'); },
  };
  const machine = new context.SyncStateMachine(() => { throw new Error('Snapshot must not issue host commands.'); });
  context.syncMachine = machine;
  context.videoPlayer = player;
  if (ready) machine.setPlayer(player);
  const snapshot = (overrides = {}) => ({
    name: 'Late join', playbackState: 'Playing', currentPositionSeconds: 42,
    snapshotAt: new Date(2000).toISOString(), lastUpdatedAt: new Date(1000).toISOString(), scheduledFor: null,
    currentVideo: { url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', durationSeconds: 120 }, participants: [],
    ...overrides,
  });
  async function fetchSnapshot(value = snapshot()) {
    context.fetch = async () => ({ ok: true, json: async () => value });
    await context.fetchAndSyncCurrentState('room');
  }
  function fireTimer(delay) {
    const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, `Missing timer for ${delay}ms`);
    timers.delete(entry[0]);
    entry[1].callback();
  }
  return { context, machine, player, actions, timers, snapshot, fetchSnapshot, fireTimer, setNow: value => { now = value; }, get position() { return position; }, get state() { return state; } };
}

test('joining Playing applies playback and compensates snapshot delivery time', async () => {
  const env = setup();
  await env.fetchSnapshot();
  assert.equal(env.state, 1);
  assert.equal(env.position, 45);
});

for (const playbackState of ['Paused', 'Buffering']) {
  test(`joining ${playbackState} seeks exactly and stays paused`, async () => {
    const env = setup();
    await env.fetchSnapshot(env.snapshot({ playbackState, currentPositionSeconds: 0.75 }));
    assert.equal(env.position, 0.75);
    assert.equal(env.state, 2);
  });
}

test('a snapshot waits for player readiness and accounts for time spent waiting', async () => {
  const env = setup({ ready: false });
  await env.fetchSnapshot();
  assert.deepEqual(env.actions, []);
  env.setNow(8000);
  env.machine.setPlayer(env.player);
  assert.equal(env.state, 1);
  assert.equal(env.position, 48);
});

test('a future scheduled start waits and a delayed timer catches up before playing', async () => {
  const env = setup();
  await env.fetchSnapshot(env.snapshot({ scheduledFor: new Date(6000).toISOString() }));
  assert.equal(env.state, 2);
  assert.equal(env.position, 42);
  env.setNow(6500);
  env.fireTimer(1000);
  assert.equal(env.state, 1);
  assert.equal(env.position, 42.5);
});

test('a newer pause received during snapshot loading wins while the snapshot supplies the video', async () => {
  const env = setup();
  env.machine.handleRemoteEvent({ state: 'Paused', positionInSeconds: 99, triggeredAt: new Date(4000).toISOString(), scheduledFor: null });
  await env.fetchSnapshot();
  assert.equal(env.player.currentVideoId, 'M7lc1UVf-VE');
  assert.equal(env.state, 2);
  assert.equal(env.position, 99);
});

test('the newest queued playback event is applied when the player becomes ready', async () => {
  const env = setup({ ready: false });
  await env.fetchSnapshot();
  env.machine.handleRemoteEvent({ state: 'Paused', positionInSeconds: 99, triggeredAt: new Date(4000).toISOString() });
  env.machine.setPlayer(env.player);
  assert.equal(env.player.currentVideoId, 'M7lc1UVf-VE');
  assert.equal(env.state, 2);
  assert.equal(env.position, 99);
});

test('leaving before readiness discards queued playback', async () => {
  const env = setup({ ready: false });
  await env.fetchSnapshot();
  await env.context.leaveRoom();
  env.machine.setPlayer(env.player);
  assert.equal(env.actions.includes('play'), false);
  assert.equal(env.actions.includes('cue'), false);
  assert.equal(env.timers.size, 0);
});

test('leaving cancels a scheduled start', async () => {
  const env = setup();
  await env.fetchSnapshot(env.snapshot({ scheduledFor: new Date(6000).toISOString() }));
  await env.context.leaveRoom();
  assert.equal(env.timers.size, 0);
  assert.equal(env.state, 2);
});

test('an HTTP response arriving after leave cannot restore the old room', async () => {
  const env = setup();
  let respond;
  env.context.fetch = () => new Promise(resolve => { respond = resolve; });
  const loading = env.context.fetchAndSyncCurrentState('room');
  await env.context.leaveRoom();
  respond({ ok: true, json: async () => env.snapshot() });
  await loading;
  assert.equal(env.player.currentVideoId, null);
  assert.equal(env.actions.includes('play'), false);
});

test('an old snapshot cannot replace a video changed during its HTTP request', async () => {
  const env = setup();
  let respond;
  env.context.fetch = () => new Promise(resolve => { respond = resolve; });
  const loading = env.context.fetchAndSyncCurrentState('room');
  env.machine.handleRemoteVideoChange('new-video', 0);
  env.machine.handleRemoteEvent({ state: 'Paused', positionInSeconds: 0, triggeredAt: new Date(4000).toISOString() });
  respond({ ok: true, json: async () => env.snapshot() });
  await loading;
  assert.equal(env.player.currentVideoId, 'new-video');
  assert.equal(env.state, 2);
  assert.equal(env.position, 0);
});
