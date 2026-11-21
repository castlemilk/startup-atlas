import { createWireGraph } from 'loom-core/wires';
import { graphOrigin, layoutNetwork } from './graph-layout.js';
import { mobileFit, mobileFitLabel, mobileFitPositions } from './graph-mobile-fit.js';
import { logoClassFor, paddedCanvaMark } from './logos.js';

const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const labelHeight = 24;
const labelGap = 5;
const frameInset = 6;

function arrangeNodes(view, root, canvas, dense) {
  const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  if (canvas.clientWidth >= 520 && aspect >= 1.55 && view.nodes.length <= 10) {
    return layoutNetwork(view, root).nodes;
  }
  const rings = new Map();
  const origin = view.nodes.find(node => node.id === root);
  for (const node of view.nodes) {
    if (node === origin) continue;
    if (!rings.has(node.level)) rings.set(node.level, []);
    rings.get(node.level).push(node);
  }
  const spread = Math.max(.9, Math.min(aspect, 1.48));
  const arranged = [{ ...origin, ...graphOrigin }];
  let ring = 0;
  for (const members of rings.values()) {
    let offset = 0;
    while (offset < members.length) {
      const count = Math.min(members.length - offset, 6 + ring * 7);
      const radius = dense ? 232 + ring * 60 : 132 + ring * 94;
      const step = 2 * Math.PI / count;
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (i + (ring % 2) / 2) * step;
        arranged.push({ ...members[offset + i], x: graphOrigin.x + Math.cos(angle) * radius * spread,
          y: graphOrigin.y + Math.sin(angle) * radius });
      }
      offset += count;
      ring++;
    }
  }
  return arranged;
}

function marking(node, image) {
  const mark = document.createElement('span');
  mark.className = `network-loom-mark ${logoClassFor(node.name)}`;
  mark.setAttribute('aria-hidden', 'true');
  const letters = document.createElement('span');
  letters.textContent = node.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  mark.append(letters);
  const url = image(node);
  if (url) {
    mark.classList.toggle('padded-mark', paddedCanvaMark(url));
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.addEventListener('load', () => { mark.dataset.logo = 'loaded'; letters.hidden = true; }, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = url;
    mark.append(img);
  }
  return mark;
}

function overlaps(a, b) {
  return a.x < b.x + b.width + 3 && a.x + a.width + 3 > b.x &&
    a.y < b.y + b.height + 3 && a.y + a.height + 3 > b.y;
}

function hasLabelRoom(box, width, height, occupied, placed) {
  return box.x >= frameInset && box.y >= frameInset && box.x + box.width <= width - frameInset &&
    box.y + box.height <= height - frameInset && !occupied.some(node => overlaps(box, node)) &&
    !placed.some(label => overlaps(box, label));
}

function placeLabel(item, width, height, occupied, placed, textWidth) {
  const { x, y, radius } = item;
  const labelWidth = Math.min(textWidth, Math.max(72, Math.min(176, width * .48)));
  const centeredX = x - labelWidth / 2;
  const centeredY = y - labelHeight / 2;
  const bottom = y + radius + labelGap;
  const top = y - radius - labelGap - labelHeight;
  const right = x + radius + labelGap;
  const left = x - radius - labelGap - labelWidth;
  const clampX = value => Math.max(frameInset, Math.min(value, width - labelWidth - frameInset));
  const shift = Math.min(26, labelWidth / 3);
  const candidates = [[clampX(centeredX), bottom], [clampX(centeredX), top], [right, centeredY], [left, centeredY],
    [clampX(centeredX - shift), bottom], [clampX(centeredX + shift), bottom],
    [clampX(centeredX - shift), top], [clampX(centeredX + shift), top], [right, bottom], [left, bottom], [right, top], [left, top]];
  for (const [labelX, labelY] of candidates) {
    const box = { x: labelX, y: labelY, width: labelWidth, height: labelHeight };
    if (hasLabelRoom(box, width, height, occupied, placed)) return box;
  }
  return null;
}

function graphTheme(canvas, root, kinds, overview) {
  const style = getComputedStyle(canvas);
  const color = name => style.getPropertyValue(`--atlas-${name}`).trim();
  const kind = Object.fromEntries(kinds.map(name => [name, color(name)]));
  return {
    kind, ink: color('ink'), dim: color('muted'), bg: color('paper'), accent: color('action'),
    bezel: color('border'), font: style.getPropertyValue('--atlas-font-body'), fontSize: 15,
    radii: { hub: 27, content: 19 }, plateAlpha: .94,
    nodes: { artwork: false, fill: .82, resolve: node => ({
      shape: node.kind === 'person' ? 'circle' : 'rounded-square',
      radius: overview ? (node.id === root ? mobileFit.rootRadius : mobileFit.neighbourRadius) : (node.id === root ? 42 : 30),
      color: node.id === root ? color('ink') : kind[node.kind]
    }) },
    wires: { routing: 'patch', color: color('border-strong'), width: 1.3, opacity: .52, hotWidth: 2.2 },
    labels: { visibility: 'none' }
  };
}

export function mountLoom({ canvas, controls, view, root, dense, overview, kinds, pins, viewport, image, traverse, rememberPin, reportZoom }) {
  const anchors = overview ? mobileFitPositions(view.nodes, canvas.clientWidth) : arrangeNodes(view, root, canvas, dense);
  const nodes = anchors.map(node => ({ ...node, pinned: false }));
  const links = view.edges.map(edge => ({ source: edge.from, target: edge.to, kind: edge.kind }));
  const graph = createWireGraph(canvas, {
    nodes, links, theme: graphTheme(canvas, root, kinds, overview), sim: 'main',
    layout: { anchor: node => node, blend: 1, pinOnDrag: true },
    wireEffects: { direction: 'arrow', scope: dense ? 'selected' : 'all' }
  });
  function center(id) {
    const { x, y, z } = graph.getPosition(id);
    graph.setViewport({ ...graph.getViewport(), x, y, z });
  }
  canvas.tabIndex = -1;
  const controlsById = new Map(nodes.map(node => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'network-node';
    button.dataset.node = node.id;
    button.dataset.kind = node.kind;
    button.classList.toggle('is-root', node.id === root);
    button.setAttribute('aria-label', node.name);
    const mark = marking(node, image);
    const label = document.createElement('span');
    label.className = 'network-loom-label';
    const name = document.createElement('span');
    name.textContent = label.title = node.name;
    label.append(name);
    label.setAttribute('aria-hidden', 'true');
    label.hidden = true;
    button.append(mark, label);
    button.addEventListener('click', event => traverse(node.id, event.detail === 0));
    button.addEventListener('keydown', event => {
      const direction = steps[event.key];
      if (!direction) return;
      event.preventDefault();
      const current = graph.getPosition(node.id), step = event.shiftKey ? 50 : 20;
      const point = { x: current.x + direction[0] * step, y: current.y + direction[1] * step, z: current.z };
      graph.pin(node.id, point);
      rememberPin(node.id, point);
    });
    button.addEventListener('focus', () => {
      if (button.matches(':focus-visible')) {
        const r = button.getBoundingClientRect(), visible = canvas.getBoundingClientRect();
        if (r.left < visible.left + frameInset || r.right > visible.right - frameInset ||
            r.top < visible.top + frameInset || r.bottom > visible.bottom - frameInset) center(node.id);
      }
      graph.invalidate();
    });
    button.addEventListener('blur', () => graph.invalidate());
    const wrapper = document.createElement('ui-button');
    wrapper.append(button);
    return [node.id, { node, button, mark, label, wrapper }];
  }));
  controls.replaceChildren(...[...controlsById.values()].map(entry => entry.wrapper));
  for (const [id, point] of pins) if (controlsById.has(id)) graph.pin(id, point);
  function fitCamera() {
    if (overview && ![...pins.keys()].some(id => controlsById.has(id))) {
      graph.setViewport({ ...graph.getViewport(), ...graphOrigin, z: 0, zoom: 1 });
    } else {
      graph.fit(true);
    }
  }
  fitCamera();
  let fittedZoom = graph.getViewport().zoom;
  if (viewport) graph.setViewport({ ...viewport, zoom: fittedZoom * viewport.zoom });

  const measure = document.createElement('canvas').getContext('2d');
  const family = getComputedStyle(controls).getPropertyValue('--atlas-font-body');
  let selected, hovered, destroyed = false;
  function measureLabels() {
    if (measure) measure.font = `600 12px ${family}`;
    for (const item of controlsById.values()) item.textWidth = Math.ceil(measure?.measureText(item.node.name).width ?? item.node.name.length * 7) + 12;
  }
  measureLabels();
  document.fonts?.ready.then(() => { if (!destroyed) { measureLabels(); graph.invalidate(); } });

  function updateControls({ points, width, height, zoom }) {
    const occupied = [], placed = [], visible = [];
    const focused = document.activeElement?.dataset?.node;
    const shown = new Set();
    let i = 0;
    for (const item of controlsById.values()) {
      const { button, mark, node } = item;
      const x = points[i], y = points[i + 1], radius = Math.max(1, points[i + 2]);
      const hitRadius = Math.max(12, radius);
      const offsetX = x - hitRadius, offsetY = y - hitRadius;
      button.style.left = `${offsetX}px`;
      button.style.top = `${offsetY}px`;
      button.style.width = button.style.height = `${hitRadius * 2}px`;
      button.style.setProperty('--marker-size', `${Math.max(1, radius * 2 - 4)}px`);
      if (mark.hidden !== (radius < 10)) mark.hidden = radius < 10;
      i += 4;
      if (x + radius < 0 || x - radius > width || y + radius < 0 || y - radius > height) continue;
      occupied.push({ x: x - radius, y: y - radius, width: 2 * radius, height: 2 * radius });
      const priority = node.id === focused ? 0 : node.id === root ? 1 : node.id === selected || node.id === hovered ? 2 : 2 + node.level;
      if (priority <= 2 || radius >= (node.level > 1 ? 11 : 5)) visible.push({ item, x, y, radius, offsetX, offsetY, priority });
    }
    visible.sort((a, b) => a.priority - b.priority);
    for (const point of visible) {
      const preferred = overview && mobileFitLabel(point, width);
      const inColumn = preferred && preferred.width >= 64 && hasLabelRoom(preferred, width, height, occupied, placed);
      const box = inColumn ? preferred : placeLabel(point, width, height, occupied, placed, point.item.textWidth);
      if (!box) continue;
      const { label } = point.item;
      label.style.left = `${box.x - point.offsetX}px`;
      label.style.top = `${box.y - point.offsetY}px`;
      label.style.width = `${box.width}px`;
      label.style.height = `${box.height}px`;
      label.classList.toggle('is-fit-label', Boolean(inColumn));
      shown.add(label);
      placed.push(box);
    }
    for (const { label } of controlsById.values()) {
      const hidden = !shown.has(label);
      if (label.hidden !== hidden) label.hidden = hidden;
    }
    reportZoom(Math.round(zoom / fittedZoom * 100));
  }
  updateControls(graph.getFrame());
  graph.onFrame(updateControls);
  graph.on('nodeclick', id => queueMicrotask(() => traverse(id, false)));
  graph.on('nodedrop', id => rememberPin(id, graph.getPosition(id)));
  graph.on('hover', id => { hovered = id; graph.invalidate(); });
  let lastWidth = canvas.clientWidth;
  const resize = overview && typeof ResizeObserver === 'function' && new ResizeObserver(() => {
    const width = canvas.clientWidth;
    if (width === lastWidth) return;
    lastWidth = width;
    const positions = new Map(mobileFitPositions(view.nodes, width).map(node => [node.id, node]));
    graph.setLayout({ anchor: node => positions.get(node.id) });
  });
  resize && resize.observe(canvas);

  return {
    destroy() { destroyed = true; if (resize) resize.disconnect(); graph.destroy(); controls.replaceChildren(); },
    savedViewport() {
      const current = graph.getViewport();
      return { ...current, zoom: current.zoom / fittedZoom };
    },
    select(id) { selected = id; graph.select(controlsById.has(id) ? id : null); graph.invalidate(); },
    focusControl(id) { controlsById.get(id)?.button.focus({ preventScroll: true }); },
    center,
    fit() { fitCamera(); fittedZoom = graph.getViewport().zoom; updateControls(graph.getFrame()); },
    zoom(delta) {
      const current = graph.getViewport();
      const relative = Math.max(.65, Math.min(4, current.zoom / fittedZoom * (delta > 0 ? 1.2 : 1 / 1.2)));
      graph.setViewport({ ...current, zoom: fittedZoom * relative });
    },
    setPin(id, pinned) {
      if (pinned) graph.unpin(id);
      else graph.pin(id);
      rememberPin(id, pinned ? null : graph.getPosition(id));
    }
  };
}
