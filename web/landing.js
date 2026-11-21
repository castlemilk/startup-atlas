import { legacyListUrl } from './atlas-exploration.js';

// Preserve directory links shared before the landing and List became separate pages.
const list=legacyListUrl(new URL(location.href));
if (list) location.replace(list);
