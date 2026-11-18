# Validation receipt

Final integration validation uses main `ff4d51cf729d6a654787e9a1db63967b292df8c9`. The immutable research, deduplication and continuation-queue snapshot remains `f4bcbf7030d741772bb750deee584efa3ee17749`. The two builders and source inputs are pinned and checked independently.

| Check | Actual result | Receipt |
|---|---|---|
| Current production record validator and rejection cases | 42 checks passed, zero failures; all 26 records valid | `records-validation.json` |
| Country packet consistency and adversarial cases | 35 checks passed, zero failures | `packet-validation.json` |
| Existing repository record-domain suite | 22 tests passed, zero failures | `startup-edit-domain.tap` |
| Existing enrichment helper | 440 claims valid, zero errors | `enrichment-ledger-final.json` |
| Industrial/deeptech independent primary-source review | Eight critical primary pages reopened; material funding/founder distinctions confirmed | `independent-source-review.json` |
| Root company independent review | Eleven primary pages reopened; three projection qualifications corrected | `root-company-independent-review.json` |
| Concurrent owner change | #179 merged; all 26 omitted founding years stay absent in the current in-memory graph | `main-refresh.json` and `packet-validation.json` |

The packet check covers normalization, duplicate JSON keys, nonfinite numbers, company/domain/alias deduplication, founder slug collisions, exact claim/source binding, failed-source rejection, explicit unknowns, partial dates, lower bounds, currency pairing, event-specific round versus ownership participants, and rejection of portfolio-derived participation. It also checks a seven-page traversal of the 47-item queue without overlap and rejects stale revision, page-size and queue-state cursors.

The in-memory prospective graph contains 638 entities, 72 startups and 55 financing entries, retaining every baseline identity. This is a local integration check, **not production or live graph counts**. No production data or generated graph file was written.

Commands, from the repository root:

```bash
node research/countries/be/2026-11-18-batch-001/validate_records.mjs
python research/countries/be/2026-11-18-batch-001/validate_packet.py
node --test backend/hosted/tests/startup-edit-domain.test.mjs
```

The existing user-local enrichment helper was run with:

```bash
python /home/agent/.codex/skills/remote-skills/skill-6af6be762f60819199535534ef7983d5/scripts/enrichment.py validate --ledger research/countries/be/2026-11-18-batch-001/claims.json --out research/countries/be/2026-11-18-batch-001/validation/enrichment-ledger-final.json
```

That helper refuses to overwrite an existing output; use a fresh receipt filename when rerunning it. The packet validators do not depend on the user-local skill installation.

Historical receipts are explicitly retained: the initial enrichment run exposed an I-care structured-valuation compatibility mismatch, corrected without changing the underlying source facts; the initial packet check exposed a validator mistake that treated an acquisition participant as a funding-round participant; the f4 historical result records the old graph's zero-founding-year behavior before owner #179 merged. None is the final validation result. Structural tests do not establish national completeness, source authenticity, owner approval or publication.
