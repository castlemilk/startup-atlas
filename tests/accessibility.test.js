import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

// Automated accessibility checks for #93 (UX-05), slice (1): the static DOM
// of every shipped app page must satisfy the baseline invariants a keyboard
// or screen-reader user depends on before any JS runs — a declared language,
// a title, exactly one h1, a main landmark, a skip link, no skipped heading
// levels, images with alt attributes, controls with labels, buttons and
// links with discernible names, no positive tabindex and no duplicate ids.
// The design-* pages are design-lab specimens, not the app surface, and are
// out of scope. Manual keyboard/screen-reader journeys remain open on #93.

const rootUrl = new URL('../', import.meta.url);
const APP_PAGES = [
  'index.html',
  'list.html',
  'partner.html',
  'entity.html',
  'graph.html',
  'treemap.html',
  'query.html',
];

async function loadPage(page) {
  const html = await readFile(new URL(`web/${page}`, rootUrl), 'utf8');
  return new JSDOM(html).window.document;
}

function accessibleName(el) {
  return (
    el.getAttribute('aria-label') ||
    el.getAttribute('aria-labelledby') ||
    el.getAttribute('title') ||
    el.textContent ||
    ''
  ).trim();
}

for (const page of APP_PAGES) {
  test(`${page}: baseline accessibility invariants`, async () => {
    const doc = await loadPage(page);
    const problems = [];

    if (!doc.documentElement.getAttribute('lang')) {
      problems.push('missing lang attribute on <html>');
    }
    const title = doc.querySelector('title');
    if (!title || !title.textContent.trim()) problems.push('missing or empty <title>');

    const h1s = doc.querySelectorAll('h1');
    if (h1s.length !== 1) problems.push(`expected exactly one <h1>, found ${h1s.length}`);

    if (!doc.querySelector('main, [role="main"]')) problems.push('no <main> landmark');
    const skipLink = [...doc.querySelectorAll('a[href^="#"]')].find((a) =>
      /skip/i.test(a.textContent),
    );
    if (!skipLink) problems.push('no skip link');

    let lastLevel = 0;
    for (const heading of doc.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const level = Number(heading.tagName[1]);
      if (level > lastLevel + 1) {
        problems.push(
          `heading level skips from h${lastLevel} to h${level} ("${heading.textContent.trim().slice(0, 40)}")`,
        );
      }
      lastLevel = Math.max(lastLevel, level);
    }

    for (const img of doc.querySelectorAll('img')) {
      if (!img.hasAttribute('alt')) {
        problems.push(`<img> without alt attribute: ${img.getAttribute('src')?.slice(0, 60)}`);
      }
    }

    for (const button of doc.querySelectorAll('button')) {
      if (!accessibleName(button)) {
        problems.push(`<button> without accessible name: ${button.outerHTML.slice(0, 80)}`);
      }
    }

    for (const link of doc.querySelectorAll('a')) {
      const namedImage = link.querySelector('img[alt]:not([alt=""])');
      if (!accessibleName(link) && !namedImage) {
        problems.push(`<a> without discernible text: ${link.outerHTML.slice(0, 80)}`);
      }
    }

    for (const control of doc.querySelectorAll('input, select, textarea')) {
      const id = control.getAttribute('id');
      const labelled =
        control.getAttribute('aria-label') ||
        control.getAttribute('aria-labelledby') ||
        (id && doc.querySelector(`label[for="${id}"]`)) ||
        control.closest('label');
      if (!labelled) {
        problems.push(`form control without a label: ${control.outerHTML.slice(0, 80)}`);
      }
    }

    for (const el of doc.querySelectorAll('[tabindex]')) {
      if (Number(el.getAttribute('tabindex')) > 0) {
        problems.push(`positive tabindex: ${el.outerHTML.slice(0, 60)}`);
      }
    }

    const ids = new Map();
    for (const el of doc.querySelectorAll('[id]')) {
      ids.set(el.id, (ids.get(el.id) || 0) + 1);
    }
    for (const [id, count] of ids) {
      if (count > 1) problems.push(`duplicate id "${id}" (${count} occurrences)`);
    }

    assert.deepEqual(problems, []);
  });
}
