import test from 'node:test';
import assert from 'node:assert/strict';
import { allDomains, assignSites, buildRules, decision, domainMatches, freshState, groupActive, groupMask, nextChange, normalizeDomain, validateSettings, visitPhase, weakens } from '../extension/core/policy.js';
import { createVerifier, verifyPassword } from '../extension/core/password.js';

process.env.TZ = 'America/Chicago';
const group = (overrides = {}) => ({ id: 'social', name: 'Social', domains: ['x.com'], mode: 'always', windows: [], allowTemporaryVisits: true, ...overrides });
const settings = (...groups) => ({ cooldownMinutes: 10, visitMinutes: 5, groups });
const at = value => new Date(value).getTime();

test('normalizes URLs and international domains without retaining paths or credentials', () => {
  assert.equal(normalizeDomain(' HTTPS://X.COM/a?token=private#part '), 'x.com');
  assert.equal(normalizeDomain('x.com.'), 'x.com');
  assert.equal(normalizeDomain('https://bücher.de/path'), 'xn--bcher-kva.de');
  for (const value of ['chrome://extensions', 'file:///tmp/private', 'https://user:pass@x.com', '*.x.com', 'x.com blah', 'localhost', '127.0.0.1', 'http://[::1]', 'x..com']) assert.throws(() => normalizeDomain(value));
});
test('matches domain boundaries, including trailing dots', () => {
  for (const host of ['x.com', 'WWW.X.COM', 'a.b.x.com', 'x.com.']) assert.equal(domainMatches(host, 'x.com'), true);
  for (const host of ['notx.com', 'x.com.evil.test', 'x.company']) assert.equal(domainMatches(host, 'x.com'), false);
});
test('validates and deduplicates complete settings', () => {
  const config = validateSettings(settings(group({ domains: ['X.COM', 'https://x.com/path'] })));
  assert.deepEqual(allDomains(config), ['x.com']);
  assert.throws(() => validateSettings({ ...config, cooldownMinutes: 4 }));
  assert.throws(() => validateSettings({ ...config, visitMinutes: 0 }));
  assert.throws(() => validateSettings(settings(group({ domains: [] }))));
  assert.throws(() => validateSettings(settings(group(), group())));
  assert.throws(() => validateSettings(settings(group({ mode: 'scheduled', windows: [] }))));
  assert.throws(() => validateSettings(settings(group({ windows: [{ days: [1], start: 600, end: 600 }] }))));
});
test('weekly windows are start-inclusive, end-exclusive, and wrap across midnight/week', () => {
  const g = group({ mode: 'scheduled', windows: [{ days: [1, 6], start: 22 * 60, end: 2 * 60 }] });
  for (const [date, expected] of [['2026-11-16T21:59:59-06:00', false], ['2026-11-16T22:00:00-06:00', true], ['2026-11-17T01:59:59-06:00', true], ['2026-11-17T02:00:00-06:00', false], ['2026-11-22T01:00:00-06:00', true]]) assert.equal(groupActive(g, at(date)), expected, date);
  assert.equal(groupMask(g)[60], 1);
});
test('groups combine and strict subdomains stay blocked during a parent visit', () => {
  const s = settings(group(), group({ id: 'strict', domains: ['work.x.com'], allowTemporaryVisits: false }));
  const now = Date.now(); const visit = { status: 'active', domain: 'x.com', startsAt: now - 1, expiresAt: now + 1000 };
  assert.equal(decision(s, 'x.com', now, visit).blocked, false);
  assert.equal(decision(s, 'a.x.com', now, visit).blocked, false);
  assert.equal(decision(s, 'work.x.com', now, visit).blocked, true);
  assert.equal(decision(s, 'work.x.com', now, visit).canVisit, false);
});
test('weakening compares future weekly coverage and all inherited domains', () => {
  const old = settings(group({ mode: 'scheduled', windows: [{ days: [1, 2, 3, 4, 5], start: 540, end: 1020 }] }));
  const shorter = structuredClone(old); shorter.groups[0].windows[0].end = 960;
  assert.equal(weakens(old, shorter), true);
  assert.equal(weakens(shorter, old), false);
  assert.equal(weakens(settings(group()), settings(group({ domains: ['mobile.x.com'] }))), true);
  assert.equal(weakens(settings(group({ domains: ['mobile.x.com'] })), settings(group())), false);
  assert.equal(weakens(settings(group({ allowTemporaryVisits: false })), settings(group())), true);
  assert.equal(weakens(settings(group()), { ...settings(group()), cooldownMinutes: 5 }), true);
  assert.equal(weakens(settings(group()), { ...settings(group()), visitMinutes: 10 }), true);
  assert.equal(weakens(settings(group()), settings(group({ name: 'Renamed' }))), false);
});
test('moving restrictions between equivalent groups does not weaken them', () => {
  const before = settings(group({ domains: ['x.com', 'news.example.com'] }));
  const after = settings(group(), group({ id: 'news', domains: ['news.example.com'] }));
  assert.equal(weakens(before, after), false);
  assert.equal(weakens(after, before), false);
});
test('next transitions use local time and observe repeated and skipped DST minutes', () => {
  const spring = settings(group({ mode: 'scheduled', windows: [{ days: [0], start: 150, end: 240 }] }));
  assert.equal(nextChange(spring, at('2026-03-08T01:59:00-06:00')), at('2026-03-08T03:00:00-05:00'));
  const fall = settings(group({ mode: 'scheduled', windows: [{ days: [0], start: 90, end: 120 }] }));
  assert.equal(nextChange(fall, at('2026-11-01T01:45:00-05:00')), at('2026-11-01T01:00:00-06:00'));
  assert.equal(nextChange(fall, at('2026-11-01T01:00:00-06:00')), at('2026-11-01T01:30:00-06:00'));
  assert.equal(nextChange(settings(group()), Date.now()), null);
});
test('schedule follows a changed system timezone', () => {
  const s = settings(group({ mode: 'scheduled', windows: [{ days: [5], start: 540, end: 600 }] }));
  const now = at('2026-11-20T15:30:00Z');
  try {
    assert.equal(groupActive(s.groups[0], now), true);
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(groupActive(s.groups[0], now), false);
  } finally { process.env.TZ = 'America/Chicago'; }
});
test('stable website identifiers survive list changes', () => {
  const first = assignSites(settings(group()), {}, () => 'site-one');
  const next = assignSites(settings(group({ domains: ['x.com', 'example.com'] })), first, () => 'site-two');
  assert.equal(next['site-one'], 'x.com'); assert.equal(next['site-two'], 'example.com');
});
test('visit waiting, readiness expiry, and access boundaries use durable timestamps', () => {
  const visit = { status: 'waiting', readyAt: 1000, claimBy: 2000 };
  assert.equal(visitPhase(visit, 999), 'waiting'); assert.equal(visitPhase(visit, 1000), 'ready'); assert.equal(visitPhase(visit, 2000), 'expired');
  assert.equal(visitPhase({ status: 'active', expiresAt: 2000 }, 2000), 'expired');
});
test('compiled rules keep permission-free fallback and stronger no-visit rules', () => {
  const state = freshState(); state.settings = settings(group(), group({ id: 'strict', domains: ['work.x.com'], allowTemporaryVisits: false }));
  state.sites = { main: 'x.com', strict: 'work.x.com' };
  const now = Date.now(); state.visit = { status: 'active', domain: 'x.com', startsAt: now - 1, expiresAt: now + 1000 };
  const rules = buildRules(state, now, new Set(['x.com', 'work.x.com']), 'chrome-extension://test/');
  assert.equal(rules.dynamic.filter(r => r.action.type === 'block').length, 2);
  assert.equal(rules.session.length, 1);
  assert.ok(rules.dynamic.find(r => r.condition.requestDomains[0] === 'work.x.com').priority > rules.session[0].priority);
  assert.equal(rules.dynamic.find(r => r.action.type === 'redirect').action.redirect.url.includes('https://'), false);
  const fallback = buildRules(state, now, new Set(), 'chrome-extension://test/');
  assert.ok(fallback.dynamic.every(r => r.action.type === 'block'));
  assert.equal(buildRules(state, now + 1000, new Set(), 'chrome-extension://test/').session.length, 0);
});
test('password verifiers use independent random salts and reject invalid passwords', async () => {
  const a = await createVerifier('a good password'); const b = await createVerifier('a good password');
  assert.notEqual(a.salt, b.salt); assert.notEqual(a.hash, b.hash); assert.equal(a.iterations, 600000);
  assert.equal(await verifyPassword('a good password', a), true);
  assert.equal(await verifyPassword('incorrect', a), false);
  assert.equal(await verifyPassword('a good password', { ...a, iterations: 1 }), false);
  await assert.rejects(() => createVerifier('short'));
});
