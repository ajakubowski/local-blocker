export const WEEK = 7 * 24 * 60;
export const DEFAULT_SETTINGS = Object.freeze({ cooldownMinutes: 10, visitMinutes: 5, groups: [] });
const MAX_DOMAINS = 500;

export function normalizeDomain(input) {
  const value = String(input).trim();
  if (!value || /[\s*]/u.test(value)) throw new Error('Enter a domain or a full http(s) URL, without spaces or wildcards.');
  let url;
  try { url = new URL(value.includes('://') ? value : `https://${value}`); }
  catch { throw new Error('That website address is not valid.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an http(s) website address without a username or password.');
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (host.length > 253 || !host.includes('.') || host.split('.').some(p => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p)) || /^\d+(?:\.\d+){3}$/.test(host)) {
    throw new Error('Use a website domain, such as x.com. IP addresses and local hostnames are not supported.');
  }
  return host;
}

export function domainMatches(host, domain) {
  const normalized = host.toLowerCase().replace(/\.+$/, '');
  return normalized === domain || normalized.endsWith(`.${domain}`);
}

export function domainPatterns(domain) { return [`http://*.${domain}/*`, `https://*.${domain}/*`]; }
export function allDomains(settings) { return [...new Set(settings.groups.flatMap(g => g.domains))].sort(); }

export function validateSettings(raw) {
  if (!raw || !Array.isArray(raw.groups) || raw.groups.length > 100) throw new Error('Use at most 100 groups.');
  const integer = (v, min, max, name) => {
    if (!Number.isSafeInteger(v) || v < min || v > max) throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
    return v;
  };
  const ids = new Set();
  const groups = raw.groups.map(g => {
    if (!g || typeof g.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(g.id) || ids.has(g.id)) throw new Error('Every group needs a unique ID.');
    ids.add(g.id);
    if (typeof g.name !== 'string' || !g.name.trim() || g.name.length > 80) throw new Error('Group names must be 1–80 characters.');
    if (!['always', 'scheduled'].includes(g.mode)) throw new Error('Choose always blocked or a weekly schedule.');
    if (typeof g.allowTemporaryVisits !== 'boolean') throw new Error('Choose whether temporary visits are allowed.');
    if (!Array.isArray(g.domains) || !g.domains.length || g.domains.length > MAX_DOMAINS) throw new Error('Add at least one website to each group.');
    if (!Array.isArray(g.windows) || g.windows.length > 64) throw new Error('Use at most 64 time windows per group.');
    const windows = g.windows.map(w => {
      if (!w || !Array.isArray(w.days) || !w.days.length) throw new Error('Choose at least one day for each time window.');
      const days = [...new Set(w.days.map(d => integer(d, 0, 6, 'Weekday'))) ].sort();
      const start = integer(w.start, 0, 1439, 'Start time');
      const end = integer(w.end, 0, 1439, 'End time');
      if (start === end) throw new Error('Start and end times must differ. Use always blocked for a full week.');
      return { days, start, end };
    });
    if (g.mode === 'scheduled' && !windows.length) throw new Error('Scheduled groups need at least one time window.');
    return { id: g.id, name: g.name.trim(), domains: [...new Set(g.domains.map(normalizeDomain))].sort(), mode: g.mode, windows, allowTemporaryVisits: g.allowTemporaryVisits };
  });
  const result = { cooldownMinutes: integer(raw.cooldownMinutes, 5, 525600, 'Cooldown'), visitMinutes: integer(raw.visitMinutes, 1, 1440, 'Visit duration'), groups };
  if (allDomains(result).length > MAX_DOMAINS) throw new Error(`Use at most ${MAX_DOMAINS} different websites.`);
  return result;
}

export function minuteOfWeek(now) {
  const d = new Date(now);
  return d.getDay() * 1440 + d.getHours() * 60 + d.getMinutes();
}

export function groupMask(group) {
  const mask = new Uint8Array(WEEK);
  if (group.mode === 'always') { mask.fill(1); return mask; }
  for (const w of group.windows) for (const day of w.days) {
    const length = (w.end - w.start + 1440) % 1440;
    for (let n = 0; n < length; n++) mask[(day * 1440 + w.start + n) % WEEK] = 1;
  }
  return mask;
}

export function groupActive(group, now) {
  if (group.mode === 'always') return true;
  const minute = minuteOfWeek(now);
  return group.windows.some(w => w.days.some(day => {
    const offset = (minute - (day * 1440 + w.start) + WEEK) % WEEK;
    return offset < (w.end - w.start + 1440) % 1440;
  }));
}

export function matchingGroups(settings, host, now) {
  return settings.groups.filter(g => groupActive(g, now) && g.domains.some(d => domainMatches(host, d)));
}

export function decision(settings, host, now, visit = null) {
  const groups = matchingGroups(settings, host, now);
  const canVisit = groups.length > 0 && groups.every(g => g.allowTemporaryVisits);
  const visiting = canVisit && visit?.status === 'active' && now >= visit.startsAt && now < visit.expiresAt && domainMatches(host, visit.domain);
  return { blocked: groups.length > 0 && !visiting, groups, canVisit, visiting };
}

// Compare the entire recurring week, including rules inherited from parent domains.
export function weakens(before, after) {
  if (after.cooldownMinutes < before.cooldownMinutes || after.visitMinutes > before.visitMinutes) return true;
  const oldGroups = before.groups.map(g => ({ ...g, mask: groupMask(g) }));
  const newGroups = after.groups.map(g => ({ ...g, mask: groupMask(g) }));
  for (const domain of new Set([...allDomains(before), ...allDomains(after)])) {
    const old = oldGroups.filter(g => g.domains.some(d => domainMatches(domain, d)));
    const next = newGroups.filter(g => g.domains.some(d => domainMatches(domain, d)));
    if (!old.length) continue;
    for (let minute = 0; minute < WEEK; minute++) {
      const blocked = old.some(g => g.mask[minute]);
      const strict = old.some(g => g.mask[minute] && !g.allowTemporaryVisits);
      if ((blocked && !next.some(g => g.mask[minute])) || (strict && !next.some(g => g.mask[minute] && !g.allowTemporaryVisits))) return true;
    }
  }
  return false;
}

// Walk real minutes, so skipped/repeated DST wall-clock times are handled naturally.
export function nextChange(settings, now, host = null) {
  const groups = settings.groups.filter(g => !host || g.domains.some(d => domainMatches(host, d)));
  if (!groups.length) return null;
  let masks = groups.map(groupMask);
  if (host) {
    const union = new Uint8Array(WEEK);
    for (const m of masks) for (let i = 0; i < WEEK; i++) union[i] |= m[i];
    masks = [union];
  }
  masks = masks.filter(m => m.some(v => v !== m[0]));
  if (!masks.length) return null;
  const current = masks.map(m => m[minuteOfWeek(now)]);
  const first = Math.floor(now / 60000) * 60000 + 60000;
  for (let time = first; time <= now + 8 * 86400000; time += 60000) {
    const minute = minuteOfWeek(time);
    if (masks.some((m, i) => m[minute] !== current[i])) return time;
  }
  return null;
}

export function freshState() {
  return { version: 1, revision: 0, settings: structuredClone(DEFAULT_SETTINGS), sites: {}, verifier: null, pending: null, visit: null };
}

export function assignSites(settings, previous = {}, makeId = () => crypto.randomUUID()) {
  const byDomain = new Map(Object.entries(previous).map(([id, domain]) => [domain, id]));
  return Object.fromEntries(allDomains(settings).map(domain => [byDomain.get(domain) || makeId(), domain]));
}

export function visitPhase(visit, now) {
  if (!visit) return 'none';
  if (visit.status === 'active') return now < visit.expiresAt ? 'active' : 'expired';
  if (now < visit.readyAt) return 'waiting';
  return now < visit.claimBy ? 'ready' : 'expired';
}

export function buildRules(state, now, granted, baseUrl) {
  const dynamic = [];
  const sites = Object.entries(state.sites).sort((a, b) => a[1].localeCompare(b[1]));
  sites.forEach(([id, domain], index) => {
    const groups = matchingGroups(state.settings, domain, now);
    if (!groups.length) return;
    const strict = groups.some(g => !g.allowTemporaryVisits);
    const priority = strict ? 40 : 10;
    const condition = { requestDomains: [domain], resourceTypes: ['main_frame', 'sub_frame'] };
    dynamic.push({ id: index * 2 + 1, priority, action: { type: 'block' }, condition });
    if (granted.has(domain)) {
      dynamic.push({ id: index * 2 + 2, priority: priority + 1, action: { type: 'redirect', redirect: { url: `${baseUrl}blocked.html#${id}` } }, condition: { ...condition, resourceTypes: ['main_frame'] } });
    }
  });
  const visit = state.visit;
  const session = visitPhase(visit, now) === 'active' && decision(state.settings, visit.domain, now).canVisit
    ? [{ id: 1, priority: 30, action: { type: 'allow' }, condition: { requestDomains: [visit.domain], resourceTypes: ['main_frame', 'sub_frame'] } }]
    : [];
  return { dynamic, session };
}
