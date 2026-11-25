// Shared CDP browser transport/lifecycle helper for the browser test suites
// (#149). Before this module, every scripts/test-*-browser.mjs suite carried
// its own copy of the static file server, the Chrome spawn, the
// DevToolsActivePort wait, the CDP WebSocket session and the cleanup block;
// the copies drifted (different timeout messages, different console capture
// shapes, subtly different evaluate error text). Suites now share this one
// implementation and keep only their journeys and assertions.
//
// Guarantees the suites rely on:
// - Chrome start keeps the 45s cold-start allowance (450 polls at 100ms);
//   page interactions keep the normal per-suite polling budget.
// - Every CDP command has a bounded deadline (20s default) and rejects with
//   `Chrome command timed out: <method>` unless a suite overrides the wording.
// - Socket-exit rejection: if the WebSocket closes or errors, or Chrome exits,
//   every pending command rejects promptly instead of hanging until its
//   deadline, and later commands fail fast with the same cause.
// - Event capture: Runtime.exceptionThrown -> exceptions,
//   Runtime.consoleAPICalled (error/warning by default) -> browserMessages,
//   Page.frameNavigated (top frame) -> navigationCount, Page.loadEventFired
//   -> loadCount, Page.domContentEventFired -> documentLoads and
//   Fetch.requestPaused -> pausedRequests.
// - Network hermeticity (#143 V3): when the session knows its local origin
//   (launchBrowserTransport defaults it to the static server's address),
//   Network.requestWillBeSent URLs on any other http(s) origin accumulate
//   in session.externalRequests, for suites to assert empty — the pattern
//   the Signal suites originally hand-wired per suite.
// - Offline fixture mode (#143 V3): session.enableOfflineMode() pauses
//   every request at the Fetch domain, continues the local ones and fails
//   the rest (session.blockedRequests), so a suite can demonstrate that
//   its journeys run entirely on local fixtures.
// - Phase timing: command durations are accumulated into startup /
//   navigation / assertion / capture phases; `session.timings.summary()`
//   (also on the transport handle) is what suites log at the end of a run.
// - close() always cleans up: pending commands are rejected, the socket is
//   closed, Chrome is killed, the static server is drained and the temporary
//   profile directory is removed — even when the suite failed.
//
// The CDP session can be constructed over an injected socket-like object
// (addEventListener/send/close) so tests/browser-transport.test.js can drive
// it with a fake socket; the normal path creates the real WebSocket.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname, join, resolve, sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

export const CHROME_START_ATTEMPTS=450; // 45s at the 100ms poll interval.
export const DEFAULT_COMMAND_TIMEOUT_MS=20000;
export const DEFAULT_CHROME_FLAGS=[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--disable-background-networking','--disable-extensions','--no-first-run',
];
export const DEFAULT_CONTENT_TYPES={
  '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
  '.css':'text/css','.json':'application/json','.wasm':'application/wasm',
  '.sqlite':'application/octet-stream','.svg':'image/svg+xml',
  '.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.md':'text/markdown','.woff2':'font/woff2',
};

// Accumulates durations per phase so a suite can report where its time went
// (startup, navigation, assertion, capture) before anyone considers process
// reuse or bounded concurrency.
export class PhaseTimer {
  constructor(now=()=>performance.now()) {
    this.now=now;
    this.phases=new Map();
  }
  record(name,durationMs) {
    const entry=this.phases.get(name)||{count:0,totalMs:0,maxMs:0};
    entry.count++;
    entry.totalMs+=durationMs;
    entry.maxMs=Math.max(entry.maxMs,durationMs);
    this.phases.set(name,entry);
  }
  async measure(name,fn) {
    const started=this.now();
    try {
      return await fn();
    } finally {
      this.record(name,this.now()-started);
    }
  }
  summary() {
    const out={};
    for(const [name,entry] of this.phases) {
      out[name]={count:entry.count,totalMs:Math.round(entry.totalMs),maxMs:Math.round(entry.maxMs)};
    }
    return out;
  }
}

// Static file server for a root directory, with the path-traversal guard and
// content-type map the suites used to duplicate. Options:
// - contentTypes: map merged over DEFAULT_CONTENT_TYPES.
// - requests: array that receives {url, status} for each served response
//   (403 traversal rejections are not recorded, matching the old suites).
// - recordRequest(entry): custom recorder; entry is {url, path, status}.
// - favicon204: answer /favicon.ico with an unrecorded 204 (Signal suites).
// - override(path, req): return bytes to serve instead of reading the file
//   (the treemap suite's mutable graph fixture), or undefined to fall through.
export function startStaticServer(root,options={}) {
  const contentTypes={...DEFAULT_CONTENT_TYPES,...(options.contentTypes||{})};
  const requests=options.requests||[];
  const record=entry=>{
    if(options.recordRequest)options.recordRequest(entry);
    else requests.push({url:entry.url,status:entry.status});
  };
  const server=createServer(async(req,res)=>{
    try {
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(options.favicon204&&pathname==='/favicon.ico'){res.writeHead(204).end();return;}
      const path=resolve(root,'.'+pathname);
      if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
      const file=path===root?join(root,'index.html'):path;
      const overrideBytes=options.override?await options.override(file,req):undefined;
      const bytes=overrideBytes!==undefined?overrideBytes:await readFile(file);
      record({url:req.url,path:pathname,status:200});
      res.writeHead(200,{'Content-Type':contentTypes[extname(file)]||'application/octet-stream'}).end(bytes);
    } catch {
      record({url:req.url,path:undefined,status:404});
      res.writeHead(404).end();
    }
  });
  return {
    server,
    requests,
    get address(){return `http://127.0.0.1:${server.address().port}`;},
    listen(){
      return new Promise((resolveListen,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolveListen));
    },
    async close(){
      if(!server.listening){server.close();return;}
      server.closeAllConnections?.();
      await new Promise(done=>server.close(done));
    },
  };
}

// Spawn Chrome with a fresh temporary profile directory. The returned handle
// tracks spawn errors, exit state and the stderr tail the suites print in
// diagnostics, and parses the DevTools port from stderr for suites whose
// Chrome announces it there.
export function launchChrome({profileDir,bin=process.env.CHROME_BIN||'google-chrome',flags=DEFAULT_CHROME_FLAGS,logLimit=5000}={}) {
  const chrome=spawn(bin,[
    ...flags,'--remote-debugging-port=0',`--user-data-dir=${profileDir}`,'about:blank',
  ],{stdio:['ignore','ignore','pipe']});
  const state={spawnError:null,exit:null,log:'',port:0};
  chrome.on('error',error=>{state.spawnError=error;});
  chrome.on('exit',(code,signal)=>{state.exit=`Chrome exited (${code ?? signal})`;});
  chrome.stderr.on('data',chunk=>{
    state.log=(state.log+chunk.toString()).slice(-logLimit);
    state.port ||= Number(state.log.match(/^DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\//m)?.[1]) || 0;
  });
  return {
    process:chrome,
    profileDir,
    get spawnError(){return state.spawnError;},
    get exit(){return state.exit;},
    get log(){return state.log;},
    get portFromStderr(){return state.port;},
    // Throws the spawn error, or an exit error carrying the stderr tail,
    // exactly as the suites' polling loops used to.
    assertAlive(){
      if(state.spawnError)throw state.spawnError;
      if(state.exit)throw new Error(state.exit+'\n'+state.log);
    },
    kill(){chrome.kill();},
  };
}

// Expected-traffic mapping for hermeticity assertions (#143 V3): entity
// logo/portrait URLs are recorded in the sourced graph data and pages
// render them straight from that data, so in a local run they leave the
// local origin even though the application itself (code, fonts, data
// files) is self-hosted. Suites assert that every external request is one
// of those mapped content URLs; anything else is a hermeticity failure.
export function unmappedExternalRequests(session,contentUrls) {
  const mapped=new Set(contentUrls);
  return session.externalRequests.filter(url=>!mapped.has(url));
}

// The suites' polling loop: retry fn every 100ms until it returns a truthy
// value, failing fast when Chrome dies and appending the Chrome log tail to
// the final timeout error.
export function createUntil(chrome,{attempts=150,intervalMs=100}={}) {
  return async function until(fn,message,attemptOverride) {
    const total=attemptOverride ?? attempts;
    for(let i=0;i<total;i++) {
      chrome.assertAlive();
      const result=await fn().catch(()=>null);
      if(result)return result;
      await delay(intervalMs);
    }
    throw new Error(message+'\n'+chrome.log);
  };
}

const PHASE_BY_METHOD={
  'Page.navigate':'navigation',
  'Page.reload':'navigation',
  'Runtime.evaluate':'assertion',
  'Page.captureScreenshot':'capture',
};

// One CDP WebSocket session. Construct over an injected socket for tests, or
// use CdpSession.connect(url) / connectChromeSession() for the real browser.
export class CdpSession {
  constructor(socket,options={}) {
    this.socket=socket;
    this.commandTimeoutMs=options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    this.timeoutMessage=options.timeoutMessage || (method=>`Chrome command timed out: ${method}`);
    this.exceptionText=options.exceptionText || (details=>details.exception?.description || details.text);
    this.consoleTypes=options.consoleTypes || ['error','warning'];
    this.consoleFormat=options.consoleFormat || 'string';
    this.onEvent=options.onEvent || null;
    this.timings=options.timings || new PhaseTimer();
    this.exceptions=options.exceptions || [];
    this.browserMessages=options.browserMessages || [];
    this.navigationCount=0;
    this.loadCount=0;
    this.documentLoads=0;
    this.pausedRequests=0;
    this.localOrigin=options.localOrigin ?? null;
    this.externalRequests=[];
    this.blockedRequests=[];
    this.offlineMode=false;
    this.pending=new Map();
    this.sequence=0;
    this.failure=null;
    // Suites destructure these and pass them into shared check helpers.
    this.command=this.command.bind(this);
    this.evaluate=this.evaluate.bind(this);
    this.failPending=this.failPending.bind(this);
    this.close=this.close.bind(this);
    socket.addEventListener('message',event=>this.#onMessage(event));
    socket.addEventListener('close',()=>this.failPending(new Error('CDP connection closed')));
    socket.addEventListener('error',()=>this.failPending(new Error('CDP connection error')));
  }

  static async connect(url,options={}) {
    const socket=new WebSocket(url);
    const connectTimeoutMs=options.connectTimeoutMs ?? 0;
    await new Promise((resolveOpen,reject)=>{
      let timer=null;
      if(connectTimeoutMs>0)timer=setTimeout(()=>reject(new Error('CDP connection timed out')),connectTimeoutMs);
      socket.addEventListener('open',()=>{clearTimeout(timer);resolveOpen();},{once:true});
      socket.addEventListener('error',error=>{clearTimeout(timer);reject(error);},{once:true});
    });
    return new CdpSession(socket,options);
  }

  #onMessage(event) {
    const message=JSON.parse(event.data);
    if(message.method) {
      if(message.method==='Page.frameNavigated'&&!message.params.frame.parentId)this.navigationCount++;
      if(message.method==='Page.loadEventFired')this.loadCount++;
      if(message.method==='Page.domContentEventFired')this.documentLoads++;
      if(message.method==='Fetch.requestPaused') {
        this.pausedRequests++;
        if(this.offlineMode)this.#resolvePausedRequest(message.params);
      }
      if(message.method==='Network.requestWillBeSent'&&this.localOrigin) {
        const url=message.params.request.url;
        if(/^https?:/.test(url)&&new URL(url).origin!==this.localOrigin)this.externalRequests.push(url);
      }
      if(message.method==='Runtime.exceptionThrown') {
        this.exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
      }
      if(message.method==='Runtime.consoleAPICalled'&&this.consoleTypes.includes(message.params.type)) {
        const text=message.params.args.map(item=>item.value||item.description||'').join(' ');
        this.browserMessages.push(this.consoleFormat==='object'?{level:message.params.type,text}:text);
      }
      if(this.onEvent)this.onEvent(message);
    }
    if(!message.id)return;
    const item=this.pending.get(message.id);
    if(!item)return;
    this.pending.delete(message.id);
    clearTimeout(item.timeout);
    if(message.error)item.reject(new Error(message.error.message));
    else item.resolve(message.result);
  }

  // Offline fixture mode: a paused request continues when it is local (or
  // not network traffic at all: data:, blob:, about:) and fails as
  // InternetDisconnected when it leaves the local origin.
  #resolvePausedRequest(params) {
    const {requestId,request}=params;
    const url=request?.url||'';
    let external=false;
    if(/^https?:/.test(url)) {
      try {external=new URL(url).origin!==this.localOrigin;} catch {external=true;}
    }
    if(external) {
      this.blockedRequests.push(url);
      this.command('Fetch.failRequest',{requestId,errorReason:'InternetDisconnected'}).catch(()=>{});
    } else {
      this.command('Fetch.continueRequest',{requestId}).catch(()=>{});
    }
  }

  // Pause every request at the Fetch domain and fail the non-local ones:
  // the page then runs entirely on local fixtures, and any external
  // dependency surfaces as a failed request instead of silent network use.
  async enableOfflineMode() {
    if(!this.localOrigin)throw new Error('Offline mode needs the session localOrigin (launchBrowserTransport sets it to the server address)');
    this.offlineMode=true;
    await this.command('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  }

  async disableOfflineMode() {
    this.offlineMode=false;
    await this.command('Fetch.disable');
  }

  // Socket-exit rejection: reject every pending command now (and remember the
  // cause so later commands fail fast) instead of letting each promise hang
  // until its own deadline.
  failPending(error) {
    if(!this.failure)this.failure=error;
    for(const item of this.pending.values()) {
      clearTimeout(item.timeout);
      item.reject(this.failure);
    }
    this.pending.clear();
  }

  command(method,params={}) {
    if(this.failure)return Promise.reject(this.failure);
    const id=++this.sequence;
    const phase=PHASE_BY_METHOD[method]||'command';
    const started=performance.now();
    return new Promise((resolveCommand,reject)=>{
      const timeout=setTimeout(()=>{
        this.pending.delete(id);
        reject(new Error(this.timeoutMessage(method)));
      },this.commandTimeoutMs);
      this.pending.set(id,{resolve:resolveCommand,reject,timeout});
      try {
        this.socket.send(JSON.stringify({id,method,params}));
      } catch(error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    }).finally(()=>this.timings.record(phase,performance.now()-started));
  }

  async evaluate(expression,awaitPromise=true) {
    const response=await this.command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise});
    if(response.exceptionDetails)throw new Error(this.exceptionText(response.exceptionDetails));
    return response.result.value;
  }

  close() {
    this.failPending(new Error('CDP session closed'));
    try {this.socket.close();} catch {}
  }
}

// Wait for Chrome's DevToolsActivePort file (45s cold-start allowance), find
// the page target, open the CDP session and wire Chrome's exit into the
// session so a browser exit rejects pending commands immediately.
export async function connectChromeSession(chrome,profileDir,options={}) {
  const timings=options.timings||new PhaseTimer();
  const until=createUntil(chrome,{attempts:options.pollAttempts ?? 150});
  const session=await timings.measure('startup',async()=>{
    const port=await until(async()=>chrome.portFromStderr||Number((await readFile(join(profileDir,'DevToolsActivePort'),'utf8')).split('\n')[0]),'Chrome did not start',CHROME_START_ATTEMPTS);
    const target=await until(async()=>{
      const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      return targets.find(item=>item.type==='page');
    },'Chrome did not expose a page',CHROME_START_ATTEMPTS);
    const connected=await CdpSession.connect(target.webSocketDebuggerUrl,{...options,timings});
    chrome.process.on('exit',()=>{
      if(chrome.exit)connected.failPending(new Error(chrome.exit+'\n'+chrome.log));
    });
    return connected;
  });
  session.until=until;
  return session;
}

// Capture a screenshot through the session and write it under dir, creating
// the directory first — the suites' screenshot/capture wrappers build their
// own CDP params (full-page clips differ) and delegate the write to this.
export async function saveScreenshot(session,dir,name,params={format:'png'}) {
  await mkdir(dir,{recursive:true});
  const image=await session.command('Page.captureScreenshot',params);
  await writeFile(join(dir,name),Buffer.from(image.data,'base64'));
  return image;
}

// Full lifecycle for one suite: static server + Chrome + CDP session, with a
// single close() that performs the cleanup the suites used to hand-roll in
// their finally blocks. Granular pieces above remain available for suites
// whose setup order differs (e.g. the Signal suites create their profile and
// output directories inside their try block via launchBrowserTransport).
export async function launchBrowserTransport(options={}) {
  const profileDir=options.profileDir || await mkdtemp(join(tmpdir(),options.profilePrefix||'atlas-chrome-'));
  const timings=new PhaseTimer();
  const server=startStaticServer(options.root,options.server||{});
  const chrome=launchChrome({profileDir,bin:options.chromeBin,flags:options.chromeFlags,logLimit:options.chromeLogLimit});
  let session=null;
  let closed=false;
  const handle={
    server:server.server,
    requests:server.requests,
    get address(){return server.address;},
    chrome,
    profileDir,
    timings,
    get session(){return session;},
    get exceptions(){return session?.exceptions ?? [];},
    get browserMessages(){return session?.browserMessages ?? [];},
    get externalRequests(){return session?.externalRequests ?? [];},
    chromeLog(){return chrome.log;},
    async connect(sessionOptions={}) {
      session=await connectChromeSession(chrome,profileDir,{localOrigin:server.address,...options.session,...sessionOptions,timings});
      return session;
    },
    async close() {
      if(closed)return;
      closed=true;
      session?.close();
      chrome.kill();
      await server.close();
      if(profileDir)await rm(profileDir,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
    },
  };
  await server.listen();
  return handle;
}
