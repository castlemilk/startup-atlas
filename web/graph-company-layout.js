export const companyCaptionHeight = 44;
const inset = 8;

function fixedLayout(width, height, zoom, positions) {
  return { height, anchor: node => positions.get(node.id),
    viewport: { x: width / (2 * zoom), y: height / (2 * zoom), z: 0, zoom } };
}

function readingLayout(nodes, width) {
  const minColumn = width < 325 ? 84 : width < 550 ? 102 : 140;
  const columns = Math.min(nodes.length, Math.max(1, Math.floor((width - 2 * inset) / minColumn)));
  const cell = (width - 2 * inset) / columns, rowHeight = 104;
  const positions = new Map();
  nodes.forEach((node, index) => {
    const row = Math.floor(index / columns);
    const count = Math.min(columns, nodes.length - row * columns);
    positions.set(node.id, { x: width / 2 + (index % columns - (count - 1) / 2) * cell,
      y: inset + 26 + row * rowHeight, z: 0 });
  });
  const height = Math.ceil(nodes.length / columns) * rowHeight + 2 * inset;
  return { ...fixedLayout(width, height, 1, positions), labelWidth: cell - 10 };
}

function packGroups(groups, columns) {
  const rows = [];
  let row = [];
  for (const group of groups) {
    if (group[1].length > 12) {
      rows.push([group]);
      row = [];
      continue;
    }
    if (!row.length || row.length === columns) { row = []; rows.push(row); }
    row.push(group);
  }
  return rows;
}

export function companyLayout(groups, nodes, width, reading) {
  if (reading) return readingLayout(nodes, width);
  // Reserve a caption and a separate marker area in each group at Fit.
  const wide = width >= 1050;
  const zoom = wide ? .57 : .35, gap = 12;
  const markerStep = wide ? 42 : 23, lineStep = wide ? 52 : 23;
  const columns = width < 430 ? 2 : width < 740 ? 3 : 4;
  const rows = packGroups(groups, columns);
  const positions = new Map(), captions = new Map();
  let top = inset;
  for (const row of rows) {
    const slotWidth = (width - 2 * inset - (row.length - 1) * gap) / row.length;
    const capacity = Math.max(1, Math.floor((slotWidth - 36) / markerStep) + 1);
    let bodyHeight = 0;
    row.forEach(([id, companies], column) => {
      const left = inset + column * (slotWidth + gap);
      const captionWidth = wide ? Math.min(slotWidth, 280) : slotWidth;
      captions.set(id, { x: left + (slotWidth - captionWidth) / 2, y: top, width: captionWidth });
      const across = Math.min(capacity, companies.length, Math.ceil(Math.sqrt(companies.length * (row.length === 1 ? 3.6 : 2.6))));
      const lines = Math.ceil(companies.length / across);
      companies.forEach((company, index) => {
        const line = Math.floor(index / across), count = Math.min(across, companies.length - line * across);
        positions.set(company.id, { x: (left + slotWidth / 2 + (index % across - (count - 1) / 2) * markerStep) / zoom,
          y: (top + companyCaptionHeight + (wide ? 30 : 23) + line * lineStep) / zoom, z: 0 });
      });
      bodyHeight = Math.max(bodyHeight, (wide ? 74 : 42) + (lines - 1) * lineStep);
    });
    top += companyCaptionHeight + bodyHeight + gap;
  }
  const height = top - gap + inset;
  return { ...fixedLayout(width, height, zoom, positions), captions, showNames: wide };
}
