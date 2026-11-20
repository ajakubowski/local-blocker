import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, initialize, propose, rpc, settings, social, PASSWORD } from './helpers.js';

test('renders Store screenshots and promotional assets at required dimensions', async () => {
  const h = await launch();
  const folder = 'docs/store/assets';
  await mkdir(folder, { recursive: true });
  try {
    await h.page.setViewportSize({ width: 1280, height: 800 });
    await initialize(h.page);
    await propose(h.page, { ...settings, groups: [{ ...social, name: 'Social & scrolling', domains: ['x.com', 'twitter.com'], mode: 'scheduled', windows: [{ days: [1, 2, 3, 4, 5], start: 540, end: 1020 }] }] });
    await h.page.locator('#unlock-password').fill(PASSWORD);
    await h.page.getByRole('button', { name: 'Unlock settings', exact: true }).click();
    await expect(h.page.getByLabel('Group name')).toBeEnabled();
    await h.page.locator('#notice').evaluate(e => { e.hidden = true; });
    await h.page.screenshot({ path: `${folder}/01-groups.png` });
    await h.page.locator('#groups-section').evaluate(e => e.scrollIntoView());
    await h.page.screenshot({ path: `${folder}/02-schedules.png` });
    await propose(h.page, { ...settings, groups: [{ ...social, name: 'Social & scrolling', domains: ['x.com', 'twitter.com'] }] });
    const siteId = (await rpc(h.page, 'status')).data.sites.find(s => s.domain === 'x.com').id;
    const blocked = await h.context.newPage(); await blocked.setViewportSize({ width: 1280, height: 800 });
    await blocked.goto(`${h.base}blocked.html#${siteId}`);
    await expect(blocked.getByRole('button', { name: 'Begin 10-minute wait' })).toBeVisible();
    await blocked.screenshot({ path: `${folder}/03-blocked.png` });
    // Brand artwork is code-drawn SVG, not a synthetic product screenshot.
    const promo = await h.context.newPage();
    for (const [name, width, height] of [['small', 440, 280], ['marquee', 1400, 560]]) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 880 560" preserveAspectRatio="xMidYMid slice"><rect width="880" height="560" fill="#214b40"/><circle cx="110" cy="490" r="240" fill="#326455"/><circle cx="810" cy="40" r="220" fill="#326455"/><path d="M0 100H880M0 180H880M0 260H880M0 340H880M0 420H880M160 0V560M300 0V560M440 0V560M580 0V560M720 0V560" stroke="#e4dbc6" opacity=".08"/><circle cx="440" cy="280" r="195" fill="#e4dbc6"/><circle cx="440" cy="280" r="176" fill="#f8f5ec"/><path d="M350 167H530V315Q530 355 440 397Q350 355 350 315Z" fill="#326455"/><rect x="402" y="222" width="24" height="98" rx="4" fill="#fffef9"/><rect x="454" y="222" width="24" height="98" rx="4" fill="#fffef9"/><path d="M250 280H213M667 280H630" stroke="#d1b979" stroke-width="8" stroke-linecap="round"/></svg>`;
      await writeFile(`${folder}/promo-${name}.svg`, svg);
      await promo.setViewportSize({ width, height });
      await promo.setContent(`<html><body style="margin:0">${svg}</body></html>`);
      await promo.screenshot({ path: `${folder}/promo-${name}.png` });
    }
  } finally { await h.context.close(); }
});
