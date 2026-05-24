import { formatMs, RULE_MULTIPLIERS } from '../../shared/rules.js';

const params = new URLSearchParams(location.search);
const ruleId = params.get('rule');
const site = params.get('site');
const path = params.get('path');

const target = site && path ? `${site}/${path}` : site;
if (target) {
  document.querySelector('#msg').textContent = `You've reached your limit on ${target}.`;
  document.title = `Blocked: ${target} – BiteGuard`;
}

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
    // Next Monday 00:00 (calendar week, Monday-start).
    const daysUntilMonday = (8 - (now.getDay() || 7)) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    return d;
  }
  d.setDate(d.getDate() + 1); // 'day'
  return d;
}

function formatReset(date) {
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Resets at ${time}.`;
  const day = date.toLocaleDateString([], { weekday: 'long' });
  return `Resets ${day} at ${time}.`;
}

(async () => {
  if (!ruleId) return;
  const { rules = [] } = await chrome.storage.local.get('rules');
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return;

  const limitMs = rule.limit * (RULE_MULTIPLIERS[rule.limitUnit] ?? 60000);
  const detail = document.querySelector('#detail');
  detail.textContent = `Your limit is ${formatMs(limitMs)} per ${rule.period}.`;
  detail.removeAttribute('hidden');

  const reset = document.querySelector('#reset');
  reset.textContent = formatReset(nextReset(rule.period));
  reset.removeAttribute('hidden');
})();
