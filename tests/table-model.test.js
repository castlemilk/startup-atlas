import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {filterOpportunities} from '../logic.js';
import {opportunityRows} from '../table-model.js';

const {opportunities}=JSON.parse(await readFile(new URL('../data/catalogue.json',import.meta.url),'utf8'));
const base={view:'opportunities',query:'',country:'all',includeUnknown:false,kind:'all',access:'all',sort:'recommended'};

test('TanStack rows preserve catalogue filters, ordering and load-more batches',()=>{
  const cases=[
    {state:base,saved:new Set()},
    {state:{...base,sort:'name'},saved:new Set()},
    {state:{...base,country:'AU',includeUnknown:true,kind:'Cloud credits'},saved:new Set()},
    {state:{...base,query:'bedrock',access:'Direct'},saved:new Set()},
    {state:{...base,view:'saved'},saved:new Set(['nvidia','aws-founders'])},
    {state:{...base,query:'no matching programme at all'},saved:new Set()}
  ];
  for(const {state,saved} of cases){
    const expected=filterOpportunities(opportunities,state,saved);
    for(const visible of [12,24,200]){
      const result=opportunityRows(opportunities,state,saved,visible);
      assert.equal(result.total,expected.length);
      assert.deepEqual(result.rows.map(item=>item.id),expected.slice(0,visible).map(item=>item.id));
    }
  }
});
