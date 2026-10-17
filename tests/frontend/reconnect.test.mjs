import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('leaving during reconnect discards the late restore and releases its HTTP admission', async () => {
  const callbacks = {};
  const calls = [];
  const connection = {
    on() {}, onreconnected(fn) { callbacks.restored = fn; }, onreconnecting() {}, onclose() {},
    async invoke(...args) { calls.push(args); }, async stop() {},
  };
  class HubConnectionBuilder {
    withUrl() { return this; } withAutomaticReconnect() { return this; } build() { return connection; }
  }
  let finishJoin;
  const requests = [];
  const context = {
    console: { log() {}, error() {}, warn() {} }, signalR: { HubConnectionBuilder },
    API_BASE_URL: 'http://local', currentRoomId: 'room', globalUserId: 'user',
    document: { getElementById: () => null },
    syncMachine: { reset() {}, setHostStatus() {} },
    stopVideoChat() {}, hidePlayerBlock() {}, updateHostUiVisibility() {}, applyRoomTheme() {}, switchView() {},
    fetch(url) {
      requests.push(url);
      if (url.endsWith('/join')) return new Promise(resolve => { finishJoin = resolve; });
      return Promise.resolve({ ok: true });
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../../Frontend/js/api.js', import.meta.url), 'utf8'), context);
  vm.runInContext('participantSession = { token: "test-only" };', context);
  const restoring = callbacks.restored();
  await context.leaveRoom();
  finishJoin({ ok: true });
  await restoring;
  assert.equal(context.currentRoomId, null);
  assert.deepEqual(calls, []);
  assert.equal(requests.filter(url => url.endsWith('/leave')).length, 2);
});
