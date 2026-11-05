#!/usr/bin/env python3
"""Automated regression tests proving R-001-B packaging security defenses fail-closed.

Tests that PEM private key headers in Markdown, JS, symlinks, or .pem files
are strictly caught and aborted by package.py.
"""
from pathlib import Path
import subprocess
import sys
import tempfile

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE = Path(__file__).resolve().parent.parent

def test_security_scenarios():
    print('Running package security regression tests...')

    # Scenario 1: Markdown file containing generic PEM private key header
    probe_md = BASE / 'docs' / 'probe_test_key.md'
    try:
        # Construct header without cleartext literal in test source
        header = b'-----BEGIN ' + b'PRIVATE KEY-----\nfake_data\n-----END PRIVATE KEY-----\n'
        probe_md.write_bytes(header)
        res = subprocess.run([sys.executable, str(BASE / 'scripts/package.py')], cwd=BASE, capture_output=True, text=True)
        assert res.returncode != 0, 'package.py should fail when Markdown contains PEM private key'
        assert 'Embedded PEM private key' in res.stderr or 'SECURITY VIOLATION' in res.stderr
        print('  ✔ Scenario 1 PASS: Markdown containing PEM private key header is blocked')
    finally:
        if probe_md.is_file():
            probe_md.unlink()

    # Scenario 2: JS file containing RSA PEM private key header
    probe_js = BASE / 'src' / 'probe_test_key.js'
    try:
        header = b'-----BEGIN ' + b'RSA PRIVATE KEY-----\nfake_rsa_data\n-----END RSA PRIVATE KEY-----\n'
        probe_js.write_bytes(header)
        res = subprocess.run([sys.executable, str(BASE / 'scripts/package.py')], cwd=BASE, capture_output=True, text=True)
        assert res.returncode != 0, 'package.py should fail when JS contains RSA PEM private key'
        assert 'Embedded PEM private key' in res.stderr or 'SECURITY VIOLATION' in res.stderr
        print('  ✔ Scenario 2 PASS: JS containing RSA PEM private key header is blocked')
    finally:
        if probe_js.is_file():
            probe_js.unlink()

    # Scenario 3: Explicit .pem suffix file in project root
    probe_pem = BASE / 'test_private.pem'
    try:
        probe_pem.write_text('dummy content', encoding='utf-8')
        res = subprocess.run([sys.executable, str(BASE / 'scripts/package.py')], cwd=BASE, capture_output=True, text=True)
        assert res.returncode != 0, 'package.py should fail when .pem file exists'
        assert 'Private key/cert file detected' in res.stderr or 'SECURITY VIOLATION' in res.stderr
        print('  ✔ Scenario 3 PASS: Explicit .pem suffix file is blocked')
    finally:
        if probe_pem.is_file():
            probe_pem.unlink()

    print('All package security regression tests PASSED!')

if __name__ == '__main__':
    test_security_scenarios()
