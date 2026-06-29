import { RULE_MULTIPLIERS, matchLabel, computeRuleSpent, computeRuleVisits } from '../../shared/rules.js';
import { faviconUrl, loadFaviconCache } from '../../shared/utils.js';
import { formatMs, localDayKey } from '../../shared/timeUtils.js';
import { weekDow } from '../../shared/weekStart.js';
import { BRAND_NAME } from '../../shared/brand.js';

document.querySelector('#logo').src =
  chrome.runtime.getURL('resources/icons/reef-icon-square-128px.png');

const params = new URLSearchParams(location.search);
const ruleId = params.get('rule');
const site = params.get('site');
const path = params.get('path');

const target = site && path ? `${site}/${path}` : site;
if (target) document.title = `Blocked: ${target} – ${BRAND_NAME}`;

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
    const daysUntilNextWeekStart = 7 - weekDow(now);
    d.setDate(d.getDate() + daysUntilNextWeekStart);
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


(async () => {
  if (!ruleId) return;
  await loadFaviconCache();

  const stores = await chrome.storage.local.get([
    'rules', 'sitesByDay', 'sitesByHour', 'subpagesByDay', 'subpagesByHour',
  ]);
  const rule = (stores.rules ?? []).find(r => r.id === ruleId);
  if (!rule) return;

  const targetEl = document.querySelector('#target');
  let faviconHost = rule.target ?? null;
  if (!faviconHost) {
    const original = params.get('url');
    try { faviconHost = new URL(original).hostname.replace(/^www\./, ''); } catch {}
  }
  if (faviconHost) {
    const faviconImg = document.createElement('img');
    faviconImg.className = 'site-favicon';
    faviconImg.src = faviconUrl(faviconHost);
    faviconImg.alt = '';
    faviconImg.addEventListener('error', () => { faviconImg.style.display = 'none'; });
    targetEl.append(faviconImg);
  }
  targetEl.append(matchLabel(rule));

  const limitMs = rule.limit * (RULE_MULTIPLIERS[rule.limitUnit] ?? 60000);
  document.querySelector('#stat-limit').textContent = limitMs === 0 ? 'Never' : `${formatMs(limitMs)} / ${rule.period}`;

  const dayKey = localDayKey(Date.now());
  const activeMs = computeRuleSpent(rule, dayKey, stores);
  const visits = computeRuleVisits(rule, dayKey, stores);
  document.querySelector('#stat-spent').textContent = formatMs(activeMs) || '0m';
  document.querySelector('#stat-visits').textContent = String(visits);

  const resetDate = nextReset(rule.period);
  const cdEl = document.querySelector('#stat-countdown');
  function tick() { cdEl.textContent = formatCountdown(resetDate - Date.now()); }
  tick();
  setInterval(tick, 30000);
})();

import { pickQuote } from '../../shared/quotes.js';
import { QUOTES } from '../../shared/quotes.data.js';
import { PREF_FAVORITE_QUOTE_IDS } from '../../shared/prefKeys.js';

(async () => {
  const quoteId = params.get('quoteId');
  const q = quoteId
    ? (QUOTES.find(q => q.id === quoteId) ?? await pickQuote(site ?? ''))
    : await pickQuote(site ?? '');
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

  const actionsEl = document.querySelector('#quote-actions');
  const favBtn = document.querySelector('#fav-btn');
  const { [PREF_FAVORITE_QUOTE_IDS]: favIds = [] } = await chrome.storage.local.get(PREF_FAVORITE_QUOTE_IDS);
  if (favIds.includes(q.id)) favBtn.classList.add('favorited');
  actionsEl.removeAttribute('hidden');

  favBtn.addEventListener('click', async () => {
    const { [PREF_FAVORITE_QUOTE_IDS]: current = [] } = await chrome.storage.local.get(PREF_FAVORITE_QUOTE_IDS);
    const isFav = current.includes(q.id);
    const updated = isFav ? current.filter(id => id !== q.id) : [...current, q.id];
    await chrome.storage.local.set({ [PREF_FAVORITE_QUOTE_IDS]: updated });
    favBtn.classList.toggle('favorited', !isFav);
  });
})();
