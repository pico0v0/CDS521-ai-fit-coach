#!/usr/bin/env python3
"""Automated regression tests proving R-001-B packaging security defenses fail-closed.

Tests that PEM private key headers in Markdown, JS, package.py, verify_package.py,
or explicit .pem files are strictly caught and aborted by package.py with zero file exemptions.
Also tests that smoke cleanup leaves no dangling symlinks.
"""
from pathlib import Path
import subprocess
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE = Path(__file__).resolve().parent.parent

# Build headers dynamically via byte concatenation to avoid literal match in this file
DASH_BEGIN = b'-----' + b'BEGIN '
DASH_END = b'-----' + b'END '

def make_header(kind):
    return DASH_BEGIN + kind.encode('ascii') + b'-----\nFAKE_KEY_DATA\n' + DASH_END + kind.encode('ascii') + b'-----\n'

def make_comment_header(kind):
    return b'\n# ' + (DASH_BEGIN + kind.encode('ascii') + b'-----') + b'\n# FAKE_KEY_DATA\n'

def test_security_scenarios():
    print('Running package security regression tests...')

    # Scenario 1: Markdown file containing generic PEM private key header
    probe_md = BASE / 'docs' / 'probe_test_key.md'
    try:
        probe_md.write_bytes(make_header('PRIVATE KEY'))
        res = subprocess.run([sys.executable, str(BASE / 'scripts/package.py')], cwd=BASE, capture_output=True, text=True)
        assert res.returncode != 0, 'package.py should fail when Markdown contains PEM private key'
        assert 'SECURITY VIOLATION' in res.stderr
        print('  ✔ Scenario 1 PASS: Markdown containing PEM private key header is blocked')
    finally:
        if probe_md.is_file():
            probe_md.unlink()

    # Scenario 2: JS file containing RSA PEM private key header
    probe_js = BASE / 'src' / 'probe_test_key.js'
    try:
        probe_js.write_bytes(make_header('RSA PRIVATE KEY'))
        res = subprocess.run([sys.executable, str(BASE / 'scripts/package.py')], cwd=BASE, capture_output=True, text=True)
        assert res.returncode != 0, 'package.py should fail when JS contains RSA PEM private key'
        assert 'SECURITY VIOLATION' in res.stderr
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
        assert 'SECURITY VIOLATION' in res.stderr
        print('  ✔ Scenario 3 PASS: Explicit .pem suffix file is blocked')
    finally:
        if probe_pem.is_file():
            probe_pem.unlink()

    # Scenario 4: Injected PEM header in scripts/package.py (zero file exemptions test)
    pkg_file = BASE / 'scripts' / 'package.py'
    orig_pkg_content = pkg_file.read_bytes()
    try:
        injected = orig_pkg_content + make_comment_header('RSA PRIVATE KEY')
        pkg_file.write_bytes(injected)
        res = subprocess.run([sys.executable, str(BASE / 'scripts/package.py')], cwd=BASE, capture_output=True, text=True)
        assert res.returncode != 0, 'package.py should fail when scripts/package.py itself contains a PEM key'
        assert 'SECURITY VIOLATION' in res.stderr
        print('  ✔ Scenario 4 PASS: scripts/package.py itself is scanned without exemption')
    finally:
        pkg_file.write_bytes(orig_pkg_content)

    # Scenario 5: Injected PEM header in scripts/verify_package.py (zero file exemptions test)
    verify_file = BASE / 'scripts' / 'verify_package.py'
    orig_verify_content = verify_file.read_bytes()
    try:
        injected = orig_verify_content + make_comment_header('EC PRIVATE KEY')
        verify_file.write_bytes(injected)
        res = subprocess.run([sys.executable, str(BASE / 'scripts/package.py')], cwd=BASE, capture_output=True, text=True)
        assert res.returncode != 0, 'package.py should fail when scripts/verify_package.py contains a PEM key'
        assert 'SECURITY VIOLATION' in res.stderr
        print('  ✔ Scenario 5 PASS: scripts/verify_package.py itself is scanned without exemption')
    finally:
        verify_file.write_bytes(orig_verify_content)

    # Scenario 6: Smoke cleanup leaves no dangling symlink; packaging works immediately after
    smoke_res = subprocess.run(['node', 'scripts/smoke.mjs'], cwd=BASE, capture_output=True, text=True, shell=True)
    assert smoke_res.returncode == 0, f'Smoke failed: {smoke_res.stderr}'
    symlink_check = BASE / 'src' / 'outside-demo.js'
    assert not symlink_check.is_symlink(), 'Smoke should not leave dangling symlink'
    print('  ✔ Scenario 6 PASS: Smoke cleanup leaves no dangling symlink')

    print('All package security regression tests PASSED!')

if __name__ == '__main__':
    test_security_scenarios()
