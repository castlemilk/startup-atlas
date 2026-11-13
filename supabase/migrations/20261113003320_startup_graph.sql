-- Startup Atlas graph: reviewed, source-attributed public records only.
-- Candidate observations stay private until reviewed; never use user-editable
-- auth metadata to authorize writes. IDs are stable and independent of names.
create table public.atlas_entities (
  id text primary key,
  kind text not null check (kind in ('startup','partner','provider','person')),
  name text not null check (length(trim(name)) > 0),
  summary text not null default '',
  website text,
  logo_url text,
  logo_source_url text,
  source_url text,
  founded_year integer check (founded_year between 1800 and 2100),
  publication_status text not null default 'draft' check (publication_status in ('draft','published','archived')),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as
    (setweight(to_tsvector('simple', coalesce(name,'')), 'A') ||
     setweight(to_tsvector('simple', coalesce(summary,'')), 'B')) stored
);
create unique index atlas_entities_kind_name_idx on public.atlas_entities(kind, lower(name));
create index atlas_entities_search_idx on public.atlas_entities using gin(search_document);
create index atlas_entities_published_kind_idx on public.atlas_entities(kind, name) where publication_status='published';

create table public.atlas_edges (
  id bigint generated always as identity primary key,
  from_id text not null references public.atlas_entities(id),
  to_id text not null references public.atlas_entities(id),
  kind text not null,
  description text not null,
  source_url text not null check (source_url like 'https://%'),
  observed_at date,
  publication_status text not null default 'draft' check (publication_status in ('draft','published','archived')),
  unique(from_id,to_id,kind,source_url),
  check(from_id <> to_id)
);
create index atlas_edges_from_idx on public.atlas_edges(from_id) where publication_status='published';
create index atlas_edges_to_idx on public.atlas_edges(to_id) where publication_status='published';

create table public.atlas_funding_rounds (
  id text primary key,
  startup_id text not null references public.atlas_entities(id),
  stage text not null,
  announced_on date,
  amount bigint check (amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  valuation bigint check (valuation >= 0),
  valuation_currency text check (valuation_currency ~ '^[A-Z]{3}$'),
  note text not null default '',
  source_url text not null check (source_url like 'https://%'),
  publication_status text not null default 'draft' check (publication_status in ('draft','published','archived')),
  check ((amount is null) = (currency is null)),
  check ((valuation is null) = (valuation_currency is null))
);
create index atlas_funding_startup_date_idx on public.atlas_funding_rounds(startup_id, announced_on desc) where publication_status='published';

create table public.atlas_articles (
  id bigint generated always as identity primary key,
  startup_id text not null references public.atlas_entities(id),
  title text not null,
  url text not null check (url like 'https://%'),
  published_on date,
  kind text not null,
  publication_status text not null default 'draft' check (publication_status in ('draft','published','archived')),
  unique(startup_id,url)
);
create index atlas_articles_startup_date_idx on public.atlas_articles(startup_id, published_on desc) where publication_status='published';

alter table public.atlas_entities enable row level security;
alter table public.atlas_edges enable row level security;
alter table public.atlas_funding_rounds enable row level security;
alter table public.atlas_articles enable row level security;
grant select on public.atlas_entities, public.atlas_edges, public.atlas_funding_rounds, public.atlas_articles to anon, authenticated;
create policy atlas_public_entities on public.atlas_entities for select to anon, authenticated using (publication_status='published');
create policy atlas_public_edges on public.atlas_edges for select to anon, authenticated using (publication_status='published' and exists (select 1 from public.atlas_entities e where e.id=from_id and e.publication_status='published') and exists (select 1 from public.atlas_entities e where e.id=to_id and e.publication_status='published'));
create policy atlas_public_rounds on public.atlas_funding_rounds for select to anon, authenticated using (publication_status='published' and exists (select 1 from public.atlas_entities e where e.id=startup_id and e.kind='startup' and e.publication_status='published'));
create policy atlas_public_articles on public.atlas_articles for select to anon, authenticated using (publication_status='published' and exists (select 1 from public.atlas_entities e where e.id=startup_id and e.kind='startup' and e.publication_status='published'));
