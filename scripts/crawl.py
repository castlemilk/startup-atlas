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
import hashlib
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
PROGRAM_SOURCES = ROOT / 'data/program-sources.json'
PARTNER_SOURCES = ROOT / 'data/partner-sources.json'
AGENT = 'StartupAtlasResearchBot/1.0 (+https://github.com/castlemilk/startup-atlas)'
BOT_TOKEN = 'startupatlasresearchbot'
MAX_BYTES = 1_000_000
FOLLOW_WORDS = re.compile(r'apply|application|eligib|terms|conditions|credits|benefits|startup|pricing|program|grant|founder|accelerator|incubator|fellowship|invest', re.I)
SIGNAL_WORDS = re.compile(r'credit|eligib|expiry|expir|funding|equity|application|deadline|founded|invest|match|country|countries|regional|fee|startup|accelerator', re.I)
PROGRAM_WORDS = re.compile(r'\b(startups?|start-ups?|founders?|accelerators?|incubators?|fellowships?|grants?|funding|credits?|program(?:me)?s?|innovation)\b',re.I)
EVIDENCE_PATTERNS = {
    'benefits':re.compile(r'\b(credits?|grant|benefits?|funding|tokens?|characters?|discount|support|mentorship)\b|[$£€]',re.I),
    'eligibility':re.compile(r'\b(eligib\w*|qualif\w*|requirements?|applicants?|startups? must|companies must|founded|incorporated)\b',re.I),
    'funding_stage':re.compile(r'\b(bootstrap\w*|self.fund\w*|venture.backed|investors?|series\s+[a-f]|pre.seed|seed.stage|funding raised)\b',re.I),
    'equity_and_cost':re.compile(r'\b(equity|safe|fee|match\w*|co.match\w*|co.invest\w*|cash contribution|payment method|credit card)\b',re.I),
    'duration_and_deadlines':re.compile(r'\b(deadlines?|expir\w*|valid for|months?|years?|weeks?|applications? clos\w*|rolling|ends? on)\b|\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b',re.I),
    'geography':re.compile(r'\b(country|countries|geograph\w*|worldwide|globally|australia\w*|singapore\w*|canada|united states|united kingdom|europe\w*|africa\w*|india\w*|region\w*)\b',re.I),
    'restrictions':re.compile(r'\b(exclud\w*|not cover\w*|not eligible|restrictions?|limitations?|cannot|non.transfer\w*|overage\w*|bill\w*)\b',re.I),
    'application':re.compile(r'\b(apply|application|deadline|referral|partner|enrol\w*|admission|waitlist)\b',re.I),
}
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

class PageParser(HTMLParser):
    def __init__(self,base):
        super().__init__(convert_charrefs=True); self.base=base; self.meta={}; self.links=[]; self.headings=[]
        self.title=''; self.lang=''; self._captures=[]; self._contexts=[]; self._heading_links=[]; self._hidden=0
        self._ld=False; self._ldbuf=[]; self.structured=[]; self.text=[]; self.logo_images=[]
        self._brand_regions=[]; self._anchor_homes=[]; self._footer_depth=0
        self.tables=[]; self._table_depth=0; self._table=None; self._row=None; self._cell=None
    def handle_starttag(self,tag,attrs):
        a={k.lower():(v or '') for k,v in attrs}; tag=tag.lower()
        if tag=='html': self.lang=a.get('lang','')[:40]
        if tag=='meta':
            key=(a.get('property') or a.get('name') or a.get('itemprop') or '').lower(); val=a.get('content','').strip()
            if key and val and key not in self.meta: self.meta[key]=val[:2000]
        if tag=='link' and a.get('href'):
            rel=a.get('rel','').lower(); self.links.append({'rel':rel,'url':urljoin(self.base,a['href'])})
        if tag in ('header','nav'): self._brand_regions.append(tag)
        if tag=='footer': self._footer_depth+=1
        if tag=='a':
            target=urlsplit(urljoin(self.base,a.get('href','')))
            self._anchor_homes.append(bool(a.get('href')) and target.scheme=='https' and target.hostname==urlsplit(self.base).hostname and target.path in ('','/'))
        if not self._hidden and tag=='img' and re.search(r'logo', ' '.join((a.get('class',''),a.get('id',''),a.get('alt',''))),re.I):
            evidence={'in_header_or_nav':bool(self._brand_regions),'home_link':any(self._anchor_homes),'in_footer':self._footer_depth>0,'alt':a.get('alt','')[:160]}
            def add_logo(raw):
                if raw and len(self.logo_images)<200: self.logo_images.append({'url':urljoin(self.base,raw),**evidence})
            for attr in ('data-src','data-lazy-src','data-original','src'):
                add_logo(a.get(attr,''))
            # Ignore data-URI srcsets entirely: commas in embedded data are not separators.
            for attr in ('data-srcset','srcset'):
                value=a.get(attr,'')
                if 'data:' in value.lower(): continue
                for option in value.split(',')[:8]:
                    parts=option.strip().split()
                    if parts: add_logo(parts[0])
        if tag=='script':
            self._hidden+=1
            if a.get('type','').lower()=='application/ld+json': self._ld=True; self._ldbuf=[]
        elif tag in ('style','noscript'): self._hidden+=1
        if not self._hidden:
            if tag=='table':
                self._table_depth+=1
                if self._table_depth==1 and len(self.tables)<12: self._table={'rows':[]}
            elif self._table_depth==1 and self._table is not None:
                if tag=='tr': self._row=[]
                elif tag in ('th','td') and self._row is not None: self._cell={'text':[],'links':[]}
                elif tag=='a' and self._cell is not None and a.get('href') and len(self._cell['links'])<5:
                    self._cell['links'].append(urljoin(self.base,a['href']))
        if not self._hidden and tag in ('article','li'):
            self._contexts.append({'tag':tag,'start':len(self.links),'text':[]})
        if not self._hidden and tag in ('h1','h2','h3','h4'): self._heading_links=[]
        if not self._hidden and tag in ('title','h1','h2','h3','h4','a','p'):
            self._captures.append({'tag':tag,'text':[],'href':a.get('href') if tag=='a' else None,'link_start':len(self.links)})
    def handle_endtag(self,tag):
        tag=tag.lower()
        if tag in ('header','nav') and tag in self._brand_regions: self._brand_regions.remove(tag)
        if tag=='footer' and self._footer_depth: self._footer_depth-=1
        if tag=='a' and self._anchor_homes: self._anchor_homes.pop()
        if tag=='script' and self._ld:
            try:
                value=json.loads(''.join(self._ldbuf)[:50_000]); self.structured.extend(summarise_jsonld(value))
            except (ValueError,TypeError): pass
            self._ld=False
        if tag in ('script','style','noscript') and self._hidden: self._hidden-=1
        if self._table_depth==1 and self._table is not None:
            if tag in ('th','td') and self._cell is not None:
                if self._row is not None and len(self._row)<25:
                    self._row.append({'text':' '.join(' '.join(self._cell['text']).split())[:300], 'links':self._cell['links']})
                self._cell=None
            elif tag=='tr' and self._row is not None:
                if self._row and len(self._table['rows'])<2000: self._table['rows'].append(self._row)
                self._row=None; self._cell=None
        if tag=='table' and self._table_depth:
            if self._table_depth==1:
                if self._table is not None and self._table['rows']: self.tables.append(self._table)
                self._table=None; self._row=None; self._cell=None
            self._table_depth-=1
        capture=next((entry for entry in reversed(self._captures) if entry['tag']==tag),None)
        if capture is not None:
            self._captures.remove(capture)
            value=' '.join(' '.join(capture['text']).split())[:300]
            if tag=='title' and not self.title: self.title=value
            elif tag in ('h1','h2','h3','h4') and value:
                if len(self.headings)<40: self.headings.append({'level':tag,'text':value})
                self._heading_links=list(range(capture['link_start'],len(self.links)))
            elif tag=='a' and capture['href'] and value and len(self.links)<1000:
                self.links.append({'text':value,'url':urljoin(self.base,capture['href'])})
            elif tag=='p' and value and self._heading_links:
                for index in self._heading_links:
                    if self.links[index].get('text') and not self.links[index].get('context'): self.links[index]['context']=value[:600]
                self._heading_links=[]
        context=next((entry for entry in reversed(self._contexts) if entry['tag']==tag),None)
        if context is not None:
            self._contexts.remove(context)
            text=' '.join(' '.join(context['text']).split())[:600]
            for link in self.links[context['start']:]:
                if link.get('text') and not link.get('context'): link['context']=text
    def handle_data(self,data):
        if self._ld and sum(map(len,self._ldbuf))<50_000: self._ldbuf.append(data)
        if not self._hidden and self._table_depth==1 and self._cell is not None and len(self._cell['text'])<100:
            self._cell['text'].append(data[:500])
        for capture in self._captures: capture['text'].append(data)
        for context in self._contexts[-3:]:
            if len(context['text'])<100: context['text'].append(data[:500])
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

def clean_capture_line(raw):
    line=re.sub(r'^L\d+:\s*','',str(raw)).strip()
    line=re.sub(r'【\d+†([^】]*)】',lambda m: '' if m.group(1).lower().startswith('image') else m.group(1).split('†',1)[0],line)
    line=re.sub(r'^\s*(?:\*|#{1,6})\s*','',line)
    return ' '.join(line.split())

def extract_evidence(parts,url):
    output={key:[] for key in EVIDENCE_PATTERNS}
    previous=''
    for position,raw in enumerate(parts):
        line=clean_capture_line(raw)
        if not line: continue
        combined=(previous+' — '+line) if previous and len(previous)<110 and len(line)<400 else line
        for topic,pattern in EVIDENCE_PATTERNS.items():
            if pattern.search(combined):
                excerpt=combined[:280]
                score=min(len(line)//45,4)+(3 if re.search(r'\d|[$£€]',line) else 0)+(2 if len(line)>45 else 0)
                if not any(x[2]['text']==excerpt for x in output[topic]): output[topic].append((score,position,{'text':excerpt,'source':url}))
        previous=line
    return {key:[entry for _,_,entry in sorted(value,key=lambda row:(-row[0],row[1]))[:8]] for key,value in output.items() if value}

def extract_amount_mentions(parts,url):
    pattern=re.compile(r'(?<!\w)(?:US\$|A\$|AU\$|S\$|USD\s*|AUD\s*|SGD\s*|[$£€])\s*\d[\d,.]*(?:\s*(?:million|billion|thousand|[kKmMbB]))?')
    found=[]; seen=set()
    for raw in parts:
        line=clean_capture_line(raw)
        for match in pattern.finditer(line):
            key=(match.group(0),line[:240])
            if key not in seen:
                seen.add(key); found.append({'mention':match.group(0),'context':line[:240],'source':url})
            if len(found)>=30: return found
    return found

def extract_page(body,url):
    parser=PageParser(url); parser.feed(body.decode('utf-8','replace'))
    metadata={key:value for key,value in parser.meta.items() if key in ('description','keywords','author','logo','og:logo','og:url','og:title','og:description','og:site_name','og:image','og:type','og:locale','twitter:site','twitter:title','twitter:description','twitter:image','article:published_time','article:modified_time')}
    links=[]; seen=set()
    for link in parser.links:
        u=link.get('url',''); p=urlsplit(u)
        if p.scheme!='https' or not p.hostname or u in seen: continue
        if link.get('rel') or FOLLOW_WORDS.search(link.get('text','')+' '+link.get('context','')) or any(x in p.hostname.lower() for x in ('linkedin.com','twitter.com','youtube.com')):
            seen.add(u); links.append(link)
        if len(links)>=250: break
    snippets=[]
    for piece in parser.text:
        if SIGNAL_WORDS.search(piece):
            line=' '.join(piece.split())[:240]
            if line not in snippets: snippets.append(line)
        if len(snippets)>=15: break
    # Candidates are evidence, not verified brand marks. Never infer identity from a filename.
    logo_candidates=[]; logo_seen=set()
    def candidate(raw,kind,evidence=None):
        if not isinstance(raw,str) or not raw.strip(): return
        resolved=urljoin(url,raw); parts=urlsplit(resolved)
        if parts.scheme!='https' or not parts.hostname or parts.username or parts.password or resolved in logo_seen: return
        logo_seen.add(resolved)
        logo_candidates.append({'url':resolved,'kind':kind,'source':url,'same_host':parts.hostname==urlsplit(url).hostname,'review_required':True,**({'evidence':evidence} if evidence else {})})
    for item in parser.structured:
        logo=item.get('logo')
        if isinstance(logo,dict): logo=logo.get('url') or logo.get('contentUrl')
        candidate(logo,'structured-logo')
    # Header/home-link images are stronger evidence than generic portfolio logos.
    preferred=[image for image in parser.logo_images if image['home_link'] or image['in_header_or_nav']]
    footer=[image for image in parser.logo_images if image['in_footer'] and not (image['home_link'] or image['in_header_or_nav'])]
    generic=[image for image in parser.logo_images if not (image['home_link'] or image['in_header_or_nav'] or image['in_footer'])]
    for image in preferred: candidate(image['url'],'page-logo-image',{k:image[k] for k in ('home_link','in_header_or_nav','alt')})
    for key in ('logo','og:logo'): candidate(parser.meta.get(key),'metadata-logo')
    # Footer logos often identify the site itself; candidates still require review.
    for image in footer: candidate(image['url'],'page-logo-image',{k:image[k] for k in ('home_link','in_header_or_nav','in_footer','alt')})
    for link in parser.links:
        if any(rel in ('icon','apple-touch-icon','apple-touch-icon-precomposed','mask-icon') for rel in link.get('rel','').split()): candidate(link.get('url'),'site-icon')
    for image in generic: candidate(image['url'],'page-logo-image',{k:image[k] for k in ('home_link','in_header_or_nav','alt')})
    for key in ('og:image','twitter:image'):
        candidate(parser.meta.get(key),'social-image')
    return {'title':parser.title,'language':parser.lang,'metadata':metadata,'headings':parser.headings,
            'structured_data':parser.structured[:10],'links':links,'signals':snippets,'evidence':extract_evidence(parser.text,url),
            'amount_mentions':extract_amount_mentions(parser.text,url),'logo_candidates':logo_candidates[:40],
            'tables':parser.tables}

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

def load_approved_csv(path,valid_names,require_qid=True):
    result=[]; seen=set()
    with open(path,newline='',encoding='utf-8-sig') as handle:
        for row in csv.DictReader(handle):
            name=(row.get('partner') or '').strip(); qid=(row.get('qid') or '').strip(); url=(row.get('official_website') or '').strip()
            if (row.get('approved') or '').strip().lower() not in ('yes','true','1'): continue
            parsed=urlsplit(url)
            if (name not in valid_names or (qid and not re.fullmatch(r'Q[1-9]\d*',qid)) or (require_qid and not qid) or parsed.scheme!='https'
                or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None,443)):
                raise CrawlError(f'Invalid approved row for {name!r}')
            try: ipaddress.ip_address(parsed.hostname)
            except ValueError: pass
            else: raise CrawlError(f'IP-literal website for {name!r} is not accepted')
            if name in seen: raise CrawlError(f'Multiple approved candidates for {name}')
            hosts=[]
            for host in (row.get('asset_hosts') or '').split('|'):
                host=host.strip().lower()
                if not host: continue
                if (len(host)>253 or not re.fullmatch(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}',host)
                    or host.endswith('.local')):
                    raise CrawlError(f'Invalid asset host for {name!r}')
                if host not in hosts: hosts.append(host)
            if len(hosts)>5: raise CrawlError(f'Too many asset hosts for {name!r}')
            seen.add(name); result.append({'name':name,'qid':qid,'url':url,'description':(row.get('description') or '')[:500],'asset_hosts':hosts})
    return result

def write_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True); temporary=path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); os.replace(temporary,path)

def utc_now(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
def stamp(): return dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')

def partner_update_candidates(snapshot, approved):
    """Prepare unreviewed evidence for MCP; never write catalogue data."""
    if snapshot.get('mode') not in ('sites', 'logos') or not isinstance(snapshot.get('results'), list):
        raise CrawlError('Expected a sites or logos crawl snapshot')
    seeds={(row['name'],row['url']) for row in approved}
    candidates=[]
    for row in snapshot['results']:
        if (row.get('name'),row.get('url')) not in seeds: continue
        page=next((p for p in row.get('pages',[]) if p.get('status')=='ok' and p.get('url')==row['url']),None)
        if not page: continue
        description=page.get('metadata',{}).get('description') or page.get('metadata',{}).get('og:description') or ''
        description=' '.join(description.split())[:500]
        if len(description)<8: continue
        candidates.append({'name':row['name'],'review_required':True,'evidence_url':page.get('final_url',row['url']),'captured_at':page.get('checked_at',''), 'suggested_record':{'website':row['url'],'description':description,'source':page.get('final_url',row['url'])}})
    return {'version':1,'mode':'partner-update-candidates','warning':'Unreviewed extracted text; verify identity, source and claims, then add the review date before MCP validation.','candidates':candidates}

def crawl_sites(catalogue,args,transport):
    entries=[{'id':item['id'],'name':item['name'],'url':item['url'],'additional_urls':item.get('extra',[])} for item in catalogue['opportunities']]
    if args.partners_only: entries=[]
    if args.only: entries=[x for x in entries if x['id'] in set(args.only)]
    if args.approved:
        entries += [{'id':'partner:'+(x['qid'] or 'url-'+hashlib.sha256(x['url'].encode()).hexdigest()[:16]),'name':x['name'],'url':x['url'],'asset_hosts':x['asset_hosts']} for x in load_approved_csv(args.approved,set(catalogue['partnerLeads']),require_qid=False)]
    entries=entries[:args.limit] if args.limit else entries
    if not entries: raise CrawlError('No site seeds matched the requested options')
    results=[]; seen={}
    for item in entries:
        seeds=list(dict.fromkeys([item['url'],*item.get('additional_urls',[])]))
        queue=seeds[:]; pages=[]
        while queue and len(pages)<len(seeds)+args.follow:
            url=queue.pop(0)
            if url in seen: pages.append(seen[url]); continue
            try:
                status,headers,body,final=transport.request(url,urlsplit(url).hostname)
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

def logo_resolution(body, kind):
    """Report encoded raster dimensions without decoding untrusted images."""
    width=height=None
    if kind=='png' and len(body)>=24 and body[12:16]==b'IHDR':
        width=int.from_bytes(body[16:20],'big'); height=int.from_bytes(body[20:24],'big')
    elif kind=='gif' and len(body)>=10:
        width=int.from_bytes(body[6:8],'little'); height=int.from_bytes(body[8:10],'little')
    if width and height:
        return {'width':width,'height':height,'quality':'small raster' if max(width,height)<128 else 'raster'}
    return {'quality':'vector' if kind=='svg' else 'unknown'}

def stage_partner_logos(snapshot,args,transport):
    """Capture candidate bytes from the reviewed site or its explicitly approved asset hosts.

    Files are opaque .bin research artefacts and are never served by the site.
    """
    rows=[]; folder=args.out/'logo-files'; folder.mkdir(parents=True,exist_ok=True)
    for entry in snapshot['results']:
        for page in entry.get('pages',[]):
            if page.get('status')!='ok': continue
            accepted=0
            # Prefer higher-resolution alternatives before legacy favicons under the capture limit.
            candidates=sorted(page.get('logo_candidates',[]),key=lambda item: item.get('kind')=='site-icon' and urlsplit(item['url']).path.lower().endswith('.ico'))
            for item in candidates:
                row={'partner':entry['name'],'page':page['final_url'],**item,'status':'not_fetched'}
                if item['kind']=='social-image': row['reason']='Social images are not automatically treated as logos'
                elif not item['same_host'] and (urlsplit(item['url']).hostname or '').lower() not in entry.get('asset_hosts',[]): row['reason']='External asset host requires separate review'
                elif accepted>=args.logo_limit: row['reason']='Per-site candidate limit reached'
                else:
                    try:
                        status,headers,body,final=transport.request(item['url'],urlsplit(item['url']).hostname,accept='image/svg+xml,image/png,image/webp,image/jpeg,image/gif')
                        if status!=200: raise CrawlError(f'HTTP {status}')
                        # Store as opaque bytes: never execute, inline, or publish without review.
                        head=body[:2048].lstrip().lower()
                        kind=('ico' if len(body)>=6 and body[:4]==b'\x00\x00\x01\x00' and body[4:6]!=b'\x00\x00' else 'png' if body.startswith(b'\x89PNG\r\n\x1a\n') else 'jpeg' if body.startswith(b'\xff\xd8\xff') else 'gif' if body.startswith((b'GIF87a',b'GIF89a')) else 'webp' if body[:4]==b'RIFF' and body[8:12]==b'WEBP' else 'svg' if b'<svg' in head and not head.startswith(b'<!doctype html') else '')
                        if not kind: raise CrawlError('Response is not a recognised image')
                        digest=hashlib.sha256(body).hexdigest(); (folder/(digest+'.bin')).write_bytes(body)
                        row.update(status='captured',final_url=final,format=kind,sha256=digest,bytes=len(body),file=str(folder/(digest+'.bin')),resolution=logo_resolution(body,kind))
                        accepted+=1
                    except (CrawlError,ValueError,OSError) as exc: row.update(status='skipped',reason=str(exc))
                rows.append(row)
    return {'version':1,'mode':'logos','generated_at':utc_now(),'results':snapshot['results'],'candidates':rows,
            'warning':'Untrusted candidate files require identity, license and safety review before publishing. A favicon or social image may not be the partner logo.'}

def crawl_program_directories(registry,args,transport):
    sources=registry['sources']
    seed_catalogue={'opportunities':[{'id':s['id'],'name':s['name'],'url':s['url'],'extra':[]} for s in sources], 'partnerLeads':[]}
    result=crawl_sites(seed_catalogue,args,transport); result['mode']='programs'; candidates=[]; seen=set()
    scopes={s['id']:s['scope'] for s in sources}
    for row in result['results']:
        for page in row['pages']:
            if page['status']!='ok': continue
            for link in page.get('links',[]):
                label=link.get('text','').strip(); context=link.get('context','').strip(); url=link.get('url','')
                parsed=urlsplit(url)
                if not label or not parsed.hostname or parsed.scheme!='https' or parsed.username or parsed.password: continue
                if not PROGRAM_WORDS.search(' '.join((label,context,parsed.path))): continue
                if label.casefold() in ('learn more','apply now','apply','read more','find out more','programs','programmes','home'): continue
                key=(url.split('#',1)[0],label.casefold())
                if key in seen: continue
                seen.add(key)
                candidates.append({'label':label[:200],'program_url':url,'context':context[:500],
                                   'source_name':row['name'],'source_url':page['final_url'],
                                   'source_scope':scopes.get(row['id'],''),'review_required':True})
    result['candidates']=candidates[:1000]
    result['warning']='Links are discovery candidates. Programme identity, intake, eligibility and external relationships require review.'
    return result

def crawl_partner_directories(registry,catalogue,args,transport):
    """Extract unverified organisations from a curated provider directory table."""
    sources=registry['sources']
    seed_catalogue={'opportunities':[{'id':s['id'],'name':s['name'],'url':s['url'],'extra':[]} for s in sources], 'partnerLeads':[]}
    result=crawl_sites(seed_catalogue,args,transport); result['mode']='partners'
    sources_by_id={s['id']:s for s in sources}; existing={name.casefold() for name in catalogue['partnerLeads']}
    candidates=[]; seen=set(); notes=[]
    for row in result['results']:
        source=sources_by_id[row['id']]
        accepted={value.casefold() for value in source['accepted_types']}
        for page in row['pages']:
            if page['status']!='ok': continue
            matched=False
            for table in page.get('tables',[]):
                rows=table['rows']
                if not rows: continue
                headers=[cell['text'].casefold() for cell in rows[0]]
                try:
                    name_index=headers.index(source['name_column'].casefold())
                    type_index=headers.index(source['type_column'].casefold())
                except ValueError: continue
                matched=True
                for cells in rows[1:]:
                    if max(name_index,type_index)>=len(cells): continue
                    name=cells[name_index]['text'].strip(); reported_type=cells[type_index]['text'].strip()
                    if not name or not any(part.strip().casefold() in accepted for part in reported_type.split(',')): continue
                    key=(page['final_url'],name.casefold())
                    if key in seen: continue
                    seen.add(key)
                    website=''
                    for link in cells[name_index]['links']:
                        parts=urlsplit(link)
                        if parts.scheme=='https' and parts.hostname and not parts.username and not parts.password:
                            website=link; break
                    candidates.append({'name':name,'reported_type':reported_type,'provider':source['provider'],
                                       'source_name':row['name'],'source_url':page['final_url'],
                                       'source_scope':source['scope'],'checked_at':page['checked_at'],
                                       'website_candidate':website,'existing_lead_exact':name.casefold() in existing,
                                       'review_required':True})
            if not matched: notes.append({'source_url':page['final_url'],'message':'No matching partner table found; the page structure may have changed or require JavaScript.'})
    result['candidates']=candidates[:2000]; result['notes']=notes
    result['warning']='Directory rows and website links are unverified leads. Confirm identity and the provider relationship before publishing; a name match is not identity verification.'
    return result

def process_text_captures(captures):
    """Extract candidate evidence from user-provided text excerpts, without fetching."""
    if not isinstance(captures,dict) or not isinstance(captures.get('documents'),list):
        raise CrawlError('Capture file must contain a documents array')
    rows=[]
    for doc in captures['documents'][:100]:
        if not isinstance(doc,dict): raise CrawlError('Capture document must be an object')
        url=str(doc.get('url','')); parsed=urlsplit(url); body=doc.get('text','')
        if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or not isinstance(body,str):
            raise CrawlError('Capture requires an HTTPS URL and text')
        if len(body)>250_000: raise CrawlError('Capture text exceeds size limit')
        raw_lines=body.splitlines()
        labelled=[line for line in raw_lines if re.match(r'^L\d+:',line)]
        parts=labelled or raw_lines
        rows.append({'name':str(doc.get('name',''))[:200],'url':url,'status':'provided_text',
                     'acquisition':str(doc.get('acquisition','provided excerpt'))[:120],
                     'captured_at':str(doc.get('captured_at',''))[:80],
                     'coverage':'partial excerpt','evidence':extract_evidence(parts,url),'amount_mentions':extract_amount_mentions(parts,url)})
    return {'version':1,'mode':'captures','generated_at':utc_now(),'results':rows,
            'warning':'Provided text excerpts were processed locally; they are not direct crawler fetches or complete page snapshots.'}

def write_program_review_csv(path,data):
    fields=['label','program_url','context','source_name','source_url','source_scope','approved']
    with path.open('w',newline='',encoding='utf-8') as handle:
        writer=csv.DictWriter(handle,fieldnames=fields); writer.writeheader()
        for candidate in data['candidates']:
            writer.writerow({key:csv_safe(candidate.get(key,'')) for key in fields})

def write_partner_directory_review_csv(path,data):
    fields=['name','reported_type','provider','source_name','source_url','source_scope','checked_at','website_candidate','existing_lead_exact','approved']
    with path.open('w',newline='',encoding='utf-8') as handle:
        writer=csv.DictWriter(handle,fieldnames=fields); writer.writeheader()
        for candidate in data['candidates']:
            writer.writerow({key:csv_safe(candidate.get(key,'')) for key in fields})

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
        if isinstance(value,dict): value=value.get('id') or value.get('time') or value.get('text') or value.get('amount')
        if isinstance(value,(str,int,float)) and value not in output: output.append(value)
    return output

def load_directory_leads(path):
    """Read discovery candidates, retaining their supplied directory provenance."""
    required={'name','reported_type','provider','source_url','source_scope','checked_at'}
    with path.open(newline='',encoding='utf-8-sig') as handle:
        reader=csv.DictReader(handle)
        if not required.issubset(set(reader.fieldnames or [])): raise CrawlError('Directory lead CSV is missing required columns')
        leads=[]
        for row in reader:
            if len(leads)>=2000: raise CrawlError('Directory lead CSV exceeds 2000 rows')
            def value(key):
                raw=(row.get(key) or '').strip()
                if raw.startswith("'") and csv_safe(raw[1:])==raw: raw=raw[1:]
                return raw[:500]
            name=value('name'); source=value('source_url'); parts=urlsplit(source)
            if not name or parts.scheme!='https' or not parts.hostname or parts.username or parts.password:
                raise CrawlError('Directory lead requires a name and HTTPS source URL')
            leads.append({'name':name,'directory_source':{'provider':value('provider'),'reported_type':value('reported_type'),
                          'url':source,'scope':value('source_scope'),'checked_at':value('checked_at')}})
    return leads

def discover(catalogue,args,transport):
    leads=load_directory_leads(args.leads) if getattr(args,'leads',None) else [{'name':name} for name in catalogue['partnerLeads']]
    if args.partner: leads=[lead for lead in leads if args.partner.lower() in lead['name'].lower()]
    if args.limit: leads=leads[:args.limit]
    rows=[]; qids=[]
    for lead in leads:
        name=lead['name']; provenance={'directory_source':lead['directory_source']} if 'directory_source' in lead else {}
        try:
            data=api_json(transport,{'action':'wbsearchentities','search':name,'language':'en','limit':str(args.candidates)})
            candidates=[]
            for item in data.get('search',[]):
                qid=item.get('id','')
                if not re.fullmatch(r'Q[1-9]\d*',qid): continue
                label=item.get('label',''); score=round(difflib.SequenceMatcher(None,name.casefold(),label.casefold()).ratio(),3)
                candidates.append({'qid':qid,'label':label,'description':item.get('description',''),'name_similarity':score,'source':f'https://www.wikidata.org/wiki/{qid}'})
                if qid not in qids: qids.append(qid)
            rows.append({'partner':name,'status':'candidates' if candidates else 'no_matches','candidates':candidates,**provenance})
        except CrawlError as exc: rows.append({'partner':name,'status':'failed','reason':str(exc),'candidates':[],**provenance})
        print(f'[{len(rows)}/{len(leads)}] {name}: {rows[-1]["status"]}',file=sys.stderr)
    entities={}
    def collect_batch(ids):
        try:
            entities.update(api_json(transport,{'action':'wbgetentities','ids':'|'.join(ids),'props':'claims','languages':'en'}).get('entities',{}))
        except CrawlError as exc:
            if len(ids)>1 and 'response exceeds size limit' in str(exc):
                mid=len(ids)//2; collect_batch(ids[:mid]); collect_batch(ids[mid:])
            else: print(f'Entity batch unavailable: {exc}',file=sys.stderr)
    for start in range(0,len(qids),20): collect_batch(qids[start:start+20])
    for row in rows:
        for candidate in row['candidates']:
            entity=entities.get(candidate['qid'],{})
            candidate['properties']={name:values for prop,name in PROPERTIES.items() if (values:=claim_values(entity,prop))}
    return {'version':1,'mode':'discover','generated_at':utc_now(),'warning':'Candidates are unverified; name similarity is not identity or partnership verification.','results':rows}

def csv_safe(value):
    value=str(value)
    return "'"+value if re.match(r'^\s*[=+\-@]',value) or value.startswith(('\t','\r')) else value

def write_review_csv(path,data):
    with path.open('w',newline='',encoding='utf-8') as handle:
        fields=['partner','qid','label','description','official_website','country_ids','headquarters_ids','inception','founder_ids','industry_ids','logo_file','linkedin_id','name_similarity','source','directory_provider','directory_type','directory_source','directory_scope','directory_checked_at','approved']
        writer=csv.DictWriter(handle,fieldnames=fields)
        writer.writeheader()
        for row in data['results']:
            for c in row['candidates']:
                sites=c.get('properties',{}).get('official_website',[])
                properties=c.get('properties',{})
                directory=row.get('directory_source',{})
                values={'partner':row['partner'],'qid':c['qid'],'label':c['label'],'description':c['description'],
                                 'official_website':sites[0] if sites else '', 'country_ids':' | '.join(map(str,properties.get('country',[]))),
                                 'headquarters_ids':' | '.join(map(str,properties.get('headquarters',[]))),
                                 'inception':' | '.join(map(str,properties.get('inception',[]))),
                                 'founder_ids':' | '.join(map(str,properties.get('founder',[]))),
                                 'industry_ids':' | '.join(map(str,properties.get('industry',[]))),
                                 'logo_file':' | '.join(map(str,properties.get('logo_file',[]))),
                                 'linkedin_id':' | '.join(map(str,properties.get('linkedin_id',[]))),
                                 'name_similarity':c['name_similarity'],'source':c['source'],
                                 'directory_provider':directory.get('provider',''),'directory_type':directory.get('reported_type',''),
                                 'directory_source':directory.get('url',''),'directory_scope':directory.get('scope',''),
                                 'directory_checked_at':directory.get('checked_at',''),'approved':''}
                writer.writerow({key:csv_safe(value) for key,value in values.items()})

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode',choices=['sites','discover','programs','partners','captures','apply-reviewed','logos','partner-candidates'])
    p.add_argument('--limit',type=int,default=0,help='Maximum records (0 = all)')
    p.add_argument('--delay',type=float,default=1.0,help='Minimum seconds between requests to one host (at least 1)')
    p.add_argument('--follow',type=int,default=2,help='Same-host related pages per starting page, 0–5')
    p.add_argument('--only',action='append',default=[],help='Only this catalogue or source id; repeatable')
    p.add_argument('--partner',help='Case-insensitive partner-name filter for discovery')
    p.add_argument('--leads',type=Path,help='With discover, search names from a partner-directory review CSV')
    p.add_argument('--candidates',type=int,default=5,help='Wikidata candidates per partner, 1–10')
    p.add_argument('--approved',type=Path,help='Reviewed CSV: include rows with approved=yes as site seeds')
    p.add_argument('--partners-only',action='store_true',help='With --approved, crawl only approved partner websites')
    p.add_argument('--logo-limit',type=int,default=2,help='Maximum same-host image candidates to capture per page (0–5)')
    p.add_argument('--snapshot',type=Path,help='Optional sites snapshot to import website descriptions for approved partners')
    p.add_argument('--captures',type=Path,help='JSON file containing provided, attributable text excerpts')
    p.add_argument('--out',type=Path,default=ROOT/'research/crawl',help='Directory for generated snapshots')
    args=p.parse_args(argv)
    if args.limit<0 or not 0<=args.follow<=5 or not 1<=args.candidates<=10 or args.delay<0 or not 0<=args.logo_limit<=5: p.error('Invalid limits or delay')
    if args.mode=='apply-reviewed' and not args.approved: p.error('apply-reviewed requires --approved PATH')
    if args.mode=='partner-candidates' and (not args.approved or not args.snapshot): p.error('partner-candidates requires --approved and --snapshot')
    if args.mode=='captures' and not args.captures: p.error('captures requires --captures PATH')
    if args.mode=='logos' and not args.approved: p.error('logos requires --approved PATH')
    if args.leads and args.mode!='discover': p.error('--leads is only valid with discover')
    if args.mode=='partners' and args.approved: p.error('partners uses curated directory seeds, not --approved')
    if args.partners_only and (args.mode not in ('sites','logos') or not args.approved): p.error('--partners-only requires sites or logos --approved PATH')
    if args.mode=='logos': args.partners_only=True
    catalogue=json.loads(CATALOGUE.read_text(encoding='utf-8')); args.out.mkdir(parents=True,exist_ok=True)
    if args.mode=='partner-candidates':
        approved=load_approved_csv(args.approved,set(catalogue['partnerLeads']),require_qid=False)
        data=partner_update_candidates(json.loads(args.snapshot.read_text(encoding='utf-8')),approved)
        output=args.out/'partner-update-candidates.json'
        write_json(output,data)
        print(f"Prepared {len(data['candidates'])} unreviewed partner update candidates: {output}")
        return 0
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
    if args.mode=='captures':
        data=process_text_captures(json.loads(args.captures.read_text(encoding='utf-8')))
    else:
        transport=Transport(args.delay)
        if args.mode=='sites': data=crawl_sites(catalogue,args,transport)
        elif args.mode=='logos': data=stage_partner_logos(crawl_sites(catalogue,args,transport),args,transport)
        elif args.mode=='discover': data=discover(catalogue,args,transport)
        elif args.mode=='partners': data=crawl_partner_directories(json.loads(PARTNER_SOURCES.read_text(encoding='utf-8')),catalogue,args,transport)
        else: data=crawl_program_directories(json.loads(PROGRAM_SOURCES.read_text(encoding='utf-8')),args,transport)
    path=args.out/f'{args.mode}-{stamp()}.json'; write_json(path,data); write_json(args.out/f'latest-{args.mode}.json',data)
    if args.mode=='discover':
        review=args.out/f'partner-review-{stamp()}.csv'; write_review_csv(review,data); print(f'Review candidates: {review}')
    if args.mode=='programs':
        review=args.out/f'program-review-{stamp()}.csv'; write_program_review_csv(review,data); print(f"Review {len(data['candidates'])} candidate links: {review}")
    if args.mode=='partners':
        review=args.out/f'partner-directory-review-{stamp()}.csv'; write_partner_directory_review_csv(review,data); print(f"Review {len(data['candidates'])} directory leads: {review}")
        for note in data['notes']: print(f"{note['source_url']}: {note['message']}",file=sys.stderr)
    print(f'Snapshot: {path}')
    if args.mode=='discover': success=sum(row['status'] in ('candidates','no_matches') for row in data['results'])
    elif args.mode=='captures': success=len(data['results'])
    else: success=sum(any(p['status']=='ok' for p in row['pages']) for row in data['results'])
    if data['results'] and not success: print('No records could be fetched; inspect the snapshot for reasons.',file=sys.stderr); return 1
    return 0

if __name__=='__main__':
    try: sys.exit(main())
    except (OSError,CrawlError,ValueError) as exc: print(f'Error: {exc}',file=sys.stderr); sys.exit(2)
