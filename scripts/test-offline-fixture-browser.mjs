// Offline fixture demonstration (#143 V3): a representative Atlas journey
// executed with every non-local request failed at the transport level
// (Fetch domain, via the shared transport's offline mode). The landing
// page must render completely from local fixtures, and a deliberate
// external probe must be blocked — proving the block is active rather
// than the journey simply never trying the network. The intentional
// per-asset fallback-failure tests remain in the views/graph/treemap
// suites; this suite demonstrates whole-journey offline execution.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {launchBrowserTransport} from './browser-transport.mjs';

const root=resolve('dist');
const probeUrl='https://example.com/offline-fixture-probe';
const transport=await launchBrowserTransport({root,profilePrefix:'atlas-offline-chrome-'});
const address=transport.address;
try {
  const session=await transport.connect();
  const {command,evaluate,until}=session;
  const exceptions=session.exceptions;
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  await session.enableOfflineMode();

  const generation=session.navigationCount;
  await command('Page.navigate',{url:address+'/'});
  await until(async()=>session.navigationCount>generation,'Offline navigation did not commit');
  await until(()=>evaluate("document.querySelector('.landing-preview img')?.naturalWidth>0&&!!document.querySelector('.atlas-wordmark')"),'Landing did not render offline');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.landing-views strong')].map(heading=>heading.textContent)"),['List','Graph','Treemap'],'Landing views must render from local fixtures while offline');

  // The probe proves the transport-level block is active: the request is
  // attempted, recorded, and failed before it leaves the machine.
  assert.equal(await evaluate(`fetch(${JSON.stringify(probeUrl)}).then(()=>'served').catch(()=>'blocked')`),'blocked','A deliberate external request must be blocked while offline');
  assert.deepEqual(session.blockedRequests,[probeUrl],'Only the deliberate probe may be blocked');
  assert.deepEqual(session.externalRequests,[probeUrl],'The journey itself must attempt no external requests');
  assert.deepEqual(exceptions,[],'Offline journey must not raise unhandled JavaScript exceptions');
  await session.disableOfflineMode();
  console.log('Offline fixture checks passed: landing rendered entirely from local fixtures with non-local network blocked; deliberate external probe blocked and recorded.');
} finally {
  await transport.close();
}
