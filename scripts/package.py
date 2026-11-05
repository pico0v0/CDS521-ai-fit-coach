#!/usr/bin/env python3
"""Run required automated checks and create a reproducible source handoff ZIP.

Each included file gets a SHA256 entry in handoff/FILE_MANIFEST.sha256.
Run from any working directory: python scripts/package.py.
"""
from pathlib import Path
import subprocess
import datetime as dt
import hashlib
import json
import zipfile
import sys

BASE = Path(__file__).resolve().parent.parent
PREFIX = 'ai-fit-coach-demo'
EXCLUDE_PARTS = {'.git', 'node_modules', 'release', '__pycache__', '.cache', '.venv', 'venv'}
EXCLUDE_NAMES = {'.DS_Store', 'FILE_MANIFEST.sha256', 'AUTOMATED_CHECKS.txt'}
REQUIRED = [
    'README.md','package.json','index.html','server.mjs',
    'src/app.js','src/pose.js','src/exercise.js','src/draw.js',
    'src/simulator.js','src/store.js','src/styles.css',
    'docs/DEVELOPMENT_PLAN.md','docs/MANUAL_TEST.md','docs/NEXT_AI_PROMPT.md',
    'handoff/HANDOFF_RULES.md','handoff/CHANGELOG.md',
    'handoff/TEST_RESULTS.md','handoff/KNOWN_ISSUES.md','handoff/REVIEW_REQUEST.md',
    'scripts/package.py','scripts/verify_package.py',
]

def run(cmd):
    p=subprocess.run(cmd, cwd=BASE, capture_output=True, text=True)
    output=f'$ {" ".join(cmd)}\nExit code: {p.returncode}\n{p.stdout}\n{p.stderr}\n'
    print(output[:5000])
    if p.returncode:
        print('ERROR: Packaging aborted because checks failed', file=sys.stderr)
        raise SystemExit(p.returncode)
    return output

def main():
    missing=[f for f in REQUIRED if not (BASE/f).is_file()]
    if missing:
        raise SystemExit('Missing required files: '+', '.join(missing))
    package=json.loads((BASE/'package.json').read_text(encoding='utf-8'))
    version=package['version']
    if not version or not all(c.isdigit() or c=='.' for c in version):
        raise SystemExit('Invalid package.json version')
    logs=[run(['npm','run','check']),run(['npm','test']),run(['node','scripts/smoke.mjs'])]
    records={}
    for path in BASE.rglob('*'):
        if not path.is_file(): continue
        rel=path.relative_to(BASE)
        if any(part in EXCLUDE_PARTS for part in rel.parts) or path.name in EXCLUDE_NAMES: continue
        if path.name.startswith('.env') or path.suffix in ('.log','.pyc','.zip') : continue
        if len(rel.parts)>1 and rel.parts[0] == 'evidence': continue  # private video/image not packaged
        records[rel.as_posix()]=path.read_bytes()
    timestamp=dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    records['handoff/AUTOMATED_CHECKS.txt']=(f'Automatic checks run at: {timestamp}\n\n'+'\n\n'.join(logs)).encode('utf-8')
    manifest='\n'.join(f'{hashlib.sha256(body).hexdigest()}  {name}' for name,body in sorted(records.items()))+'\n'
    records['handoff/FILE_MANIFEST.sha256']=manifest.encode('utf-8')
    out=BASE/'release'/f'ai-fit-coach-demo-v{version}-handoff.zip'
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name,body in sorted(records.items()):
            info=zipfile.ZipInfo(f'{PREFIX}/{name}')
            info.date_time=(2026,1,1,0,0,0)
            info.external_attr=0o644 << 16
            info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,body,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    print(f'ZIP READY: {out} ({out.stat().st_size} bytes; {len(records)} files)')
    subprocess.run([sys.executable,str(BASE/'scripts/verify_package.py'),str(out)], check=True)

if __name__=='__main__':main()
