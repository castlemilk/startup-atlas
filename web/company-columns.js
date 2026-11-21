import { countryName } from './atlas-exploration.js';
import { sourceUrl } from './logic.js';
import { formatValue, validYear } from './treemap-model.js';

const collator = new Intl.Collator('en', {sensitivity:'base', numeric:true});
const field = key => record => record[key] || null;

// Each entry drives the chooser, table, mobile labels and sort menu.
export const companyColumns = new Map([
  ['technology', {label:'Technology type', sort:'Technology type A–Z', read:field('technology')}],
  ['headquarters', {label:'Headquarters', sort:'Headquarters A–Z', read:field('headquarters')}],
  ['stage', {label:'Recorded stage', sort:'Recorded stage A–Z', read:field('stage')}],
  ['sector', {label:'Sector', sort:'Sector A–Z', read:field('sector')}],
  ['founders', {label:'Founders', read:field('founders')}],
  ['founded', {label:'Founded', sort:'Newest founding year', descending:true, read:field('founded')}],
  ['connections', {label:'Connections', sort:'Most connections', descending:true, read:record=>record.connections}],
  ['value', {
    label:'Company value',
    read:record=>record.figure ? formatValue(record.figure.value,record.figure.basis,record.figure.currency) : null,
    note:record=>{
      if (!record.figure) return '';
      const {basis,event}=record.figure;
      return basis==='market-cap' ? `Market cap · ${event.observed_on}` : `Private valuation · ${event.announced_on}`;
    },
  }],
  ['source-check', {label:'Last profile fact review', sort:'Most recent profile fact review', descending:true, read:field('newestFactReview')}],
]);

export const defaultCompanyColumns = ['technology','headquarters','stage'];

export function indexCompanyMetadata(graph, dimensions, values) {
  const entities=new Map(graph.entities.map(entity=>[entity.id,entity]));
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
    const entity=entities.get(id);
    const {country,city}=dimension;
    const figure=values.get(id);
    records.set(id,{
      ...dimension,
      headquarters:country ? [city,countryName(country)].filter(Boolean).join(', ') : null,
      founded:validYear(entity.founded_year) ? entity.founded_year : null,
      connections:neighbors.size,
      founders:[...people].map(person=>entities.get(person).name).sort(collator.compare).join(', '),
      figure:figure && !figure.reason ? figure : null,
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
  const order=collator.compare(left,right);
  return (column.descending ? -order : order) || nameOrder;
}
