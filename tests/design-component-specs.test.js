import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSpecs, componentSpecById, componentCategories, resolveComponentState, filterComponentSpecs } from '../web/design-component-specs.js';

test('component URL state rejects unknown and inherited-object keys',()=>{
  for(const component of ['unknown','__proto__','constructor','toString']) {
    const state=resolveComponentState(new URLSearchParams({component,variant:'prototype',componentKind:'constructor'}));
    assert.deepEqual(state,{component:'actions',variant:'ready',category:'all',query:''});
  }
});

test('component variants are validated against the selected component',()=>{
  assert.deepEqual(resolveComponentState(new URLSearchParams('component=badge&variant=partial&componentKind=identity')),
    {component:'badge',variant:'startup',category:'identity',query:''});
  assert.equal(resolveComponentState(new URLSearchParams('component=status&variant=partial')).variant,'partial');
  assert.equal(resolveComponentState(new URLSearchParams('component=source&variant=expanded')).variant,'expanded');
  for(const record of componentSpecs) for(const [variant] of record.variants) {
    const resolved=resolveComponentState(new URLSearchParams({component:record.id,variant}));
    assert.equal(resolved.component,record.id);
    assert.equal(resolved.variant,variant);
  }
});

test('component URL parsing bounds search and does not consume sibling state',()=>{
  const params=new URLSearchParams({component:'relationship',variant:'portfolio',componentq:'a'.repeat(190),componentKind:'research',pattern:'graph',device:'mobile',token:'--atlas-ink'});
  const before=params.toString();
  assert.deepEqual(resolveComponentState(params),{component:'relationship',variant:'portfolio',query:'a'.repeat(160),category:'research'});
  assert.equal(params.toString(),before);
});

test('component filtering combines category and all case-insensitive search terms',()=>{
  assert.equal(filterComponentSpecs().length,9);
  assert.deepEqual(filterComponentSpecs('  LOADING  ','actions').map(record=>record.id),['status']);
  assert.deepEqual(filterComponentSpecs('entity badge','identity').map(record=>record.id),['badge']);
  assert.deepEqual(filterComponentSpecs('source','identity'),[]);
  assert.deepEqual(filterComponentSpecs('no-such-component'),[]);
  assert.deepEqual(filterComponentSpecs('','not-a-category'),[]);
});

test('every recipe has one identity, documented owners and supported variants',()=>{
  assert.equal(new Set(componentSpecs.map(record=>record.id)).size,componentSpecs.length);
  const categories=new Set(componentCategories.map(record=>record.id));
  for(const record of componentSpecs) {
    assert.equal(componentSpecById[record.id],record);
    assert.ok(categories.has(record.category));
    assert.ok(record.use&&record.avoid&&record.keyboard&&record.integration);
    assert.ok(record.owners.every(([file,label])=>/^\w[\w-]*\.(?:js|css)$/.test(file)&&label));
    assert.equal(new Set(record.variants.map(([id])=>id)).size,record.variants.length);
    assert.ok(record.variants.length>=2);
  }
});
