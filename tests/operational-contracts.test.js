import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;

test('capability manifest contract executes through normal test discovery', () => {
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap',
    'contracts/capability_manifest/manifest.test.mjs'], { cwd, env, encoding: 'utf8' });
  assert.ok(Number(output.match(/^# tests (\d+)$/m)?.[1]) >= 49);
  assert.match(output, /^# fail 0$/m);
  assert.match(output, /^# skipped 0$/m);
});

test('operational receipt and pinned capability integration suites execute', () => {
  // unittest writes summaries to stderr, so use a small Python runner to enforce
  // discovery counts as well as success; missing suites cannot pass silently.
  execFileSync('python3', ['-B', '-c', `
import sys, unittest
sys.path.insert(0, 'contracts/operational_receipts')
suite = unittest.defaultTestLoader.discover('contracts/operational_receipts', pattern='test_report.py')
if suite.countTestCases() < 55: raise SystemExit('receipt tests were not discovered')
result = unittest.TextTestRunner().run(suite)
if not result.wasSuccessful() or result.skipped: raise SystemExit('receipt tests failed or skipped')
`], { cwd, env, encoding: 'utf8' });
  execFileSync('python3', ['-B', '-c', `
import sys, unittest
sys.path.insert(0, 'contracts/operational_receipts')
import test_capability_bridge as bridge
bridge.CONTRACT_ROOT = 'contracts/capability_manifest'
suite = unittest.defaultTestLoader.loadTestsFromTestCase(bridge.CapabilityBridgeIntegrationTests)
if suite.countTestCases() < 13: raise SystemExit('capability integration tests were not discovered')
result = unittest.TextTestRunner().run(suite)
if not result.wasSuccessful() or result.skipped: raise SystemExit('capability integration failed or skipped')
`], { cwd, env, encoding: 'utf8' });
});
