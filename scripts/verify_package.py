#!/usr/bin/env python3
"""Verify the entire handoff ZIP (structure, mandatory files, SHA256, and secret scanning)."""
import hashlib
import sys
import zipfile
import re
from pathlib import Path

PREFIX = 'ai-fit-coach-demo/'
SECRET_SUFFIXES = {'.pem', '.key', '.crt', '.cert', '.p12', '.pfx', '.pkcs8'}
PEM_KEY_REGEX = re.compile(
    rb'-----\s*BEGIN\s+(?:[A-Z0-9_\-\s]+)?(?:PRIVATE\s+KEY|KEY\s+BLOCK)[^-]*-----',
    re.IGNORECASE
)

REQUIRED = [
    'README.md', 'README-demo.md', 'package.json', 'index.html', 'server.mjs',
    'src/app.js', 'src/exercise.js', 'src/pose.js', 'src/simulator.js',
    'tests/exercise.test.mjs', 'tests/store.test.mjs',
    'docs/DEVELOPMENT_PLAN.md', 'docs/NEXT_AI_PROMPT.md',
    'handoff/HANDOFF_RULES.md', 'handoff/CHANGELOG.md', 'handoff/TEST_RESULTS.md',
    'handoff/KNOWN_ISSUES.md', 'handoff/REVIEW_REQUEST.md', 'handoff/FIX_REPORT.md',
    'scripts/test_package_security.py',
    'handoff/AUTOMATED_CHECKS.txt', 'handoff/FILE_MANIFEST.sha256'
]

if len(sys.argv) != 2:
    sys.exit('Usage: python scripts/verify_package.py <zip file>')

zip_path = Path(sys.argv[1])
try:
    with zipfile.ZipFile(zip_path) as archive:
        files = {info.filename: info for info in archive.infolist() if not info.is_dir()}
        for filename, info in files.items():
            if not filename.startswith(PREFIX) or '..' in Path(filename).parts or filename.startswith('/'):
                raise ValueError('Unsafe archive path: ' + filename)
            parts = filename.split('/')
            if any(part in parts for part in ('node_modules', '.git', 'release', '__pycache__', 'audit')):
                raise ValueError('Forbidden folder in archive: ' + filename)
            if Path(filename).name.startswith('.env'):
                raise ValueError('Sensitive .env in archive: ' + filename)
            ext = Path(filename).suffix.lower()
            if ext in SECRET_SUFFIXES:
                raise ValueError('Secret extension in archive: ' + filename)
            if info.file_size > 30 * 1024 * 1024:
                raise ValueError('Unexpected giant file: ' + filename)

        for name in REQUIRED:
            if PREFIX + name not in files:
                raise ValueError('Required file missing: ' + name)

        manifest = archive.read(PREFIX + 'handoff/FILE_MANIFEST.sha256').decode('utf-8').splitlines()
        expected = {}
        for line in manifest:
            digest, sep, name = line.partition('  ')
            if sep != '  ' or len(digest) != 64 or not name:
                raise ValueError('Malformed SHA entry')
            if name in expected:
                raise ValueError('Repeated SHA entry: ' + name)
            expected[name] = digest

        actual = {x[len(PREFIX):] for x in files if x != PREFIX + 'handoff/FILE_MANIFEST.sha256'}
        if actual != set(expected):
            raise ValueError(f'Manifest mismatch: only in zip {actual-set(expected)}, only in manifest {set(expected)-actual}')

        for name, expected_sha in expected.items():
            content = archive.read(PREFIX + name)
            got = hashlib.sha256(content).hexdigest()
            if got != expected_sha:
                raise ValueError('SHA mismatch: ' + name)
            # Scan archive files for embedded PEM private key headers
            if name not in {'scripts/package.py', 'scripts/verify_package.py', 'scripts/test_package_security.py'}:
                if PEM_KEY_REGEX.search(content):
                    raise ValueError(f'Embedded PEM private key detected in archive file: {name}')

        print(f'VERIFIED: {zip_path.name} | {len(files)} files | SHA256 OK | required files OK | zero secrets OK')
except (OSError, zipfile.BadZipFile, ValueError) as exc:
    sys.exit(f'VERIFICATION FAILED: {exc}')
