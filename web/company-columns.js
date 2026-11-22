import { companyPlaceLabel } from './atlas-exploration.js';
import { sourceUrl } from './logic.js';
import { formatValue, indexCompanyValues, indexFundingFigures, validYear } from './treemap-model.js';

const collator = new Intl.Collator('en', {sensitivity:'base', numeric:true});
const field = key => record => record[key] === '' ? null : record[key] ?? null;
const compareMoney = (a,b) => collator.compare(a.currency,b.currency) || b.value-a.value;
const ownershipLabels = {public:'Publicly listed',private:'Privately held',subsidiary:'Subsidiary'};

function figureColumn(label, read, note) {
  return {
    label, group:'financial', kind:'figure', sort:`${label} by currency`, compare:compareMoney, read,
    format:figure=>`${figure.event.approximate ? '≈ ' : ''}${formatValue(figure.value,figure.basis,figure.currency)}`,
    note, source:figure=>figure.event.source,
  };
}

export const companyColumnGroups = new Map([
  ['company','Company details'], ['people','People and connections'], ['financial','Financial figures'],
]);

// A column definition drives the chooser, data cell and optional sort.
export const companyColumns = new Map([
  ['technology', {label:'Technology type', group:'company', sort:'Technology type A–Z', read:field('technology')}],
  ['headquarters', {label:'Location', group:'company', sort:'Location A–Z', read:field('headquarters')}],
  ['stage', {label:'Recorded stage', group:'company', sort:'Recorded stage A–Z', read:field('stage')}],
  ['sector', {label:'Sector', group:'company', sort:'Sector A–Z', read:field('sector')}],
  ['founded', {label:'Founded', group:'company', sort:'Newest founding year', descending:true, read:field('founded')}],
  ['ownership', {
    label:'Ownership', group:'company', sort:'Ownership A–Z', read:record=>ownershipLabels[record.ownership?.status] ?? null,
    source:(_,record)=>record.ownership?.source,
  }],
  ['listing', {label:'Exchange and ticker', group:'company', read:field('listing'), source:(_,record)=>record.marketCap?.event.source}],
  ['source-check', {label:'Last profile fact review', group:'company', sort:'Most recent profile fact review', descending:true, read:field('newestFactReview')}],
  ['founders', {label:'Founders', group:'people', kind:'people', read:record=>record.founders?.length ? record.founders : null}],
  ['connections', {label:'Connections', group:'people', sort:'Most connections', descending:true, read:field('connections')}],
  ['value', figureColumn('Company value',field('figure'),({basis,event})=>basis==='market-cap'
    ? `Market cap · ${event.observed_on}` : `Private valuation · ${event.announced_on}`)],
  ['market-cap', figureColumn('Market cap',field('marketCap'),({event})=>event.observed_on)],
  ['private-valuation', figureColumn('Private valuation',field('valuation'),({event})=>event.announced_on)],
  ['funding', figureColumn('Latest disclosed round',field('funding'),({event})=>event.announced_on)],
]);

export const defaultCompanyColumns = ['technology','headquarters','stage'];

export function indexCompanyMetadata(graph, dimensions, research) {
  const values=indexCompanyValues(graph,research), funding=indexFundingFigures(graph);
  const entities=new Map(graph.entities.map(entity=>[entity.id, entity]));
  const records=new Map();
  for (const [id,dimension] of dimensions) records.set(id,{...dimension, neighbors:new Set(), people:new Set()});
  for (const {from,to,kind,source} of graph.edges) {
    if (from===to || !entities.has(from) || !entities.has(to) || !sourceUrl(source)) continue;
    records.get(from)?.neighbors.add(to);
    const record=records.get(to);
    record?.neighbors.add(from);
    if (kind==='founded' && entities.get(from).kind==='person') record?.people.add(from);
  }
  for (const [id,{neighbors,people,...dimension}] of records) {
    const figure=values.get(id);
    const marketCap=figure?.basis==='market-cap' && !figure.reason ? figure : null;
    const valuation=figure?.basis==='valuation' && !figure.reason ? figure : null;
    const foundingYear=entities.get(id).founded_year;
    const founders=[...people].map(id=>entities.get(id)).sort((a,b)=>collator.compare(a.name,b.name) || a.id.localeCompare(b.id));
    records.set(id,{
      ...dimension,
      headquarters:companyPlaceLabel(dimension) || null,
      founded:validYear(foundingYear) ? foundingYear : null,
      connections:neighbors.size,
      founders,
      ownership:research.ownership.get(id),
      listing:marketCap ? `${marketCap.event.exchange} · ${marketCap.event.ticker}` : null,
      figure:marketCap ?? valuation,
      marketCap,
      valuation,
      funding:funding.get(id),
    });
  }
  return records;
}

export function compareCompanyRecords(a, b, key, metadata) {
  const nameOrder=collator.compare(a.name,b.name) || a.id.localeCompare(b.id);
  if (key==='name-desc') return -nameOrder;
  const column=companyColumns.get(key);
  if (!column?.sort) return nameOrder;
  const left=column.read(metadata.get(a.id) ?? {});
  const right=column.read(metadata.get(b.id) ?? {});
  if (left===right) return nameOrder;
  if (left==null) return 1;
  if (right==null) return -1;
  if (column.compare) return column.compare(left,right) || nameOrder;
  const order=collator.compare(left,right);
  return (column.descending ? -order : order) || nameOrder;
}
