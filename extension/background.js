import { allDomains, assignSites, buildRules, decision, domainMatches, domainPatterns, freshState, groupActive, nextChange, validateSettings, visitPhase, weakens } from './core/policy.js';
import { createVerifier, verifyPassword } from './core/password.js';
import { settingsBackup } from './core/backup.js';

const BASE = chrome.runtime.getURL('');
const INCOGNITO = chrome.extension.inIncognitoContext;
const AUTH_MS = 5 * 60000;
const READY_MS = 5 * 60000;
let queue = Promise.resolve();
let engineError = null;
let nextCache = new Map();
let lastSweepKey = '';

function enqueue(fn) {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}
const stable = value => JSON.stringify(value, function (key, v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v;
});

async function loadState() {
  const { state } = await chrome.storage.local.get('state');
  if (!state) return freshState();
  if (state.version !== 1 || !Number.isSafeInteger(state.revision) || !state.sites || typeof state.sites !== 'object') throw new Error('Stored settings could not be read. Existing browser rules have been retained.');
  const settings = validateSettings(state.settings);
  if (allDomains(settings).some(d => !Object.values(state.sites).includes(d))) throw new Error('Stored website IDs are incomplete. Existing browser rules have been retained.');
  return { ...state, settings };
}

async function grants(settings) {
  const domains = allDomains(settings);
  const access = await Promise.all(domains.map(d => chrome.permissions.contains({ origins: domainPatterns(d) })));
  return new Set(domains.filter((_, i) => access[i]));
}

async function currentRules() {
  const [dynamic, session] = await Promise.all([chrome.declarativeNetRequest.getDynamicRules(), chrome.declarativeNetRequest.getSessionRules()]);
  return { dynamic, session };
}

async function replaceRules(previous, next) {
  // Revoke visit allowances before strengthening restrictions; grant them last.
  const sessionChanged = stable(previous.session) !== stable(next.session);
  if (sessionChanged && previous.session.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: previous.session.map(r => r.id), addRules: [] });
  if (stable(previous.dynamic) !== stable(next.dynamic)) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: previous.dynamic.map(r => r.id), addRules: next.dynamic });
  if (sessionChanged && next.session.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [], addRules: next.session });
}

async function install(state, now, granted) {
  const previous = await currentRules();
  const next = buildRules(state, now, granted, BASE);
  try { await replaceRules(previous, next); }
  catch (error) {
    try { await replaceRules(await currentRules(), previous); } catch { /* Retain the error badge; retry from persisted state on the next event. */ }
    throw new Error('Chrome could not update the blocking rules. The last working configuration has been retained.');
  }
}

async function commit(previous, next) {
  if (INCOGNITO) throw new Error('Manage settings and visits in a regular window.');
  const granted = await grants(next.settings);
  await chrome.storage.local.set({ transaction: { previous } });
  try {
    await install(next, Date.now(), granted);
    await chrome.storage.local.set({ state: next });
    await chrome.storage.local.remove('transaction');
  } catch (error) {
    try {
      await install(previous, Date.now(), await grants(previous.settings));
      await chrome.storage.local.set({ state: previous });
      await chrome.storage.local.remove('transaction');
    } catch { /* Startup recovery will retry the journal. */ }
    engineError = error.message;
    throw error;
  }
  nextCache.clear();
  lastSweepKey = '';
}

function transition(settings, now, host = null) {
  const key = `${stable(settings)}|${Math.floor(now / 60000)}|${new Date(now).getTimezoneOffset()}|${host}`;
  if (!nextCache.has(key)) {
    if (nextCache.size > 30) nextCache.clear();
    nextCache.set(key, nextChange(settings, now, host));
  }
  return nextCache.get(key);
}

async function enforceTab(tab, state, now) {
  if (!tab?.id || !tab.url || tab.incognito !== INCOGNITO) return;
  let url;
  try { url = new URL(tab.url); } catch { return; }
  if (!['http:', 'https:'].includes(url.protocol)) return;
  if (!decision(state.settings, url.hostname, now, state.visit).blocked) return;
  const site = Object.entries(state.sites).filter(([, domain]) => domainMatches(url.hostname, domain)).sort((a, b) => b[1].length - a[1].length)[0];
  if (site) await chrome.tabs.update(tab.id, { url: `${BASE}blocked.html#${site[0]}` }).catch(() => {});
}

async function sweep(state, now, granted) {
  const patterns = [...granted].flatMap(domainPatterns);
  if (!patterns.length) return;
  const tabs = await chrome.tabs.query({ url: patterns });
  await Promise.all(tabs.map(tab => enforceTab(tab, state, now)));
}

async function schedule(state, now) {
  const heartbeat = await chrome.alarms.get('reconcile');
  if (!heartbeat || heartbeat.periodInMinutes !== 0.5) await chrome.alarms.create('reconcile', { periodInMinutes: 0.5 });
  const times = [transition(state.settings, now), state.pending?.readyAt, state.visit?.readyAt, state.visit?.claimBy, state.visit?.expiresAt].filter(t => Number.isFinite(t) && t > now);
  const when = times.length ? Math.min(...times) : null;
  const existing = await chrome.alarms.get('boundary');
  if (!when) { if (existing) await chrome.alarms.clear('boundary'); }
  else if (!existing || existing.scheduledTime !== when) await chrome.alarms.create('boundary', { when });
}

async function reconcile({ tab = null, forceSweep = false } = {}) {
  const state = await loadState();
  if (INCOGNITO && (await chrome.storage.local.get('transaction')).transaction) return state;
  const now = Date.now();
  if (!INCOGNITO && state.visit && (visitPhase(state.visit, now) === 'expired' || !decision(state.settings, state.visit.domain, now).canVisit)) {
    state.visit = null;
    await chrome.storage.local.set({ state });
  }
  const granted = await grants(state.settings);
  await install(state, now, granted);
  await schedule(state, now);
  const sweepKey = `${state.revision}|${state.settings.groups.filter(g => groupActive(g, now)).map(g => g.id).join(',')}|${visitPhase(state.visit, now)}|${state.visit?.siteId}|${[...granted].join(',')}`;
  if (forceSweep || sweepKey !== lastSweepKey) { await sweep(state, now, granted); lastSweepKey = sweepKey; }
  if (tab) await enforceTab(tab, state, now);
  const count = state.settings.groups.filter(g => groupActive(g, now)).length;
  await chrome.action.setBadgeText({ text: count ? String(count) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#326455' });
  engineError = null;
  return state;
}

async function reportFailure(error) {
  engineError = error.message || 'Blocking could not be refreshed.';
  await chrome.action.setBadgeText({ text: '!' }).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({ color: '#a14536' }).catch(() => {});
}

function pageOf(sender) {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(BASE)) throw new Error('Untrusted request.');
  const page = new URL(sender.url).pathname;
  if (!['/options.html', '/popup.html', '/blocked.html'].includes(page)) throw new Error('Untrusted extension page.');
  if (sender.frameId && sender.frameId !== 0) throw new Error('Use the extension in its own tab.');
  return page;
}

function regular(sender) {
  if (INCOGNITO || sender.tab?.incognito) throw new Error('Manage settings and visits in a regular window.');
}

async function authenticate(token, sender) {
  regular(sender);
  const { auth } = await chrome.storage.session.get('auth');
  if (!auth || auth.token !== token || auth.expiresAt <= Date.now() || auth.documentId !== sender.documentId || auth.tabId !== sender.tab?.id) throw new Error('Unlock settings with your password first.');
  return auth;
}

async function status(state, message, sender) {
  const now = Date.now();
  const granted = await grants(state.settings);
  const sites = Object.entries(state.sites).map(([id, domain]) => {
    const d = decision(state.settings, domain, now, state.visit);
    return { id, domain, blocked: d.blocked, canVisit: d.canVisit, visiting: d.visiting, groups: d.groups.map(g => g.name), hasAccess: granted.has(domain) };
  });
  const selected = sites.find(s => s.id === message.siteId);
  if (selected) selected.nextChange = transition(state.settings, now, selected.domain);
  let authenticatedUntil = 0;
  if (message.token) { try { authenticatedUntil = (await authenticate(message.token, sender)).expiresAt; } catch { /* Read-only status remains available. */ } }
  const incognitoAllowed = await chrome.extension.isAllowedIncognitoAccess();
  return { initialized: !!state.verifier, revision: state.revision, settings: state.settings, sites, selected, visit: state.visit ? { ...state.visit, phase: visitPhase(state.visit, now) } : null, pending: state.pending, authenticatedUntil, incognito: INCOGNITO, incognitoAllowed, engineError, now, nextChange: transition(state.settings, now), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

async function handle(message, sender) {
  const page = pageOf(sender);
  if (!message || typeof message.type !== 'string') throw new Error('Invalid request.');
  const state = await loadState();
  if (message.type === 'status') {
    try { await reconcile(); } catch (error) { await reportFailure(error); }
    return status(await loadState(), message, sender);
  }
  if (message.type === 'openSettings' || message.type === 'openRegular') {
    const suffix = typeof message.siteId === 'string' && state.sites[message.siteId] ? `#visit=${encodeURIComponent(message.siteId)}` : '';
    const url = `${BASE}options.html${suffix}`;
    if (INCOGNITO) await chrome.windows.create({ url, incognito: false });
    else await chrome.tabs.create({ url });
    return {};
  }
  regular(sender);
  const optionsCommands = ['setup', 'unlock', 'lock', 'propose', 'confirm', 'cancelPending', 'changePassword', 'exportSettings'];
  if (optionsCommands.includes(message.type) && page !== '/options.html') throw new Error('Use the settings page for this action.');
  if (message.type === 'setup') {
    if (state.verifier) throw new Error('A password has already been set.');
    const verifier = await createVerifier(message.password);
    await commit(state, { ...state, verifier });
    return { initialized: true };
  }
  if (!state.verifier) throw new Error('Set up your password first.');
  if (message.type === 'unlock') {
    const { attempts = { failures: 0, until: 0 } } = await chrome.storage.session.get('attempts');
    if (Date.now() < attempts.until) throw new Error('Too many attempts. Wait a minute before trying again.');
    if (!await verifyPassword(message.password, state.verifier)) {
      const failures = attempts.failures + 1;
      await chrome.storage.session.set({ attempts: { failures: failures >= 5 ? 0 : failures, until: failures >= 5 ? Date.now() + 60000 : 0 } });
      throw new Error('That password is incorrect.');
    }
    const auth = { token: crypto.randomUUID(), issuedAt: Date.now(), expiresAt: Date.now() + AUTH_MS, documentId: sender.documentId, tabId: sender.tab?.id };
    await chrome.storage.session.set({ auth, attempts: { failures: 0, until: 0 } });
    return { token: auth.token, expiresAt: auth.expiresAt };
  }
  if (message.type === 'lock') {
    await authenticate(message.token, sender);
    await chrome.storage.session.remove('auth');
    return {};
  }
  if (['propose', 'confirm', 'cancelPending', 'changePassword', 'exportSettings'].includes(message.type)) await authenticate(message.token, sender);
  if (message.type === 'exportSettings') return settingsBackup(state.settings);
  if (message.type === 'propose') {
    if (message.revision !== state.revision) throw new Error('Settings changed in another window. Reload before saving.');
    const settings = validateSettings(message.settings);
    if (stable(settings) === stable(state.settings)) return { outcome: 'unchanged' };
    if (weakens(state.settings, settings)) {
      const pending = { id: crypto.randomUUID(), revision: state.revision, settings, requestedAt: Date.now(), readyAt: Date.now() + state.settings.cooldownMinutes * 60000 };
      await commit(state, { ...state, pending });
      await reconcile();
      return { outcome: 'pending', readyAt: pending.readyAt };
    }
    await commit(state, { ...state, settings, sites: assignSites(settings, state.sites), revision: state.revision + 1, pending: null, visit: null });
    await reconcile({ forceSweep: true });
    return { outcome: 'applied' };
  }
  if (message.type === 'confirm') {
    const pending = state.pending;
    if (!pending || pending.id !== message.pendingId || pending.revision !== state.revision) throw new Error('This pending change is no longer current.');
    if (Date.now() < pending.readyAt) throw new Error('The cooldown has not finished.');
    const auth = await authenticate(message.token, sender);
    if (!Number.isFinite(auth.issuedAt) || auth.issuedAt < pending.readyAt) throw new Error('Enter your password again after the cooldown finishes to confirm this change.');
    await commit(state, { ...state, settings: pending.settings, sites: assignSites(pending.settings, state.sites), revision: state.revision + 1, pending: null, visit: null });
    await reconcile({ forceSweep: true });
    return { outcome: 'applied' };
  }
  if (message.type === 'cancelPending') {
    await commit(state, { ...state, pending: null });
    return {};
  }
  if (message.type === 'changePassword') {
    if (!await verifyPassword(message.currentPassword, state.verifier)) throw new Error('The current password is incorrect.');
    await commit(state, { ...state, verifier: await createVerifier(message.password), pending: null });
    await chrome.storage.session.remove('auth');
    return {};
  }
  if (['requestVisit', 'startVisit', 'cancelVisit'].includes(message.type)) {
    await reconcile();
    const current = await loadState();
    const now = Date.now();
    const domain = current.sites[message.siteId];
    if (!domain) throw new Error('This website is no longer in your groups.');
    if (message.type === 'cancelVisit') {
      if (current.visit?.siteId !== message.siteId) throw new Error('That visit is no longer current.');
      await commit(current, { ...current, visit: null });
      await reconcile({ forceSweep: true });
      return {};
    }
    const d = decision(current.settings, domain, now);
    if (!d.groups.length) throw new Error('This website is not currently blocked.');
    if (!d.canVisit) throw new Error('An active group does not allow temporary visits.');
    if (message.type === 'requestVisit') {
      if (current.visit) throw new Error('Finish or cancel the existing visit request first.');
      const readyAt = now + current.settings.cooldownMinutes * 60000;
      await commit(current, { ...current, visit: { status: 'waiting', siteId: message.siteId, domain, requestedAt: now, readyAt, claimBy: readyAt + READY_MS, durationMinutes: current.settings.visitMinutes } });
    } else {
      if (current.visit?.siteId !== message.siteId || visitPhase(current.visit, now) !== 'ready') throw new Error('This visit is not ready, or its start window has expired.');
      await commit(current, { ...current, visit: { status: 'active', siteId: message.siteId, domain, startsAt: now, expiresAt: now + current.visit.durationMinutes * 60000 } });
    }
    await reconcile({ forceSweep: true });
    return { domain };
  }
  throw new Error('Unknown command.');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  enqueue(() => handle(message, sender)).then(data => sendResponse({ ok: true, data })).catch(error => sendResponse({ ok: false, error: error.message || 'The action could not be completed.' }));
  return true;
});

function refresh(options = {}) { enqueue(() => reconcile(options)).catch(reportFailure); }
chrome.alarms.onAlarm.addListener(() => refresh({ forceSweep: true }));
chrome.runtime.onStartup.addListener(() => refresh({ forceSweep: true }));
chrome.runtime.onInstalled.addListener(() => refresh({ forceSweep: true }));
chrome.permissions.onAdded.addListener(() => refresh({ forceSweep: true }));
chrome.permissions.onRemoved.addListener(() => refresh({ forceSweep: true }));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.state || (changes.transaction && !changes.transaction.newValue))) refresh({ forceSweep: true });
});
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (change.url || change.status) refresh({ tab });
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  enqueue(async () => reconcile({ tab: await chrome.tabs.get(tabId).catch(() => null) })).catch(reportFailure);
});
chrome.windows.onFocusChanged.addListener(id => { if (id !== chrome.windows.WINDOW_ID_NONE) refresh({ forceSweep: true }); });

enqueue(async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  if (!INCOGNITO) {
    const { transaction } = await chrome.storage.local.get('transaction');
    if (transaction) {
      await install(transaction.previous, Date.now(), await grants(transaction.previous.settings));
      await chrome.storage.local.set({ state: transaction.previous });
      await chrome.storage.local.remove('transaction');
    }
  }
  await reconcile({ forceSweep: true });
}).catch(reportFailure);
