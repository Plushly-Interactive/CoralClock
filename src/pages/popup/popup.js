import { formatMs } from '../../shared/timeUtils.js';
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
  const limitUnit = document.querySelector('#form-unit-btn').dataset.value;
  const period = document.querySelector('#form-period-btn').dataset.value;

  if (!target || !limit) return;

  const rule = {
    id: crypto.randomUUID(),
    target,
    limit,
    limitUnit,
    period,
    enabled: true,
  };

  const { rules = [] } = await chrome.storage.local.get('rules');
  await chrome.storage.local.set({ rules: [...rules, rule] });

  formTarget.value = '';
  document.querySelector('#form-limit').value = '10';
  addForm.classList.remove('visible');
  renderRules();
});

rulesList.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  const { rules = [] } = await chrome.storage.local.get('rules');

  if (e.target.classList.contains('toggle-btn')) {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    await chrome.storage.local.set({ rules: updated });
  }

  if (e.target.classList.contains('delete-btn')) {
    const updated = rules.filter(r => r.id !== id);
    await chrome.storage.local.set({ rules: updated });
  }

  renderRules();
});

async function renderRules() {
  const { rules = [] } = await chrome.storage.local.get('rules');
  const multipliers = { minutes: 60000, hours: 3600000, days: 86400000 };
  const noRulesMsg = document.querySelector('#no-rules-message');

  if (rules.length === 0) {
    noRulesMsg.textContent = 'No rules yet. Add one to get started!';
    noRulesMsg.classList.add('visible', 'text-meta');
  } else {
    noRulesMsg.classList.remove('visible', 'text-meta');
  }

  rulesList.innerHTML = rules.map(rule => {
    const limitMs = rule.limit * (multipliers[rule.limitUnit] ?? 60000);
    return `
    <li class="${rule.enabled ? '' : 'disabled'}">
      <div class="rule-info">
        <strong>${rule.target}</strong>
        <span>${formatMs(limitMs)} per ${rule.period}</span>
      </div>
      <button class="toggle-btn square-btn" data-id="${rule.id}">${rule.enabled ? '●' : '○'}</button>
      <button class="delete-btn square-btn" data-id="${rule.id}">✕</button>
    </li>`;
  }).join('');
}

renderRules();

function initCustomDropdowns() {
  document.querySelectorAll('.dropdown-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      const isOpen = menu.classList.contains('open');
      document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
      if (!isOpen) menu.classList.add('open');
    });
  });

  document.querySelectorAll('.dropdown-menu:not(#theme-dropdown) button').forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = option.parentElement;
      const btn = menu.previousElementSibling;
      btn.firstChild.textContent = option.textContent;
      btn.dataset.value = option.value;
      menu.classList.remove('open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  });
}

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

autoStartIfMatches('popup', popupTourSteps);
