import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createRun, execute, finishRun, launch, serveFrontend, stopProcess } from '../../scripts/lib/runtime.mjs';

test('local static server supplies the selected API and rejects traversal', async () => {
  const server = await serveFrontend(0, 'http://127.0.0.1:54321');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const config = await fetch(`${url}/runtime-config.js`);
    assert.equal(config.status, 200);
    assert.match(await config.text(), /http:\/\/127\.0\.0\.1:54321/);
    assert.equal((await fetch(`${url}/..%2fpackage.json`)).status, 403);
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('failed commands retain a failing summary and redact credentials in logs', async () => {
  const run = await createRun('harness-self-test');
  let failure;
  try {
    await execute(run, 'intentional-failure', process.execPath, [
      '-e', "console.log('Password=do-not-retain; Authorization: Bearer do-not-retain'); process.exit(7);",
    ], { quiet: true });
  } catch (error) { failure = error; }
  assert.ok(failure);
  await finishRun(run, failure, { publishLatest: false, quiet: true });
  const summary = JSON.parse(await readFile(path.join(run.directory, 'summary.json'), 'utf8'));
  assert.equal(summary.status, 'failed');
  assert.equal(summary.steps[0].exitCode, 7);
  assert.doesNotMatch(JSON.stringify(summary), /do-not-retain/);
  const log = await readFile(path.join(run.directory, 'intentional-failure.log'), 'utf8');
  assert.doesNotMatch(log, /do-not-retain/);
  assert.match(log, /<redacted>/);
});

test('stopping an owned long-running process waits for its actual exit', async () => {
  const run = await createRun('harness-shutdown-test');
  const child = launch(run, 'long-running', process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { quiet: true });
  await stopProcess(child);
  assert.equal(child.exited, true);
  assert.notEqual(child.step.exitCode, 0);
});
