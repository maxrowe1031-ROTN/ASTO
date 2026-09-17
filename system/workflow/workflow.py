#!/usr/bin/env python3
"""Small lifecycle helpers. Never commits, pushes, merges, or deletes branches."""
import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import threading
import uuid


def git(root, *args, check=True):
    return subprocess.run(['git', '-C', str(root), *args], capture_output=True,
                          text=True, check=check)


def root_at(path):
    return Path(git(path, 'rev-parse', '--show-toplevel').stdout.strip()).resolve()


def changed(root):
    out = git(root, 'status', '--porcelain=v1', '-z').stdout.split('\0')
    paths = set()
    i = 0
    while i < len(out):
        item = out[i]
        if item:
            paths.add(item[3:])
            if 'R' in item[:2] or 'C' in item[:2]:
                i += 1
                paths.add(out[i])
        i += 1
    return sorted(paths)


def state_dir(root):
    # Per-worktree git directory: survives restarts, never enters a project commit.
    p = Path(git(root, 'rev-parse', '--absolute-git-dir').stdout.strip()) / 'workflow'
    p.mkdir(exist_ok=True)
    return p


def safe_path(root, value):
    root = Path(root).resolve()
    p = (root / value).resolve()
    if not p.is_relative_to(root) or p == root:
        raise ValueError('Expected a file inside the selected repository: ' + value)
    return p


def snapshot(root, session):
    root = Path(root).resolve()
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', session):
        raise ValueError('Session ID must contain only letters, digits, underscore or hyphen')
    path = state_dir(root) / (session + '.json')
    if path.exists():
        raise ValueError('Snapshot already exists; reuse it rather than overwriting ownership evidence')
    data = {'root': str(root), 'head': git(root, 'rev-parse', 'HEAD').stdout.strip(),
            'branch': git(root, 'branch', '--show-current').stdout.strip(),
            'preexisting': changed(root),
            'staged': git(root, 'diff', '--cached', '--name-only', '-z').stdout.split('\0')[:-1]}
    path.write_text(json.dumps(data, indent=2) + '\n')
    print(path)


def stage(root, session, files):
    root = Path(root).resolve()
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', session):
        raise ValueError('Invalid session ID')
    path = state_dir(root) / (session + '.json')
    data = json.loads(path.read_text())
    if data['root'] != str(root) or data['branch'] != git(root, 'branch', '--show-current').stdout.strip():
        raise ValueError('Snapshot checkout/branch does not match')
    if git(root, 'diff', '--cached', '--name-only').stdout.strip():
        raise ValueError('Index already contains changes; review it manually before staging')
    wanted = []
    for value in files:
        p = safe_path(root, value)
        rel = p.relative_to(root).as_posix()
        if p.is_dir():
            raise ValueError('Stage explicit files, not directories')
        if any(rel == old or (old.endswith('/') and rel.startswith(old)) for old in data['preexisting']):
            raise ValueError('Pre-existing changes in ' + rel + '; use manual hunk review')
        wanted.append(rel)
    git(root, 'add', '--', *wanted)
    print(git(root, 'diff', '--cached', '--stat').stdout, end='')


def run_check(root, label, command, timeout):
    root = Path(root).resolve()
    if not command:
        raise ValueError('A command is required after --')
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', label):
        raise ValueError('Use a short label without paths')
    dest = state_dir(root) / (label + '-' + uuid.uuid4().hex[:10])
    result = {'command': command, 'root': str(root),
              'head': git(root, 'rev-parse', 'HEAD').stdout.strip(),
              'changed_paths': changed(root)}
    with dest.with_suffix('.log').open('wb') as output:
        try:
            p = subprocess.Popen(command, cwd=root, stdout=output, stderr=subprocess.STDOUT,
                                 start_new_session=True)
            try:
                result['exit_code'] = p.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                os.killpg(p.pid, signal.SIGKILL)
                p.wait()
                raise
        except subprocess.TimeoutExpired:
            result['exit_code'] = 124
            result['error'] = 'Timed out; task-owned process group terminated'
        except OSError as e:
            result['exit_code'] = 127
            result['error'] = str(e)
    result['log'] = str(dest.with_suffix('.log'))
    dest.with_suffix('.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    return result['exit_code'] if 0 <= result['exit_code'] <= 255 else 1


def scan(root, pattern, dirs):
    root = Path(root).resolve()
    compiled = re.compile(pattern)
    for name in dirs:
        if not safe_path(root, name).is_dir():
            raise ValueError('Missing scan directory: ' + name)
    hits = []
    for name in dirs:
        for p in safe_path(root, name).rglob('*'):
            if p.is_file() and p.suffix in {'.ts', '.js', '.gd', '.py', '.swift', '.cs'}:
                if not p.resolve().is_relative_to(root):
                    raise ValueError('Scan refuses escaping symlink: ' + str(p))
                for n, line in enumerate(p.read_text().splitlines(), 1):
                    if compiled.search(line):
                        hits.append(f'{p.relative_to(root)}:{n}: {line}')
    print('\n'.join(hits) if hits else 'No matches in the validated directories')
    return 1 if hits else 0


def preview(root, directory, command, timeout):
    root = Path(root).resolve()
    # Own ephemeral server, bound only to loopback; no fixed-port/stale-server reuse.
    path = root if directory == '.' else safe_path(root, directory)
    if not path.is_dir() or not command:
        raise ValueError('Preview needs an existing directory and a command after --')
    token = uuid.uuid4().hex
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(path), **kw)
        def end_headers(self):
            self.send_header('X-Workflow-Checkout', token)
            super().end_headers()
        def send_head(self):
            # Prevent SimpleHTTPRequestHandler from following a symlink outside served root.
            if not Path(self.translate_path(self.path)).resolve().is_relative_to(path):
                self.send_error(403)
                return
            return super().send_head()
        def log_message(self, *a):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f'http://127.0.0.1:{server.server_port}'
    print(json.dumps({'root': str(root), 'served': str(path), 'url': url,
                      'identity_header': token}), flush=True)
    try:
        return subprocess.run([arg.replace('{url}', url) for arg in command],
                              cwd=root, timeout=timeout).returncode
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', default='.')
    sub = p.add_subparsers(dest='action', required=True)
    s = sub.add_parser('snapshot'); s.add_argument('session')
    s = sub.add_parser('stage'); s.add_argument('session'); s.add_argument('files', nargs='+')
    s = sub.add_parser('check'); s.add_argument('--timeout', type=int, default=300)
    s.add_argument('label'); s.add_argument('command', nargs=argparse.REMAINDER)
    s = sub.add_parser('scan'); s.add_argument('pattern'); s.add_argument('directories', nargs='+')
    s = sub.add_parser('preview'); s.add_argument('--timeout', type=int, default=120)
    s.add_argument('directory'); s.add_argument('command', nargs=argparse.REMAINDER)
    a = p.parse_args()
    root = root_at(Path(a.root).expanduser())
    command = getattr(a, 'command', [])
    if command[:1] == ['--']: command = command[1:]
    if a.action == 'snapshot': snapshot(root, a.session)
    elif a.action == 'stage': stage(root, a.session, a.files)
    elif a.action == 'check': return run_check(root, a.label, command, a.timeout)
    elif a.action == 'scan': return scan(root, a.pattern, a.directories)
    elif a.action == 'preview': return preview(root, a.directory, command, a.timeout)
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.SubprocessError) as e:
        print(str(e), file=sys.stderr)
        sys.exit(2)
