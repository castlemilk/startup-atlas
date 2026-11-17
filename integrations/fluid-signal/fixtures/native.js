const names = ['a', 'b'];
const roots = Object.fromEntries(names.map(name => [name, document.querySelector(`#root-${name}`)]));
const layers = Object.fromEntries(names.map(name => [name, document.querySelector(`#layer-${name}`)]));
const state = Object.fromEntries(names.map(name => [name, { left: 40, changes: 0 }]));
const owners = {};
const fixture = window.fixture = {
  roots, layers, state, owners, events: [], importStatus: 'loading',
  commit(name, left, role = 'context') {
    const previous = state[name].left;
    state[name] = { left, changes: state[name].changes + 1 };
    layers[name].style.left = `${left}px`;
    document.querySelector(`#trigger-${name}`).setAttribute('aria-pressed', String(left !== 40));
    document.querySelector(`#state-${name}`).textContent = `${state[name].changes} host changes. Current position ${left}.`;
    return owners[name]?.transition(layers[name], { from: { x: previous - left, y: 0 }, role })
      ?? { animated: false, reason: 'runtime-unavailable' };
  },
  reset(name) {
    owners[name]?.settle();
    state[name] = { left: 40, changes: 0 };
    layers[name].style.left = '40px';
    document.querySelector(`#trigger-${name}`).setAttribute('aria-pressed', 'false');
    document.querySelector(`#state-${name}`).textContent = 'No host changes.';
  },
};
for (const name of names) {
  document.querySelector(`#trigger-${name}`).addEventListener('click', event => {
    fixture.events.push({ name, type: event.type, trusted: event.isTrusted });
    fixture.commit(name, state[name].left === 40 ? 200 : 40);
  });
}
try {
  const failure = new URL(location.href).searchParams.get('failure') === '1';
  fixture.module = await import(`/adapter.js${failure ? '?failure=1' : ''}`);
  fixture.mount = name => { owners[name] = fixture.module.mountFluidSignal(roots[name]); };
  names.forEach(fixture.mount);
  fixture.importStatus = 'ready';
  window.addEventListener('pagehide', event => {
    sessionStorage.setItem('fluid-pagehide', JSON.stringify({
      trusted: event.isTrusted, persisted: event.persisted,
      active: names.map(name => owners[name].inspect().activeAnimations),
    }));
  });
} catch {
  fixture.importStatus = 'unavailable';
}
