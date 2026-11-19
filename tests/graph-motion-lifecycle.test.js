import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../web/graph.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('function stopSimulation()'),source.indexOf('\nfunction renderMap()'));
function fixture(){
  const events=new Map(),queue=new Map();let next=1,ticks=0,draws=0;
  const listen=target=>(name,fn)=>events.set(target+':'+name,fn);
  const motion={matches:false,addEventListener:listen('motion')};
  const document={hidden:false,addEventListener:listen('document')};
  const window={requestAnimationFrame:fn=>{const id=next++;queue.set(id,fn);return id;},cancelAnimationFrame:id=>queue.delete(id),addEventListener:listen('window')};
  const api=new Function('window','document','reducedMotion','simulation','updateGeometry',`let frame=null;${helper};return {reheat,stopSimulation};`)(window,document,motion,{tick:()=>ticks++},()=>draws++);
  return {api,motion,document,window,queue,emit:(target,name)=>events.get(target+':'+name)(),step:()=>{const callbacks=[...queue.values()];queue.clear();callbacks.forEach(fn=>fn());},get ticks(){return ticks;},get draws(){return draws;}};
}
test('live reduced motion cancels relaxation and does not replay',()=>{
 const f=fixture();f.api.reheat();f.step();assert.equal(f.ticks,1);f.motion.matches=true;f.emit('motion','change');assert.equal(f.queue.size,0);assert.equal(f.ticks,1);f.motion.matches=false;f.emit('motion','change');assert.equal(f.queue.size,0);
});
test('hidden/pagehide cancel; visibility restore does not restart',()=>{
 const f=fixture();f.api.reheat();f.document.hidden=true;f.emit('document','visibilitychange');assert.equal(f.queue.size,0);f.api.reheat();assert.equal(f.ticks,0);assert.equal(f.queue.size,0);f.document.hidden=false;f.emit('document','visibilitychange');assert.equal(f.queue.size,0);f.api.reheat();f.emit('window','pagehide');assert.equal(f.queue.size,0);
});
test('queued callback checks preference and hidden state before work',()=>{
 for(const property of ['matches','hidden']){const f=fixture();f.api.reheat();(property==='matches'?f.motion:f.document)[property]=true;f.step();assert.equal(f.ticks,0);assert.equal(f.draws,0);assert.equal(f.queue.size,0);}
});
test('explicit reduced-motion interaction retains synchronous static settling',()=>{
 const f=fixture();f.motion.matches=true;f.api.reheat();assert.equal(f.ticks,70);assert.equal(f.draws,1);assert.equal(f.queue.size,0);
});
test('repeated reheat owns one finite loop; stopping is idempotent',()=>{
 const f=fixture();f.api.reheat();f.api.reheat();assert.equal(f.queue.size,1);for(let i=0;i<120;i++)f.step();assert.equal(f.ticks,120);assert.equal(f.queue.size,0);f.api.stopSimulation();f.api.stopSimulation();assert.equal(f.queue.size,0);
});
test('missing frame API preserves static settling and does not queue work',()=>{
 const f=fixture();delete f.window.requestAnimationFrame;f.api.reheat();assert.equal(f.ticks,70);assert.equal(f.draws,1);assert.equal(f.queue.size,0);
});
test('a hidden reduced-motion document remains idle until an explicit visible action',()=>{
 const f=fixture();f.motion.matches=true;f.document.hidden=true;f.api.reheat();assert.equal(f.ticks,0);assert.equal(f.draws,0);f.document.hidden=false;f.emit('document','visibilitychange');assert.equal(f.ticks,0);f.api.reheat();assert.equal(f.ticks,70);assert.equal(f.draws,1);
});
