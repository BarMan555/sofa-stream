import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const instance = createHash('sha256').update(root).digest('hex').slice(0, 8);
let runSequence = 0;
export const devProject = `sofastream-dev-${instance}`;
export const cancellation = new AbortController();

export function redact(value) {
  return String(value)
    .replace(/\b(password|pwd|access_token|token|secret)\s*([=:])\s*([^;\s&]+)/gi, '$1$2<redacted>')
    .replace(/\bBearer\s+\S+/gi, 'Bearer <redacted>');
}

export async function createRun(command) {
  const startedAt = new Date().toISOString();
  const id = `${startedAt.replace(/[:.]/g, '-')}-${process.pid}-${++runSequence}`;
  const directory = path.join(root, 'artifacts', 'harness', id);
  await mkdir(directory, { recursive: true });
  return { schemaVersion: 1, command, startedAt, directory, status: 'running', steps: [], services: {} };
}

export async function finishRun(run, error, { publishLatest = true, quiet = false } = {}) {
  run.finishedAt = new Date().toISOString();
  run.status = error ? 'failed' : 'passed';
  if (error) run.error = redact(error.message);
  const json = `${JSON.stringify(run, null, 2)}\n`;
  await writeFile(path.join(run.directory, 'summary.json'), json);
  if (publishLatest) await writeFile(path.join(root, 'artifacts', 'harness', 'latest.json'), json);
  if (!quiet) console.log(`\n${run.status.toUpperCase()}: ${path.relative(root, run.directory)}/summary.json`);
}

export function launch(run, name, command, args, options = {}) {
  if (!options.ignoreCancellation) cancellation.signal.throwIfAborted();
  const step = { name, command, args: args.map(redact), startedAt: new Date().toISOString(), log: `${name}.log` };
  run.steps.push(step);
  const logfile = createWriteStream(path.join(run.directory, step.log));
  const logClosed = new Promise(resolve => logfile.once('close', resolve));
  logfile.on('error', error => { step.loggingError = redact(error.message); });
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  const streams = new Map();
  function output(stream, chunk, flush = false) {
    const buffer = (streams.get(stream) || '') + (chunk || '');
    const lines = buffer.split('\n');
    const trailing = lines.pop();
    streams.set(stream, flush ? '' : trailing);
    if (flush && trailing) lines.push(trailing);
    for (const line of lines) {
      const safe = `${redact(line)}\n`;
      logfile.write(safe);
      if (!options.quiet) process.stdout.write(safe);
    }
  }
  child.stdout.on('data', chunk => output('stdout', chunk));
  child.stderr.on('data', chunk => output('stderr', chunk));
  let exited = false;
  const cancel = () => {
    if (!exited && child.pid) {
      try {
        if (process.platform === 'win32') child.kill('SIGTERM');
        else process.kill(-child.pid, 'SIGTERM');
      } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  if (!options.ignoreCancellation) cancellation.signal.addEventListener('abort', cancel, { once: true });
  const completed = new Promise(resolve => {
    child.once('error', error => {
      step.error = redact(error.message);
      logfile.write(`${step.error}\n`);
    });
    child.once('close', async (code, signal) => {
      exited = true;
      cancellation.signal.removeEventListener('abort', cancel);
      output('stdout', '', true);
      output('stderr', '', true);
      step.exitCode = code;
      step.signal = signal;
      step.finishedAt = new Date().toISOString();
      logfile.end();
      await logClosed;
      resolve(step);
    });
  });
  return { child, completed, get exited() { return exited; }, step };
}

export async function execute(run, name, command, args, options = {}) {
  const process = launch(run, name, command, args, options);
  const step = await process.completed;
  if ((step.exitCode !== 0 || step.loggingError) && !options.allowFailure)
    throw new Error(`${name} failed (${step.exitCode ?? step.error}). See ${step.log}.`);
  return step;
}

export async function stopProcess(process) {
  if (!process || process.exited) return;
  function signal(name) {
    try {
      if (globalThis.process.platform === 'win32') process.child.kill(name);
      else globalThis.process.kill(-process.child.pid, name);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  signal('SIGTERM');
  const timer = setTimeout(() => signal('SIGKILL'), 5000);
  timer.unref();
  try { await process.completed; } finally { clearTimeout(timer); }
}

export async function waitForHttp(url, running, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    cancellation.signal.throwIfAborted();
    if (running?.exited) throw new Error(`Service exited before becoming ready: ${url}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch { /* Readiness is bounded by the overall deadline. */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Readiness timeout: ${url}`);
}

async function probePort(port) {
  const server = createTcpServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const selected = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return selected;
}

function configuredPort(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535)
    throw new Error(`${name} must be a port between 1 and 65535.`);
  return value;
}

export async function ports(ephemeral) {
  const selected = new Set();
  const values = {};
  for (const [role, name, fallback] of [
    ['api', 'SOFASTREAM_API_PORT', 5063],
    ['frontend', 'SOFASTREAM_FRONTEND_PORT', 8000],
    ['database', 'SOFASTREAM_DB_PORT', 5433],
  ]) {
    let port;
    do { port = await probePort(ephemeral ? 0 : configuredPort(name, fallback)); }
    while (ephemeral && selected.has(port));
    if (selected.has(port)) throw new Error('API, frontend and database ports must differ.');
    selected.add(port);
    values[role] = port;
  }
  return values;
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif',
};

export async function serveFrontend(port, apiUrl) {
  const directory = path.join(root, 'Frontend');
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const filename = path.resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!filename.startsWith(`${directory}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const data = pathname === '/runtime-config.js'
        ? Buffer.from(`window.SOFASTREAM_CONFIG = ${JSON.stringify({ apiBaseUrl: apiUrl })};\n`)
        : await readFile(filename);
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

export async function startStack(run, { ephemeral = false } = {}) {
  const selected = await ports(ephemeral);
  const project = ephemeral ? `${devProject}-test-${process.pid}` : devProject;
  const compose = ['compose', '-p', project, '-f', 'compose.dev.yml'];
  const environment = { SOFASTREAM_DB_PORT: String(selected.database) };
  let api;
  let frontend;
  let composeStarted = false;
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    if (frontend) await new Promise(resolve => frontend.close(resolve));
    await stopProcess(api);
    if (composeStarted) {
      await execute(run, 'database-logs', 'docker', [...compose, 'logs', '--no-color'], {
        env: environment, quiet: true, allowFailure: true, ignoreCancellation: true,
      });
      await execute(run, 'database-stop', 'docker', [...compose, 'down', ...(ephemeral ? ['--volumes'] : [])], {
        env: environment, ignoreCancellation: true,
      });
    }
  }
  try {
    composeStarted = true;
    await execute(run, 'database-start', 'docker', [...compose, 'up', '-d', '--wait', '--wait-timeout', '90'], {
      env: environment,
    });
    const apiUrl = `http://127.0.0.1:${selected.api}`;
    const frontendUrl = `http://127.0.0.1:${selected.frontend}`;
    const connectionString = `Host=127.0.0.1;Port=${selected.database};Database=sofa_dev;Username=sofa_dev;Password=sofa_local_only;`;
    api = launch(run, 'api', 'dotnet', ['SofaStream.Api/bin/Release/net10.0/SofaStream.Api.dll'], {
      env: {
        ASPNETCORE_ENVIRONMENT: 'Harness',
        ASPNETCORE_URLS: apiUrl,
        ConnectionStrings__DefaultConnection: connectionString,
        Cors__AllowedOrigins__0: frontendUrl,
        Cors__AllowedOrigins__1: `http://localhost:${selected.frontend}`,
      },
      quiet: true,
    });
    await waitForHttp(`${apiUrl}/health/ready`, api);
    frontend = await serveFrontend(selected.frontend, apiUrl);
    await waitForHttp(frontendUrl);
    run.services = { project, apiUrl, frontendUrl, databasePort: selected.database, ephemeral };
    await writeFile(path.join(run.directory, 'summary.json'), `${JSON.stringify(run, null, 2)}\n`);
    return { apiUrl, frontendUrl, api, stop };
  } catch (error) {
    try { await stop(); } catch (cleanupError) { error.message += ` Cleanup: ${cleanupError.message}`; }
    throw error;
  }
}
