import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

export async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await files(path)); else result.push(path);
  }
  return result.sort();
}
const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(manifest.manifest_version, 3); assert.equal(manifest.version, pkg.version);
assert.deepEqual(manifest.permissions.sort(), ['alarms', 'declarativeNetRequest', 'storage']);
assert.equal(manifest.host_permissions, undefined); assert.equal(manifest.content_scripts, undefined); assert.equal(manifest.externally_connectable, undefined); assert.equal(manifest.update_url, undefined);
assert.deepEqual(manifest.web_accessible_resources.flatMap(r => r.resources), ['blocked.html']);
assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
const source = await files('extension');
for (const file of source) {
  assert.ok((await stat(file)).size < 100000, `${file} is unexpectedly large`);
  if (/\.js$/.test(file)) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const text = await readFile(file, 'utf8');
    assert.doesNotMatch(text, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|eval)\s*\(|storage\.sync|\.innerHTML\s*=/, `Unexpected network, sync, or unsafe DOM API in ${file}`);
  }
  if (/\.html$/.test(file)) {
    const text = await readFile(file, 'utf8');
    assert.doesNotMatch(text, /(?:src|href)=["']https?:|\son\w+=["']/, `Remote asset or inline handler in ${file}`);
    for (const match of text.matchAll(/(?:src|href)="([^"#]+)"/g)) await stat(join('extension', match[1]));
  }
}
for (const icon of Object.values(manifest.icons)) await stat(join('extension', icon));
console.log(`Checked ${source.length} extension files: syntax, manifest, local resources, and privacy constraints passed.`);
