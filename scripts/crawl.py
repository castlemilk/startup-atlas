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
from urllib.parse import quote, unquote, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / 'data/catalogue.json'
PROGRAM_SOURCES = ROOT / 'data/program-sources.json'
STARTUP_NEWS_SOURCES = ROOT / 'data/startup-news-sources.json'
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

def normalize_request_url(url):
    """Encode raw path/query characters from HTML while rejecting control characters."""
    if any(ord(char) < 32 or ord(char) == 127 for char in url):
        raise CrawlError('URL contains a control character')
    parts=urlsplit(url)
    # Owner policy: never retrieve robots files, even via followed links or
    # redirects. Decode only for comparison; preserve request URL semantics.
    path=parts.path
    for _ in range(16):
        decoded=unquote(path)
        if decoded==path: break
        path=decoded
    else:
        raise CrawlError('URL path encoding exceeds source-policy limit')
    segments=path.replace('\\','/').split('/')
    if any(segment.split(';',1)[0].rstrip(' .').casefold()=='robots.txt' for segment in segments):
        raise CrawlError('robots.txt access is disabled by source policy')
    return urlunsplit((parts.scheme,parts.netloc,
                       quote(parts.path,safe="/%:@!$&'()*+,;=-._~"),
                       quote(parts.query,safe="/%?:@!$&'()*+,;=-._~"),''))

class Transport:
    """Requests only curated HTTPS hostnames; cross-host redirects are reported."""
    def __init__(self, delay=1.0, timeout=12):
        self.delay=max(1.0, delay)
        self.timeout=timeout
        self.last={}
        self.stopped=set()
        self.opener=build_opener(NoRedirect())  # retains normal environment proxy settings

    def request(self, url, allowed_host=None, accept='text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1', delay=None, redirect_guard=None):
        url=normalize_request_url(url)
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
                    next_url=normalize_request_url(urljoin(url,location))
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

ARTICLE_TYPES={'Article','NewsArticle','BlogPosting'}
MAX_DATE_ASSERTIONS=32
VOID_TAGS={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
HEAD_TAGS={'base','link','meta','script','style','title'}
INACTIVE_TAGS={'template','noscript','iframe','textarea','xmp','noembed','noframes'}


class ArticleMarkup:
    """Collect document metadata and dates owned by an explicit article item."""
    def __init__(self,source):
        self.source=evidence_url(source,source)
        self.frames=[]
        self.head_dates=[]
        self.scoped_dates=[]
        self.canonicals=set()
        self.og_urls=set()
        self.truncated=False
        self.depth_limited=False
        self.seen_head=False
        self.body_started=False

    @staticmethod
    def retain(values, assertion):
        if assertion in values: return True
        if len(values)>=MAX_DATE_ASSERTIONS: return False
        values.append(assertion)
        return True

    def start(self,tag,attrs):
        if self.source is None or self.depth_limited: return
        if self.frames and self.frames[-1][0]=='head' and tag not in HEAD_TAGS:
            self.end('head')
        if tag=='head':
            if self.seen_head or self.body_started or self.frames: return
            self.seen_head=True
        elif not self.frames and tag!='html':
            self.body_started=True
        if self.frames and self.frames[-1][0]=='head':
            key=(attrs.get('property') or attrs.get('name') or '').lower().strip()
            if tag=='meta' and key=='article:published_time':
                value=evidence_text(attrs.get('content'),100)
                if value and not self.retain(self.head_dates,{'field':key,'value':value}):
                    self.truncated=True
            if tag=='meta' and key=='og:url' and len(self.og_urls)<2:
                self.og_urls.add(evidence_url(attrs.get('content'),self.source))
            if tag=='link' and 'canonical' in attrs.get('rel','').lower().split() and len(self.canonicals)<2:
                url=evidence_url(attrs.get('href'),self.source)
                if url and urlsplit(url).hostname==urlsplit(self.source).hostname: self.canonicals.add(url)

        owner='itemscope' in attrs or tag=='article'
        scope=self.frames[-1][1] if self.frames else None
        if owner:
            # Plain articles and non-article items still break inherited scope.
            scope=None
            types=structured_types({'@type':attrs.get('itemtype','').split()})
            if 'itemscope' in attrs and types & ARTICLE_TYPES:
                itemid=attrs.get('itemid')
                subject=evidence_url(itemid,self.source)
                scope={'subject':subject,'ambiguous':bool(itemid and subject is None),'dates':[],'truncated':False}
        elif scope is not None:
            props=attrs.get('itemprop','').lower().split()
            if 'url' in props and tag in ('a','link','meta'):
                raw=attrs.get('content' if tag=='meta' else 'href')
                subject=evidence_url(raw,self.source)
                if subject is None or scope['subject'] not in (None,subject):
                    scope['ambiguous']=True
                scope['subject']=subject
            value=None
            if tag=='time' and ('datepublished' in props or 'pubdate' in attrs):
                value=attrs.get('datetime')
            elif tag=='meta' and 'datepublished' in props:
                value=attrs.get('content')
            value=evidence_text(value,100)
            if value and not self.retain(scope['dates'],{'field':f'html.{tag}.publication','value':value}):
                scope['truncated']=True

        if tag not in VOID_TAGS and (self.frames or owner or tag=='head'):
            if len(self.frames)>=128:
                self.frames.clear()
                self.truncated=True
                self.depth_limited=True
                return
            self.frames.append((tag,scope,owner))

    def end(self,tag):
        for index in range(len(self.frames)-1,-1,-1):
            name,scope,owner=self.frames[index]
            if name!=tag: continue
            del self.frames[index:]
            if (owner and scope is not None and scope['subject'] and not scope['ambiguous']
                and scope['subject'] in (self.source,self.canonical_hint())):
                if scope['truncated']: self.truncated=True
                for assertion in scope['dates']:
                    if not self.retain(self.scoped_dates,{**assertion,'subject_url':scope['subject']}):
                        self.truncated=True
            break

    def canonical_hint(self):
        return next(iter(self.canonicals)) if len(self.canonicals)==1 else None

    def evidence(self):
        canonical=self.canonical_hint()
        subjects={self.source,canonical}-{None}
        dates=[]
        if self.og_urls <= subjects:
            dates.extend({**assertion,'subject_url':self.source} for assertion in self.head_dates)
        dates.extend(row for row in self.scoped_dates if row['subject_url'] in subjects)
        return {'canonical_hint':canonical,'date_evidence':dates[:MAX_DATE_ASSERTIONS],
                'truncated':self.truncated or len(dates)>MAX_DATE_ASSERTIONS}


class PageParser(HTMLParser):
    def __init__(self,base):
        super().__init__(convert_charrefs=True); self.base=base; self.meta={}; self.links=[]; self.headings=[]
        self.title=''; self.lang=''; self._captures=[]; self._contexts=[]; self._heading_links=[]; self._hidden=0
        self._inactive=[]
        self._ld=False; self._ldbuf=[]; self.structured=[]; self.text=[]; self.logo_images=[]; self.images=[]
        self._brand_regions=[]; self._anchor_homes=[]; self._footer_depth=0
        self.tables=[]; self._table_depth=0; self._table=None; self._row=None; self._cell=None
        self.article_markup=ArticleMarkup(base)
    def handle_starttag(self,tag,attrs):
        tag=tag.lower()
        # Preserve nested template boundaries. Other inactive containers are
        # treated as raw fallback text until their own closing tag.
        if tag in INACTIVE_TAGS and (not self._inactive or self._inactive[-1]=='template'):
            self._inactive.append(tag)
        if self._inactive: return
        a={k.lower():(v or '') for k,v in attrs}
        if not self._hidden: self.article_markup.start(tag,a)
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
        if not self._hidden and tag=='img' and a.get('alt') and len(self.images)<200:
            raw=a.get('data-src') or a.get('data-lazy-src') or a.get('src')
            if raw:
                resolved=urljoin(self.base,raw); parts=urlsplit(resolved)
                if parts.scheme=='https' and parts.hostname and not parts.username and not parts.password:
                    self.images.append({'url':resolved,'alt':a['alt'][:160]})
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
            if self._hidden==1 and a.get('type','').lower()=='application/ld+json':
                self._ld=True; self._ldbuf=[]
        elif tag=='style': self._hidden+=1
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
            self._captures.append({'tag':tag,'text':[],'href':a.get('href') if tag=='a' else None,'link_start':len(self.links),'label':(a.get('aria-label') or a.get('title') or '')[:160]})
    def handle_endtag(self,tag):
        tag=tag.lower()
        if self._inactive:
            if tag==self._inactive[-1]: self._inactive.pop()
            return
        if not self._hidden or tag in ('script','style'): self.article_markup.end(tag)
        if tag in ('header','nav') and tag in self._brand_regions: self._brand_regions.remove(tag)
        if tag=='footer' and self._footer_depth: self._footer_depth-=1
        if tag=='a' and self._anchor_homes: self._anchor_homes.pop()
        if tag=='script' and self._ld:
            try:
                value=json.loads(''.join(self._ldbuf)[:50_000]); self.structured.extend(summarise_jsonld(value))
            except (ValueError,TypeError): pass
            self._ld=False
        if tag in ('script','style') and self._hidden: self._hidden-=1
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
            if tag=='a' and not value: value=capture.get('label','')
            if tag=='title' and not self.title: self.title=value
            elif tag in ('h1','h2','h3','h4') and value:
                if len(self.headings)<40: self.headings.append({'level':tag,'text':value})
                self._heading_links=list(range(capture['link_start'],len(self.links)))
            elif tag=='a' and capture['href'] and value and len(self.links)<1000:
                self.links.append({'text':value,'url':urljoin(self.base,capture['href'])})
            elif tag=='p' and value:
                for index in set(self._heading_links + list(range(capture['link_start'],len(self.links)))):
                    if self.links[index].get('text') and not self.links[index].get('context'): self.links[index]['context']=value[:600]
                self._heading_links=[]
        context=next((entry for entry in reversed(self._contexts) if entry['tag']==tag),None)
        if context is not None:
            self._contexts.remove(context)
            text=' '.join(' '.join(context['text']).split())[:600]
            for link in self.links[context['start']:]:
                if link.get('text') and not link.get('context'): link['context']=text
    def handle_data(self,data):
        if self._inactive: return
        if self._ld and sum(map(len,self._ldbuf))<50_000: self._ldbuf.append(data)
        if not self._hidden and self._table_depth==1 and self._cell is not None and len(self._cell['text'])<100:
            self._cell['text'].append(data[:500])
        for capture in self._captures: capture['text'].append(data)
        for context in self._contexts[-3:]:
            if len(context['text'])<100: context['text'].append(data[:500])
        if not self._hidden and len(self.text)<3000 and data.strip(): self.text.append(data.strip()[:1000])

def summarise_jsonld(value):
    keep={'@type','@id','name','description','url','logo','image','foundingDate','address','areaServed','sameAs','offers','applicationCategory','jobTitle','worksFor','headline','publisher','datePublished','mainEntityOfPage'}
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
        if link.get('rel') or FOLLOW_WORDS.search(link.get('text','')+' '+link.get('context','')) or any(x in p.hostname.lower() for x in ('linkedin.com','twitter.com','youtube.com','instagram.com','facebook.com','x.com')):
            seen.add(u); links.append(link)
        if len(links)>=250: break
    # Keep a bounded research-only link set for team/portfolio extraction.
    profile_links=[]; profile_seen=set()
    for link in parser.links:
        candidate=link.get('url',''); parts=urlsplit(candidate); text=link.get('text','').strip()
        if not text or parts.scheme!='https' or parts.hostname!=urlsplit(url).hostname or parts.username or parts.password or candidate in profile_seen: continue
        if re.search(r'(?:^|&)(?:token|access_token|api_key|code|session)=',parts.query,re.I): continue
        profile_seen.add(candidate)
        profile_links.append({'url':candidate,'text':text[:140],'context':link.get('context','')[:400]})
        if len(profile_links)>=500: break
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
            'structured_data':parser.structured[:10],'links':links,'profile_links':profile_links,'signals':snippets,'evidence':extract_evidence(parser.text,url),
            'amount_mentions':extract_amount_mentions(parser.text,url),'logo_candidates':logo_candidates[:40], 'image_candidates':parser.images,
            'tables':parser.tables,'article_markup':parser.article_markup.evidence()}

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

def scope_url(url, host):
    """Conservative document identity: no aliases, traversal or ambiguous encodings."""
    if not isinstance(url,str) or len(url)>4096 or url!=url.strip():
        raise CrawlError('Invalid scoped document URL')
    normalized=normalize_request_url(url)
    parts=urlsplit(normalized)
    if (parts.scheme!='https' or parts.hostname!=host or parts.username or parts.password
        or parts.port not in (None,443) or parts.fragment or urlsplit(url).fragment):
        raise CrawlError('Scoped document must be on the approved HTTPS host without a fragment')
    # Exact paths only. Reject encodings and path forms which servers/proxies may
    # reinterpret rather than broadening the approved document through aliases.
    if ('%' in parts.path or '\\' in parts.path or ';' in parts.path or '//' in parts.path
        or any(x in ('.','..') or x.rstrip(' .')!=x for x in parts.path.split('/') if x)):
        raise CrawlError('Ambiguous scoped document path')
    return urlunsplit(('https',parts.hostname,parts.path or '/',parts.query,''))


def parse_crawl_scope(raw, seed_url):
    """An opt-in narrowing of existing approval, never a new source approval."""
    if not raw or not raw.strip(): return None  # preserve existing reviewed rows
    if len(raw)>65536: raise CrawlError('Crawl scope exceeds size limit')
    def unique_object(pairs):
        result={}
        for key,value in pairs:
            if key in result: raise CrawlError('Duplicate crawl scope key')
            result[key]=value
        return result
    try: scope=json.loads(raw,object_pairs_hook=unique_object)
    except (ValueError,TypeError,RecursionError) as exc: raise CrawlError('Invalid crawl scope JSON') from exc
    if (not isinstance(scope,dict) or set(scope)-{'version','allowed_urls','denied_urls','max_follow'}
        or type(scope.get('version')) is not int or scope['version']!=1
        or type(scope.get('max_follow')) is not int or not 0<=scope['max_follow']<=20):
        raise CrawlError('Invalid crawl scope contract')
    host=urlsplit(seed_url).hostname
    for field in ('allowed_urls','denied_urls'):
        values=scope.get(field,[])
        if not isinstance(values,list) or len(values)>100 or (field=='allowed_urls' and not values):
            raise CrawlError('Crawl scope requires bounded document lists')
        scope[field]=list(dict.fromkeys(scope_url(value,host) for value in values))
    check_crawl_scope(seed_url,scope,host)
    return scope


def check_crawl_scope(url, scope, host):
    if scope is None: return
    key=scope_url(url,host)
    if key in scope['denied_urls'] or key not in scope['allowed_urls']:
        raise CrawlError('URL is outside the approved document scope')


def scoped_request(transport, url, host, scope):
    """Check before transport and on every redirect; verify returned URL as well."""
    if scope is None: return transport.request(url,host)
    guard=lambda target: check_crawl_scope(target,scope,host)
    guard(url)
    result=transport.request(url,host,redirect_guard=guard)
    guard(result[3])
    return result


def validate_seed_headers(headers):
    """Reject ambiguous reserved policy spelling instead of dropping its scope."""
    headers=headers or []
    if any(not re.fullmatch(r'[a-z][a-z0-9_]*',header) for header in headers):
        raise CrawlError('Malformed seed CSV header; exact lowercase snake_case required')
    semantic=[header.strip().casefold() for header in headers]
    if len(semantic)!=len(set(semantic)):
        raise CrawlError('Ambiguous duplicate seed CSV columns')
    if any(key=='crawl_scope' and header!='crawl_scope' for header,key in zip(headers,semantic)):
        raise CrawlError('Malformed reserved crawl_scope header')


def require_scoped_launcher(path):
    """New CLIs reject scoped inputs outside the digest-verified route."""
    if path is None: return
    with open(path,newline='',encoding='utf-8-sig') as handle:
        reader=csv.DictReader(handle); validate_seed_headers(reader.fieldnames)
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise CrawlError('Seed CSV row width does not match header')
            if (row.get('crawl_scope') or '').strip() and not globals().get('__implementation__'):
                raise CrawlError('Scoped CLI input requires the reviewed digest-verified launcher')


def load_approved_csv(path,valid_names,require_qid=True):
    with open(path,newline='',encoding='utf-8-sig') as handle:
        reader=csv.DictReader(handle)
        validate_seed_headers(reader.fieldnames)
        return parse_approved_rows(reader,valid_names,require_qid)

def parse_approved_rows(rows,valid_names,require_qid=True):
    """Shared approval validation for file and pinned in-memory planning inputs."""
    result=[]; seen=set()
    for row in rows:
        validate_seed_headers([key for key in row if key is not None])
        if None in row or any(value is None for value in row.values()):
            raise CrawlError('Seed CSV row width does not match header')
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
        scope=parse_crawl_scope(row.get('crawl_scope'),url)
        seen.add(name); result.append({'name':name,'qid':qid,'url':url,'description':(row.get('description') or '')[:500],'asset_hosts':hosts,**({'crawl_scope':scope} if scope is not None else {})})
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
        entries += [{'id':'partner:'+(x['qid'] or 'url-'+hashlib.sha256(x['url'].encode()).hexdigest()[:16]),'name':x['name'],'url':x['url'],'asset_hosts':x['asset_hosts'],**({'crawl_scope':x['crawl_scope']} if 'crawl_scope' in x else {})} for x in load_approved_csv(args.approved,set(catalogue['partnerLeads']),require_qid=False)]
    entries=entries[:args.limit] if args.limit else entries
    if not entries: raise CrawlError('No site seeds matched the requested options')
    results=[]; seen={}
    for item in entries:
        seeds=list(dict.fromkeys([item['url'],*item.get('additional_urls',[])]))
        queue=seeds[:]; pages=[]
        scope=item.get('crawl_scope'); follow=min(args.follow,scope['max_follow']) if scope else args.follow
        while queue and len(pages)<len(seeds)+follow:
            url=queue.pop(0)
            cache_key=(url,json.dumps(scope,sort_keys=True))
            if cache_key in seen: pages.append(seen[cache_key]); continue
            try:
                status,headers,body,final=scoped_request(transport,url,urlsplit(item['url'] if scope else url).hostname,scope)
                content_type=headers.get('Content-Type','').lower()
                if status!=200: raise CrawlError(f'HTTP {status}')
                if content_type and 'html' not in content_type: raise CrawlError(f'not HTML: {content_type[:100]}')
                page={'url':url,'final_url':final,'checked_at':utc_now(),'status':'ok','http_status':status,**extract_page(body,final)}
                if len(pages)==0 and follow: queue.extend(u for u in follow_links(page,final,follow) if u not in queue)
            except (CrawlError,ValueError) as exc: page={'url':url,'checked_at':utc_now(),'status':'skipped','reason':str(exc)}
            seen[cache_key]=page; pages.append(page)
        results.append({**item,'pages':pages})
        print(f"[{len(results)}/{len(entries)}] {item['name']}: {pages[0]['status']}",file=sys.stderr)
    return {'version':1,'mode':'sites','generated_at':utc_now(),'results':results}

PROFILE_PAGE_RULES={
    'people':re.compile(r'\b(team|people|leadership|our people|who we are)\b',re.I),
    'companies':re.compile(r'\b(portfolio|companies|investments|our founders)\b',re.I),
}
PROFILE_PATH_RULES={
    'people':re.compile(r'/(team|people|leadership|members?)/[^/]+',re.I),
    'companies':re.compile(r'/(portfolio|companies|investments?)/[^/]+',re.I),
}
PROFILE_GENERIC=re.compile(r'^(view|learn more|read more|meet|contact|all|our team|team|people|portfolio|companies|investments|about|careers|jobs|news|home|founders|apply|see all)\b',re.I)

def profile_landing_links(page, base, max_follow, include_about=False):
    """Select a bounded, same-host set of team and company index pages."""
    if max_follow<=0: return []
    host=urlsplit(base).hostname; selected=[]
    rules=dict(PROFILE_PAGE_RULES)
    if include_about: rules['about']=re.compile(r'\b(about|our company)\b',re.I)
    for kind,pattern in rules.items():
        for link in page.get('profile_links',[]):
            parts=urlsplit(link.get('url',''))
            if parts.scheme!='https' or parts.hostname!=host or parts.username or parts.password: continue
            if not pattern.search(link.get('text','')+' '+parts.path.replace('-',' ')): continue
            if kind in PROFILE_PATH_RULES and PROFILE_PATH_RULES[kind].search(parts.path): continue
            clean=urlunsplit((parts.scheme,parts.netloc,parts.path,parts.query,''))
            if clean!=base and all(x['url']!=clean for x in selected):
                selected.append({'kind':kind,'url':clean}); break
        if len(selected)>=max_follow: break
    return selected[:max_follow]

def extract_profile_leads(partner, page, kind):
    """Collect labelled links as unreviewed leads, never infer investment or employment."""
    rows=[]; seen=set()
    for link in page.get('profile_links',[]):
        name=' '.join(link.get('text','').split()).strip()
        url=link.get('url',''); parts=urlsplit(url)
        if not (2<=len(name)<=100) or PROFILE_GENERIC.match(name) or not PROFILE_PATH_RULES[kind].search(parts.path): continue
        if parts.scheme!='https' or not parts.hostname or parts.username or parts.password: continue
        key=(name.casefold(),url)
        if key in seen: continue
        seen.add(key)
        rows.append({'partner':partner,'kind':kind,'name':name,'candidate_url':url,
                     'source_url':page['final_url'],'checked_at':page['checked_at'],
                     'context':link.get('context','')[:400],'review_required':True})
        if len(rows)>=100: break
    return rows

def extract_profile_media_leads(partner, page, kind):
    """Keep labelled image and social URLs as unverified research, never as identity assertions."""
    rows=[]
    for image in page.get('image_candidates',[])[:100]:
        rows.append({'partner':partner,'kind':'image','page_kind':kind,'name':image.get('alt',''),
                     'candidate_url':image['url'],'source_url':page['final_url'],
                     'checked_at':page['checked_at'],'review_required':True})
    for item in page.get('links',[]):
        url=item.get('url',''); host=(urlsplit(url).hostname or '').lower()
        if any(host==h or host.endswith('.'+h) for h in ('linkedin.com','instagram.com','facebook.com','youtube.com','twitter.com','x.com')):
            rows.append({'partner':partner,'kind':'social','page_kind':kind,'name':item.get('text',''),
                         'candidate_url':url,'source_url':page['final_url'],
                         'checked_at':page['checked_at'],'review_required':True})
    return rows[:150]

def evidence_text(value, limit=300):
    return ' '.join(value.split())[:limit] if isinstance(value,str) else ''


def evidence_url(value, source):
    """Validate the syntax of an HTTPS candidate without making a request."""
    if not isinstance(value,str) or not value or len(value)>2048 or value!=value.strip():
        return None
    if '\\' in value or any(ord(char)<32 or ord(char)==127 for char in value):
        return None
    try:
        reference=urlsplit(value)
        if ((reference.scheme and reference.scheme!='https')
            or ((reference.scheme or value.startswith('//')) and not reference.netloc)):
            return None
        resolved=urljoin(source,value)
        parts=urlsplit(resolved)
        host=parts.hostname or ''
        if (parts.query or host.endswith('.local')
            or not re.fullmatch(r'(?:[a-z0-9-]+\.)+[a-z]{2,63}',host)):
            return None
        return scope_url(resolved,host)
    except (CrawlError,ValueError):
        return None


def structured_types(subject):
    names=subject.get('@type',[])
    if isinstance(names,str): names=[names]
    if not isinstance(names,list): return set()
    return {name.removeprefix('https://schema.org/').removeprefix('http://schema.org/')
            for name in names if isinstance(name,str)}


def matches_organization(subject, company, source):
    official=evidence_url(company['website'],source)
    return (official is not None and isinstance(subject,dict)
            and evidence_text(subject.get('name')).casefold()==company['name'].casefold()
            and evidence_url(subject.get('url'),source)==official)


def company_profile_observation(company, page):
    """A page-scoped evidence packet, never a verified company/person record."""
    metadata=page.get('metadata',{})
    source=page['final_url']
    subjects=page.get('structured_data',[])
    organizations=[{key:subject[key] for key in ('name','url','description','foundingDate','address','areaServed')
                    if key in subject} for subject in subjects
                   if structured_types(subject)&{'Organization','Corporation'}
                   and matches_organization(subject,company,source)]
    return {'company':company['name'],'kind':'company-profile','source_url':source,
            'checked_at':page['checked_at'],'review_required':True,
            'title':page.get('title',''),
            'description':metadata.get('description') or metadata.get('og:description',''),
            'structured_subjects':subjects,'organization_claims':organizations,
            'logo_candidates':page.get('logo_candidates',[])[:40],
            'identity_note':'Page subjects may include other organisations or people. Image alt text and sameAs links are source claims, not verified identities or employment.'}


def structured_article_binding(article, source, documents):
    """Return True for an explicit document match, False for absent identity, None for disagreement."""
    refs=[(article[key],key=='@id') for key in ('url','@id') if key in article]
    if 'mainEntityOfPage' in article:
        page=article['mainEntityOfPage']
        if isinstance(page,dict):
            page_refs=[(page[key],key=='@id') for key in ('url','@id') if key in page]
            if not page_refs: return None
            refs.extend(page_refs)
        else:
            refs.append((page,True))

    bound=False
    for value,node_ref in refs:
        if node_ref and isinstance(value,str) and '#' in value:
            document,fragment=value.split('#',1)
            # An identifier for a node within a document never proves page identity by itself.
            if not fragment or (document and evidence_url(document,source) not in documents):
                return None
            continue
        if evidence_url(value,source) not in documents: return None
        bound=True
    return bound


def newsroom_observation(company, page):
    source=page['final_url']
    source_key=evidence_url(source,source)
    if source_key is None: return None
    metadata=page.get('metadata',{})
    company_site=evidence_text(metadata.get('og:site_name')).casefold()==company['name'].casefold()
    markup=page.get('article_markup',{})
    canonical=markup.get('canonical_hint')
    structured=[subject for subject in page['structured_data']
                if structured_types(subject)&ARTICLE_TYPES]
    equivalent={source_key,canonical} if canonical else {source_key}
    bound_articles,unbound_articles=[],[]
    for subject in structured:
        if not (subject.get('publisher') is None and company_site
                or matches_organization(subject.get('publisher'),company,source)):
            continue
        binding=structured_article_binding(subject,source,equivalent)
        if binding is True: bound_articles.append(subject)
        elif binding is False: unbound_articles.append(subject)
    if not (bound_articles or unbound_articles) and (structured or metadata.get('og:type')!='article' or not company_site):
        return None
    title=next((title for article in bound_articles if (title:=evidence_text(article.get('headline')))),'')
    title=title or evidence_text(metadata.get('og:title')) or evidence_text(page.get('title'))
    if not title:
        title=next((title for article in unbound_articles if (title:=evidence_text(article.get('headline')))),'')
    if not title: return None
    dates=[]
    for article in bound_articles:
        hint={'field':'structured.datePublished','value':evidence_text(article.get('datePublished'),100)}
        if hint['value'] and hint not in dates: dates.append(hint)
    dates.extend(markup.get('date_evidence',[]))
    return {'source_url':source,'requested_url':page.get('url',source),'source_key':source_key,
            'checked_at':page['checked_at'],'title':title,
            'canonical_hint':canonical,'date_evidence':dates[:MAX_DATE_ASSERTIONS],
            **({'date_evidence_truncated':True} if markup.get('truncated') or len(dates)>MAX_DATE_ASSERTIONS else {})}


def reported_article_day(value):
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:T.+)?',value): return None
    try:
        if len(value)>10: dt.datetime.fromisoformat(value.replace('Z','+00:00'))
        return dt.date.fromisoformat(value[:10]).isoformat()
    except ValueError:
        return None


def stage_newsroom_articles(company, observations):
    by_url={item['source_key']:item for item in observations}
    groups={}
    for item in observations:
        key=item['canonical_hint']
        target=by_url.get(key)
        # Merge only when the other article was itself fetched in this batch and
        # either self-identifies as canonical or makes no competing assertion.
        if not target or target['canonical_hint'] not in (None,key): key=item['source_key']
        groups.setdefault(key,[]).append(item)
    for key,sources in groups.items():
        dates={day for item in sources for hint in item['date_evidence']
               if (day:=reported_article_day(hint['value']))}
        incomplete=any(item.get('date_evidence_truncated') for item in sources)
        if len(dates)>1: date_state='conflict'
        elif incomplete: date_state='incomplete'
        else: date_state='reported' if dates else 'missing'
        primary=by_url[key]
        yield {'company':company,'kind':'newsroom-article','candidate_url':key,
               'source_url':primary['source_url'],'checked_at':primary['checked_at'],'title':primary['title'],
               'observations':sources,'review_required':True,
               'date_state':date_state,
               **({'published_on':next(iter(dates))} if date_state=='reported' else {})}


def professional_bio_observations(company, page, asset_hosts):
    """Require both the reviewed founder roster and a company-linked Person page."""
    source=page['final_url']
    source_key=evidence_url(source,source)
    if source_key is None: return
    names={row['name'].casefold():row['name'] for row in company.get('founders',[])}
    for person in page['structured_data']:
        name=names.get(evidence_text(person.get('name')).casefold())
        if (not name or 'Person' not in structured_types(person)
            or evidence_url(person.get('url'),source)!=source_key
            or not matches_organization(person.get('worksFor'),company,source)):
            continue
        role=evidence_text(person.get('jobTitle'),200)
        bio=evidence_text(person.get('description'),1000)
        if not (role or bio): continue
        same_as=person.get('sameAs',[])
        if isinstance(same_as,str): same_as=[same_as]
        social_urls=[]
        if isinstance(same_as,list):
            for value in same_as[:20]:
                url=evidence_url(value,source)
                if not url: continue
                parts=urlsplit(url)
                if (parts.hostname in ('linkedin.com','www.linkedin.com')
                    and re.fullmatch(r'/in/[A-Za-z0-9-]+/?',parts.path) and url not in social_urls):
                    social_urls.append(url)
        image=person.get('image')
        if isinstance(image,dict): image=image.get('contentUrl') or image.get('url')
        portrait=evidence_url(image,source)
        row={'company':company['name'],'kind':'professional-bio','name':name,
             'candidate_url':source_key,'source_url':source,'checked_at':page['checked_at'],
             'role':role,'bio':bio,'affiliation':person['worksFor'],'social_candidates':social_urls,
             'review_required':True}
        if portrait:
            host=urlsplit(portrait).hostname
            row['headshot_candidate']={'candidate_url':portrait,'source_url':source,
                                       'status':'not_fetched','review_required':True,
                                       'reason':('Rights and image review required'
                                                 if host in asset_hosts or host==urlsplit(source).hostname
                                                 else 'External asset host requires separate review')}
        yield row


def crawl_company_profiles(startups, args, transport):
    # A separate mode keeps startup names out of the partner identity importer.
    # The approved CSV is mandatory; only already researched companies qualify.
    known={row['name']:row for row in startups}
    approved=load_approved_csv(args.approved,set(known),require_qid=False)
    asset_hosts={seed['name']:seed['asset_hosts'] for seed in approved}
    for seed in approved:
        if urlsplit(seed['url']).hostname != urlsplit(known[seed['name']].get('website','')).hostname:
            raise CrawlError('Company seed must match its reviewed official website host')
    result=crawl_profiles({'partnerLeads':list(known)},args,transport,company=True)
    result['mode']='company-profiles'
    for candidate in result['candidates']:
        candidate['company']=candidate.pop('partner')
    for row in result['results']:
        company=known[row['name']]
        articles=[]
        for page in row['pages']:
            if page.get('status')=='ok':
                result['candidates'].append(company_profile_observation(company,page))
                article=newsroom_observation(company,page)
                if article:
                    articles.append(article)
                else:
                    result['candidates'].extend(professional_bio_observations(company,page,asset_hosts[row['name']]))
        result['candidates'].extend(stage_newsroom_articles(row['name'],articles))
    result['coverage']=page_fetch_coverage(result['results'],result['candidates'])
    result['warning']='Research-only page observations, not verified company profiles or headshots. Review each subject, role, social link and asset provenance before publication. No image or social destination is fetched by this mode.'
    return result

NEWS_FUNDING = re.compile(r'\b(fund(?:ing|ed|raise)?|rais(?:e|es|ed|ing)|invest(?:ment|or|s|ed)?|series|seed|acqui(?:res|red|sition)|launch(?:es|ed)?)\b',re.I)
NEWS_PRIORITY = re.compile(r'\b(fund(?:ing|ed|raise)?|rais(?:e|es|ed|ing)|series|seed)\b',re.I)

def crawl_startup_news(registry,args,transport):
    """Discover dated, source-attributed candidates; never publish extracted claims."""
    sources=registry['sources']
    if args.only: sources=[s for s in sources if s['id'] in set(args.only)]
    if args.limit: sources=sources[:args.limit]
    if not sources: raise CrawlError('No startup news sources matched')
    results=[]; candidates=[]
    def fetch(url,host):
        try:
            status,headers,body,final=transport.request(url,host)
            if status!=200: raise CrawlError(f'HTTP {status}')
            ctype=headers.get('Content-Type','').lower()
            if ctype and 'html' not in ctype: raise CrawlError(f'not HTML: {ctype[:100]}')
            return {'url':url,'final_url':final,'checked_at':utc_now(),'status':'ok',**extract_page(body,final)}
        except (CrawlError,ValueError) as exc:
            return {'url':url,'checked_at':utc_now(),'status':'skipped','reason':str(exc)}
    for entry in sources:
        host=urlsplit(entry['url']).hostname
        page=fetch(entry['url'],host); pages=[page]; selected=[]
        if page['status']=='ok':
            ranked=[];seen_links=set()
            for position,link in enumerate(page.get('profile_links',[])):
                url=link.get('url',''); parts=urlsplit(url); label=link.get('text','')
                if parts.hostname!=host or not NEWS_FUNDING.search(label+' '+parts.path): continue
                clean=urlunsplit((parts.scheme,parts.netloc,parts.path,parts.query,''))
                if clean==entry['url'] or clean in seen_links: continue
                seen_links.add(clean)
                text=label+' '+parts.path.replace('-',' ')
                score=(4 if NEWS_PRIORITY.search(text) else 0)+(2 if entry['name'].casefold() in label.casefold() else 0)
                ranked.append((score,position,{'url':clean,'title':label[:200]}))
            selected=[item for _,_,item in sorted(ranked,key=lambda row:(-row[0],row[1]))[:args.follow]]
            for target in selected:
                article=fetch(target['url'],host); pages.append(article)
                if article['status']!='ok': continue
                candidates.append({'startup':entry['name'],'title':article.get('title') or target['title'],
                    'url':article.get('final_url'), 'discovered_from':page['final_url'],
                    'checked_at':article['checked_at'], 'published_hint':article.get('metadata',{}).get('article:published_time',''),
                    'amount_mentions':article.get('amount_mentions',[]), 'evidence':article.get('evidence',{}),
                    'review_required':True})
        results.append({'name':entry['name'],'url':entry['url'],'pages':pages})
        print(f"[{len(results)}/{len(sources)}] {entry['name']}: {page['status']}; {len(selected)} articles",file=sys.stderr)
    return {'version':1,'mode':'news','generated_at':utc_now(),'results':results,'candidates':candidates,
            'coverage':page_fetch_coverage(results,candidates),
            'warning':'Unreviewed article and amount candidates; verify the startup, transaction, currency, date and source before publication.'}

def page_fetch_coverage(results, candidates):
    """Describe attempted page fetches, not completeness of the source universe."""
    pages=[page for row in results for page in row.get('pages', [])]
    succeeded=sum(page.get('status')=='ok' for page in pages)
    failed=len(pages)-succeeded
    status=('not_attempted' if not pages else 'none_succeeded' if not succeeded
            else 'partial' if failed else 'all_succeeded')
    return {'fetch_status':status, 'sources_attempted':len(results),
            'pages_attempted':len(pages), 'pages_succeeded':succeeded,
            'pages_skipped_or_failed':failed, 'unreviewed_candidates':len(candidates),
            'note':'Counts cover attempted pages only; they do not establish complete source coverage or verified facts.'}

def crawl_profiles(catalogue,args,transport,company=False):
    seeds=load_approved_csv(args.approved,set(catalogue['partnerLeads']),require_qid=False)
    if args.partner: seeds=[s for s in seeds if args.partner.casefold() in s['name'].casefold()]
    if args.limit: seeds=seeds[:args.limit]
    if not seeds: raise CrawlError('No approved partner websites matched')
    results=[]; candidates=[]
    def fetch(url,host,scope):
        try:
            status,headers,body,final=scoped_request(transport,url,host,scope)
            ctype=headers.get('Content-Type','').lower()
            if status!=200: raise CrawlError(f'HTTP {status}')
            if ctype and 'html' not in ctype: raise CrawlError(f'not HTML: {ctype[:100]}')
            return {'url':url,'final_url':final,'checked_at':utc_now(),'status':'ok','http_status':status,**extract_page(body,final)}
        except (CrawlError,ValueError) as exc:
            return {'url':url,'checked_at':utc_now(),'status':'skipped','reason':str(exc)}
    for seed in seeds:
        host=urlsplit(seed['url']).hostname
        scope=seed.get('crawl_scope'); follow=min(args.follow,scope['max_follow']) if scope else args.follow
        homepage=fetch(seed['url'],host,scope); pages=[homepage]; discovered=[]
        if homepage['status']=='ok':
            candidates.extend(extract_profile_media_leads(seed['name'],homepage,'homepage'))
            discovered=profile_landing_links(homepage,seed['url'],follow,include_about=company)
            if company and scope is not None:
                kinds={item['url']:item['kind'] for item in discovered}
                visited={scope_url(homepage['final_url'],host),scope_url(seed['url'],host)}
                approved=[{'url':url,'kind':kinds.get(url,'approved-document')}
                          for url in scope['allowed_urls']
                          if url not in scope['denied_urls'] and url not in visited]
                # Retain skipped-link evidence for unused follow slots. The
                # existing request guard rejects out-of-scope links before I/O.
                approved_urls={item['url'] for item in approved}
                discovered=(approved+[item for item in discovered
                                      if item['url'] not in approved_urls | visited])[:follow]
            for target in discovered:
                page=fetch(target['url'],host,scope); page['profile_kind']=target['kind']; pages.append(page)
                if page['status']=='ok':
                    if target['kind'] in PROFILE_PATH_RULES:
                        candidates.extend(extract_profile_leads(seed['name'],page,target['kind']))
                    candidates.extend(extract_profile_media_leads(seed['name'],page,target['kind']))
        results.append({'name':seed['name'],'url':seed['url'],'pages':pages,**({'crawl_scope':scope} if scope is not None else {}),
                        'note':'No matching team or portfolio links found' if homepage['status']=='ok' and not discovered else ''})
        print(f"[{len(results)}/{len(seeds)}] {seed['name']}: {homepage['status']}; {len(discovered)} profile pages",file=sys.stderr)
    return {'version':1,'mode':'profiles','generated_at':utc_now(),'results':results,'candidates':candidates,
            'coverage':page_fetch_coverage(results,candidates),
            'warning':'Links are unreviewed leads, not verified people, roles, investments or current relationships. Verify each against its source before publishing.'}

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
            accepted=0; attempts=0; seen_digests=set()
            # Bound retries even if a site supplies many duplicate or broken images.
            max_attempts=min(args.logo_limit*3,15)
            # Prefer higher-resolution alternatives before legacy favicons under the capture limit.
            candidates=sorted(page.get('logo_candidates',[]),key=lambda item: item.get('kind')=='site-icon' and urlsplit(item['url']).path.lower().endswith('.ico'))
            for item in candidates:
                row={'partner':entry['name'],'page':page['final_url'],**item,'status':'not_fetched'}
                if entry.get('crawl_scope') is not None: row['reason']='Scoped document approval does not authorize asset downloads'
                elif item['kind']=='social-image': row['reason']='Social images are not automatically treated as logos'
                elif not item['same_host'] and (urlsplit(item['url']).hostname or '').lower() not in entry.get('asset_hosts',[]): row['reason']='External asset host requires separate review'
                elif accepted>=args.logo_limit: row['reason']='Per-site candidate limit reached'
                elif attempts>=max_attempts: row['reason']='Per-site attempt limit reached'
                else:
                    attempts+=1
                    try:
                        status,headers,body,final=transport.request(item['url'],urlsplit(item['url']).hostname,accept='image/svg+xml,image/png,image/webp,image/jpeg,image/gif')
                        if status!=200: raise CrawlError(f'HTTP {status}')
                        # Store as opaque bytes: never execute, inline, or publish without review.
                        head=body[:2048].lstrip().lower()
                        kind=('ico' if len(body)>=6 and body[:4]==b'\x00\x00\x01\x00' and body[4:6]!=b'\x00\x00' else 'png' if body.startswith(b'\x89PNG\r\n\x1a\n') else 'jpeg' if body.startswith(b'\xff\xd8\xff') else 'gif' if body.startswith((b'GIF87a',b'GIF89a')) else 'webp' if body[:4]==b'RIFF' and body[8:12]==b'WEBP' else 'svg' if b'<svg' in head and not head.startswith(b'<!doctype html') else '')
                        if not kind: raise CrawlError('Response is not a recognised image')
                        digest=hashlib.sha256(body).hexdigest()
                        if digest in seen_digests:
                            row.update(status='duplicate',final_url=final,format=kind,sha256=digest,reason='Identical bytes already captured for this page')
                        else:
                            seen_digests.add(digest); (folder/(digest+'.bin')).write_bytes(body)
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
                # One programme can be listed by several directories or pages.
                # Deduplicate repeated links, not their distinct source evidence.
                key=(row['id'],page['final_url'],url.split('#',1)[0],label.casefold())
                if key in seen: continue
                seen.add(key)
                candidates.append({'label':label[:200],'program_url':url,'context':context[:500],
                                   'source_id':row['id'],'source_name':row['name'],'source_url':page['final_url'],
                                   'source_scope':scopes.get(row['id'],''),'checked_at':page['checked_at'],
                                   'review_required':True})
    result['candidates']=candidates[:1000]
    result['coverage']=program_candidate_coverage(result['results'],candidates,1000)
    result['warning']='Links are unreviewed source observations, not unique programmes. Source scope is directory context, not applicant eligibility. Programme identity, intake and relationships require review.'
    return result

def program_candidate_coverage(results, candidates, cap):
    """Keep fetch failures and bounded source observations visible in review output."""
    returned=candidates[:cap]
    def counts(observed, retained):
        return {'observed_candidates':len(observed), 'returned_candidates':len(retained),
                'omitted_candidates':len(observed)-len(retained), 'truncated':len(observed)>len(retained)}
    sources=[]; fetched_pages={}; page_observations=0
    for row in results:
        observed=[c for c in candidates if c['source_id']==row['id']]
        retained=[c for c in returned if c['source_id']==row['id']]
        fetched=page_fetch_coverage([row],retained)
        pages=row.get('pages',[]); new_fetches=0; page_observations+=len(pages)
        for page in pages:
            # crawl_sites caches by the original request URL, including failures.
            if page['url'] not in fetched_pages:
                fetched_pages[page['url']]=page; new_fetches+=1
        sources.append({'source_id':row['id'], 'source_name':row['name'], 'source_url':row['url'],
                        'fetch_status':fetched['fetch_status'], 'page_observations':len(pages),
                        'successful_page_observations':fetched['pages_succeeded'],
                        'failed_page_observations':fetched['pages_skipped_or_failed'],
                        'new_fetch_attempts':new_fetches, 'reused_page_observations':len(pages)-new_fetches,
                        **counts(observed,retained)})
    coverage=page_fetch_coverage([{'pages':list(fetched_pages.values())}],returned)
    return {**coverage, 'sources_attempted':len(results), 'page_observations':page_observations,
            'reused_page_observations':page_observations-len(fetched_pages),
            **counts(candidates,returned), 'candidate_limit':cap, 'sources':sources,
            'note':'Fetch counts cover unique requested URLs, not HTTP exchanges across redirects. Source page observations can reuse cached successes or failures. Candidate counts are source observations, not unique programmes or verified facts. Successful pages without matches may need parser review; failed pages remain unknown. Unattempted pages are excluded.'}

def directory_coverage(results, candidates, notes, cap):
    """Describe observed source coverage; counts are not estimates of the full ecosystem."""
    rows=[]
    for result in results:
        pages=result.get('pages',[])
        selected=[c for c in candidates if c.get('source_name') == result.get('name')]
        source_urls={p.get('final_url') for p in pages}
        issues=[n.get('message','') for n in notes if n.get('source_url') in source_urls]
        rows.append({'source':result.get('name'), 'pages_ok':sum(p.get('status')=='ok' for p in pages),
                     'pages_skipped_or_failed':sum(p.get('status')!='ok' for p in pages),
                     'observed_candidates':len(selected),
                     'exact_existing_names':sum(bool(c.get('existing_lead_exact')) for c in selected),
                     'unmatched_names':sum(not c.get('existing_lead_exact') for c in selected),
                     'notes':issues})
    return {'sources':rows, 'observed_candidates':len(candidates),
            'returned_candidates':min(len(candidates),cap), 'truncated':len(candidates)>cap,
            'warning':'Counts cover extracted rows only; exact names are not verified identities and missed or inaccessible pages are unknown.'}

def crawl_partner_directories(registry,catalogue,args,transport):
    """Extract unverified organisations from a curated provider directory table."""
    sources=registry['sources']
    seed_catalogue={'opportunities':[{'id':s['id'],'name':s['name'],'url':s['url'],'extra':[]} for s in sources], 'partnerLeads':[]}
    result=crawl_sites(seed_catalogue,args,transport); result['mode']='partners'
    sources_by_id={s['id']:s for s in sources}; existing={name.casefold() for name in catalogue['partnerLeads']}
    candidates=[]; seen=set(); notes=[]
    for row in result['results']:
        source=sources_by_id[row['id']]
        accepted={value.casefold() for value in source.get('accepted_types',[])}
        for page in row['pages']:
            if page['status']!='ok': continue
            matched=False
            source_format=source.get('format','table')
            if source_format in ('heading_section','context_links','self_report'):
                found=[]
                if source_format=='heading_section':
                    active=False
                    for heading in page.get('headings',[]):
                        level=heading.get('level','')
                        if level==source['section_level']:
                            active=heading.get('text','').strip().casefold()==source['section_title'].casefold()
                            if active: matched=True
                        elif active and level==source['entry_level']:
                            found.append((heading.get('text','').strip(),''))
                elif source_format=='context_links':
                    for link in page.get('links',[]):
                        if source['context_phrase'].casefold() in link.get('context','').casefold():
                            matched=True; found.append((link.get('text','').strip(),link.get('url','')))
                else:
                    observed=' '.join([page.get('title','')]+[h.get('text','') for h in page.get('headings',[])]+page.get('signals',[]))
                    if source['claim_phrase'].casefold() in observed.casefold():
                        matched=True; found.append((source['claim_name'],''))
                for name,website in found:
                    key=(page['final_url'],name.casefold())
                    if not name or key in seen: continue
                    parts=urlsplit(website)
                    if website and (parts.scheme!='https' or not parts.hostname or parts.username or parts.password): website=''
                    seen.add(key)
                    candidates.append({'name':name,'reported_type':source['reported_type'],'provider':source['provider'],
                                       'source_name':row['name'],'source_url':page['final_url'],
                                       'source_scope':source['scope'],'checked_at':page['checked_at'],
                                       'website_candidate':website,'existing_lead_exact':name.casefold() in existing,
                                       'review_required':True})
                if not matched: notes.append({'source_url':page['final_url'],'message':'No matching source section or claim found; review the page structure or status.'})
                continue
            for table in page.get('tables',[]):
                rows=table['rows']
                if not rows: continue
                headers=[cell['text'].casefold() for cell in rows[0]]
                try:
                    name_index=headers.index(source['name_column'].casefold())
                    type_index=headers.index(source['type_column'].casefold()) if source.get('type_column') else None
                except ValueError: continue
                matched=True
                for cells in rows[1:]:
                    if name_index>=len(cells) or (type_index is not None and type_index>=len(cells)): continue
                    name=cells[name_index]['text'].strip(); reported_type=cells[type_index]['text'].strip() if type_index is not None else source.get('default_type','')
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
    result['coverage'] = directory_coverage(result['results'], candidates, notes, 2000)
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
    fields=['label','program_url','context','source_name','source_url','source_scope','source_id','checked_at','approved']
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

def wikidata_api_url(params):
    return API+'?'+urlencode({**params,'format':'json','maxlag':'5'})

def api_json(transport,params):
    url=wikidata_api_url(params)
    status,_,body,_=transport.request(url,'www.wikidata.org',accept='application/json')
    if status!=200: raise CrawlError(f'Wikidata HTTP {status}')
    try: data=json.loads(body)
    except ValueError as exc: raise CrawlError('invalid Wikidata JSON') from exc
    if not isinstance(data,dict): raise CrawlError('invalid Wikidata response object')
    if 'error' in data:
        error=data['error']; code=error.get('code','unknown') if isinstance(error,dict) else 'unknown'
        raise CrawlError('Wikidata API: '+str(code)[:200])
    if data.get('success')==0: raise CrawlError('Wikidata API reported success=0')
    return data

def claim_values(entity,prop):
    claims=entity.get('claims')
    # The legacy Action API can serialize an empty map as an empty array.
    if claims==[]: claims={}
    if not isinstance(claims,dict): raise CrawlError('Wikidata claims are absent or invalid')
    statements=claims.get(prop,[])
    if not isinstance(statements,list): raise CrawlError(f'Invalid Wikidata statements for {prop}')
    output=[]
    for item in statements[:8]:
        if not isinstance(item,dict): raise CrawlError(f'Invalid Wikidata statement for {prop}')
        if item.get('rank')=='deprecated': continue
        snak=item.get('mainsnak')
        if not isinstance(snak,dict): raise CrawlError(f'Invalid Wikidata mainsnak for {prop}')
        if snak.get('snaktype') in ('somevalue','novalue'): continue
        datavalue=snak.get('datavalue')
        if not isinstance(datavalue,dict) or 'value' not in datavalue or datavalue['value'] is None:
            raise CrawlError(f'Invalid Wikidata datavalue for {prop}')
        value=datavalue['value']
        if isinstance(value,dict): value=value.get('id') or value.get('time') or value.get('text') or value.get('amount')
        if isinstance(value,bool) or not isinstance(value,(str,int,float)):
            raise CrawlError(f'Invalid Wikidata selected value for {prop}')
        if value not in output: output.append(value)
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
    metadata={}; operations={'attempted':0,'succeeded':0,'failed':0}
    def collect_batch(ids):
        params={'action':'wbgetentities','ids':'|'.join(ids),'props':'claims','languages':'en'}
        provenance={'source':wikidata_api_url(params),'checked_at':utc_now()}
        operations['attempted']+=1
        try:
            entities=api_json(transport,params).get('entities')
            if entities==[]: entities={}
            if not isinstance(entities,dict): raise CrawlError('invalid Wikidata entities response')
        except CrawlError as exc:
            operations['failed']+=1
            if len(ids)>1 and 'response exceeds size limit' in str(exc):
                mid=len(ids)//2; collect_batch(ids[:mid]); collect_batch(ids[mid:])
            else:
                for qid in ids:
                    metadata[qid]={'metadata_fetch':{'status':'failed','reason':str(exc),**provenance}}
                print(f'Entity batch unavailable: {exc}',file=sys.stderr)
            return
        operations['succeeded']+=1
        for qid in ids:
            try:
                if qid not in entities: raise CrawlError('Requested Wikidata entity was omitted from the response')
                entity=entities[qid]
                if not isinstance(entity,dict): raise CrawlError('Invalid Wikidata entity object')
                if 'missing' in entity: raise CrawlError('Wikidata entity is missing')
                if entity.get('id',qid)!=qid: raise CrawlError('Wikidata entity ID does not match the requested QID')
                properties={name:values for prop,name in PROPERTIES.items() if (values:=claim_values(entity,prop))}
            except CrawlError as exc:
                metadata[qid]={'metadata_fetch':{'status':'unavailable','reason':str(exc),**provenance}}
            else:
                metadata[qid]={'metadata_fetch':{'status':'ok',**provenance},'properties':properties}
    for start in range(0,len(qids),20): collect_batch(qids[start:start+20])
    for row in rows:
        for candidate in row['candidates']:
            candidate.update(metadata[candidate['qid']])
    succeeded=sum(value['metadata_fetch']['status']=='ok' for value in metadata.values())
    failed=sum(value['metadata_fetch']['status']=='failed' for value in metadata.values())
    references=sum(len(row['candidates']) for row in rows)
    coverage={'fetch_status':('not_attempted' if not qids else 'all_succeeded' if succeeded==len(qids) else 'partial' if succeeded else 'none_succeeded'),
              'entities_requested':len(qids),'entities_succeeded':succeeded,'entities_failed':failed,
              'entities_unavailable':len(qids)-succeeded-failed,'candidate_references':references,
              'reused_candidate_references':references-len(qids),'api_operations':operations,
              'note':'Metadata coverage counts unique QIDs, including valid empty claims. Repeated candidate references reuse the same outcome and provenance. API operations count wbgetentities client calls, including size-limit splits and calls rejected by the transport; they are not HTTP exchange counts. Search outcomes remain in each row status.'}
    return {'version':1,'mode':'discover','generated_at':utc_now(),'warning':'Candidates are unverified; name similarity is not identity or partnership verification. Missing properties after a failed or unavailable metadata fetch are unknown, not evidence of absence.','metadata_coverage':coverage,'results':rows}

def csv_safe(value):
    value=str(value)
    return "'"+value if re.match(r'^\s*[=+\-@]',value) or value.startswith(('\t','\r')) else value

def write_review_csv(path,data):
    with path.open('w',newline='',encoding='utf-8') as handle:
        fields=['partner','qid','label','description','official_website','country_ids','headquarters_ids','inception','founder_ids','industry_ids','logo_file','linkedin_id','name_similarity','source','metadata_status','metadata_checked_at','metadata_source','metadata_reason','directory_provider','directory_type','directory_source','directory_scope','directory_checked_at','approved']
        writer=csv.DictWriter(handle,fieldnames=fields)
        writer.writeheader()
        for row in data['results']:
            for c in row['candidates']:
                sites=c.get('properties',{}).get('official_website',[])
                properties=c.get('properties',{})
                metadata=c.get('metadata_fetch',{})
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
                                 'metadata_status':metadata.get('status',''),'metadata_checked_at':metadata.get('checked_at',''),
                                 'metadata_source':metadata.get('source',''),'metadata_reason':metadata.get('reason',''),
                                 'directory_provider':directory.get('provider',''),'directory_type':directory.get('reported_type',''),
                                 'directory_source':directory.get('url',''),'directory_scope':directory.get('scope',''),
                                 'directory_checked_at':directory.get('checked_at',''),'approved':''}
                writer.writerow({key:csv_safe(value) for key,value in values.items()})

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode',choices=['sites','discover','programs','partners','captures','apply-reviewed','logos','partner-candidates','profiles','company-profiles','news'])
    p.add_argument('--limit',type=int,default=0,help='Maximum records (0 = all)')
    p.add_argument('--delay',type=float,default=1.0,help='Minimum seconds between requests to one host (at least 1)')
    p.add_argument('--follow',type=int,default=2,help='Same-host related pages per starting page, 0–5')
    p.add_argument('--only',action='append',default=[],help='Only this catalogue or source id; repeatable')
    p.add_argument('--partner',help='Case-insensitive partner-name filter for discovery or profile crawling')
    p.add_argument('--leads',type=Path,help='With discover, search names from a partner-directory review CSV')
    p.add_argument('--candidates',type=int,default=5,help='Wikidata candidates per partner, 1–10')
    p.add_argument('--approved',type=Path,help='Reviewed CSV: include rows with approved=yes as site seeds')
    p.add_argument('--partners-only',action='store_true',help='With --approved, crawl only approved partner websites')
    p.add_argument('--logo-limit',type=int,default=2,help='Maximum same-host image candidates to capture per page (0–5)')
    p.add_argument('--snapshot',type=Path,help='Optional sites snapshot to import website descriptions for approved partners')
    p.add_argument('--captures',type=Path,help='JSON file containing provided, attributable text excerpts')
    p.add_argument('--out',type=Path,default=ROOT/'research/crawl',help='Directory for generated snapshots')
    args=p.parse_args(argv)
    require_scoped_launcher(args.approved)
    if args.limit<0 or not 0<=args.follow<=5 or not 1<=args.candidates<=10 or args.delay<0 or not 0<=args.logo_limit<=5: p.error('Invalid limits or delay')
    if args.mode=='apply-reviewed' and not args.approved: p.error('apply-reviewed requires --approved PATH')
    if args.mode=='partner-candidates' and (not args.approved or not args.snapshot): p.error('partner-candidates requires --approved and --snapshot')
    if args.mode=='captures' and not args.captures: p.error('captures requires --captures PATH')
    if args.mode in ('logos','profiles','company-profiles') and not args.approved: p.error(f'{args.mode} requires --approved PATH')
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
        if args.mode=='news': data=crawl_startup_news(json.loads(STARTUP_NEWS_SOURCES.read_text(encoding='utf-8')),args,transport)
        elif args.mode=='profiles': data=crawl_profiles(catalogue,args,transport)
        elif args.mode=='company-profiles': data=crawl_company_profiles(json.loads((ROOT/'data/startup-research.json').read_text(encoding='utf-8'))['startups'],args,transport)
        elif args.mode=='sites': data=crawl_sites(catalogue,args,transport)
        elif args.mode=='logos': data=stage_partner_logos(crawl_sites(catalogue,args,transport),args,transport)
        elif args.mode=='discover': data=discover(catalogue,args,transport)
        elif args.mode=='partners': data=crawl_partner_directories(json.loads(PARTNER_SOURCES.read_text(encoding='utf-8')),catalogue,args,transport)
        else: data=crawl_program_directories(json.loads(PROGRAM_SOURCES.read_text(encoding='utf-8')),args,transport)
    if globals().get('__implementation__'): data['implementation']=__implementation__
    path=args.out/f'{args.mode}-{stamp()}.json'; write_json(path,data); write_json(args.out/f'latest-{args.mode}.json',data)
    if args.mode=='profiles': print(f"Prepared {len(data['candidates'])} unreviewed profile leads")
    if args.mode=='news': print(f"Prepared {len(data['candidates'])} unreviewed news leads")
    if args.mode=='discover':
        review=args.out/f'partner-review-{stamp()}.csv'; write_review_csv(review,data); print(f'Review candidates: {review}')
        coverage=data['metadata_coverage']
        print(f"Wikidata metadata coverage: {coverage['fetch_status']}; {coverage['entities_succeeded']}/{coverage['entities_requested']} unique entities retrieved; {coverage['entities_failed']} failed; {coverage['entities_unavailable']} unavailable. {coverage['candidate_references']} candidate references; {coverage['reused_candidate_references']} reused entity outcomes.")
    if args.mode=='programs':
        review=args.out/f'program-review-{stamp()}.csv'; write_program_review_csv(review,data); print(f"Review {len(data['candidates'])} unreviewed programme source observations: {review}")
        coverage=data['coverage']
        print(f"Programme observations: {coverage['observed_candidates']} observed; {coverage['returned_candidates']} returned; {coverage['omitted_candidates']} omitted by the candidate limit.")
    if args.mode=='partners':
        review=args.out/f'partner-directory-review-{stamp()}.csv'; write_partner_directory_review_csv(review,data); print(f"Review {len(data['candidates'])} directory leads: {review}")
        for note in data['notes']: print(f"{note['source_url']}: {note['message']}",file=sys.stderr)
    if args.mode in ('profiles','company-profiles','news','programs'):
        coverage=data['coverage']
        print(f"Page fetch coverage: {coverage['fetch_status']}; {coverage['pages_succeeded']}/{coverage['pages_attempted']} attempted pages fetched; {coverage['pages_skipped_or_failed']} skipped or failed.")
    print(f'Snapshot: {path}')
    if args.mode=='discover':
        if data['metadata_coverage']['entities_requested'] and not data['metadata_coverage']['entities_succeeded']:
            print('Candidate leads staged; no entity metadata could be retrieved. Inspect the snapshot for reasons.',file=sys.stderr)
            return 1
        success=sum(row['status'] in ('candidates','no_matches') for row in data['results'])
    elif args.mode=='captures': success=len(data['results'])
    else: success=sum(any(p['status']=='ok' for p in row['pages']) for row in data['results'])
    if data['results'] and not success: print('No records could be fetched; inspect the snapshot for reasons.',file=sys.stderr); return 1
    return 0

if __name__=='__main__':
    try: sys.exit(main())
    except (OSError,CrawlError,ValueError) as exc: print(f'Error: {exc}',file=sys.stderr); sys.exit(2)
