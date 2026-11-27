import { sourceUrl } from './logic.js';
import { logoClassFor, logoFor, paddedCanvaMark } from './logos.js';

const localArtwork = /^\.\/assets\/(?:logos\/[a-z0-9-]+\.(?:svg|png)|portraits\/[a-z0-9-]+\.(?:png|jpe?g|webp))$/i;
const atlasPages = 'https://castlemilk.github.io/startup-atlas/';
const launchVicWordmark = 'https://assets.launchvic.org/app/uploads/2026/01/15165324/logo-footer.svg';

function artworkUrl(value) {
  if (localArtwork.test(value)) return value;
  const url = sourceUrl(value);
  if (url?.startsWith(atlasPages)) {
    const relative = './' + url.slice(atlasPages.length);
    if (localArtwork.test(relative)) return relative;
  }
  return url;
}

export function graphArtwork(entity) {
  const portrait = entity.kind === 'person';
  // A reviewed bundled mark (web/logos.js) wins over the graph node's logo
  // field: node logos are source URLs recorded as evidence (e.g. partner
  // records since #644), while logos.js entries are the published local
  // copies the site is meant to serve. Portraits never use logoFor.
  const url = (!portrait && logoFor(entity.name)) || artworkUrl(entity.logo) || '';
  const treatment = url === launchVicWordmark ? 'logo-on-dark logo-wide' : !portrait && url ? logoClassFor(entity.name) : '';
  const classes = [portrait && 'person', treatment, paddedCanvaMark(url) && 'padded-mark'].filter(Boolean).join(' ');
  return { url, classes, portrait };
}

export function graphInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
}

export function showGraphArtwork(img, initials) {
  function loaded() {
    img.parentElement.dataset.logo = 'loaded';
    initials.hidden = true;
  }
  function failed() {
    img.parentElement.dataset.logo = 'unavailable';
    img.hidden = true;
    initials.hidden = false;
  }
  if (img.complete) {
    if (img.naturalWidth) loaded();
    else failed();
  } else {
    img.addEventListener('load', loaded, { once: true });
    img.addEventListener('error', failed, { once: true });
  }
}
