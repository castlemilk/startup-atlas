import { createWireGraph } from 'loom-core/wires';

const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function graphTheme(canvas, root, kinds) {
  const style = getComputedStyle(canvas);
  const color = name => style.getPropertyValue(`--atlas-${name}`).trim();
  const kind = Object.fromEntries(kinds.map(name => [name, color(name)]));
  return {
    kind, ink: color('ink'), dim: color('muted'), bg: color('paper'), accent: color('action'),
    bezel: color('border'), font: 'Inter, sans-serif', fontSize: 15,
    radii: { hub: 27, content: 19 }, plateAlpha: .94,
    nodes: { artwork: true, fill: .92, resolve: node => ({
      shape: node.kind === 'person' ? 'circle' : 'rounded-square',
      radius: node.id === root ? 42 : 28,
      color: node.id === root ? color('ink') : kind[node.kind]
    }) },
    wires: { routing: 'patch', color: color('border-strong'), width: 1.3, opacity: .52, hotWidth: 2.2 },
    labels: { density: .92, alternateSide: true }
  };
}

export function mountLoom({ canvas, controls, layout, root, kinds, pins, viewport, image, traverse, rememberPin, reportZoom }) {
  const nodes = layout.nodes.map(node => ({ ...node, label: node.name, pinned: false, art: image(node) || undefined }));
  const links = layout.edges.map(edge => ({ source: edge.from, target: edge.to, kind: edge.kind }));
  const graph = createWireGraph(canvas, {
    nodes, links, theme: graphTheme(canvas, root, kinds), sim: 'main',
    layout: { anchor: node => node, blend: 1, pinOnDrag: true },
    wireEffects: { direction: 'arrow', scope: 'all' }
  });
  canvas.tabIndex = -1;
  const buttons = new Map(nodes.map(node => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'network-node';
    button.dataset.node = node.id;
    button.dataset.kind = node.kind;
    button.classList.toggle('is-root', node.id === root);
    button.setAttribute('aria-label', node.name);
    button.addEventListener('click', () => traverse(node.id, true));
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
      const r = button.getBoundingClientRect(), visible = canvas.getBoundingClientRect();
      if (r.right <= visible.left || r.left >= visible.right || r.bottom <= visible.top || r.top >= visible.bottom) graph.focus(node.id);
    });
    return [node.id, button];
  }));
  const wrappers = [...buttons.values()].map(button => {
    const wrapper = document.createElement('ui-button');
    wrapper.append(button);
    return wrapper;
  });
  controls.replaceChildren(...wrappers);
  for (const [id, point] of pins) if (buttons.has(id)) graph.pin(id, point);
  graph.fit(true);
  let fittedZoom = graph.getViewport().zoom;
  if (viewport) graph.setViewport({ ...viewport, zoom: fittedZoom * viewport.zoom });

  function updateControls({ points, zoom }) {
    let i = 0;
    for (const button of buttons.values()) {
      const radius = Math.max(12, points[i + 2]);
      button.style.translate = `${points[i] - radius}px ${points[i + 1] - radius}px`;
      button.style.width = button.style.height = `${radius * 2}px`;
      i += 4;
    }
    reportZoom(Math.round(zoom / fittedZoom * 100));
  }
  updateControls(graph.getFrame());
  graph.onFrame(updateControls);
  graph.on('nodeclick', id => queueMicrotask(() => traverse(id, false)));
  graph.on('nodedrop', id => rememberPin(id, graph.getPosition(id)));

  return {
    destroy() { graph.destroy(); controls.replaceChildren(); },
    savedViewport() {
      const current = graph.getViewport();
      return { ...current, zoom: current.zoom / fittedZoom };
    },
    select(id) { graph.select(buttons.has(id) ? id : null); },
    focusControl(id) { buttons.get(id)?.focus({ preventScroll: true }); },
    center(id) { graph.focus(id); },
    fit() { graph.fit(true); fittedZoom = graph.getViewport().zoom; updateControls(graph.getFrame()); },
    zoom(delta) {
      const current = graph.getViewport();
      const relative = Math.max(.7, Math.min(1.7, current.zoom / fittedZoom + delta));
      graph.setViewport({ ...current, zoom: fittedZoom * relative });
    },
    setPin(id, pinned) {
      if (pinned) graph.unpin(id);
      else graph.pin(id);
      rememberPin(id, pinned ? null : graph.getPosition(id));
    }
  };
}
