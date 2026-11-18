# Türkiye batch 1 integration instructions

This directory is a staged country research packet. Its `startup-records.json`
contains projections into the repository's existing accepted startup record
shape. The richer `companies.json` and `claims.json` preserve information that
the accepted shape cannot express directly. Nothing in this directory is a
production overlay, approved crawler seed, live MCP write or deployment.

## Ownership and source boundary

- Initial source main: `f4bcbf7030d741772bb750deee584efa3ee17749`.
- Final validation main: `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`.
- Owned path: `research/countries/tr/2026-11-18-batch-001/` only.
- Country branch: `research/turkiye-gdp16-20261118-batch01`.
- [Collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2)
  retains acquisition, source approval and real-record collection.
- [Planner 177](https://github.com/castlemilk/startup-atlas/pull/177) and
  [replay 178](https://github.com/castlemilk/startup-atlas/pull/178) retain their
  existing responsibilities. The replay contract is synthetic-only; this real
  company packet must not be relabelled synthetic to pass that boundary.
- The record and investor-round owners retain accepted schemas, canonical
  identities, whole-record revision checks and any future typed event adoption.
- [Canonical coordination](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a)
  holds the exact delivery receipt. Owner acknowledgement is not assumed.

## Validate the saved packet

From the repository root:

```bash
python3 research/countries/tr/2026-11-18-batch-001/validate_packet.py
node research/countries/tr/2026-11-18-batch-001/validate-records.mjs
python3 research/countries/tr/2026-11-18-batch-001/validate-planner.py
python3 -m unittest discover -s research/countries/tr/2026-11-18-batch-001 -p 'test_packet.py' -v
```

The first command checks exact baseline Git inputs and performs an in-memory
combined graph build. It does not write generated graph files. The Node command
imports the real `backend/hosted/src/startup-record.mjs`; no alternative
production validator is installed. `validation/` records the executed results.
The saved schema is an export of the existing schema for transfer and review,
not a new accepted API field.

Verify `SHA256SUMS` from this directory before resuming or transferring it:

```bash
sha256sum -c SHA256SUMS
```

The packet-only check can run without Git using `validate_packet.py --skip-git`.
That mode deliberately does not claim baseline identity or graph integration
verification. The actual record-validator check still requires this repository.

## Review before importing records

**Owner fixes incorporated:** initial validation at `f4bcbf7` reproduced the
graph builder's `founded_year: 0` substitution for Midas, Param, Marti, Spyke Games,
Insider One and Fazla. Five known years are separately sourced profile facts;
Param's canonical founding remains unknown. Initial evidence is preserved in
`baseline-initial.json` and `validation/initial-packet.json`.

The final main refresh picked up merged owner
[PR 179](https://github.com/castlemilk/startup-atlas/pull/179) for unknown founding
years and [PR 181](https://github.com/castlemilk/startup-atlas/pull/181) for legacy
funding-source inheritance. The country branch was fast-forwarded before its own
commit, without changing either implementation. Fresh validation at `988a4dd`
shows all six omitted years remain absent, known years remain unchanged and no
identified downstream semantic blocker remains in the in-memory graph check.

**Production adoption still requires owner review and fresh live revisions.**
The check does not verify private hosted runtime deployment or publish these
records. Every projected round's stage and numeric/date fields use their own
supporting source URL; companion facts retain separate sources. Merged owner
fixes do not constitute acknowledgement or import/release approval for this
country packet.

1. Refresh main and pending record proposals. Rebuild the graph from current
   source inputs and compare exact names, aliases, official hosts and legacy
   slugs. Treat normalized matches as review candidates, not automatic merges.
   The baseline receipt distinguishes the committed generated graph from the
   graph rebuilt from the same source revision.
2. Review each accepted company and its atomic claim IDs. A country association
   can mean an operating headquarters, a separately sourced Turkish origin, or
   a historical/acquired ecosystem company. It is not automatically the legal
   incorporation country. Keep foreign subsidiaries and holding companies
   distinct. Do not import held discovery candidates.
3. Review the projection map and omitted fields. Unknown values remain null in
   staging and absent where the existing schema rejects null. Founding-year
   disagreements remain visible. Month/year dates must not become January 1 or
   another fabricated day. Current titles and historical founder status are
   separate facts.
4. Review event scope before any funding import. Acquisition consideration,
   secondary liquidity, debt facilities, contribution amounts and cumulative
   funding do not become equity-round totals. A facility commitment does not
   establish cash drawn. Investor mentions require event-specific evidence;
   portfolio/programme membership does not establish a round investment.
5. Use the currently exposed validation/proposal path with fresh target and
   source revisions. Audit complete merged records and preserve unrelated
   additions. The staged record file must not replace the entire live overlay.
   If an update is uncertain, read back the existing branch/proposal before
   retrying. Do not bypass a schema or ownership gate.
6. Leave merge and release coordination to the existing owners. A merged
   research-only PR would still not publish these company records. A later,
   separately reviewed data PR needs normal CI and publication readback of the
   exact graph/SQLite/MCP data revisions. Private MCP code deployment is a
   separate operation and is not requested by this packet.

## Resume research

`coverage.json` binds the reviewed/pending checkpoint to exact company, claim,
source and queue bytes. A changed input invalidates that saved checkpoint; make
a new dated checkpoint and preserve this one. Replaying it does not call a source
or promote a claim. The existing planner's baseline receipt is retained under
`validation/`; its exhausted **45-record overlay inventory** is not a completed
country crawl or an estimate of Türkiye's startup population.

Follow `next-source-queue.json` in priority order, preserving the exact source,
entity, retry reason, page/cursor gap and ownership gate. Every source remains
unapproved for the crawler unless the existing source-review owner separately
approves it. Preserve the repository's host restrictions, throttling, response
limits and access controls, and do not request robots.txt. Research pages were
read through web research tools; no live repository crawler run is claimed.

The selected company pass, the next-source queue, an investor portfolio and a
programme cohort all have different denominators. The national eligible startup
population is null. No empty result, inaccessible page or stopped pagination
proves that a founder, financing event or company does not exist.

## Evidence authority

`claims.json` is the normalized atomic evidence ledger. `sources.json` records
retrieval, access outcomes and source scope. `companies.json` assembles reviewed
facts without flattening uncertainty. `contributions/` preserves the original
research-lane observations for audit; final review corrections are authoritative
in the normalized files and review decisions. `evidence-captures/` contains only partial
researcher paraphrases produced by the existing enrichment bridge, not downloaded
page bodies and not a lossless substitute for the ledger. Keep the structured
ledger and its checksum alongside every capture.

Only public professional founder information is retained. No private contact
lists, image assets, proprietary bulk directory exports or credentials are
included. Source access and identity evidence do not grant a licence to copy
unrequested imagery or a right to redistribute a proprietary database.
