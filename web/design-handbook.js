import concepts from './design-concepts.js';

// Editorial guidance for the handbook and asset library. Runtime tokens remain
// in design-tokens.css; research facts remain in the published Atlas snapshot.
export const principles = [
  {
    id: 'evidence', number: '01', title: 'Keep evidence beside the claim.',
    summary: 'A useful Atlas record lets a reader understand what is known, where it came from and what remains uncertain without leaving the immediate context.',
    do: [
      'Place the source and relevant date beside a fact, funding observation or relationship.',
      'Name the recorded relationship: founded, team member or listed in portfolio.',
      'Use a neutral initial when a sourced image is absent; keep the identity footprint stable.'
    ],
    avoid: [
      'A verified-looking badge that turns one reviewed source into a guarantee about the whole company.',
      'Inferring an investment, affiliation or eligibility from a logo, name match or position on a map.',
      'An attractive profile grid filled with invented sectors, locations, dates or financial values.'
    ]
  },
  {
    id: 'purpose', number: '02', title: 'Give each view a clear job.',
    summary: 'The five views share an identity while supporting different decisions: find a record, compare a measure, follow a connection or understand an entity in depth.',
    do: [
      'Lead search with identity and relevance, a treemap with its measure, and a graph with its root and relationship context.',
      'Give a profile one obvious next step into its connections, with evidence as a close secondary action.',
      'Choose a list, table, map or reading column because it suits the information.'
    ],
    avoid: [
      'Forcing every view into the same card grid or filling the top of every page with summary metrics.',
      'Presenting a visual concept control as an available feature before its behaviour and data exist.',
      'Using a graph to imply financial scale or a treemap to imply unsourced relationships.'
    ]
  },
  {
    id: 'orientation', number: '03', title: 'Preserve the reader’s place.',
    summary: 'Inspection should deepen an existing question. Scope changes and navigation should happen through deliberate, clearly named actions.',
    do: [
      'Keep graph inspection separate from rerooting; use Explore from here to change the neighbourhood.',
      'Retain supported query, filter and displayed-range state when returning from a profile.',
      'Distinguish route links, section anchors and in-place actions through native semantics and specific labels.'
    ],
    avoid: [
      'Rebuilding the map when a reader only selects a node, or resetting a list while opening a source.',
      'Calling Fit view and Reset layout the same operation.',
      'Promising exact scroll, camera or saved-workspace restoration when only URL and return-route context are stored.'
    ]
  },
  {
    id: 'scope', number: '04', title: 'Make the limits readable.',
    summary: 'Coverage, dates and exclusions are part of the result. A small researched sample can be useful when its boundaries are explicit.',
    do: [
      'State the population, matching total and displayed range; label a partner’s researched company sample as a sample.',
      'Compare one defined monetary measure in one currency and retain its announcement date.',
      'Give no results, unresearched data, partial loading and total failure different explanations and recovery paths.'
    ],
    avoid: [
      'Turning missing funding into zero, a portfolio sample into the full portfolio, or an old valuation into a current one.',
      'Adding figures across currencies, overlapping rounds or overlapping company groups without an explicit model.',
      'Displaying an unavailable dataset as a complete empty result.'
    ]
  },
  {
    id: 'access', number: '05', title: 'Keep every route to understanding open.',
    summary: 'Responsive design changes the reading order and available space while preserving the task, the evidence and a usable next action.',
    do: [
      'Pair graph exploration with a connections list and treemap tiles with a ranked list.',
      'Stack inspectors into document flow on small screens; wrap names and keep controls reachable.',
      'Provide visible keyboard focus, non-drag actions and the same settled state under reduced motion.'
    ],
    avoid: [
      'Shrinking an entire desktop workspace until its node labels and source links become unreadable.',
      'Encoding entity kind, uncertainty or selection through colour alone.',
      'Hiding scrollbars, trapping page scrolling outside a visualization, or placing essential evidence only on hover.'
    ]
  }
];

export const brandAnatomy = [
  {
    id: 'identity', title: 'A field-guide signature', role: 'Recognition and orientation',
    guidance: 'Retain the compact four-part mark and readable Startup Atlas wordmark. The shared forest masthead provides one stable point of return and the List & search, Treemap and Graph routes while the content beneath it changes.',
    do: ['Keep the mark small enough that the company or research question remains the page’s subject.', 'Use a clear home link and name the current design or explorer surface.'],
    avoid: ['Recreating real company logos in the Atlas house style.', 'Using the Atlas mark as a source-verification or investment-quality seal.']
  },
  {
    id: 'type', title: 'Editorial headings, precise interface text', role: 'Voice and information hierarchy',
    guidance: 'Georgia carries page headings and entity names in rows, profiles and graph cards. System sans carries controls, supporting facts and evidence. Monospaced text is reserved for tokens and code; tabular figures support comparison.',
    do: ['Use the shared 12, 13, 15 and 18px scale for supporting interface roles, with responsive display headings.', 'Let complete entity names wrap; keep sources and key actions readable at narrow widths.'],
    avoid: ['Serif display styling on dense filters or every financial number.', 'Reducing the whole interface to small annotation text to fit more records.']
  },
  {
    id: 'surfaces', title: 'Paper, canvas and a measured accent', role: 'Task hierarchy',
    guidance: 'Paper frames the operational pages. The pale green canvas supports sustained exploration. White gives controls and research panels a clear surface. Forest carries structure and the graph root; terracotta marks the inspected selection and its profile action.',
    do: ['Consume the shared --atlas-* tokens and use thin rules before adding elevation.', 'Reserve the overlay shadow for overlays and maintain a visible boundary around controls.'],
    avoid: ['A new palette for every route, decorative gradients or a shadow on every fact.', 'Treating a browser dark-mode preference as a complete supported dark theme.']
  },
  {
    id: 'rhythm', title: 'Space follows the research task', role: 'Density and composition',
    guidance: 'Build with the 4, 8, 12, 16, 24, 32 and 48px spacing scale. Use 8px control corners and 13px panel corners. Broad workspaces pair the research with an adjacent inspector; profile columns organise a dossier and its context rail.',
    do: ['Align names, metadata and evidence consistently within rows and fact lists.', 'Separate major profile sections with whitespace and rules; keep one purposeful primary action.'],
    avoid: ['Turning every label/value pair into its own card.', 'Using a fixed-height application shell that clips long profiles or source notes.']
  },
  {
    id: 'meaning', title: 'State has a consistent meaning', role: 'Recognition beyond colour',
    guidance: 'Named entity badges describe type. Warning and error tones describe availability. The dark graph root, terracotta inspected outline and dashed keyboard focus remain distinct even when they apply to the same node.',
    do: ['Pair a categorical mark with its text label and expose toggles through selected or pressed semantics.', 'Use white focus outlines on dark headers and the focus token on pale surfaces.'],
    avoid: ['Using green to imply an organisation is verified, funded or performing well.', 'Reusing an entity-kind colour as the sole sign of a warning or error.']
  },
  {
    id: 'imagery', title: 'Illustration makes room for the idea', role: 'Editorial support',
    guidance: 'Use symbolic illustrations at introductions and section transitions. The five numbered interface wireframes define the visual composition; their generated text and figures are illustrative. Actual records, charts and relationships continue to come from the implemented views.',
    do: ['Keep generated concepts visibly labelled and let readers open the corresponding working view.', 'Place transparent artwork on a calm surface and keep text and controls outside its detailed areas.'],
    avoid: ['Using a generated network as evidence of a real connection or generated chart geometry as quantitative data.', 'Putting decorative art behind a source list, obscuring controls or substituting illustration for a real empty-state explanation.']
  }
];

export const voiceExamples = [
  {id:'discovery',situation:'Introduce search',prefer:'Explore companies, people and their connections.',avoid:'Unlock the world’s most powerful startup intelligence.',why:'Describe the task in plain language; avoid unsupported superlatives.'},
  {id:'missing',situation:'Funding research is absent',prefer:'Funding has not been researched yet.',avoid:'Total funding: $0.',why:'An absent record is a research limitation, not a financial finding.'},
  {id:'sample',situation:'Show partner coverage',prefer:'[Count] companies researched · selected sample.',avoid:'Portfolio size: [count].',why:'Name the population actually counted; do not imply completeness.'},
  {id:'money',situation:'Describe a dated observation',prefer:'Recorded valuation · [currency] [amount] · Announced [date].',avoid:'Current company value: [amount].',why:'Keep the measure, currency and date attached to the figure.'},
  {id:'relationship',situation:'Describe a portfolio relationship',prefer:'Listed in portfolio · View evidence.',avoid:'Invested in this company’s latest round.',why:'A portfolio listing does not establish a particular funding event.'},
  {id:'unavailable',situation:'Optional company research fails',prefer:'Company research could not be loaded. Reload to try again.',avoid:'This organisation has no portfolio companies.',why:'Explain the failed request without turning it into a claim about the organisation.'},
  {id:'graph-action',situation:'Change the graph root',prefer:'Explore from here.',avoid:'Expand.',why:'Name a new starting point; reserve expansion language for an implemented branch-expansion action.'},
  {id:'saved',situation:'Explain an opportunity save',prefer:'Saved in this browser.',avoid:'Added to your shared research workspace.',why:'Describe the existing local preference without implying an account, sync or entity collections.'}
];

export const motion = {
  tokens: [
    {token:'--atlas-duration-fast',value:'140ms',valueMs:140,role:'Small control feedback: hover, press and surface changes.'},
    {token:'--atlas-duration-normal',value:'220ms',valueMs:220,role:'A simple change of emphasis or local component state when a transition helps orientation.'}
  ],
  easing: {token:'--atlas-ease',value:'cubic-bezier(.2,.8,.2,1)'},
  rules: [
    'Update the selected state and its accessible label immediately. A transition may explain the change, but must not delay the action.',
    'Use short colour, border or opacity changes. Keep research text readable throughout; avoid bouncing cards, ambient network drift and animated numbers.',
    'Preserve graph geometry during inspection. Force movement serves layout after a scope or arrangement change, not decoration.',
    'Treat Fit view as a camera operation and Reset layout as an arrangement operation. The animation must not conceal which state changed.',
    'The 140ms and 220ms tokens describe interface transitions, not loading deadlines or a fixed graph-simulation duration. Show real pending work honestly.'
  ],
  reducedMotion: [
    'The runtime sets both duration tokens to 0ms under prefers-reduced-motion: reduce; consume those tokens instead of overriding them locally.',
    'Remove decorative and prolonged movement while preserving selection, focus, actions and the settled graph result.',
    'A motion example must remain operable with animation removed. Show its resulting state through text and selection styling.'
  ]
};

const viewDocs = anchor => [
  {label:'Explorer specification',href:'./docs/EXPLORER-VIEWS.md#'+anchor},
  {label:'Interaction contract',href:'./docs/UX-CONTRACT.md'},
  {label:'Design direction',href:'./docs/DESIGN-DIRECTION.md'}
];

export const viewPlaybooks = [
  {
    id:'list-search',title:'List & search',question:'Which records deserve a closer look?',
    purpose:'Help a founder find an entity or opportunity, understand why it matches and choose a useful profile, graph or source link.',
    layout:[
      'Scope first: make All, Opportunities and Partner index distinct. Put the query and the filters relevant to that scope together.',
      'Results second: lead each mixed-entity row with identity, a short description and a named type. Keep evidence and graph navigation secondary.',
      'Count before pagination: show the full matching total and the displayed range beside the result list, then offer explicit Load more.',
      'Adjacent inspection: All rows have explicit Inspect controls and a 350px non-modal panel, reduced to 310px at 1200px and below. Stack at 900px and below; the entity name remains a real profile link.'
    ],
    interaction:[
      'Keep focus in the active query or filter. Clearing the query applies immediately and returns focus to the search input.',
      'Changing a query or filter resets the displayed range. Load more reveals another bounded slice and updates the shown parameter.',
      'Opening a profile preserves the originating route and supported filters/range where session storage is available.',
      'Carry a query to another view only with an honest account of that destination’s population and matching rules.'
    ],
    dataBoundaries:[
      'All contains multiple entity types; a company treemap contains startups only. Identical query text does not mean an identical result population.',
      'Opportunity market and eligibility filters differ from partner office-location and identity-review filters. Do not transfer incompatible hidden restrictions.',
      'Count every matching record before slicing. A displayed batch is not the complete result total.',
      'Browser-local opportunity saves are implemented; saved entities, saved searches, comparison and shared collections are separate work.'
    ],
    accessibility:[
      'Use a semantic list for mixed entities and a table only when columns describe genuinely comparable fields.',
      'Label search independently of its placeholder, preserve complete names and make the clear action keyboard reachable.',
      'Respect text composition and avoid excessive result announcements while typing.',
      'Check native selectors and the existing authored facet menus for keyboard choice, Escape, focus return and narrow-width behaviour.'
    ],
    current:[
      'Cross-entity search and entity-kind choice, plus opportunity and partner-specific filter scopes.',
      'Twelve initial results and twelve more per Load more action, with matching total and displayed-range reporting.',
      'URL query/filter/shown state; valid displayed-range restoration is capped at 1200 records.',
      'Real profile and graph links, safe per-tab profile return context and browser-local opportunity saves.',
      'Local All-scope inspection, a terracotta selected row, sourced detail, close-to-row focus return and detail-heading focus on narrow screens. Selection clears when the row leaves the current results; it is not yet URL state.'
    ],
    next:[
      'Persist the locally inspected entity in the URL, preserving the existing close action, return focus and query/filter context.',
      'Restore an exact list scroll anchor without losing the existing supported range and filters.',
      'Add structured startup facets only after their sourced field definitions and coverage are available.',
      'Define entity collections and comparison independently from the existing opportunity-save preference.'
    ],
    route:'./?type=startup#directory',pattern:'search',docs:viewDocs('list-and-search')
  },
  {
    id:'treemap',title:'Company treemap',question:'How does this researched selection compare under one measure?',
    purpose:'Make relative scale inspectable while keeping the selected measure, currency, observation dates and coverage visible.',
    layout:[
      'Measure bar: place metric, currency, grouping and company search above the canvas; keep Treemap and Ranked list as equivalent ways to inspect the same selection.',
      'Coverage line: explain the plotted population and excluded records beside the measure, before the reader interprets area.',
      'Canvas: use proportional rectangles with identity marks that respect the available space; tiny labels must not be the only route to a company.',
      'Evidence inspector: use a 350px rail, reduced to 310px at 1200px and below and stacked at 820px and below. Keep the plotted observation, its date, source, currency and Open full profile action together.',
      'Narrow layout: stack the company detail into document flow and preserve a readable ranked-list alternative.'
    ],
    interaction:[
      'Selecting a tile or its ranked-list equivalent identifies the same company and exposes the same observation.',
      'Changing metric or currency recomputes eligibility and coverage together; the title and inspector must not retain the previous measure.',
      'Founding-decade drill-down changes the visible cohort. Reset restores the route’s reviewed defaults.',
      'Open a founder, company profile or source through a real link, retaining the originating comparison route where supported.'
    ],
    dataBoundaries:[
      'Company count assigns one unit per startup. Financial metrics require a positive numeric value, valid announcement date, selected currency and source.',
      'Funding announcement amount describes an event, not cumulative funding. Recorded valuation is a historical observation, not a current valuation or public market capitalisation.',
      'Choose the latest eligible observation for the selected measure/currency. Keep a newer-unplotted-event notice when a later event is not comparable.',
      'Do not parse money from prose, silently convert currencies, count missing values as zero or sum overlapping events.',
      'Founding decade is the implemented grouping. Sector, geography and partner groupings need reviewed classifications and explicit overlap rules.'
    ],
    accessibility:[
      'Provide keyboard-operable tile controls and an equivalent ranked list with complete company names and sources.',
      'Keep selection distinct from hover and give the inspector a meaningful heading in normal reading order.',
      'Retain label and value access when tiles are too small for text; logos alone do not identify every company.',
      'At narrow widths, keep measure controls usable and prefer readable detail over a uniformly shrunken chart.'
    ],
    current:[
      'Company-count, funding-announcement and recorded-valuation measures with explicit currency, search and founding-decade controls.',
      'Proportional tiles, ranked list, cohort drill-down, coverage and source-linked observation details.',
      'The inspector also exposes sourced founder links/portraits, recorded company facts and separate financial context where available.',
      'Metric, currency, grouping, query, cohort and list mode have route state; the selected company does not yet have a dedicated deep-link parameter.'
    ],
    next:[
      'Persist selected-company state so a shared comparison link can reopen the intended inspector.',
      'Add sourced sector and geography groupings with a clear rule for companies in more than one category.',
      'Introduce partner-scoped distributions with unique company IDs and visible relationship/sample boundaries.',
      'Carry compatible originating scope between list and treemap through a documented adapter.'
    ],
    route:'./treemap.html?metric=funding&currency=USD',pattern:'treemap',docs:viewDocs('treemaps')
  },
  {
    id:'graph',title:'Relationship graph',question:'How is this entity connected, and what should I follow next?',
    purpose:'Explain a bounded neighbourhood of sourced relationships while letting the reader inspect a connection without losing the existing map.',
    layout:[
      'Root context: name the entity above the canvas. Search, entity types, depth and the connections-list toggle share one white toolbar.',
      'Canvas: use the pale dot grid, dark root, serif names, named kind chips and terracotta inspected outline. Clear edge segments carry real recorded predicates; internal layout groups do not add visible relationship boundaries.',
      'Inspector: join a 360px rail to the canvas without a gap, reducing it to 300px at 1150px and below. Identify the selection and its map context, with separate Open profile and Explore from here actions.',
      'Equivalent list: expose visible connections and their evidence through a readable list, with a clear disclosure when the map is limited.',
      'Responsive composition: retain the horizontal camera dock and stack the joined inspector at 820px and below, with the connections list available for readable relationship detail.'
    ],
    interaction:[
      'Click or Enter/Space inspects a node. Selection does not change the root or discard the current arrangement.',
      'Explore from here deliberately reroots the neighbourhood. Selecting a search result also starts a new root.',
      'Dragging or arrow-key movement arranges a node. Fit view changes the camera; Reset layout restores automatic placement.',
      'Selection-only Back within the same root, depth and type filters preserves the existing geometry and camera. A scope change or reload can recompute layout.',
      'A related entity may be inspected outside the rendered neighbourhood; label that state instead of inventing an on-map position.'
    ],
    dataBoundaries:[
      'Use the real predicate: founded, listed in portfolio, team member or another recorded relationship. Visual proximity is not evidence.',
      'A portfolio or support relationship does not establish a particular funding-round investment or the partner who led it.',
      'One or two hops and density limits define the visible neighbourhood. State when it is capped; do not imply the visible map is complete.',
      'Entity-type filters are implemented; incremental branch expansion and relationship-type filters remain separate features.'
    ],
    accessibility:[
      'Keep root, inspection and keyboard focus visibly distinct; repeat entity kinds and relationship meaning in text.',
      'Provide a non-drag route for positioning and a non-visualization route to each visible relationship and source.',
      'Preserve useful focus when a reroot removes the triggering node, and give icon-only controls clear accessible names.',
      'Respect reduced motion and prevent canvas gestures from trapping page scrolling outside the graph.'
    ],
    current:[
      'One/two-hop neighbourhoods, type filters, search, a force-directed layout and a source-linked connections list.',
      'Root/selection separation, an inspector with explicit rerooting, and an Outside current map state.',
      'Pointer dragging, keyboard node movement, zoom, Fit view and Reset layout.',
      'Root, selection, depth, types, query and list visibility are encoded in the route; camera and manual positions are not persisted across reload.',
      'A shared toolbar, joined inspector, dark root, terracotta selection and distinct focus; sparse predicate captions avoid cards, and the horizontal camera dock remains available on narrow screens.'
    ],
    next:[
      'Design deliberate branch expansion with omitted-connection counts and a reversible scope change.',
      'Add relationship-type filters only when their names and inclusion rules are clear.',
      'Define persistence and reset behaviour for pins, camera and arrangements across reload and root changes.',
      'Improve dense mobile maps while preserving the overview, readable connections list and selected detail.'
    ],
    route:'./graph.html?entity=startup%3Acanva&depth=2',pattern:'graph',docs:viewDocs('relationship-graph')
  },
  {
    id:'startup',title:'Startup explorer',question:'Who built this company, and what is known about it?',
    purpose:'Present a company as a sourced research dossier, with founders and meaningful connections at the centre of the next exploration step.',
    layout:[
      'Identity: complete name, sourced summary, type and one primary Explore connections action. Follow with a compact statement of research coverage.',
      'Section anchors: Founders, Company, Funding, Connections and Sources lead to real headings in one document.',
      'Founder-first content: link each recorded founder as a person with relationship evidence, then present company facts in aligned label/value/source rows.',
      'Funding history: group each event’s stage, date, amount, valuation and note without implying that different measures are interchangeable.',
      'Evidence rail: keep source links and article context close to the dossier; stack the rail after the relevant content on narrow screens.'
    ],
    interaction:[
      'Open a founder to follow other researched ventures, or choose Explore connections to keep the same startup as graph root.',
      'Section anchors change the reading position without replacing the original return context.',
      'Keep website, source and internal entity links recognisable as different destinations.',
      'A directly opened or unavailable profile retains a useful graph/directory route even without saved session context.'
    ],
    dataBoundaries:[
      'Founders come from sourced founded relationships. A matching name or team role alone is insufficient.',
      'Missing founders or funding means unresearched information, not a founderless or unfunded company.',
      'Keep founding, product-launch, announcement and review dates separate. Rebuilding the snapshot does not refresh an old observation.',
      'Retain an announcement’s original currency uncertainty and instrument notes; do not infer round investors from portfolio connections.',
      'Structured sectors, operating geography, company status and ownership history need source-backed records before becoming universal profile fields.'
    ],
    accessibility:[
      'Use a logical heading order and real anchors; all research sections remain available in document flow.',
      'Wrap complete names and long source titles without forcing horizontal page scrolling.',
      'Give portraits/logos stable footprints with neutral fallbacks; adjacent names carry identity.',
      'Keep primary actions, source links and the original return link reachable at desktop and narrow widths.'
    ],
    current:[
      'Identity, research coverage, prominent founders, sourced company facts, funding events, connections and articles.',
      'Founders/Company/Funding/Connections/Sources anchors; generic person and programme pages expose only applicable sections.',
      'Source-linked historical amounts and explicit unresearched states, including unspecified currency where recorded.',
      'Contextual graph entry and safe internal return routes with supported originating filters and displayed range.'
    ],
    next:[
      'Build a dated company timeline that distinguishes operational milestones, ownership and funding events.',
      'Add structured sectors, geography and status only as their provenance and review model become available.',
      'Introduce event-specific investors and ownership history through explicit relationships, not inferred portfolio links.',
      'Define comparable-company discovery with sourced criteria and a visible explanation of why a company appears.'
    ],
    route:'./entity.html?id=startup%3Acanva',pattern:'startup',docs:viewDocs('startup-explorer')
  },
  {
    id:'partner',title:'Partner / VC explorer',question:'Which companies, people and programmes connect to this organisation?',
    purpose:'Explain an organisation’s recorded role and the scope of its researched relationships, with companies before team members and programme details.',
    layout:[
      'Identity: name the sourced organisation type and summary, with Explore connections as the primary route into its network.',
      'Coverage: place Companies researched and People researched in the context of a selected sample, not an assumed full portfolio or team.',
      'Company section: put the researched companies before people. Each entry exposes its relationship/source, a profile link and an explicit Inspect control for the adjacent selected-company panel.',
      'People and programmes: keep role labels, optional programme supporters and programme relationships separate from company investments.',
      'Sources: explain identity review, sample review and geography/eligibility distinctions; retain the same document-flow hierarchy on small screens.'
    ],
    interaction:[
      'Use real section anchors and profile links to move through companies, people, programmes and sources.',
      'Open the organisation’s graph from its recorded identity, then inspect or reroot using the graph’s existing interaction model.',
      'Optional research failures preserve the organisation identity and explain which section is unavailable.',
      'Future company filters and partner-scoped treemap/graph lenses must act on one explicit researched company set and retain the selected company and relationship context.'
    ],
    dataBoundaries:[
      'Partner is an index category. A venture firm, accelerator, university, venture studio, fund and programme are not interchangeable entities.',
      'A sampled company list is not the full portfolio; a sampled people list is not the complete current team.',
      'Portfolio membership does not prove an event-specific investment, amount, fund identity or individual deal lead.',
      'Office location, investment geography and programme eligibility are different fields. Provider relationships do not guarantee access or credits.',
      'Any future monetary portfolio lens describes company observations, not the organisation’s invested capital, assets under management or returns.'
    ],
    accessibility:[
      'Preserve company-first reading order when the evidence rail stacks; do not move the main sample below a large decorative masthead.',
      'Name organisation type, people’s roles and relationship status in text rather than relying on badges or logos.',
      'Use the shared section/link focus treatment and keep the full identity and source names available.',
      'Distinguish unavailable optional research from a valid unresearched section in visible text and status.'
    ],
    current:[
      'Sourced organisation identity/type, company and people samples, programme/provider relationships and review notes.',
      'Companies before people, optional supporters, section anchors and a graph entry action.',
      'Visible sample boundaries and distinct optional-data failure states.',
      'Partner-name URLs and safe per-tab return context; the profile still has separate JSON readers from the graph-backed entity explorer.',
      'A local selected-company inspector, initially showing the first researched company, with its recorded relationship, source and company profile/graph links. Narrow inspection focuses the detail heading; selection does not yet persist in the URL.'
    ],
    next:[
      'Add partner-scoped company filtering and treemap/graph lenses with deduplicated company IDs and visible coverage.',
      'Add selected-company deep links without changing the partner identity or implying a partner-scoped graph.',
      'Model investment thesis, stages, geography and fund identities through individually sourced, dated fields.',
      'Add relationship/date filters and a documented completeness model for portfolio coverage.',
      'Consolidate data access while preserving partial-data behaviour; migrate to stable IDs only when reviewed aliases and redirects exist.'
    ],
    route:'./partner.html?name=Airtree',pattern:'partner',docs:viewDocs('partner-and-vc-explorer')
  }
];

const conceptUsage = {
  'list-search':['Review filtering, result hierarchy and the adjacent inspector.', 'The All-scope inspector is implemented with local selection. Pictured startup facets and selected-record URL restoration remain subsequent work.'],
  treemap:['Review the relationship between a measure, coverage, tile identity and company context.', 'Discuss spatial hierarchy, not numerical accuracy; sector grouping in the picture is a proposal.'],
  graph:['Review root/selection distinction and a focused relationship neighbourhood.', 'Discuss an alternative mobile list treatment while checking actual predicates in the working graph.'],
  startup:['Review founder prominence, company facts, timeline direction and evidence placement.', 'Treat the timeline and saved-research actions as proposals beyond the current dossier.'],
  partner:['Review company-first exploration, sample coverage and people/role context.', 'Company inspection is implemented with local selection. Partner-scoped filters, treemap/graph lenses and the thesis section remain proposed extensions.']
};

const conceptAssets = concepts.map(concept => ({
  id:concept.id,title:concept.title,kind:'concept',description:concept.description,
  caption:'Study '+concept.number+' · illustrative interface',alt:concept.alt,
  usage:conceptUsage[concept.id] || ['Review the composition against the corresponding working explorer.'],
  avoid:['Treating fictional names, figures or relationships as Atlas research.', 'Presenting a pictured control as implemented without checking the working view.'],
  tags:[concept.id,'interface','field guide','fictional examples'],
  image:concept.image,thumb:concept.thumb,width:1536,height:1024,transparent:false,
  prompt:concept.prompt,revisionPrompt:concept.revisionPrompt || '',
  status:'Illustrative interface concept',route:concept.route,pattern:concept.pattern
}));

export const directionBoards = [
  {
    id:'direction-field-guide',title:'The editorial field guide',kind:'direction',
    description:'A visual direction board for the Atlas identity: editorial typography, forest structure, paper surfaces and restrained evidence-led composition.',
    caption:'Direction board · shared visual language',
    alt:"Startup Atlas field-guide direction board with forest and paper typography, colour swatches, an annotated fictional Aster record, a source note, and engraved map, connection and folio motifs.",
    usage:['Use to review the overall relationship between brand, interface density and research content.', 'Compare individual treatments with the canonical tokens and working components before adopting them.'],
    avoid:['Extracting generated text or colour samples as canonical specifications.', 'Treating a proposed layout as a released interface.'],
    tags:['brand','typography','palette','editorial','direction'],
    image:'./assets/design-lab/direction-field-guide.webp',thumb:'./assets/design-lab/direction-field-guide-thumb.webp',
    width:1536,height:1024,transparent:false,prompt:"Use case: ui-mockup. Create a polished landscape 3:2 design-direction board for Startup Atlas, a source-backed research tool for founders exploring companies, people and organisations. This is a conceptual design study, not factual company data. Match its approved visual identity: forest ink #173a2b, parchment #f6f0e5, pale working canvas #f4f7ef, white content surfaces, sage borders #d8e1d2, restrained rust #b84d2b, muted leaf/ochre/clay/blue categorical accents. Editorial Georgia-like serif headings paired with clean system-sans interface labels. Very deliberate typography, generous margins, hairline rules, crisp 8px controls and 13px panels. Refined field-guide feel, no neon, purple gradients, generic SaaS decorative charts, glassmorphism, fake KPI walls or stock imagery. Straight-on artwork, no device photograph, no watermarks. Keep all details legible and contained with a clear hierarchy. Include a discreet label 'DESIGN DIRECTION · ILLUSTRATIVE STUDY'.\nPrimary request: an art-directed brand field-guide board titled 'A field guide to possibility.' The composition combines a strong forest masthead with the small established four-tile Atlas mark, a large serif typographic specimen 'Find the entity. Follow the connection.', restrained palette swatches, a small annotated specimen of a company result row using fictional 'Aster', an understated evidence note labelled 'Source recorded', and three small editorial engraved motifs: a folded terrain map and compass, a branching connection sculpture, and a research folio with magnifier. Present these as a cohesive printed research folio, with small rust editorial marks showing where attention belongs. Section labels may read 'Voice', 'Structure', 'Attention', 'Evidence'. The board is about how brand, research and interface belong together. Leave breathing room; no fake hex code claims or performance metrics.",status:'Proposed visual direction'
  },
  {
    id:'direction-responsive',title:'One task across different spaces',kind:'direction',
    description:'A responsive direction study for preserving the research task as space changes: readable results, deliberate inspection and evidence that remains in the reading order.',
    caption:'Direction board · responsive composition',
    alt:"Direction board comparing a fictional Aster research journey across desktop, tablet and mobile, with search, inspection, sources, empty and partial states, and distinct selection and keyboard-focus examples.",
    usage:['Review hierarchy and reading order across desktop and narrow layouts.', 'Use as a discussion aid alongside real 390px browser checks and keyboard review.'],
    avoid:['Scaling down an entire desktop screenshot and calling the result a mobile design.', 'Using this board as proof that every proposed responsive interaction is implemented.'],
    tags:['responsive','reading order','inspection','accessibility','direction'],
    image:'./assets/design-lab/direction-responsive.webp',thumb:'./assets/design-lab/direction-responsive-thumb.webp',
    width:1536,height:1024,transparent:false,prompt:"Use case: ui-mockup. Create a polished landscape 3:2 design-direction board for Startup Atlas, a source-backed research tool for founders exploring companies, people and organisations. This is a conceptual design study, not factual company data. Match its approved visual identity: forest ink #173a2b, parchment #f6f0e5, pale working canvas #f4f7ef, white content surfaces, sage borders #d8e1d2, restrained rust #b84d2b, muted leaf/ochre/clay/blue categorical accents. Editorial Georgia-like serif headings paired with clean system-sans interface labels. Very deliberate typography, generous margins, hairline rules, crisp 8px controls and 13px panels. Refined field-guide feel, no neon, purple gradients, generic SaaS decorative charts, glassmorphism, fake KPI walls or stock imagery. Straight-on artwork, no device photograph, no watermarks. Keep all details legible and contained with a clear hierarchy. Include a discreet label 'DESIGN DIRECTION · ILLUSTRATIVE STUDY'.\nPrimary request: a detailed responsive interaction-direction board titled 'One research journey. Every scale.' Show a believable wide desktop search workspace for fictional company Aster on the left, a tablet company inspector at center, and a narrow mobile connection list on the right, separated by calm editorial rules. On desktop the list and selected inspector sit side by side; on mobile content stacks into a readable flow with an explicit 'Open profile' action. Below, a quiet strip explores three useful UI states labelled 'Nothing matched', 'Some research missing', and 'Ready to explore', each with a specific recovery or next-action button. Use labels 'Search', 'Inspect', 'Follow the source'. Include a small, clear selected-state rust border and a separate visible keyboard focus outline to teach their distinction. All sample entities and source labels are fictional; no money figures, no real logos, no membership or completeness claims. An editorial composition, not a screenshot of a real deployed page.",status:'Proposed visual direction'
  }
];

export const editorialIllustrations = [
  {
    id:'illustration-discover',title:'Discover',kind:'illustration',
    description:'A transparent editorial illustration for the moment a reader begins exploring the Atlas. It supports discovery copy without representing a real company, place or dataset.',
    caption:'Editorial illustration · discovery',
    alt:"Forest-ink engraving of a folded topographic map, compass and closed notebook, with a rust path leading to a lookout tower; the surrounding background is transparent.",
    usage:['Place near an introductory research question or a field-guide section opening.', 'Keep the full silhouette visible with generous surrounding space; use an empty alt when adjacent copy already conveys its decorative purpose.'],
    avoid:['Using decorative imagery instead of a specific no-results explanation.', 'Placing text or interactive controls over the artwork’s detailed areas.'],
    tags:['discovery','editorial','transparent','section opening'],
    image:'./assets/design-lab/illustration-discover.webp',thumb:'./assets/design-lab/illustration-discover-thumb.webp',
    width:1247,height:1261,transparent:true,prompt:"Use case: illustration-story. Create one premium editorial spot illustration for Startup Atlas, the startup ecosystem field guide. Standalone square composition with a truly transparent background and clean alpha, no paper rectangle, no background fill, no checkerboard baked into the image. Elegant original copperplate engraving / fine pen-and-ink linework, controlled cross-hatching and graceful precise geometry. Main ink deep forest #173a2b with a very small rust #b84d2b focal accent and restrained sage tinting. Warm intellectual cartographic atmosphere: the instruments and artefacts of discovery and research. Sparse, refined, not busy. Crisp readable silhouette with generous transparent margins. The illustration must work as a website spot at 250–500 pixels and on either paper or pale-green canvas. No text, letters, numbers, real-world brands, company logos, charts claiming actual relationships or financial figures. No frame, no drop shadow rectangle, no photorealism, no cute cartoon faces, no glow or gradients. The subject is the whole composition, fully visible and not cropped.\nPrimary subject: a partly unfolded topographic field map with a fine compass rose, a small survey compass and one crisp path that leads to a rust observation marker. The topographic contours are abstract fictional terrain, with no map labels or real geographic claims. Place the map at a subtle three-quarter angle so the folded paper geometry and ink contours create a pleasing silhouette. A tiny sprig may appear as a restrained field-note detail, not the main subject. Convey deliberate discovery and choosing a path.",status:'Decorative editorial illustration'
  },
  {
    id:'illustration-connect',title:'Connect',kind:'illustration',
    description:'A transparent editorial illustration about following relationships. Its symbolic connections explain an idea and do not depict researched affiliations or graph data.',
    caption:'Editorial illustration · connections',
    alt:"Forest-ink engraving of a globe linked by curved lines to anonymous portrait medallions and two architectural forms, with a rust ring around the globe and a transparent background.",
    usage:['Introduce relationship exploration or a section about navigation continuity.', 'Pair it with a clear explanation of the actual graph task and a separate working-view link.'],
    avoid:['Using its symbolic topology as evidence of a real affiliation or an exact graph diagram.', 'Adding it behind a live graph where decorative lines could be mistaken for recorded edges.'],
    tags:['connections','editorial','transparent','relationships'],
    image:'./assets/design-lab/illustration-connect.webp',thumb:'./assets/design-lab/illustration-connect-thumb.webp',
    width:1254,height:1254,transparent:true,prompt:"Use case: illustration-story. Create one premium editorial spot illustration for Startup Atlas, the startup ecosystem field guide. Standalone square composition with a truly transparent background and clean alpha, no paper rectangle, no background fill, no checkerboard baked into the image. Elegant original copperplate engraving / fine pen-and-ink linework, controlled cross-hatching and graceful precise geometry. Main ink deep forest #173a2b with a very small rust #b84d2b focal accent and restrained sage tinting. Warm intellectual cartographic atmosphere: the instruments and artefacts of discovery and research. Sparse, refined, not busy. Crisp readable silhouette with generous transparent margins. The illustration must work as a website spot at 250–500 pixels and on either paper or pale-green canvas. No text, letters, numbers, real-world brands, company logos, charts claiming actual relationships or financial figures. No frame, no drop shadow rectangle, no photorealism, no cute cartoon faces, no glow or gradients. The subject is the whole composition, fully visible and not cropped.\nPrimary subject: a graceful physical research constellation, a small sculptural arrangement of five distinct geometric tokens joined by fine curved lines, anchored in a single rust ring. Use a mix of circular people-like tokens and simple architectural company-like blocks, without faces, letters or logos. The structure should feel like a thoughtful cartographer's engraved study of connection, with open negative space and an organic branching rhythm. It is abstract decorative symbolism, not a data diagram; no arrows or purported real relationship labels. Convey following a connection while retaining a clear point of origin.",status:'Decorative editorial illustration'
  },
  {
    id:'illustration-evidence',title:'Evidence',kind:'illustration',
    description:'A transparent editorial illustration about examining sources and context. It supports the evidence principle without acting as a verification mark for individual records.',
    caption:'Editorial illustration · source context',
    alt:"Forest-ink engraving of an open research folio, layered source cards, a magnifying glass and a rust bookmark, on a transparent background.",
    usage:['Introduce source literacy, the evidence principle or research-method documentation.', 'Keep actual source titles, dates and links in adjacent selectable HTML.'],
    avoid:['Using the artwork as a verified-company seal or a substitute for provenance.', 'Embedding factual annotations into the raster image when they need to remain accessible and updatable.'],
    tags:['evidence','sources','editorial','transparent'],
    image:'./assets/design-lab/illustration-evidence.webp',thumb:'./assets/design-lab/illustration-evidence-thumb.webp',
    width:1312,height:1199,transparent:true,prompt:"Use case: illustration-story. Create one premium editorial spot illustration for Startup Atlas, the startup ecosystem field guide. Standalone square composition with a truly transparent background and clean alpha, no paper rectangle, no background fill, no checkerboard baked into the image. Elegant original copperplate engraving / fine pen-and-ink linework, controlled cross-hatching and graceful precise geometry. Main ink deep forest #173a2b with a very small rust #b84d2b focal accent and restrained sage tinting. Warm intellectual cartographic atmosphere: the instruments and artefacts of discovery and research. Sparse, refined, not busy. Crisp readable silhouette with generous transparent margins. The illustration must work as a website spot at 250–500 pixels and on either paper or pale-green canvas. No text, letters, numbers, real-world brands, company logos, charts claiming actual relationships or financial figures. No frame, no drop shadow rectangle, no photorealism, no cute cartoon faces, no glow or gradients. The subject is the whole composition, fully visible and not cropped.\nPrimary subject: an open research folio with layered source cards, a small magnifying lens resting over a quiet passage represented only by nonlinguistic short line marks, a narrow rust bookmark and one precisely drawn paper clip. Include a single detached source card aligned neatly nearby to suggest provenance and context. Avoid fake legible writing, checkmark seals, badges or certification symbols. Convey careful reading, evidence and the confidence to leave something unknown.",status:'Decorative editorial illustration'
  }
];

export const assets = [...directionBoards, ...editorialIllustrations, ...conceptAssets];
