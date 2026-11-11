import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('mapped places are sourced, approximate locations of known partner leads',async()=>{
  const places=JSON.parse(await readFile(new URL('../data/map-locations.json',import.meta.url),'utf8'));
  const leads=JSON.parse(await readFile(new URL('../data/partner-leads.json',import.meta.url),'utf8'));
  const ids=new Set();
  for(const place of places){
    assert.ok(!ids.has(place.id));ids.add(place.id);
    assert.ok(place.latitude>=-90&&place.latitude<=90&&place.longitude>=-180&&place.longitude<=180);
    assert.match(place.checked,/^\d{4}-\d{2}-\d{2}$/);
    for(const partner of place.partners){assert.ok(leads.includes(partner.name));assert.equal(new URL(partner.source).protocol,'https:');assert.ok(partner.context);}
  }
});
