import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { launch, initialize, propose, rpc, editState, siteServer, settings, social, PASSWORD } from './helpers.js';

async function unlockUI(page) {
  await page.locator('#unlock-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export saved settings' })).toBeEnabled();
}

test('settings export and import round trip through the UI without exposing password or bypassing cooldown', async () => {
  const h = await launch();
  try {
    await initialize(h.page); await propose(h.page); await unlockUI(h.page);
    const download = h.page.waitForEvent('download');
    await h.page.getByRole('button', { name: 'Export saved settings' }).click();
    const backup = JSON.parse(await readFile(await (await download).path(), 'utf8'));
    expect(backup.settings).toEqual(settings);
    expect(Object.keys(backup)).toEqual(['format', 'version', 'settings']);
    expect(JSON.stringify(backup)).not.toContain(PASSWORD);
    await h.page.getByLabel('Import settings backup').setInputFiles({ name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...backup, settings: { ...settings, groups: [] } })) });
    await expect(h.page.locator('#notice')).toContainText('unsaved edits');
    expect((await rpc(h.page, 'status')).data.settings.groups).toHaveLength(1);
    await h.page.getByRole('button', { name: 'Review changes' }).click();
    await expect(h.page.getByRole('dialog')).toContainText('No websites blocked');
    await h.page.getByRole('button', { name: 'Start settings cooldown' }).click();
    await expect(h.page.getByRole('dialog')).not.toBeVisible();
    const status = (await rpc(h.page, 'status')).data;
    expect(status.settings.groups).toHaveLength(1);
    expect(status.pending.readyAt - status.pending.requestedAt).toBe(600000);
    await h.page.getByLabel('Import settings backup').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"something-else"}') });
    await expect(h.page.locator('#notice')).toContainText('not a supported');
    expect((await rpc(h.page, 'status')).data.pending.id).toBe(status.pending.id);
  } finally { await h.context.close(); }
});

test('ready proposals require a fresh password and can be confirmed directly from a locked settings page', async () => {
  const h = await launch();
  try {
    await initialize(h.page); await propose(h.page);
    const proposal = await propose(h.page, { ...settings, groups: [] });
    await editState(h.worker, { pending: { readyAt: Date.now() - 1 } });
    const status = (await rpc(h.page, 'status')).data;
    expect((await rpc(h.page, 'confirm', { token: proposal.token, pendingId: status.pending.id })).ok).toBe(false);
    await h.page.getByLabel('Password to confirm this change').fill('wrong');
    await h.page.getByRole('button', { name: 'Confirm pending change' }).click();
    await expect(h.page.locator('#notice')).toContainText('incorrect');
    await h.page.getByLabel('Password to confirm this change').fill(PASSWORD);
    await h.page.getByRole('button', { name: 'Confirm pending change' }).click();
    await expect(h.page.locator('#pending-panel')).not.toBeVisible();
    expect((await rpc(h.page, 'status')).data.settings.groups).toHaveLength(0);
  } finally { await h.context.close(); }
});

test('a parent visit leaves strict subdomains and other websites blocked in the real network engine', async () => {
  const h = await launch(); const server = await siteServer();
  try {
    await initialize(h.page);
    await propose(h.page, { ...settings, groups: [social, { ...social, id: 'strict', domains: ['strict.social.blocker.test'], allowTemporaryVisits: false }, { ...social, id: 'other', domains: ['other.blocker.test'] }] });
    const status = (await rpc(h.page, 'status')).data;
    const siteId = status.sites.find(s => s.domain === social.domains[0]).id;
    await rpc(h.page, 'requestVisit', { siteId });
    await editState(h.worker, { visit: { readyAt: Date.now() - 1 } });
    expect((await rpc(h.page, 'startVisit', { siteId })).ok).toBe(true);
    for (const host of ['social.blocker.test', 'a.social.blocker.test']) {
      const page = await h.context.newPage(); await page.goto(server.url(host));
      await expect(page.getByRole('heading')).toHaveText('Website content');
    }
    for (const host of ['strict.social.blocker.test', 'child.strict.social.blocker.test', 'other.blocker.test']) {
      const page = await h.context.newPage(); await page.goto(server.url(host));
      await expect(page).toHaveURL(/blocked\.html#/);
    }
    expect(server.hits.some(hit => /strict|other/.test(hit))).toBe(false);
  } finally { await h.context.close(); await server.close(); }
});

test('subframes are blocked and canceling an active visit reblocks an open tab', async () => {
  const h = await launch(); const server = await siteServer();
  try {
    await initialize(h.page); await propose(h.page);
    const parent = await h.context.newPage(); await parent.goto(server.url('unblocked.blocker.test'));
    const failure = parent.waitForEvent('requestfailed', r => r.url().includes('/embedded'));
    await parent.evaluate(url => { const frame = document.createElement('iframe'); frame.src = url; document.body.append(frame); }, server.url('social.blocker.test', '/embedded'));
    expect((await failure).failure().errorText).toContain('ERR_BLOCKED_BY_CLIENT');
    const siteId = (await rpc(h.page, 'status')).data.sites[0].id;
    await rpc(h.page, 'requestVisit', { siteId }); await editState(h.worker, { visit: { readyAt: Date.now() - 1 } });
    await rpc(h.page, 'startVisit', { siteId });
    const target = await h.context.newPage(); await target.goto(server.url());
    await rpc(h.page, 'cancelVisit', { siteId });
    await expect(target).toHaveURL(/blocked\.html#/);
    expect(server.hits.some(hit => hit.includes('/embedded'))).toBe(false);
  } finally { await h.context.close(); await server.close(); }
});

test('zero external requests during local visit, blocked-page, popup, and settings flows; CSP rejects connections', async () => {
  const h = await launch(); const requests = [];
  h.context.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  try {
    await initialize(h.page); await propose(h.page);
    const siteId = (await rpc(h.page, 'status')).data.sites[0].id;
    const blocked = await h.context.newPage(); await blocked.goto(`${h.base}blocked.html#${siteId}`);
    const popup = await h.context.newPage(); await popup.goto(`${h.base}popup.html`);
    await blocked.getByRole('button', { name: 'Begin 10-minute wait' }).click();
    await editState(h.worker, { visit: { readyAt: Date.now() - 1 } });
    await rpc(h.page, 'startVisit', { siteId });
    await rpc(h.page, 'cancelVisit', { siteId });
    await propose(h.page, { ...settings, cooldownMinutes: 15 });
    await expect(popup.locator('#site-list')).toContainText('social.blocker.test');
    expect(requests).toEqual([]);
    const result = await h.page.evaluate(async () => {
      const violation = new Promise(resolve => document.addEventListener('securitypolicyviolation', e => resolve(e.effectiveDirective), { once: true }));
      const rejected = await fetch('https://privacy-audit.invalid/').then(() => false, () => true);
      return { rejected, directive: await violation };
    });
    expect(result).toEqual({ rejected: true, directive: 'connect-src' });
  } finally { await h.context.close(); }
});

test('expired visit is revoked after a full browser restart', async () => {
  let h = await launch(); const server = await siteServer();
  try {
    await initialize(h.page); await propose(h.page);
    const siteId = (await rpc(h.page, 'status')).data.sites[0].id;
    await rpc(h.page, 'requestVisit', { siteId }); await editState(h.worker, { visit: { readyAt: Date.now() - 1 } });
    await rpc(h.page, 'startVisit', { siteId });
    await editState(h.worker, { visit: { expiresAt: Date.now() + 2000 } });
    await h.context.close();
    await new Promise(resolve => setTimeout(resolve, 2200));
    h = await launch({ directory: h.root, extensionPath: h.extension });
    expect((await rpc(h.page, 'status')).data.visit).toBeNull();
    const target = await h.context.newPage(); await target.goto(server.url());
    await expect(target).toHaveURL(/blocked\.html#/);
  } finally { await h.context.close(); await server.close(); }
});

test('fully qualified trailing-dot hostnames cannot bypass domain blocks', async () => {
  const h = await launch({ extraArgs: ['--host-resolver-rules=MAP *.blocker.test 127.0.0.1, MAP *.blocker.test. 127.0.0.1'] });
  const server = await siteServer();
  try {
    await initialize(h.page); await propose(h.page);
    for (const host of ['social.blocker.test.', 'a.social.blocker.test.']) {
      const target = await h.context.newPage();
      const result = await target.goto(server.url(host)).catch(error => error.message);
      if (!target.url().includes('blocked.html#')) expect(String(result)).toContain('ERR_BLOCKED_BY_CLIENT');
    }
    expect(server.hits.length).toBe(0);
  } finally { await h.context.close(); await server.close(); }
});
