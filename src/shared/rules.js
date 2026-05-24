import { formatMs } from './timeUtils.js';

export const RULE_MULTIPLIERS = { minutes: 60000, hours: 3600000, days: 86400000 };

const MODE_LABELS = { active: 'active', audio: 'audio', 'active+audio': 'active + audio' };
const SCOPE_LABELS = { host: 'This host only', subdomain: 'Whole site', pathPrefix: 'A specific page' };

function matchLabel(rule) {
  if (rule.matchType === 'subdomain') return `*.${rule.target}`;
  if (rule.matchType === 'pathPrefix') return rule.path ? `${rule.target}/${rule.path}` : `${rule.target}/`;
  return rule.target;
}

// Escape RE2 metacharacters in a literal host/path fragment.
function reEsc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Resolve a rule's scope into a plain-English description and the DNR matcher
// it compiles to: { kind: 'urlFilter' | 'regexFilter', value }. Pure — used by
// the form's live preview and (later) the DNR publisher. See the spec's
// "Matching against tracking data" section for why each shape is what it is.
export function describeRule({ target, path, matchType }) {
  const host = target || 'google.com';
  if (matchType === 'subdomain') {
    // Subdomains are wanted here — DNR's || domain anchor is naturally inclusive.
    return { text: `${host} and all its subdomains`, kind: 'urlFilter', value: `||${host}^` };
  }
  if (matchType === 'pathPrefix') {
    const p = (path || '').replace(/^\//, '');
    // Boundary-anchored so /maps doesn't also catch /maps-something.
    return {
      text: `${host}/${p} and everything under it`,
      kind: 'regexFilter', value: `^https?://${reEsc(host)}/${reEsc(p)}(?:[/?]|$)`,
    };
  }
  // host: exact host, excludes subdomains. || is subdomain-inclusive, so this
  // needs an anchored regex; optional www. matches how tracking collapses it.
  return {
    text: `${host} only (not subdomains)`,
    kind: 'regexFilter', value: `^https?://(?:www\\.)?${reEsc(host)}(?:/|$)`,
  };
}

export async function getRules() {
  const { rules = [] } = await chrome.storage.local.get('rules');
  return rules;
}

export async function addRule({ target, path, matchType, limit, limitUnit, period, mode }) {
  const rule = {
    id: crypto.randomUUID(),
    target,
    matchType,
    limit,
    limitUnit,
    period,
    enabled: true,
    mode,
  };
  if (path) rule.path = path;
  const rules = await getRules();
  await chrome.storage.local.set({ rules: [...rules, rule] });
}

export async function toggleRule(id) {
  const rules = await getRules();
  await chrome.storage.local.set({
    rules: rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r),
  });
}

export async function deleteRule(id) {
  const rules = await getRules();
  await chrome.storage.local.set({ rules: rules.filter(r => r.id !== id) });
}

export function renderRuleList(listEl, rules) {
  listEl.innerHTML = rules.map(rule => {
    const limitMs = rule.limit * (RULE_MULTIPLIERS[rule.limitUnit] ?? 60000);
    return `
    <li class="${rule.enabled ? '' : 'disabled'}">
      <div class="rule-info">
        <strong>${matchLabel(rule)}</strong>
        <span>${SCOPE_LABELS[rule.matchType]} · ${formatMs(limitMs)} per ${rule.period} · ${MODE_LABELS[rule.mode]}</span>
      </div>
      <button class="toggle-btn square-btn" data-id="${rule.id}">${rule.enabled ? '●' : '○'}</button>
      <button class="delete-btn square-btn" data-id="${rule.id}">✕</button>
    </li>`;
  }).join('');
}

export function initCustomDropdowns(root = document) {
  root.querySelectorAll('.dropdown-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      const isOpen = menu.classList.contains('open');
      root.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
      if (!isOpen) menu.classList.add('open');
    });
  });

  root.querySelectorAll('.dropdown-menu:not(#theme-dropdown):not(#form-matchtype-menu) button').forEach(option => {
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
    root.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  });
}
