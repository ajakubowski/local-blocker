let sequence = 0;
const clone = value => structuredClone(value);
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
export async function workerHarness({ incognito = false, initial = {} } = {}) {
  const local = clone(initial), session = {}, alarms = new Map();
  const engine = { dynamic: [], session: [], failNext: false, redirects: [] };
  const storage = data => ({
    async get(keys) { if (typeof keys === 'string') return { [keys]: clone(data[keys]) }; return clone(data); },
    async set(values) { Object.assign(data, clone(values)); },
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k]; },
    async setAccessLevel() {}
  });
  const chrome = {
    runtime: { id: 'test', getURL: path => `chrome-extension://test/${path}`, onMessage: event(), onStartup: event(), onInstalled: event() },
    extension: { inIncognitoContext: incognito, async isAllowedIncognitoAccess() { return true; } },
    storage: { local: storage(local), session: storage(session), onChanged: event() },
    permissions: { async contains() { return true; }, onAdded: event(), onRemoved: event() },
    declarativeNetRequest: {
      async getDynamicRules() { return clone(engine.dynamic); }, async getSessionRules() { return clone(engine.session); },
      async updateDynamicRules({ removeRuleIds, addRules }) { if (engine.failNext) { engine.failNext = false; throw new Error('Simulated rule failure'); } engine.dynamic = [...engine.dynamic.filter(r => !removeRuleIds.includes(r.id)), ...clone(addRules)]; },
      async updateSessionRules({ removeRuleIds, addRules }) { engine.session = [...engine.session.filter(r => !removeRuleIds.includes(r.id)), ...clone(addRules)]; }
    },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
    alarms: { async get(name) { return alarms.get(name); }, async create(name, spec) { alarms.set(name, { ...spec, scheduledTime: spec.when }); }, async clear(name) { alarms.delete(name); }, onAlarm: event() },
    tabs: { async query() { return []; }, async update(id, options) { engine.redirects.push({ id, ...options }); }, async get() { return null; }, async create() {}, onUpdated: event(), onActivated: event() },
    windows: { async create() {}, onFocusChanged: event(), WINDOW_ID_NONE: -1 }
  };
  globalThis.chrome = chrome;
  await import(`../extension/background.js?case=${sequence++}`);
  const sender = { id: 'test', url: 'chrome-extension://test/options.html', documentId: 'doc-one', frameId: 0, tab: { id: 1, incognito } };
  const call = (type, data = {}, source = sender) => new Promise(resolve => chrome.runtime.onMessage.listeners[0]({ type, ...data }, source, resolve));
  await call('status');
  const unlock = async () => {
    if (!local.state?.verifier) await call('setup', { password: 'test password' });
    const result = await call('unlock', { password: 'test password' });
    return result.data?.token;
  };
  return { local, session, alarms, engine, chrome, call, unlock, sender };
}
