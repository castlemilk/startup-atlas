import { createAtlas, createFullAtlasReader } from 'loom-core/atlas';
import { mountAtlasMap } from 'loom-core/atlas-map';
import { createSQLiteAtlasReader } from 'loom-core/atlas-sqlite';
import { atlasManifestUrls, atlasRuntimeUrls, initialTopic, nextLoadingMode, pickSummary, topicSummaries } from './graph-atlas-model.js';

// On-demand atlas wiring for the graph explorer (issue #367). The build
// publishes a Loom atlas export next to the other data files
// (scripts/build-loom-atlas.py): a manifest, a range-readable SQLite
// database and a full JSON fallback. This module loads the manifest,
// creates the atlas with the SQLite reader (full JSON reader as the
// transport fallback) and mounts Loom's atlas map. Any failure rejects,
// and web/graph.js then keeps the section hidden — the existing
// full-graph explorer (graph-loom.js createWireGraph, or the SVG map)
// remains the fallback until this path is verified live on Pages.

function atlasTheme(canvas, manifest) {
  const style = getComputedStyle(canvas);
  const color = name => style.getPropertyValue(`--atlas-${name}`).trim();
  const topicColor = new Map(manifest.topics.map(topic => [topic.id, topic.color]));
  return {
    kind: {}, ink: color('ink'), dim: color('muted'), bg: color('paper'), accent: color('action'),
    bezel: color('border'), font: style.getPropertyValue('--atlas-font-body'), fontSize: 15,
    radii: { hub: 27, content: 19 }, plateAlpha: .94,
    nodes: {
      artwork: false, fill: .82,
      resolve: node => node.kind === 'topic'
        ? { shape: 'rounded-square', radius: 30, color: topicColor.get(node.topic) }
        : { shape: 'circle', radius: 11, color: topicColor.get(node.topic) },
    },
    wires: { routing: 'patch', color: color('border-strong'), width: 1.4, opacity: .7, hotWidth: 2.4 },
    labels: { visibility: 'auto' },
  };
}

export async function mountAtlasExplorer({ canvas, topicsHost, reveal, onStatus, onPick }) {
  const base = import.meta.url;
  const response = await fetch(new URL('data/loom-atlas-manifest.json', base));
  if (!response.ok) throw new Error(`Atlas manifest returned HTTP ${response.status}`);
  const manifest = await response.json();
  if (!Array.isArray(manifest.topics) || !manifest.topics.length) {
    throw new Error('Atlas manifest lists no topics');
  }
  const data = atlasManifestUrls(manifest, base);
  const runtime = atlasRuntimeUrls(base);
  const atlas = createAtlas(manifest, {
    'on-demand': () => createSQLiteAtlasReader({
      database: data.database,
      databaseBytes: manifest.databaseBytes,
      pageSize: manifest.pageSize,
      worker: runtime.worker,
      wasm: runtime.wasm,
    }),
    full: () => createFullAtlasReader(data.full),
  });

  // Topic switcher: real buttons mirroring the atlas expansion state, so
  // topic switching works without relying on canvas gestures alone.
  const buttons = new Map();
  for (const topic of topicSummaries(manifest)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'graph-atlas-topic';
    button.dataset.topic = String(topic.id);
    button.setAttribute('aria-pressed', 'false');
    button.textContent = `${topic.label} ${topic.count}`;
    button.setAttribute('aria-label', `Open ${topic.label}, ${topic.count} entries`);
    button.addEventListener('click', () => { atlas.toggle(topic.id).catch(() => {}); });
    topicsHost.append(button);
    buttons.set(topic.id, button);
  }

  let fellBack = false;
  let destroyed = false;
  const unsubscribe = atlas.subscribe(() => {
    if (destroyed) return;
    const snapshot = atlas.getSnapshot();
    for (const [id, button] of buttons) {
      button.setAttribute('aria-pressed', String(snapshot.expanded.includes(id)));
    }
    const next = nextLoadingMode(snapshot.mode, Boolean(snapshot.error));
    if (next && !fellBack) {
      fellBack = true;
      onStatus?.('On-demand atlas loading failed; retrying with the full atlas download.');
      atlas.setLoading(next).catch(() => {});
    } else if (snapshot.error) {
      onStatus?.('The atlas overview could not be loaded.');
    } else {
      const { reads } = snapshot;
      onStatus?.(snapshot.loaded.length
        ? `${snapshot.loaded.length} of ${manifest.topics.length} topics open · ${reads.requests} reads, ${Math.round(reads.bytes / 1024)} KB transferred.`
        : 'Open a topic to load its entries on demand.');
    }
  });

  reveal?.();
  let map;
  try {
    map = mountAtlasMap(canvas, atlas, {
      theme: atlasTheme(canvas, manifest),
      keepView: true,
      onPick: node => onPick?.(pickSummary(node, manifest)),
    });
  } catch (error) {
    unsubscribe();
    atlas.close();
    topicsHost.replaceChildren();
    throw error;
  }
  const first = initialTopic(manifest);
  if (first !== null) atlas.toggle(first).catch(() => {});

  return {
    atlas,
    map,
    destroy() {
      destroyed = true;
      unsubscribe();
      map.destroy();
      atlas.close();
      topicsHost.replaceChildren();
    },
  };
}
