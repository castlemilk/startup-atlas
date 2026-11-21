import json
from pathlib import Path
from shutil import copyfile
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from scripts.collection_coverage import Ledger
from scripts.company_metadata_funding import classify
from scripts.plan_company_profiles import build_plan, digest
from scripts.review_company_metadata import decision_proof, load_bundle, make_config, review
from scripts.rollup_company_metadata import rollup


REVISION = 'a' * 40
FIRST = '2026-11-19T03:04:05Z'
SECOND = '2026-11-19T03:04:06Z'
THIRD = '2026-11-19T03:04:07Z'
COMPANY = 'Ready Company'
OTHER = 'Second Company'
STAGED = 'Staged Company'
SITE = 'https://ready.example/'


class CompanyMetadataRollupTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.overlay = self.root / 'overlay.json'
        self.approved = self.root / 'seeds.csv'
        self.write(self.overlay, {'startups': [
            {'name': COMPANY, 'website': SITE}, {'name': OTHER, 'website': 'https://second.example/'},
        ]})
        self.approved.write_text(f'partner,official_website,approved\n{COMPANY},{SITE},yes\n', encoding='utf-8')
        self.plan = build_plan(self.overlay, self.approved, REVISION, limit=100)
        self.graph = {'version': 1, 'source_revision': REVISION, 'entities': [
            {'id': 'startup:ready-company', 'kind': 'startup', 'name': COMPANY, 'website': SITE},
        ]}

    @staticmethod
    def write(path, value):
        path.write_text(json.dumps(value), encoding='utf-8')
        return digest(path.read_bytes())

    @staticmethod
    def staged(**changes):
        return {
            'id': 'candidate:staged', 'name': STAGED, 'website': 'https://www.staged.example/',
            'identity_source': 'https://registry.example/staged', 'reviewed_at': FIRST,
            'identity_note': 'Verified saved regulator record and official site.', **changes,
        }

    def bundle(self, key, at, observations, *, staged=None, graph=None, alias_proof=None):
        folder = self.root / key
        folder.mkdir()
        batch = {'version': 1, 'revision': REVISION, 'plan_id': self.plan['plan_id'],
                 'as_of': at, 'reviewer': 'Offline fixture', 'evidence': [], 'decisions': []}
        if staged or graph:
            sha = self.write(folder / 'graph.json', self.graph if graph is None else graph)
            batch['identity_snapshot'] = {'path': 'graph.json', 'sha256': sha, 'snapshot_kind': 'built'}
        if staged:
            sha = self.write(folder / 'staged.json', {'version': 1, 'revision': REVISION, 'records': [staged]})
            batch['candidate_inventory'] = {'path': 'staged.json', 'sha256': sha}
        for i, (name, field, disposition) in enumerate(observations):
            key = f'evidence-{i}'
            payload = {'support': 'Saved observation from identified public company material.'}
            kind = 'blocked_receipt' if disposition == 'blocked' else 'review'
            if disposition == 'searched_unknown':
                kind = 'search_log'
                payload = {'version': 1, 'name': name, 'revision': REVISION, 'dimension': field, 'attempts': [
                    {'url': SITE + 'news', 'query': f'{name}: {field}', 'retrieved_at': at,
                     'outcome': 'no_supported_value', 'evidence': 'The saved page contained no qualifying value.'},
                ]}
            source = {}
            if field == 'aliases' and name == COMPANY:
                payload = {'role': 'former_name', 'name': COMPANY, 'alias_name': 'Old Company',
                           'support': 'Old Company rebranded as Ready Company.'} if alias_proof is None else alias_proof
                source = {'source_url': SITE + 'news/rename'}
            sha = self.write(folder / (key + '.json'), payload)
            batch['evidence'].append({'id': key, 'name': name, 'kind': kind, 'path': key + '.json',
                                      'sha256': sha, **source})
            batch['decisions'].append({'name': name, 'dimension': field, 'disposition': disposition,
                                       'evidence': [key], 'note': 'Bounded fixture decision.'})
        self.write(folder / 'batch.json', batch)
        return folder / 'batch.json', folder / 'coverage.sqlite'

    def commit(self, pair, limit=4):
        return review(self.overlay, self.approved, REVISION, *pair, limit=limit)

    def reconcile(self, *pairs, revision=REVISION, funding_review=None):
        with patch('socket.socket', side_effect=AssertionError('Rollup opened a socket')):
            return rollup(self.overlay, self.approved, revision, pairs, funding_review=funding_review)

    def test_counts_unique_cells_and_preserves_a_later_block(self):
        first = self.bundle('first', FIRST, [(COMPANY, 'description', 'reviewed'), (STAGED, 'identity', 'reviewed')],
                            staged=self.staged())
        second = self.bundle('second', SECOND, [(COMPANY, 'description', 'blocked'),
                             (COMPANY, 'rounds', 'searched_unknown'), (STAGED, 'founder_bios', 'candidate')],
                             staged=self.staged())
        self.commit(first)
        self.commit(second)
        before = [path.read_bytes() for pair in (first, second) for path in pair]
        report = self.reconcile(first, second)
        self.assertEqual(report, self.reconcile(second, first, second))
        self.assertEqual(before, [path.read_bytes() for pair in (first, second) for path in pair])
        self.assertEqual(report['committed_field_cells'], 4)
        counts = report['coverage']
        self.assertEqual(counts['catalogue']['possible_field_cells'], 38)
        self.assertEqual(counts['approved_seed_ready']['companies'], 1)
        self.assertEqual(counts['staged_candidates']['companies'], 1)
        self.assertEqual(counts['catalogue']['by_field']['description']['reviewed'], 1)
        self.assertEqual(counts['catalogue']['by_field']['rounds']['searched_unknown'], 1)
        self.assertEqual(counts['staged_candidates']['by_field']['founder_bios']['candidate'], 1)
        self.assertEqual(counts['external_source_population'], 'unknown')
        item = next(item for item in report['observations'] if item['dimension'] == 'description')
        self.assertEqual([row['disposition'] for row in item['history']], ['reviewed', 'blocked'])
        self.assertEqual(item['effective_batch_sha256'], item['history'][0]['batch_sha256'])

    def test_later_review_can_record_and_resolve_conflict(self):
        checkpoints = []
        for at, disposition in ((FIRST, 'reviewed'), (SECOND, 'conflict'), (THIRD, 'reviewed')):
            pair = self.bundle(str(len(checkpoints)), at, [(COMPANY, 'founding', disposition)])
            self.commit(pair)
            checkpoints.append(pair)
        pending = self.reconcile(*checkpoints[:2])
        self.assertEqual(pending['coverage']['catalogue']['by_field']['founding']['conflict'], 1)
        resolved = self.reconcile(*checkpoints)
        self.assertEqual(resolved['coverage']['catalogue']['by_field']['founding']['reviewed'], 1)
        self.assertEqual(len(resolved['observations'][0]['history']), 3)

    def test_resume_reads_only_committed_companies_and_deduplicates_checkpoints(self):
        pair = self.bundle('resume', FIRST, [(COMPANY, 'identity', 'reviewed'), (OTHER, 'identity', 'reviewed')])
        self.commit(pair, limit=1)
        saved = pair[1].with_name('prior.sqlite')
        copyfile(pair[1], saved)
        partial = self.reconcile(pair)
        self.assertEqual(partial['batches'][0]['pending_companies'], [OTHER])
        self.assertEqual(partial['committed_field_cells'], 1)
        self.commit(pair, limit=1)
        complete = self.reconcile((pair[0], saved), pair)
        self.assertEqual(complete, self.reconcile(pair, (pair[0], saved)))
        self.assertEqual(complete['committed_field_cells'], 2)
        self.assertEqual(len(complete['batches']), 1)
        self.assertEqual(complete['batches'][0]['sequence'], 2)
        self.assertEqual(complete['batches'][0]['pending_companies'], [])

    def test_different_revisions_or_graph_inputs_fail_closed(self):
        first = self.bundle('first', FIRST, [(COMPANY, 'identity', 'reviewed')], graph=self.graph)
        second = self.bundle('second', SECOND, [(OTHER, 'identity', 'reviewed')],
                             graph={**self.graph, 'entities': []})
        self.commit(first)
        self.commit(second)
        with self.assertRaisesRegex(ValueError, 'exact inventory plan'):
            self.reconcile(first, revision='b' * 40)
        with self.assertRaisesRegex(ValueError, 'exact graph identity snapshot'):
            self.reconcile(first, second)

    def test_staged_id_or_host_collisions_require_separate_review(self):
        first = self.bundle('first', FIRST, [], staged=self.staged())
        self.commit(first)
        for checkpoint, staged in (
                ('id', self.staged(name='Different Company', website='https://different.example/')),
                ('name', self.staged(id='candidate:other', website='https://new.example/')),
                ('host', self.staged(id='candidate:another', name='Third Company', website='https://staged.example/'))):
            with self.subTest(checkpoint=checkpoint):
                pair = self.bundle(checkpoint, SECOND, [], staged=staged)
                self.commit(pair)
                with self.assertRaisesRegex(ValueError, 'identity conflicts'):
                    self.reconcile(first, pair)

    def test_equal_time_overlap_requires_reconciliation(self):
        first = self.bundle('first', FIRST, [(COMPANY, 'identity', 'reviewed')])
        second = self.bundle('second', FIRST, [(COMPANY, 'identity', 'conflict')])
        self.commit(first)
        self.commit(second)
        with self.assertRaisesRegex(ValueError, 'same review time'):
            self.reconcile(second, first)

    def test_does_not_create_ledgers_or_count_incomplete_attempts(self):
        bundle, ledger_path = self.bundle('first', FIRST, [(COMPANY, 'identity', 'reviewed')])
        with self.assertRaisesRegex(ValueError, 'checkpoint file does not exist'):
            self.reconcile((bundle, ledger_path))
        self.assertFalse(ledger_path.exists())
        at, _, sha, _, decisions, _, batch, staged = load_bundle(bundle, self.plan, self.overlay, self.approved)
        config = make_config(self.plan, at, sha, decisions, staged, batch.get('candidate_inventory'))
        proof = decision_proof(sha, decisions[COMPANY, 'identity'])
        with Ledger.create(ledger_path, config) as ledger:
            context = {'entity_id': COMPANY, 'scope_id': 'identity', 'at': at}
            ledger.apply('unfinished', 0, [{**context, 'type': 'discover', 'evidence': proof},
                                           {**context, 'type': 'start', 'attempt_id': proof['sha256']}], at)
        with self.assertRaisesRegex(ValueError, 'decision proof'):
            self.reconcile((bundle, ledger_path))

    def funding_manifest(self, companies, **changes):
        path = self.root / 'funding-review.json'
        self.write(path, {'version': 1, 'revision': REVISION, 'plan_id': self.plan['plan_id'],
                          'companies': companies, **changes})
        return path

    @staticmethod
    def capture(path, excerpt, **changes):
        return {'url': SITE + path, 'excerpt': excerpt, 'retrieved_on': '2026-11-19',
                'acquisition': 'page_excerpt', **changes}

    def test_funding_followup_surfaces_early_leads_without_changing_coverage(self):
        pair = self.bundle('financing', FIRST, [
            (COMPANY, 'identity', 'reviewed'), (COMPANY, 'aliases', 'reviewed'),
            (COMPANY, 'rounds', 'reviewed'), (STAGED, 'identity', 'reviewed'),
            (STAGED, 'rounds', 'conflict'), (STAGED, 'early_financing', 'reviewed'),
            (OTHER, 'identity', 'reviewed'), (OTHER, 'early_financing', 'blocked'),
        ], staged=self.staged())
        self.commit(pair)
        before = self.reconcile(pair)
        seed = self.capture('news/initial-financing', 'Ready Company announced a seed round.', dates={
            'published': '2022-10-19', 'announced': '2022-10-16', 'closed': '2022-09',
        })
        companies = [{'name': COMPANY, 'captures': [
            self.capture('news/later-round', 'Ready Company announced a Series A.'),
            self.capture('news/archive', 'Old Company reported pre-seed investment.',
                         url='https://archive.example/old'),
            seed, seed, {**seed, 'url': seed['url'] + '#article', 'dates': {'closed': '2022-08'}},
            self.capture('news/grant', 'Ready Company accepted a public grant and a commercial contract.'),
        ], 'former_names': [{'name': 'Old Company', 'evidence_id': 'evidence-1'}]},
                     {'name': STAGED, 'captures': []}, {'name': OTHER, 'captures': []}]
        journal_before = pair[1].read_bytes()
        result = self.reconcile(pair, funding_review=self.funding_manifest(companies))
        funding = result.pop('funding_review')
        self.assertEqual(before, result)
        self.assertEqual(journal_before, pair[1].read_bytes())
        by_name = {item['name']: item for item in funding['companies']}
        target = by_name[COMPANY]
        self.assertEqual(target['action'], 'search_early_history')
        self.assertEqual(target['prior_rounds'], 'reviewed')
        self.assertEqual([hint['name'] for hint in target['searches']], [COMPANY, 'Old Company'])
        self.assertEqual(target['searches'][0]['site'], 'ready.example')
        self.assertEqual(target['repeated_url_hits'], 2)
        self.assertEqual([row['bucket'] for row in target['results']],
                         ['early_round_lead', 'early_round_lead', 'round_lead', 'context'])
        first = target['results'][0]
        self.assertEqual(first['url'], seed['url'])
        self.assertTrue(first['on_issuer_host'])
        self.assertTrue(first['review_required'])
        self.assertEqual(len(first['observations']), 2)
        dates = next(row['dates'] for row in first['observations'] if row['url'] == seed['url'])
        self.assertEqual(dates['published'], {'value': '2022-10-19', 'precision': 'day'})
        self.assertEqual(dates['announced'], {'value': '2022-10-16', 'precision': 'day'})
        self.assertEqual(dates['closed'], {'value': '2022-09', 'precision': 'month'})
        self.assertEqual(by_name[STAGED]['action'], 'reconcile_financing_sources')
        self.assertEqual(by_name[STAGED]['searches'], [])
        self.assertEqual(by_name[OTHER]['action'], 'blocked')
        self.assertEqual(by_name[OTHER]['searches'], [])
        companies[0]['captures'].reverse()
        reordered = self.reconcile(pair, funding_review=self.funding_manifest(list(reversed(companies))))['funding_review']
        self.assertEqual(funding['companies'], reordered['companies'])

    def test_funding_review_requires_a_bound_former_name_receipt(self):
        nomination = 'Ready Company named Old Company as a grant nominee.'
        name_change = 'Ready Company was formerly known as Old Company.'
        missing = 'committed alias review'
        explicit = 'explicit name change'

        def attested(alias='Old Company', **changes):
            return {'role': 'former_name', 'name': COMPANY, 'alias_name': alias, **changes}

        cases = [
            ('Old Company', nomination, {'role': 'nominee'}, missing),
            ('Old Company', nomination, {}, missing),
            ('Old Company', nomination, attested(), explicit),
            ('Old Company', name_change, attested(role='nominee'), missing),
            ('Old Company', name_change, attested(name=OTHER), missing),
            ('Old Company', name_change, attested('Old Company Holdings'), missing),
            ('Old Company', name_change, attested('old company'), missing),
            ('Old Company', name_change, attested(source_url='https://elsewhere.example/rename'), missing),
            ('Old Company', name_change, {'role': 'former_name'}, missing),
            ('Old Company', name_change, {}, missing),
            ('Old Company', 'Former grant nominees: Ready Company and Old Company.', attested(), explicit),
            ('Old Company', 'Ready Company named its nominees. Old Company rebranded as Other Co.',
             attested(), explicit),
            ('Old Company', 'The nominee wrote “Ready Company was formerly known as Old Company.”',
             attested(), explicit),
            ('Old Company', name_change[:-1] + '?', attested(), explicit),
            ('Old Company', name_change + ' Correction: Old Company was only a nominee.', attested(), explicit),
            ('Old Company', 'Ready Company was formerly known as Old Company Holdings.', attested(), explicit),
            ('Old Company', 'Ready Company (formerly Old Company)', attested(), explicit),
            ('a programme finalist', 'Ready Company (formerly a programme finalist)', {}, missing),
            ('a programme finalist', 'Ready Company was formerly known as a programme finalist.', {}, missing),
            ('a programme finalist for the 2024 cohort',
             'Ready Company was formerly known as a programme finalist for the 2024 cohort.', {}, missing),
            ('the programme finalist at Demo Day',
             'Ready Company (formerly known as the programme finalist at Demo Day)', {}, missing),
            ('A Funding Beneficiary', 'READY COMPANY WAS PREVIOUSLY KNOWN AS A FUNDING BENEFICIARY.', {}, missing),
            ('the winner at Demo Day', 'Ready Company (previously known as the winner at Demo Day)', {}, missing),
            ('an accelerator alumnus', '“Ready Company was previously known as an accelerator alumnus.”', {}, missing),
            ('Old Company', name_change, attested(), None),
            ('Old Company', 'Ready Company (formerly known as Old Company)', attested(), None),
            ('Old Company', 'Old Company rebranded as Ready Company.', attested(), None),
            ('Old Company', 'On 16 February 2023 the company described Old Company’s change of brand to '
             'Ready Company. ABN history separately confirms continuity of legal entity.', attested(), None),
            ('Nominee for Growth Pty Ltd', 'Nominee for Growth Pty Ltd changed its name to Ready Company.',
             attested('Nominee for Growth Pty Ltd'), None),
        ]
        cases.extend((alias, f'{COMPANY} was previously known as {alias}.', {}, missing) for alias in (
            'a funding beneficiary', 'an accelerator alumnus', 'the winner at Demo Day',
            'an alum of the 2024 cohort', 'the 2024 grant awardee',
        ))
        for i, (alias, support, details, error) in enumerate(cases):
            with self.subTest(alias=alias, support=support, details=details):
                pair = self.bundle(f'former-{i}', FIRST, [(COMPANY, 'identity', 'reviewed'),
                    (COMPANY, 'aliases', 'reviewed')], alias_proof={'support': support, **details})
                self.commit(pair)
                before = self.reconcile(pair)
                journal = pair[1].read_bytes()
                archive = self.capture('seed', alias + ' closed a seed round.', url='https://archive.example/old')
                company = {'name': COMPANY, 'captures': [
                    archive, self.capture('nominees', 'Ready Company was named as a nominee for a grant.'),
                ]}
                request = self.funding_manifest([{
                    **company, 'former_names': [{'name': alias, 'evidence_id': 'evidence-1'}],
                }])
                if error:
                    with self.assertRaisesRegex(ValueError, error):
                        self.reconcile(pair, funding_review=request)
                    request = self.funding_manifest([company])
                report = self.reconcile(pair, funding_review=request)
                entry, = report.pop('funding_review')['companies']
                self.assertEqual(report, before)
                self.assertEqual(pair[1].read_bytes(), journal)
                self.assertEqual({row['url']: row['bucket'] for row in entry['results']}, {
                    SITE + 'nominees': 'context', archive['url']: 'unmatched' if error else 'early_round_lead',
                })
                self.assertEqual([row['name'] for row in entry['former_names']], [] if error else [alias])
                self.assertEqual(len(entry['searches']), 1 if error else 2)

    def test_legacy_former_name_receipt_requires_the_exact_evidence_digest(self):
        proof = {'support': 'Old Company rebranded as Ready Company.'}
        observations = [(COMPANY, 'identity', 'reviewed'), (COMPANY, 'aliases', 'reviewed')]
        original = self.bundle('legacy', FIRST, observations, alias_proof=proof)
        modified = self.bundle('modified', SECOND, observations, alias_proof={**proof, 'note': 'New receipt'})
        self.commit(original)
        self.commit(modified)
        content = original[0].with_name('evidence-1.json').read_bytes()
        legacy = {(COMPANY, SITE + 'news/rename', digest(content)): 'Old Company'}
        request = self.funding_manifest([{
            'name': COMPANY, 'former_names': [{'name': 'Old Company', 'evidence_id': 'evidence-1'}],
            'captures': [self.capture('seed', 'Old Company closed a seed round.')],
        }])
        with patch.dict('scripts.rollup_company_metadata.LEGACY_FORMER_NAMES', legacy, clear=True):
            entry, = self.reconcile(original, funding_review=request)['funding_review']['companies']
            self.assertEqual(entry['results'][0]['bucket'], 'early_round_lead')
            self.assertEqual(entry['former_names'][0]['sha256'], digest(content))
            with self.assertRaisesRegex(ValueError, 'committed alias review'):
                self.reconcile(modified, funding_review=request)

    def test_funding_review_keeps_coverage_listing_and_article_dates_separate(self):
        pair = self.bundle('coverage', FIRST, [(COMPANY, 'identity', 'reviewed')])
        self.commit(pair)
        article_url = 'https://press.example/early-funding?ref=index#report'
        headline = 'Ready Company closes its pre-seed round.'
        listing = self.capture('press?page=2', headline, coverage_listing={
            'article_url': article_url, 'listed_on': '2021-09-21',
        })
        undated = {**listing, 'coverage_listing': {'article_url': article_url}}
        article = self.capture('', headline, url=article_url, dates={'published': '2021-09-27'})
        release = self.capture('news/seed', 'Ready Company announced a seed round.', dates={'announced': '2022-11-15'})
        captures = [listing, article, release, listing, undated]
        baseline = self.reconcile(pair)
        journal = pair[1].read_bytes()
        manifest = self.funding_manifest([{'name': COMPANY, 'captures': captures}])
        result = self.reconcile(pair, funding_review=manifest)
        company, = result.pop('funding_review')['companies']
        self.assertEqual(result, baseline)
        self.assertEqual(pair[1].read_bytes(), journal)
        self.assertEqual(company['repeated_url_hits'], 2)
        by_url = {row['url']: row for row in company['results']}
        archive = by_url[listing['url']]
        self.assertTrue(archive['on_issuer_host'])
        self.assertTrue(archive['review_required'])
        self.assertEqual(archive['bucket'], 'context')
        expected = {**listing, 'bucket': 'context', 'signals': ['coverage_listing'],
                    'coverage_listing': {'article_url': article_url,
                                         'listed_on': {'value': '2021-09-21', 'precision': 'day'}}}
        self.assertIn(expected, archive['observations'])
        self.assertIn({**undated, 'bucket': 'context', 'signals': ['coverage_listing']}, archive['observations'])
        self.assertEqual(len(archive['observations']), 2)
        for url, role, value in ((article_url.partition('#')[0], 'published', '2021-09-27'),
                                 (release['url'], 'announced', '2022-11-15')):
            source = by_url[url]
            self.assertEqual(source['bucket'], 'early_round_lead')
            capture, = source['observations']
            self.assertEqual(capture['dates'], {role: {'value': value, 'precision': 'day'}})
            self.assertNotIn('coverage_listing', capture)

    def test_funding_review_rejects_invalid_coverage_listing_provenance(self):
        pair = self.bundle('coverage', FIRST, [(COMPANY, 'identity', 'reviewed')])
        self.commit(pair)
        listing = self.capture('press?page=2', 'Ready Company closes its seed round.', coverage_listing={
            'article_url': 'https://press.example/story',
        })
        for changes, error in (
            ({'acquisition': 'search_result'}, 'saved index capture'),
            ({'dates': {'announced': '2022-10-16'}}, 'dates only in listed_on'),
            ({'coverage_listing': {'article_url': listing['url'] + '#story'}}, 'separate article URL'),
            ({'coverage_listing': {'article_url': 'http://press.example/story'}}, 'HTTPS'),
            ({'coverage_listing': {'listed_on': '2021-09-21'}}, 'Expected fields article_url'),
            ({'coverage_listing': {**listing['coverage_listing'], 'listed_on': '2021-02-30'}}, 'day .*range'),
        ):
            with self.subTest(changes=changes):
                manifest = self.funding_manifest([{'name': COMPANY, 'captures': [{**listing, **changes}]}])
                with self.assertRaisesRegex(ValueError, error):
                    self.reconcile(pair, funding_review=manifest)

    def test_saved_financing_leads_keep_other_event_scopes_visible(self):
        cases = [
            ('Ready Company won a grant for seed production.', 'context', 'grant_or_public_support'),
            ('Ready Company won a seed funding grant.', 'context', 'grant_or_public_support'),
            ('Ready Company secured seed funding, a government grant.', 'context', 'grant_or_public_support'),
            ('Ready Company announced a contract for seed supplies.', 'context', 'commercial_contract'),
            ('Ready Company applied to the government grant funding round.', 'context', 'grant_or_public_support'),
            ('Ready Company reported a valuation of A$8 million.', 'context', 'valuation'),
            ('Ready Company appears in the investor portfolio.', 'context', 'backing_context'),
            ('Ready Company is seeking seed funding.', 'context', 'prospective_or_negated'),
            ('Ready Company did not raise seed funding.', 'context', 'prospective_or_negated'),
            ('Ready Company expects to close a seed round.', 'context', 'prospective_or_negated'),
            ('Ready Company has not yet closed a seed round.', 'context', 'prospective_or_negated'),
            ('Ready Company appointed a CFO. Another Corp raised seed funding.', 'unmatched', None),
            ('Unready Company announced its seed round.', 'unmatched', None),
            ('Ready Company partnered with Another Corp, which raised seed funding.', 'unmatched', None),
            ('Ready Company profiled Another Corp which raised seed funding.', 'unmatched', None),
            ("Ready Company announced Another Corp's seed round.", 'unmatched', None),
            ('Ready Company reported seed funding for Another Corp.', 'unmatched', None),
            ('Ready Company raised seed funding and separately received a grant.',
             'mixed_financing_lead', 'grant_or_public_support'),
            ('Ready Company announced its Series A product line.', 'unmatched', None),
            ('Ready Company announced its Series A model.', 'unmatched', None),
            ('Ready Company announced its Series A edition.', 'unmatched', None),
            ('Ready Company announced its Series A.', 'round_lead', 'round_mention'),
            ('Ready Company completed a funding round.', 'round_lead', 'round_mention'),
            ('An investor said it led the A$25 million Series A for Ready Company.',
             'round_lead', 'round_mention'),
            ('The Ready Company release says that a planned funding round was completed.',
             'round_lead', 'round_mention'),
        ]
        for excerpt, expected, signal in cases:
            with self.subTest(excerpt=excerpt):
                bucket, signals = classify(excerpt, ['ready company'])
                self.assertEqual(bucket, expected)
                if expected in ('context', 'unmatched'):
                    self.assertNotIn('round_mention', signals)
                    self.assertNotIn('early_stage_mention', signals)
                if signal:
                    self.assertIn(signal, signals)

    def test_funding_review_rejects_mismatched_or_unreviewed_inputs(self):
        pair = self.bundle('identity', FIRST, [
            (COMPANY, 'identity', 'reviewed'), (COMPANY, 'aliases', 'reviewed'),
        ])
        self.commit(pair)

        def request(captures=None, former_names=None, name=COMPANY, **binding):
            return self.funding_manifest([{'name': name, 'captures': captures or [],
                                           'former_names': former_names or []}], **binding)

        former = {'name': 'Old Company', 'evidence_id': 'evidence-1'}
        for manifest, error in [
            (lambda: request(revision='b' * 40), 'exact inventory plan'),
            (lambda: request(name=OTHER), 'reviewed company identity'),
            (lambda: request(former_names=[{**former, 'evidence_id': 'evidence-0'}]),
             'committed alias review'),
            (lambda: request(former_names=[{**former, 'name': OTHER}]),
             'ambiguous'),
            (lambda: request(captures=[self.capture('public', 'Ready Company raised seed funding.',
                                                    url='http://ready.example/news')]), 'public HTTPS'),
            (lambda: request(captures=[self.capture('snippet', 'Ready Company raised seed funding.',
                                                    acquisition='search_result', dates={'closed': '2020'})]),
             'saved document evidence'),
        ]:
            with self.subTest(error=error), self.assertRaisesRegex(ValueError, error):
                self.reconcile(pair, funding_review=manifest())

    def test_third_party_round_purpose_does_not_become_issuer_funding(self):
        for excerpt in (
            'Ready Company announced a seed funding investment in Another Corp.',
            'Ready Company announced a seed round to finance Another Corp.',
            'Ready Company announced a seed round on behalf of Another Corp.',
        ):
            with self.subTest(excerpt=excerpt):
                bucket, signals = classify(excerpt, ['ready company'])
                self.assertIn(bucket, ('context', 'unmatched'))
                self.assertNotIn('round_mention', signals)
                self.assertNotIn('early_stage_mention', signals)
        bucket, signals = classify(
            'Ready Company announced a seed round with participation from Another Corp.', ['ready company'],
        )
        self.assertEqual(bucket, 'early_round_lead')
        self.assertIn('round_mention', signals)

    def test_planned_round_needs_explicit_completion_to_be_a_round_lead(self):
        for excerpt in (
            'Ready Company announced a planned seed round.',
            'Ready Company announced a planned Series A.',
            'Ready Company announced a planned funding round.',
        ):
            with self.subTest(excerpt=excerpt):
                bucket, signals = classify(excerpt, ['ready company'])
                self.assertEqual(bucket, 'context')
                self.assertIn('prospective_or_negated', signals)
                self.assertNotIn('round_mention', signals)
        for excerpt, expected in (
            ('Ready Company closed a planned seed round.', 'early_round_lead'),
            ('The Ready Company release says that a planned funding round was completed.', 'round_lead'),
        ):
            with self.subTest(excerpt=excerpt):
                bucket, signals = classify(excerpt, ['ready company'])
                self.assertEqual(bucket, expected)
                self.assertIn('round_mention', signals)
                self.assertNotIn('prospective_or_negated', signals)

    def test_distinct_grant_alongside_round_preserves_mixed_financing(self):
        for amount in ('2', '2.5'):
            with self.subTest(amount=amount):
                bucket, signals = classify(
                    f'Ready Company secured A$8 million in seed funding alongside a A${amount} million grant.',
                    ['ready company'],
                )
                self.assertEqual(bucket, 'mixed_financing_lead')
                self.assertIn('round_mention', signals)
                self.assertIn('grant_or_public_support', signals)
        for excerpt in (
            'Ready Company secured seed funding, a government grant.',
            'Ready Company secured a seed funding grant alongside a commercial contract.',
        ):
            with self.subTest(excerpt=excerpt):
                bucket, signals = classify(excerpt, ['ready company'])
                self.assertEqual(bucket, 'context')
                self.assertNotIn('round_mention', signals)
