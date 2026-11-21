import { createWireGraph } from 'loom-core/wires';
import { attachAnnotations, compileTaxonomies } from 'loom-core/taxonomy';
import { graphOrigin, layoutNetwork } from './graph-layout.js';
import { mobileFit, mobileFitLabel, mobileFitPositions } from './graph-mobile-fit.js';
import { graphArtwork, graphInitials, showGraphArtwork } from './graph-artwork.js';
import { companyCaptionHeight, companyLayout } from './graph-company-layout.js';

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

function marking(node) {
  const { url, classes } = graphArtwork(node);
  const mark = document.createElement('span');
  mark.className = `network-loom-mark ${classes}`;
  mark.setAttribute('aria-hidden', 'true');
  const letters = document.createElement('span');
  letters.textContent = graphInitials(node.name);
  mark.append(letters);
  if (url) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = node.level === 0 ? 'eager' : 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.src = url;
    mark.append(img);
    showGraphArtwork(img, letters);
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

function graphTheme(canvas, root, kinds, overview, selected) {
  const style = getComputedStyle(canvas);
  const color = name => style.getPropertyValue(`--atlas-${name}`).trim();
  const kind = Object.fromEntries(kinds.map(name => [name, color(name)]));
  const accent = color('action');
  return {
    kind, ink: color('ink'), dim: color('muted'), bg: color('paper'), accent,
    bezel: color('border'), font: style.getPropertyValue('--atlas-font-body'), fontSize: 15,
    radii: { hub: 27, content: 19 }, plateAlpha: .94,
    nodes: { artwork: false, fill: .82, resolve: node => ({
      shape: node.kind === 'person' ? 'circle' : 'rounded-square',
      radius: overview ? (node.id === root ? mobileFit.rootRadius : mobileFit.neighbourRadius) : (node.id === root ? 42 : 30),
      color: node.id === selected ? accent : node.id === root ? color('ink') : kind[node.kind]
    }) },
    wires: {
      routing: 'patch', color: color('border-strong'), width: 1.7, opacity: .84, hotWidth: 2.6,
      resolve: link => link.source === selected || link.target === selected ? { color: accent, width: 2.6, opacity: .94 } : undefined
    },
    labels: { visibility: 'none' }
  };
}

export function mountLoom({ canvas, controls, view, root, dense, overview, kinds, pins, viewport, traverse, rememberPin, reportZoom }) {
  const anchors = overview ? mobileFitPositions(view.nodes, canvas.clientWidth) : arrangeNodes(view, root, canvas, dense);
  const nodes = anchors.map(node => ({ ...node, pinned: false }));
  const links = view.edges.map(edge => ({ source: edge.from, target: edge.to, kind: edge.kind }));
  const graph = createWireGraph(canvas, {
    nodes, links, theme: graphTheme(canvas, root, kinds, overview), sim: 'main',
    layout: { anchor: node => node, blend: 1, pinOnDrag: true },
    wireEffects: { direction: 'arrow', scope: 'all' }
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
    const mark = marking(node);
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
  // Atlas owns the selection so Loom never fades unrelated wires to 4.5%.
  graph.on('select', id => { if (id !== null) graph.select(null); });
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
    select(id) {
      if (id === selected) return;
      selected = id;
      graph.setTheme(graphTheme(canvas, root, kinds, overview, selected));
    },
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

export function mountCompanyLoom({ canvas, controls, boundaries, groups, edges, reading, saved, traverse, selectGroup, reportZoom }) {
  const members = groups.flatMap(([group, companies]) => companies.map(company => ({ ...company, group })));
  const stage = canvas.parentElement;
  function place() {
    const layout = companyLayout(groups, members, canvas.clientWidth, reading);
    stage.style.setProperty('--company-map-height', `${layout.height}px`);
    return layout;
  }
  let layout = place();
  const nodes = members.map(node => ({ ...node, ...layout.anchor(node), pinned: false }));
  const links = edges.map(edge => ({ source: edge.from, target: edge.to, kind: edge.kind }));
  const theme = graphTheme(canvas, null, ['startup'], false);
  theme.nodes.resolve = () => ({ shape: 'rounded-square', radius: 25, color: theme.kind.startup });
  const graph = createWireGraph(canvas, { nodes, links, theme, sim: 'main',
    layout: { anchor: layout.anchor, blend: 1 }, wireEffects: { direction: 'arrow', scope: 'all' } });
  canvas.tabIndex = -1;

  const taxonomy = compileTaxonomies({ nodes, links }, { taxonomies: [{ id: 'company', label: 'Company group', by: 'group' }] });
  const groupIndexes = new Map(taxonomy.legend('company').map(group => [group.id, group.members]));
  attachAnnotations(graph, boundaries, taxonomy, { bubbles: { company: true },
    boundary: { color: theme.kind.startup, padding: 7, fillOpacity: .04, strokeOpacity: .44 },
    groupGesture: 'controls', tooltips: false });

  const captions = new Map((reading ? [] : groups).map(([group, companies]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'graph-company-cluster-label';
    button.dataset.group = group;
    const name = document.createElement('span'), count = document.createElement('span');
    name.textContent = group;
    count.className = 'graph-company-cluster-count';
    count.textContent = String(companies.length);
    button.append(name, count);
    button.setAttribute('aria-label', `Zoom to ${group}, ${companies.length} ${companies.length === 1 ? 'company' : 'companies'}`);
    button.addEventListener('click', event => selectGroup(group, event.detail === 0));
    return [group, { button, indexes: groupIndexes.get(group), textWidth: 0 }];
  }));
  const measure = document.createElement('canvas').getContext('2d');
  const family = getComputedStyle(controls).getPropertyValue('--atlas-font-body');
  const measureText = name => Math.ceil(measure?.measureText(name).width ?? name.length * 8) + 14;
  let fitted, destroyed = false, lastProjection, lastFocus;
  const entries = nodes.map(node => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'network-node';
    button.dataset.node = node.id;
    button.dataset.group = node.group;
    button.setAttribute('aria-label', `${node.name}, ${node.group}. Follow connections`);
    const mark = marking(node);
    const label = document.createElement('span');
    label.className = 'network-loom-label';
    const name = document.createElement('span');
    name.textContent = label.title = node.name;
    label.append(name);
    label.setAttribute('aria-hidden', 'true');
    button.append(mark, label);
    button.addEventListener('click', event => traverse(node.id, event.detail === 0));
    button.addEventListener('focus', () => {
      const r = button.getBoundingClientRect(), frame = canvas.getBoundingClientRect();
      if (!button.matches(':focus-visible')) return;
      if (label.hidden || r.left < frame.left || r.top < frame.top || r.right > frame.right || r.bottom > frame.bottom) {
        const { x, y } = graph.getPosition(node.id), viewport = graph.getViewport();
        graph.setViewport({ ...viewport, x, y, zoom: Math.max(.9, viewport.zoom) });
      }
      graph.invalidate();
    });
    const wrapper = document.createElement('ui-button');
    wrapper.append(button);
    return { node, button, mark, label, wrapper, textWidth: 0 };
  });
  controls.replaceChildren(...[...captions.values()].map(entry => entry.button), ...entries.map(entry => entry.wrapper));

  function updateControls({ points, width, height, projectionVersion }) {
    const focused = document.activeElement;
    if (projectionVersion !== undefined && lastProjection === projectionVersion && lastFocus === focused) return;
    lastProjection = projectionVersion;
    lastFocus = focused;
    const viewport = graph.getViewport();
    const atFit = ['zoom','x','y'].every(key => Math.abs(viewport[key] - fitted[key]) < .01);
    const compactFit = atFit && layout.captions;
    const readingFit = atFit && reading;
    stage.toggleAttribute('data-panning', viewport.zoom > fitted.zoom + .015);
    reportZoom(Math.round(viewport.zoom / fitted.zoom * 100));
    const occupied = [], placed = [], visible = [], shown = new Set();
    const positions = entries.map((item, index) => {
      const { button, mark } = item;
      const [x, y, radius] = [points[index * 4], points[index * 4 + 1], points[index * 4 + 2]];
      const directHit = radius >= 17;
      const hit = Math.max(directHit ? 22 : 12, radius), offsetX = x - hit, offsetY = y - hit;
      Object.assign(button.style, { left: `${offsetX}px`, top: `${offsetY}px`, width: `${hit * 2}px`, height: `${hit * 2}px` });
      button.style.setProperty('--marker-size', `${Math.max(1, radius * 2 - 2)}px`);
      button.toggleAttribute('data-company-hit', directHit);
      mark.hidden = radius < 8;
      if (x + radius >= 0 && y + radius >= 0 && x - radius <= width && y - radius <= height) {
        occupied.push({ x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 });
        visible.push({ item, x, y, radius, offsetX, offsetY });
      }
      return { x, y, radius };
    });
    if (measure) measure.font = `640 13px ${family}`;
    for (const [group, caption] of captions) {
      const { button, indexes } = caption;
      button.toggleAttribute('data-fit-group', Boolean(compactFit && !layout.showNames));
      const slot = compactFit && layout.captions.get(group);
      if (slot) {
        button.hidden = false;
        Object.assign(button.style, { left: `${slot.x}px`, top: `${slot.y}px`, width: `${slot.width}px` });
        placed.push({ ...slot, height: companyCaptionHeight });
        continue;
      }
      const points = indexes.map(index => positions[index]);
      const left = Math.min(...points.map(p => p.x - p.radius)), right = Math.max(...points.map(p => p.x + p.radius));
      const top = Math.min(...points.map(p => p.y - p.radius)), bottom = Math.max(...points.map(p => p.y + p.radius));
      caption.textWidth ||= measureText(group + '  ' + button.lastElementChild.textContent) + 16;
      const widthOfLabel = Math.min(caption.textWidth, width - 2 * frameInset);
      const clampX = x => Math.max(frameInset, Math.min(x, width - widthOfLabel - frameInset));
      const center = (left + right - widthOfLabel) / 2;
      const xs = [center, left - 10, right - widthOfLabel + 10].map(clampX);
      const topY = top - companyCaptionHeight - 6;
      const candidates = [topY, bottom + 7].flatMap(y => xs.map(x => [x, y]));
      candidates.push([left - widthOfLabel - 9, (top + bottom - companyCaptionHeight) / 2], [right + 9, (top + bottom - companyCaptionHeight) / 2]);
      const box = right >= 0 && left <= width && bottom >= 0 && top <= height &&
        candidates.map(([x,y]) => ({ x, y, width: widthOfLabel, height: companyCaptionHeight }))
          .find(candidate => hasLabelRoom(candidate, width, height, occupied, placed));
      button.hidden = !box;
      if (box) {
        Object.assign(button.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px` });
        placed.push(box);
      }
    }
    if (measure) measure.font = `600 13px ${family}`;
    visible.sort((a, b) => Number(b.item.button === focused) - Number(a.item.button === focused));
    for (const point of compactFit && !layout.showNames ? [] : visible) {
      const { item, offsetX, offsetY } = point;
      item.textWidth ||= measureText(item.node.name);
      const box = readingFit ? { x: point.x - layout.labelWidth / 2, y: point.y + point.radius + 6, width: layout.labelWidth, height: 46 }
        : placeLabel(point, width, height, occupied, placed, item.textWidth);
      if (!box) continue;
      item.label.toggleAttribute('data-reading-label', readingFit);
      Object.assign(item.label.style, { left: `${box.x - offsetX}px`, top: `${box.y - offsetY}px`, width: `${box.width}px`, height: `${box.height}px` });
      shown.add(item.label);
      placed.push(box);
    }
    for (const { label } of entries) label.hidden = !shown.has(label);
  }
  function fit() {
    graph.setViewport({ ...graph.getViewport(), ...layout.viewport });
    fitted = graph.getViewport();
  }
  graph.resize();
  fit();
  if (saved?.width === canvas.clientWidth && saved.height === canvas.clientHeight && saved.viewport?.zoom > 0 &&
      ['x','y','z','yaw','pitch','zoom'].every(key => Number.isFinite(saved.viewport[key]))) graph.setViewport(saved.viewport);
  updateControls(graph.getFrame());
  graph.onFrame(updateControls);
  graph.on('nodeclick', id => queueMicrotask(() => { if (!destroyed) traverse(id, false); }));
  graph.on('select', id => { if (id !== null) graph.select(null); });
  document.fonts?.ready.then(() => {
    if (destroyed) return;
    for (const item of entries) item.textWidth = 0;
    for (const caption of captions.values()) caption.textWidth = 0;
    lastProjection = undefined;
    graph.invalidate();
  });
  let width = canvas.clientWidth, height = canvas.clientHeight;
  const resize = typeof ResizeObserver === 'function' && new ResizeObserver(() => {
    if (width === canvas.clientWidth && height === canvas.clientHeight) return;
    layout = place();
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    lastProjection = undefined;
    graph.resize();
    graph.setLayout({ anchor: layout.anchor });
    fit();
  });
  resize && resize.observe(canvas);
  return {
    destroy() { destroyed = true; if (resize) resize.disconnect(); graph.destroy(); controls.replaceChildren(); boundaries.replaceChildren(); },
    savedViewport() { return { width, height, viewport: graph.getViewport() }; },
    focusNode(id) {
      const button = entries.find(entry => entry.node.id === id)?.button;
      button?.focus({ preventScroll: true });
      return Boolean(button);
    },
    fit,
    zoom(delta) {
      const viewport = graph.getViewport();
      const scale = Math.max(fitted.zoom, Math.min(2.4, viewport.zoom * (delta > 0 ? 1.24 : 1 / 1.24)));
      if (scale === fitted.zoom) { fit(); return; }
      graph.setViewport({ ...viewport, zoom: scale });
    }
  };
}
