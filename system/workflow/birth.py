#!/usr/bin/env python3
"""Transactional scaffold copy and validation; no implicit git or registry writes."""
import argparse
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tarfile

INCLUDES = {'.claude', '.agents', 'CLAUDE.md', 'docs', 'showcase', 'studio',
            'system', 'template.json', '.gitignore', '.gitattributes', '.env.example'}
CORE = {'CLAUDE.md', 'template.json', '.gitignore', '.gitattributes', '.env.example',
        'docs/product.md', 'docs/design.md', 'docs/log.md', 'docs/backlog.md', 'docs/recovery.md'}


def git(root, *args):
    return subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True).stdout


def root_at(path):
    path = Path(path).expanduser().resolve()
    root = Path(git(path, 'rev-parse', '--show-toplevel').decode().strip()).resolve()
    if root != path:
        raise ValueError('Select the repository root explicitly: ' + str(root))
    return root


def selected(name, profile):
    if name.split('/')[0] not in INCLUDES: return False
    if profile == 'full': return True
    return name in CORE or name.startswith(('system/workflow/', '.agents/skills/')) or name in {
        '.claude/commands/birth.md', '.claude/commands/warmup.md',
        '.claude/commands/wrapup.md', '.claude/commands/pause.md'}


def scaffold(template, target, revision, profile):
    target = root_at(target)
    if profile == 'experiment':
        raise ValueError('Experiments need no scaffold: use feasibility-probe and record findings')
    sha = git(template, 'rev-parse', revision + '^{commit}').decode().strip()
    archive = git(template, 'archive', sha)
    files = {}
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for item in tar.getmembers():
            if not selected(item.name, profile): continue
            if item.isdir(): continue
            if not item.isfile() or item.name.startswith('/') or '..' in Path(item.name).parts:
                raise ValueError('Unsupported archive entry: ' + item.name)
            files[item.name] = tar.extractfile(item).read()
    required = CORE | {'system/workflow/birth.py', 'system/workflow/lifecycle.md',
                       'system/workflow/profile.json', '.claude/commands/birth.md'}
    if not required <= files.keys():
        raise ValueError('Template snapshot missing required files: ' + str(sorted(required-files.keys())))
    manifest = 'system/workflow/birth-state.json'
    # Preflight entire copy before any write. Even equal existing files are not overwritten.
    for name in [*files, manifest]:
        dest = target / name
        if dest.exists() or dest.is_symlink(): raise ValueError('Collision: ' + name)
        if not dest.resolve().is_relative_to(target): raise ValueError('Escaping target path: ' + name)
        for parent in dest.parents:
            if parent == target: break
            if parent.exists() and not parent.is_dir(): raise ValueError('Parent is a file: ' + str(parent))
    state = {'schemaVersion': 1, 'profile': profile, 'templateCommit': sha,
             'templateVersion': json.loads(files['template.json'])['version'],
             'status': 'draft', 'approval': None, 'files': sorted(files)}
    created, dirs = [], []
    try:
        for name, content in {**files, manifest: (json.dumps(state, indent=2)+'\n').encode()}.items():
            dest = target/name
            missing = []
            parent = dest.parent
            while not parent.exists(): missing.append(parent); parent = parent.parent
            for parent in reversed(missing): parent.mkdir(); dirs.append(parent)
            with dest.open('xb') as f: f.write(content)
            created.append(dest)
    except Exception:
        for dest in reversed(created): dest.unlink()
        for parent in reversed(dirs): parent.rmdir()
        raise
    print(json.dumps({'status': 'draft', 'filesCopied': len(files), 'templateCommit': sha}))


def validate(target):
    root = root_at(target)
    state_path = root/'system/workflow/birth-state.json'
    if not state_path.exists():
        return ['Birth state absent; inspect existing project before adopting or resuming'], 'unrecorded'
    state = json.loads(state_path.read_text())
    errors = []
    if state.get('status') == 'complete' and not state.get('approval'):
        errors.append('Completed birth requires recorded human approval')
    # Scan output fields, not explanatory syntax in procedures. Real template tokens are uppercase.
    names = [n for n in state['files'] if n in CORE or n.startswith(('showcase/', 'system/agents/'))]
    for name in names:
        p = root/name
        if not p.exists():
            # Character folder is renamed after approval; validate replacement separately.
            if not name.startswith('system/agents/_character/'): errors.append('Missing: '+name)
            continue
        if p.suffix in {'.md', '.json', '.html'}:
            for line in p.read_text().splitlines():
                if 'Placeholders look like' in line: continue
                if re.search(r'\{\{[A-Z][^}]*', line): errors.append('Unresolved field: '+name); break
        if p.suffix == '.json':
            try: json.loads(p.read_text())
            except json.JSONDecodeError: errors.append('Invalid JSON: '+name)
    for name in state['files']:
        if name.startswith('system/agents/_character/'): continue
        if not (root/name).is_file(): errors.append('Scaffold incomplete: '+name)
    meta = json.loads((root/'template.json').read_text()) if (root/'template.json').exists() else {}
    if 'version' in meta or not meta.get('bornFromVersion'):
        errors.append('Resolve project template provenance')
    profile = json.loads((root/'system/workflow/profile.json').read_text()) if (root/'system/workflow/profile.json').exists() else {}
    if profile.get('project') in {None, '', 'project-template'} or profile.get('platform') in {None, '', 'choose-at-birth'}:
        errors.append('Choose project name and platform in workflow profile')
    if state['profile'] == 'full':
        if (root/'system/agents/_character').exists(): errors.append('Character template not resolved')
        manifests = list((root/'system/agents').glob('*/manifest.json'))
        if not manifests: errors.append('Character manifest missing')
        for p in manifests:
            data = json.loads(p.read_text())
            if data.get('activation') != 'manual': errors.append('New character must be born manual')
            if not (p.parent/'identity.md').is_file(): errors.append('Character identity missing')
            if '{{' in p.read_text() or ((p.parent/'identity.md').is_file() and '{{' in (p.parent/'identity.md').read_text()):
                errors.append('Character fields unresolved')
    return errors, state.get('status', 'draft')


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='action',required=True)
    s=sub.add_parser('copy');s.add_argument('--template',required=True);s.add_argument('--target',required=True)
    s.add_argument('--revision',required=True);s.add_argument('--profile',choices=['small','full','experiment'],required=True)
    s=sub.add_parser('validate');s.add_argument('target')
    a=p.parse_args()
    if a.action=='copy': scaffold(Path(a.template).expanduser(), a.target, a.revision,a.profile);return 0
    errors,status=validate(a.target)
    print(json.dumps({'status':status,'errors':errors},indent=2));return 1 if errors else 0

if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError,OSError,subprocess.SubprocessError) as e:
        print(str(e),file=sys.stderr);sys.exit(2)
