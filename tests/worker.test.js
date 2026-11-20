import test from 'node:test';
import assert from 'node:assert/strict';
import { workerHarness } from './worker-harness.js';

const group = { id: 'social', name: 'Social', domains: ['x.com'], mode: 'always', windows: [], allowTemporaryVisits: true };
const settings = { cooldownMinutes: 10, visitMinutes: 5, groups: [group] };
async function configured() {
  const h = await workerHarness(); const token = await h.unlock();
  assert.equal((await h.call('propose', { token, settings, revision: 0 })).data.outcome, 'applied');
  return { ...h, token, siteId: Object.keys(h.local.state.sites)[0] };
}

test('mutations require authenticated extension settings and session expires', async () => {
  const h = await configured();
  assert.equal((await h.call('propose', { settings, revision: 1 })).ok, false);
  assert.equal((await h.call('unlock', { password: 'wrong' })).ok, false);
  assert.equal((await h.call('propose', { token: h.token, settings, revision: 1 }, { ...h.sender, url: 'chrome-extension://test/blocked.html' })).ok, false);
  assert.equal((await h.call('status', {}, { ...h.sender, url: 'https://x.com' })).ok, false);
  h.session.auth.expiresAt = Date.now() - 1;
  assert.equal((await h.call('propose', { token: h.token, settings, revision: 1 })).ok, false);
});
test('weakening waits using the old cooldown and cannot apply unattended or early', async () => {
  const h = await configured();
  const candidate = { ...settings, cooldownMinutes: 5, groups: [] };
  const before = Date.now();
  const result = await h.call('propose', { token: h.token, settings: candidate, revision: 1 });
  assert.equal(result.data.outcome, 'pending');
  assert.ok(h.local.state.pending.readyAt >= before + 10 * 60000);
  assert.equal(h.local.state.settings.groups.length, 1);
  const pendingId = h.local.state.pending.id;
  assert.equal((await h.call('confirm', { token: h.token, pendingId })).ok, false);
  h.local.state.pending.readyAt = Date.now() - 1;
  h.session.auth.issuedAt = h.local.state.pending.readyAt - 1;
  await h.call('status'); assert.equal(h.local.state.settings.groups.length, 1);
  assert.equal((await h.call('confirm', { token: h.token, pendingId })).ok, false);
  const freshToken = await h.unlock();
  assert.equal((await h.call('confirm', { token: freshToken, pendingId })).ok, true);
  assert.equal(h.local.state.settings.groups.length, 0);
});
test('editing pending proposals restarts the wait and strengthening invalidates them', async () => {
  const h = await configured();
  await h.call('propose', { token: h.token, settings: { ...settings, groups: [] }, revision: 1 });
  const first = h.local.state.pending.id;
  h.local.state.pending.readyAt = Date.now() - 1;
  await h.call('propose', { token: h.token, settings: { ...settings, cooldownMinutes: 5 }, revision: 1 });
  assert.notEqual(h.local.state.pending.id, first); assert.ok(h.local.state.pending.readyAt > Date.now());
  await h.call('propose', { token: h.token, settings: { ...settings, cooldownMinutes: 15 }, revision: 1 });
  assert.equal(h.local.state.pending, null);
  assert.equal((await h.call('confirm', { token: h.token, pendingId: first })).ok, false);
  assert.equal((await h.call('propose', { token: h.token, settings, revision: 1 })).ok, false);
});
test('visits are one at a time, start only when ready, and expire', async () => {
  const h = await configured();
  assert.equal((await h.call('requestVisit', { siteId: h.siteId })).ok, true);
  assert.equal((await h.call('requestVisit', { siteId: h.siteId })).ok, false);
  assert.equal((await h.call('startVisit', { siteId: h.siteId })).ok, false);
  h.local.state.visit.readyAt = Date.now() - 1;
  assert.equal((await h.call('startVisit', { siteId: h.siteId })).ok, true);
  assert.equal(h.engine.session.length, 1);
  assert.ok(h.local.state.visit.expiresAt > Date.now() + 299000);
  h.local.state.visit.expiresAt = Date.now() - 1;
  await h.call('status');
  assert.equal(h.local.state.visit, null); assert.equal(h.engine.session.length, 0);
});
test('missed ready window expires and strict groups refuse visits', async () => {
  const h = await configured();
  await h.call('requestVisit', { siteId: h.siteId });
  h.local.state.visit.claimBy = Date.now() - 1; h.local.state.visit.readyAt = Date.now() - 60000;
  assert.equal((await h.call('startVisit', { siteId: h.siteId })).ok, false);
  await h.call('propose', { token: h.token, settings: { ...settings, groups: [{ ...group, allowTemporaryVisits: false }] }, revision: 1 });
  assert.equal((await h.call('requestVisit', { siteId: h.siteId })).ok, false);
});
test('rule failure preserves stored settings and last working rules', async () => {
  const h = await configured(); const rules = structuredClone(h.engine.dynamic);
  h.engine.failNext = true;
  const result = await h.call('propose', { token: h.token, settings: { ...settings, groups: [{ ...group, domains: ['x.com', 'example.com'] }] }, revision: 1 });
  assert.equal(result.ok, false);
  assert.deepEqual(h.local.state.settings, settings); assert.deepEqual(h.engine.dynamic, rules); assert.equal(h.local.transaction, undefined);
});
test('restart restores deadlines, recreates alarms, and never restores authentication', async () => {
  const h = await configured(); await h.call('requestVisit', { siteId: h.siteId });
  const deadline = h.local.state.visit.readyAt;
  const next = await workerHarness({ initial: h.local });
  assert.equal(next.local.state.visit.readyAt, deadline);
  assert.equal(next.session.auth, undefined); assert.ok(next.alarms.has('reconcile')); assert.ok(next.alarms.has('boundary'));
});
test('unfinished transaction is rolled back on startup', async () => {
  const h = await configured();
  const initial = structuredClone(h.local); initial.transaction = { previous: structuredClone(initial.state) };
  initial.state.settings.groups = []; initial.state.revision++;
  const next = await workerHarness({ initial });
  assert.deepEqual(next.local.state.settings, settings); assert.equal(next.local.transaction, undefined); assert.ok(next.engine.dynamic.length);
});
test('incognito enforces shared policy but rejects mutations', async () => {
  const h = await configured(); const initial = structuredClone(h.local);
  const incognito = await workerHarness({ incognito: true, initial });
  assert.ok(incognito.engine.dynamic.length);
  assert.equal((await incognito.call('requestVisit', { siteId: h.siteId })).ok, false);
  assert.equal((await incognito.call('unlock', { password: 'test password' })).ok, false);
  assert.deepEqual(incognito.local, initial);
});
test('status never returns the password verifier', async () => {
  const h = await configured();
  const status = (await h.call('status')).data;
  assert.equal(JSON.stringify(status).includes(h.local.state.verifier.hash), false);
  assert.equal(JSON.stringify(status).includes('test password'), false);
});

test('simultaneous visit requests serialize into exactly one durable request', async () => {
  const h = await configured();
  const results = await Promise.all([h.call('requestVisit', { siteId: h.siteId }), h.call('requestVisit', { siteId: h.siteId })]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(h.local.state.visit.siteId, h.siteId);
});

test('authorization cannot be replayed from another tab or document', async () => {
  const h = await configured();
  for (const sender of [{ ...h.sender, documentId: 'other' }, { ...h.sender, tab: { id: 2, incognito: false } }, { ...h.sender, frameId: 1 }, { ...h.sender, id: 'another-extension' }]) {
    assert.equal((await h.call('propose', { token: h.token, settings: { ...settings, groups: [] }, revision: 1 }, sender)).ok, false);
  }
  assert.equal(h.local.state.pending, null);
});
test('five failed passwords throttle attempts and the throttle also rejects correct passwords', async () => {
  const h = await configured();
  for (let i = 0; i < 5; i++) assert.equal((await h.call('unlock', { password: 'wrong' })).ok, false);
  assert.match((await h.call('unlock', { password: 'test password' })).error, /Too many attempts/);
  h.session.attempts.until = Date.now() - 1;
  assert.equal((await h.call('unlock', { password: 'test password' })).ok, true);
});
test('export requires a settings-document authorization and excludes pending changes', async () => {
  const h = await configured();
  await h.call('propose', { token: h.token, settings: { ...settings, groups: [] }, revision: 1 });
  assert.equal((await h.call('exportSettings')).ok, false);
  assert.equal((await h.call('exportSettings', { token: h.token }, { ...h.sender, url: 'chrome-extension://test/blocked.html' })).ok, false);
  const exported = (await h.call('exportSettings', { token: h.token })).data;
  assert.deepEqual(exported.settings, settings);
  assert.deepEqual(Object.keys(exported), ['format', 'version', 'settings']);
});
test('expired active visits are revoked on startup, including after a missed alarm', async () => {
  const h = await configured();
  const initial = structuredClone(h.local);
  initial.state.visit = { status: 'active', siteId: h.siteId, domain: 'x.com', startsAt: Date.now() - 600000, expiresAt: Date.now() - 1 };
  const restarted = await workerHarness({ initial });
  assert.equal(restarted.local.state.visit, null);
  assert.equal(restarted.engine.session.length, 0);
  assert.ok(restarted.engine.dynamic.length > 0);
});
test('changing password clears proposals and invalidates the old authorization', async () => {
  const h = await configured();
  await h.call('propose', { token: h.token, settings: { ...settings, groups: [] }, revision: 1 });
  assert.equal((await h.call('changePassword', { token: h.token, currentPassword: 'wrong', password: 'a new password' })).ok, false);
  assert.equal((await h.call('changePassword', { token: h.token, currentPassword: 'test password', password: 'a new password' })).ok, true);
  assert.equal(h.local.state.pending, null);
  assert.equal((await h.call('exportSettings', { token: h.token })).ok, false);
  assert.equal((await h.call('unlock', { password: 'test password' })).ok, false);
  assert.equal((await h.call('unlock', { password: 'a new password' })).ok, true);
});
test('canceling a visit revokes access immediately and the next request waits in full', async () => {
  const h = await configured();
  await h.call('requestVisit', { siteId: h.siteId });
  h.local.state.visit.readyAt = Date.now() - 1;
  await h.call('startVisit', { siteId: h.siteId });
  assert.equal(h.engine.session.length, 1);
  await h.call('cancelVisit', { siteId: h.siteId });
  assert.equal(h.engine.session.length, 0);
  await h.call('requestVisit', { siteId: h.siteId });
  assert.equal(h.local.state.visit.readyAt - h.local.state.visit.requestedAt, 600000);
});
test('ready confirmation rejects an unexpired authorization issued before the deadline', async () => {
  const h = await configured();
  await h.call('propose', { token: h.token, settings: { ...settings, groups: [] }, revision: 1 });
  h.local.state.pending.readyAt = Date.now() - 1;
  h.session.auth.issuedAt = h.local.state.pending.readyAt - 1;
  const pendingId = h.local.state.pending.id;
  assert.match((await h.call('confirm', { token: h.token, pendingId })).error, /after the cooldown/);
  assert.equal(h.local.state.settings.groups.length, 1);
  const token = await h.unlock();
  assert.equal((await h.call('confirm', { token, pendingId })).ok, true);
});
