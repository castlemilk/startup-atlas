#!/usr/bin/env python3
"""Exercise the existing #177 planner against an in-memory staged overlay."""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('existing_profile_planner',ROOT/'scripts/plan_company_profiles.py')
planner=importlib.util.module_from_spec(spec); spec.loader.exec_module(planner)
manifest=json.loads((HERE/'manifest.json').read_text())
original=json.loads((ROOT/'data/startup-research.json').read_text())
staged=json.loads((HERE/'staged-startups.json').read_text())
combined={**original,'startups':original['startups']+staged['startups']}
revision=manifest['run']['base_revision']
pages=[]; seen=[]
with tempfile.TemporaryDirectory(prefix='atlas-sweden-planner-') as tmp:
    overlay=Path(tmp)/'combined.json'; overlay.write_text(json.dumps(combined,ensure_ascii=False,sort_keys=True)+'\n')
    seeds=ROOT/'data/company-profile-seeds.csv'
    cursor=None
    while True:
        page=planner.build_plan(overlay,seeds,revision,limit=10,cursor=cursor)
        pages.append({k:page[k] for k in ('plan_id','offset','returned','next_cursor','inventory_exhausted')})
        seen+=page['items']; cursor=page['next_cursor']
        if cursor is None: break
    assert len(seen)==len(combined['startups'])==64
    assert len({x['source_record_name'] for x in seen})==64
    assert [x['source_record_name'] for x in seen]==sorted(x['name'] for x in combined['startups'])
    new_names={x['name'] for x in staged['startups']}
    new_items=[x for x in seen if x['source_record_name'] in new_names]
    assert len(new_items)==19 and all(x['seed_state']=='seed_review_required' for x in new_items)
    stale=pages[0]['next_cursor']
    rejected=[]
    for label,rev,limit in [('revision_drift','0'*40,10),('batch_size_drift',revision,11)]:
        try: planner.build_plan(overlay,seeds,rev,limit=limit,cursor=stale)
        except ValueError: rejected.append(label)
        else: raise AssertionError('Stale cursor unexpectedly accepted: '+label)
    overlay.write_text(overlay.read_text()+' ')
    try: planner.build_plan(overlay,seeds,revision,limit=10,cursor=stale)
    except ValueError: rejected.append('input_byte_drift')
    else: raise AssertionError('Modified input unexpectedly accepted')
result={'valid':True,'implementation':'scripts/plan_company_profiles.py, existing #177 planner','base_revision':revision,'input_scope':'Ephemeral combined baseline45 plus staged19; not a committed production overlay','enumerated_once':len(seen),'pages':pages,'new_company_seed_states':{x['source_record_name']:x['seed_state'] for x in new_items},'rejected_cursor_drift':rejected,'production_modified':False,'crawl_performed':False,'country_completion_claim':False}
(HERE/'planner-replay.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'valid':True,'enumerated_once':64,'pages':len(pages),'new_seed_review_required':len(new_items),'rejected_cursor_drift':rejected}))
