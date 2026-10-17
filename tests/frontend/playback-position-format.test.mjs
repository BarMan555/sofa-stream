import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function formatter() {
  class HubConnectionBuilder {
    withUrl() { return this; } withAutomaticReconnect() { return this; }
    build() { return { on() {} }; }
  }
  const context = { API_BASE_URL: 'http://local', signalR: { HubConnectionBuilder } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../../Frontend/js/api.js', import.meta.url), 'utf8'), context);
  return context.playbackTimeSpan;
}

test('wire positions preserve milliseconds and use the .NET day prefix after 24 hours', () => {
  const format = formatter();
  assert.equal(format(3610.125), '01:00:10.125');
  assert.equal(format(90061.125), '1.01:01:01.125');
});

test('non-finite and negative positions are rejected before any HTTP command', () => {
  const format = formatter();
  for (const value of [-1, NaN, Infinity]) assert.throws(() => format(value), /invalid/);
});
