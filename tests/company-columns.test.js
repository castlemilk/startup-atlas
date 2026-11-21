import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexCompanies } from '../web/atlas-exploration.js';
import { companyColumns, compareCompanyRecords, indexCompanyMetadata } from '../web/company-columns.js';
import { indexTreemapEvidence } from '../web/treemap-model.js';

const source='https://example.com/filing';
const day='2026-10-02';
const entity=(id,name,kind='startup')=>({id,name,kind});
const early=entity('startup:early','Early');
const listed=entity('startup:listed','Listed');
const foreign=entity('startup:foreign','Foreign');
const missing=entity('startup:missing','Missing');
const founder=entity('person:founder','Founder','person');
const other=entity('person:other','Other','person');
const fact=(status)=>({status,detail:status,source,observed_on:day});
const cap=(id,amount,currency,observed_on=day)=>({startup_id:id,amount,currency,observed_on,source,ticker:'EX',exchange:'Exchange'});
const graph={
  entities:[early,listed,foreign,missing,founder,other],
  edges:[{from:founder.id,to:early.id,kind:'founded',source},{from:founder.id,to:early.id,kind:'founded',source},
    {from:other.id,to:early.id,kind:'founded',source:'http://example.com'}],
  funding_rounds:[
    {id:'funding',startup_id:early.id,announced_on:day,amount:500,currency:'USD',source},
    {id:'undisclosed',startup_id:early.id,announced_on:'2026-10-03',amount_text:'Undisclosed',source},
  ],
};
const research=indexTreemapEvidence(graph,{
  version:1,
  ownership:{[early.id]:fact('private'),[listed.id]:fact('public'),[foreign.id]:fact('public')},
  market_caps:[cap(listed.id,600,'USD','2026-10-01'),cap(listed.id,1000,'USD'),cap(foreign.id,2000,'AUD')],
  private_valuations:[{id:'note',startup_id:early.id,announced_on:day,stage:'Secondary',valuation:2500,valuation_currency:'USD',source,approximate:true}],
});
const metadata=indexCompanyMetadata(graph,indexCompanies(graph),research);
const get=(key,id)=>companyColumns.get(key).read(metadata.get(id));

test('financial and founder columns retain basis, date and source',()=>{
  assert.equal(get('market-cap',listed.id).value,1000);
  assert.equal(get('market-cap',early.id),null);
  assert.equal(get('private-valuation',listed.id),null);
  assert.equal(get('private-valuation',early.id).event.approximate,true);
  assert.equal(get('value',early.id).basis,'valuation');
  assert.equal(get('funding',early.id).value,500);
  assert.equal(get('funding',early.id).event.announced_on,day);
  assert.equal(get('funding',early.id).event.source,source);
  assert.deepEqual(get('founders',early.id).map(person=>person.id),[founder.id]);
  assert.equal(get('founders',missing.id),null);
  assert.equal(get('connections',missing.id),0);
});

test('financial columns sort numerically within currency and leave missing figures at the end',()=>{
  assert.deepEqual([missing,listed,foreign,early].sort((a,b)=>compareCompanyRecords(a,b,'value',metadata)).map(item=>item.id),
    [foreign.id,early.id,listed.id,missing.id]);
});
