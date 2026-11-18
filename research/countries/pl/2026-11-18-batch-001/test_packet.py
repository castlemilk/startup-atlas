"""Regression checks for material research/data failures, not API or crawler tests."""
import copy
import unittest
import validate

class PacketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.original=validate.load_bundle()
    def setUp(self): self.b=copy.deepcopy(self.original)
    def rejected(self, fragment):
        errors=validate.validate_bundle(self.b)
        self.assertTrue(any(fragment in e for e in errors),errors)
    def company(self,name):return next(c for c in self.b['companies.json']['companies'] if c['name']==name)
    def record(self,name):return next(c for c in self.b['startup-records.json']['records'] if c['name']==name)

    def test_actual_packet_is_consistent(self):self.assertEqual(validate.validate_bundle(self.b),[])
    def test_unicode_and_domain_normalization(self):
        self.assertEqual(validate.normalize_name('  Ｂｒａｉｎｌｙ  '),'brainly')
        self.assertEqual(validate.canonical_domain('https://WWW.Example.COM/path/'),'example.com')
        self.assertNotEqual(validate.canonical_domain('https://ramp.com/'),validate.canonical_domain('https://rampnetwork.com/'))
        self.assertEqual(validate.canonical_domain('https://research.example.com/'),'research.example.com')
    def test_verified_alias_and_redirect_find_existing_record(self):
        self.assertTrue(validate.identity_matches(self.company('Alokai'),[{'name':'Vue Storefront','website':'https://unrelated.example/'}]))
        self.assertTrue(validate.identity_matches(self.company('Ramp Network'),[{'name':'Old label','website':'https://ramp.network/'}]))
    def test_existing_record_collision_blocks_import(self):
        self.b['baseline-startups.json']['entries'].append({'name':'  Ａｌｏｋａｉ ','website':'https://alokai.com/'})
        self.rejected('existing Atlas identity requires reconciliation')
    def test_unknown_money_cannot_be_zero(self):
        event=self.company('Booksy')['funding_rounds'][0];event['amount']=0;event['currency']='USD'
        self.rejected('unknown amount encoded as zero')
    def test_unpaired_currency_is_rejected(self):
        self.company('Docplanner')['funding_rounds'][0]['currency']=None
        self.rejected('amount/currency pair mismatch')
    def test_unread_source_cannot_support_review(self):
        url=self.b['claims.json']['claims'][0]['source_url']
        next(s for s in self.b['source-registry.json']['sources'] if s['url']==url)['accessed']=False
        self.rejected('unread source supports reviewed claim')
    def test_investor_cannot_be_attached_to_wrong_round(self):
        claim=next(c for c in self.b['claims.json']['claims'] if c['field']=='round_participant')
        claim['value']['event_id']='missing-round'
        self.rejected('participant references nonexistent round')
    def test_portfolio_membership_cannot_be_round_evidence(self):
        self.company('Booksy')['funding_rounds'][0]['participants'][0]['evidence_scope']='portfolio_membership'
        self.rejected('portfolio membership used as round evidence')
    def test_month_precision_cannot_be_padded_to_day(self):
        self.record('Booksy')['funding_rounds'][0]['announced_on']='2021-01-01'
        self.rejected('manufactured exact announcement day')
    def test_secondary_conditional_and_mixed_events_are_excluded(self):
        for name,kind in [('ElevenLabs','employee_tender_secondary'),('ICEYE','primary_funding_with_secondary_placement'),('Nomagic','mixed_funding_including_prior_venture_debt')]:
            c=self.company(name)
            event=next(f for f in c['funding_rounds'] if f['transaction_kind']==kind)
            self.assertFalse(event['projection_eligible'])
        event=self.company('ICEYE')['funding_rounds'][0];event['projection_eligible']=True
        self.rejected('unsafe financing projection gate')
    def test_investor_ticket_is_not_whole_round_total(self):
        event=self.company('BioCam')['funding_rounds'][0]
        self.assertIsNone(event['amount']);self.assertEqual(event['participants'][0]['amount'],2000000)
        self.assertNotIn('amount',self.record('BioCam')['funding_rounds'][0])
    def test_listed_company_and_unknown_denominator_are_preserved(self):
        self.assertNotIn('QNA Technology',{r['name'] for r in self.b['startup-records.json']['records']})
        self.b['coverage.json']['checkpoint']['country_population_denominator']=0
        self.rejected('False country/source completeness')
    def test_replay_is_idempotent_and_conflicts_are_reviewed(self):
        items=self.b['companies.json']['companies'];once=validate.replay_checkpoint({},items)
        self.assertEqual(validate.replay_checkpoint(once,items),once)
        changed=copy.deepcopy(items[0]);changed['website']='https://different.example/'
        with self.assertRaisesRegex(ValueError,'Conflicting checkpoint identity'):
            validate.replay_checkpoint(once,[changed])
    def test_nulls_are_omitted_only_in_legacy_projection(self):
        self.assertIsNone(self.company('Omnipack')['founded']['value'])
        self.record('Omnipack')['founded_year']=None
        self.rejected('null emitted into legacy production schema')

if __name__=='__main__':unittest.main(verbosity=2)
