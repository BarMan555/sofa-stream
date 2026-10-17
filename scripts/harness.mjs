import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { cancellation, createRun, devProject, execute, finishRun, npm, redact, root, startStack } from './lib/runtime.mjs';

const commands = new Set(['doctor', 'dev', 'db:stop', 'check', 'check:full', 'test:integration', 'test:e2e', 'diagnose']);
const command = process.argv[2];
if (!commands.has(command)) {
  console.error(`Usage: node scripts/harness.mjs ${[...commands].join('|')}`);
  process.exit(2);
}

const run = await createRun(command);
let failure;
const cancel = () => cancellation.abort(new Error('Interrupted by user.'));
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);

async function prerequisites({ docker = false, browser = false } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
  await execute(run, 'dotnet-version', 'dotnet', ['--version']);
  if (docker) {
    await execute(run, 'docker-version', 'docker', ['info', '--format', '{{.ServerVersion}}']);
    await execute(run, 'compose-version', 'docker', ['compose', 'version', '--short']);
  }
  if (browser) {
    let chromium;
    try { ({ chromium } = await import('@playwright/test')); }
    catch { throw new Error('Browser dependencies missing. Run npm ci.'); }
    try { await access(chromium.executablePath()); }
    catch { throw new Error('Chromium missing. Run npm run browser:install.'); }
  }
}

async function build() {
  await execute(run, 'restore', 'dotnet', ['restore', 'SofaStream.sln', '--locked-mode']);
  await execute(run, 'build', 'dotnet', ['build', 'SofaStream.sln', '-c', 'Release', '--no-restore', '--disable-build-servers', '-m:1', '--verbosity', 'minimal']);
}

async function quickChecks() {
  await prerequisites();
  await build();
  await execute(run, 'unit-tests', 'dotnet', [
    'test', 'SofaStream.Tests/SofaStream.Tests.csproj', '-c', 'Release', '--no-build', '--no-restore',
    '--logger', 'trx;LogFileName=unit-tests.trx', '--results-directory', run.directory,
  ]);
  const productionScripts = ['Frontend/app.js', 'Frontend/runtime-config.js',
    ...(await readdir(path.join(root, 'Frontend/js'))).filter(name => name.endsWith('.js')).map(name => `Frontend/js/${name}`)];
  for (const [index, script] of productionScripts.entries())
    await execute(run, `javascript-syntax-${index}`, process.execPath, ['--check', script], { quiet: true });
  await execute(run, 'frontend-tests', npm, ['run', 'test:frontend']);
  await execute(run, 'harness-tests', npm, ['run', 'test:harness']);
}

async function integrationTests() {
  await execute(run, 'integration-tests', 'dotnet', [
    'test', 'SofaStream.IntegrationTests/SofaStream.IntegrationTests.csproj', '-c', 'Release', '--no-build', '--no-restore',
    '--logger', 'trx;LogFileName=integration-tests.trx', '--results-directory', run.directory,
  ]);
}

async function browserTests() {
  const stack = await startStack(run, { ephemeral: true });
  try {
    await execute(run, 'browser-tests', npm, ['exec', '--', 'playwright', 'test'], {
      env: { SOFASTREAM_API_URL: stack.apiUrl, SOFASTREAM_FRONTEND_URL: stack.frontendUrl, SOFASTREAM_RUN_DIR: run.directory },
    });
  } finally { await stack.stop(); }
}

async function diagnostics() {
  await execute(run, 'git-status', 'git', ['-c', 'core.fsmonitor=false', 'status', '--short', '--branch'], { allowFailure: true });
  await execute(run, 'dotnet-info', 'dotnet', ['--info'], { allowFailure: true });
  await execute(run, 'docker-info', 'docker', ['info', '--format', '{{.ServerVersion}}'], { allowFailure: true });
  await execute(run, 'dev-containers', 'docker', ['compose', '-p', devProject, '-f', 'compose.dev.yml', 'ps', '--all'], { allowFailure: true });
  try {
    const latest = JSON.parse(await readFile(path.join(root, 'artifacts/harness/latest.json'), 'utf8'));
    run.previousRun = { command: latest.command, status: latest.status, directory: latest.directory, error: latest.error };
  } catch { /* No previous run is also a useful diagnostic state. */ }
  const failed = run.steps.filter(step => step.exitCode !== 0).map(step => step.name);
  run.unavailable = failed;
  if (failed.length) throw new Error(`Diagnostics collected; unavailable checks: ${failed.join(', ')}`);
}

try {
  switch (command) {
    case 'doctor':
      await prerequisites({ docker: true, browser: true });
      break;
    case 'check':
      await quickChecks();
      break;
    case 'check:full':
      await prerequisites({ docker: true, browser: true });
      await quickChecks();
      await integrationTests();
      await browserTests();
      break;
    case 'test:integration':
      await prerequisites({ docker: true });
      await build();
      await integrationTests();
      break;
    case 'test:e2e':
      await prerequisites({ docker: true, browser: true });
      await build();
      await browserTests();
      break;
    case 'dev': {
      await prerequisites({ docker: true });
      await build();
      const stack = await startStack(run);
      console.log(`\nSofaStream: ${stack.frontendUrl}\nAPI: ${stack.apiUrl}\nLogs: ${run.directory}\nCtrl+C stops this local environment and preserves its database.`);
      try {
        await new Promise((resolve, reject) => {
          cancellation.signal.addEventListener('abort', resolve, { once: true });
          stack.api.completed.then(() => reject(new Error('API exited. See api.log.')));
        });
      } finally { await stack.stop(); }
      break;
    }
    case 'db:stop':
      await execute(run, 'database-stop', 'docker', ['compose', '-p', devProject, '-f', 'compose.dev.yml', 'down']);
      break;
    case 'diagnose':
      await diagnostics();
      break;
  }
} catch (error) {
  failure = error;
  console.error(redact(error.message));
} finally {
  await finishRun(run, failure);
  process.removeListener('SIGINT', cancel);
  process.removeListener('SIGTERM', cancel);
}
if (failure) process.exitCode = 1;
