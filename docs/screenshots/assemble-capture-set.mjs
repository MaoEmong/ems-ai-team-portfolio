// Read-only image validation plus a separate combined manifest; originals are retained.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sources = ['2026-10-18T18-54-38-906Z-f170b270/manifest.json', '2026-10-18T19-39-27-026Z-430432da/manifest.json'];
const manifests = await Promise.all(sources.map(path => readFile(join(here, path), 'utf8').then(JSON.parse)));
const plan = JSON.parse(await readFile(join(here, 'screen-list.json'), 'utf8'));
const captures = manifests.flatMap(manifest => manifest.captures);
const key = capture => `${capture.screenId}/${capture.viewportName}`;
if (new Set(captures.map(key)).size !== captures.length) throw new Error('DUPLICATE_CAPTURE');
for (const capture of captures) {
  const path = resolve(here, capture.file);
  if (!path.startsWith(`${here}${sep}`)) throw new Error('INVALID_CAPTURE_PATH');
  const bytes = await readFile(path);
  if (createHash('sha256').update(bytes).digest('hex') !== capture.sha256 || (await stat(path)).size === 0) throw new Error('CAPTURE_HASH_MISMATCH');
}
const missing = plan.screens.flatMap(screen => screen.viewports.filter(viewport => !captures.some(capture => capture.screenId === screen.id && capture.viewportName === viewport)).map(viewport => ({ screenId: screen.id, viewport })));
if (manifests.some(manifest => manifest.composeProject !== 'ems-photo-20261019-943cdb77d3' || manifest.frontendMode !== 'real-api' || manifest.provider !== 'mock')) throw new Error('CAPTURE_ENVIRONMENT_MISMATCH');
const combined = {
  actor: 'Codex', assembledAt: new Date().toISOString(), status: missing.length ? 'partial-awaiting-human-review' : 'captured-awaiting-human-review',
  composeProject: 'ems-photo-20261019-943cdb77d3', uiUrl: 'http://localhost:5173', frontendMode: 'real-api', provider: 'mock', actualInference: false,
  fullAttemptsUsed: 3, affectedAiRetryRuns: 1, sourceCommit: manifests[0].sourceCommit, sourceDirtyAtStart: manifests[0].sourceDirtyAtStart,
  sourceDirtyPathsAtEnvironmentStart: manifests[0].sourceDirtyPathsAtEnvironmentStart,
  sourceManifests: sources.map((path, index) => ({ path, actualPngCount: manifests[index].captures.length, status: manifests[index].status, sourceCommit: manifests[index].sourceCommit, captureScriptSha256: manifests[index].captureScriptSha256 })),
  plannedScreenCount: plan.screens.length, actualScreenCount: new Set(captures.map(capture => capture.screenId)).size,
  actualPngCount: captures.length, missingCaptures: missing, fileHashesVerified: true,
  originalFailuresPreserved: manifests[0].screenFailures,
  publicationReview: 'pending-Claude-and-QA', runtimeProcess: { state: 'retained-awaiting-explicit-shutdown-signal', credentialsPersisted: false }, captures,
};
await writeFile(join(here, 'capture-set.json'), `${JSON.stringify(combined, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ actualScreenCount: combined.actualScreenCount, actualPngCount: combined.actualPngCount, missingCaptures: missing, fileHashesVerified: true })}\n`);
