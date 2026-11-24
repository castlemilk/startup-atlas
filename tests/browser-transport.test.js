import test from 'node:test';
import assert from 'node:assert/strict';
import { CdpSession, PhaseTimer } from '../scripts/browser-transport.mjs';

// Fake socket with the addEventListener/send/close surface CdpSession uses,
// so the session's command lifecycle can be driven without a real browser.
class FakeSocket {
  constructor() {
    this.listeners = new Map();
    this.sent = [];
    this.closed = false;
  }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; this.emit('close', {}); }
  emit(type, event) {
    for (const fn of this.listeners.get(type) || []) fn(event);
  }
  respond(id, result) {
    this.emit('message', { data: JSON.stringify({ id, result }) });
  }
  respondError(id, message) {
    this.emit('message', { data: JSON.stringify({ id, error: { message } }) });
  }
  event(method, params = {}) {
    this.emit('message', { data: JSON.stringify({ method, params }) });
  }
}

test('a command resolves on the matching response', async () => {
  const socket = new FakeSocket();
  const session = new CdpSession(socket);
  const pending = session.command('Runtime.evaluate', { expression: '1' });
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].method, 'Runtime.evaluate');
  socket.respond(socket.sent[0].id, { result: { value: 1 } });
  assert.deepEqual(await pending, { result: { value: 1 } });
});

test('a command error response rejects with the CDP error message', async () => {
  const socket = new FakeSocket();
  const session = new CdpSession(socket);
  const pending = session.command('Page.navigate', { url: 'about:blank' });
  socket.respondError(socket.sent[0].id, 'Cannot navigate');
  await assert.rejects(pending, /Cannot navigate/);
});

test('an unanswered command rejects at the deadline with the exact message', async () => {
  const socket = new FakeSocket();
  const session = new CdpSession(socket, { commandTimeoutMs: 30 });
  await assert.rejects(session.command('Runtime.evaluate', {}), {
    message: 'Chrome command timed out: Runtime.evaluate',
  });
});

test('closing the socket rejects all pending commands promptly', async () => {
  const socket = new FakeSocket();
  const session = new CdpSession(socket, { commandTimeoutMs: 60000 });
  const first = session.command('Page.enable');
  const second = session.command('Runtime.enable');
  const started = Date.now();
  socket.close();
  await assert.rejects(first, /CDP connection closed/);
  await assert.rejects(second, /CDP connection closed/);
  assert.ok(Date.now() - started < 5000, 'pending commands must not wait for their deadline');
  // Later commands fail fast with the same cause instead of hanging.
  await assert.rejects(session.command('Page.enable'), /CDP connection closed/);
});

test('a socket error rejects all pending commands promptly', async () => {
  const socket = new FakeSocket();
  const session = new CdpSession(socket, { commandTimeoutMs: 60000 });
  const pending = session.command('Page.enable');
  socket.emit('error', new Error('boom'));
  await assert.rejects(pending, /CDP connection error/);
});

test('Chrome exit rejection: failPending rejects pending commands with the exit cause', async () => {
  const socket = new FakeSocket();
  const session = new CdpSession(socket, { commandTimeoutMs: 60000 });
  const pending = session.command('Runtime.evaluate', {});
  // connectChromeSession wires Chrome's exit event into this call.
  session.failPending(new Error('Chrome exited (1)\nchrome log tail'));
  await assert.rejects(pending, /Chrome exited \(1\)/);
});

test('event capture: exceptions, console messages and navigation counts', async () => {
  const socket = new FakeSocket();
  const session = new CdpSession(socket);
  socket.event('Runtime.exceptionThrown', {
    exceptionDetails: { text: 'Uncaught', exception: { description: 'Error: boom' } },
  });
  socket.event('Runtime.consoleAPICalled', {
    type: 'error', args: [{ value: 'failed' }, { description: 'thing' }],
  });
  socket.event('Runtime.consoleAPICalled', { type: 'log', args: [{ value: 'ignored' }] });
  socket.event('Page.frameNavigated', { frame: { id: 'main' } });
  socket.event('Page.frameNavigated', { frame: { id: 'child', parentId: 'main' } });
  socket.event('Page.loadEventFired', {});
  socket.event('Page.domContentEventFired', {});
  socket.event('Fetch.requestPaused', {});
  assert.deepEqual(session.exceptions, ['Error: boom']);
  assert.deepEqual(session.browserMessages, ['failed thing']);
  assert.equal(session.navigationCount, 1);
  assert.equal(session.loadCount, 1);
  assert.equal(session.documentLoads, 1);
  assert.equal(session.pausedRequests, 1);
});

test('object console format keeps level and text (atlas-views / design-lab shape)', async () => {
  const socket = new FakeSocket();
  const session = new CdpSession(socket, { consoleFormat: 'object' });
  socket.event('Runtime.consoleAPICalled', { type: 'warning', args: [{ value: 'careful' }] });
  assert.deepEqual(session.browserMessages, [{ level: 'warning', text: 'careful' }]);
});

test('evaluate returns the value and throws the exception text on failure', async () => {
  const socket = new FakeSocket();
  const session = new CdpSession(socket);
  const ok = session.evaluate('1 + 1');
  socket.respond(socket.sent[0].id, { result: { value: 2 } });
  assert.equal(await ok, 2);
  const bad = session.evaluate('throw new Error("nope")');
  socket.respond(socket.sent[1].id, {
    result: {},
    exceptionDetails: { text: 'Uncaught', exception: { description: 'Error: nope' } },
  });
  await assert.rejects(bad, /Error: nope/);
});

test('phase timings accumulate command durations by phase', async () => {
  const socket = new FakeSocket();
  const session = new CdpSession(socket);
  const nav = session.command('Page.navigate', { url: 'about:blank' });
  socket.respond(socket.sent[0].id, {});
  await nav;
  const shot = session.command('Page.captureScreenshot', {});
  socket.respond(socket.sent[1].id, { data: '' });
  await shot;
  const summary = session.timings.summary();
  assert.equal(summary.navigation.count, 1);
  assert.equal(summary.capture.count, 1);
  assert.ok(summary.navigation.totalMs >= 0);
});

test('PhaseTimer measures async work and summarises counts', async () => {
  const timer = new PhaseTimer();
  await timer.measure('startup', async () => {});
  timer.record('startup', 5);
  const summary = timer.summary();
  assert.equal(summary.startup.count, 2);
  assert.ok(summary.startup.totalMs >= 5);
});
