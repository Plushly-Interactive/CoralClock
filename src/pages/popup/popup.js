import { getRules, addRule, toggleRule, deleteRule, renderRuleList, initCustomDropdowns } from '../../shared/rules.js';
import { autoStartIfMatches, readTourState } from '../../shared/tour.js';

const addBtn = document.querySelector('#add-btn');
const formTarget = document.querySelector('#form-target');

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

const addForm = document.querySelector('#add-form');
const rulesList = document.querySelector('#rules-list');

addBtn.addEventListener('click', async () => {
  addForm.classList.toggle('visible');

  if (addForm.classList.contains('visible')) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.startsWith('http')) {
      formTarget.value = new URL(tab.url).hostname;
    }
    formTarget.focus();
    formTarget.select();
  }
});

document.querySelector('#save-btn').addEventListener('click', async () => {
  const target = formTarget.value.trim();
  const limit = parseInt(document.querySelector('#form-limit').value);
  if (!target || !limit) return;

  await addRule({
    target,
    matchType: 'host',
    limit,
    limitUnit: document.querySelector('#form-unit-btn').dataset.value,
    period: document.querySelector('#form-period-btn').dataset.value,
    mode: 'active',
  });

  formTarget.value = '';
  document.querySelector('#form-limit').value = '10';
  addForm.classList.remove('visible');
  renderRules();
});

rulesList.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  if (e.target.classList.contains('toggle-btn')) await toggleRule(id);
  if (e.target.classList.contains('delete-btn')) await deleteRule(id);
  renderRules();
});

async function renderRules() {
  const rules = await getRules();
  const noRulesMsg = document.querySelector('#no-rules-message');

  if (rules.length === 0) {
    noRulesMsg.textContent = 'No rules yet. Add one to get started!';
    noRulesMsg.classList.add('visible', 'text-meta');
  } else {
    noRulesMsg.classList.remove('visible', 'text-meta');
  }

  renderRuleList(rulesList, rules);
}

renderRules();

initCustomDropdowns();

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
    selector: '#add-btn',
    title: 'Add a rule',
    body: 'Click here to add a rule that limits your time on a specific site.',
    keepTooltipPosition: true,
  },
  {
    selector: '#dashboard-btn',
    title: 'Back to the dashboard',
    body: 'Click Dashboard to return there and continue the tour.',
    handoff: { nextSurface: 'dashboard', nextStepIndex: 8, mode: 'inPage' },
  },
];

(async () => {
  const state = await readTourState();
  if (state.inProgress?.surface !== 'popup') return;
  autoStartIfMatches('popup', popupTourSteps, { showCloseButton: false });
})();
