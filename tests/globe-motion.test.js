import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('place flights take the shorter route, can be interrupted and respect reduced motion',async()=>{
  const source=await readFile(new URL('../web/globe.js',import.meta.url),'utf8');
  const helper=source.slice(source.indexOf('function createFlight('),source.indexOf('\nfunction showLocation('));
  const motion={matches:false};
  let next=1, queue=new Map(), position={lon:170*Math.PI/180,lat:0}, draws=0;
  const request=callback=>{const id=next++;queue.set(id,callback);return id;};
  const cancel=id=>queue.delete(id);
  const create=new Function('motion','requestAnimationFrame','cancelAnimationFrame',`${helper}; return createFlight;`)(motion,request,cancel);
  const flight=create(()=>({...position}),angles=>{position=angles;},()=>draws++);
  const step=time=>{const pending=[...queue.values()];queue.clear();pending.forEach(callback=>callback(time));};

  flight.to({lon:-170*Math.PI/180,lat:.5});
  step(0);step(360);
  assert.ok(position.lon>Math.PI,'the flight crosses the date line instead of travelling 340 degrees');
  assert.ok(position.lat>0&&position.lat<.5);
  flight.to({lon:0,lat:-.2});
  assert.equal(queue.size,1,'a new selection cancels the previous flight');
  step(400);step(1120);
  assert.ok(Math.abs(position.lat+.2)<1e-9);
  assert.equal(queue.size,0);
  motion.matches=true;
  flight.to({lon:1,lat:.3});
  assert.ok(Math.abs(Math.sin(position.lon-1))<1e-9);
  assert.equal(position.lat,.3);
  assert.equal(queue.size,0,'reduced motion snaps without a frame loop');
  assert.ok(draws>=4);
});
