import { getRules, renderRuleList } from '../../shared/rules.js';
import { loadFaviconCache } from '../../shared/utils.js';
import { autoStartIfMatches, readTourState } from '../../shared/tour.js';
import { initThemeMenu } from '../../shared/themeMenu.js';
import { localDayKey, formatMs, formatHourLabel, formatHourRange, formatTimeOfDay } from '../../shared/timeUtils.js';
import { PREF_CLOCK_FORMAT, PREF_FIRST_BROWSE_BY_DAY } from '../../shared/prefKeys.js';

document.querySelector('#dashboard-btn').addEventListener('click', async () => {
  const state = await readTourState();
  const inTourHandoff = state.inProgress?.surface === 'popup' || state.inProgress?.surface === 'dashboard';
  if (inTourHandoff) {
    const dashboardUrl = chrome.runtime.getURL('src/pages/dashboard/dashboard.html');
    const existing = await chrome.tabs.query({ url: `${dashboardUrl}*` });
    if (existing.length > 0) {
      await chrome.storage.local.set({ tourAdvanceRequest: Date.now() });
      await chrome.tabs.update(existing[0].id, { active: true });
      await chrome.windows.update(existing[0].windowId, { focused: true });
      window.close();
      return;
    }
  }
  chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard/dashboard.html') });
  window.close();
});

const rulesList = document.querySelector('#rules-list');

// The popup is a glanceable list + launcher; all rule editing lives on the
// dedicated rules page, opened here.
document.querySelector('#manage-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/rules/rules.html') });
  window.close();
});

// True elapsed browser-active ms for one hour: the deduplicated wallClockByHour
// value when present, else the per-site active+audio−overlap sum for hours that
// predate wall-clock tracking.
function wallClockHourMs(hourKey, wallClockByHour, sitesByHour) {
  if (wallClockByHour[hourKey] != null) return wallClockByHour[hourKey];
  const bucket = sitesByHour[hourKey] ?? {};
  return Object.values(bucket).reduce((s, c) =>
    s + (c.activeMs ?? 0) + (c.audioMs ?? 0) - (c.overlapMs ?? 0), 0);
}

async function renderTodayStats() {
  const today = localDayKey(Date.now());
  const { sitesByDay = {}, sitesByHour = {}, wallClockByHour = {}, [PREF_CLOCK_FORMAT]: clockFormat = '24h', [PREF_FIRST_BROWSE_BY_DAY]: firstBrowseByDay = {} } =
    await chrome.storage.local.get(['sitesByDay', 'sitesByHour', 'wallClockByHour', PREF_CLOCK_FORMAT, PREF_FIRST_BROWSE_BY_DAY]);
  const todaySites = sitesByDay[today] ?? {};

  // TODAY — wall-clock total: overlapping parallel-window time counted once,
  // summed across today's elapsed hours. Falls back to the per-site sum for any
  // hour predating wall-clock tracking.
  const currentHour = new Date().getHours();
  let totalMs = 0;
  for (let h = 0; h <= currentHour; h++) {
    totalMs += wallClockHourMs(`${today}T${String(h).padStart(2, '0')}`, wallClockByHour, sitesByHour);
  }
  document.querySelector('#stats-total-time').textContent = totalMs > 0 ? formatMs(totalMs) : '—';

  // SITES
  const sitesCount = Object.values(todaySites).filter(c => (c.visits ?? 0) > 0 || (c.activeMs ?? 0) > 0).length;
  document.querySelector('#stats-sites-count').textContent = sitesCount > 0 ? sitesCount : '—';

  // VS AVG — compare today-so-far (hours 0→now) against same hours averaged across past days
  const pastDayKeys = Object.keys(sitesByDay)
    .filter(k => k !== today)
    .sort()
    .slice(-7);
  const pastTotals = pastDayKeys.map(dayKey => {
    let t = 0;
    for (let h = 0; h <= currentHour; h++) {
      t += wallClockHourMs(`${dayKey}T${String(h).padStart(2, '0')}`, wallClockByHour, sitesByHour);
    }
    return t;
  });
  const avgMs = pastTotals.length > 0 ? pastTotals.reduce((s, v) => s + v, 0) / pastTotals.length : 0;
  if (avgMs > 0) {
    const diff = totalMs - avgMs;
    const sign = diff >= 0 ? '+' : '-';
    document.querySelector('#stats-vs-avg').textContent = sign + formatMs(Math.abs(diff));
  }

  // PEAK HOUR + FIRST BROWSE (from sitesByHour)
  const hourMs = Array.from({ length: 24 }, (_, h) => {
    const hourKey = `${today}T${String(h).padStart(2, '0')}`;
    const bucket = sitesByHour[hourKey] ?? {};
    return {
      ms: wallClockHourMs(hourKey, wallClockByHour, sitesByHour),
      visits: Object.values(bucket).reduce((s, c) => s + (c.visits ?? 0), 0),
    };
  });
  let peakHour = -1, peakMs = 0, firstBrowseHour = -1;
  for (let h = 0; h < 24; h++) {
    if (hourMs[h].ms > peakMs) { peakMs = hourMs[h].ms; peakHour = h; }
    if (firstBrowseHour === -1 && (hourMs[h].ms > 0 || hourMs[h].visits > 0)) firstBrowseHour = h;
  }
  document.querySelector('#stats-peak-hour').textContent =
    peakHour >= 0 ? formatHourRange(peakHour, '–', clockFormat) : '—';
  const firstBrowseTs = firstBrowseByDay[today];
  document.querySelector('#stats-first-browse').textContent =
    firstBrowseTs ? formatTimeOfDay(firstBrowseTs, clockFormat)
    : firstBrowseHour >= 0 ? formatHourLabel(firstBrowseHour, clockFormat)
    : '—';

  // SESSIONS (total visits across all sites today)
  const sessions = Object.values(todaySites).reduce((s, c) => s + (c.visits ?? 0), 0);
  document.querySelector('#stats-sessions').textContent = sessions > 0 ? sessions : '—';

  // IDLE (clipped idle time across all sites today)
  const idleMs = Object.values(todaySites).reduce((s, c) => s + (c.idleMs ?? 0), 0);
  document.querySelector('#stats-idle').textContent = idleMs > 0 ? formatMs(idleMs) : '—';

  // HOURLY CHART
  renderHourChart(hourMs, clockFormat);
}

function renderHourChart(hourMs, clockFormat) {
  const svg = document.querySelector('#stats-hour-chart');
  const W = svg.clientWidth || 166;
  const H = svg.clientHeight || 50;
  const LABEL_H = 14;
  const innerH = H - LABEL_H;
  const currentHour = new Date().getHours();
  const maxMs = Math.max(...hourMs.slice(0, currentHour + 1).map(h => h.ms), 1);
  const style = getComputedStyle(document.documentElement);
  const colorActive = style.getPropertyValue('--color-accent-light').trim();
  const colorCurrent = style.getPropertyValue('--color-accent').trim();
  const colorBorder = style.getPropertyValue('--color-border').trim();
  const colorText = style.getPropertyValue('--color-text-secondary').trim();
  const gap = W / 24;
  const barW = Math.max(1, Math.floor(gap) - 1);

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const rects = hourMs.map(({ ms }, h) => {
    const x = (h * gap).toFixed(1);
    if (h > currentHour) return '';
    const barH = ms > 0 ? Math.max(2, Math.round((ms / maxMs) * innerH)) : 2;
    const y = innerH - barH;
    const fill = h === currentHour ? colorCurrent : (ms > 0 ? colorActive : colorBorder);
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${fill}" rx="1"/>
      <rect data-hour="${h}" x="${x}" y="0" width="${barW}" height="${innerH}" fill="transparent"/>`;
  }).join('');

  const labels = [0, 6, 12, 18].map(h => {
    const x = h === 0 ? 1 : (h * gap).toFixed(1);
    const anchor = h === 0 ? 'start' : 'middle';
    return `<text x="${x}" y="${H - 2}" text-anchor="${anchor}" font-size="9" fill="${colorText}">${formatHourLabel(h, clockFormat)}</text>`;
  }).join('') + `<text x="${(W - 1).toFixed(1)}" y="${H - 2}" text-anchor="end" font-size="9" fill="${colorText}">${formatHourLabel(0, clockFormat)}</text>`;

  svg.innerHTML = rects + labels;

  const tooltip = document.querySelector('#stats-chart-tooltip');
  svg.querySelectorAll('rect[data-hour]').forEach(rect => {
    const h = Number(rect.dataset.hour);
    rect.addEventListener('mouseenter', () => {
      const ms = hourMs[h]?.ms ?? 0;
      const from = `${String(h).padStart(2, '0')}:00`;
      const to = `${String(h + 1).padStart(2, '0')}:00`;
      const val = h > currentHour ? 'not yet' : (ms > 0 ? formatMs(ms) : 'no activity');
      tooltip.textContent = `${from}–${to} · ${val}`;
      tooltip.removeAttribute('hidden');
    });
    rect.addEventListener('mousemove', e => {
      tooltip.style.left = `${e.clientX + 12}px`;
      tooltip.style.top = `${e.clientY - 32}px`;
    });
    rect.addEventListener('mouseleave', () => tooltip.setAttribute('hidden', ''));
  });
}

async function renderRules() {
  const rules = (await getRules()).filter(r => r.enabled);
  const noRulesMsg = document.querySelector('#no-rules-message');

  if (rules.length === 0) {
    noRulesMsg.textContent = 'No active rules. Click Manage rules to add one.';
    noRulesMsg.classList.add('visible', 'text-meta');
  } else {
    noRulesMsg.classList.remove('visible', 'text-meta');
  }

  renderRuleList(rulesList, rules, { readonly: true });
}

loadFaviconCache().then(() => {
  renderTodayStats();
  renderRules();
});

initThemeMenu();

const popupTourSteps = [
  {
    selector: '#brand',
    title: 'The popup',
    body: "Open this from your browser toolbar any time. It shows today's browsing at a glance and your enabled rules.",
  },
  {
    selector: '#manage-btn',
    title: 'Manage your rules',
    body: 'Click Manage rules to open the rules page and continue the tour.',
    handoff: { nextSurface: 'rules', mode: 'crossDocument' },
  },
];

(async () => {
  const state = await readTourState();
  if (state.completed || state.inProgress?.surface !== 'popup') return;
  autoStartIfMatches('popup', popupTourSteps, { showCloseButton: false });
})();
