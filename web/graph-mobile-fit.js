import { graphOrigin } from './graph-layout.js';
import { sourceUrl } from './logic.js';

export const mobileFit = {
  media: '(max-width: 620px), (max-width: 920px) and (max-height: 540px)',
  busyAfter: 12,
  neighbours: 5,
  rowSpacing: 52,
  labelHeight: 46,
  inset: 12,
  labelGap: 6,
  maxWidth: 520,
  rootRadius: 23,
  neighbourRadius: 16
};

export function mainConnections(view, root) {
  if (view.nodes.length <= mobileFit.busyAfter) return null;

  const direct = view.edges.filter(edge =>
    (edge.from === root || edge.to === root) && sourceUrl(edge.source));
  const relationship = new Map();
  for (const edge of direct) {
    const other = edge.from === root ? edge.to : edge.from;
    if (!relationship.has(other) || edge.kind === 'founded') relationship.set(other, edge.kind);
  }

  const groups = new Map();
  for (const node of view.nodes) {
    if (node.level !== 1 || !relationship.has(node.id)) continue;
    const kind = relationship.get(node.id);
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(node);
  }
  const buckets = [...groups].sort(([a], [b]) => Number(b === 'founded') - Number(a === 'founded'));
  const neighbours = [];
  // Each recorded relationship kind gets a turn before a kind repeats.
  for (let row = 0; row < mobileFit.neighbours && neighbours.length < mobileFit.neighbours; row++) {
    for (const [, nodes] of buckets) {
      if (nodes[row]) neighbours.push(nodes[row]);
      if (neighbours.length === mobileFit.neighbours) break;
    }
  }
  if (!neighbours.length) return null;

  const ids = new Set(neighbours.map(node => node.id));
  return {
    nodes: [view.nodes.find(node => node.id === root), ...neighbours],
    edges: direct.filter(edge => ids.has(edge.from) || ids.has(edge.to))
  };
}

export function mobileFitHeight(neighbours) {
  return neighbours * mobileFit.rowSpacing + mobileFit.inset * 2;
}

function columns(width) {
  const span = Math.min(width, mobileFit.maxWidth) - 2 * mobileFit.inset;
  const left = (width - span) / 2;
  return { left, right: left + span, rootX: left + .21 * span, neighbourX: left + .49 * span };
}

export function mobileFitPositions(nodes, width) {
  const { rootX, neighbourX } = columns(width);
  // The flat Loom camera at zoom 1 projects one world unit to one CSS pixel.
  return nodes.map((node, i) => ({ ...node,
    x: graphOrigin.x + (i === 0 ? rootX : neighbourX) - width / 2,
    y: graphOrigin.y + (i === 0 ? 0 : (i - nodes.length / 2) * mobileFit.rowSpacing)
  }));
}

export function mobileFitLabel({ x, y, radius, item }, width) {
  const { left, right } = columns(width);
  const { labelGap, labelHeight } = mobileFit;
  if (item.node.level === 0) {
    const end = x + radius - 4;
    const start = Math.max(left, end - 116);
    return { x: start, y: y + radius + labelGap, width: end - start, height: labelHeight };
  }
  const start = x + radius + labelGap;
  return { x: start, y: y - labelHeight / 2, width: right - start, height: labelHeight };
}
