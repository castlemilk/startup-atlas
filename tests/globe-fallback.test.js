import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('location selection remains usable when WebGL cannot be loaded',async()=>{
  let script=await readFile(new URL('../web/globe.js',import.meta.url),'utf8');
  script=script.replace("import { escapeHtml as esc, sourceUrl } from './logic.js';","const esc=x=>String(x);const sourceUrl=x=>x;")
    .replace("await import('./vendor/three.module.min.js')","await Promise.reject(new Error('WebGL unavailable'))");
  class Context {
    fillRect(){} beginPath(){} moveTo(){} lineTo(){} closePath(){} fill(){} stroke(){} arc(){} save(){} restore(){} clearRect(){} drawImage(){} putImageData(){} setTransform(){}
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};}
    getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4)};}
  }
  const elements={};
  class Element {
    constructor(id){Object.assign(this,{id,hidden:false,textContent:'',innerHTML:'',handlers:{},attributes:{},classList:{values:[],add(value){this.values.push(value);}},ctx:new Context()});}
    getContext(){return this.ctx;} addEventListener(name,fn){this.handlers[name]=fn;} setAttribute(name,value){this.attributes[name]=value;} querySelectorAll(){return this.buttons||[];}
    getBoundingClientRect(){return {width:500,height:290};} cloneNode(){return new Element(this.id);} replaceWith(el){elements[this.id]=el;}
  }
  for(const id of ['atlas-globe','globe-stage','globe-loading-status','globe-location-list','globe-detail','globe-pause','globe-left','globe-right','globe-count','globe-hint'])elements[id]=new Element(id);
  const controls=new Element('controls');
  const document={getElementById:id=>elements[id],createElement:()=>new Element('canvas'),querySelector:()=>controls,addEventListener(){},hidden:false};
  const window={matchMedia:()=>({matches:true,addEventListener(){}}),devicePixelRatio:1,addEventListener(){},dispatchEvent(){}};
  const locations=JSON.parse(await readFile(new URL('../data/map-locations.json',import.meta.url),'utf8'));
  elements['globe-location-list'].buttons=locations.map(location=>Object.assign(new Element(location.id),{dataset:{location:location.id}}));
  const land=JSON.parse(await readFile(new URL('../data/land.geojson',import.meta.url),'utf8'));
  const fetch=async path=>({ok:true,json:async()=>path.includes('map-locations')?locations:land});
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction('document','window','fetch','requestAnimationFrame',script)(document,window,fetch,callback=>{callback(0);return 1;});
  assert.equal(elements['atlas-globe'].hidden,false);
  assert.equal(controls.hidden,false);
  assert.match(elements['globe-location-list'].innerHTML,/Sydney/);
  const buttons=elements['globe-location-list'].buttons;
  assert.equal(buttons.find(button=>button.id==='london').attributes['aria-pressed'],'true');
  elements['globe-location-list'].handlers.click({target:{closest:()=>({dataset:{location:'sydney'}})}});
  assert.match(elements['globe-detail'].innerHTML,/Blackbird Ventures/);
  assert.match(elements['globe-detail'].innerHTML,/Selected place/);
  assert.equal(buttons.find(button=>button.id==='sydney').attributes['aria-pressed'],'true');
  assert.equal(buttons.find(button=>button.id==='london').attributes['aria-pressed'],'false');
  assert.equal(elements['globe-pause'].textContent,'Play');
  assert.equal(elements['globe-stage'].attributes['aria-busy'],'false');
  assert.ok(elements['globe-stage'].classList.values.includes('is-ready'));
  assert.equal(elements['globe-loading-status'].textContent,'Globe ready');
  assert.match(script,/showLocation\(hit\.marker\.location,true\)/);
  assert.match(script,/showLocation\(hit\.object\.userData\.location,true\)/);
});
