import test from 'node:test';
import assert from 'node:assert/strict';
import { readBackup, settingsBackup, MAX_BACKUP_BYTES } from '../extension/core/backup.js';
import { weakens } from '../extension/core/policy.js';

const settings = { cooldownMinutes: 10, visitMinutes: 5, groups: [{ id: 'social', name: 'Social', domains: ['https://X.com/private'], mode: 'always', windows: [], allowTemporaryVisits: true }] };
test('backup round trip normalizes settings and excludes control state and credentials', () => {
  const backup = settingsBackup({ ...settings, verifier: 'secret', visit: { expiresAt: 999 }, pending: {} });
  assert.deepEqual(Object.keys(backup), ['format', 'version', 'settings']);
  assert.deepEqual(readBackup(JSON.stringify(backup)), { ...settings, groups: [{ ...settings.groups[0], domains: ['x.com'] }] });
  assert.doesNotMatch(JSON.stringify(backup), /secret|verifier|expiresAt|pending|private/);
});
test('invalid, oversized, incompatible, and control-state backups are rejected', () => {
  const backup = settingsBackup(settings);
  for (const value of ['null', '[]', '{', ' '.repeat(MAX_BACKUP_BYTES + 1), JSON.stringify({ ...backup, version: 2 }), JSON.stringify({ ...backup, verifier: {} }), JSON.stringify({ ...backup, settings: { ...settings, cooldownMinutes: 0 } })]) assert.throws(() => readBackup(value));
});
test('a restored weaker backup is still classified as a cooldown proposal', () => {
  const before = readBackup(JSON.stringify(settingsBackup(settings)));
  const imported = readBackup(JSON.stringify(settingsBackup({ ...settings, groups: [] })));
  assert.equal(weakens(before, imported), true);
});
