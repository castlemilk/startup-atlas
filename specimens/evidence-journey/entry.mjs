import fixtures from './fixtures.json' with { type: 'json' };
import { mountDemo } from './demo.mjs';
import { installAtlasSDK } from '../../web/atlas-sdk.js';

const root = document.querySelector('[data-evidence-journey]');
const demo = mountDemo(root, fixtures, { selectFirst: true });
const sdk = installAtlasSDK(document);
window.addEventListener('pagehide', () => { demo.destroy(); sdk.destroy(); }, { once: true });
