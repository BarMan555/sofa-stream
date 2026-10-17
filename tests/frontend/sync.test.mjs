import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function setup(host = true) {
  const actions = [];
  const updates = [];
  const timers = new Map();
  let timerId = 0;
  const context = {
    console: { log() {} }, currentRoomId: 'room',
    PlaybackState: { Paused: 0, Playing: 1, Buffering: 2 },
    getExactServerTimeNow: () => 1000,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    sendBufferingCompleted() { updates.push('buffering-completed'); },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../../Frontend/js/sync.js', import.meta.url), 'utf8'), context);
  const player = {
    getCurrentTime: () => 0, getPlayerState: () => 1,
    play() { actions.push('play'); }, pause() { actions.push('pause'); },
    seekTo(position) { actions.push(['seek', position]); },
    cueVideo(id, position) { actions.push(['cue', id, position]); },
  };
  const machine = new context.SyncStateMachine((...args) => updates.push(args));
  machine.setPlayer(player);
  machine.setHostStatus(host);
  return { machine, actions, updates, timers };
}

test('a remote scheduled play seeks now and starts at the shared deadline', () => {
  const { machine, actions, updates, timers } = setup();
  machine.handleRemoteEvent({ state: 'Playing', positionInSeconds: 42, scheduledFor: new Date(2000).toISOString() });
  assert.deepEqual(actions, [['seek', 42], 'pause']);
  machine.handlePlayerStateNotification(2);
  assert.deepEqual(updates, []);
  const scheduled = [...timers.values()].find(timer => timer.delay === 1000);
  assert.ok(scheduled);
  scheduled.callback();
  assert.equal(actions.at(-1), 'play');
});

test('a later pause cancels the pending scheduled start', () => {
  const { machine, actions, timers } = setup();
  machine.handleRemoteEvent({ state: 'Playing', positionInSeconds: 0, scheduledFor: new Date(2000).toISOString() });
  machine.handleRemoteEvent({ state: 'Paused', positionInSeconds: 0, scheduledFor: null });
  for (const timer of [...timers.values()]) timer.callback();
  assert.equal(actions.filter(action => action === 'play').length, 0);
});

test('a guest cannot issue host controls or slider seeks', () => {
  const { machine, actions, updates } = setup(false);
  machine.handleUiAction(1);
  machine.handleSliderSeek(120);
  assert.deepEqual(actions, []);
  assert.deepEqual(updates, []);
});

test('the host reports buffering and reports completion only once', () => {
  const { machine, updates } = setup();
  machine.handlePlayerStateNotification(2);
  machine.handlePlayerStateNotification(0);
  machine.handlePlayerStateNotification(1);
  assert.deepEqual(updates, [[2], 'buffering-completed']);
});
