import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {neighborhood} from '../graph-model.js';
import {groupBounds,labelLines,layoutBounds,layoutNetwork} from '../graph-layout.js';

function assertSeparated(nodes) {
  for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++) {
    const a=nodes[i],b=nodes[j];
    const overlapX=(a.width+b.width)/2+17-Math.abs(a.x-b.x);
    const overlapY=(a.height+b.height)/2+17-Math.abs(a.y-b.y);
    assert.ok(overlapX<=0||overlapY<=0,`${a.name} overlaps ${b.name}`);
  }
}

test('Canva layout groups sourced partners and founders without label collisions',async()=>{
  const graph=JSON.parse(await readFile(new URL('../data/graph.json',import.meta.url),'utf8'));
  const view=neighborhood(graph,'startup:canva',{depth:2,limit:25});
  const layout=layoutNetwork(view,'startup:canva');
  assert.deepEqual(layout.nodes.map(node=>node.id).sort(),view.nodes.map(node=>node.id).sort());
  assert.equal(layout.edges.length,view.edges.length);
  assert.equal(layout.nodes.find(node=>node.id==='person:melanie-perkins').group,'founders');
  assert.equal(layout.nodes.find(node=>node.id==='partner:airtree').group,'partners');
  assertSeparated(layout.nodes);
  assert.deepEqual(layoutNetwork(view,'startup:canva'),layout);
  const bounds=layoutBounds(layout);
  assert.ok(bounds.width>=1200&&bounds.height>=720);
  assert.ok(groupBounds(layout.nodes.filter(node=>node.group==='founders')).rx>0);
});

test('dense neighbourhoods remain legible and dragged positions are retained',()=>{
  const nodes=[{id:'root',name:'Root startup',kind:'startup',level:0}];
  const edges=[];
  for(let i=0;i<24;i++) {
    const id='person:'+i;
    nodes.push({id,name:'Founder '+String(i).padStart(2,'0'),kind:'person',level:1});
    edges.push({from:id,to:'root',kind:'founded',source:'https://example.com'});
  }
  const layout=layoutNetwork({nodes,edges},'root');
  assertSeparated(layout.nodes);
  const pinned=new Map([['person:0',{x:1350,y:820}]]);
  const moved=layoutNetwork({nodes,edges},'root',pinned);
  assert.equal(moved.nodes.find(node=>node.id==='person:0').x,1350);
  assert.equal(moved.nodes.find(node=>node.id==='person:0').y,820);
  assert.ok(layoutBounds(moved).width>1200);
  assert.equal(labelLines('A very long organisation name with many words').length,2);
});
