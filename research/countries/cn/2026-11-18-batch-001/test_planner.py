"""Offline packet checks using Atlas's existing #177 planner and graph builder."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
sys.path.insert(0,str(ROOT/'scripts'))
import plan_company_profiles as planner
spec=importlib.util.spec_from_file_location('country_make_graph',ROOT/'scripts/make-graph.py')
graph=importlib.util.module_from_spec(spec);spec.loader.exec_module(graph)

def load(path):return json.loads(Path(path).read_text())
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

class PacketPlannerTests(unittest.TestCase):
    def setUp(self):
        self.baseline=load(HERE/'baseline.json')
        self.old=load(ROOT/'data/startup-research.json')
        self.new=load(HERE/'startup-records.json')['startups']
        self.combined=copy.deepcopy(self.old)
        self.combined['startups'].extend(copy.deepcopy(self.new))
        self.temp=tempfile.TemporaryDirectory(prefix='atlas-cn-offline-')
        self.addCleanup(self.temp.cleanup)
        self.overlay=Path(self.temp.name)/'staged-combined-overlay.json'
        self.overlay.write_text(json.dumps(self.combined,ensure_ascii=False,indent=2)+'\n')
        self.seeds=ROOT/'data/company-profile-seeds.csv'
        self.seed_digest=sha(self.seeds)
        self.revision=self.baseline['source_revision']
    def plan(self,limit=7,cursor=None):
        return planner.build_plan(self.overlay,self.seeds,self.revision,limit,cursor)
    def test_01_pinned_baseline_and_proposed_denominators(self):
        base=planner.build_plan(ROOT/'data/startup-research.json',self.seeds,self.revision,100)
        self.assertEqual(base['population']['source_records'],45)
        self.assertEqual(self.plan()['population']['source_records'],45+len(self.new))
    def test_02_existing_planner_pagination_resumes_without_loss_or_repeat(self):
        page=self.plan();first=copy.deepcopy(page);names=[]
        while True:
            names.extend(x['source_record_name'] for x in page['items'])
            if page['next_cursor'] is None:break
            page=self.plan(cursor=page['next_cursor'])
        self.assertEqual(names,sorted(x['name'] for x in self.combined['startups']))
        self.assertEqual(len(names),len(set(names)))
        self.assertTrue(page['inventory_exhausted'])
        if first['next_cursor']:
            self.assertEqual(self.plan(cursor=first['next_cursor']),self.plan(cursor=first['next_cursor']))
    def test_03_changed_input_invalidates_saved_cursor(self):
        cursor=self.plan()['next_cursor'];self.overlay.write_text(self.overlay.read_text()+'\n')
        with self.assertRaises(ValueError):self.plan(cursor=cursor)
    def test_04_changed_revision_invalidates_saved_cursor(self):
        cursor=self.plan()['next_cursor'];self.revision='a'*40
        with self.assertRaises(ValueError):self.plan(cursor=cursor)
    def test_05_changed_batch_size_invalidates_saved_cursor(self):
        cursor=self.plan()['next_cursor']
        with self.assertRaises(ValueError):self.plan(limit=8,cursor=cursor)
    def test_06_new_companies_do_not_acquire_seed_approval(self):
        by_name={x['source_record_name']:x for x in self.plan(limit=100)['items']}
        for r in self.new:
            self.assertEqual(by_name[r['name']]['seed_state'],'seed_review_required')
            self.assertIsNone(by_name[r['name']]['approved_url'])
            self.assertEqual(by_name[r['name']]['collection_state'],'not_assessed')
        self.assertEqual(sha(self.seeds),self.seed_digest)
    def test_07_duplicate_source_names_are_not_silently_deduplicated(self):
        self.combined['startups'].append(self.new[0]);self.overlay.write_text(json.dumps(self.combined))
        with self.assertRaises(ValueError):self.plan()
    def test_08_actual_graph_builder_accepts_projection_and_preserves_existing_entities(self):
        args=[load(ROOT/'data'/p) for p in ('partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json')]
        old=graph.build_graph(*args,self.old);new=graph.build_graph(*args,self.combined)
        before={x['id']:x for x in old['entities']};after={x['id']:x for x in new['entities']}
        for eid,node in before.items():self.assertEqual(after[eid],node,'existing entity changed: '+eid)
        new_startups=[x for x in new['entities'] if x['kind']=='startup']
        self.assertEqual(len(new_startups),self.baseline['committed_graph_startups']+len(self.new))
        self.assertEqual(len({x['id'] for x in new['funding_rounds']}),len(new['funding_rounds']))
        self.assertTrue(all(x['source'] for x in new['funding_rounds']))
    def test_09_source_unknowns_are_not_replaced_by_zero(self):
        for r in self.new:
            if 'founded_year' in r:self.assertGreater(r['founded_year'],0)
            for event in r.get('funding_rounds',[]):
                if 'amount' in event:self.assertGreater(event['amount'],0)
                else:self.assertNotIn('currency',event)
    def test_10_production_inputs_and_approvals_remain_unchanged(self):
        for f in self.baseline['files']:self.assertEqual(sha(ROOT/f['path']),f['sha256'],f['path'])
    def test_11_projection_reproduces_from_preserved_inputs_without_network(self):
        spec=importlib.util.spec_from_file_location('country_projection',HERE/'build_projection.py')
        builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
        records,mapping=builder.build(HERE/'inputs')
        self.assertEqual(records,load(HERE/'startup-records.json'))
        self.assertEqual(mapping,load(HERE/'projection-map.json'))

if __name__=='__main__':unittest.main(verbosity=2)
