import { chromium } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';

export const PASSWORD = 'test password only';
export const social = { id: 'social', name: 'Social', domains: ['social.blocker.test'], mode: 'always', windows: [], allowTemporaryVisits: true };
export const settings = { cooldownMinutes: 10, visitMinutes: 5, groups: [social] };

export async function launch({ permissions = true, directory, extensionPath, extraArgs = [] } = {}) {
  await mkdir('.cache/browser-tests', { recursive: true });
  const root = directory || await mkdtemp(resolve('.cache/browser-tests/profile-'));
  const extension = extensionPath || join(root, 'extension');
  if (!extensionPath) {
    await cp(resolve('extension'), extension, { recursive: true });
    if (permissions) {
      const file = join(extension, 'manifest.json'); const manifest = JSON.parse(await readFile(file, 'utf8'));
      manifest.host_permissions = ['http://*.blocker.test/*', 'https://*.blocker.test/*', 'http://*.x.com/*', 'https://*.x.com/*', 'http://*.twitter.com/*', 'https://*.twitter.com/*', 'http://*.reddit.com/*', 'https://*.reddit.com/*'];
      await writeFile(file, JSON.stringify(manifest));
    }
  }
  const context = await chromium.launchPersistentContext(join(root, 'profile'), {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 1000 }, timezoneId: 'America/Chicago',
    ignoreDefaultArgs: ['--disable-back-forward-cache', '--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--host-resolver-rules=MAP *.blocker.test 127.0.0.1', '--no-proxy-server', ...extraArgs]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host; const base = `chrome-extension://${id}/`;
  const manager = await context.newPage(); await manager.goto('chrome://extensions/');
  await manager.evaluate(() => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }));
  await manager.close();
  const page = await context.newPage(); await page.goto(`${base}options.html`);
  return { context, worker, page, base, id, root, extension };
}

export async function rpc(page, type, data = {}) { return page.evaluate(async ({ type, data }) => chrome.runtime.sendMessage({ type, ...data }), { type, data }); }
export async function initialize(page) {
  const setup = await rpc(page, 'setup', { password: PASSWORD });
  if (!setup.ok) throw new Error(setup.error);
}
export async function propose(page, config = settings) {
  const auth = await rpc(page, 'unlock', { password: PASSWORD });
  if (!auth.ok) throw new Error(auth.error);
  const status = await rpc(page, 'status');
  const result = await rpc(page, 'propose', { token: auth.data.token, revision: status.data.revision, settings: config });
  if (!result.ok) throw new Error(result.error);
  return { ...result.data, token: auth.data.token };
}
export async function editState(worker, update) {
  await worker.evaluate(async source => {
    const { state } = await chrome.storage.local.get('state');
    // Test-only state edits run through DevTools; no test clock or bypass is shipped.
    const patch = JSON.parse(source);
    if (patch.visit) Object.assign(state.visit, patch.visit);
    if (patch.pending) Object.assign(state.pending, patch.pending);
    await chrome.storage.local.set({ state });
  }, JSON.stringify(update));
}
export async function siteServer() {
  const hits = [];
  const server = createServer((request, response) => {
    hits.push(`${request.headers.host}${request.url}`);
    if (request.url === '/sw.js') {
      response.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' });
      response.end("self.addEventListener('install', event => event.waitUntil(self.skipWaiting())); self.addEventListener('activate', event => event.waitUntil(self.clients.claim())); self.addEventListener('fetch', event => { if (event.request.mode === 'navigate') event.respondWith(Promise.resolve(new Response('<h1>Offline cached website</h1>', {headers: {'Content-Type':'text/html'}}))); });");
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'public, max-age=3600' });
    response.end('<!doctype html><html><head><title>Test website</title></head><body><h1>Website content</h1><a href="/second">Second page</a></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return { hits, url: (host = 'social.blocker.test', path = '/') => `http://${host}:${port}${path}`, close: () => new Promise(resolve => server.close(resolve)) };
}
