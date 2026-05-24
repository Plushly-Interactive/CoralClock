import { getRules, addRule, toggleRule, deleteRule, renderRuleList, initCustomDropdowns, describeRule } from '../../shared/rules.js';

const addForm = document.querySelector('#add-form');
const formTarget = document.querySelector('#form-target');
const cards = [...document.querySelectorAll('.scope-card')];
const previewText = document.querySelector('#preview-text');
const previewPattern = document.querySelector('#preview-pattern');
const saveBtn = document.querySelector('#save-btn');
const rulesList = document.querySelector('#rules-list');
const noRulesMsg = document.querySelector('#no-rules-message');

let scope = 'subdomain';

// Split a typed address into { host, path }: everything before the first slash
// is the host, the rest (if any) is the path.
function parseTarget(raw) {
  const clean = raw.trim().replace(/^https?:\/\//, '');
  const slash = clean.indexOf('/');
  if (slash === -1) return { host: clean, path: '' };
  return { host: clean.slice(0, slash), path: clean.slice(slash + 1) };
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
  if (scope === 'pathPrefix' && !path) {
    previewText.textContent = 'Add a /path to limit a specific page.';
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

async function render() {
  const rules = await getRules();
  noRulesMsg.style.display = rules.length === 0 ? '' : 'none';
  renderRuleList(rulesList, rules);
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { host, path } = parseTarget(formTarget.value);
  const limit = parseInt(document.querySelector('#form-limit').value);
  if (!host || !limit) return;
  if (scope === 'pathPrefix' && !path) return;

  await addRule({
    target: host,
    path: scope === 'pathPrefix' ? path : undefined,
    matchType: scope,
    limit,
    limitUnit: document.querySelector('#form-unit-btn').dataset.value,
    period: document.querySelector('#form-period-btn').dataset.value,
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
refreshPreview();
render();
