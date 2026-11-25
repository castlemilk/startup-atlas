// Pure helpers for the Loom atlas explorer wiring (web/graph-atlas.js).
// Kept free of loom-core and DOM imports so the URL mapping, topic model
// and reader-fallback policy can be unit-tested in Node.

/** Resolve the published atlas files against the page/module base URL. */
export function atlasManifestUrls(manifest, base) {
  return {
    database: new URL(`data/${manifest.database}`, base).href,
    full: new URL(`data/${manifest.full}`, base).href,
  };
}

/** The SQLite worker and WASM vendored from loom-core by scripts/build.mjs. */
export function atlasRuntimeUrls(base) {
  return {
    worker: new URL('vendor/atlas-runtime/sqlite.worker.js', base).href,
    wasm: new URL('vendor/atlas-runtime/sql-wasm.wasm', base).href,
  };
}

/** Topic switcher model: one entry per manifest topic, in manifest order. */
export function topicSummaries(manifest) {
  return (manifest?.topics ?? []).map(topic => ({
    id: topic.id,
    label: topic.label,
    count: topic.count,
  }));
}

/** The topic opened on first mount: the largest, so the map is not empty. */
export function initialTopic(manifest) {
  const topics = manifest?.topics ?? [];
  if (!topics.length) return null;
  return topics.reduce((largest, topic) => (topic.count > largest.count ? topic : largest)).id;
}

/**
 * Reader fallback policy: a failed on-demand (SQLite/WASM range-read)
 * load retries once through the full JSON reader; a failed full load is
 * terminal and the caller falls back to the full-graph explorer.
 */
export function nextLoadingMode(mode, hasError) {
  return hasError && mode === 'on-demand' ? 'full' : null;
}

/** Readout line for a picked atlas node (topic hub or article). */
export function pickSummary(node, manifest) {
  if (!node) return '';
  if (node.kind === 'topic') return `${node.label} — use the topic buttons to open or close it.`;
  const topic = (manifest?.topics ?? []).find(entry => entry.id === node.topic);
  return topic ? `${node.label} · ${topic.label}` : String(node.label ?? '');
}
