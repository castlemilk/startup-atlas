# Offline company-profile packet replay

`replay_company_profiles.py` compiles an existing `company-profiles` packet into
reviewable **synthetic coverage-ledger event batches**. This is the first bounded
adapter-mapping exercise, not an activated crawler, retry worker or source review.
The CLI reads three files and writes JSON to stdout only. It does not create a
ledger, fetch pages, modify approvals or write public records.

```sh
python3 scripts/replay_company_profiles.py \
  --overlay data/startup-research.json \
  --approved data/company-profile-seeds.csv \
  --packet /path/to/saved-company-profile-packet.json \
  --revision '<exact input Git revision>' \
  --replay-at '2026-11-18T12:00:00Z' > /tmp/company-profile-replay.json
```

Use an actual chosen analysis time at or after the saved packet's generation time;
this example time is not evidence of a run. Original page `checked_at` values and
packet `generated_at` remain separately retained in the output. The compiler never
turns replay time into a new source retrieval or factual-review timestamp.

## Mapping and limits

- Input inventory uses the planner's pinned overlay/seed bytes and existing approval
  parser. Only approved sources whose host matches the exact source record qualify.
  It is bounded to 100 overlay records, and refuses a larger population rather than
  silently dropping the next page. Expanding this bound needs corresponding ledger
  batch/scope review.
- `entity_kind` is `company_source_record`, with the exact source name as identity.
  These are not canonical graph startup IDs. The population is the exact approved
  seed set, not all graph startups or all facts on a company's website.
- `dimension` is `saved_profile_packet_analysis`; `snapshot_kind` is `synthetic`.
  Every `start` means analysis of already-saved bytes, **not a historical HTTP start**.
  Durable start-before-network instrumentation remains future work.
- A result must match an approved exact source name and seed URL. Duplicate or
  unknown rows, blocked/cross-host page or final URLs, duplicate pages, malformed
  timestamps, unknown statuses, invalid HTTP-success evidence, and duplicate JSON
  fields fail closed before emitting a plan. Packet format is the current collector's
  version 1 shape. No fallback inference for legacy/incompatible packets occurs.
- Page evidence is preserved; complete successful saved pages map to `retrieved`
  **for packet analysis only**. Successful pages with zero extracted candidates are
  still retrieval observations, never `searched_unknown` or evidence that no fact
  exists. Partial/failed rows map to `unavailable` with a manual disposition. Empty
  page arrays map to `parser_error`, not a successful empty crawl.
- A page with staffing evidence can carry up to 12 `headcount_mentions`.
  Each mention keeps the quantity and qualifier as written, the complete local
  sentence and its source URL. A company-profile candidate carries the subset
  from the saved page with a direct employment statement for the exact company
  or an explicit possessive reference to its team, workforce or headcount.
  Bare counts such as “has 130 staff” and first-person growth quotations carry
  an `employer_attribution` of `unbound` as page context for source review.
  A named possessive team observation such as “Diraq’s 130+ team” preserves
  the lower-bound wording and sentence. Adjacent layout labels and numbers
  supply no attribution. Immediately coordinated groups and explicit inclusion
  of other groups such as students or contractors preserve the matched
  population phrase as unbound page evidence. A separately stated count or
  action can follow an ordinary staff count. Describing a subset of employees
  as engineers or full-time employees also preserves the staff count.
  Negated, conditional and clearly supplier- or agency-supplied counts are
  excluded. A separate future plan can stay in the context of an observed count.
  Review validates the company subset against the same page and check time.
  A publication claim still needs evidence for its effective date and scope.
- Original skipped-page reasons are retained. Failure text is not guessed into
  retry policy. In particular an old `HTTP 429` string does not invent a Retry-After
  time, schedule a request or relax current transport host-stop handling.
- Omitted approved sources remain undiscovered/unattempted in the replay. A packet
  lacking a row does not prove its source was skipped, failed, interrupted or empty.
- Every checkpoint stays `partial`; this packet shape cannot establish complete
  source enumeration, actual pagination termination or all-source freshness. No
  `verify`, automatic retry, full-scan completion or publication events are emitted.

The configuration and batch IDs bind input plan, exact packet bytes and replay time.
Hashes support byte identity, not authenticity, rights, identity approval or factual
truth. The caller-provided Git revision remains an assertion; the output includes
exact input hashes rather than pretending it verified those files against Git.

## Executing a private synthetic replay

After reviewing the generated JSON, the existing `Ledger` API can apply it to an
explicit private disposable path, distinct from any future live checkpoint store:

```python
import json
from scripts.collection_coverage import Ledger

replay = json.load(open('/tmp/company-profile-replay.json'))
with Ledger.create('/tmp/disposable-profile-replay.sqlite', replay['config']) as ledger:
    start = replay['start_batch']
    if start is not None:
        ledger.apply(start['batch_id'], start['expected_sequence'], start['events'], start['committed_at'])
    finish = replay['outcome_batch']
    ledger.apply(finish['batch_id'], finish['expected_sequence'], finish['events'], finish['committed_at'])
    report = ledger.report(finish['committed_at'])
```

The file must not already exist. To inspect/replay an existing experiment, use
`Ledger.open(path, replay['config'])`; do not overwrite it or change its configuration.
An identical batch replay returns its original receipt without duplicating attempts.
If analysis stops after the start batch, the ledger visibly retains in-flight work.
Stop/reconcile the previous worker before an explicit recovery decision. Recovery
with a manual disposition fences late outcomes; it does not silently retry work.
This tests ledger interaction for offline analysis, not recovery of a real HTTP call.

## Remaining live-adapter gates

The collection owner still needs to agree canonical graph identity mapping,
real attempt/page units, eligibility evidence, source pagination termination,
trusted timing, checkpoint retention/storage, per-host policies and uncertain-worker
reconciliation. The existing transport remains authoritative for source access,
HTTPS/public-address validation, redirects, byte/time limits, throttling and 429
host stops. No robots requests or inspection are introduced. Separate factual and
asset review remain mandatory; no saved packet is an approval to publish its data.

## Tests

```sh
python3 -m unittest discover -s tests -p 'test_company_profile_replay.py' -v
```

Tests compile an actual collector-shaped fixture without DNS/HTTP, apply both
batches, reopen/idempotently replay, interrupt and explicitly recover analysis,
reject late completion, retain partial/failure/omission states, and reject changed
inputs and invalid provenance. Normal root Python discovery includes these tests.
