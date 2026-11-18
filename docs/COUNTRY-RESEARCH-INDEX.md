# Country research discovery index

`scripts/index_country_research.py` is an **offline research index**, not a
production importer or executable crawler queue. It discovers every file under
the supplied countries directory, pins bytes with SHA-256, and indexes named
website-bearing JSON objects at their exact document/JSON Pointer locations.
Original nested records, claims, field dispositions and holds are retained,
not projected into the production schema. Other documents remain in the hashed
manifest; URL occurrences retain their document pointers. No packet code runs.

```sh
python3 scripts/index_country_research.py \
  --root research/countries --approved data/company-profile-seeds.csv \
  --revision "$(git rev-parse HEAD)" --limit 100 > /tmp/country-index.json
# Optional offline substring lookup across the original record metadata:
python3 scripts/index_country_research.py \
  --root research/countries --approved data/company-profile-seeds.csv \
  --revision "$(git rev-parse HEAD)" --query ElevenLabs --limit 100
```

Use a clean, exact main checkout after the country merge queue. The revision is
caller-supplied, **not proof the files belong to that commit**; check the worktree
and remote SHA independently. Pass `next_cursor` as `--cursor` to read the next
page. Revision, all document hashes, seed bytes, query and page size bind the
cursor. Any change requires a new inventory, not silent continuation. Pagination
tracks inventory enumeration only: it must never stand in for worker checkpoints,
network attempt outcomes, source freshness or collection completion.

## Interpretation and admission gates

Counts are **source-record occurrences**, never distinct startups, accepted
companies or national coverage. Heterogeneous packets contain repeated company
projections, saved baseline inventories, alumni, rejected candidates, enriched
existing entities and contextual companies. A company without an explicit string
`name`/`canonical_name` and `website` is not projected into the record list, but
its document remains in the manifest. No schema-completeness assertion is made.

Exact website hosts (with `www.` stripped only for collision hints) group
possible duplicates; no groups merge identities. Different domains can identify
the same entity and shared domains can identify different entities. Preserve
HQ, origin and incorporation distinctions. Review cross-kind identities such
as Anthropic/provider and Fin/Intercom, country-context ElevenLabs, and name-only
Neo before choosing canonical IDs. An embedded ID is a claim, not the index key.

`exact_name_and_url_candidate` means only that the existing approved CSV has the
same name and exact URL. **It neither approves a new source nor admits a record.**
All items remain `not_scheduled`. Evidence/news URLs and registry links are not
crawl targets, regardless of their presence or access labels in a packet.

Before collection, the collection owner must resolve identity across packets and
the current graph; review original companion claims, source registries and holds;
choose an explicit population and approved-source mapping; and obtain a reviewed
production proposal where appropriate. Reuse `plan_company_profiles.py` and
`replay_company_profiles.py` for their existing supported overlay and saved
packet contracts, not arbitrary index objects. Follow the collector's HTTPS,
approved-host/public-address, redirect, size/time, throttling and 429 protections.
No robots.txt requests. Uncertain-worker reconciliation and durable runtime
checkpoint storage are separate adoption gates; this index implements neither.

## Boundaries and tests

No network calls, source approvals, production writes, workflow changes, live
search publication or runtime integrations are included. Input bounds: 3,000
files, 8 MiB per file, 128 MiB total, 500,000 JSON nodes, depth 64, 500 returned
records per page and 16 MiB serialized output. Only record items are paginated;
the complete document/URL/collision manifests repeat on every page. If output
exceeds the hard bound, use a smaller country directory input; do not truncate
provenance. This is not a streaming index. Symlinks, malformed/ambiguous JSON and stale cursors fail closed.
Outputs can contain original source URLs and full research records; keep them
outside production datasets and do not treat a successful index as factual QA.

Run `python3 -m unittest discover -s tests -p test_country_research_index.py`.
The repository's existing Python test discovery also includes this test module.
