#!/usr/bin/env python3
"""Validate the shipped archive independently, then extract those exact bytes."""
import fnmatch
import hashlib
import json
import pathlib
import posixpath
import re
import shutil
import sys
import zipfile
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit

root = pathlib.Path(__file__).resolve().parent.parent
version = json.loads((root / 'manifest.json').read_text())['version']
archive_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / f'dist/blocker-{version}.zip'
destination = root / 'dist/test-extension'

# Reviewed capability baseline. New permissions need an explicit product decision,
# not an automatic update copied from the new manifest.
permissions = {'declarativeNetRequest', 'declarativeNetRequestWithHostAccess',
               'storage', 'offscreen', 'webNavigation', 'alarms'}
runtime = {'background', 'blocked', 'content', 'lib', 'offscreen', 'popup', 'report', 'setup'}

with zipfile.ZipFile(archive_path) as archive:
    names = archive.namelist()
    assert len(names) == len(set(names)), 'Duplicate ZIP entries'
    files = set(names)
    for name in names:
        path = pathlib.PurePosixPath(name)
        assert not path.is_absolute() and '..' not in path.parts and '\\' not in name, f'Unsafe archive path: {name}'
        allowed = name in {'manifest.json', 'rules.json'}
        allowed |= path.parts[0] in runtime and path.suffix in {'.js', '.html', '.css'}
        allowed |= path.parts[0] == 'assets' and path.suffix in {'.png', '.svg', '.webp', '.jpg', '.woff2', '.css'}
        assert allowed and not any(part.startswith('.') for part in path.parts), f'Unexpected release file: {name}'

    def resource(source, ref):
        parsed = urlsplit(ref)
        if ref.startswith('data:image/'):
            return
        assert not parsed.scheme and not parsed.netloc, f'Non-local resource in {source}: {ref}'
        target = posixpath.normpath(posixpath.join(posixpath.dirname(source), unquote(parsed.path))) if not ref.startswith('/') else unquote(parsed.path).lstrip('/')
        assert target in files, f'Missing resource in {source}: {ref} -> {target}'

    def stylesheet(source, css):
        for ref in re.findall(r'url\(\s*[\"\']?([^\)\"\']+)', css):
            resource(source, ref.strip())
        for ref in re.findall(r'@import\s+[\"\']([^\"\']+)', css):
            resource(source, ref)

    class Resources(HTMLParser):
        def __init__(self, source):
            super().__init__()
            self.source = source
            self.tag = ''
        def handle_starttag(self, tag, attrs):
            self.tag = tag
            attrs = dict(attrs)
            assert not any(key.startswith('on') for key in attrs), f'Inline event handler: {self.source}'
            if 'style' in attrs:
                stylesheet(self.source, attrs['style'])
            for attr in ('src', 'poster'):
                if attr in attrs:
                    resource(self.source, attrs[attr])
            if tag == 'link' and 'href' in attrs:
                resource(self.source, attrs['href'])
        def handle_endtag(self, tag):
            self.tag = ''
        def handle_data(self, data):
            assert self.tag != 'script' or not data.strip(), f'Inline script: {self.source}'
            if self.tag == 'style':
                stylesheet(self.source, data)

    manifest = json.loads(archive.read('manifest.json'))
    assert manifest['manifest_version'] == 3, 'Expected MV3 extension'
    assert set(manifest.get('permissions', [])) <= permissions, 'Unreviewed extension permission'
    assert manifest.get('host_permissions') == ['*://*/*'], 'Host capability changed'
    assert not manifest.get('optional_permissions') and not manifest.get('optional_host_permissions'), 'Unreviewed optional permissions'
    assert not manifest.get('externally_connectable'), 'External messaging requires a product review'
    refs = [manifest['background']['service_worker'], manifest['action']['default_popup']]
    refs += list(manifest.get('icons', {}).values()) + list(manifest['action'].get('default_icon', {}).values())
    refs += [entry['path'] for entry in manifest['declarative_net_request']['rule_resources']]
    for entry in manifest.get('content_scripts', []):
        refs += entry.get('js', []) + entry.get('css', [])
    for ref in refs:
        resource('manifest.json', ref)
    for entry in manifest.get('web_accessible_resources', []):
        for ref in entry['resources']:
            assert any(fnmatch.fnmatchcase(name, ref) for name in files), f'Missing web-accessible resource: {ref}'
    for name in names:
        if name.endswith('.html'):
            Resources(name).feed(archive.read(name).decode())
        elif name.endswith('.css'):
            stylesheet(name, archive.read(name).decode())
        elif name.endswith('.json'):
            json.loads(archive.read(name))
    hashes = {name: hashlib.sha256(archive.read(name)).hexdigest() for name in sorted(names)}
    shutil.rmtree(destination, ignore_errors=True)
    archive.extractall(destination)

receipt = {'archive': archive_path.name, 'sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(),
           'version': manifest['version'], 'files': hashes}
(root / 'dist/package-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
(root / 'dist/package.sha256').write_text(f"{receipt['sha256']}  {archive_path.name}\n")
print(f"Validated {len(hashes)} release files; SHA-256 {receipt['sha256']}")
