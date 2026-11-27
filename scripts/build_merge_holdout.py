#!/usr/bin/env python3
"""Build the labelled merge-matcher holdout for #88 (REVIEW-02).

The holdout is the set of merge proposals a human (or the agent
review loop acting for one) has already decided in
``data/review-queue.json``: approved = the pair is the same entity,
rejected = the pair is distinct. Those decisions are the only ground
truth the project has about matcher quality, so they are frozen here
as a labelled set the matcher can be measured against without the
labels moving as the queue is rebuilt.

Each case records both sides of the pair as the matcher sees them:
``name`` and ``identity_key`` (a website host, a LinkedIn URL for
people, or ``None`` for name-only), plus provenance (queue id,
decided_by, decided_at, and the score/basis the matcher originally
proposed). Names and keys come from ``data/identity.json``. A side
that is not a registry entity — a rejected lead never became one —
has its name reconstructed from its subject key slug and is marked
``name_source: "subject-key-slug"``. That reconstruction is exact
for scoring purposes: the matcher tokenises names through the same
slug function (see ``entity_resolution._name_tokens``), so the slug
form carries every token the original name contributed. Identity
keys for such sides are ``None``: a lead's website was never
recorded in the registry, and inventing one would fabricate the
strongest evidence the matcher has.

Known bias, stated plainly: the registry is post-merge state, so a
merged-away subject's pre-merge identity key is not always
recoverable (merged entries keep ``identity_key: None`` when the
merge was decided on name similarity). The holdout therefore
measures review-band behaviour — precision of the proposed band,
review rate, false-merge rate — and the auto-merge path itself is
covered by the unit tests in ``tests/test_entity_resolution.py``.

Run: ``python3 scripts/build_merge_holdout.py`` — rewrites
``data/merge-holdout.json`` deterministically (sorted by queue id).
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'


def _side(entity_id, entities):
    """Return the matcher-visible view of one side of a pair."""
    entity = entities.get(entity_id)
    if entity:
        return {
            'id': entity_id,
            'kind': entity.get('kind'),
            'name': entity.get('name'),
            'identity_key': entity.get('identity_key'),
            'name_source': 'identity-registry',
        }
    kind, _, slug_key = entity_id.partition(':')
    return {
        'id': entity_id,
        'kind': kind,
        'name': slug_key.replace('-', ' '),
        'identity_key': None,
        'name_source': 'subject-key-slug',
    }


def build_holdout(data_dir=None):
    """Return the holdout dict built from the queue + registry."""
    data_dir = Path(data_dir) if data_dir else DATA
    queue = json.loads((data_dir / 'review-queue.json').read_text())
    registry = json.loads((data_dir / 'identity.json').read_text())
    entities = registry.get('entities', {})
    cases = []
    for entry in queue.get('entries', []):
        if entry.get('kind') != 'merge':
            continue
        if entry.get('status') not in ('approved', 'rejected'):
            continue
        label = 'same' if entry['status'] == 'approved' else 'distinct'
        subject = _side(entry['subject'], entities)
        for candidate in entry.get('candidates', []):
            cases.append({
                'queue_id': entry['id'],
                'label': label,
                'subject': subject,
                'candidate': _side(candidate['id'], entities),
                'proposed_score': candidate.get('score'),
                'proposed_basis': candidate.get('basis'),
                'decided_by': entry.get('decided_by'),
                'decided_at': entry.get('decided_at'),
            })
    cases.sort(key=lambda c: (c['queue_id'], c['candidate']['id']))
    return {'version': 1, 'source': 'data/review-queue.json decided merge entries',
            'cases': cases}


def main():
    holdout = build_holdout()
    out = DATA / 'merge-holdout.json'
    out.write_text(json.dumps(holdout, indent=1) + '\n')
    same = sum(1 for c in holdout['cases'] if c['label'] == 'same')
    print(f"wrote {out}: {len(holdout['cases'])} cases "
          f"({same} same, {len(holdout['cases']) - same} distinct)")


if __name__ == '__main__':
    main()
