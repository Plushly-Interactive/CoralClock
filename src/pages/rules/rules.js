import { getRules, addRule, toggleRule, deleteRule, updateRule, renderRuleList, initCustomDropdowns, describeRule, findCoveringRule, findRedundantRules, disableRules, matchLabel, BLOCKS_DAY_KEY, blockKey } from '../../shared/rules.js';
import { getDomain } from '../../vendor/tldts.js';
import { localDayKey } from '../../shared/timeUtils.js';
import { drawBarChart } from '../../shared/utils.js';
import { autoStartIfMatches } from '../../shared/tour.js';

const formTarget     = document.querySelector('#form-target');
const cards          = [...document.querySelectorAll('.scope-card')];
const previewText    = document.querySelector('#preview-text');
const previewPattern = document.querySelector('#preview-pattern');
const saveBtn        = document.querySelector('#save-btn');
const rulesList      = document.querySelector('#rules-list');
const noRulesMsg     = document.querySelector('#no-rules-message');
const redundantPrompt       = document.querySelector('#redundant-prompt');
const redundantText         = document.querySelector('#redundant-text');
const redundantList         = document.querySelector('#redundant-list');
const redundantDisableBtn   = document.querySelector('#redundant-disable-btn');
const redundantKeepBtn      = document.querySelector('#redundant-keep-btn');
const sortSiteBtn    = document.querySelector('#sort-site');
const sortStatusBtn  = document.querySelector('#sort-status');
const addCard        = document.querySelector('#add-card');
const addCardToggle  = document.querySelector('#add-card-toggle');
const addCardBody    = document.querySelector('#add-card-body');
const urlForm        = document.querySelector('#url-form');
const regexForm      = document.querySelector('#regex-form');
const keywordForm    = document.querySelector('#keyword-form');

let scope = 'subdomain';
let currentRules = [];
let sort = { key: 'site', dir: 1 };

// ── Add card collapse toggle ──

addCardToggle.addEventListener('click', () => {
  const open = addCard.classList.toggle('open');
  if (open) {
    addCardBody.removeAttribute('hidden');
  } else {
    addCardBody.setAttribute('hidden', '');
  }
});

// Clicks on the type-toggle buttons should toggle the card open (not close it)
// and switch the active tab, but not bubble up to close the card again.
document.querySelector('#type-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
});

// ── Type tabs ──

const tabBtns = { url: document.querySelector('#tab-url'), regex: document.querySelector('#tab-regex'), keyword: document.querySelector('#tab-keyword') };
const tabForms = { url: urlForm, regex: regexForm, keyword: keywordForm };

function selectTab(key) {
  for (const [k, btn] of Object.entries(tabBtns)) btn.classList.toggle('active', k === key);
  for (const [k, form] of Object.entries(tabForms)) {
    if (k === key) form.removeAttribute('hidden');
    else form.setAttribute('hidden', '');
  }
  // Open the card when a tab is clicked
  if (!addCard.classList.contains('open')) {
    addCard.classList.add('open');
    addCardBody.removeAttribute('hidden');
  }
}

tabBtns.url.addEventListener('click', () => selectTab('url'));
tabBtns.regex.addEventListener('click', () => selectTab('regex'));
tabBtns.keyword.addEventListener('click', () => selectTab('keyword'));

// ── URL form logic (carried over from previous rules.js) ──

function parseTarget(raw) {
  const clean = raw.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '');
  const slash = clean.indexOf('/');
  if (slash === -1) return { host: clean.toLowerCase(), path: '' };
  return { host: clean.slice(0, slash).toLowerCase(), path: clean.slice(slash + 1) };
}

function isValidHost(host) {
  return !!getDomain(host);
}

const UNIT_MAX = {
  minutes: { hour: 60,  day: 1440,  week: 10080 },
  hours:   {            day: 24,    week: 168   },
  days:    {                        week: 7     },
};

function constrainLimitForm() {
  const unitBtn    = document.querySelector('#form-unit-btn');
  const periodBtn  = document.querySelector('#form-period-btn');
  const limitInput = document.querySelector('#form-limit');
  const unit   = unitBtn.dataset.value;
  const period = periodBtn.dataset.value;

  const validPeriods = Object.keys(UNIT_MAX[unit] ?? {});
  document.querySelectorAll('#form-period-menu button').forEach(opt => {
    opt.disabled = !validPeriods.includes(opt.value);
  });
  document.querySelectorAll('#form-unit-menu button').forEach(opt => {
    opt.disabled = !(UNIT_MAX[opt.value] ?? {})[period];
  });

  if (!validPeriods.includes(period)) {
    const next = validPeriods[0];
    periodBtn.firstChild.textContent = document.querySelector(`#form-period-menu button[value="${next}"]`).textContent;
    periodBtn.dataset.value = next;
  }

  const effectivePeriod = periodBtn.dataset.value;
  const max = (UNIT_MAX[unit] ?? {})[effectivePeriod];
  if (max !== undefined) {
    limitInput.max = max;
    if (parseInt(limitInput.value) > max) limitInput.value = max;
  }
}

function formLimitFields() {
  return {
    limit:    parseInt(document.querySelector('#form-limit').value),
    limitUnit: document.querySelector('#form-unit-btn').dataset.value,
    period:   document.querySelector('#form-period-btn').dataset.value,
    mode:     document.querySelector('#form-mode-btn').dataset.value,
  };
}

function refreshExamples(host, path) {
  const h = host || formTarget.placeholder;
  document.querySelector('#ex-host').textContent = h;
  document.querySelector('#ex-subdomain').textContent = `*.${h}`;
  document.querySelector('#ex-page').textContent = path ? `${h}/${path}` : `${h}/…`;
}

function selectScope(next, { silent } = {}) {
  scope = next;
  cards.forEach(c => c.classList.toggle('active', c.dataset.scope === next));
  if (!silent) refreshPreview();
}

function refreshPreview() {
  const { host, path } = parseTarget(formTarget.value);
  if (path && scope !== 'pathPrefix') selectScope('pathPrefix', { silent: true });
  refreshExamples(host, path);

  if (!host) {
    previewText.textContent = 'Enter a site address above.';
    previewPattern.textContent = '';
    saveBtn.disabled = true;
    return;
  }
  if (!isValidHost(host)) {
    previewText.textContent = `"${host}" doesn't look like a valid site (e.g. reddit.com).`;
    previewPattern.textContent = '';
    saveBtn.disabled = true;
    return;
  }
  if (scope === 'pathPrefix' && !path) {
    previewText.textContent = 'Add a /path to limit a specific page.';
    previewPattern.textContent = '';
    saveBtn.disabled = true;
    return;
  }
  const candidate = { target: host, path, matchType: scope, ...formLimitFields() };
  const covering = findCoveringRule(currentRules, candidate);
  if (covering) {
    previewText.innerHTML =
      `An existing ${candidate.period} rule (<a href="#rule-${covering.id}" id="covering-link" class="link-btn">${matchLabel(covering)}</a>) already covers this.`;
    previewPattern.textContent = '';
    saveBtn.disabled = true;
    return;
  }

  const { text, value } = describeRule({ target: host, path, matchType: scope });
  previewText.textContent = `Will block ${text}.`;
  previewPattern.textContent = value;
  saveBtn.disabled = false;
}

cards.forEach(card => card.addEventListener('click', () => selectScope(card.dataset.scope)));
formTarget.addEventListener('input', refreshPreview);

previewText.addEventListener('click', (e) => {
  const link = e.target.closest('#covering-link');
  if (!link) return;
  e.preventDefault();
  const row = document.querySelector(link.getAttribute('href'));
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
});

// ── Sort ──

function sortedRules() {
  const cmp = sort.key === 'status'
    ? (a, b) => Number(b.enabled) - Number(a.enabled)
    : (a, b) => (a.target + (a.path || '')).localeCompare(b.target + (b.path || ''));
  return [...currentRules].sort((a, b) => sort.dir * cmp(a, b));
}

function updateSortArrows() {
  for (const [key, btn] of [['site', sortSiteBtn], ['status', sortStatusBtn]]) {
    const isSorted = sort.key === key;
    btn.dataset.arrow = isSorted ? (sort.dir === 1 ? '↑' : '↓') : '';
    btn.classList.toggle('sorted', isSorted);
  }
}

function setSort(key) {
  if (sort.key === key) sort.dir *= -1;
  else sort = { key, dir: 1 };
  updateSortArrows();
  renderRuleList(rulesList, sortedRules());
}

sortSiteBtn.addEventListener('click', () => setSort('site'));
sortStatusBtn.addEventListener('click', () => setSort('status'));

// ── Render rules list ──

async function render() {
  currentRules = await getRules();
  const empty = currentRules.length === 0;
  noRulesMsg.style.display = empty ? '' : 'none';
  updateSortArrows();
  renderRuleList(rulesList, sortedRules());
  refreshPreview();
  renderStats();
}

// ── Save new rule ──

saveBtn.addEventListener('click', async () => {
  const { host, path } = parseTarget(formTarget.value);
  const fields = formLimitFields();
  if (!host || !fields.limit || !isValidHost(host)) return;
  if (scope === 'pathPrefix' && !path) return;

  const newRule = {
    target: host,
    path: scope === 'pathPrefix' ? path : undefined,
    matchType: scope,
    ...fields,
  };
  if (findCoveringRule(currentRules, newRule)) return;
  const redundant = findRedundantRules(currentRules, newRule);

  await addRule(newRule);

  formTarget.value = '';
  document.querySelector('#form-limit').value = '10';
  refreshPreview();
  await render();

  showRedundantPrompt(redundant);
});

function showRedundantPrompt(redundant) {
  if (!redundant.length) {
    redundantPrompt.style.display = 'none';
    return;
  }
  const n = redundant.length;
  redundantText.textContent =
    `The rule you just added is stricter than ${n} existing ${n === 1 ? 'rule' : 'rules'} and would always block first. Disable ${n === 1 ? 'it' : 'them'}?`;
  redundantList.innerHTML = redundant.map(r => `<li>${matchLabel(r)}</li>`).join('');
  redundantDisableBtn.dataset.ids = redundant.map(r => r.id).join(',');
  redundantPrompt.removeAttribute('hidden');
  redundantPrompt.style.display = '';
}

redundantDisableBtn.addEventListener('click', async () => {
  const ids = redundantDisableBtn.dataset.ids.split(',');
  await disableRules(ids);
  redundantPrompt.style.display = 'none';
  render();
});

redundantKeepBtn.addEventListener('click', () => {
  redundantPrompt.style.display = 'none';
});

// ── Inline row editor ──

function editDropdown(id, options, selected) {
  const label = options.find(o => o.value === selected)?.label ?? selected;
  const items = options.map(o => `<button type="button" value="${o.value}">${o.label}</button>`).join('');
  return `
    <div class="custom-dropdown">
      <button type="button" class="dropdown-btn" id="${id}-btn" data-value="${selected}">${label}<span class="dropdown-arrow">▼</span></button>
      <div class="dropdown-menu" id="${id}-menu">${items}</div>
    </div>`;
}

const UNIT_OPTIONS   = [{ value: 'minutes', label: 'min' }, { value: 'hours', label: 'hours' }, { value: 'days', label: 'days' }];
const PERIOD_OPTIONS = [{ value: 'hour', label: 'hour' }, { value: 'day', label: 'day' }, { value: 'week', label: 'week' }];

function openRowEditor(id) {
  const rule = currentRules.find(r => r.id === id);
  const li = document.querySelector(`#rule-${id}`);
  if (!rule || !li) return;
  li.querySelectorAll('.edit-btn, .toggle-btn, .delete-btn').forEach(b => b.remove());
  li.insertAdjacentHTML('beforeend', `
    <div class="form-row" id="edit-controls">
      <input id="edit-limit" type="number" value="${rule.limit}" min="1" />
      ${editDropdown('edit-unit', UNIT_OPTIONS, rule.limitUnit)}
      <span>per</span>
      ${editDropdown('edit-period', PERIOD_OPTIONS, rule.period)}
      <button class="save-edit-btn square-btn" data-id="${id}">✓</button>
      <button class="cancel-edit-btn square-btn">↩</button>
    </div>`);
  initCustomDropdowns(li);
  li.querySelector('#edit-limit').focus();
}

rulesList.addEventListener('click', async (e) => {
  if (e.target.classList.contains('cancel-edit-btn')) { render(); return; }
  if (e.target.classList.contains('save-edit-btn')) {
    const id = e.target.dataset.id;
    const limit = parseInt(rulesList.querySelector('#edit-limit').value);
    if (!limit) return;
    await updateRule(id, {
      limit,
      limitUnit: rulesList.querySelector('#edit-unit-btn').dataset.value,
      period: rulesList.querySelector('#edit-period-btn').dataset.value,
    });
    render();
    return;
  }

  const id = e.target.dataset.id;
  if (!id) return;
  if (e.target.classList.contains('edit-btn'))   { await render(); openRowEditor(id); return; }
  if (e.target.classList.contains('toggle-btn')) await toggleRule(id);
  if (e.target.classList.contains('delete-btn')) await deleteRule(id);
  render();
});

// ── Stats + sparkline ──

// Returns the 7 calendar day keys ending today (oldest first).
function last7DayKeys() {
  const keys = [];
  const now = Date.now();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(localDayKey(d.getTime()));
  }
  return keys;
}

// Returns the Monday-through-today day keys for the current calendar week.
function thisWeekKeys() {
  const keys = [];
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
  for (let i = dow; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(localDayKey(d.getTime()));
  }
  return keys;
}

async function renderStats() {
  const { [BLOCKS_DAY_KEY]: blocksByDay = {} } = await chrome.storage.local.get(BLOCKS_DAY_KEY);
  const rules = currentRules;

  // Overview card
  const weekKeys = thisWeekKeys();
  let weekTotal = 0;
  const blocksByRuleKey = {};
  for (const dayKey of weekKeys) {
    const day = blocksByDay[dayKey] ?? {};
    for (const [key, count] of Object.entries(day)) {
      weekTotal += count;
      blocksByRuleKey[key] = (blocksByRuleKey[key] ?? 0) + count;
    }
  }

  const activeCount = rules.filter(r => r.enabled).length;

  // Most blocked: stable key with highest week count, resolved to its label
  let mostBlocked = '—';
  if (Object.keys(blocksByRuleKey).length) {
    const topKey = Object.entries(blocksByRuleKey).sort((a, b) => b[1] - a[1])[0][0];
    const topRule = rules.find(r => blockKey(r) === topKey);
    mostBlocked = topRule ? matchLabel(topRule) : '—';
  }

  const days7 = last7DayKeys();
  const dailyCounts = days7.map(k => Object.values(blocksByDay[k] ?? {}).reduce((s, n) => s + n, 0));
  const avgPerDay = dailyCounts.length
    ? Math.round(dailyCounts.reduce((s, n) => s + n, 0) / dailyCounts.length)
    : 0;

  document.querySelector('#stat-blocks').textContent = weekTotal;
  document.querySelector('#stat-most-blocked').textContent = mostBlocked;
  const activeEl = document.querySelector('#stat-active');
  activeEl.innerHTML = rules.length
    ? `${activeCount}<span class="stat-sub"> out of ${rules.length}</span>`
    : activeCount;
  document.querySelector('#stat-avg').textContent = avgPerDay;

  // Sparkline
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const rootStyle = getComputedStyle(document.documentElement);

  const sparkData = days7.map((k, i) => {
    const d = new Date(k + 'T12:00:00');
    const dow = (d.getDay() + 6) % 7;
    return {
      label: DAY_LABELS[dow],
      range: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      count: dailyCounts[i],
    };
  });

  const hasData = dailyCounts.some(n => n > 0);
  document.querySelector('#spark-chart').style.display = hasData ? '' : 'none';
  document.querySelector('#spark-no-data').style.display = hasData ? 'none' : '';

  drawBarChart({
    svgEl: document.querySelector('#spark-chart'),
    tooltipEl: document.querySelector('#spark-tooltip'),
    data: sparkData,
    maxVal: Math.max(...dailyCounts, 1),
    getValue: d => d.count,
    formatVal: v => String(Math.round(v)),
    color: rootStyle.getPropertyValue('--color-accent').trim(),
  });
}

// ── Init ──

const prefillTarget = new URLSearchParams(location.search).get('target');
if (prefillTarget) {
  formTarget.value = prefillTarget;
  // Open the add card if pre-filled from "Limit this site"
  addCard.classList.add('open');
  addCardBody.removeAttribute('hidden');
}

initCustomDropdowns();
constrainLimitForm();

document.querySelectorAll('#form-unit-menu button, #form-period-menu button').forEach(opt => {
  opt.addEventListener('click', () => { constrainLimitForm(); refreshPreview(); });
});
document.querySelectorAll('#form-mode-menu button').forEach(opt => opt.addEventListener('click', refreshPreview));
document.querySelector('#form-limit').addEventListener('input', () => {
  const el = document.querySelector('#form-limit');
  const max = parseInt(el.max);
  if (max && parseInt(el.value) > max) el.value = max;
  refreshPreview();
});

refreshPreview();
render();

// ── Tour ──

const rulesTourSteps = [
  {
    selector: '#add-card',
    title: 'Add a rule',
    body: 'Use this form to set a time limit for any site. Choose the scope, set a limit, and click Add rule.',
  },
  {
    selector: '#list-area',
    title: 'Your rules',
    body: 'All your active rules are listed here. You can toggle, edit, or delete each one.',
  },
  {
    selector: '#sparkline-card',
    title: 'Blocks per day',
    body: 'This chart shows how often your rules triggered a block over the last 7 days.',
  },
  {
    selector: '#back-btn',
    title: 'Back to the dashboard',
    body: 'Click the BiteGuard logo to return to the dashboard and continue the tour.',
    handoff: { nextSurface: 'dashboard', nextStepIndex: 8, mode: 'crossDocument' },
  },
];

autoStartIfMatches('rules', rulesTourSteps, { firstNewStep: 0 });
