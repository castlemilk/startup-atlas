"""Exercise the existing #177 planner with the real staged records, offline.

This does not activate a durable collector or modify seed approval. The combined
overlay is temporary and never replaces data/startup-research.json.
"""
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

class PacketPlannerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.overlay=Path(self.temp.name)/'combined-staged-overlay.json'
        self.seeds=ROOT/'data/company-profile-seeds.csv'
        self.original=(ROOT/'data/startup-research.json').read_bytes()
        self.seed_original=self.seeds.read_bytes()
        self.base=json.loads(self.original)
        self.batch=json.loads((HERE/'records.json').read_text())
        self.combined={**self.base,'startups':self.base['startups']+self.batch['startups']}
        self.overlay.write_text(json.dumps(self.combined,ensure_ascii=False,indent=2)+'\n')
        self.revision=json.loads((HERE/'manifest.json').read_text())['base_revision']

    def test_existing_planner_resumes_saved_cursor_without_loss_or_duplicates(self):
        first=planner.build_plan(self.overlay,self.seeds,self.revision,limit=7)
        saved=Path(self.temp.name)/'checkpoint.json'
        saved.write_text(json.dumps({'cursor':first['next_cursor'],'items':first['items']}))
        checkpoint=json.loads(saved.read_text())
        cursor=checkpoint['cursor'];items=checkpoint['items']
        second=planner.build_plan(self.overlay,self.seeds,self.revision,7,cursor)
        self.assertEqual(second,planner.build_plan(self.overlay,self.seeds,self.revision,7,cursor))
        while cursor:
            page=planner.build_plan(self.overlay,self.seeds,self.revision,7,cursor)
            items.extend(page['items']);cursor=page['next_cursor']
        names=[x['source_record_name'] for x in items]
        self.assertEqual(len(names),len(set(names)))
        self.assertEqual(sorted(names),sorted(x['name'] for x in self.combined['startups']))
        incoming={x['name'] for x in self.batch['startups']}
        self.assertTrue(all(x['seed_state']=='seed_review_required' and x['approved_url'] is None for x in items if x['source_record_name'] in incoming))
        self.assertTrue(all(x['collection_state']=='not_assessed' for x in items))
        self.assertEqual((ROOT/'data/startup-research.json').read_bytes(),self.original)
        self.assertEqual(self.seeds.read_bytes(),self.seed_original)

    def test_saved_inventory_cursor_rejects_changed_input_bytes(self):
        first=planner.build_plan(self.overlay,self.seeds,self.revision,7)
        self.overlay.write_text(self.overlay.read_text()+'\n')
        with self.assertRaises(ValueError):
            planner.build_plan(self.overlay,self.seeds,self.revision,7,first['next_cursor'])

    def test_saved_inventory_cursor_rejects_changed_revision_or_batch_size(self):
        first=planner.build_plan(self.overlay,self.seeds,self.revision,7)
        for revision,size in [('a'*40,7),(self.revision,8)]:
            with self.subTest(revision=revision,size=size),self.assertRaises(ValueError):
                planner.build_plan(self.overlay,self.seeds,revision,size,first['next_cursor'])

    def test_saved_inventory_cursor_rejects_changed_seed_file_bytes(self):
        staged_seeds=Path(self.temp.name)/'approved-seeds.csv'
        staged_seeds.write_bytes(self.seed_original)
        first=planner.build_plan(self.overlay,staged_seeds,self.revision,7)
        staged_seeds.write_bytes(self.seed_original+b'\n')
        with self.assertRaises(ValueError):
            planner.build_plan(self.overlay,staged_seeds,self.revision,7,first['next_cursor'])
        self.assertEqual(self.seeds.read_bytes(),self.seed_original)

    def test_graph_compilation_is_pure_and_preserves_base_records(self):
        spec=importlib.util.spec_from_file_location('atlas_graph',ROOT/'scripts/make-graph.py')
        graph=importlib.util.module_from_spec(spec);spec.loader.exec_module(graph)
        args=[json.loads((ROOT/'data'/name).read_text()) for name in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json']]
        before=graph.build_graph(*args,self.base)
        after=graph.build_graph(*args,self.combined)
        by_id={x['id']:x for x in after['entities']}
        for entity in before['entities']:
            self.assertEqual(entity,by_id[entity['id']])
        self.assertEqual(sum(x['kind']=='startup' for x in after['entities']),sum(x['kind']=='startup' for x in before['entities'])+len(self.batch['startups']))
        self.assertEqual(len({x['id'] for x in after['funding_rounds']}),len(after['funding_rounds']))
        self.assertEqual((ROOT/'data/startup-research.json').read_bytes(),self.original)

    def test_owner_fix_179_preserves_omitted_founding_years(self):
        """Regression check for the merged owner's fix on the final main base."""
        spec=importlib.util.spec_from_file_location('atlas_graph_unknown_year',ROOT/'scripts/make-graph.py')
        graph=importlib.util.module_from_spec(spec);spec.loader.exec_module(graph)
        args=[json.loads((ROOT/'data'/name).read_text()) for name in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json']]
        compiled=graph.build_graph(*args,self.combined)
        startups={x['name']:x for x in compiled['entities'] if x['kind']=='startup'}
        unknown=[record for record in self.batch['startups'] if 'founded_year' not in record]
        self.assertEqual(sorted(record['name'] for record in unknown),
                         ['Celsus','QApp','QRate','ROBBO','Smart Engines'])
        for record in unknown:
            self.assertNotIn('founded_year',record,'The source projection must keep unknown year omitted')
            result=startups[record['name']]
            self.assertNotIn('founded_year',result,'Owner fix must preserve absence; zero and null are not replacements')
        regression={'kind':'owner_fix_unknown_founding_year','status':'passed',
                    'preserved_absent_names':sorted(record['name'] for record in unknown),
                    'unknown_record_count':len(unknown),
                    'owner_pr':'https://github.com/castlemilk/startup-atlas/pull/179',
                    'production_publication_performed':False}
        print('OWNER_FIX_REGRESSION '+json.dumps(regression,sort_keys=True),flush=True)
        self.assertEqual((ROOT/'data/startup-research.json').read_bytes(),self.original)

if __name__=='__main__':
    unittest.main()
