import { test, expect } from '@playwright/test';
import { launch, initialize, propose, rpc, siteServer } from './helpers.js';

test('real-clock acceptance: ten-minute wait, explicit five-minute visit, automatic reblock', async () => {
  test.skip(process.env.RUN_REALTIME !== '1', 'Opt-in 15-minute acceptance test; no clock or stored deadline changes.');
  test.setTimeout(17 * 60000);
  const h = await launch(); const server = await siteServer();
  try {
    await initialize(h.page); await propose(h.page);
    const target = await h.context.newPage(); await target.goto(server.url());
    await expect(target).toHaveURL(/blocked\.html#/);
    await target.getByRole('button', { name: 'Begin 10-minute wait' }).click();
    const visit = (await rpc(h.page, 'status')).data.visit;
    expect(visit.readyAt - visit.requestedAt).toBe(600000);
    expect((await rpc(h.page, 'startVisit', { siteId: visit.siteId })).ok).toBe(false);
    await h.page.close(); await target.close();
    while (Date.now() < visit.readyAt) {
      await new Promise(resolve => setTimeout(resolve, Math.min(30000, visit.readyAt - Date.now())));
      console.log(`Real-clock wait: ${Math.max(0, Math.ceil((visit.readyAt - Date.now()) / 1000))} seconds remaining`);
    }
    const controls = await h.context.newPage(); await controls.goto(`${h.base}blocked.html#${visit.siteId}`);
    await expect(controls.getByRole('button', { name: 'Start 5-minute visit' })).toBeVisible();
    // Initiate the same worker command as the button, then visit the local server
    // instead of its HTTPS homepage. The wait and visit deadlines are untouched.
    expect((await rpc(controls, 'startVisit', { siteId: visit.siteId })).ok).toBe(true);
    const active = (await rpc(controls, 'status')).data.visit;
    expect(active.expiresAt - active.startsAt).toBe(300000);
    const website = await h.context.newPage(); await website.goto(server.url());
    await expect(website.getByRole('heading')).toHaveText('Website content');
    await controls.close();
    while (Date.now() < active.expiresAt) {
      await new Promise(resolve => setTimeout(resolve, Math.min(30000, active.expiresAt - Date.now())));
      console.log(`Real-clock visit: ${Math.max(0, Math.ceil((active.expiresAt - Date.now()) / 1000))} seconds remaining`);
    }
    await expect(website).toHaveURL(/blocked\.html#/, { timeout: 45000 });
    expect((await rpc(website, 'status')).data.visit).toBeNull();
  } finally { await h.context.close(); await server.close(); }
});
