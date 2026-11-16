import { escapeHtml as esc } from './logic.js';
import { icon } from './atlas-ui.js';

// Compositions describe the current owners; they do not create a second route implementation.
export const designRecipes = [
  {
    id: 'search', title: 'List & search', icon: 'list',
    question: 'Find a record, then follow its evidence.',
    summary: 'A document-scrolling result list with explicit scope, a complete matching count and a bounded visible range.',
    route: './?type=startup#directory', owner: 'web/app.js', styles: 'web/styles.css + web/field-atlas.css',
    wide: 'Keep search, scope and coverage above the same result list. Results grow in document flow; there is no separate scrollable result pane.',
    narrow: 'Wrap filters and move secondary row metadata below identity. Keep the full entity name, source and graph links reachable.',
    scroll: 'The document owns scrolling. Load more reveals another bounded result range; it does not create a nested page scroller.',
    state: 'view · q · type · scope-specific facets · shown',
    boundary: 'Filtering resets the visible range. Count all matches before slicing; a valid empty query result is different from a failed dataset.',
    next: 'A shared row inspector, exact scroll restoration and saved entity collections remain future work.',
    checks: [
      'Clear a nonempty search and return focus to the input; test an international text-composition sequence.',
      'Load more, open a profile and return. Preserve supported filters and shown, without promising an exact scroll position.',
      'Exercise the native kind selector and authored facet menu separately; unsupported scope filters must not leak across views.'
    ],
    regions: [
      { id: 'header', label: 'Identity & view links', detail: 'Shared route navigation uses anchors and aria-current. Moving between documents is not an ARIA tab interaction.', owner: 'atlas-ui.js · renderViewNavigation', components: 'View navigation, action links', element: 'header' },
      { id: 'controls', label: 'Search & scope', detail: 'A labelled search field, one clear action and route-owned scope/filter controls. The existing directory facet menus remain distinct from native entity-kind selection.', owner: 'app.js · directory search and filters', components: 'Search clear, native select, existing facet menu', element: 'section' },
      { id: 'coverage', label: 'Matching count', detail: 'Report the complete filtered population and the currently shown range. Loading and unavailable states must not be presented as zero results.', owner: 'app.js · filtered count and shown', components: 'Coverage, inline status', element: 'section' },
      { id: 'results', label: 'Entity result list', detail: 'Identity is the first reading target. Use real links for the profile, source and graph; do not make a whole row look selectable before row inspection exists.', owner: 'atlas-ui.js · renderEntityRow', components: 'Entity row, entity badge, source link', element: 'section' },
      { id: 'more', label: 'Displayed range', detail: 'The current directory reveals 12 results at a time. The shown parameter restores valid ranges up to 1200; filtering starts again from the first range.', owner: 'app.js · explicit Load more', components: 'Neutral action, range status', element: 'section' }
    ]
  },
  {
    id: 'treemap', title: 'Treemap', icon: 'treemap',
    question: 'Compare one clearly defined measure.',
    summary: 'A measure, a proportional view and the selected company’s evidence form one coordinated reading surface.',
    route: './treemap.html?metric=funding&currency=USD', owner: 'web/treemap.js + web/treemap-model.js', styles: 'web/treemap.css',
    wide: 'Pair the visualization or ranked list with a 310px inspector, reduced to 260px below 1000px. The measure and its coverage stay above the comparison.',
    narrow: 'Below 760px, stack the inspector after the visualization. Offer the ranked list for small tiles; source and date information remain available without hover.',
    scroll: 'The document owns the page. The ranked list owns a bounded internal scroller; the inspector and method notes stay in document flow.',
    state: 'metric · currency · group · q · period · view',
    boundary: 'Use a single currency and eligible positive observations. Unknown amounts are excluded and counted; no implicit conversion or missing-to-zero substitution.',
    next: 'Selected-tile URL state, additional sourced groupings and partner-scoped distributions remain future work.',
    checks: [
      'Select the same company through a tile and through the ranked list; both must expose the same figure, date and source.',
      'Change the measure and currency. Recompute the plotted population and exclusions using the treemap model.',
      'Keep a newer unplotted event visible in the evidence explanation when an older comparable observation supplies the tile.'
    ],
    regions: [
      { id: 'header', label: 'Identity & view links', detail: 'Keep normal route navigation available and name the startup-only population. Query propagation does not mean every cross-view filter is supported.', owner: 'atlas-ui.js · shared navigation', components: 'View navigation, coverage', element: 'header' },
      { id: 'controls', label: 'Metric, currency & grouping', detail: 'Native controls update the same comparison model. Founding decade is currently the sourced grouping; new dimensions need explicit non-overlapping semantics.', owner: 'treemap.js · treemap-controls', components: 'Native select, search clear', element: 'section' },
      { id: 'coverage', label: 'Measure & exclusions', detail: 'Name the metric and report the plotted and excluded startup counts. Historical observations from different dates are not current ecosystem value.', owner: 'treemap-model.js · makeView', components: 'Coverage, metric label', element: 'section' },
      { id: 'workspace', label: 'Proportional tiles / ranked list', detail: 'These are two presentations of the same measure. Tile area is linear; the equivalent list keeps tiny values and keyboard selection accessible.', owner: 'treemap.js · map and list rendering', components: 'Route-owned visualization and list', element: 'section' },
      { id: 'inspector', label: 'Selected company & evidence', detail: 'Inspect the selected observation, its source, date and exclusions before opening the company profile. Selection does not silently change the measure.', owner: 'treemap.js · treemap-detail', components: 'Entity identity, evidence, profile action', element: 'aside' },
      { id: 'method', label: 'Method & caveats', detail: 'Explain how the measure was chosen, which values are comparable and why records can be omitted. Keep this in document flow.', owner: 'treemap.html · method', components: 'Research notes, source links', element: 'section' }
    ]
  },
  {
    id: 'graph', title: 'Graph', icon: 'graph',
    question: 'Inspect a connection before moving the root.',
    summary: 'A bounded neighbourhood and its evidence inspector share context while root, selection and camera remain separate concepts.',
    route: './graph.html?entity=startup%3Acanva&depth=2', owner: 'web/graph.js + web/graph-model.js', styles: 'web/graph.css',
    wide: 'A flexible canvas sits beside a 335px inspector with a 16px gap; the rail reduces to 300px below 1150px. The connection list belongs to the network panel.',
    narrow: 'Below the route’s 820px breakpoint, stack the inspector after the network. Keep the equivalent list and non-drag node movement available.',
    scroll: 'The canvas owns panning and zoom. The document owns page scrolling outside the canvas; do not lock the shared shell to viewport height.',
    state: 'entity · selected · depth · types · q · list',
    boundary: 'Selection changes inspection. Explore from here changes the root. A capped neighbourhood is disclosed, and spatial proximity never creates an edge.',
    next: 'Persistent pins/camera, deliberate branch expansion and browsing omitted connections remain future work.',
    checks: [
      'Inspect a visible node and confirm that root and geometry remain stable; then explicitly reroot with Explore from here.',
      'Use Enter/Space to inspect and arrow keys to move a node. Fit view preserves placement; Reset layout clears manual placement.',
      'Check the equivalent relationship list, a limited neighbourhood and reduced-motion settling.'
    ],
    regions: [
      { id: 'header', label: 'Root identity & search', detail: 'The root defines the neighbourhood. Choosing a search result intentionally starts a new root; a separate inspected selection may differ.', owner: 'graph.js · root and search state', components: 'Entity identity, search clear', element: 'header' },
      { id: 'controls', label: 'Depth, kinds & view controls', detail: 'Depth is one or two hops. Entity-kind filters, connection-list visibility and camera controls each keep their own semantics.', owner: 'graph.js · explorer controls', components: 'Native select, toggles, named actions', element: 'section' },
      { id: 'workspace', label: 'Bounded neighbourhood', detail: 'Use the existing graph canvas and layout owner. Root, inspected node and keyboard focus need distinguishable treatments; decorative clusters do not imply relationships.', owner: 'graph.js · graph-canvas', components: 'Route-owned graph and selection', element: 'section' },
      { id: 'connections', label: 'Equivalent connection list', detail: 'Expose the same visible relationship predicates and evidence through the list. It remains a reading and interaction alternative to the map.', owner: 'graph.js · connection list', components: 'Relationship rows, source links', element: 'section' },
      { id: 'inspector', label: 'Inspected entity & evidence', detail: 'Selection updates this panel without rerooting. Label off-map entities Outside current map; use a separate Explore from here action and a real Open profile link.', owner: 'graph.js · graph-detail', components: 'Identity, relationship, coverage, action', element: 'aside' }
    ]
  },
  {
    id: 'startup', title: 'Startup explorer', icon: 'company',
    question: 'Begin with the founders. Keep the source close.',
    summary: 'A narrative profile uses anchored sections and an evidence rail while every fact retains its recorded meaning.',
    route: './entity.html?id=startup%3Acanva', owner: 'web/entity.js', styles: 'web/entity.css + web/profile.css',
    wide: 'Use the narrower 1320px profile shell with a 280px evidence rail and 48px section rhythm. Founders lead the main reading column.',
    narrow: 'At 900px the evidence rail follows the main profile. Section links remain anchors; full names, facts and long source titles wrap.',
    scroll: 'The document owns every profile section. Section navigation scrolls to headings; it must not hide the other sections behind faux tabs.',
    state: 'id · in-document section · safe per-tab return context',
    boundary: 'An unresearched founder or funding section is unknown, not proof of absence. Funding announcements keep their own dates, currencies and source notes.',
    next: 'Structured operating geography, event-specific investors and a richer sourced company timeline remain future work.',
    checks: [
      'Follow the company → founder → other company journey through real links, preserving available local return context.',
      'Review missing founders, missing funding, an unknown ID and a failed snapshot as distinct states.',
      'Verify each section anchor, long names, broken-logo initials and narrow evidence-rail order.'
    ],
    regions: [
      { id: 'header', label: 'Identity, coverage & return', detail: 'Keep the full company name, sourced summary, coverage and graph destination together. A direct entry uses a stable fallback when local return context is unavailable.', owner: 'entity.js · entity-hero; atlas-ui.js · safeAtlasReturn', components: 'Identity, badge, coverage, profile actions', element: 'header' },
      { id: 'controls', label: 'Anchored section navigation', detail: 'Founders, Company, Funding, Connections and Sources point to visible headings in the same document.', owner: 'entity.js · atlas-section-nav', components: 'Section navigation', element: 'nav' },
      { id: 'founders', label: 'Founders', detail: 'Linked people and their sourced founded relationships lead the profile. Matching names never establish that two people are the same person.', owner: 'entity.js · entity-founders', components: 'Entity identity, relationship, source link', element: 'section' },
      { id: 'facts', label: 'Company, funding & connections', detail: 'Keep fact sources close and funding events dated. A portfolio edge is not an event-specific investment participant.', owner: 'entity.js · entity-company / entity-funding / entity-connections', components: 'Fact row, event row, relationship', element: 'section' },
      { id: 'evidence', label: 'Sources & context', detail: 'The side rail preserves profile/image sources and research context. Article dates, observation dates and review dates remain different fields.', owner: 'entity.js · entity-aside', components: 'Source links, research notes', element: 'aside' }
    ]
  },
  {
    id: 'partner', title: 'Partner / VC explorer', icon: 'partners',
    question: 'Describe the organisation and the researched sample.',
    summary: 'Lead with sourced identity and companies, then people and programme relationships; keep sample coverage explicit.',
    route: './partner.html?name=Airtree', owner: 'web/partner-profile.js', styles: 'web/profile.css',
    wide: 'Companies and people occupy the main profile column. Programme relationships and source context sit in the 280px evidence rail.',
    narrow: 'At 900px the rail follows the company and people sections. Navigation still reaches Programmes and Sources in normal document flow.',
    scroll: 'The document owns the profile. Optional supporter content extends the main column without introducing an independent page-height scroller.',
    state: 'name · in-document section · safe per-tab return context',
    boundary: 'A researched sample is not a complete portfolio. A partner may be a university, accelerator or provider; the index category does not make it a VC.',
    next: 'Partner-scoped portfolio lenses, sourced investment thesis and distinct fund identities remain future work.',
    checks: [
      'Open a company or team member and return through the captured internal route; test a direct entry with storage unavailable.',
      'Fail optional research separately. A partial-load warning must not become a complete empty company sample.',
      'Keep provider/programme relationship evidence separate from identity review and programme eligibility.'
    ],
    regions: [
      { id: 'header', label: 'Identity, type & sample coverage', detail: 'Name the sourced organisation type and researched population. Firm, fund, cohort and provider programme are different entities.', owner: 'partner-profile.js · profile-hero / profile-coverage', components: 'Identity, entity kind, coverage', element: 'header' },
      { id: 'controls', label: 'Anchored section navigation', detail: 'Companies, People, Programmes and Sources are real anchors. Include Supporters only when the corresponding section has data.', owner: 'partner-profile.js · atlas-section-nav', components: 'Section navigation', element: 'nav' },
      { id: 'companies', label: 'Companies researched', detail: 'Lead with the reviewed company sample and its source. A portfolio listing does not establish participation in a particular funding round.', owner: 'partner-profile.js · partner-companies', components: 'Entity identity, relationship, source link', element: 'section' },
      { id: 'people', label: 'People & roles', detail: 'Link the sourced people and roles. A firm’s team member is not automatically the partner who led a company’s investment.', owner: 'partner-profile.js · partner-people', components: 'Person identity, relationship', element: 'section' },
      { id: 'evidence', label: 'Programmes, sources & context', detail: 'Separate identity evidence, company/people research and programme relationships. Optional-source failure has its own visible partial-data treatment.', owner: 'partner-profile.js · profile-aside', components: 'Evidence, coverage, partial status', element: 'aside' }
    ]
  }
];

const recipeById = new Map(designRecipes.map(recipe => [recipe.id, recipe]));
const recipeAreas = {
  search: { wide: '"header" "controls" "coverage" "results" "more"', narrow: '"header" "controls" "coverage" "results" "more"' },
  treemap: { wide: '"header header" "controls controls" "coverage coverage" "workspace inspector" "method method"', narrow: '"header" "controls" "coverage" "workspace" "inspector" "method"' },
  graph: { wide: '"header header" "controls controls" "workspace inspector" "connections inspector"', narrow: '"header" "controls" "workspace" "connections" "inspector"' },
  startup: { wide: '"header header" "controls controls" "founders evidence" "facts evidence"', narrow: '"header" "controls" "founders" "facts" "evidence"' },
  partner: { wide: '"header header" "controls controls" "companies evidence" "people evidence"', narrow: '"header" "controls" "companies" "people" "evidence"' }
};
function scaffoldStyles(recipe) {
  const columns = recipe.id === 'search' ? 'minmax(0, 1fr)' : recipe.id === 'graph' ? 'minmax(0, 1fr) var(--atlas-panel-width)' : recipe.id === 'treemap' ? 'minmax(0, 1fr) 310px' : 'minmax(0, 1fr) 280px';
  const breakpoint = recipe.id === 'graph' ? '820px' : recipe.id === 'treemap' ? '760px' : '900px';
  const shellWidth = ['startup', 'partner'].includes(recipe.id) ? '1320px' : 'var(--atlas-page-max)';
  const gap = ['startup', 'partner'].includes(recipe.id) ? 'var(--atlas-space-12)' : recipe.id === 'treemap' ? '18px' : 'var(--atlas-space-4)';
  const intermediate = recipe.id === 'treemap' ? '@media (max-width: 1000px) { .recipe-shell { grid-template-columns: minmax(0, 1fr) 260px; } }' : recipe.id === 'graph' ? '@media (max-width: 1150px) { .recipe-shell { grid-template-columns: minmax(0, 1fr) 300px; } }' : '';
  return `body { margin: 0; color: var(--atlas-ink); background: var(--atlas-canvas); font-family: var(--atlas-font-body); }
main { max-width: ${shellWidth}; margin: auto; padding: var(--atlas-space-6); }
h1, h2 { font-family: var(--atlas-font-display); }
.recipe-shell { display: grid; gap: ${gap}; grid-template-columns: ${columns}; grid-template-areas: ${recipeAreas[recipe.id].wide}; }
.recipe-shell > * { min-width: 0; padding: var(--atlas-space-4); background: var(--atlas-surface); border: 1px solid var(--atlas-border); border-radius: var(--atlas-radius-control); }
p { line-height: 1.65; }
${recipe.regions.map(region => `.recipe-${region.id} { grid-area: ${region.id}; }`).join('\n')}
${intermediate}
@media (max-width: ${breakpoint}) { .recipe-shell { grid-template-columns: minmax(0, 1fr); grid-template-areas: ${recipeAreas[recipe.id].narrow}; } }`;
}

/** A semantic handoff scaffold; route-specific rendering and data remain with their current owners. */
export function recipeScaffold(recipeOrId) {
  const recipe = typeof recipeOrId === 'string' ? recipeById.get(recipeOrId) : recipeOrId;
  if (!recipe) throw new Error('Unknown Atlas recipe');
  const blocks = recipe.regions.map(region => {
    const tag = region.element === 'nav' ? 'section' : region.element;
    const landmark = region.element === 'nav' ? '\n      <!-- Replace this note with .atlas-section-nav anchors to the rendered headings. -->' : '';
    return `    <${tag} class="recipe-${region.id}" aria-labelledby="recipe-${region.id}-heading">${landmark}
      <h2 id="recipe-${region.id}-heading">${esc(region.label)}</h2>
      <p>${esc(region.detail)}</p>
      <!-- Owner: ${esc(region.owner)} -->
    </${tag}>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(recipe.title)} — Atlas composition scaffold</title>
  <!-- Place this scaffold beside the canonical published CSS, or update these two paths. -->
  <link rel="stylesheet" href="./design-tokens.css">
  <link rel="stylesheet" href="./atlas-ui.css">
  <style>
${scaffoldStyles(recipe)}
  </style>
</head>
<body>
<main>
  <h1>${esc(recipe.title)}</h1>
  <p class="atlas-coverage">Composition scaffold. These labelled regions describe the current architecture; this file does not load research or implement product controls.</p>
  <p><a class="atlas-button" href="${esc(recipe.route)}">Open the working Atlas view</a></p>
  <!-- Keep the existing route behaviour in ${esc(recipe.owner)}. -->
  <div class="recipe-shell">
${blocks}
  </div>
  <p>${esc(recipe.scroll)}</p>
  <p><strong>Data boundary:</strong> ${esc(recipe.boundary)}</p>
  <p><strong>Still to build:</strong> ${esc(recipe.next)}</p>
</main>
</body>
</html>
`;
}

function readRecipeState() {
  const params = new URLSearchParams(location.search);
  return {
    recipe: recipeById.has(params.get('recipe')) ? params.get('recipe') : 'search',
    mode: params.get('layoutMode') === 'narrow' ? 'narrow' : 'wide'
  };
}

export function mountDesignRecipes(root) {
  if (!root || root.dataset.recipesMounted === 'true') return;
  root.dataset.recipesMounted = 'true';
  root.classList.add('dr-recipes');
  let state = readRecipeState();
  let selectedRegion = 'header';
  let copySequence = 0;
  let downloadUrl = '';
  const $ = id => root.querySelector('#' + id);
  root.innerHTML = `
    <div class="dr-toolbar">
      <label class="dr-recipe-select" for="dr-recipe"><span>Explorer recipe</span><select id="dr-recipe">${designRecipes.map(recipe => `<option value="${recipe.id}">${esc(recipe.title)}</option>`).join('')}</select></label>
      <div class="dr-mode"><span>Composition</span><div class="dr-mode-buttons" role="group" aria-label="Recipe composition width"><button type="button" data-dr-mode="wide" aria-pressed="true">Wide</button><button type="button" data-dr-mode="narrow" aria-pressed="false">Narrow</button></div></div>
      <a id="dr-route" class="atlas-button" href="./?type=startup#directory">Open working view ${icon('arrow')}</a>
    </div>
    <div class="dr-intro"><div><h3 id="dr-question"></h3><p id="dr-summary"></p></div><p class="dr-schematic-label">Composition schematic<br><span>Select a region to inspect its contract.</span></p></div>
    <div class="dr-board">
      <div class="dr-diagram-wrap"><div class="dr-board-caption"><span id="dr-board-name"></span><span id="dr-layout-label"></span></div><div id="dr-diagram" class="dr-diagram" role="group"></div><p id="dr-layout-description" class="dr-layout-description"></p></div>
      <div class="dr-region-detail" id="dr-region-detail" aria-live="polite" aria-atomic="true"></div>
    </div>
    <div class="dr-contract-grid">
      <div><h4>Scroll ownership</h4><p id="dr-scroll"></p></div>
      <div><h4>State &amp; data boundary</h4><p id="dr-state" class="dr-state"></p><p id="dr-boundary"></p></div>
    </div>
    <div class="dr-checks"><h4>Check the assembled view</h4><ul id="dr-check-list"></ul></div>
    <div class="dr-next"><strong>Still to build</strong><p id="dr-next"></p><a href="./docs/EXPLORER-VIEWS.md">Full view specifications ${icon('arrow')}</a></div>
    <details id="dr-scaffold-details" class="dr-scaffold-details">
      <summary>HTML composition scaffold <span aria-hidden="true">${icon('source')}</span></summary>
      <div class="dr-scaffold-content"><p id="dr-scaffold-note">A complete static HTML handoff with labelled regions and canonical CSS links. Place it beside the published styles, then use the existing route owner for data and interactions. This scaffold is not a second working explorer.</p>
        <div class="dr-scaffold-actions"><button id="dr-copy" class="atlas-button" type="button">${icon('copy')} Copy scaffold</button><a id="dr-download" class="atlas-button" download="atlas-search-scaffold.html">${icon('download')} Download HTML</a><a href="./docs/IMPLEMENTATION-RECIPES.md">Read implementation recipes</a></div>
        <label class="dr-code-label" for="dr-scaffold">HTML scaffold for <span id="dr-scaffold-name"></span></label><textarea id="dr-scaffold" readonly spellcheck="false" aria-describedby="dr-scaffold-note dr-copy-fallback"></textarea>
        <p id="dr-copy-fallback" class="dr-copy-fallback" hidden>Clipboard access is unavailable. The scaffold is selected above; use your device’s copy command.</p><p id="dr-feedback" class="dr-feedback" role="status" aria-live="polite"></p>
      </div>
    </details>`;

  function writeState() {
    const url = new URL(location.href);
    state.recipe === 'search' ? url.searchParams.delete('recipe') : url.searchParams.set('recipe', state.recipe);
    state.mode === 'wide' ? url.searchParams.delete('layoutMode') : url.searchParams.set('layoutMode', state.mode);
    const next = url.pathname + url.search + url.hash;
    if (next !== location.pathname + location.search + location.hash) history.pushState(null, '', next);
  }
  function renderRegion() {
    const recipe = recipeById.get(state.recipe);
    const region = recipe.regions.find(item => item.id === selectedRegion) || recipe.regions[0];
    selectedRegion = region.id;
    for (const button of root.querySelectorAll('[data-dr-region]')) button.setAttribute('aria-pressed', String(button.dataset.drRegion === region.id));
    $('dr-region-detail').innerHTML = `<p class="dr-role-label">Selected region</p><h4>${esc(region.label)}</h4><p>${esc(region.detail)}</p><dl><dt>Current owner</dt><dd>${esc(region.owner)}</dd><dt>Assemble with</dt><dd>${esc(region.components)}</dd><dt>Landmark</dt><dd><code>&lt;${esc(region.element)}&gt;</code>${region.element === 'section' ? ' with a named heading' : region.element === 'nav' ? ' with a descriptive label' : ''}</dd></dl><div class="dr-related"><a href="#component-workbench">Component workbench ${icon('arrow')}</a><a href="#token-reference">Token reference ${icon('arrow')}</a></div>`;
  }
  function render() {
    const recipe = recipeById.get(state.recipe);
    copySequence += 1;
    $('dr-copy').removeAttribute('aria-busy');
    $('dr-copy-fallback').hidden = true;
    $('dr-feedback').textContent = '';
    $('dr-recipe').value = state.recipe;
    for (const button of root.querySelectorAll('[data-dr-mode]')) button.setAttribute('aria-pressed', String(button.dataset.drMode === state.mode));
    $('dr-route').href = recipe.route;
    $('dr-question').textContent = recipe.question;
    $('dr-summary').textContent = recipe.summary;
    $('dr-board-name').textContent = recipe.title;
    $('dr-layout-label').textContent = state.mode === 'wide' ? 'Wide composition' : 'Narrow composition';
    const diagram = $('dr-diagram');
    diagram.dataset.recipe = state.recipe;
    diagram.dataset.layout = state.mode;
    diagram.setAttribute('aria-label', `${recipe.title} composition schematic, ${state.mode} layout`);
    diagram.innerHTML = recipe.regions.map(region => `<button class="dr-region dr-region-${region.id}" type="button" data-dr-region="${region.id}" aria-pressed="false" aria-controls="dr-region-detail" aria-label="Inspect ${esc(region.label)} region"><span class="dr-region-landmark">${esc(region.element)}</span><strong>${esc(region.label)}</strong><span class="dr-region-hint">Inspect region ${icon('arrow')}</span></button>`).join('');
    $('dr-layout-description').textContent = recipe[state.mode];
    $('dr-scroll').textContent = recipe.scroll;
    $('dr-state').textContent = recipe.state;
    $('dr-boundary').textContent = recipe.boundary;
    $('dr-check-list').innerHTML = recipe.checks.map(check => `<li>${icon('check')}<span>${esc(check)}</span></li>`).join('');
    $('dr-next').textContent = recipe.next;
    $('dr-scaffold').value = recipeScaffold(recipe);
    $('dr-scaffold-name').textContent = recipe.title;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([recipeScaffold(recipe)], { type: 'text/html;charset=utf-8' }));
    $('dr-download').href = downloadUrl;
    $('dr-download').download = `atlas-${recipe.id}-scaffold.html`;
    renderRegion();
  }
  $('dr-recipe').addEventListener('change', () => {
    state.recipe = recipeById.has($('dr-recipe').value) ? $('dr-recipe').value : 'search';
    selectedRegion = 'header'; writeState(); render();
  });
  for (const button of root.querySelectorAll('[data-dr-mode]')) button.addEventListener('click', () => {
    state.mode = button.dataset.drMode === 'narrow' ? 'narrow' : 'wide'; writeState(); render();
  });
  $('dr-diagram').addEventListener('click', event => {
    const button = event.target.closest('[data-dr-region]');
    if (!button || !$('dr-diagram').contains(button)) return;
    selectedRegion = button.dataset.drRegion; renderRegion();
  });
  $('dr-copy').addEventListener('click', async () => {
    const sequence = ++copySequence;
    const code = $('dr-scaffold').value;
    $('dr-copy').setAttribute('aria-busy', 'true');
    $('dr-copy-fallback').hidden = true;
    $('dr-feedback').textContent = 'Copying the current scaffold…';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(code);
      if (sequence !== copySequence) return;
      $('dr-feedback').textContent = 'HTML scaffold copied.';
    } catch {
      if (sequence !== copySequence) return;
      $('dr-scaffold-details').open = true;
      $('dr-copy-fallback').hidden = false;
      $('dr-scaffold').focus(); $('dr-scaffold').select();
      $('dr-feedback').textContent = 'Copy the selected HTML manually, or download the file.';
    } finally {
      if (sequence === copySequence) $('dr-copy').removeAttribute('aria-busy');
    }
  });
  window.addEventListener('popstate', () => {
    const next = readRecipeState();
    if (next.recipe !== state.recipe) selectedRegion = 'header';
    state = next; render();
  });
  window.addEventListener('pagehide', () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); });
  window.addEventListener('pageshow', event => { if (event.persisted) render(); });
  render();
}
