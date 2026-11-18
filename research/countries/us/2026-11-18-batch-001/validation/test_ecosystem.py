"""Offline cohort arithmetic and ecosystem provenance checks."""
import json
from pathlib import Path
import unittest

PACKET = Path(__file__).resolve().parent.parent


def load(name):
    return json.loads((PACKET / name).read_text())


class EcosystemTests(unittest.TestCase):
    def test_imf_rank_uses_economy_registry_not_aggregates(self):
        codes = set(load('baseline/imf-country-codes.json')['country_codes'])
        observations = load('baseline/imf-ngdpd-2026-extract.json')['values_2026']
        ranked = sorted(((key, value) for key, value in observations.items()
                         if key in codes and type(value) in (int, float)),
                        key=lambda pair: pair[1], reverse=True)
        cohort = load('cohort.json')
        self.assertEqual(ranked[0], (cohort['economy_code'], cohort['gdp_value']))
        self.assertEqual(len(ranked), cohort['rank_computation']['economies_with_numeric_2026_values'])
        self.assertTrue(set(observations) - codes, 'aggregate exclusion must exercise actual excluded inputs')
        self.assertEqual(cohort['rank_computation']['rank'], 1)

    def test_estimate_and_taiwan_convention_are_explicit(self):
        cohort = load('cohort.json')
        self.assertTrue(cohort['estimate_not_final_actual'])
        self.assertEqual(cohort['year'], 2026)
        self.assertEqual(cohort['measure'], 'NGDPD')
        self.assertEqual(cohort['unit'], 'billions of US dollars')
        self.assertIn('TWN', load('baseline/imf-country-codes.json')['country_codes'])
        self.assertTrue(cohort['vintage_caveat'])

    def test_ecosystem_claims_join_readable_primary_sources(self):
        ecosystem = load('ecosystem.json')
        sources = {s['id']: s for s in load('source-registry.json')['sources']}
        claim_ids = [c['claim_id'] for c in ecosystem['claims']]
        self.assertEqual(len(claim_ids), len(set(claim_ids)))
        for claim in ecosystem['claims']:
            ids = claim.get('source_ids', [claim.get('source_id')])
            self.assertTrue(ids)
            for source_id in ids:
                self.assertTrue(sources[source_id]['accessed'])
                self.assertNotEqual(sources[source_id].get('review_outcome'), 'rejected_identity_mismatch')
            self.assertIn(claim['source_url'], {sources[s]['url'] for s in ids})
            self.assertEqual(claim['retrieved_on'], '2026-11-18')
            self.assertEqual(claim['publication_state'], 'unsubmitted')

    def test_discovery_only_names_have_no_canonical_identity_or_seed_approval(self):
        candidates = load('ecosystem.json')['discovery_only_candidates']
        companies = load('companies.json')['companies']
        staged_names = {c['canonical_name'].casefold() for c in companies}
        for candidate in candidates:
            self.assertIsNone(candidate['canonical_name'])
            self.assertIsNone(candidate['official_domain'])
            self.assertFalse(candidate['crawler_seed_approved'])
            self.assertNotIn(candidate['name_as_listed'].casefold(), staged_names)

    def test_report_primary_links_are_registered(self):
        import re
        registry = {s['url'] for s in load('source-registry.json')['sources']}
        report = (PACKET / 'README.md').read_text()
        urls = set(re.findall(r'\]\((https?://[^)]+)\)', report))
        external = {url for url in urls if not url.startswith(('https://chatgpt.com/', 'https://github.com/'))}
        self.assertLessEqual(external, registry)


if __name__ == '__main__':
    unittest.main()
