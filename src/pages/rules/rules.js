import { getRules, addRule, toggleRule, deleteRule, updateRule, renderRuleList, initCustomDropdowns, describeRule, findCoveringRule, findRedundantRules, disableRules, matchLabel } from '../../shared/rules.js';
import { getDomain } from '../../vendor/tldts.js';

const addForm = document.querySelector('#add-form');
const formTarget = document.querySelector('#form-target');
const cards = [...document.querySelectorAll('.scope-card')];
const previewText = document.querySelector('#preview-text');
const previewPattern = document.querySelector('#preview-pattern');
const saveBtn = document.querySelector('#save-btn');
const rulesList = document.querySelector('#rules-list');
const noRulesMsg = document.querySelector('#no-rules-message');
const redundantPrompt = document.querySelector('#redundant-prompt');
const redundantText = document.querySelector('#redundant-text');
const redundantList = document.querySelector('#redundant-list');
const redundantDisableBtn = document.querySelector('#redundant-disable-btn');
const redundantKeepBtn = document.querySelector('#redundant-keep-btn');
const sortBar = document.querySelector('#sort-bar');
const sortSiteBtn = document.querySelector('#sort-site');
const sortStatusBtn = document.querySelector('#sort-status');

let scope = 'subdomain';
// Cached so refreshPreview can check the typed rule against existing ones
// without an async storage read on every keystroke. render() keeps it fresh.
let currentRules = [];
// List sort, session-only (resets on reload). Default: site A–Z.
let sort = { key: 'site', dir: 1 };

// Split a typed address into { host, path }: strip any scheme and a leading
// www. (tracking collapses www. into the apex), then everything before the
// first slash is the host and the rest is the path.
function parseTarget(raw) {
  const clean = raw.trim().replace(/^https?:\/\//, '').replace(/^www\./, '');
  const slash = clean.indexOf('/');
  if (slash === -1) return { host: clean.toLowerCase(), path: '' };
  return { host: clean.slice(0, slash).toLowerCase(), path: clean.slice(slash + 1) };
}

// A host is valid if tldts resolves it to a registrable domain (rejects bare
// words like "dfdsf", but accepts reddit.com, sub.example.co.uk, etc.).
function isValidHost(host) {
  return !!getDomain(host);
}

const UNIT_MAX = {
  minutes: { hour: 60,   day: 1440,  week: 10080 },
  hours:   {             day: 24,    week: 168   },
  days:    {                         week: 7     },
};

// Keep unit and period menus mutually consistent and clamp the limit value.
// Called after any change to unit, period, or on init.
function constrainLimitForm() {
  const unitBtn   = document.querySelector('#form-unit-btn');
  const periodBtn = document.querySelector('#form-period-btn');
  const limitInput = document.querySelector('#form-limit');
  const unit   = unitBtn.dataset.value;
  const period = periodBtn.dataset.value;

  // Which periods are valid for the current unit?
  const validPeriods = Object.keys(UNIT_MAX[unit] ?? {});
  document.querySelectorAll('#form-period-menu button').forEach(opt => {
    opt.disabled = !validPeriods.includes(opt.value);
  });

  // Which units are valid for the current period?
  document.querySelectorAll('#form-unit-menu button').forEach(opt => {
    opt.disabled = !(UNIT_MAX[opt.value] ?? {})[period];
  });

  // If current period is now invalid for the unit, switch to first valid one.
  if (!validPeriods.includes(period)) {
    const next = validPeriods[0];
    periodBtn.firstChild.textContent = document.querySelector(`#form-period-menu button[value="${next}"]`).textContent;
    periodBtn.dataset.value = next;
  }

  // Clamp the limit to the max for the (possibly corrected) combo.
  const effectivePeriod = periodBtn.dataset.value;
  const max = (UNIT_MAX[unit] ?? {})[effectivePeriod];
  if (max !== undefined) {
    limitInput.max = max;
    if (parseInt(limitInput.value) > max) limitInput.value = max;
  }
}

// The limit/unit/period/mode the form currently has selected.
function formLimitFields() {
  return {
    limit: parseInt(document.querySelector('#form-limit').value),
    limitUnit: document.querySelector('#form-unit-btn').dataset.value,
    period: document.querySelector('#form-period-btn').dataset.value,
    mode: document.querySelector('#form-mode-btn').dataset.value,
  };
}

// Update each card's example to reflect the typed host/path.
function refreshExamples(host, path) {
  const h = host || formTarget.placeholder;
  document.querySelector('#ex-host').textContent = h;
  document.querySelector('#ex-subdomain').textContent = `*.${h}`;
  document.querySelector('#ex-page').textContent = path ? `${h}/${path}` : `${h}/maps`;
}

function selectScope(next, { silent } = {}) {
  scope = next;
  cards.forEach(c => c.classList.toggle('active', c.dataset.scope === next));
  if (!silent) refreshPreview();
}

function refreshPreview() {
  const { host, path } = parseTarget(formTarget.value);
  // Auto-detect: a path in the input implies page scope.
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
  const period = candidate.period;
  const covering = findCoveringRule(currentRules, candidate);
  if (covering) {
    previewText.innerHTML =
      `An existing ${period} rule (<a href="#rule-${covering.id}" id="covering-link" class="link-btn">${matchLabel(covering)}</a>) already covers this.`;
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

// The dedupe hint links to the covering rule (#covering-link → #rule-<id>).
// Delegated because the link is rebuilt on every keystroke. Scroll to that row
// and flash it instead of a jarring jump.
previewText.addEventListener('click', (e) => {
  const link = e.target.closest('#covering-link');
  if (!link) return;
  e.preventDefault();
  const row = document.querySelector(link.getAttribute('href'));
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.remove('flash');
  void row.offsetWidth; // restart the animation if it's already flashing
  row.classList.add('flash');
});

// A copy of the rules sorted by the current sort. 'site' is A–Z by target (with
// path as tiebreak); 'status' puts enabled rules first. dir flips the order.
function sortedRules() {
  const cmp = sort.key === 'status'
    ? (a, b) => Number(b.enabled) - Number(a.enabled)
    : (a, b) => (a.target + (a.path || '')).localeCompare(b.target + (b.path || ''));
  return [...currentRules].sort((a, b) => sort.dir * cmp(a, b));
}

// Mark the active sort header .sorted and set its arrow via a data attribute —
// a fixed-width ::after slot so the label doesn't shift when the arrow appears.
function updateSortArrows() {
  for (const [key, btn] of [['site', sortSiteBtn], ['status', sortStatusBtn]]) {
    const isSorted = sort.key === key;
    btn.dataset.arrow = isSorted ? (sort.dir === 1 ? '↑' : '↓') : '';
    btn.classList.toggle('sorted', isSorted);
  }
}

// Click a header: switch to its key (ascending), or flip direction if already on it.
function setSort(key) {
  if (sort.key === key) sort.dir *= -1;
  else sort = { key, dir: 1 };
  updateSortArrows();
  renderRuleList(rulesList, sortedRules());
}

async function render() {
  currentRules = await getRules();
  const empty = currentRules.length === 0;
  noRulesMsg.style.display = empty ? '' : 'none';
  sortBar.removeAttribute('hidden'); // clear the static initial hidden state once
  sortBar.style.display = empty ? 'none' : '';
  updateSortArrows();
  renderRuleList(rulesList, sortedRules());
  refreshPreview(); // re-check the typed rule against the refreshed list
}

sortSiteBtn.addEventListener('click', () => setSort('site'));
sortStatusBtn.addEventListener('click', () => setSort('status'));

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
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
  // Existing rules this one makes redundant (it's stricter and covers them) —
  // computed against the pre-add list, before render() refreshes currentRules.
  const redundant = findRedundantRules(currentRules, newRule);

  await addRule(newRule);

  formTarget.value = '';
  document.querySelector('#form-limit').value = '10';
  refreshPreview();
  await render();

  showRedundantPrompt(redundant);
});

// Offer to disable rules the just-added rule made redundant. Disabling (not
// deleting) keeps the choice reversible via the rule's own toggle.
function showRedundantPrompt(redundant) {
  if (!redundant.length) {
    redundantPrompt.style.display = 'none';
    return;
  }
  const n = redundant.length;
  redundantText.textContent =
    `The rule you just added is stricter than ${n} existing ${n === 1 ? 'rule' : 'rules'} and would always block first. Disable ${n === 1 ? 'it' : 'them'}?`;
  // Plain read-only labels — not renderRuleList, which would duplicate the
  // rule-<id> anchors and emit dead toggle/delete buttons.
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

// A unit/period dropdown for the inline row editor, with `selected` pre-chosen.
// Mirrors the add-form dropdowns so initCustomDropdowns wires it the same way.
function editDropdown(id, options, selected) {
  const label = options.find(o => o.value === selected)?.label ?? selected;
  const items = options.map(o => `<button type="button" value="${o.value}">${o.label}</button>`).join('');
  return `
    <div class="custom-dropdown">
      <button type="button" class="dropdown-btn" id="${id}-btn" data-value="${selected}">${label}<span class="dropdown-arrow">▼</span></button>
      <div class="dropdown-menu" id="${id}-menu">${items}</div>
    </div>`;
}

const UNIT_OPTIONS = [{ value: 'minutes', label: 'min' }, { value: 'hours', label: 'hours' }, { value: 'days', label: 'days' }];
const PERIOD_OPTIONS = [{ value: 'hour', label: 'hour' }, { value: 'day', label: 'day' }, { value: 'week', label: 'week' }];

// Swap a rule row into an inline editor for its limit + period (target/scope/mode
// aren't editable — change those by deleting and re-adding).
function openRowEditor(id) {
  const rule = currentRules.find(r => r.id === id);
  const li = document.querySelector(`#rule-${id}`);
  if (!rule || !li) return;
  // Keep the two info lines so the row height doesn't change; replace only the
  // action buttons with the limit/period controls (in a .form-row to reuse the
  // create-form's narrow number-input styling).
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
  if (e.target.classList.contains('edit-btn')) { await render(); openRowEditor(id); return; }
  if (e.target.classList.contains('toggle-btn')) await toggleRule(id);
  if (e.target.classList.contains('delete-btn')) await deleteRule(id);
  render();
});

initCustomDropdowns();
constrainLimitForm();
// Limit, unit, period and mode all feed the dedupe/redundancy check, so re-run
// the preview when any of them changes. The dropdown option handler in
// initCustomDropdowns calls stopPropagation, so listen on the option buttons
// directly; registered after initCustomDropdowns so its handler sets
// dataset.value first, before ours reads it.
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
const prefillTarget = new URLSearchParams(location.search).get('target');
if (prefillTarget) {
  formTarget.value = prefillTarget;
}
refreshPreview();
render();
