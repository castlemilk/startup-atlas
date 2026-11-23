import { sourceUrl } from './logic.js';

const names = new Intl.DisplayNames(['en'], { type:'region', fallback:'none' });
const isoCountries = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';
const countryCodes = new Set(isoCountries.split(' '));
const canonicalCountry = value => countryCodes.has(value) ? value : '';
export const multipleHeadquarters = 'multiple';
const countryOption = value => value === 'unknown' || value === multipleHeadquarters ? value : canonicalCountry(value);
export const countryName = code => canonicalCountry(code) ? names.of(code) || code
  : code === multipleHeadquarters ? 'Multiple headquarters' : 'Country not recorded';
export function companyPlaceLabel({ country, city, location, businessBase } = {}) {
  if (!country) return '';
  const label = location || [city,countryName(country)].filter(Boolean).join(', ');
  return businessBase ? label + ' · business base' : label;
}
const clean = (value, limit=160) => typeof value === 'string' ? value.trim().normalize('NFC').slice(0,limit) : '';
const entityId = value => /^(?:startup|person|partner|provider|programme):[a-z0-9][a-z0-9_-]{0,159}$/i.test(value || '') ? value : '';
const directoryType = value => ['all','startup','person','partner','provider','programme'].includes(value) ? value : '';
const selection = ids => [...new Set(ids.map(countryOption).filter(Boolean))].sort();

export const companyFacets = [
  {key:'technology',label:'Technology type',all:'All technologies'},
  {key:'sector',label:'Sector',all:'All sectors'},
  {key:'stage',label:'Stage',all:'All stages'},
];
const facetValues = get => Object.fromEntries(companyFacets.map(({key})=>[key,get(key)]));

export function readExploration(params) {
  const drillCountry = countryOption(params.get('place'));
  return {
    query:clean(params.get('q'),200),
    countries:selection(params.getAll('hq')),
    ...facetValues(key=>clean(params.get(key))),
    drillCountry,
    drillCity:canonicalCountry(drillCountry) ? clean(params.get('city')) : '',
    selected:entityId(params.get('selected')),
    graphAnchor:entityId(params.get('anchor')),
    directoryType:directoryType(params.get('type')),
    density:params.get('density')==='compact' ? 'compact' : 'comfortable',
  };
}

export function writeExploration(params,state) {
  params.delete('hq');
  for (const code of selection(state.countries ?? [])) params.append('hq',code);
  const place = countryOption(state.drillCountry);
  for (const [key,value] of [
    ['q',clean(state.query,200)], ...Object.entries(facetValues(key=>clean(state[key]))),
    ['place',place], ['city',canonicalCountry(place) ? clean(state.drillCity) : ''],
    ['selected',entityId(state.selected)], ['anchor',entityId(state.graphAnchor)],
    ['type',directoryType(state.entityKind ?? state.directoryType)], ['density',state.density==='compact' ? 'compact' : ''],
  ]) {
    if (value) params.set(key,value);
    else params.delete(key);
  }
  return params;
}

const countryAliases = new Map([...countryCodes].map(code=>[countryName(code).toLowerCase(),code]));
for (const [label, code] of [['united states of america','US'],['uk','GB'],['usa','US']]) countryAliases.set(label,code);
const countryPattern = [...countryAliases.keys()].sort((a,b)=>b.length-a.length)
  .map(label=>label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
const locationPattern = new RegExp(`(?:^|[^\\p{L}])(${countryPattern})(?=$|[^\\p{L}])`,'giu');
const cityPattern = /([\p{Lu}][\p{L}.'’–-]*(?:[ -][\p{Lu}][\p{L}.'’–-]*){0,3}),\s*$/u;
const sourceDate = value => /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value || '') ? value : '';
const recordedStage = value => /^funding round(?: \(stage (?:not stated|undisclosed)\))?$/i.test(clean(value)) ? '' : clean(value);

export function companyLocationFacts(facts) {
  const sourced = facts.filter(fact => sourceUrl(fact.source));
  const headquarters = sourced.filter(fact => /^(?:(?:(?:reported|global|primary) )?headquarters|co-headquarters)$/i.test(fact.label || ''));
  return headquarters.length ? headquarters : sourced.filter(fact => /^business base$/i.test(fact.label || ''));
}

function headquarters(facts) {
  const locations = new Map();
  const selected = companyLocationFacts(facts);
  for (const fact of selected) {
    const value = clean(fact.value,320);
    const found = [...value.matchAll(locationPattern)];
    const countries = new Set(found.map(match=>countryAliases.get(match[1].toLowerCase())));
    if (/^co-headquarters$/i.test(fact.label)) {
      return countries.size>1 && selected.length===1
        ? {country:multipleHeadquarters,city:'',location:value} : {country:'',city:''};
    }
    if (countries.size!==1) return {country:'',city:''};
    const match = found[0];
    const country = countryAliases.get(match[1].toLowerCase());
    const valueStart = value.indexOf(match[1], match.index);
    const beforeCountry = value.slice(0,valueStart);
    const cityMatch = beforeCountry.match(cityPattern);
    const city = cityMatch && !/,\s*$/.test(beforeCountry.slice(0,cityMatch.index)) ? cityMatch[1] : '';
    const existing = locations.get(country) ?? new Set();
    if (city) existing.add(city);
    locations.set(country,existing);
  }
  if (locations.size!==1) return {country:'',city:''};
  const [[country,cities]] = locations;
  const city = cities.size===1 ? [...cities][0] : '';
  const claim = selected.length===1 ? selected[0] : null;
  const location = clean(claim?.value,320);
  if (/^business base$/i.test(claim?.label || '')) return {country,city,location,businessBase:true};
  return /\(historical\)$/i.test(location) ? {country,city,location} : {country,city};
}

export function indexCompanies(graph, technology = new Map()) {
  const rounds = new Map();
  for (const round of graph.funding_rounds ?? []) {
    if (!sourceUrl(round.source) || !sourceDate(round.announced_on)) continue;
    const prior = rounds.get(round.startup_id);
    if (prior === undefined || round.announced_on > prior.announced_on) rounds.set(round.startup_id,round);
    else if (round.announced_on===prior.announced_on && recordedStage(round.stage)!==recordedStage(prior.stage)) {
      rounds.set(round.startup_id,{announced_on:prior.announced_on,stage:''});
    }
  }
  const index = new Map();
  for (const company of graph.entities) {
    if (company.kind!=='startup') continue;
    const facts = Array.isArray(company.profile_facts) ? company.profile_facts.filter(fact=>sourceUrl(fact.source)) : [];
    const sectorFacts = new Set(facts.filter(fact=>/^primary sector$/i.test(fact.label)).map(fact=>clean(fact.value)).filter(Boolean));
    const explicitSector = sourceUrl(company.sector_source) ? clean(company.primary_sector) : '';
    if (explicitSector) sectorFacts.add(explicitSector);
    index.set(company.id,{
      ...headquarters(facts),
      technology:technology.get(company.id)?.type || '',
      sector:sectorFacts.size===1 ? [...sectorFacts][0] : '',
      stage:recordedStage(rounds.get(company.id)?.stage),
      newestFactReview:facts.map(fact=>sourceDate(fact.reviewed_at)).sort().at(-1) || '',
    });
  }
  return index;
}

export function hasCompanyScope(state) {
  return Boolean(state.countries?.length || companyFacets.some(({key})=>state[key]) || state.drillCountry || state.drillCity);
}

export function filterCompanies(entities,index,state,{ignoreCountry=false,ignoreDrill=false}={}) {
  const countries = new Set(state.countries ?? []);
  return entities.filter(entity=>{
    if (entity.kind!=='startup') return false;
    const company = index.get(entity.id) ?? {};
    const country = company.country || 'unknown';
    return (ignoreCountry || !countries.size || countries.has(country))
      && companyFacets.every(({key})=>!state[key] || state[key]===(company[key] || 'unknown'))
      && (ignoreDrill || ((!state.drillCountry || state.drillCountry===country)
        && (!state.drillCity || state.drillCity===(company.city || 'unknown'))));
  });
}

const oldListParameters = [
  'view', 'q', 'type', 'hq', 'sector', 'stage', 'technology', 'place', 'city', 'selected',
  'coverage', 'columns', 'sort', 'density', 'shown', 'country', 'kind', 'access', 'unknown',
  'provider', 'evidence', 'logo', 'mappedCountry',
];

export function legacyListUrl(url) {
  if (!['','index.html'].includes(url.pathname.split('/').pop())) return null;
  if (!['#directory','#atlas'].includes(url.hash) && !oldListParameters.some(key=>url.searchParams.has(key))) return null;
  const list=new URL('./list.html',url);
  list.search=url.search;
  list.searchParams.delete('coverage');
  if (list.searchParams.has('shown') && !list.searchParams.has('type')) list.searchParams.set('type','all');
  list.hash=url.hash;
  return list;
}

export function explorationHref(path,base,state=readExploration(new URL(base).searchParams)) {
  const next = new URL(path,base);
  writeExploration(next.searchParams,state);
  return next.pathname + next.search + next.hash;
}
