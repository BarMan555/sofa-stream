import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function setup(report) {
  const updates = [];
  const actions = [];
  const timers = new Map();
  const context = {
    console: { log() {} }, currentRoomId: 'room', PlaybackState: { Paused: 0, Playing: 1, Buffering: 2 },
    getExactServerTimeNow: () => 1000, setTimeout(fn, delay) { timers.set(delay, fn); return delay; }, clearTimeout: delay => timers.delete(delay),
    sendBufferingCompleted() { updates.push('ready'); },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../../Frontend/js/sync.js', import.meta.url), 'utf8'), context);
  const machine = new context.SyncStateMachine(state => { updates.push(state); return report?.(); });
  machine.setPlayer({
    getCurrentTime: () => 60, getPlayerState: () => 3,
    play() { actions.push('play'); }, pause() { actions.push('pause'); }, seekTo() { actions.push('seek'); }, cueVideo() {},
  });
  machine.setHostStatus(false);
  return { machine, updates, actions, timers };
}

test('a guest reports its own buffering once without host control rights', () => {
  const { machine, updates } = setup();
  machine.handlePlayerStateNotification(2);
  machine.handlePlayerStateNotification(2);
  assert.deepEqual(updates, [2]);
});

test('native loading during a paused seek does not create a playback wait', () => {
  const { machine, updates } = setup();
  machine.handleRemoteEvent({ state: 'Paused', positionInSeconds: 60, triggeredAt: new Date(1000).toISOString() });
  machine.handlePlayerStateNotification(2);
  assert.equal(machine.isLocallyBuffering, false);
  assert.deepEqual(updates, []);
});

test('command-generated buffering is suppressed, but loading that outlasts command application is reported', () => {
  const { machine, updates, timers } = setup();
  machine.handleRemoteEvent({ state: 'Playing', positionInSeconds: 60, triggeredAt: new Date(1000).toISOString() });
  machine.handlePlayerStateNotification(2);
  assert.deepEqual(updates, []);
  timers.get(500)();
  assert.deepEqual(updates, [2]);
});

test('a buffering player keeps loading, then pauses locally before reporting readiness', async () => {
  let accepted;
  const { machine, updates, actions } = setup(() => new Promise(resolve => { accepted = resolve; }));
  machine.handlePlayerStateNotification(2);
  machine.handleRemoteEvent({ state: 'Buffering', positionInSeconds: 60, triggeredAt: new Date(1000).toISOString() });
  assert.deepEqual(actions, []);
  machine.handlePlayerStateNotification(1);
  assert.deepEqual(actions, ['pause']);
  assert.deepEqual(updates, [2]);
  accepted(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(updates, [2, 'ready']);
});

test('changing the video clears local buffering and discards an old readiness callback', async () => {
  let accepted;
  const { machine, updates } = setup(() => new Promise(resolve => { accepted = resolve; }));
  machine.handlePlayerStateNotification(2);
  machine.handlePlayerStateNotification(1);
  machine.handleRemoteVideoChange('next-video');
  accepted(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(machine.isLocallyBuffering, false);
  assert.deepEqual(updates, [2]);
});

test('a returning buffering participant waits for the reloaded video before acknowledging readiness', () => {
  const { machine, updates } = setup();
  let ready;
  machine.player.whenVideoReady = callback => { ready = callback; return () => {}; };
  machine.handleRoomSnapshot({
    playbackState: 'Buffering', currentPositionSeconds: 60, videoRevision: 7,
    snapshotAt: new Date(1000).toISOString(), lastUpdatedAt: new Date(1000).toISOString(),
    currentVideo: { durationSeconds: 1200 },
  }, 'video', machine.videoRevision, true);
  assert.deepEqual(updates, []);
  ready();
  assert.deepEqual(updates, ['ready']);
});
