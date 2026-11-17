import '../specimens/fluid-inspector/inspector.test.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('Fluid inspector real Chrome acceptance', {
  skip: process.env.CI && process.env.RUNNER_TEMP ? false : 'Run the browser harness separately; CI retains its evidence in graph-review.',
  timeout: 180000,
}, async () => {
  const child = spawn(process.execPath, ['specimens/fluid-inspector/browser-check.mjs'], { stdio: 'inherit' });
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  assert.equal(result.code, 0, `Inspector browser acceptance failed (${result.signal || result.code}).`);
});
