/** Component catalogue metadata. Runtime styles and renderers retain ownership. */
export const componentCategories = Object.freeze([
  {id:'actions',label:'Actions & feedback'},
  {id:'identity',label:'Entity identity'},
  {id:'research',label:'Research & evidence'},
  {id:'navigation',label:'Search & navigation'}
].map(Object.freeze));

const definitions = [
  {
    id:'actions',label:'Action hierarchy',category:'actions',glyph:'arrow',status:'Shared primitive',
    summary:'Give the next step a clear visual weight.',
    description:'One primary action leads the task. Secondary controls remain quiet, and unavailable actions explain why they cannot run.',
    owners:[['atlas-ui.css','Buttons and interaction states'],['atlas-ui.js','Utility icons']],
    variants:[['ready','Available'],['disabled','Unavailable'],['busy','Busy specimen']],
    use:'Use a button for an operation and an anchor for a destination. The preview toggles a local inspection note; it does not save or submit anything.',
    avoid:'Do not show a completed operation when no operation ran. A disabled link needs behaviour, not just a grey appearance.',
    keyboard:'Tab reaches enabled actions. Enter and Space activate native buttons. Disabled buttons do not receive keyboard focus.',
    integration:'Use .atlas-button and .atlas-button-primary. The owning route supplies the action, pending state, recovery and accessible status.'
  },
  {
    id:'badge',label:'Entity badge',category:'identity',glyph:'company',status:'Shared primitive',
    summary:'Name the entity kind; let colour reinforce it.',
    description:'Five categorical pairs distinguish startups, people, partners, providers and programmes without implying verification or performance.',
    owners:[['atlas-ui.js','entityBadge(kind)'],['atlas-ui.css','Badge presentation']],
    variants:[['startup','Startup'],['person','Person'],['partner','Partner'],['provider','Provider'],['programme','Programme']],
    use:'Keep the kind label visible beside an identity. Use the recorded organisation type in profile copy even when its broad graph kind is partner.',
    avoid:'A startup’s green badge does not mean verified, successful or eligible. Research status uses separate warning or error tones.',
    keyboard:'A badge is text, not a button. It adds no keyboard stop. The visible label communicates the same meaning without colour.',
    integration:'Import entityBadge from atlas-ui.js. The renderer escapes the kind and uses the canonical kindName labels.'
  },
  {
    id:'entity-row',label:'Entity row',category:'identity',glyph:'list',status:'Shared renderer',
    summary:'Scan identity, context and recorded connections.',
    description:'A fixed identity mark supports a wrapping name, short summary, kind and graph destination. The directory owns the same renderer.',
    owners:[['atlas-ui.js','renderEntityRow(item, connections)'],['atlas-ui.css','Shared row presentation']],
    variants:[['startup','Startup'],['person','Person'],['partner','Partner'],['long','Long name'],['missing','Missing research']],
    use:'Count only recorded relationships. The preview adapts the canonical renderer’s profile and graph links to a local fictional detail disclosure.',
    avoid:'Do not synthesize a real logo, call unknown connections zero or truncate the complete accessible entity name.',
    keyboard:'The name and connections are distinct links. Preview links open the local disclosure and place focus on its heading.',
    integration:'Pass a validated entity and an integer connection count, or null when it is unknown. Production routes retain real entity and graph URLs.'
  },
  {
    id:'search',label:'Search & clear',category:'navigation',glyph:'search',status:'Shared enhancement',
    summary:'Narrow a set and recover from no matches.',
    description:'An explicit label, immediate clear action and full result count make a small search understandable without a separate help layer.',
    owners:[['atlas-ui.js','data-atlas-clear-for enhancement'],['atlas-ui.css','Search and clear presentation']],
    variants:[['ready','All fixtures'],['filtered','Matching query'],['empty','No matches']],
    use:'Try Aster, Maya or Northbank. This preview searches three fictional labels locally; changing the variant restores its starting query.',
    avoid:'Do not confuse a no-match result with a failed dataset. Do not submit intermediate IME composition text.',
    keyboard:'Tab reaches the field and its clear button when nonempty. Clear returns focus to the input and updates results immediately.',
    integration:'Pair a real label with .atlas-search-control and data-atlas-clear-for. The route owns matching, composition handling and committed URL state.'
  },
  {
    id:'source',label:'Source disclosure',category:'research',glyph:'source',status:'Documented composition',
    summary:'Keep evidence close and detail within reach.',
    description:'A short claim can expand into a source title, review date and careful statement of what that source establishes.',
    owners:[['design-workbench.js','Native disclosure specimen'],['atlas-ui.css','Shared type and controls']],
    variants:[['closed','Collapsed'],['expanded','Expanded']],
    use:'Use a native details/summary when source context is optional. The specimen note is fictional and is deliberately not an external citation.',
    avoid:'Do not use a logo as proof of affiliation. Review date, event date and publication date are different fields.',
    keyboard:'The summary is a native control. Enter or Space expands it; Tab then reaches any links inside. No focus trap is needed.',
    integration:'This is a composition recipe, not a new data reader. Operational routes must supply validated source URLs, provenance and date semantics.'
  },
  {
    id:'claim',label:'Claim & coverage',category:'research',glyph:'info',status:'Documented composition',
    summary:'Separate a recorded value from an unknown.',
    description:'A fact carries its unit, scope and temporal qualifier. Missing information stays explicit instead of becoming a plausible-looking number.',
    owners:[['design-workbench.js','Fact and coverage composition'],['atlas-ui.css','Coverage and status presentation']],
    variants:[['recorded','Recorded amount'],['historical','Historic observation'],['unknown','Not recorded']],
    use:'Keep the currency and observation date with a monetary claim. Give a coverage denominator the same prominence as its numerator.',
    avoid:'An announcement amount is not a current valuation or lifetime funding total. An unknown amount is not zero.',
    keyboard:'Facts use a definition list and normal reading order. Additional context is available through a labelled native disclosure.',
    integration:'Domain models own comparability and date parsing. These fixture values show presentation only and never enter the Atlas snapshot.'
  },
  {
    id:'relationship',label:'Relationship',category:'research',glyph:'graph',status:'Documented composition',
    summary:'Read the predicate before following the line.',
    description:'Two named entities and a specific predicate describe a connection. Source context states the limits of that relationship.',
    owners:[['design-workbench.js','Relationship composition'],['atlas-ui.js','Entity badges and icons']],
    variants:[['founded','Founder connection'],['portfolio','Portfolio listing'],['unknown','Unresearched connection']],
    use:'Name the relationship explicitly: founded, listed in portfolio, or works at. The preview contains fictional entities and no claimed affiliation.',
    avoid:'A portfolio listing is not proof of a round investment, date or amount. Visual proximity alone never establishes an edge.',
    keyboard:'Read the relationship in source → predicate → target order. Its native disclosure exposes the evidence note without pointer-only interaction.',
    integration:'Graph and profile routes remain owners of sourced relationships. This recipe composes shared badges with semantic text and a native disclosure.'
  },
  {
    id:'status',label:'Research states',category:'actions',glyph:'warning',status:'Shared composition',
    summary:'Explain what is available and what to do next.',
    description:'Loading, ready, empty, partial and unavailable states need different language. A stable content region keeps recovery controls in context.',
    owners:[['atlas-ui.css','.atlas-empty and .atlas-coverage'],['design-workbench.js','Local state transitions']],
    variants:[['ready','Ready'],['loading','Loading'],['empty','No results'],['partial','Partial data'],['error','Unavailable']],
    use:'Use the variant selector to compare states. Recovery controls change this local specimen to ready; they do not trigger a network request.',
    avoid:'Do not hide a failed data source behind a zero count. A profile can remain useful when one optional source is unavailable.',
    keyboard:'Recovery is a native button. After recovery, focus moves to the ready heading; an accessible status announces the new specimen state.',
    integration:'The owning route supplies real loading and retry behaviour. Preserve known content during partial failure and leave a reachable recovery path.'
  },
  {
    id:'navigation',label:'View navigation',category:'navigation',glyph:'treemap',status:'Shared renderer',
    summary:'Choose a perspective without changing the brand.',
    description:'List, treemap and graph are destinations. Their route navigation uses links, while the working catalogue’s preview switch uses tabs.',
    owners:[['atlas-ui.js','renderViewNavigation(active)'],['atlas-ui.css','View-link presentation']],
    variants:[['directory','List current'],['treemap','Treemap current'],['graph','Graph current']],
    use:'The specimen highlights the chosen route and links to the real Atlas views. Open a route to inspect its current implementation.',
    avoid:'Do not use tab semantics for navigation to another page, or promise that every filter transfers across views.',
    keyboard:'Every destination is a native link. The selected example exposes aria-current; normal browser navigation and new-tab behaviour remain available.',
    integration:'Use renderViewNavigation and installAtlasUI. Supported query propagation remains in the shared enhancement; domain filters stay route-owned.'
  }
];

export const componentSpecs = Object.freeze(definitions.map(record => Object.freeze({
  ...record, owners:Object.freeze(record.owners.map(Object.freeze)), variants:Object.freeze(record.variants.map(Object.freeze))
})));
export const componentSpecById = Object.freeze(Object.fromEntries(componentSpecs.map(record => [record.id,record])));

export function resolveComponentState(params) {
  const component = Object.hasOwn(componentSpecById,params.get('component')) ? params.get('component') : 'actions';
  const record = componentSpecById[component];
  const variant = record.variants.some(([id]) => id === params.get('variant')) ? params.get('variant') : record.variants[0][0];
  const category = componentCategories.some(item => item.id === params.get('componentKind')) ? params.get('componentKind') : 'all';
  return {component,variant,category,query:(params.get('componentq') || '').slice(0,160)};
}

export function filterComponentSpecs(query = '', category = 'all') {
  const terms = String(query).trim().toLocaleLowerCase('en-AU').split(/\s+/).filter(Boolean);
  return componentSpecs.filter(record => (category === 'all' || record.category === category) && terms.every(term =>
    `${record.label} ${record.summary} ${record.description} ${record.category} ${record.status} ${record.variants.map(item => item[1]).join(' ')}`.toLocaleLowerCase('en-AU').includes(term)
  ));
}
