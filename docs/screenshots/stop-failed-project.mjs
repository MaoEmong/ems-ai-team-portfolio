// 통제 촬영: down only the explicitly selected capture project, never its volumes.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFile, readdir } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const project = process.env.PORTFOLIO_STOP_PROJECT || 'ems-photo-20261019-8e5d11dcc7';
if (!/^ems-photo-20261019-[a-f0-9]{10}$/.test(project)) throw new Error('INVALID_CAPTURE_PROJECT');
const env = { ...process.env };
for (const key of ['DB_USERNAME', 'DB_PASSWORD', 'DB_ROOT_PASSWORD', 'JWT_SECRET', 'ADMIN_LOGIN_ID', 'ADMIN_INITIAL_PASSWORD']) env[key] = randomBytes(24).toString('hex');
env.EMS_AI_PROVIDER = 'mock'; env.ANTHROPIC_API_KEY = '';
const evidence = { project, actor: 'Codex', startedAt: new Date().toISOString(), removeVolumes: false };
evidence.command = ['docker', 'compose', '--env-file', '.env.example', '--project-name', project, 'down'];
evidence.priorCleanupRecords = (await readdir(here)).filter(name => name.startsWith('cleanup-') && name.endsWith('.json'));
function docker(args) {
  return new Promise((done, reject) => {
    const child = spawn('docker', args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', () => {});
    child.once('error', () => reject(new Error('DOCKER_START_FAILED')));
    child.once('close', code => code === 0 ? 완료(output.trim()) : reject(new Error('DOCKER_EXIT_FAILED')));
  });
}
const listening = port => new Promise(done => {
  const socket = createConnection({ host: '127.0.0.1', port }); let settled = false;
  const finish = result => { if (!settled) { settled = true; socket.destroy(); 완료(result); } };
  socket.once('connect', () => finish(true)); socket.once('error', error => finish(error.code === 'ECONNREFUSED' ? false : null)); socket.setTimeout(2000, () => finish(null));
});
try {
  evidence.volumesBefore = (await docker(['volume', 'ls', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Name}}'])).split(/\r?\n/).filter(Boolean);
  if (!evidence.volumesBefore.includes(`${project}_mysql_data`)) throw new Error('EXPECTED_VOLUME_NOT_FOUND');
  await docker(['compose', '--env-file', '.env.example', '--project-name', project, 'down']);
  evidence.downExitCode = 0;
  evidence.remainingProjectContainers = await docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`]);
  evidence.volumesAfter = (await docker(['volume', 'ls', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Name}}'])).split(/\r?\n/).filter(Boolean);
  evidence.ports = [];
  for (const port of [3306, 8080, 5173]) evidence.ports.push({ port, listening: await listening(port) });
  evidence.volumePreserved = evidence.volumesBefore.every(name => evidence.volumesAfter.includes(name));
  if (evidence.remainingProjectContainers || !evidence.volumePreserved || evidence.ports.some(item => item.listening !== false)) throw new Error('CLEANUP_VERIFICATION_FAILED');
  evidence.status = 'stopped-volume-preserved-ports-free';
} catch (error) { evidence.status = 'stopped-with-error'; evidence.code = /^[A-Z_]+$/.test(error.message) ? error.message : 'CLEANUP_FAILED'; process.exitCode = 1; }
evidence.completedAt = new Date().toISOString();
await writeFile(join(here, `cleanup-${project}-${Date.now()}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(evidence)}\n`);
