import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { launch, initialize, propose, rpc, editState, siteServer, settings, social, PASSWORD } from './helpers.js';

test('onboarding, editing, and review work through the real UI without external requests', async () => {
  const h = await launch();
  const external = []; const errors = [];
  h.context.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  h.page.on('pageerror', error => errors.push(error.message));
  try {
    await h.page.getByLabel('New password', { exact: true }).first().fill(PASSWORD);
    await h.page.getByLabel('Confirm password').fill(PASSWORD);
    await h.page.getByRole('button', { name: 'Create password & get started' }).click();
    await expect(h.page.getByRole('button', { name: '+ Add group' })).toBeEnabled();
    await h.page.getByRole('button', { name: '+ Add group' }).click();
    await h.page.getByLabel('Group name').fill('Social');
    await h.page.getByLabel('Websites —').fill('social.blocker.test');
    await h.page.getByRole('button', { name: 'Review changes' }).click();
    await expect(h.page.getByRole('dialog')).toContainText('social.blocker.test');
    await h.page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(h.page.getByRole('dialog')).not.toBeVisible();
    await expect(h.page.locator('#group-count')).toHaveText('1');
    await h.page.getByRole('button', { name: 'Lock settings' }).click();
    await expect(h.page.getByLabel('Group name')).toBeDisabled();
    await h.page.locator('#unlock-password').fill('incorrect');
    await h.page.getByRole('button', { name: 'Unlock settings' }).click();
    await expect(h.page.locator('#notice')).toContainText('incorrect');
    expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await h.context.close(); }
});

test('blocks existing tabs and new domain/subdomain navigation while preserving lookalikes', async () => {
  const h = await launch(); const server = await siteServer();
  try {
    await initialize(h.page);
    const target = await h.context.newPage(); await target.goto(server.url());
    await expect(target.getByRole('heading')).toHaveText('Website content');
    await propose(h.page);
    await expect(target).toHaveURL(/blocked\.html#/);
    await expect(target.locator('#domain')).toHaveText('social.blocker.test');
    await expect(target.getByRole('button', { name: 'Begin 10-minute wait' })).toBeVisible();
    const sub = await h.context.newPage(); await sub.goto(server.url('a.social.blocker.test', '/private?secret=never-store'));
    await expect(sub).toHaveURL(/blocked\.html#/);
    expect(sub.url()).not.toContain('secret');
    const unrelated = await h.context.newPage(); await unrelated.goto(server.url('notsocial.blocker.test'));
    await expect(unrelated.getByRole('heading')).toHaveText('Website content');
    expect(server.hits.some(hit => hit.includes('a.social.blocker.test'))).toBe(false);
  } finally { await h.context.close(); await server.close(); }
});

test('without host access native blocking still works and settings explain the limitation', async () => {
  const h = await launch({ permissions: false }); const server = await siteServer();
  try {
    await initialize(h.page); await propose(h.page);
    await expect(h.page.locator('#permission-panel')).toBeVisible();
    const target = await h.context.newPage();
    const navigation = await target.goto(server.url()).catch(error => error.message);
    expect(String(navigation)).toContain('ERR_BLOCKED_BY_CLIENT');
    expect(server.hits.length).toBe(0);
  } finally { await h.context.close(); await server.close(); }
});

test('a visit requires waiting, explicitly starts, and reblocks open tabs on expiry', async () => {
  const h = await launch(); const server = await siteServer();
  try {
    await initialize(h.page); await propose(h.page);
    const target = await h.context.newPage(); await target.goto(server.url());
    await target.getByRole('button', { name: 'Begin 10-minute wait' }).click();
    await expect(target.locator('#visit-panel')).toContainText('Your wait keeps going');
    const status = (await rpc(h.page, 'status')).data; const siteId = status.visit.siteId;
    expect((await rpc(h.page, 'startVisit', { siteId })).ok).toBe(false);
    expect((await rpc(h.page, 'requestVisit', { siteId })).ok).toBe(false);
    await editState(h.worker, { visit: { readyAt: Date.now() - 1000, claimBy: Date.now() + 300000 } });
    await expect(target.getByRole('button', { name: 'Start 5-minute visit' })).toBeVisible();
    expect((await rpc(h.page, 'startVisit', { siteId })).ok).toBe(true);
    await target.goto(server.url()); await expect(target.getByRole('heading')).toHaveText('Website content');
    await editState(h.worker, { visit: { expiresAt: Date.now() - 1 } });
    await expect(target).toHaveURL(/blocked\.html#/);
    expect((await h.worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length).toBe(0);
  } finally { await h.context.close(); await server.close(); }
});

test('pending changes remain inert until an authenticated confirmation and reject stale auth', async () => {
  const h = await launch();
  try {
    await initialize(h.page); await propose(h.page);
    const result = await propose(h.page, { ...settings, cooldownMinutes: 5, groups: [] });
    expect(result.outcome).toBe('pending');
    let status = (await rpc(h.page, 'status')).data;
    expect(status.settings.groups.length).toBe(1);
    expect(status.pending.readyAt - status.pending.requestedAt).toBe(600000);
    expect((await rpc(h.page, 'confirm', { token: result.token, pendingId: status.pending.id })).ok).toBe(false);
    await editState(h.worker, { pending: { readyAt: Date.now() - 1 } });
    await h.worker.evaluate(async () => { const { auth } = await chrome.storage.session.get('auth'); auth.expiresAt = Date.now() - 1; await chrome.storage.session.set({ auth }); });
    expect((await rpc(h.page, 'confirm', { token: result.token, pendingId: status.pending.id })).ok).toBe(false);
    status = (await rpc(h.page, 'status')).data; expect(status.settings.groups.length).toBe(1);
    const auth = await rpc(h.page, 'unlock', { password: PASSWORD });
    expect((await rpc(h.page, 'confirm', { token: auth.data.token, pendingId: status.pending.id })).ok).toBe(true);
    expect((await h.worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).length).toBe(0);
  } finally { await h.context.close(); }
});

test('restart and service-worker suspension preserve waits and clear authentication', async () => {
  let h = await launch();
  try {
    await initialize(h.page); await propose(h.page);
    const status = (await rpc(h.page, 'status')).data; const siteId = status.sites[0].id;
    await rpc(h.page, 'requestVisit', { siteId });
    const readyAt = (await rpc(h.page, 'status')).data.visit.readyAt;
    const cdp = await h.context.newCDPSession(h.page); await cdp.send('ServiceWorker.enable'); await cdp.send('ServiceWorker.stopAllWorkers');
    expect((await rpc(h.page, 'status')).data.visit.readyAt).toBe(readyAt);
    await h.context.close();
    h = await launch({ directory: h.root, extensionPath: h.extension });
    const restored = (await rpc(h.page, 'status')).data;
    expect(restored.visit.readyAt).toBe(readyAt); expect(restored.authenticatedUntil).toBe(0);
    expect(await h.page.evaluate(() => chrome.alarms.get('reconcile'))).toBeTruthy();
    await expect(h.page.locator('#unlock-panel')).toBeVisible();
  } finally { await h.context.close(); }
});

test('permission revocation retains fallback blocking and shows degraded coverage', async () => {
  const h = await launch(); const server = await siteServer();
  try {
    await initialize(h.page); await propose(h.page);
    const manager = await h.context.newPage(); await manager.goto('chrome://extensions/');
    await manager.evaluate(async id => {
      await chrome.developerPrivate.updateExtensionConfiguration({ extensionId: id, hostAccess: 'ON_SPECIFIC_SITES' });
      await chrome.developerPrivate.addHostPermission(id, 'http://*.social.blocker.test/*');
      await chrome.developerPrivate.addHostPermission(id, 'https://*.social.blocker.test/*');
    }, h.id);
    if (h.page.isClosed()) { h.page = await h.context.newPage(); await h.page.goto(`${h.base}options.html`); }
    expect((await rpc(h.page, 'status')).data.sites[0].hasAccess).toBe(true);
    await manager.evaluate(async id => {
      await chrome.developerPrivate.removeHostPermission(id, 'http://*.social.blocker.test/*');
      await chrome.developerPrivate.removeHostPermission(id, 'https://*.social.blocker.test/*');
    }, h.id);
    const status = (await rpc(h.page, 'status')).data;
    expect(status.sites[0].hasAccess).toBe(false);
    const rules = await h.page.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
    expect(rules.every(r => r.action.type === 'block')).toBe(true);
    const target = await h.context.newPage(); await expect(target.goto(server.url())).rejects.toThrow('ERR_BLOCKED_BY_CLIENT');
  } finally { await h.context.close(); await server.close(); }
});

test('cached service-worker navigation and back navigation are replaced', async () => {
  const server = await siteServer();
  const h = await launch({ extraArgs: [`--unsafely-treat-insecure-origin-as-secure=${new URL(server.url()).origin}`] });
  try {
    await initialize(h.page);
    const target = await h.context.newPage(); await target.goto(server.url());
    await target.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
    await target.goto(server.url('social.blocker.test', '/cached'));
    await expect(target.getByRole('heading')).toHaveText('Offline cached website');
    await propose(h.page); await expect(target).toHaveURL(/blocked\.html#/);
    await target.goBack().catch(() => {}); await expect(target).toHaveURL(/blocked\.html#/);
    const cached = await h.context.newPage(); await cached.goto(server.url('social.blocker.test', '/offline')).catch(() => {});
    await expect(cached).toHaveURL(/blocked\.html#/);
  } finally { await h.context.close(); await server.close(); }
});

test('split incognito blocks, shares visits, and reblocks when a regular-window visit expires', async () => {
  const h = await launch(); const server = await siteServer();
  try {
    await initialize(h.page); await propose(h.page);
    const manager = await h.context.newPage(); await manager.goto('chrome://extensions/');
    await manager.evaluate(id => chrome.developerPrivate.updateExtensionConfiguration({ extensionId: id, incognitoAccess: true }), h.id);
    h.page = await h.context.newPage();
    await expect.poll(async () => {
      try { await h.page.goto(`${h.base}options.html`); return true; } catch { return false; }
    }).toBe(true);
    const browserSession = await h.context.browser().newBrowserCDPSession();
    const before = new Set((await browserSession.send('Target.getTargets')).targetInfos.map(t => t.targetId));
    await h.page.evaluate(url => chrome.windows.create({ url, incognito: true }), server.url());
    let privateTarget;
    await expect.poll(async () => {
      privateTarget = (await browserSession.send('Target.getTargets')).targetInfos.find(t => !before.has(t.targetId) && t.type === 'page' && t.url.includes('blocked.html#'));
      return !!privateTarget;
    }).toBe(true);
    const siteId = (await rpc(h.page, 'status')).data.sites[0].id;
    await rpc(h.page, 'requestVisit', { siteId });
    await editState(h.page, { visit: { readyAt: Date.now() - 1000, claimBy: Date.now() + 300000 } });
    expect((await rpc(h.page, 'startVisit', { siteId })).ok).toBe(true);
    await h.page.evaluate(url => chrome.windows.create({ url, incognito: true }), server.url('social.blocker.test', '/visit'));
    let allowed;
    await expect.poll(async () => {
      allowed = (await browserSession.send('Target.getTargets')).targetInfos.find(t => t.type === 'page' && t.url === server.url('social.blocker.test', '/visit'));
      return !!allowed;
    }).toBe(true);
    await editState(h.page, { visit: { expiresAt: Date.now() - 1 } });
    await expect.poll(async () => (await browserSession.send('Target.getTargets')).targetInfos.find(t => t.targetId === allowed.targetId)?.url).toContain('blocked.html#');
  } finally { await h.context.close(); await server.close(); }
});

test('a real schedule boundary blocks an already-open tab with the settings page closed', async () => {
  test.setTimeout(100000);
  const h = await launch(); const server = await siteServer();
  try {
    await initialize(h.page);
    const window = await h.page.evaluate(() => {
      const start = new Date(Math.floor(Date.now() / 60000) * 60000 + 60000);
      const minute = start.getHours() * 60 + start.getMinutes();
      return { days: [start.getDay()], start: minute, end: (minute + 10) % 1440 };
    });
    const target = await h.context.newPage(); await target.goto(server.url());
    await propose(h.page, { ...settings, groups: [{ ...social, mode: 'scheduled', windows: [window] }] });
    await h.page.close();
    await expect(target).toHaveURL(/blocked\.html#/, { timeout: 90000 });
  } finally { await h.context.close(); await server.close(); }
});

test('extension reload preserves policy and pending deadlines while clearing authentication', async () => {
  const h = await launch();
  try {
    await initialize(h.page); await propose(h.page);
    await propose(h.page, { ...settings, groups: [] });
    const before = (await rpc(h.page, 'status')).data;
    const manager = await h.context.newPage(); await manager.goto('chrome://extensions/');
    await manager.evaluate(id => chrome.developerPrivate.reload(id, { failQuietly: true }), h.id);
    h.page = await h.context.newPage();
    await expect.poll(async () => { try { await h.page.goto(`${h.base}options.html`); return true; } catch { return false; } }).toBe(true);
    const after = (await rpc(h.page, 'status')).data;
    expect(after.settings).toEqual(before.settings);
    expect(after.pending.readyAt).toBe(before.pending.readyAt);
    expect(after.authenticatedUntil).toBe(0);
    expect((await h.page.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).length).toBeGreaterThan(0);
  } finally { await h.context.close(); }
});

test('renders release screenshots and a narrow keyboard-accessible settings layout', async () => {
  const h = await launch();
  try {
    await initialize(h.page);
    await propose(h.page, { ...settings, groups: [{ ...social, domains: ['x.com', 'twitter.com'] }, { ...social, id: 'news', name: 'News & rabbit holes', domains: ['reddit.com'], mode: 'scheduled', windows: [{ days: [1, 2, 3, 4, 5], start: 540, end: 1020 }] }] });
    await h.page.locator('#unlock-password').fill(PASSWORD); await h.page.getByRole('button', { name: 'Unlock settings' }).click();
    await expect(h.page.getByLabel('Group name').first()).toBeEnabled();
    await h.page.locator('#notice').evaluate(element => { element.hidden = true; });
    await mkdir('docs/screenshots', { recursive: true });
    await h.page.screenshot({ path: 'docs/screenshots/settings.png', fullPage: true, style: '.save-bar { position: static; } .sidebar { position: static; height: 100%; }' });
    const status = (await rpc(h.page, 'status')).data; const site = status.sites.find(s => s.domain === 'x.com');
    const blocked = await h.context.newPage(); await blocked.goto(`${h.base}blocked.html#${site.id}`);
    await expect(blocked.getByRole('button', { name: 'Begin 10-minute wait' })).toBeVisible();
    await blocked.screenshot({ path: 'docs/screenshots/blocked.png', fullPage: true });
    const popup = await h.context.newPage(); await popup.setViewportSize({ width: 380, height: 800 }); await popup.goto(`${h.base}popup.html`);
    await expect(popup.locator('#site-list')).toContainText('x.com'); await popup.locator('body').screenshot({ path: 'docs/screenshots/popup.png' });
    await h.page.setViewportSize({ width: 480, height: 900 });
    expect(await h.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await h.page.getByRole('button', { name: '+ Add group' }).focus();
    await expect(h.page.getByRole('button', { name: '+ Add group' })).toBeFocused();
    expect(await h.page.locator('input:not([type=checkbox]), textarea, select').evaluateAll(elements => elements.every(e => e.labels?.length > 0))).toBe(true);
  } finally { await h.context.close(); }
});
