#!/usr/bin/env python3
"""Collect reviewable startup-programme metadata and partner identity candidates.

Website crawling starts only from the curated catalogue or a human-approved CSV.
The separate Wikidata mode is an API client, not a search-engine scraper. Nothing
is written into the public catalogue without an explicit review/import step.
"""
from __future__ import annotations
import argparse
import csv
import datetime as dt
import difflib
from html.parser import HTMLParser
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / 'data/catalogue.json'
AGENT = 'StartupAtlasResearchBot/1.0 (+https://github.com/castlemilk/startup-atlas)'
BOT_TOKEN = 'startupatlasresearchbot'
MAX_BYTES = 1_000_000
FOLLOW_WORDS = re.compile(r'apply|application|eligib|terms|conditions|credits|benefits|startup|pricing|program', re.I)
SIGNAL_WORDS = re.compile(r'credit|eligib|expiry|expir|funding|equity|application|deadline|founded|invest|match|country|countries|regional|fee|startup|accelerator', re.I)
API = 'https://www.wikidata.org/w/api.php'
PROPERTIES = {'P856':'official_website','P17':'country','P159':'headquarters','P571':'inception',
              'P112':'founder','P31':'instance_of','P452':'industry','P154':'logo_file','P127':'owned_by','P1128':'employees',
              'P2002':'x_username','P4264':'linkedin_id','P2088':'crunchbase_id'}

class CrawlError(Exception):
    pass

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class Transport:
    """Requests only curated HTTPS hostnames; cross-host redirects are reported."""
    def __init__(self, delay=1.0, timeout=12):
        self.delay=max(1.0, delay)
        self.timeout=timeout
        self.last={}
        self.stopped=set()
        self.opener=build_opener(NoRedirect())  # retains normal environment proxy settings

    def request(self, url, allowed_host=None, accept='text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1', delay=None, redirect_guard=None):
        original=urlsplit(url)
        allowed_host=allowed_host or original.hostname
        for _ in range(6):
            parsed=urlsplit(url)
            if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
                or parsed.hostname.lower() != (allowed_host or '').lower() or parsed.port not in (None, 443)
                or parsed.hostname.lower() in ('localhost',) or parsed.hostname.lower().endswith('.local')):
                raise CrawlError('URL is not on the approved HTTPS host')
            try:
                ipaddress.ip_address(parsed.hostname)
            except ValueError:
                pass
            else:
                raise CrawlError('IP-literal URLs are not accepted')
            host=parsed.hostname.lower()
            if host in self.stopped:
                raise CrawlError('host paused after rate limit')
            try:
                addresses={entry[4][0] for entry in socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)}
            except OSError as exc:
                raise CrawlError(f'DNS lookup failed: {exc}') from exc
            if not addresses or any(not ipaddress.ip_address(ip.split('%')[0]).is_global for ip in addresses):
                raise CrawlError('host resolved to a non-public address')
            wait=(delay or self.delay)-(time.monotonic()-self.last.get(host,0))
            if wait>0: time.sleep(wait)
            req=Request(url,headers={'User-Agent':AGENT,'Accept':accept})
            self.last[host]=time.monotonic()
            try:
                response=self.opener.open(req,timeout=self.timeout)
            except HTTPError as exc:
                response=exc
            except (URLError, OSError, TimeoutError) as exc:
                raise CrawlError(f'request failed: {exc}') from exc
            with response:
                status=response.status
                headers=dict(response.headers.items())
                if status==429:
                    self.stopped.add(host)
                    raise CrawlError('rate limited (429); host paused for this run')
                if status in (301,302,303,307,308):
                    location=response.headers.get('Location')
                    if not location: raise CrawlError('redirect has no Location header')
                    next_url=urljoin(url,location)
                    destination=urlsplit(next_url)
                    if destination.scheme!='https' or destination.hostname!=allowed_host:
                        raise CrawlError('redirect leaves the approved HTTPS host')
                    if redirect_guard: redirect_guard(next_url)
                    url=next_url
                    continue
                content=response.read(MAX_BYTES+1)
                if len(content)>MAX_BYTES: raise CrawlError('response exceeds size limit')
                return status,headers,content,url
        raise CrawlError('too many redirects')

def robots_groups(text):
    groups=[]; agents=[]; rules=[]; crawl_delay=None; seen_rule=False
    def finish():
        if agents: groups.append((agents[:],rules[:],crawl_delay))
    for raw in text.splitlines():
        line=raw.split('#',1)[0].strip()
        if ':' not in line: continue
        key,value=(part.strip() for part in line.split(':',1)); key=key.lower()
        if key=='user-agent':
            if seen_rule:
                finish(); agents=[]; rules=[]; crawl_delay=None; seen_rule=False
            agents.append(value.lower())
        elif agents and key in ('allow','disallow'):
            seen_rule=True
            if value: rules.append((key,value))
        elif agents and key=='crawl-delay':
            seen_rule=True
            try: crawl_delay=max(0,float(value))
            except ValueError: pass
    finish()
    matched=[]; best=-1
    for agents,rules,delay in groups:
        score=max((0 if a=='*' else len(a) for a in agents if a=='*' or a in BOT_TOKEN),default=-1)
        if score>best: best=score; matched=[(rules,delay)] if score>=0 else []
        elif score==best and score>=0: matched.append((rules,delay))
    return [rule for rules,_ in matched for rule in rules],max((d for _,d in matched if d is not None),default=0)

def robots_allowed(rules,url):
    parts=urlsplit(url); path=parts.path or '/'
    if parts.query: path+='?'+parts.query
    winner=None
    for kind,pattern in rules:
        end=pattern.endswith('$'); body=pattern[:-1] if end else pattern
        regex='^'+'.*'.join(re.escape(x) for x in body.split('*'))+('$' if end else '')
        if re.match(regex,path):
            strength=len(body.replace('*','').encode('utf-8'))
            if winner is None or strength>winner[0] or (strength==winner[0] and kind=='allow'):
                winner=(strength,kind)
    return winner is None or winner[1]=='allow'

class RobotPolicy:
    def __init__(self,transport): self.transport=transport; self.cache={}
    def check(self,url):
        p=urlsplit(url); origin=f'{p.scheme}://{p.netloc}'
        if origin not in self.cache:
            try:
                status,_,body,_=self.transport.request(origin+'/robots.txt',p.hostname,accept='text/plain,*/*;q=0.1')
                if status in (404,410): self.cache[origin]=([],0)
                elif status==200: self.cache[origin]=robots_groups(body.decode('utf-8','replace'))
                else: self.cache[origin]=f'HTTP {status}'
            except CrawlError as exc: self.cache[origin]=str(exc)
        policy=self.cache[origin]
        if isinstance(policy,str): raise CrawlError(f'robots.txt unavailable ({policy}); site skipped')
        rules,delay=policy
        if not robots_allowed(rules,url): raise CrawlError('disallowed by robots.txt')
        if delay>30: raise CrawlError('crawl-delay exceeds 30 seconds; site skipped')
        return max(self.transport.delay,delay)

class PageParser(HTMLParser):
    def __init__(self,base):
        super().__init__(convert_charrefs=True); self.base=base; self.meta={}; self.links=[]; self.headings=[]
        self.title=''; self.lang=''; self._capture=None; self._buf=[]; self._href=None; self._hidden=0
        self._ld=False; self._ldbuf=[]; self.structured=[]; self.text=[]
    def handle_starttag(self,tag,attrs):
        a={k.lower():(v or '') for k,v in attrs}; tag=tag.lower()
        if tag=='html': self.lang=a.get('lang','')[:40]
        if tag=='meta':
            key=(a.get('property') or a.get('name') or '').lower(); val=a.get('content','').strip()
            if key and val and key not in self.meta: self.meta[key]=val[:2000]
        if tag=='link' and a.get('href'):
            rel=a.get('rel','').lower(); self.links.append({'rel':rel,'url':urljoin(self.base,a['href'])})
        if tag=='script':
            self._hidden+=1
            if a.get('type','').lower()=='application/ld+json': self._ld=True; self._ldbuf=[]
        elif tag in ('style','noscript'): self._hidden+=1
        if not self._hidden and tag in ('title','h1','h2','a'):
            self._capture=tag; self._buf=[]; self._href=a.get('href') if tag=='a' else None
    def handle_endtag(self,tag):
        tag=tag.lower()
        if tag=='script' and self._ld:
            try:
                value=json.loads(''.join(self._ldbuf)[:50_000]); self.structured.extend(summarise_jsonld(value))
            except (ValueError,TypeError): pass
            self._ld=False
        if tag in ('script','style','noscript') and self._hidden: self._hidden-=1
        if self._capture==tag:
            value=' '.join(' '.join(self._buf).split())[:300]
            if tag=='title' and not self.title: self.title=value
            elif tag in ('h1','h2') and value and len(self.headings)<20: self.headings.append({'level':tag,'text':value})
            elif tag=='a' and self._href and value and len(self.links)<1000:
                self.links.append({'text':value,'url':urljoin(self.base,self._href)})
            self._capture=None; self._buf=[]; self._href=None
    def handle_data(self,data):
        if self._ld and sum(map(len,self._ldbuf))<50_000: self._ldbuf.append(data)
        if self._capture: self._buf.append(data)
        if not self._hidden and len(self.text)<3000 and data.strip(): self.text.append(data.strip()[:1000])

def summarise_jsonld(value):
    keep={'@type','name','description','url','logo','image','foundingDate','address','areaServed','sameAs','offers','applicationCategory'}
    if isinstance(value,list): return sum((summarise_jsonld(x) for x in value[:10]),[])
    if not isinstance(value,dict): return []
    out=[]
    if '@graph' in value: out.extend(summarise_jsonld(value['@graph']))
    selected={k:v for k,v in value.items() if k in keep}
    if selected:
        # Bound untrusted embedded data without interpreting it as facts.
        encoded=json.dumps(selected,ensure_ascii=False)
        if len(encoded)<=15_000: out.append(selected)
    return out[:10]

def extract_page(body,url):
    parser=PageParser(url); parser.feed(body.decode('utf-8','replace'))
    metadata={key:value for key,value in parser.meta.items() if key in ('description','keywords','author','og:title','og:description','og:site_name','og:image','og:type','og:locale','twitter:title','twitter:description','twitter:image','article:published_time','article:modified_time')}
    links=[]; seen=set()
    for link in parser.links:
        u=link.get('url',''); p=urlsplit(u)
        if p.scheme!='https' or not p.hostname or u in seen: continue
        if link.get('rel') or FOLLOW_WORDS.search(link.get('text','')) or any(x in p.hostname.lower() for x in ('linkedin.com','twitter.com','youtube.com')):
            seen.add(u); links.append(link)
        if len(links)>=100: break
    snippets=[]
    for piece in parser.text:
        if SIGNAL_WORDS.search(piece):
            line=' '.join(piece.split())[:240]
            if line not in snippets: snippets.append(line)
        if len(snippets)>=15: break
    return {'title':parser.title,'language':parser.lang,'metadata':metadata,'headings':parser.headings,
            'structured_data':parser.structured[:10],'links':links,'signals':snippets}

def follow_links(extracted,base,max_follow):
    if max_follow<=0: return []
    host=urlsplit(base).hostname; found=[]
    for item in extracted['links']:
        u=item.get('url',''); p=urlsplit(u)
        if p.scheme=='https' and p.hostname==host and FOLLOW_WORDS.search(item.get('text','')):
            clean=urlunsplit((p.scheme,p.netloc,p.path,p.query,''))
            if clean!=base and clean not in found: found.append(clean)
        if len(found)>=max_follow: break
    return found

def load_approved_csv(path,valid_names):
    result=[]; seen=set()
    with open(path,newline='',encoding='utf-8-sig') as handle:
        for row in csv.DictReader(handle):
            name=(row.get('partner') or '').strip(); qid=(row.get('qid') or '').strip(); url=(row.get('official_website') or '').strip()
            if (row.get('approved') or '').strip().lower() not in ('yes','true','1'): continue
            parsed=urlsplit(url)
            if (name not in valid_names or not re.fullmatch(r'Q[1-9]\d*',qid) or parsed.scheme!='https'
                or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None,443)):
                raise CrawlError(f'Invalid approved row for {name!r}')
            try: ipaddress.ip_address(parsed.hostname)
            except ValueError: pass
            else: raise CrawlError(f'IP-literal website for {name!r} is not accepted')
            if name in seen: raise CrawlError(f'Multiple approved candidates for {name}')
            seen.add(name); result.append({'name':name,'qid':qid,'url':url,'description':(row.get('description') or '')[:500]})
    return result

def write_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True); temporary=path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); os.replace(temporary,path)

def utc_now(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
def stamp(): return dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')

def crawl_sites(catalogue,args,transport):
    entries=[{'id':item['id'],'name':item['name'],'url':item['url'],'additional_urls':item.get('extra',[])} for item in catalogue['opportunities']]
    if args.partners_only: entries=[]
    if args.only: entries=[x for x in entries if x['id'] in set(args.only)]
    if args.approved:
        entries += [{'id':'partner:'+x['qid'],'name':x['name'],'url':x['url']} for x in load_approved_csv(args.approved,set(catalogue['partnerLeads']))]
    entries=entries[:args.limit] if args.limit else entries
    if not entries: raise CrawlError('No site seeds matched the requested options')
    robots=RobotPolicy(transport); results=[]; seen={}
    for item in entries:
        seeds=list(dict.fromkeys([item['url'],*item.get('additional_urls',[])]))
        queue=seeds[:]; pages=[]
        while queue and len(pages)<len(seeds)+args.follow:
            url=queue.pop(0)
            if url in seen: pages.append(seen[url]); continue
            try:
                wait=robots.check(url); status,headers,body,final=transport.request(url,urlsplit(url).hostname,delay=wait,redirect_guard=robots.check)
                content_type=headers.get('Content-Type','').lower()
                if status!=200: raise CrawlError(f'HTTP {status}')
                if content_type and 'html' not in content_type: raise CrawlError(f'not HTML: {content_type[:100]}')
                page={'url':url,'final_url':final,'checked_at':utc_now(),'status':'ok','http_status':status,**extract_page(body,final)}
                if len(pages)==0 and args.follow: queue.extend(u for u in follow_links(page,final,args.follow) if u not in queue)
            except (CrawlError,ValueError) as exc: page={'url':url,'checked_at':utc_now(),'status':'skipped','reason':str(exc)}
            seen[url]=page; pages.append(page)
        results.append({**item,'pages':pages})
        print(f"[{len(results)}/{len(entries)}] {item['name']}: {pages[0]['status']}",file=sys.stderr)
    return {'version':1,'mode':'sites','generated_at':utc_now(),'results':results}

def api_json(transport,params):
    url=API+'?'+urlencode({**params,'format':'json','maxlag':'5'})
    status,_,body,_=transport.request(url,'www.wikidata.org',accept='application/json')
    if status!=200: raise CrawlError(f'Wikidata HTTP {status}')
    try: data=json.loads(body)
    except ValueError as exc: raise CrawlError('invalid Wikidata JSON') from exc
    if 'error' in data: raise CrawlError('Wikidata API: '+str(data['error'].get('code','unknown')))
    return data

def claim_values(entity,prop):
    output=[]
    for item in entity.get('claims',{}).get(prop,[])[:8]:
        if item.get('rank')=='deprecated': continue
        value=item.get('mainsnak',{}).get('datavalue',{}).get('value')
        if isinstance(value,dict): value=value.get('id') or value.get('time') or value.get('text')
        if isinstance(value,(str,int,float)) and value not in output: output.append(value)
    return output

def discover(catalogue,args,transport):
    names=catalogue['partnerLeads']
    if args.partner: names=[name for name in names if args.partner.lower() in name.lower()]
    if args.limit: names=names[:args.limit]
    rows=[]; qids=[]
    for name in names:
        try:
            data=api_json(transport,{'action':'wbsearchentities','search':name,'language':'en','limit':str(args.candidates)})
            candidates=[]
            for item in data.get('search',[]):
                qid=item.get('id','')
                if not re.fullmatch(r'Q[1-9]\d*',qid): continue
                label=item.get('label',''); score=round(difflib.SequenceMatcher(None,name.casefold(),label.casefold()).ratio(),3)
                candidates.append({'qid':qid,'label':label,'description':item.get('description',''),'name_similarity':score,'source':f'https://www.wikidata.org/wiki/{qid}'})
                if qid not in qids: qids.append(qid)
            rows.append({'partner':name,'status':'candidates' if candidates else 'no_matches','candidates':candidates})
        except CrawlError as exc: rows.append({'partner':name,'status':'failed','reason':str(exc),'candidates':[]})
        print(f'[{len(rows)}/{len(names)}] {name}: {rows[-1]["status"]}',file=sys.stderr)
    entities={}
    for start in range(0,len(qids),40):
        try: entities.update(api_json(transport,{'action':'wbgetentities','ids':'|'.join(qids[start:start+40]),'props':'claims|labels|descriptions','languages':'en'}).get('entities',{}))
        except CrawlError as exc: print(f'Entity batch unavailable: {exc}',file=sys.stderr)
    for row in rows:
        for candidate in row['candidates']:
            entity=entities.get(candidate['qid'],{})
            candidate['properties']={name:values for prop,name in PROPERTIES.items() if (values:=claim_values(entity,prop))}
    return {'version':1,'mode':'discover','generated_at':utc_now(),'warning':'Candidates are unverified; name similarity is not identity or partnership verification.','results':rows}

def write_review_csv(path,data):
    with path.open('w',newline='',encoding='utf-8') as handle:
        fields=['partner','qid','label','description','official_website','country_ids','headquarters_ids','inception','founder_ids','industry_ids','logo_file','linkedin_id','name_similarity','source','approved']
        writer=csv.DictWriter(handle,fieldnames=fields)
        writer.writeheader()
        for row in data['results']:
            for c in row['candidates']:
                sites=c.get('properties',{}).get('official_website',[])
                properties=c.get('properties',{})
                writer.writerow({'partner':row['partner'],'qid':c['qid'],'label':c['label'],'description':c['description'],
                                 'official_website':sites[0] if sites else '', 'country_ids':' | '.join(map(str,properties.get('country',[]))),
                                 'headquarters_ids':' | '.join(map(str,properties.get('headquarters',[]))),
                                 'inception':' | '.join(map(str,properties.get('inception',[]))),
                                 'founder_ids':' | '.join(map(str,properties.get('founder',[]))),
                                 'industry_ids':' | '.join(map(str,properties.get('industry',[]))),
                                 'logo_file':' | '.join(map(str,properties.get('logo_file',[]))),
                                 'linkedin_id':' | '.join(map(str,properties.get('linkedin_id',[]))),
                                 'name_similarity':c['name_similarity'],'source':c['source'],'approved':''})

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode',choices=['sites','discover','apply-reviewed'])
    p.add_argument('--limit',type=int,default=0,help='Maximum records (0 = all)')
    p.add_argument('--delay',type=float,default=1.0,help='Minimum seconds between requests to one host (at least 1)')
    p.add_argument('--follow',type=int,default=2,help='Same-host related pages per starting page, 0–5')
    p.add_argument('--only',action='append',default=[],help='Only this catalogue opportunity id; repeatable')
    p.add_argument('--partner',help='Case-insensitive partner-name filter for discovery')
    p.add_argument('--candidates',type=int,default=5,help='Wikidata candidates per partner, 1–10')
    p.add_argument('--approved',type=Path,help='Reviewed CSV: include rows with approved=yes as site seeds')
    p.add_argument('--partners-only',action='store_true',help='With --approved, crawl only approved partner websites')
    p.add_argument('--snapshot',type=Path,help='Optional sites snapshot to import website descriptions for approved partners')
    p.add_argument('--out',type=Path,default=ROOT/'research/crawl',help='Directory for generated snapshots')
    args=p.parse_args(argv)
    if args.limit<0 or not 0<=args.follow<=5 or not 1<=args.candidates<=10 or args.delay<0: p.error('Invalid limits or delay')
    if args.mode=='apply-reviewed' and not args.approved: p.error('apply-reviewed requires --approved PATH')
    if args.partners_only and (args.mode!='sites' or not args.approved): p.error('--partners-only requires sites --approved PATH')
    catalogue=json.loads(CATALOGUE.read_text(encoding='utf-8')); args.out.mkdir(parents=True,exist_ok=True)
    if args.mode=='apply-reviewed':
        records=load_approved_csv(args.approved,set(catalogue['partnerLeads']))
        reviewed_path=ROOT/'data/partners-reviewed.json'
        reviewed=json.loads(reviewed_path.read_text(encoding='utf-8')) if reviewed_path.exists() else {}
        site_rows=json.loads(args.snapshot.read_text(encoding='utf-8')).get('results',[]) if args.snapshot else []
        for x in records:
            record={'website':x['url'],'description':x['description'],'source':f'https://www.wikidata.org/wiki/{x["qid"]}','reviewed_at':utc_now()}
            match=next((row for row in site_rows if row.get('id')=='partner:'+x['qid'] and row.get('name')==x['name'] and row.get('url')==x['url']),None)
            page=next((page for page in match.get('pages',[]) if page.get('status')=='ok' and page.get('url')==x['url']),None) if match else None
            if page:
                meta=page.get('metadata',{})
                record['site_description']=(meta.get('description') or meta.get('og:description') or '')[:400]
                record['site_checked_at']=page.get('checked_at','')
                record['site_source']=page.get('final_url',x['url'])
            reviewed[x['name']]=record
        write_json(ROOT/'data/partners-reviewed.json',reviewed)
        print(f'Imported {len(records)} identities ({len(reviewed)} total) into data/partners-reviewed.json. Review the diff before committing.')
        return 0
    transport=Transport(args.delay)
    data=crawl_sites(catalogue,args,transport) if args.mode=='sites' else discover(catalogue,args,transport)
    path=args.out/f'{args.mode}-{stamp()}.json'; write_json(path,data); write_json(args.out/f'latest-{args.mode}.json',data)
    if args.mode=='discover':
        review=args.out/f'partner-review-{stamp()}.csv'; write_review_csv(review,data); print(f'Review candidates: {review}')
    print(f'Snapshot: {path}')
    success=sum(row['status'] in ('candidates','no_matches') for row in data['results']) if args.mode=='discover' else sum(any(p['status']=='ok' for p in row['pages']) for row in data['results'])
    if data['results'] and not success: print('No records could be fetched; inspect the snapshot for reasons.',file=sys.stderr); return 1
    return 0

if __name__=='__main__':
    try: sys.exit(main())
    except (OSError,CrawlError,ValueError) as exc: print(f'Error: {exc}',file=sys.stderr); sys.exit(2)
