# Integrating the Indonesia research packet

This is a reviewable country research checkpoint. `records.json` is a JSON array of records accepted by the **existing** `backend/hosted/src/startup-record.mjs` contract, revalidated at refreshed main `ff4d51cf729d6a654787e9a1db63967b292df8c9`. The initial research revision was `f4bcbf7030d741772bb750deee584efa3ee17749`; the production data and startup-record schema did not change during this refresh. The surrounding research formats are local packet formats; they do not extend the shared API or production schema.

## 1. Verify this exact packet

From a checkout containing the country branch:

```bash
cd research/countries/id/2026-11-18-batch-001
sha256sum -c checksums.sha256
python3 -B validate-packet.py
```

The validator resolves the repository root from its own location. It reads the five pinned production source inputs, invokes the actual Node startup-record validator and merge function, and imports the actual Python graph builder without invoking its writing entry point. It does not use the network, write production files, call MCP, approve sources or run a crawler. Without `--out` it writes only to stdout.

To save a fresh review receipt, select a new output filename outside the checksummed packet, for example:

```bash
python3 -B validate-packet.py --out /tmp/indonesia-packet-review.json
```

The source-input hash check intentionally fails if the underlying production data has changed. Do not suppress it or replace its expected hashes merely to get a pass. Refresh deduplication and provenance against the new main revision, preserve the original checkpoint, and publish a new reviewed checkpoint with its own hashes.

The separately recorded enrichment validator result covers all 505 ledger rows. The optional installed helper command is:

```bash
python3 /home/agent/.codex/skills/remote-skills/skill-6af6be762f60819199535534ef7983d5/scripts/enrichment.py validate --ledger evidence-ledger.json --out /tmp/indonesia-evidence-review.json
```

That skill path is environment-specific; `validate-packet.py` provides repository-local checks without depending on the skill installation. The helper refuses to overwrite its output, so use a fresh receipt filename for subsequent runs.

## 2. Review identity and temporal scope

Inspect `company-index.json`, the relevant `evidence/*.json` entry and its claims before accepting a company. The proposed `startup:<slug>` IDs are deterministic candidates, not existing entity assignments. The baseline comparison covered all 45 overlay records and the 46 startups produced by the source graph, including its graph-only startup. No matching name, normalized host or startup ID was found.

Refresh current main and inspect other country packets before applying any record. Cross-border cases require coordination, particularly Traveloka, Fazz and JULO. A Singapore country packet must not create a second company merely because this packet records Indonesian origin or operations. Distinguish headquarters, operating offices, incorporation, group formation and funding recipient. Do not resolve a manager, fund or founder solely from a similar name.

`aliases` is an observed, non-exhaustive collection. Its brand, group-name, former-name, domain-redirect and predecessor scopes have different meanings. Do not use every alias-like observation as legal-equivalence evidence. FishLog's `.co.id` domain is historically linked by a primary investor and association record; its homepage was unavailable. `.co` is only a candidate alternate, pending ownership/migration evidence.

Current private/public and operating status was not exhaustively reviewed for the 23 accepted ecosystem entities. Fore Coffee has specific primary listing evidence and is retained as context. The collection owner should decide the listed-alumnus taxonomy before creating its production record.

## 3. Preserve the owner fix and resolve the remaining merge gate

### Resolved: missing founding years remain absent

The initial revision supplied `startup.get('founded_year', 0)` in `build_graph()`. During this research session the existing owner merged [PR #179](https://github.com/castlemilk/startup-atlas/pull/179), preserving missing values through graph and SQLite projection. This packet was then refreshed to that merge revision and revalidated. The staged records omit the scalar for **Mekari, Xendit, DANA, Ajaib, ALAMI, Fazz, Praktis, Astro and Paxel** because an unqualified company-founding year is ambiguous, partial or unknown. Their richer milestone observations remain in the sidecar.

The current in-memory test verifies that all nine scalars remain absent and no unknown becomes zero. Earlier semantic review notes record the original reproduction and should be read with this resolution. Preserve the owner's fix when rebasing or applying a subset; do not insert an invented year or a zero. This country branch makes no implementation or schema edits. A live deployment receipt still must be checked when production data is ultimately accepted.

### Omission does not erase an old field

`mergeStartup()` merges an incoming same-ID funding event over the previous object. A previously stored numeric amount survives when the new projection simply omits amount/currency. The validator reproduces this using Paxel's disputed USD23 million as a synthetic previous value.

No Paxel duplicate exists in the pinned baseline. Nevertheless, fresh main may contain another country's work by the time integration occurs. Compare the complete prior object with the proposed record and the resulting merged object. Stop for owner reconciliation if a prior amount, date, founding year or identity would survive contrary to the reviewed evidence. The current schema offers no supported null-clearing operation; do not submit an unsupported null, invent a replacement zero, or rename an event to evade the conflict.

## 4. Preserve evidence while projecting supported fields

The current contract does not contain typed headquarters, incorporation, funding instrument, date precision or round-participant fields. These remain in the source-backed sidecars. Human-readable `profile_facts` provide a conservative subset; their nested source URLs take precedence over any inference from the record's top-level source.

| Research event | Existing-schema treatment | Reason |
| --- | --- | --- |
| JULO April 2022 USD80m mixed event | `julo-2022-04-series-b-equity`, USD30m | Explicit equity component; USD50m facility retained separately, unknown drawdown |
| Traveloka September 2022 USD300m facility | Amount text only | Signed credit facility is not an equity-round total |
| DANA August 2022 USD25m placement | Amount text plus sourced contribution fact | Single-investor placement; whole-round total unknown |
| DANA August 2022 USD200m transfer | Research event only | Share-transfer value, not established new primary capital |
| DANA 2024 USD55,759,624 conversion | Research event only | Receivables converted into shares; not a new-cash round |
| Fazz September 2022 USD75m equity | USD75m Series C | Excludes separately disclosed debt term sheet |
| Fazz September 2022 USD25m term sheet | Research event only | Facility completion and drawdown not established |
| Paxel Series C | No numeric amount/currency or exact day | Source amounts have unresolved scope; June action month is separately attributed |
| ALAMI growth round / Flip second close / Praktis pre-Series A | Amount omitted where undisclosed | Unknown is not zero or a derived difference from a cumulative headline |
| CrediBook Series A | USD8.1m; exact announcement day omitted | Source dateline/publication conflict retained |

`projection-map.json` joins each projected round to exactly one research event. JULO is explicitly a component projection. `funding-events.json` assigns no event automatic eligibility for an aggregate equity total. The 140 participant observations are tied to event IDs and accessed source URLs; they are not production graph investment edges or a list of unique investors. Historical portfolio membership and earlier investor lists do not establish participation in a later round.

Source-level `published_on`, event `announced_on`, transaction `occurred_on`, `closed_on`, launch dates, document `as_of` dates and page `updated_on` are distinct. Date-only fields in the production contract are omitted when only a year/month or contradictory day is available. Retrieval timestamps are explicitly page-batch or research-session checkpoints where per-page timing was not captured.

## 5. Use the existing owner workflow

Once the owner resolves the gates and approves a bounded subset, use the already exposed `atlas_validate_startup` operation on each selected record. Inspect the returned prior record and **fresh** revision. Use `atlas_propose_startup` with that exact validation revision only when an ordinary production-data proposal is intended. Inspect the resulting branch, complete diff and CI. Do not replay an uncertain write; inspect the branch/PR first.

The country research PR itself is not a production-data proposal. Do not copy the whole directory into `data/`, overwrite `data/startup-research.json`, bulk replace another country's records, or generate graph outputs on the research branch. A merge of this country research directory alone only makes the packet available in the repository. It does not mean these companies were accepted into the live Atlas graph.

After an owner-approved production merge, check the actual Pages workflow and published graph revision against main; read back the accepted companies and critical funding fields through existing MCP/search. A repository commit, draft PR, successful local check or synthetic replay is not proof of a live publication. No MCP deployment is requested or included here.

## 6. Resume research without changing source approval

`coverage.json` contains the ordered 39-item continuation queue, candidate checkpoint and content hashes. Start at `ID-EQ001`: ITB names 15 selected 2025 participants. Those names have been transcribed, while company identity/domain/founder/funding verification remains pending for all fifteen. Resolve them one company at a time and record accepted, rejected, deferred and searched-unknown outcomes. Retain all existing completed candidate IDs.

Then use the documented university, accelerator, investor and regional-source queue. The 1000 alumni directory's body and pagination were not obtained; SSI alumni and portfolio pages were not fully traversed. A blank cursor or empty rendered directory is not an exhaustion signal. Establish each source's cohort/filter/page denominator before reporting coverage.

Planner #177 already owns the input-pinned collector inventory. The new research queue is not a replacement planner or native collector cursor. Replay #178 expects its own approved saved-packet format; these web-research evidence files are not eligible to masquerade as directly fetched approved-source captures. Source discovery and successful web reads do not approve entries in `data/company-profile-seeds.csv`.

Keep existing host allowlists, throttling, response limits and access controls. Do not request robots.txt. Blocked or partial sources should remain explicit gaps, with lawful public alternatives used where useful. No credentials, contact harvesting, outreach, paid sources or new spending are necessary for this packet's integration.
