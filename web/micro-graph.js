// Depth-1 micro knowledge graph model for profile pages (issue #419).
// Neighbours come only from reviewed edges in the published graph snapshot;
// the strongest edge per neighbour (confidence, then verification recency)
// decides ordering and the label shown, exactly as the Relationships list
// beneath it presents the same records in full.

export const MICRO_GRAPH_CAP = 12;

const EDGE_KIND_LABELS = {
  founded: 'Founded',
  supports: 'Supports',
  listed_in_portfolio: 'Portfolio',
  offers: 'Offers',
  programme_relationship: 'Programme',
  supports_programme: 'Supports programme',
  participated_in: 'Participated in',
  led_round: 'Led round',
  team_member: 'Team',
  employment: 'Team',
  member_of_network: 'Network member',
  subsidiary_of: 'Subsidiary',
  integrates_with: 'Integrates with'
};

export const edgeKindLabel = kind => EDGE_KIND_LABELS[kind] || 'Connected';

const edgeStrength = edge => [
  typeof edge.confidence === 'number' ? edge.confidence : -1,
  typeof edge.last_verified === 'string' ? edge.last_verified : ''
];

function stronger(a, b) {
  const [ac, av] = edgeStrength(a);
  const [bc, bv] = edgeStrength(b);
  return ac > bc || (ac === bc && av > bv) ? a : b;
}

// Returns { center, neighbours, total, overflow } where neighbours are the
// capped, ordered depth-1 records: { entity, edge, kinds } — `edge` is the
// strongest edge to that neighbour and `kinds` every recorded kind for it.
export function microGraphNeighbours(graph, rootId, cap = MICRO_GRAPH_CAP) {
  const byId = new Map(graph.entities.map(item => [item.id, item]));
  const center = byId.get(rootId);
  if (!center) throw new Error('Entity not found');
  const best = new Map();
  for (const edge of graph.edges) {
    const otherId = edge.from === rootId ? edge.to : edge.to === rootId ? edge.from : null;
    if (!otherId || otherId === rootId || !byId.has(otherId)) continue;
    const entry = best.get(otherId) || { entity: byId.get(otherId), edge, kinds: new Set() };
    entry.edge = stronger(entry.edge, edge);
    entry.kinds.add(edge.kind);
    best.set(otherId, entry);
  }
  const ordered = [...best.values()].sort((a, b) => {
    const [ac, av] = edgeStrength(a.edge);
    const [bc, bv] = edgeStrength(b.edge);
    return bc - ac || bv.localeCompare(av) || a.entity.name.localeCompare(b.entity.name);
  });
  return {
    center,
    neighbours: ordered.slice(0, cap).map(({ entity, edge, kinds }) => ({ entity, edge, kinds: [...kinds] })),
    total: ordered.length,
    overflow: Math.max(0, ordered.length - cap)
  };
}

// Simple radial layout: neighbours evenly spaced on an ellipse around the
// centre, starting at the top. Coordinates suit a 360x260 viewBox.
export function microGraphLayout(count, { width = 360, height = 260 } = {}) {
  const cx = width / 2;
  const cy = height / 2;
  if (count < 1) return { center: { x: cx, y: cy }, points: [] };
  const rx = width / 2 - 46;
  const ry = height / 2 - 40;
  const points = Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return { x: Math.round((cx + rx * Math.cos(angle)) * 10) / 10, y: Math.round((cy + ry * Math.sin(angle)) * 10) / 10 };
  });
  return { center: { x: cx, y: cy }, points };
}
