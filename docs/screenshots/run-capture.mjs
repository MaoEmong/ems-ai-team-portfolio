// 초기 촬영: no credentials, raw logs, or authentication responses are persisted.
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createInterface } from 'node:readline';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const project = `ems-photo-20261019-${randomBytes(5).toString('hex')}`;
const env = { ...process.env }, random = () => randomBytes(24).toString('hex');
const ledgerPath = join(here, 'capture-attempts.json');
let ledger;
try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw new Error('ATTEMPT_LEDGER_INVALID'); ledger = { historicalAttempt: { project: 'ems-photo-20261019-8e5d11dcc7', manifest: '2026-10-18T18-32-41-463Z-a23d30ba/manifest.json', actualPngCount: 0, code: 'API_HTTP_201' }, attempts: [] }; }
if (ledger.attempts.length >= 3) throw new Error('AUTHORIZED_ATTEMPT_LIMIT');
const evidence = { attempt: ledger.attempts.length + 1, actor: 'Codex', project, startedAt: new Date().toISOString(), status: 'preflight', frontendMode: 'real-api', provider: 'mock', actualInference: false };
evidence.captureScriptSha256 = createHash('sha256').update(await readFile(join(here, 'capture-portfolio.mjs'))).digest('hex');
evidence.launcherSha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
ledger.attempts.push(evidence);
let stage = 'PREFLIGHT';
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
async function save() {
  await writeFile(join(here, `execution-${project}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}
function run(command, args) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', () => {});
    child.once('error', () => reject(new Error('PROCESS_START_FAILED')));
    child.once('close', code => code === 0 ? 완료(output.trimEnd()) : reject(new Error(`PROCESS_EXIT_${Number.isInteger(code) ? code : 'UNKNOWN'}`)));
  });
}
try {
  evidence.sourceCommit = await run('git', ['-c', `safe.directory=${root}`, 'rev-parse', 'HEAD']);
  if (evidence.sourceCommit !== '89db9017fe3bbd025a26d4bb852c609fc7824607') throw new Error('SOURCE_CHANGED');
  const dirty = await run('git', ['-c', `safe.directory=${root}`, 'status', '--porcelain', '--untracked-files=all']);
  evidence.dirtyPaths = dirty.split(/\r?\n/).filter(Boolean).map(line => line.slice(3));
  evidence.nginxHeadersDirty = evidence.dirtyPaths.includes('frontend/nginx.conf');
  evidence.dockerServer = await run('docker', ['version', '--format', '{{.Server.Version}}']);
  if (await run('docker', ['ps', '-aq'])) throw new Error('EXISTING_CONTAINERS_STOP');
  const volumes = (await run('docker', ['volume', 'ls', '--format', '{{.Name}}'])).split(/\r?\n/);
  if (volumes.includes(`${project}_mysql_data`)) throw new Error('PROJECT_VOLUME_EXISTS');
  evidence.newProjectVolumeAbsent = true;
  Object.assign(env, {
    DB_NAME: 'ems', DB_USERNAME: `ems_${randomBytes(6).toString('hex')}`, DB_PASSWORD: random(), DB_ROOT_PASSWORD: random(), JWT_SECRET: randomBytes(48).toString('hex'),
    ADMIN_LOGIN_ID: `CAPA${randomBytes(8).toString('hex')}`, ADMIN_INITIAL_PASSWORD: random(), DEMO_ADMIN_INITIAL_PASSWORD: '',
    EMS_AI_PROVIDER: 'mock', EMS_AI_MODEL: '', ANTHROPIC_API_KEY: '', EMS_AI_EMPLOYEE_SEARCH_ENABLED: 'true', EMS_AI_EVALUATION_SUMMARY_ENABLED: 'true', EMS_AI_POLICY_QA_ENABLED: 'true',
    PORTFOLIO_CAPTURE_RUN: '1', PORTFOLIO_SYNTHETIC_ONLY: '1', PORTFOLIO_COMPOSE_PROJECT: project,
    PORTFOLIO_UI_BASE_URL: 'http://localhost:5173', PORTFOLIO_API_BASE_URL: 'http://localhost:8080/api/v1',
    PORTFOLIO_EMPLOYEE_ID: `CAPE${randomBytes(8).toString('hex')}`, PORTFOLIO_EMPLOYEE_PASSWORD: random(),
    PORTFOLIO_IMPORT_ID: `CAPI${randomBytes(8).toString('hex')}`, PORTFOLIO_IMPORT_PASSWORD: random(), VITE_MOCK_API: 'false',
  });
  env.PORTFOLIO_ADMIN_ID = env.ADMIN_LOGIN_ID; env.PORTFOLIO_ADMIN_PASSWORD = env.ADMIN_INITIAL_PASSWORD;
  for (const name of ['DEBUG', 'PWDEBUG', 'NODE_DEBUG']) delete env[name];
  stage = 'COMPOSE_UP_BUILD'; evidence.status = 'running'; await save(); emit({ stage, project, newProjectVolumeAbsent: true });
  await run('docker', ['compose', '--env-file', '.env.example', '--project-name', project, 'up', '--build', '-d']);
  stage = 'READINESS'; emit({ stage, project });
  let ready = false; const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      const auth = await fetch('http://localhost:8080/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loginId: env.ADMIN_LOGIN_ID, password: env.ADMIN_INITIAL_PASSWORD }), signal: AbortSignal.timeout(3000) });
      ready = auth.status === 200; await auth.body?.cancel();
      if (ready) { const ui = await fetch('http://localhost:5173', { signal: AbortSignal.timeout(3000) }); ready = ui.ok; await ui.body?.cancel(); }
      if (ready) break;
    } catch { /* Startup readiness only. No raw errors. */ }
    await new Promise(done => setTimeout(done, 2000));
  }
  if (!ready) throw new Error('STARTUP_NOT_READY');
  stage = 'CAPTURE'; await save(); emit({ stage, project });
  const before = new Set(await readdir(here)); let captureError;
  try { await run(process.execPath, ['docs/screenshots/capture-portfolio.mjs']); } catch (error) { captureError = error; }
  for (const name of (await readdir(here)).filter(name => !before.has(name))) {
    const manifestPath = join(here, name, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const plan = JSON.parse(await readFile(join(here, 'screen-list.json'), 'utf8'));
    manifest.executionActor = 'Codex'; manifest.controlledAttempt = evidence.attempt;
    manifest.captureScriptSha256 = evidence.captureScriptSha256; manifest.launcherSha256 = evidence.launcherSha256;
    manifest.sourceDirtyPathsAtEnvironmentStart = evidence.dirtyPaths;
    manifest.plannedScreenCount = plan.screens.length;
    manifest.actualPngCount = (await readdir(join(here, name))).filter(file => file.endsWith('.png')).length;
    manifest.missingCaptures = plan.screens.flatMap(screen => screen.viewports.filter(viewport => !manifest.captures.some(capture => capture.screenId === screen.id && capture.viewportName === viewport)).map(viewport => ({ screenId: screen.id, viewport, code: manifest.screenFailures?.find(failure => failure.screenId === screen.id && failure.viewportName === viewport)?.code ?? 'NOT_CAPTURED' })));
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    evidence.manifest = `docs/screenshots/${name}/manifest.json`; evidence.actualPngCount = manifest.actualPngCount;
    evidence.capturedScreenCount = new Set(manifest.captures.map(capture => capture.screenId)).size;
    evidence.captureStatus = manifest.status; evidence.screenFailures = manifest.screenFailures; evidence.missingCaptures = manifest.missingCaptures;
    if (manifest.failure) evidence.captureFailure = manifest.failure;
  }
  if (captureError) throw captureError;
  stage = 'STACK_STATUS';
  evidence.containers = (await run('docker', ['ps', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Names}}|{{.Status}}'])).split(/\r?\n/);
  evidence.status = evidence.captureStatus; evidence.stackRetained = true; evidence.completedAt = new Date().toISOString();
  await save(); emit(evidence);
  // Keep credentials only in this live process. No stack control commands here.
  emit({ stage: 'CONTROL_WAIT', project, fullAttempt: evidence.attempt, allowedSingleAiRetries: 1 });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity }); let retried = false;
  for await (const command of input) {
    if (command === 'FINISH_PROCESS') { input.close(); break; }
    if (command !== 'RETRY_SELECTED' || retried) { emit({ stage: 'COMMAND_NOT_ALLOWED' }); continue; }
    retried = true; env.PORTFOLIO_SINGLE_AI = '1';
    const existing = new Set(await readdir(here));
    try { await run(process.execPath, ['docs/screenshots/capture-portfolio.mjs']); }
    catch { emit({ stage: 'SINGLE_AI_RETRY_PROCESS_FAILED' }); }
    evidence.singleAiRetry = { at: new Date().toISOString(), manifests: (await readdir(here)).filter(name => !existing.has(name)).map(name => `docs/screenshots/${name}/manifest.json`), captureScriptSha256: createHash('sha256').update(await readFile(join(here, 'capture-portfolio.mjs'))).digest('hex') };
    await save(); emit({ stage: 'SINGLE_AI_RETRY_FINISHED', ...evidence.singleAiRetry });
  }
} catch (error) {
  evidence.status = 'stopped'; evidence.failure = { stage, code: /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'EXECUTION_FAILED', at: new Date().toISOString() };
  await save(); emit(evidence); process.exitCode = 1;
}
