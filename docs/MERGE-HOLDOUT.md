# Merge matcher holdout (#88)

Labelled set: every decided `merge` entry in `data/review-queue.json`, frozen in `data/merge-holdout.json` (67 pairs: 53 same-entity, 14 distinct). Regenerate with `python3 scripts/build_merge_holdout.py`, re-measure with `npm run report:merge-holdout`.

| Metric | Value |
| --- | --- |
| Band precision (proposed pairs that are truly the same entity) | 79.1% (53/67) |
| Review rate (labelled pairs proposed at all) | 100.0% |
| Same-entity recall (same pairs proposed) | 100.0% |
| Auto-merges in replay | 0 |
| False merges (distinct pairs auto-merged) | 0 |
| False-merge rate | n/a |
| Distinct containment (distinct pairs kept out of auto-merge) | 100.0% |

Known bias: the registry is post-merge state, so a merged-away subject's pre-merge identity key is not always recoverable and the auto-merge path is rarely exercised by this replay; it is covered by the unit tests in `tests/test_entity_resolution.py`. This holdout measures the review band the labels describe. Cases whose name is marked `subject-key-slug` in the holdout file are reconstructed from the queue subject key; the matcher tokenises names through the same slug function, so the reconstruction is exact for scoring.
