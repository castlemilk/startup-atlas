import { sourceUrl } from './logic.js';
import { logoClassFor, logoFor, paddedCanvaMark } from './logos.js';

const localArtwork = /^\.\/assets\/(?:logos\/[a-z0-9-]+\.(?:svg|png)|portraits\/[a-z0-9-]+\.(?:png|jpe?g|webp))$/i;
const launchVicWordmark = 'https://assets.launchvic.org/app/uploads/2026/01/15165324/logo-footer.svg';

export function graphArtwork(entity) {
  const portrait = entity.kind === 'person';
  const url = (localArtwork.test(entity.logo) ? entity.logo : sourceUrl(entity.logo)) ||
    (!portrait && logoFor(entity.name)) || '';
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
