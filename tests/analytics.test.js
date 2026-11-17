import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const sandbox = { module: { exports: {} } };
vm.runInNewContext(readFileSync(new URL('../web/analytics.js', import.meta.url), 'utf8'), sandbox);
const { eligible, boot } = sandbox.module.exports;
const config = { enabled: true, origin: 'https://site.example', gaMeasurementId: 'G-TEST123', gaPrivacyReviewed: true, policyReviewed: true, basePath: "/startup-atlas/" };
function fixture(options = {}) {
  const elements = [];
  function element(tag) { const e = { tag, listeners: {}, children: [], setAttribute() {}, append(...nodes) {this.children.push(...nodes);}, addEventListener(name, fn) {this.listeners[name] = fn;}, click() {this.listeners.click();} }; elements.push(e); return e; }
  const doc = { createElement: element, getElementById(id) { return elements.find(e => e.id === id); }, body: element('body'), head: element('head'), addEventListener() {} };
  const saved = new Map(options.saved ? [['atlas-website-analytics-v1',options.saved]] : []);
  const win = { location: {origin:config.origin, pathname:'/startup-atlas/', search:'', hash:'', reload() {win.reloaded=true;}}, navigator:{}, sessionStorage: {getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)} };
  return {win,doc,elements,saved};
}
test('fails closed for config, privacy signals, host, route, query and hash', () => {
  const {win} = fixture();
  assert.equal(eligible(config,win.location,win.navigator),true);
  for (const patch of [{enabled:false},{gaPrivacyReviewed:false},{policyReviewed:false},{basePath:'/other/'},{gaMeasurementId:''},{origin:''}]) assert.equal(!!eligible({...config,...patch},win.location,{}),false);
  for (const patch of [{origin:'https://other.example'},{pathname:'/library.html'},{search:'?email=x'},{hash:'#secret'}]) assert.equal(!!eligible(config,{...win.location,...patch},{}),false);
  for (const n of [{doNotTrack:'1'},{globalPrivacyControl:true}]) assert.equal(eligible(config,win.location,n),false);
});
test('default configuration has no UI, scripts or writes', () => {
  const f=fixture();boot(f.win,f.doc,{});assert.equal(f.doc.head.children.length,0);assert.equal(f.doc.body.children.length,0);assert.equal(f.saved.size,0);
});
test('reject sends nothing, explicit opt-in loads once, withdrawal disables before reload', () => {
  const f=fixture();boot(f.win,f.doc,config);
  const buttons=f.elements.filter(e=>e.tag==='button');buttons[1].click();
  assert.equal(f.doc.head.children.length,0);
  buttons[0].click();buttons[0].click();assert.equal(f.doc.head.children.length,1);assert.equal(f.win['ga-disable-G-TEST123'],false);
  const events=f.win.dataLayer.map(x=>Array.from(x));
  assert.equal(events.filter(e=>e[0]==='event'&&e[1]==='page_view').length,1);
  assert.equal(events.find(e=>e[0]==='config')[2].page_referrer,'');
  buttons[1].click();assert.equal(f.win['ga-disable-G-TEST123'],true);assert.equal(f.win.reloaded,true);assert.equal(f.saved.get('atlas-website-analytics-v1'),'denied');
});
test('denial survives reload; accepted session remains gated by GPC', () => {
  const denied=fixture({saved:'denied'});boot(denied.win,denied.doc,config);assert.equal(denied.doc.head.children.length,0);
  const accepted=fixture({saved:'granted'});accepted.win.navigator.globalPrivacyControl=true;boot(accepted.win,accepted.doc,config);assert.equal(accepted.doc.head.children.length,0);
});
test('storage failure does not opt in', () => {
  const f=fixture();f.win.sessionStorage.getItem=()=>{throw Error('blocked');};boot(f.win,f.doc,config);assert.equal(f.doc.head.children.length,0);assert.equal(f.doc.body.children.length,0);
});

test('scope is limited to Startup Atlas subpath, not other GitHub Pages projects', () => {
  const f=fixture();
  for (const pathname of ['/', '/other/', '/startup-atlas/tour.html', '/startup-atlas/ui', '/startup-atlas-private/']) assert.equal(eligible(config,{...f.win.location,pathname},{}),false);
  assert.equal(eligible(config,{...f.win.location,pathname:'/startup-atlas/index.html'},{}),true);
  boot(f.win,f.doc,config);f.elements.filter(e=>e.tag==='button')[0].click();
  const event=f.win.dataLayer.map(x=>Array.from(x)).find(e=>e[0]==='config')[2];
  assert.equal(event.cookie_prefix,'startup_atlas');assert.equal(event.cookie_path,'/startup-atlas/');assert.equal(event.cookie_domain,'none');
  assert.equal(event.page_location,'https://site.example/startup-atlas/');
});
test('failed denial write clears old grant, and total storage failure never reloads', () => {
  const f=fixture({saved:'granted'});boot(f.win,f.doc,config);f.win.sessionStorage.setItem=()=>{throw Error('blocked');};
  f.elements.filter(e=>e.tag==='button')[1].click();assert.equal(f.saved.has('atlas-website-analytics-v1'),false);assert.equal(f.win.reloaded,true);
  const g=fixture({saved:'granted'});boot(g.win,g.doc,config);g.win.sessionStorage.setItem=()=>{throw Error('blocked');};g.win.sessionStorage.removeItem=()=>{throw Error('blocked');};
  g.elements.filter(e=>e.tag==='button')[1].click();assert.equal(g.win['ga-disable-G-TEST123'],true);assert.equal(g.win.reloaded,undefined);
});

test('checked-in configuration is disabled and shared GitHub hosts reject root cookies', () => {
  const context = {window:{}};
  vm.runInNewContext(readFileSync(new URL('../web/analytics-config.js', import.meta.url), 'utf8'), context);
  const actual=context.window.ATLAS_ANALYTICS;
  assert.equal(actual.enabled,false);assert.equal(actual.policyReviewed,false);assert.equal(actual.gaPrivacyReviewed,false);
  assert.equal(actual.gaMeasurementId,'');assert.equal(actual.origin,'');assert.equal(actual.basePath,'');
  const f=fixture();boot(f.win,f.doc,actual);assert.equal(f.doc.head.children.length,0);assert.equal(f.doc.body.children.length,0);
  const shared={...config,origin:'https://castlemilk.github.io',basePath:'/'};
  assert.equal(eligible(shared,{origin:shared.origin,pathname:'/',search:'',hash:''},{}),false);
});
test('consent after entering a filter URL does not load the vendor', () => {
  const f=fixture();boot(f.win,f.doc,config);f.win.location.search='?q=private';
  f.elements.filter(e=>e.tag==='button')[0].click();assert.equal(f.doc.head.children.length,0);
});
