// Bounded, real-Chromium acceptance for the isolated Signal r2 study gallery.
// Run after npm run build:
// CHROME_BIN=/usr/bin/chromium ATLAS_SCREENSHOTS_DIR=/tmp/atlas-r2-review \
//   node scripts/test-signal-studies-r2-browser.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { launchBrowserTransport } from './browser-transport.mjs';

const root = resolve('dist');
const galleryPath = '/assets/design-lab/signal-explorations/r2/index.html';
const assetPath = galleryPath.slice(0, galleryPath.lastIndexOf('/') + 1);
const sourceDir = resolve('web' + assetPath);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(join(root, assetPath, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.assets.length, 18, 'r2 has six constructions in three themes');
assert.equal(new Set(manifest.assets.map(asset => asset.file)).size, 18, 'Asset filenames must be unique');
// Validate input before allocating a browser profile or starting any process.
const output = process.env.ATLAS_SCREENSHOTS_DIR || await mkdtemp(join(tmpdir(), 'atlas-signal-r2-evidence-'));

const mime = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.webp': 'image/webp', '.md': 'text/markdown'
};
const served = [], external = [], exceptions = [], browserErrors = [];
const report = {
  gallery: galleryPath, status: 'running', browser: null,
  manifest_sha256: sha256(manifestBytes), assets: [], viewports: [], screenshots: [],
  checks: {}, visual_review: 'pending human or agent image inspection'
};
let address, profile, downloadDir, transport;
let capture = async () => {};

try {
  await mkdir(output, { recursive: true });
  profile = await mkdtemp(join(tmpdir(), 'atlas-signal-r2-chrome-'));
  downloadDir = join(profile, 'downloads');
  await mkdir(downloadDir, { recursive: true });
  // Shared transport/lifecycle (#149): static server, Chrome spawn, CDP
  // session, bounded commands, socket-exit rejection and phase timings.
  // This suite keeps its own timeout wording, error-only console capture,
  // favicon 204, served-entry shape and external-request tracking.
  transport = await launchBrowserTransport({
    root,
    profileDir: profile,
    server: { favicon204: true, contentTypes: mime,
      recordRequest: entry => served.push({ path: entry.status === 200 ? entry.path : entry.url, status: entry.status }) },
    session: { consoleTypes: ['error'], timeoutMessage: method => `CDP timed out: ${method}` },
  });
  address = transport.address;
  const session = await transport.connect({ exceptions, browserMessages: browserErrors,
    onEvent: message => {
      if (message.method === 'Network.requestWillBeSent') {
        const url = message.params.request.url;
        if (/^https?:/.test(url) && new URL(url).origin !== address) external.push(url);
      }
    } });
  const { command, evaluate, until } = session;
  async function press(key, code, keyCode) {
    const character = key === 'Enter' ? { text: '\r', unmodifiedText: '\r', nativeVirtualKeyCode: keyCode } : {};
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, ...character });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  }
  async function settle() {
    await evaluate(`(async () => {
      await document.fonts.ready;
      const initial = {left: scrollX, top: scrollY};
      for (const image of [...document.images].filter(image => !image.closest('details:not([open])') && image.getClientRects().length)) {
        // Reach native lazy images by scrolling; do not alter the loading policy.
        if (!image.complete || !image.naturalWidth) image.scrollIntoView({block:'center', behavior:'instant'});
        await Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('Image did not decode: ' + image.src)), 8000))]);
      }
      scrollTo({...initial, behavior:'instant'});
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    })()`);
  }
  async function settleWithoutPageCallbacks() {
    // The browser still performs native font/image loading when page JS is disabled.
    // Poll those states from Node; never wait on a Promise, timer or rAF in the page.
    const initial = await evaluate('({left: scrollX, top: scrollY})', false);
    await until(() => evaluate('document.fonts.status === "loaded" && document.fonts.check(\'16px "Atlas Geist"\')', false), 'No-JS self-hosted font did not load');
    const visibleIndices = await evaluate('[...document.images].flatMap((image, index) => !image.closest("details:not([open])") && image.getClientRects().length ? [index] : [])', false);
    for (const index of visibleIndices) {
      await evaluate(`document.images[${index}].scrollIntoView({block:'center', behavior:'instant'})`, false);
      await until(() => evaluate(`document.images[${index}].complete && document.images[${index}].naturalWidth > 0`, false), `No-JS image ${index} did not load`);
    }
    await evaluate(`scrollTo({left:${initial.left},top:${initial.top},behavior:'instant'})`, false);
    await until(() => evaluate(`Math.abs(scrollY - ${initial.top}) < 1 && Math.abs(scrollX - ${initial.left}) < 1`, false), 'No-JS inspection scroll did not restore');
    return visibleIndices.length;
  }
  async function navigate(withoutPageCallbacks = false) {
    const before = session.navigationCount;
    const beforeLoad = session.loadCount;
    const result = await command('Page.navigate', { url: address + galleryPath });
    assert.ok(!result.errorText, result.errorText);
    await until(() => Promise.resolve(session.navigationCount > before), 'Gallery navigation did not commit');
    await until(() => Promise.resolve(session.loadCount > beforeLoad), 'Gallery load event did not arrive');
    await until(() => evaluate("document.readyState === 'complete' && !!document.querySelector('main h1')", !withoutPageCallbacks), 'Gallery did not load');
    if (withoutPageCallbacks) return settleWithoutPageCallbacks();
    await settle();
  }
  capture = async (name, fullPage = false) => {
    const options = { format: 'png' };
    if (fullPage) {
      const size = (await command('Page.getLayoutMetrics')).cssContentSize;
      options.captureBeyondViewport = true;
      options.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
    }
    const result = await command('Page.captureScreenshot', options);
    await writeFile(join(output, name), Buffer.from(result.data, 'base64'));
    report.screenshots.push(name);
  };
  async function noOverflow(label) {
    const size = await evaluate('({ viewport: innerWidth, page: document.documentElement.scrollWidth })', false);
    assert.ok(size.page <= size.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(size)}`);
    return size;
  }
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
  await command('Network.setCacheDisabled', { cacheDisabled: true });
  report.browser = (await command('Browser.getVersion')).product;
  await command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });

  // Check the published bytes, not just the source manifest or a successful build.
  assert.equal(sha256(await readFile(join(sourceDir, 'manifest.json'))), report.manifest_sha256, 'Build preserves the reviewed manifest');
  for (const asset of manifest.assets) {
    assert.equal(asset.file, basename(asset.file), 'Asset files must remain inside this study directory');
    assert.match(asset.file, /^[a-z0-9-]+\.svg$/, 'Unexpected asset filename');
    const source = await readFile(join(sourceDir, asset.file));
    const response = await fetch(address + assetPath + asset.file);
    assert.equal(response.status, 200, `Published asset missing: ${asset.file}`);
    const published = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(published, source, `Published SVG differs from source: ${asset.file}`);
    assert.equal(sha256(published), asset.sha256, `Manifest hash differs: ${asset.file}`);
    report.assets.push({ file: asset.file, sha256: asset.sha256, bytes: source.length });
  }
  report.checks.published_asset_hashes = 'passed';

  for (const viewport of [{ width: 1440, height: 1040 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await command('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 600 });
    await navigate();
    const size = await noOverflow(`${viewport.width}px gallery`);
    const images = await evaluate('[...document.images].filter(image => !image.closest("details:not([open])") && image.getClientRects().length).map(image => ({ file: new URL(image.currentSrc).pathname, decoded: image.complete && image.naturalWidth > 0, alt: image.getAttribute("alt") }))');
    assert.ok(images.length >= 6, 'The gallery must display every construction');
    assert.ok(images.every(image => image.decoded), 'All gallery images decode');
    assert.ok(images.every(image => image.alt !== null), 'Every meaningful image has an alt; decoration can use an empty alt');
    assert.match(await evaluate('getComputedStyle(document.body).fontFamily'), /Atlas Geist/, 'Gallery consumes self-hosted Atlas Geist');
    assert.equal(await evaluate('document.fonts.check(\'16px "Atlas Geist"\')'), true, 'Self-hosted Geist has loaded');
    report.viewports.push({ ...viewport, scroll_width: size.page, visible_images_decoded: images.length });
    await capture(`signal-r2-${viewport.width}-viewport.png`);
    await capture(`signal-r2-${viewport.width}-full.png`, true);
    if (viewport.width < 600 && await evaluate('!!document.querySelector("details > summary")')) {
      await evaluate('document.querySelector("details > summary").focus()');
      await press('Enter', 'Enter', 13);
      await until(() => evaluate('document.querySelector("details").open'), 'Mobile theme details did not open');
      await settle();
      await noOverflow(`${viewport.width}px expanded theme details`);
      await evaluate('document.querySelector("details").scrollIntoView({block:"start", behavior:"instant"})');
      await capture(`signal-r2-${viewport.width}-expanded-themes.png`);
      await press('Enter', 'Enter', 13);
      await until(() => evaluate('!document.querySelector("details").open'), 'Mobile theme details did not close');
    }
  }
  report.checks.responsive_images_and_fonts = 'passed';

  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1040, deviceScaleFactor: 1, mobile: false });
  await navigate();
  // Verify native keyboard access and a visible focus treatment with real Tab input.
  await press('Tab', 'Tab', 9);
  const focus = await evaluate(`(() => {
    const element = document.activeElement, style = getComputedStyle(element), rect = element.getBoundingClientRect();
    return { tag: element.tagName, visible: element.matches(':focus-visible'), outline: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth), boxShadow: style.boxShadow, width: rect.width, height: rect.height,
      name: element.textContent.trim(), top: rect.top, bottom: rect.bottom, viewport: innerHeight };
  })()`);
  assert.ok(['A', 'SUMMARY', 'BUTTON'].includes(focus.tag), 'Tab reaches a semantic interactive element');
  assert.ok(focus.visible && ((focus.outline !== 'none' && focus.outlineWidth > 0) || focus.boxShadow !== 'none'), 'Keyboard focus is visibly drawn');
  assert.ok(focus.width > 0 && focus.height > 0 && focus.top >= 0 && focus.bottom <= focus.viewport, 'Focused control is visible in the viewport');
  await capture('signal-r2-keyboard-focus.png');
  report.checks.native_keyboard_focus = 'passed';

  const summaries = await evaluate('document.querySelectorAll("details > summary").length');
  for (let index = 0; index < summaries; index++) {
    await evaluate(`document.querySelectorAll('details > summary')[${index}].focus()`);
    const before = await evaluate(`document.querySelectorAll('details')[${index}].open`);
    await press('Enter', 'Enter', 13);
    await until(() => evaluate(`document.querySelectorAll('details')[${index}].open !== ${before}`), 'Native details did not toggle with Enter');
  }
  await settle();
  await noOverflow('Expanded specimen details');
  assert.equal(await evaluate('[...document.images].every(image => image.complete && image.naturalWidth > 0)'), true, 'Expanded gallery decodes every theme');
  await capture('signal-r2-expanded-themes.png', true);
  report.checks.native_details = summaries ? `passed (${summaries})` : 'not applicable';

  const localLinks = await evaluate('[...document.querySelectorAll("a[href]")].map(link => ({ href: link.href, download: link.hasAttribute("download") }))');
  const svgLinks = new Set(localLinks.filter(link => link.download && link.href.endsWith('.svg')).map(link => new URL(link.href).pathname));
  for (const asset of manifest.assets) assert.ok(svgLinks.has(assetPath + asset.file), `No download link for ${asset.file}`);
  for (const link of localLinks) {
    const url = new URL(link.href);
    if (url.origin !== address) continue;
    if (url.pathname === galleryPath && url.hash) {
      assert.equal(await evaluate(`!!document.getElementById(${JSON.stringify(decodeURIComponent(url.hash.slice(1)))})`), true, `Broken section link: ${url.hash}`);
      continue;
    }
    const response = await fetch(url);
    assert.equal(response.status, 200, `Missing local gallery destination: ${url.pathname}`);
  }
  report.checks.local_links_and_18_downloads = 'passed';

  // One real browser download checks the delivery affordance; all 18 bytes were checked above.
  const downloadLink = await evaluate(`(() => {
    const link = document.querySelector('a[download][href$=".svg"]');
    link.scrollIntoView({block:'center', behavior:'instant'}); link.focus();
    return { href: link.href, filename: new URL(link.href).pathname.split('/').pop() };
  })()`);
  await press('Enter', 'Enter', 13);
  const saved = await until(() => readFile(join(downloadDir, downloadLink.filename)), 'Native SVG download did not finish');
  assert.equal(sha256(saved), manifest.assets.find(asset => asset.file === downloadLink.filename).sha256, 'Native downloaded SVG matches the reviewed file');
  report.checks.native_browser_download = { status: 'passed', file: downloadLink.filename, sha256: sha256(saved) };

  const smallCount = await evaluate('document.querySelectorAll("[data-review-small]").length');
  assert.ok(smallCount >= 2, 'Expose both mark and editorial minimum-size review specimens');
  for (let index = 0; index < smallCount; index++) {
    await evaluate(`document.querySelectorAll('[data-review-small]')[${index}].scrollIntoView({block:'center', behavior:'instant'})`);
    await settle();
    await capture(`signal-r2-small-specimens-${index + 1}.png`);
  }
  const smallWidths = await evaluate('[...document.querySelectorAll("[data-review-small] img")].map(image => Math.round(image.getBoundingClientRect().width))');
  assert.ok(smallWidths.includes(32), 'Review contains a true 32 CSS-pixel mark');
  assert.ok(smallWidths.includes(160), 'Review contains a true 160 CSS-pixel editorial object');
  report.checks.actual_minimum_size_specimens = { status: 'passed', widths: [...new Set(smallWidths)] };

  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate();
  assert.equal(await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
  assert.equal(await evaluate('document.getAnimations().filter(animation => animation.playState === "running").length'), 0, 'Reduced-motion page has no ongoing animation');
  await noOverflow('Reduced-motion mobile');
  await capture('signal-r2-reduced-motion.png');
  report.checks.reduced_motion = 'passed';
  const expectedText = await evaluate('document.querySelector("main").innerText');
  await command('Emulation.setScriptExecutionDisabled', { value: true });
  const noJsImages = await navigate(true);
  assert.equal(await evaluate('document.querySelector("main").innerText', false), expectedText, 'No-JS mode retains all initial gallery copy');
  assert.equal(await evaluate(`document.querySelectorAll('a[download][href$=".svg"]').length`, false), 18, 'No-JS mode retains all 18 SVG downloads');
  await noOverflow('No-JS mobile');
  await capture('signal-r2-no-js.png');
  let noJsDetails = 'not applicable';
  if (await evaluate('!!document.querySelector("details > summary")', false)) {
    await evaluate('document.querySelector("details > summary").focus()', false);
    await press('Enter', 'Enter', 13);
    await until(() => evaluate('document.querySelector("details").open', false), 'No-JS native details did not open');
    await settleWithoutPageCallbacks();
    await noOverflow('No-JS expanded mobile details');
    await evaluate('document.querySelector("details").scrollIntoView({block:"start", behavior:"instant"})', false);
    await capture('signal-r2-no-js-expanded-themes.png');
    noJsDetails = 'passed';
  }
  report.checks.no_javascript = { status: 'passed', visible_images_loaded: noJsImages, native_details: noJsDetails };

  assert.deepEqual(external, [], 'Gallery resources must remain self-hosted');
  assert.deepEqual(exceptions, [], 'No browser exceptions');
  assert.deepEqual(browserErrors, [], 'No browser errors');
  assert.deepEqual(served.filter(item => item.status !== 200), [], 'No missing local assets or destinations');
  report.checks.self_hosted_resources_and_errors = 'passed';
  report.status = 'passed';
  console.log('Phase timings:', JSON.stringify(transport.timings.summary()));
  console.log(`Signal r2 browser acceptance passed: 18 hash-verified SVGs; 1440/390/320px; images/fonts; local links; keyboard; native download; minimum-size specimens; reduced motion; no JS. Evidence: ${output}`);
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  report.diagnostics = { external, exceptions, browserErrors, missing: served.filter(item => item.status !== 200), chromeLog: transport?.chromeLog() ?? '' };
  await capture('signal-r2-failed.png').catch(() => {});
  throw error;
} finally {
  try {
    await writeFile(join(output, 'browser-review.json'), JSON.stringify(report, null, 2) + '\n');
  } finally {
    await transport?.close();
  }
}
