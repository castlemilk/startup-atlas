import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Keep each suite in its own Node test process: their offline fetch seams and
// lifecycle hooks must not share globals. This entry joins the normal test glob.
test('synthetic investor-round proposal suites pass', () => {
  const env = { ...process.env };
  // A new runner must not inherit the parent's worker marker, which makes
  // Node skip recursive test discovery while still returning exit code zero.
  delete env.NODE_TEST_CONTEXT;
  const output = execFileSync(process.execPath, [
    '--test',
    '--test-reporter=tap',
    'contracts/investor_rounds/reference-model.test.mjs',
    'contracts/investor_rounds/legacy-boundary.test.mjs',
    'contracts/investor_rounds/review-regressions.test.mjs',
  ], { cwd: fileURLToPath(new URL('../', import.meta.url)), env, encoding: 'utf8' });
  assert.ok(Number(output.match(/^# tests (\d+)$/m)?.[1]) >= 127, 'All three suites must execute, not silently skip discovery');
  assert.match(output, /^# fail 0$/m);
  assert.match(output, /^# skipped 0$/m);
});
