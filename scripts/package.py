#!/usr/bin/env python3
"""Run required automated checks and create a reproducible source handoff ZIP.

Each included file gets a SHA256 entry in handoff/FILE_MANIFEST.sha256.
Enforces strict secret scanning across ALL files with zero source file exemptions.
Run from any working directory: python scripts/package.py.
"""
from pathlib import Path
import subprocess
import datetime as dt
import hashlib
import json
import zipfile
import sys
import re

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE = Path(__file__).resolve().parent.parent
PREFIX = 'ai-fit-coach-demo'
EXCLUDE_PARTS = {'.git', 'node_modules', 'release', '__pycache__', '.cache', '.venv', 'venv', 'audit'}
EXCLUDE_NAMES = {'.DS_Store', 'FILE_MANIFEST.sha256', 'AUTOMATED_CHECKS.txt', 'R2_EVIDENCE.json'}
SECRET_SUFFIXES = {'.pem', '.key', '.crt', '.cert', '.p12', '.pfx', '.pkcs8'}

# Define pattern via concatenated byte components to avoid cleartext literal match
DASH_BEGIN = b'-----' + b'BEGIN'
PRIV_KEY = b'PRIVATE' + b' KEY'
KEY_BLK = b'KEY' + b' BLOCK'
PEM_KEY_REGEX = re.compile(
    DASH_BEGIN + rb'\s+(?:[A-Z0-9_\-\s]+)?(?:' + PRIV_KEY + rb'|' + KEY_BLK + rb')[^-]*-----',
    re.IGNORECASE
)

REQUIRED = [
    'README.md', 'README-demo.md', 'package.json', 'index.html', 'server.mjs',
    'src/app.js', 'src/pose.js', 'src/exercise.js', 'src/draw.js',
    'src/simulator.js', 'src/store.js', 'src/styles.css',
    'docs/DEVELOPMENT_PLAN.md', 'docs/MANUAL_TEST.md', 'docs/NEXT_AI_PROMPT.md',
    'docs/EXPERIMENT_PROTOCOL.md', 'docs/MOBILE_TESTING.md', 'docs/PRESENTATION_20MIN.md',
    'handoff/HANDOFF_RULES.md', 'handoff/CHANGELOG.md',
    'handoff/TEST_RESULTS.md', 'handoff/KNOWN_ISSUES.md', 'handoff/REVIEW_REQUEST.md',
    'handoff/FIX_REPORT.md',
    'scripts/package.py', 'scripts/verify_package.py', 'scripts/download_models.py',
    'scripts/test_package_security.py',
    'models/README.md',
]

def scan_for_secrets(base_path):
    """Scan all proposed files with zero file-level exemptions."""
    scanned_count = 0
    for path in base_path.rglob('*'):
        rel = path.relative_to(base_path)
        if any(part in EXCLUDE_PARTS for part in rel.parts):
            continue
        if path.is_symlink():
            print(f'SECURITY VIOLATION: Symbolic links are forbidden in release handoff: {rel}', file=sys.stderr)
            raise SystemExit(1)
        if not path.is_file():
            continue
        if path.name in EXCLUDE_NAMES or path.name.startswith('.env') or path.suffix in ('.log', '.pyc', '.zip'):
            continue
        if len(rel.parts) > 1 and rel.parts[0] == 'evidence':
            continue
        # Exclude downloaded binary models and WASM binaries from release zip; keep models/README.md
        if len(rel.parts) > 1 and rel.parts[0] == 'models' and path.name != 'README.md':
            continue

        if path.suffix.lower() in SECRET_SUFFIXES:
            print(f'SECURITY VIOLATION: Private key/cert file detected: {rel}', file=sys.stderr)
            raise SystemExit(1)

        raw = path.read_bytes()
        # Scan ALL files including Markdown, TXT, JS, JSON, and scripts themselves without exemption
        if PEM_KEY_REGEX.search(raw):
            print(f'SECURITY VIOLATION: Embedded PEM private key header detected in {rel}', file=sys.stderr)
            raise SystemExit(1)
        scanned_count += 1
    return scanned_count

def run(cmd):
    # Support cross-platform execution (Windows cmd.exe / POSIX sh) with single command string and non-blocking stdin
    cmd_str = ' '.join(cmd) if isinstance(cmd, (list, tuple)) else str(cmd)
    p = subprocess.run(
        cmd_str,
        cwd=BASE,
        capture_output=True,
        text=True,
        shell=True,
        stdin=subprocess.DEVNULL,
        timeout=60,
        encoding='utf-8',
        errors='replace'
    )
    output = f'$ {cmd_str}\nExit code: {p.returncode}\n{p.stdout}\n{p.stderr}\n'
    print(output[:5000])
    if p.returncode:
        print('ERROR: Packaging aborted because checks failed', file=sys.stderr)
        raise SystemExit(p.returncode)
    return output

def main():
    missing = [f for f in REQUIRED if not (BASE/f).is_file()]
    if missing:
        raise SystemExit('Missing required files: ' + ', '.join(missing))
    package = json.loads((BASE/'package.json').read_text(encoding='utf-8'))
    version = package['version']
    if not version or not all(c.isdigit() or c == '.' for c in version):
        raise SystemExit('Invalid package.json version')

    # Step 1: Pre-scan across ALL files without any exemptions
    scanned = scan_for_secrets(BASE)

    # Step 2: Run all required automated checks
    logs = [
        run(['npm', 'run', 'check']),
        run(['npm', 'test']),
        run(['node', 'scripts/smoke.mjs']),
        run(['node', 'scripts/benchmark.mjs']),
        run([sys.executable, 'scripts/test_package_security.py'])
    ]

    # Step 3: Collect and re-verify files for packaging
    records = {}
    for path in BASE.rglob('*'):
        if not path.is_file():
            continue
        rel = path.relative_to(BASE)
        if any(part in EXCLUDE_PARTS for part in rel.parts) or path.name in EXCLUDE_NAMES:
            continue
        if path.is_symlink():
            print(f'SECURITY VIOLATION: Symlink detected during archiving: {rel}', file=sys.stderr)
            raise SystemExit(1)
        if path.name.startswith('.env') or path.suffix in ('.log', '.pyc', '.zip'):
            continue
        if len(rel.parts) > 1 and rel.parts[0] == 'evidence':
            continue
        # Exclude downloaded binary models and WASM binaries from release zip; keep models/README.md
        if len(rel.parts) > 1 and rel.parts[0] == 'models' and path.name != 'README.md':
            continue

        raw = path.read_bytes()
        if path.suffix.lower() in SECRET_SUFFIXES:
            print(f'SECURITY VIOLATION: Private key suffix detected: {rel}', file=sys.stderr)
            raise SystemExit(1)
        if PEM_KEY_REGEX.search(raw):
            print(f'SECURITY VIOLATION: Embedded PEM key detected during archiving: {rel}', file=sys.stderr)
            raise SystemExit(1)

        records[rel.as_posix()] = raw

    timestamp = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    records['handoff/AUTOMATED_CHECKS.txt'] = (f'Automatic checks run at: {timestamp}\n\n' + '\n\n'.join(logs)).encode('utf-8')
    manifest = '\n'.join(f'{hashlib.sha256(body).hexdigest()}  {name}' for name, body in sorted(records.items())) + '\n'
    records['handoff/FILE_MANIFEST.sha256'] = manifest.encode('utf-8')

    out = BASE/'release'/f'ai-fit-coach-demo-v{version}-handoff.zip'
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, body in sorted(records.items()):
            info = zipfile.ZipInfo(f'{PREFIX}/{name}')
            info.date_time = (2026, 1, 1, 0, 0, 0)
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, body, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    print(f'ZIP READY: {out} ({out.stat().st_size} bytes; {len(records)} files, pre-scanned {scanned} files)')
    subprocess.run([sys.executable, str(BASE/'scripts/verify_package.py'), str(out)], check=True)

if __name__ == '__main__':
    main()
