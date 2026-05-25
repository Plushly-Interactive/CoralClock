import { formatMs } from './timeUtils.js';

export const RULE_MULTIPLIERS = { minutes: 60000, hours: 3600000, days: 86400000 };

const MODE_LABELS = { active: 'active', audio: 'audio', 'active+audio': 'active + audio' };
const SCOPE_LABELS = { host: 'This host only', subdomain: 'Whole site', pathPrefix: 'A specific page' };

export function matchLabel(rule) {
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

// Does rule `a`'s URL scope cover rule `b`'s (ignoring period/limit)?
//  - subdomain (whole site) covers any rule whose target is the apex or a
//    subdomain of it (host, pathPrefix, or another subdomain).
//  - host covers host/pathPrefix on the same exact host.
//  - pathPrefix covers a pathPrefix whose path sits under its own path.
// Equal scope is covered by all three branches (a == b ⇒ true).
function coversScope(a, b) {
  if (a.matchType === 'subdomain') {
    return b.target === a.target || b.target.endsWith(`.${a.target}`);
  }
  if (b.target !== a.target) return false;
  if (a.matchType === 'host') return b.matchType === 'host' || b.matchType === 'pathPrefix';
  // a is pathPrefix: only covers a page rule nested under it.
  if (b.matchType !== 'pathPrefix') return false;
  const base = (a.path || '').replace(/^\//, '');
  const sub = (b.path || '').replace(/^\//, '');
  return sub === base || sub.startsWith(`${base}/`);
}

// The first existing rule that makes `candidate` a no-op — same period, scope
// covers it, and the existing limit is no looser than the candidate's, so adding
// it would change nothing. (A *stricter* candidate isn't a no-op: it's allowed
// in, and findRedundantRules then offers to disable the looser existing rule.)
// mode must match too. The form's live preview uses this to refuse a true
// duplicate and link to the rule at fault.
export function findCoveringRule(rules, candidate) {
  const candMs = limitMsOf(candidate);
  return rules.find(r =>
    r.enabled && // a disabled rule blocks nothing, so it can't cover anything
    r.period === candidate.period &&
    r.mode === candidate.mode &&
    coversScope(r, candidate) &&
    limitMsOf(r) <= candMs);
}

function limitMsOf(rule) {
  return rule.limit * (RULE_MULTIPLIERS[rule.limitUnit] ?? 60000);
}

// Periods ordered shortest → longest, for cross-period subsumption.
const PERIOD_RANK = { hour: 0, day: 1, week: 2 };

// Existing enabled rules that `newRule` makes redundant — it would always block
// them first, so they can never trigger. Beyond scope coverage and matching mode
// (active/audio/active+audio measure different usage), the new rule must be at
// least as strict in every window: a smaller-or-equal limit (`Lₙ ≤ Lₒ`) over a
// longer-or-equal period (`Pₙ ≥ Pₒ`). A budget of Lₙ over a long window caps any
// shorter sub-window at Lₙ ≤ Lₒ too, so the old rule never binds. Conservative:
// e.g. 5m/day subsumes 5m/hour, but 10m/day does not (its limit is looser).
export function findRedundantRules(rules, newRule) {
  const newMs = limitMsOf(newRule);
  const newRank = PERIOD_RANK[newRule.period];
  return rules.filter(r =>
    r.enabled &&
    r.id !== newRule.id &&
    r.mode === newRule.mode &&
    coversScope(newRule, r) &&
    newMs <= limitMsOf(r) &&
    newRank >= PERIOD_RANK[r.period]);
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

// Disable several rules in one write (used when a newly-added rule makes them
// redundant). Disable rather than delete so the choice is reversible.
export async function disableRules(ids) {
  const set = new Set(ids);
  const rules = await getRules();
  await chrome.storage.local.set({
    rules: rules.map(r => set.has(r.id) ? { ...r, enabled: false } : r),
  });
}

export function renderRuleList(listEl, rules) {
  listEl.innerHTML = rules.map(rule => {
    const limitMs = rule.limit * (RULE_MULTIPLIERS[rule.limitUnit] ?? 60000);
    return `
    <li id="rule-${rule.id}" class="${rule.enabled ? '' : 'disabled'}">
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
