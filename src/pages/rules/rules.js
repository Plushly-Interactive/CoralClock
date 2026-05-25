import { getRules, addRule, toggleRule, deleteRule, renderRuleList, initCustomDropdowns, describeRule, findCoveringRule, matchLabel } from '../../shared/rules.js';
import { getDomain } from '../../vendor/tldts.js';

const addForm = document.querySelector('#add-form');
const formTarget = document.querySelector('#form-target');
const cards = [...document.querySelectorAll('.scope-card')];
const previewText = document.querySelector('#preview-text');
const previewPattern = document.querySelector('#preview-pattern');
const saveBtn = document.querySelector('#save-btn');
const rulesList = document.querySelector('#rules-list');
const noRulesMsg = document.querySelector('#no-rules-message');

let scope = 'subdomain';
// Cached so refreshPreview can check the typed rule against existing ones
// without an async storage read on every keystroke. render() keeps it fresh.
let currentRules = [];

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
  const period = document.querySelector('#form-period-btn').dataset.value;
  const covering = findCoveringRule(currentRules, { target: host, path, matchType: scope, period });
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

async function render() {
  currentRules = await getRules();
  noRulesMsg.style.display = currentRules.length === 0 ? '' : 'none';
  renderRuleList(rulesList, currentRules);
  refreshPreview(); // re-check the typed rule against the refreshed list
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { host, path } = parseTarget(formTarget.value);
  const limit = parseInt(document.querySelector('#form-limit').value);
  if (!host || !limit || !isValidHost(host)) return;
  if (scope === 'pathPrefix' && !path) return;
  const period = document.querySelector('#form-period-btn').dataset.value;
  if (findCoveringRule(currentRules, { target: host, path, matchType: scope, period })) return;

  await addRule({
    target: host,
    path: scope === 'pathPrefix' ? path : undefined,
    matchType: scope,
    limit,
    limitUnit: document.querySelector('#form-unit-btn').dataset.value,
    period,
    mode: document.querySelector('#form-mode-btn').dataset.value,
  });

  formTarget.value = '';
  document.querySelector('#form-limit').value = '10';
  refreshPreview();
  render();
});

rulesList.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  if (e.target.classList.contains('toggle-btn')) await toggleRule(id);
  if (e.target.classList.contains('delete-btn')) await deleteRule(id);
  render();
});

initCustomDropdowns();
// Re-check the preview when the period changes (it's part of the dedupe key).
// The option handler in initCustomDropdowns calls stopPropagation, so listen on
// the option buttons directly; registered after initCustomDropdowns so its
// handler sets dataset.value first, before ours reads it.
document.querySelectorAll('#form-period-menu button').forEach(
  opt => opt.addEventListener('click', refreshPreview));
refreshPreview();
render();
