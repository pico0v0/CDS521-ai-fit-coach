#!/usr/bin/env python3
"""Verify the entire handoff ZIP (structure, mandatory files, and SHA256)."""
import hashlib
import sys
import zipfile
from pathlib import Path

PREFIX='ai-fit-coach-demo/'
REQUIRED=['README.md','package.json','index.html','server.mjs',
          'src/app.js','src/exercise.js','src/pose.js','src/simulator.js',
          'tests/exercise.test.mjs','tests/store.test.mjs',
          'docs/DEVELOPMENT_PLAN.md','docs/NEXT_AI_PROMPT.md',
          'handoff/HANDOFF_RULES.md','handoff/CHANGELOG.md','handoff/TEST_RESULTS.md',
          'handoff/KNOWN_ISSUES.md','handoff/REVIEW_REQUEST.md',
          'handoff/AUTOMATED_CHECKS.txt','handoff/FILE_MANIFEST.sha256']

if len(sys.argv)!=2:
    sys.exit('Usage: python scripts/verify_package.py <zip file>')
zip_path=Path(sys.argv[1])
try:
    with zipfile.ZipFile(zip_path) as archive:
        files={info.filename:info for info in archive.infolist() if not info.is_dir()}
        for filename,info in files.items():
            if not filename.startswith(PREFIX) or '..' in Path(filename).parts or filename.startswith('/'):
                raise ValueError('Unsafe archive path: '+filename)
            if any(part in filename.split('/') for part in ('node_modules','.git','release','__pycache__')):
                raise ValueError('Forbidden folder: '+filename)
            if Path(filename).name.startswith('.env'):
                raise ValueError('Sensitive .env in archive')
            if info.file_size>30*1024*1024:
                raise ValueError('Unexpected giant file: '+filename)
        for name in REQUIRED:
            if PREFIX+name not in files: raise ValueError('Required file missing: '+name)
        manifest=archive.read(PREFIX+'handoff/FILE_MANIFEST.sha256').decode('utf-8').splitlines()
        expected={}
        for line in manifest:
            digest, sep, name=line.partition('  ')
            if sep!='  ' or len(digest)!=64 or not name: raise ValueError('Malformed SHA entry')
            if name in expected: raise ValueError('Repeated SHA entry: '+name)
            expected[name]=digest
        actual={x[len(PREFIX):] for x in files if x!=PREFIX+'handoff/FILE_MANIFEST.sha256'}
        if actual != set(expected): raise ValueError(f'Manifest mismatch: only in zip {actual-set(expected)}, only in manifest {set(expected)-actual}')
        for name,expected_sha in expected.items():
            got=hashlib.sha256(archive.read(PREFIX+name)).hexdigest()
            if got!=expected_sha: raise ValueError('SHA mismatch: '+name)
        print(f'VERIFIED: {zip_path.name} | {len(files)} files | SHA256 OK | required files OK')
except (OSError,zipfile.BadZipFile,ValueError) as exc:
    sys.exit(f'VERIFICATION FAILED: {exc}')
