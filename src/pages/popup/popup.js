import { getRules, renderRuleList } from '../../shared/rules.js';
import { autoStartIfMatches, readTourState } from '../../shared/tour.js';

document.querySelector('#dashboard-btn').addEventListener('click', async () => {
  const state = await readTourState();
  const inTourHandoff = state.inProgress?.surface === 'popup' || state.inProgress?.surface === 'dashboard';
  if (inTourHandoff) {
    const dashboardUrl = chrome.runtime.getURL('src/pages/dashboard/dashboard.html');
    const existing = await chrome.tabs.query({ url: `${dashboardUrl}*` });
    if (existing.length > 0) {
      await chrome.storage.local.set({ tourAdvanceRequest: Date.now() });
      await chrome.tabs.update(existing[0].id, { active: true });
      await chrome.windows.update(existing[0].windowId, { focused: true });
      window.close();
      return;
    }
  }
  chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard/dashboard.html') });
  window.close();
});

const rulesList = document.querySelector('#rules-list');

// The popup is a glanceable list + launcher; all rule editing lives on the
// dedicated rules page, opened here.
document.querySelector('#manage-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/rules/rules.html') });
  window.close();
});

async function renderRules() {
  const rules = (await getRules()).filter(r => r.enabled);
  const noRulesMsg = document.querySelector('#no-rules-message');

  if (rules.length === 0) {
    noRulesMsg.textContent = 'No active rules. Click Manage rules to add one.';
    noRulesMsg.classList.add('visible', 'text-meta');
  } else {
    noRulesMsg.classList.remove('visible', 'text-meta');
  }

  renderRuleList(rulesList, rules, { readonly: true });
}

renderRules();

const themeBtn = document.querySelector('#theme-btn');
const themeDropdown = document.querySelector('#theme-dropdown');

themeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  themeDropdown.classList.toggle('open');
});

themeDropdown.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.getAttribute('value');
    if (val === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', val);
    window.applyTheme();
    themeDropdown.classList.remove('open');
  });
});

const popupTourSteps = [
  {
    selector: '#brand',
    title: 'The popup',
    body: 'You can open this popup from your browser toolbar at any time to manage rules.',
  },
  {
    selector: '#manage-btn',
    title: 'Manage your rules',
    body: 'Click here to open the rules page, where you can add and edit limits for specific sites.',
    keepTooltipPosition: true,
  },
  {
    selector: '#manage-btn',
    title: 'Rules page',
    body: 'Click Manage rules to open the rules page and continue the tour.',
    handoff: { nextSurface: 'rules', mode: 'crossDocument' },
  },
];

(async () => {
  const state = await readTourState();
  if (state.completed || state.inProgress?.surface !== 'popup') return;
  autoStartIfMatches('popup', popupTourSteps, { showCloseButton: false });
})();
