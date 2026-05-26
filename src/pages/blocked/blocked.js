import { RULE_MULTIPLIERS, matchLabel } from '../../shared/rules.js';
import { formatMs, localDayKey, localHourKey } from '../../shared/timeUtils.js';

document.querySelector('#logo').src =
  chrome.runtime.getURL('resources/icons/biteguard-icon-blue-square-128px.png');

const params = new URLSearchParams(location.search);
const ruleId = params.get('rule');
const site = params.get('site');
const path = params.get('path');

const target = site && path ? `${site}/${path}` : site;
if (target) document.title = `Blocked: ${target} – BiteGuard`;

// When the rule's period window next resets, in local time.
function nextReset(period, now = new Date()) {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  if (period === 'hour') {
    d.setHours(d.getHours() + 1);
    return d;
  }
  d.setHours(0);
  if (period === 'week') {
    const daysUntilMonday = (8 - (now.getDay() || 7)) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    return d;
  }
  d.setDate(d.getDate() + 1); // 'day'
  return d;
}

function formatCountdown(ms) {
  if (ms <= 0) return 'now';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Sum usage for this rule over today's bucket(s).
function sumTodayUsage(rule, stores) {
  const now = Date.now();
  const dayKey = localDayKey(now);
  const hourKey = localHourKey(now);
  const { analyticsByDay = {}, analyticsByHour = {}, subpagesByDay = {}, subpagesByHour = {} } = stores;

  const isHour = rule.period === 'hour';
  const siteBucket = isHour ? analyticsByHour[hourKey] : analyticsByDay[dayKey];
  const subpageBucket = isHour ? subpagesByHour[hourKey] : subpagesByDay[dayKey];

  if (rule.matchType === 'pathPrefix') {
    const paths = subpageBucket?.[rule.target];
    if (!paths) return { activeMs: 0, visits: 0 };
    const base = '/' + (rule.path ?? '').replace(/^\//, '');
    let activeMs = 0, visits = 0;
    for (const [p, cell] of Object.entries(paths)) {
      const under = p === base || (p.startsWith(base) && (p[base.length] === '/' || p[base.length] === '?'));
      if (!under) continue;
      activeMs += cell.activeMs ?? 0;
      visits += cell.visits ?? 0;
    }
    return { activeMs, visits };
  }

  if (rule.matchType === 'subdomain') {
    let activeMs = 0, visits = 0;
    for (const [siteId, cell] of Object.entries(siteBucket ?? {})) {
      if (siteId === rule.target || siteId.endsWith(`.${rule.target}`)) {
        activeMs += cell.activeMs ?? 0;
        visits += cell.visits ?? 0;
      }
    }
    return { activeMs, visits };
  }

  // host
  const cell = siteBucket?.[rule.target];
  return { activeMs: cell?.activeMs ?? 0, visits: cell?.visits ?? 0 };
}

(async () => {
  if (!ruleId) return;

  const stores = await chrome.storage.local.get([
    'rules', 'analyticsByDay', 'analyticsByHour', 'subpagesByDay', 'subpagesByHour',
  ]);
  const rule = (stores.rules ?? []).find(r => r.id === ruleId);
  if (!rule) return;

  document.querySelector('#target').textContent = matchLabel(rule);

  const limitMs = rule.limit * (RULE_MULTIPLIERS[rule.limitUnit] ?? 60000);
  document.querySelector('#stat-limit').textContent = `${formatMs(limitMs)} / ${rule.period}`;

  const { activeMs, visits } = sumTodayUsage(rule, stores);
  document.querySelector('#stat-spent').textContent = formatMs(activeMs) || '0m';
  document.querySelector('#stat-visits').textContent = String(visits);

  const resetDate = nextReset(rule.period);
  const cdEl = document.querySelector('#stat-countdown');
  function tick() { cdEl.textContent = formatCountdown(resetDate - Date.now()); }
  tick();
  setInterval(tick, 30000);
})();

import { pickQuote } from '../../shared/quotes.js';

(async () => {
  const q = await pickQuote(site ?? '');
  if (!q) return;
  const quoteEl = document.querySelector('#quote');

  // Render quote text with source link
  const textEl = document.querySelector('#quote-text');
  textEl.textContent = `"${q.text}"`;
  if (q.source) {
    const sourceLink = document.createElement('a');
    sourceLink.className = 'link-btn';
    sourceLink.textContent = ' ↗';
    sourceLink.href = q.source;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    textEl.appendChild(sourceLink);
  }

  // Render author line with optional philosophy link
  if (q.author) {
    const wrapperEl = document.querySelector('#quote-author-wrapper');
    const authorSpan = document.createElement('span');
    authorSpan.textContent = `— ${q.author}`;
    wrapperEl.appendChild(authorSpan);

    if (q.philosophySource) {
      const discoverLink = document.createElement('a');
      discoverLink.className = 'link-btn';
      discoverLink.textContent = ' (discover ↗)';
      discoverLink.href = q.philosophySource;
      discoverLink.target = '_blank';
      discoverLink.rel = 'noopener noreferrer';
      wrapperEl.appendChild(discoverLink);
    }
  }

  quoteEl.removeAttribute('hidden');
})();
