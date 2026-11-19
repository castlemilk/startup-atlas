"""Offline trusted-launcher verification; never run a network collector."""
import base64
import gzip
import hashlib
import csv
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import run_scoped_collection as runner


class ImplementationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);(self.root/'scripts').mkdir()
        for name in runner.FILES: shutil.copyfile(ROOT/'scripts'/name,self.root/'scripts'/name)
        self.receipt=runner.snapshot(self.root)[2]
        self.seeds=self.root/'seeds.csv';self.overlay=self.root/'overlay.json'
        with self.seeds.open('w') as f:
            w=csv.writer(f);w.writerow(['partner','official_website','approved','crawl_scope'])
            w.writerow(['Example','https://example.com/','yes',json.dumps({'version':1,'max_follow':0,'allowed_urls':['https://example.com/']})])
        self.overlay.write_text(json.dumps({'startups':[{'name':'Example','website':'https://example.com/'}]}))

    def test_verified_planner_binds_actual_implementation_separate_from_input_revision(self):
        with runner.verified_modules(self.root,self.receipt['sha256']) as (modules,receipt):
            result=modules['plan_company_profiles'].build_plan(self.overlay,self.seeds,'a'*40)
            self.assertEqual(result['implementation'],receipt)
            self.assertEqual(result['revision'],'a'*40)
            self.assertEqual(result['scope_contract_version'],1)

    def test_modified_each_dependency_fails_before_any_module_execution(self):
        for name in runner.FILES:
            path=self.root/'scripts'/name;original=path.read_bytes();path.write_bytes(original+b'\n# modified\n')
            with self.subTest(name=name),patch('builtins.exec') as execute,self.assertRaisesRegex(ValueError,'digest mismatch'):
                with runner.verified_modules(self.root,self.receipt['sha256']): pass
            execute.assert_not_called();path.write_bytes(original)

    def test_old_checkout_rejected_despite_caller_revision(self):
        # Saved prior implementation from Git, not a simulated capability flag.
        fixture=json.loads((ROOT/'tests/fixtures/scoped-legacy-implementation.json').read_text())
        self.assertEqual(fixture['source_revision'],'99647c438782d6e0e6d1ee17c041af6a5f62731f')
        for name in runner.FILES[:-1]:
            record=fixture['files'][name];old=gzip.decompress(base64.b64decode(record['gzip_base64']))
            self.assertEqual(hashlib.sha256(old).hexdigest(),record['sha256'])
            (self.root/'scripts'/name).write_bytes(old)
        with patch('builtins.exec') as execute,self.assertRaisesRegex(ValueError,'digest mismatch'):
            with runner.verified_modules(self.root,self.receipt['sha256']): pass
        execute.assert_not_called()

    def test_missing_expected_digest_and_arbitrary_manifest_do_not_grant_trust(self):
        for expected in [None,'','a'*40,'0'*64,{'files':self.receipt['files']}]:
            with self.subTest(expected=expected),self.assertRaises(ValueError):
                with runner.verified_modules(self.root,expected): pass

    def test_symlink_dependencies_rejected(self):
        path=self.root/'scripts'/'crawl.py';path.unlink();path.symlink_to(ROOT/'scripts'/'crawl.py')
        with self.assertRaises(OSError): runner.snapshot(self.root)

    def test_verified_bytes_not_reopened_for_execution(self):
        captured=runner.snapshot(self.root)
        (self.root/'scripts'/'crawl.py').write_text('raise AssertionError("unverified new bytes executed")')
        with patch.object(runner,'snapshot',return_value=captured):
            with runner.verified_modules(self.root,self.receipt['sha256']) as (modules,_):
                self.assertTrue(callable(modules['crawl'].parse_crawl_scope))

    def test_scoped_cli_rejects_direct_path_but_verified_isolated_plan_succeeds(self):
        args=['--overlay',str(self.overlay),'--approved',str(self.seeds),'--revision','a'*40]
        direct=subprocess.run([sys.executable,str(ROOT/'scripts'/'plan_company_profiles.py'),*args],capture_output=True,text=True)
        self.assertNotEqual(direct.returncode,0);self.assertIn('digest-verified launcher',direct.stderr)
        verified=subprocess.run([sys.executable,'-I',str(ROOT/'scripts'/'run_scoped_collection.py'),'--checkout',str(self.root),'--expected-implementation-sha256',self.receipt['sha256'],'plan','--',*args],capture_output=True,text=True)
        self.assertEqual(verified.returncode,0,verified.stderr)
        self.assertEqual(json.loads(verified.stdout)['implementation']['sha256'],self.receipt['sha256'])

    def test_crawl_route_cannot_fall_back_to_curated_sources(self):
        for args in [['sites'],['company-profiles'],['logos','--approved','seeds.csv'],['sites','--approved=seeds.csv']]:
            with self.subTest(args=args),self.assertRaises((ValueError,SystemExit)):
                runner.validate_crawl_arguments(args)
        for args in [['sites','--approved','seeds.csv','--partners-only'],['logos','--approved=seeds.csv','--partners-only'],['company-profiles','--approved','seeds.csv']]:
            runner.validate_crawl_arguments(args)
