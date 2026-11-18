#!/usr/bin/env python3
"""Proposal: verify reviewed implementation bytes before scoped CLI execution.

Use a trusted, reviewed copy of this launcher with Python -I. The expected digest
must come from the independently reviewed release, not an untrusted input packet.
No manifest or caller-supplied input revision grants implementation trust.
"""
from contextlib import contextmanager
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import types

FILES=('crawl.py','plan_company_profiles.py','replay_company_profiles.py','run_scoped_collection.py')
MAX_CODE_BYTES=1_000_000


def snapshot(checkout):
    """Read fixed files using directory descriptors; no symlink/file reopen race."""
    root=Path(checkout).resolve(strict=True)
    flags=os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    sources={}
    directory=os.open(root,flags | os.O_DIRECTORY)
    try:
        scripts=os.open('scripts',flags | os.O_DIRECTORY,dir_fd=directory)
        try:
            for name in FILES:
                fd=os.open(name,flags,dir_fd=scripts)
                with os.fdopen(fd,'rb') as handle:
                    import stat
                    if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
                        raise ValueError('Implementation file must be regular')
                    data=handle.read(MAX_CODE_BYTES+1)
                if len(data)>MAX_CODE_BYTES: raise ValueError('Implementation file exceeds limit')
                sources[name]=data
        finally: os.close(scripts)
    finally: os.close(directory)
    hashes={name:hashlib.sha256(data).hexdigest() for name,data in sources.items()}
    digest=hashlib.sha256(json.dumps(hashes,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return root,sources,{'version':1,'sha256':digest,'files':hashes}


@contextmanager
def verified_modules(checkout,expected):
    if not isinstance(expected,str) or not re.fullmatch('[0-9a-f]{64}',expected):
        raise ValueError('Expected independently reviewed implementation SHA-256 is required')
    root,sources,receipt=snapshot(checkout)
    if receipt['sha256']!=expected:
        raise ValueError('Implementation digest mismatch; refusing old or modified implementation')
    if sources['run_scoped_collection.py']!=Path(__file__).read_bytes():
        raise ValueError('Target launcher differs from trusted executing launcher')
    saved={}; modules={}
    try:
        for filename in FILES[:-1]:
            name=filename[:-3]; saved[name]=sys.modules.get(name)
            module=types.ModuleType(name)
            module.__package__=''
            module.__file__=str(root/'scripts'/filename)
            module.__implementation__=receipt
            sys.modules[name]=module; modules[name]=module
            # Execute the bytes already hashed, never a pathname re-read. All
            # project-local imports in this reviewed closure are these 3 modules.
            exec(compile(sources[filename],module.__file__,'exec'),module.__dict__)
        yield modules,receipt
    finally:
        for name,previous in saved.items():
            if previous is None: sys.modules.pop(name,None)
            else: sys.modules[name]=previous


def validate_crawl_arguments(arguments):
    if not arguments or arguments[0] not in ('company-profiles','profiles','sites','logos'):
        raise ValueError('Scoped launcher supports only CSV-seeded page collection modes')
    parser=argparse.ArgumentParser(add_help=False,allow_abbrev=False)
    parser.add_argument('--approved',required=True)
    parser.add_argument('--partners-only',action='store_true')
    options,_=parser.parse_known_args(arguments[1:])
    if arguments[0] in ('sites','logos') and not options.partners_only:
        raise ValueError('Scoped sites/logos route requires --partners-only; no mixed curated sources')


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkout',type=Path,required=True)
    parser.add_argument('--expected-implementation-sha256',required=True)
    parser.add_argument('operation',choices=('plan','replay','crawl'))
    parser.add_argument('arguments',nargs=argparse.REMAINDER)
    args=parser.parse_args(argv)
    if not sys.flags.isolated:
        parser.error('Run the trusted launcher with python3 -I')
    arguments=args.arguments[1:] if args.arguments[:1]==['--'] else args.arguments
    try:
        if args.operation=='crawl': validate_crawl_arguments(arguments)
        with verified_modules(args.checkout,args.expected_implementation_sha256) as (modules,receipt):
            print('Verified implementation: '+json.dumps(receipt,sort_keys=True),file=sys.stderr)
            name={'plan':'plan_company_profiles','replay':'replay_company_profiles','crawl':'crawl'}[args.operation]
            return modules[name].main(arguments)
    except (OSError,ValueError) as exc:
        parser.exit(2,f'Implementation verification failed: {exc}\n')


if __name__=='__main__':
    sys.exit(main())
