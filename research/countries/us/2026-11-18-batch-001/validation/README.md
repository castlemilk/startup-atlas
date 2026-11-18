# Country packet validation

These checks are offline and read only. They do not publish records, access source URLs, approve crawler seeds or implement task execution. Run them from the repository root:

```sh
node research/countries/us/2026-11-18-batch-001/validation/validate-records.mjs
node --test research/countries/us/2026-11-18-batch-001/validation/test_record_contract.mjs
python research/countries/us/2026-11-18-batch-001/validation/validate_packet.py
python -m unittest discover -s research/countries/us/2026-11-18-batch-001/validation -p 'test_*.py' -v
```

`validate-records.mjs` imports the existing `backend/hosted/src/startup-record.mjs` validator. No parallel production record schema is maintained here. Its negative fixtures check omission versus null, unsupported fields, numeric currency pairs and duplicate round IDs.

`validate_packet.py` checks company/claim/source joins, accepted/withheld separation, normalized name/alias/domain collisions, baseline startup duplicates, accessible provenance, funding-event identity, participant links, numeric currency evidence and lower-bound preservation. Names follow `dedup.json`: Unicode NFKC, casefold and whitespace collapse, preserving punctuation, accents and legal suffixes. Readable pages rejected for an identity mismatch cannot support accepted claims. Cross-kind identity matches are reported for owner review rather than silently merged. Additional funding-source observations do not increment the unique event count. Numeric currency supplements remain attached to the same event. Coverage receipt counts are recomputed from the delivered files rather than fixed to an arbitrary batch size.

Resume checks compare fingerprints to current input bytes and derive worklist counts from the packet. They distinguish initial company review from complete founder or financing history. The pure inspection order sorts numeric priorities first, absent/null priorities last, and uses stable `task_id` values to break ties. Regression tests use synthetic copies and a temporary checkpoint to verify that restart retains cursors and access failures; they never execute a task.

Both validation scripts emit JSON receipts to stdout. The owner can retain these after the final packet inputs and checkpoint fingerprints have been refreshed. Tests check internal consistency and known failure modes; they do not establish the truth, currentness, rights status or completeness of the researched facts.

`test_ecosystem.py` verifies the IMF rank arithmetic against retained economy codes and observations, the estimate/vintage convention, ecosystem source joins, discovery-only identities and report source-link registration.
