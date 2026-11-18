#!/usr/bin/env python3
"""Exercise the existing #177 planner over local inputs; never approve or crawl."""
import json,pathlib,sys,tempfile,collections
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[3]
sys.path.insert(0,str(ROOT/'scripts'))
from plan_company_profiles import build_plan
revision=json.loads((HERE/'run.json').read_text())['base_revision']
def pages(overlay,seeds):
 result=[];cursor=None
 while True:
  page=build_plan(overlay,seeds,revision,limit=10,cursor=cursor);result.append(page)
  cursor=page['next_cursor']
  if cursor is None:break
 names=[row['source_record_name']for page in result for row in page['items']]
 assert len(names)==len(set(names))==result[0]['population']['source_records']
 assert names==sorted(names)
 assert all(row['collection_state']=='not_assessed'for page in result for row in page['items'])
 return result
baseline=pages(ROOT/'data/startup-research.json',ROOT/'data/company-profile-seeds.csv')
with tempfile.TemporaryDirectory()as tmp:
 overlay=json.loads((ROOT/'data/startup-research.json').read_text());new=json.loads((HERE/'startups.json').read_text())['startups'];overlay['startups']+=new
 path=pathlib.Path(tmp)/'hypothetical-overlay.json';path.write_text(json.dumps(overlay))
 hypothetical=pages(path,ROOT/'data/company-profile-seeds.csv')
 new_names={x['name']for x in new};new_rows=[row for page in hypothetical for row in page['items']if row['source_record_name']in new_names]
 assert len(new_rows)==25 and all(row['seed_state']=='seed_review_required'and row['approved_url']is None for row in new_rows)
result={'valid':True,'planner':'scripts/plan_company_profiles.py::build_plan','base_revision':revision,'baseline':{'pages':len(baseline),'returned':sum(p['returned']for p in baseline),'population':baseline[0]['population'],'plan_id':baseline[0]['plan_id'],'last_cursor':baseline[-1]['next_cursor'],'inventory_exhausted':baseline[-1]['inventory_exhausted']},'hypothetical_staged_overlay':{'pages':len(hypothetical),'records':hypothetical[0]['population']['source_records'],'new_startups':len(new_rows),'new_seed_review_required':len(new_rows),'new_approved_seeds':0,'production_mutation':False,'is_committed_revision_snapshot':False},'warning':'Offline supplied-overlay inventory only; neither web coverage nor crawler completion. Existing planner implementation reused unchanged.'}
print(json.dumps(result,indent=2))
