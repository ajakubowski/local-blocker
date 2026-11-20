import { $, node, rpc, watch, perform, button, renderVisit, dateLabel } from './common.js';

async function refreshState() {
  const siteId = location.hash.slice(1);
  const state = await rpc('status', { siteId });
  const site = state.selected;
  $('#domain').textContent = site?.domain || 'This website rule has changed.';
  $('#reason').textContent = site ? site.blocked ? `Blocked by ${site.groups.join(' and ')}.` : 'This website is available now.' : 'Review your current groups in settings.';
  $('#schedule').textContent = site?.blocked ? site.nextChange ? `Scheduled access returns ${dateLabel(site.nextChange)}.` : 'Blocked around the clock.' : '';
  $('#engine-error').hidden = !state.engineError; $('#engine-error').textContent = state.engineError || '';
  renderVisit($('#visit-panel'), state, refresh, { navigate: true });
  const container = $('#access-panel');
  const key = JSON.stringify([site, !!state.visit, state.settings, state.incognito]);
  if (container.dataset.key === key) return;
  container.dataset.key = key; container.replaceChildren();
  if (!site) { container.append(node('p', 'The rule that brought you here is no longer configured.', 'muted')); return; }
  if (!site.blocked) {
    container.append(node('h3', 'Your time is yours.'), node('p', 'You can return to the website whenever you’re ready.', 'small muted'), button('Open website', () => location.assign(`https://${site.domain}/`)));
  } else if (!site.canVisit) {
    container.append(node('h3', 'A boundary without exceptions.'), node('p', 'An active group has temporary visits turned off. Access returns when its schedule ends or a password-authorized change takes effect.', 'small muted'));
  } else if (state.visit) {
    container.append(node('p', state.visit.siteId === site.id ? 'Your original boundary stays in place until you explicitly start the visit.' : 'There’s already a visit or request in progress. Finish or cancel it before starting another.', 'small muted'));
  } else {
    container.append(node('h3', 'Still want to visit?'), node('p', `Wait ${state.settings.cooldownMinutes} minutes, then explicitly start a ${state.settings.visitMinutes}-minute visit. Only this website and its subdomains will open.`, 'small muted'));
    container.append(button(state.incognito ? 'Request in a regular window' : `Begin ${state.settings.cooldownMinutes}-minute wait`, async () => { await rpc(state.incognito ? 'openRegular' : 'requestVisit', { siteId }); await refresh(); }));
    container.append(node('p', 'No password needed. No rush, either.', 'small muted'));
  }
}
$('#settings').addEventListener('click', () => perform(() => rpc('openSettings')));
window.addEventListener('hashchange', () => refresh());
const refresh = watch(refreshState);
