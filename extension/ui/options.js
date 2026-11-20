import { $, node, rpc, notice, perform, watch, button, renderVisit, timer, dateLabel } from './common.js';
import { allDomains, domainPatterns, normalizeDomain, validateSettings, weakens } from '../core/policy.js';
import { MAX_BACKUP_BYTES, readBackup } from '../core/backup.js';

let state;
let token = null;
let draft;
let draftRevision = 0;
let dirty = false;
let proposed;
let renderedRevision = -1;
let requestedSiteId = new URLSearchParams(location.hash.slice(1)).get('visit');
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const timeString = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const parseTime = value => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };

function markDirty() { dirty = true; updateLocks(); }
function updateLocks() {
  const unlocked = !!token && !!state?.authenticatedUntil && Date.now() < state.authenticatedUntil && !state.incognito;
  $('#group-editor').disabled = !unlocked;
  $('#timing-editor').disabled = !unlocked;
  $('#add-group').disabled = !unlocked;
  $('#review').disabled = !unlocked || !dirty;
  $('#lock').hidden = !unlocked;
  $('#discard').hidden = !dirty;
  $('#security-panel').hidden = !unlocked;
  $('#backup-editor').disabled = !unlocked;
  $('#unlock-panel').hidden = !state?.initialized || unlocked || state.incognito;
  $('#save-hint').textContent = !unlocked ? 'Unlock to edit your settings.' : dirty ? 'You have unsaved changes.' : 'Settings are up to date. Unlock lasts five minutes.';
}

function inputField(label, value, onInput, type = 'text') {
  const wrapper = node('label', undefined, 'field');
  wrapper.append(node('span', label));
  const input = node('input'); input.type = type; input.value = value;
  input.addEventListener('input', () => { onInput(input.value); markDirty(); });
  wrapper.append(input);
  return { wrapper, input };
}

function windowEditor(group, win, index) {
  const row = node('div', undefined, 'window-row');
  const dayList = node('div', undefined, 'days');
  dayList.setAttribute('role', 'group'); dayList.setAttribute('aria-label', `Days for time window ${index + 1}`);
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const label = node('label', undefined, 'day');
    const check = node('input'); check.type = 'checkbox'; check.checked = win.days.includes(d); check.setAttribute('aria-label', days[d]);
    check.addEventListener('change', () => { win.days = check.checked ? [...win.days, d] : win.days.filter(day => day !== d); markDirty(); });
    label.append(check, node('span', days[d])); dayList.append(label);
  }
  const times = node('div', undefined, 'time-row');
  const start = inputField('From', timeString(win.start), value => { win.start = parseTime(value); }, 'time');
  const end = inputField('Until', timeString(win.end), value => { win.end = parseTime(value); }, 'time');
  start.input.required = true; end.input.required = true;
  times.append(start.wrapper, end.wrapper, button('Remove window', () => { group.windows.splice(index, 1); markDirty(); renderGroups(); }, 'button text danger'));
  row.append(dayList, times);
  return row;
}

function renderGroups() {
  const container = $('#groups'); container.replaceChildren();
  if (!draft.groups.length) {
    const empty = node('div', undefined, 'card empty');
    empty.append(node('p', 'A PLACE TO BEGIN', 'eyebrow'), node('h3', 'What would you like a little distance from?'), node('p', 'Add your first group. Social feeds, news, shopping — you choose.', 'small muted'));
    container.append(empty); return;
  }
  draft.groups.forEach((group, index) => {
    const card = node('section', undefined, 'card group-card'); card.setAttribute('aria-label', `Group ${index + 1}`);
    const top = node('div', undefined, 'group-top');
    top.append(node('p', `GROUP ${String(index + 1).padStart(2, '0')}`, 'eyebrow'), button('Remove group', () => { draft.groups.splice(index, 1); markDirty(); renderGroups(); }, 'button text danger'));
    const columns = node('div', undefined, 'two-col');
    const name = inputField('Group name', group.name, value => { group.name = value; });
    name.input.maxLength = 80; name.input.required = true; name.input.placeholder = 'e.g. Social';
    const modeLabel = node('label', undefined, 'field'); modeLabel.append(node('span', 'When to block'));
    const mode = node('select');
    for (const [value, label] of [['always', 'Always blocked'], ['scheduled', 'Weekly schedule']]) { const option = node('option', label); option.value = value; mode.append(option); }
    mode.value = group.mode; modeLabel.append(mode); columns.append(name.wrapper, modeLabel);
    const siteLabel = node('label', undefined, 'field'); siteLabel.append(node('span', 'Websites — one per line, or separated by commas'));
    const textarea = node('textarea'); textarea.value = group.domains.join('\n'); textarea.rows = 3; textarea.placeholder = 'x.com\ntwitter.com'; textarea.required = true;
    const chips = node('div', undefined, 'chips');
    const preview = () => {
      chips.replaceChildren();
      for (const raw of group.domains) {
        try { chips.append(node('span', `${normalizeDomain(raw)} + subdomains`, 'chip')); } catch { /* The review form reports invalid domains. */ }
      }
    };
    textarea.addEventListener('input', () => { group.domains = textarea.value.split(/[\n,]+/).map(d => d.trim()).filter(Boolean); preview(); markDirty(); });
    siteLabel.append(textarea); preview();
    const windows = node('div', undefined, 'windows'); windows.hidden = group.mode !== 'scheduled';
    windows.append(node('p', 'Days are the start day. An end time earlier than the start continues into the next day.', 'small muted'));
    group.windows.forEach((w, i) => windows.append(windowEditor(group, w, i)));
    windows.append(button('+ Add time window', () => { group.windows.push({ days: [1, 2, 3, 4, 5], start: 540, end: 1020 }); markDirty(); renderGroups(); }, 'button secondary'));
    mode.addEventListener('change', () => {
      group.mode = mode.value;
      if (group.mode === 'scheduled' && !group.windows.length) { group.windows.push({ days: [1, 2, 3, 4, 5], start: 540, end: 1020 }); renderGroups(); }
      else windows.hidden = group.mode !== 'scheduled';
      markDirty();
    });
    const allow = node('label', undefined, 'check'); const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = group.allowTemporaryVisits;
    checkbox.addEventListener('change', () => { group.allowTemporaryVisits = checkbox.checked; markDirty(); });
    allow.append(checkbox, node('span', 'Allow temporary visits after the cooldown'));
    card.append(top, columns, siteLabel, chips, windows, allow); container.append(card);
  });
}

function renderDraft(settings, revision) {
  draft = structuredClone(settings); draftRevision = revision; renderedRevision = revision;
  renderGroups();
  const preset = [5, 10, 15, 30, 60].includes(draft.cooldownMinutes);
  $('#cooldown-preset').value = preset ? String(draft.cooldownMinutes) : 'custom';
  $('#custom-cooldown').value = draft.cooldownMinutes;
  $('#custom-cooldown-field').hidden = preset;
  $('#visit-minutes').value = draft.visitMinutes;
  updateLocks();
}

function summarize(container, settings) {
  container.replaceChildren();
  container.append(node('p', `${settings.cooldownMinutes} min cooldown · ${settings.visitMinutes} min visits`, 'small'));
  if (!settings.groups.length) container.append(node('p', 'No websites blocked.', 'muted small'));
  for (const g of settings.groups) {
    const card = node('div', undefined, 'summary-group');
    card.append(node('h3', g.name), node('p', g.domains.join(', ')), node('p', g.allowTemporaryVisits ? 'Temporary visits allowed' : 'No temporary visits', 'muted'));
    if (g.mode === 'always') card.append(node('p', 'Always blocked', 'muted'));
    else for (const w of g.windows) card.append(node('p', `${w.days.map(d => days[d]).join(', ')} · ${timeString(w.start)}–${timeString(w.end)}${w.end < w.start ? ' (next day)' : ''}`, 'muted'));
    container.append(card);
  }
}

function renderPending() {
  const container = $('#pending-panel');
  const pending = state.pending;
  const ready = pending && Date.now() >= pending.readyAt;
  const key = JSON.stringify([pending, ready, !!state.authenticatedUntil, state.incognito]);
  if (container.dataset.key === key) return;
  container.dataset.key = key; container.replaceChildren(); container.hidden = !pending;
  if (!pending) return;
  container.append(node('p', 'A CHANGE IS WAITING', 'eyebrow'), node('h2', ready ? 'Ready for a second look.' : 'Your current boundaries stay in place.'));
  if (!ready) container.append(timer(pending.readyAt));
  container.append(node('p', `Available ${dateLabel(pending.readyAt)}. Unlock with your password, then confirm this exact proposal. Nothing changes automatically.`, 'small'));
  const details = node('details'); details.append(node('summary', 'Review the pending change'));
  const grid = node('div', undefined, 'review-grid');
  for (const [label, settings] of [['Current', state.settings], ['Proposed', pending.settings]]) { const col = node('div'); col.append(node('h3', label)); const summary = node('div'); summarize(summary, settings); col.append(summary); grid.append(col); }
  details.append(grid); container.append(details);
  const actions = node('div', undefined, 'actions');
  if (ready && !state.incognito) {
    const form = node('form', undefined, 'lock-row');
    const label = node('label', undefined, 'field');
    const password = node('input'); password.type = 'password'; password.autocomplete = 'current-password'; password.required = true; password.maxLength = 1024;
    label.append(node('span', 'Password to confirm this change'), password);
    const confirm = node('button', 'Confirm pending change', 'button'); confirm.type = 'submit';
    form.append(label, confirm);
    form.addEventListener('submit', event => {
      event.preventDefault();
      void perform(async () => {
        confirm.disabled = true;
        const value = password.value; password.value = '';
        try {
          token = (await rpc('unlock', { password: value })).token;
          await rpc('confirm', { token, pendingId: pending.id });
          dirty = false; renderedRevision = -1; notice('Your new boundaries are in place.');
          await refresh();
        } finally { confirm.disabled = false; }
      });
    });
    container.append(form);
  }
  const edit = button('Edit proposal', () => { renderDraft(pending.settings, state.revision); markDirty(); notice('Editing the proposal starts a new cooldown when you save.'); $('#groups-section').scrollIntoView({ behavior: 'smooth' }); }, 'button text');
  edit.disabled = !state.authenticatedUntil || state.incognito;
  const cancel = button('Cancel change', async () => { await rpc('cancelPending', { token }); notice('Pending change canceled.'); await refresh(); }, 'button text');
  cancel.disabled = !state.authenticatedUntil || state.incognito;
  actions.append(edit, cancel); container.append(actions);
}

function renderRequestedSite() {
  const container = $('#requested-site');
  const site = state.sites.find(s => s.id === requestedSiteId);
  const key = JSON.stringify([site, !!state.visit, state.incognito]);
  if (container.dataset.key === key) return;
  container.dataset.key = key; container.replaceChildren(); container.hidden = !site || !!state.visit;
  if (!site || state.visit) return;
  container.append(node('h3', site.domain));
  if (!site.blocked) container.append(node('p', 'This website is currently available.', 'muted'));
  else if (!site.canVisit) container.append(node('p', 'An active group does not allow temporary visits.', 'muted'));
  else {
    container.append(node('p', `Wait ${state.settings.cooldownMinutes} minutes, then choose when to start your ${state.settings.visitMinutes}-minute visit.`, 'small muted'));
    container.append(button('Request a temporary visit', async () => { await rpc(state.incognito ? 'openRegular' : 'requestVisit', { siteId: site.id }); await refresh(); }));
  }
}

async function refreshState() {
  state = await rpc('status', { token });
  if (token && !state.authenticatedUntil) { token = null; notice('Settings locked. Unlock again to continue editing.'); }
  $('#setup-panel').hidden = state.initialized || state.incognito;
  $('#incognito-panel').hidden = !state.incognito;
  $('#group-count').textContent = state.settings.groups.length;
  $('#cooldown-stat').textContent = `${state.settings.cooldownMinutes} min`;
  $('#visit-stat').textContent = `${state.settings.visitMinutes} min`;
  $('#timezone').textContent = state.timezone;
  $('#incognito-help').textContent = state.incognitoAllowed ? 'Incognito blocking is enabled. Temporary visits and settings are managed in regular windows.' : 'Incognito blocking is off. To enable it, open chrome://extensions, choose Local Blocker → Details, and turn on Allow in Incognito.';
  $('#engine-error').hidden = !state.engineError; $('#engine-error').textContent = state.engineError || '';
  if (!draft || (!dirty && renderedRevision !== state.revision)) renderDraft(state.settings, state.revision);
  updateLocks(); renderPending(); renderVisit($('#visit-panel'), state, refresh); renderRequestedSite();
  const missing = state.sites.filter(s => !s.hasAccess);
  $('#permission-panel').hidden = !missing.length || state.incognito;
  $('#permission-description').textContent = `Website access is missing for: ${missing.map(s => s.domain).join(', ')}.`;
}

$('#setup-form').addEventListener('submit', event => {
  event.preventDefault();
  void perform(async () => {
    const password = $('#setup-password').value;
    if (password !== $('#setup-confirm').value) throw new Error('The passwords do not match.');
    const submit = $('button', event.currentTarget); submit.disabled = true;
    try {
      await rpc('setup', { password });
      token = (await rpc('unlock', { password })).token;
      $('#setup-form').reset(); notice('Password set. Add your first website group.'); await refresh();
    } finally { submit.disabled = false; }
  });
});
$('#unlock-form').addEventListener('submit', event => {
  event.preventDefault();
  void perform(async () => {
    const password = $('#unlock-password').value; $('#unlock-password').value = '';
    token = (await rpc('unlock', { password })).token; notice('Settings unlocked for five minutes.'); await refresh();
  });
});
$('#lock').addEventListener('click', () => perform(async () => { await rpc('lock', { token }); token = null; await refresh(); }));
$('#open-regular').addEventListener('click', () => perform(() => rpc('openRegular', { siteId: requestedSiteId })));
$('#add-group').addEventListener('click', () => {
  draft.groups.push({ id: crypto.randomUUID(), name: '', domains: [], mode: 'always', windows: [], allowTemporaryVisits: true });
  markDirty(); renderGroups();
  const cards = document.querySelectorAll('.group-card'); $('input', cards[cards.length - 1]).focus();
});
$('#cooldown-preset').addEventListener('change', event => { const custom = event.target.value === 'custom'; $('#custom-cooldown-field').hidden = !custom; draft.cooldownMinutes = Number(custom ? $('#custom-cooldown').value : event.target.value); markDirty(); });
$('#custom-cooldown').addEventListener('input', event => { draft.cooldownMinutes = Number(event.target.value); markDirty(); });
$('#visit-minutes').addEventListener('input', event => { draft.visitMinutes = Number(event.target.value); markDirty(); });
$('#discard').addEventListener('click', () => { dirty = false; renderDraft(state.settings, state.revision); notice('Unsaved edits discarded.'); });
$('#review').addEventListener('click', () => perform(async () => {
  for (const input of document.querySelectorAll('#group-editor input, #group-editor textarea, #timing-editor input')) if (!input.checkValidity()) { input.reportValidity(); return; }
  proposed = validateSettings(draft);
  $('#review-notice').hidden = true;
  const delayed = weakens(state.settings, proposed);
  $('#review-explanation').textContent = delayed ? `This relaxes a boundary. Your current settings stay in place for ${state.settings.cooldownMinutes} minutes; afterward, unlock and confirm this exact change.` : 'These changes preserve or strengthen your boundaries and will apply immediately.';
  $('#save-confirm').textContent = delayed ? 'Start settings cooldown' : 'Save changes';
  summarize($('#review-before'), state.settings); summarize($('#review-after'), proposed); $('#review-dialog').showModal();
}));
$('#review-cancel').addEventListener('click', () => $('#review-dialog').close());
$('#save-confirm').addEventListener('click', () => {
  const origins = allDomains(proposed).flatMap(domainPatterns);
  // Call directly from this user gesture, before any other asynchronous work.
  const permission = origins.length ? chrome.permissions.request({ origins }) : Promise.resolve(true);
  void perform(async () => {
    $('#save-confirm').disabled = true;
    try {
      await permission.catch(() => false);
      const result = await rpc('propose', { token, settings: proposed, revision: draftRevision });
      dirty = false; renderedRevision = -1; $('#review-dialog').close();
      notice(result.outcome === 'pending' ? 'Your proposal is waiting. Current settings remain active until you confirm it after the cooldown.' : result.outcome === 'unchanged' ? 'No settings changed.' : 'Your boundaries are in place.');
      await refresh();
    } finally { $('#save-confirm').disabled = false; }
  });
});
$('#grant-access').addEventListener('click', () => {
  const permission = chrome.permissions.request({ origins: state.sites.filter(s => !s.hasAccess).flatMap(s => domainPatterns(s.domain)) });
  void perform(async () => { const allowed = await permission; notice(allowed ? 'Website access enabled.' : 'Basic blocking remains active. You can enable website access later.'); await refresh(); });
});
$('#password-form').addEventListener('submit', event => {
  event.preventDefault(); void perform(async () => {
    await rpc('changePassword', { token, currentPassword: $('#current-password').value, password: $('#new-password').value });
    token = null; $('#password-form').reset(); notice('Password changed. Settings are now locked.'); await refresh();
  });
});
$('#export-settings').addEventListener('click', () => perform(async () => {
  const backup = await rpc('exportSettings', { token });
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json' }));
  const link = node('a'); link.href = url; link.download = 'local-blocker-settings.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('Settings exported. The file contains your websites and schedules, but no password or active waits. Keep it somewhere private.');
}));
$('#import-settings').addEventListener('change', event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  void perform(async () => {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Choose a settings backup smaller than 1 MB.');
    const settings = readBackup(await file.text());
    await refresh();
    if (!state.authenticatedUntil) throw new Error('Unlock settings before importing.');
    renderDraft(settings, state.revision); markDirty();
    notice('Backup loaded as unsaved edits. Review and save to apply it. Weaker settings still require your current cooldown.');
    $('#review').focus();
  });
});
window.addEventListener('hashchange', () => { requestedSiteId = new URLSearchParams(location.hash.slice(1)).get('visit'); if (state) renderRequestedSite(); });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
const refresh = watch(refreshState);
