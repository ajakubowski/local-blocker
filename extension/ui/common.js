export const $ = (selector, root = document) => root.querySelector(selector);
export function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
export async function rpc(type, data = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...data });
  if (!response?.ok) throw new Error(response?.error || 'The extension is unavailable. Reload this page.');
  return response.data;
}
export function notice(message, error = false) {
  const box = $('#review-dialog')?.open ? $('#review-notice') : $('#notice');
  if (!box) return;
  box.hidden = !message;
  box.textContent = message;
  box.classList.toggle('error', error);
  box.setAttribute('role', error ? 'alert' : 'status');
}
export async function perform(action) {
  try { await action(); }
  catch (error) { notice(error.message, true); }
}
export function dateLabel(time) {
  return new Date(time).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
export function countdown(time) {
  const seconds = Math.max(0, Math.ceil((time - Date.now()) / 1000));
  const hours = Math.floor(seconds / 3600);
  return `${hours ? `${hours}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function timer(time) {
  const element = node('span', countdown(time), 'timer');
  element.dataset.countdown = time;
  return element;
}
setInterval(() => {
  document.querySelectorAll('[data-countdown]').forEach(element => { element.textContent = countdown(Number(element.dataset.countdown)); });
}, 1000);

export function watch(refresh) {
  let busy = false;
  let again = false;
  const run = async () => {
    if (busy) { again = true; return; }
    busy = true;
    try { await refresh(); } catch (e) { notice(e.message, true); }
    finally { busy = false; if (again) { again = false; void run(); } }
  };
  const interval = setInterval(() => { if (!document.hidden) void run(); }, 3000);
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.state) void run(); });
  window.addEventListener('focus', run);
  window.addEventListener('pagehide', () => clearInterval(interval), { once: true });
  void run();
  return run;
}

export function button(label, handler, className = 'button') {
  const b = node('button', label, className);
  b.type = 'button';
  b.addEventListener('click', () => perform(async () => { b.disabled = true; try { await handler(); } finally { if (b.isConnected) b.disabled = false; } }));
  return b;
}

export function renderVisit(container, state, refresh, { navigate = false } = {}) {
  const visit = state.visit;
  const key = JSON.stringify([visit, state.incognito]);
  if (container.dataset.key === key) return;
  container.dataset.key = key;
  container.replaceChildren();
  container.hidden = !visit;
  if (!visit) return;
  container.append(node('p', 'YOUR TEMPORARY VISIT', 'eyebrow'), node('h3', visit.domain));
  if (visit.phase === 'waiting') {
    container.append(timer(visit.readyAt), node('p', 'You can close this page. Your wait keeps going.', 'muted'));
  } else if (visit.phase === 'ready') {
    container.append(node('p', 'Ready when you are. Start before this window closes.'));
    container.append(timer(visit.claimBy));
  } else if (visit.phase === 'active') {
    container.append(timer(visit.expiresAt), node('p', 'Time remaining. Blocking returns automatically.', 'muted'));
  }
  if (state.incognito) {
    container.append(button('Manage in a regular window', () => rpc('openRegular', { siteId: visit.siteId })));
    return;
  }
  const actions = node('div', undefined, 'actions');
  if (visit.phase === 'ready') actions.append(button(`Start ${visit.durationMinutes}-minute visit`, async () => {
    const { domain } = await rpc('startVisit', { siteId: visit.siteId });
    await refresh();
    if (navigate) location.assign(`https://${domain}/`);
    else await chrome.tabs.create({ url: `https://${domain}/` });
  }));
  if (visit.phase === 'active') actions.append(button('Open website', async () => {
    if (navigate) location.assign(`https://${visit.domain}/`);
    else await chrome.tabs.create({ url: `https://${visit.domain}/` });
  }));
  actions.append(button(visit.phase === 'active' ? 'End visit' : 'Cancel request', async () => { await rpc('cancelVisit', { siteId: visit.siteId }); await refresh(); }, 'button secondary'));
  container.append(actions);
}
