// Run only with authorization for the local header inspection.
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.argv.includes('--authorized-http-start')) {
  process.stderr.write('Not executed: local HTTP inspection authorization is required.\n');
  process.exitCode = 2;
} else {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const evidencePath = new URL('./frontend-security-evidence.json', import.meta.url);
  const expected = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
  };
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, ''));
  const runIdIndex = process.argv.indexOf('--run-id');
  const runId = runIdIndex < 0 ? null : process.argv[runIdIndex + 1];
  if (runIdIndex >= 0 && (typeof runId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(runId))) throw new Error('Invalid run-id');
  const outputPath = runId ? new URL('./frontend-header-check-' + runId + '.json', import.meta.url) : evidencePath;
  if (runId && existsSync(outputPath)) throw new Error('Existing run-id output; no repeat permitted.');
  if (!runId && evidence.httpHeaderValidation?.startedAt) throw new Error('Existing run detected; no automatic repeat permitted.');
  const run = {
    runId, engine: 'Codex', startedAt: new Date().toISOString(),
    method: 'Node HTTP; sequential requests; no redirects, retries, credentials or body logging',
    head: execFileSync('git', ['-c', 'safe.directory=' + root, 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    nginxSha256: createHash('sha256').update(readFileSync(new URL('../../frontend/nginx.conf', import.meta.url))).digest('hex').toUpperCase(),
    requests: [], status: 'running', errorResponseConfirmed: false,
    limits: 'Only localhost:5173 frontend headers. No API writes, Docker control, nginx syntax check or browser checks. Full CSP remains residual.',
  };
  function request(method, path) {
    return new Promise((resolve, reject) => {
      const startedAt = new Date().toISOString();
      const req = http.request({ hostname: 'localhost', port: 5173, path, method, agent: false }, res => {
        const headers = Object.fromEntries(Object.keys(expected).map(key => [key, res.headers[key] ?? null]));
        const record = { method, url: `http://localhost:5173${path}`, startedAt,
          headersReceivedAt: new Date().toISOString(), status: res.statusCode,
          headers, headersMatch: Object.entries(expected).every(([key, value]) => headers[key] === value) };
        // Discard bytes; never retain or print response body or non-allowlisted headers.
        res.resume();
        res.once('end', () => resolve(record));
        res.once('error', () => reject(new Error('RESPONSE_STREAM_ERROR')));
      });
      req.setTimeout(10000, () => req.destroy(new Error('REQUEST_TIMEOUT')));
      req.once('error', error => reject(new Error(error.code && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'REQUEST_FAILED')));
      req.end();
    });
  }
  let stage = 'GET /';
  try {
    for (const [method, path, purpose] of [
      ['GET', '/', 'normal'],
      ['GET', '/__frontend_header_check_missing__', 'SPA fallback; actual status recorded'],
      ['POST', '/', 'static-server error probe; empty body; no API request'],
    ]) {
      stage = `${method} ${path}`;
      const result = await request(method, path);
      result.purpose = purpose;
      run.requests.push(result);
      if (result.status >= 400) run.errorResponseConfirmed = true;
      if (!result.headersMatch) throw new Error('HEADER_MISMATCH');
      if (purpose === 'normal' && result.status !== 200) throw new Error('NORMAL_STATUS_NOT_200');
    }
    run.status = run.errorResponseConfirmed ? 'normal-and-error-headers-confirmed' : 'normal-checked-error-response-unconfirmed';
  } catch (error) {
    run.status = 'stopped-no-retry';
    run.failure = { stage, category: error.message, observedAt: new Date().toISOString() };
    process.exitCode = 1;
  } finally {
    run.endedAt = new Date().toISOString();
    if (runId) {
      writeFileSync(outputPath, JSON.stringify(run, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    } else {
      evidence.httpHeaderValidation = run;
      writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    }
    process.stdout.write(JSON.stringify(run, null, 2) + '\n');
  }
}
