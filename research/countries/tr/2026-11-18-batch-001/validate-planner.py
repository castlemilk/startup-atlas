#!/usr/bin/env python3
"""Read-only replay of the existing #177 planner with a temporary staged overlay."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
sys.path.insert(0,str(ROOT))
from scripts.plan_company_profiles import build_plan

baseline=json.loads((HERE/'baseline.json').read_text())
revision=baseline['revision']
overlay_bytes=subprocess.check_output(['git','show',revision+':data/startup-research.json'],cwd=ROOT)
seed_bytes=subprocess.check_output(['git','show',revision+':data/company-profile-seeds.csv'],cwd=ROOT)
overlay=json.loads(overlay_bytes)
records=json.loads((HERE/'startup-records.json').read_text())['startups']
original_count=len(overlay['startups'])
overlay['startups'].extend(records)
combined_bytes=(json.dumps(overlay,ensure_ascii=False,indent=2)+'\n').encode()
with tempfile.TemporaryDirectory(prefix='atlas-tr-planner-') as directory:
    overlay_path=Path(directory)/'overlay.json'
    seeds_path=Path(directory)/'approved.csv'
    overlay_path.write_bytes(combined_bytes);seeds_path.write_bytes(seed_bytes)
    pages=[];cursor=None;seen=[]
    while True:
        page=build_plan(overlay_path,seeds_path,revision,10,cursor)
        pages.append(page);seen.extend(page['items'])
        cursor=page['next_cursor']
        if cursor is None:break
        assert len(pages)<100
    expected=sorted(c['name'] for c in overlay['startups'])
    assert [c['source_record_name'] for c in seen]==expected
    assert len(expected)==len(set(expected))==original_count+len(records)
    assert build_plan(overlay_path,seeds_path,revision,10,None)==pages[0]
    resumed=build_plan(overlay_path,seeds_path,revision,10,pages[0]['next_cursor'])
    assert resumed==pages[1]
    new_names={c['name'] for c in records}
    new_items=[c for c in seen if c['source_record_name'] in new_names]
    assert len(new_items)==len(records)
    assert all(c['seed_state']=='seed_review_required' and c['approved_url'] is None and c['collection_state']=='not_assessed' for c in new_items)
    rejected={}
    for label,changes in [
        ('revision',{'revision':'0'*40}),
        ('page_size',{'limit':11}),
        ('input_bytes',{})
    ]:
        if label=='input_bytes':overlay_path.write_bytes(combined_bytes+b'\n')
        try:
            build_plan(overlay_path,seeds_path,changes.get('revision',revision),changes.get('limit',10),pages[0]['next_cursor'])
        except ValueError:
            rejected[label]=True
        else:raise AssertionError('Stale cursor accepted: '+label)
        finally:
            if label=='input_bytes':overlay_path.write_bytes(combined_bytes)
    assert overlay_path.read_bytes()==combined_bytes and seeds_path.read_bytes()==seed_bytes
print(json.dumps({
    'valid':True,'planner':'scripts/plan_company_profiles.py','base_revision':revision,
    'input_scope':'Temporary hypothetical overlay: pinned 45 records plus 21 staged projections. These combined bytes do not exist in the stated base commit.',
    'base_overlay_records':original_count,'staged_records':len(records),
    'temporary_combined_records':len(expected),'pages':len(pages),
    'plan_id':pages[0]['plan_id'],'combined_overlay_sha256':hashlib.sha256(combined_bytes).hexdigest(),
    'unchanged_seed_sha256':hashlib.sha256(seed_bytes).hexdigest(),
    'staged_seed_states':{'seed_review_required':len(new_items)},
    'resume_exact':True,'cursor_drift_rejected':rejected,
    'inventory_exhausted':True,'country_or_crawl_complete':False,
    'production_write':False,'crawler_run':False,'seed_approvals':0,
    'warning':'Only the existing planner inventory is exhausted. No source pages fetched, seed approved, or country denominator established.'
},indent=2))
