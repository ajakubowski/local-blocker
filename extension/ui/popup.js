import { $, node, rpc, watch, perform, button, renderVisit, dateLabel } from './common.js';

async function refreshState() {
  const state = await rpc('status');
  const active = state.sites.filter(s => s.blocked || s.visiting);
  $('#summary').textContent = !state.initialized ? 'Start by choosing a password and your first website group.' : active.length ? `${active.length} website${active.length === 1 ? '' : 's'} under your boundaries.${state.nextChange ? ` Next schedule change: ${dateLabel(state.nextChange)}.` : ''}` : state.nextChange ? `All clear for now. Next schedule change: ${dateLabel(state.nextChange)}.` : 'No websites are blocked right now.';
  $('#engine-error').hidden = !state.engineError; $('#engine-error').textContent = state.engineError || '';
  renderVisit($('#visit-panel'), state, refresh);
  const container = $('#site-list');
  const key = JSON.stringify([active, !!state.visit, state.incognito, state.settings.cooldownMinutes]);
  if (container.dataset.key !== key) {
    container.dataset.key = key; container.replaceChildren();
    for (const site of active) {
      const row = node('div', undefined, 'site-row'); const description = node('div');
      description.append(node('strong', site.domain), node('small', site.visiting ? 'Temporary visit active' : site.groups.join(', ')));
      row.append(description);
      if (site.canVisit && !state.visit) row.append(button(state.incognito ? 'Visit controls' : `Wait ${state.settings.cooldownMinutes} min`, async () => { await rpc(state.incognito ? 'openRegular' : 'requestVisit', { siteId: site.id }); await refresh(); }, 'button secondary'));
      else if (!site.canVisit) row.append(node('small', 'No visits', 'muted'));
      container.append(row);
    }
    if (active.length) container.append(node('p', 'Includes subdomains. Requests and visits are shared across windows.', 'small muted'));
  }
}
$('#settings').addEventListener('click', () => perform(() => rpc('openSettings')));
const refresh = watch(refreshState);
