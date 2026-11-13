// Browser-level graph interaction smoke test. Uses the Chrome already installed
// on the GitHub Actions runner and Node's built-in CDP WebSocket client.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname, join, resolve, sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const root=resolve('dist'), profile=await mkdtemp(join(tmpdir(),'atlas-chrome-'));
const screenshotDir=process.env.ATLAS_SCREENSHOTS_DIR||join(tmpdir(),'atlas-graph-screenshots');
const contentTypes={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.sqlite':'application/octet-stream','.svg':'image/svg+xml','.png':'image/png'};
const requests=[];
const server=createServer(async(req,res)=>{
  try {
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(path===root?join(root,'index.html'):path);
    requests.push({url:req.url,status:200});
    res.writeHead(200,{'Content-Type':contentTypes[extname(path)]||'application/octet-stream'}).end(bytes);
  } catch {requests.push({url:req.url,status:404});res.writeHead(404).end();}
});
await new Promise((resolveListen,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolveListen));
const address=`http://127.0.0.1:${server.address().port}`;
const chrome=spawn(process.env.CHROME_BIN||'google-chrome',[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--no-first-run',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
],{stdio:['ignore','ignore','pipe']});
let socket, spawnError, chromeExit, chromeLog='';
chrome.on('error',error=>{spawnError=error;});
chrome.on('exit',(code,signal)=>{chromeExit=`Chrome exited (${code ?? signal})`;});
chrome.stderr.on('data',chunk=>{chromeLog=(chromeLog+chunk.toString()).slice(-5000);});

async function until(fn,message) {
  for(let i=0;i<100;i++) {
    if(spawnError)throw spawnError;
    if(chromeExit)throw new Error(chromeExit+'\n'+chromeLog);
    const result=await fn().catch(()=>null);
    if(result)return result;
    await delay(100);
  }
  throw new Error(message+'\n'+chromeLog);
}
try {
  const port=await until(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]),'Chrome did not start');
  const target=await until(async()=>{
    const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return targets.find(item=>item.type==='page');
  },'Chrome did not expose a page');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen,reject)=>{socket.addEventListener('open',resolveOpen,{once:true});socket.addEventListener('error',reject,{once:true});});
  const pending=new Map(), exceptions=[], browserMessages=[];let sequence=0;
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    if(message.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(message.params.type))browserMessages.push(message.params.args.map(item=>item.value||item.description||'').join(' '));
    if(!message.id)return;
    const item=pending.get(message.id);if(!item)return;pending.delete(message.id);
    if(message.error)item.reject(new Error(message.error.message));else item.resolve(message.result);
  });
  function command(method,params={}) {
    const id=++sequence;
    return new Promise((resolveCommand,reject)=>{pending.set(id,{resolve:resolveCommand,reject});socket.send(JSON.stringify({id,method,params}));});
  }
  async function evaluate(expression) {
    const response=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(response.exceptionDetails)throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }
  async function move(type,x,y,button='none',buttons=0) {
    await command('Input.dispatchMouseEvent',{type,x,y,button,buttons,clickCount:1});
  }
  async function drag(x,y,dx,dy) {
    await move('mouseMoved',x,y);
    await move('mousePressed',x,y,'left',1);
    await move('mouseMoved',x+dx,y+dy,'left',1);
    await move('mouseReleased',x+dx,y+dy,'left',0);
  }
  async function screenshot(name) {
    await mkdir(screenshotDir,{recursive:true});
    const image=await command('Page.captureScreenshot',{format:'png'});
    await writeFile(join(screenshotDir,name),Buffer.from(image.data,'base64'));
  }
  await command('Page.enable');await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:`${address}/graph.html?entity=startup%3Acanva`});
  try {
    await until(()=>evaluate("!!document.querySelector('[data-node=\"person:melanie-perkins\"]') && document.querySelector('#graph-detail h2')?.textContent==='Canva'"),'Graph did not render');
  } catch(error) {
    console.error('Graph diagnostics:',await evaluate("JSON.stringify({url:location.href,title:document.title,ready:document.readyState,status:document.querySelector('#graph-status')?.textContent,detail:document.querySelector('#graph-detail')?.textContent,svg:document.querySelector('#graph-canvas')?.textContent})").catch(()=>'<unavailable>'));
    console.error('Requests:',JSON.stringify(requests),'Exceptions:',JSON.stringify(exceptions),'Console:',JSON.stringify(browserMessages));
    await screenshot('failed-desktop.png').catch(()=>{});
    throw error;
  }
  await evaluate("document.querySelector('#graph-canvas').scrollIntoView({block:'center'})");
  const nodeExpression="document.querySelector('[data-node=\"person:melanie-perkins\"]')";
  const before=await evaluate(`${nodeExpression}.getAttribute('transform')`);
  const neighbourBefore=await evaluate("document.querySelector('[data-node=\"startup:canva\"]').getAttribute('transform')");
  const rect=await evaluate(`(()=>{const r=${nodeExpression}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await drag(rect.x,rect.y,65,40);
  const moved=await evaluate(`${nodeExpression}.getAttribute('transform')`);
  assert.notEqual(moved,before,'Dragging must move the node');
  await until(async()=>await evaluate("document.querySelector('[data-node=\"startup:canva\"]').getAttribute('transform')")!==neighbourBefore,'A connected node did not respond to the force simulation');
  assert.equal(await evaluate("document.querySelector('#graph-detail h2').textContent"),'Canva','Dragging must not change the selected profile');
  await evaluate(`${nodeExpression}.focus()`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  const keyboard=await evaluate(`${nodeExpression}.getAttribute('transform')`);
  assert.notEqual(keyboard,moved,'Arrow keys must move the focused node');
  await evaluate("document.querySelector('#graph-filters button[data-kind=person]').click();document.querySelector('#graph-filters button[data-kind=person]').click()");
  const restored=await evaluate(`${nodeExpression}.getAttribute('transform')`);
  const coordinates=value=>value.match(/-?\d+(?:\.\d+)?/g).map(Number);
  assert.deepEqual(coordinates(restored).map(Math.round),coordinates(keyboard).map(Math.round),'Filtering must retain moved positions');
  const canvasRect=await evaluate("(()=>{const r=document.querySelector('#graph-canvas').getBoundingClientRect();return {x:r.x+15,y:r.y+15};})()");
  const viewBox=await evaluate("document.querySelector('#graph-canvas').getAttribute('viewBox')");
  await drag(canvasRect.x,canvasRect.y,45,25);
  assert.notEqual(await evaluate("document.querySelector('#graph-canvas').getAttribute('viewBox')"),viewBox,'Dragging the background must pan');
  await evaluate("document.querySelector('#graph-list-toggle').click()");
  assert.equal(await evaluate("document.querySelector('#graph-list').hidden"),false);
  assert.ok(await evaluate("document.querySelectorAll('#graph-list a[href^=\"https://\"]').length")>0,'List must show evidence links');
  await evaluate("document.querySelector('#graph-reset').click()");
  assert.deepEqual(coordinates(await evaluate(`${nodeExpression}.getAttribute('transform')`)).map(Math.round),coordinates(before).map(Math.round),'Reset must restore automatic placement');
  await screenshot('desktop.png');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await command('Page.reload');
  await until(()=>evaluate("!!document.querySelector('[data-node=\"startup:canva\"]')"),'Mobile graph did not render');
  await evaluate("document.querySelector('#graph-canvas').scrollIntoView({block:'center'})");
  assert.equal(await evaluate("document.querySelector('#graph-detail h2').textContent"),'Canva');
  await screenshot('mobile.png');
  assert.deepEqual(exceptions,[],'Page must not raise unhandled JavaScript exceptions');
  console.log('Chrome graph interaction smoke test passed at desktop and mobile sizes');
} finally {
  socket?.close();chrome.kill();server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
}
