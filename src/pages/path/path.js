import { localDayKey, dayKeysForRange, DEFAULT_CLOCK_FORMAT } from '../../shared/timeUtils.js';
import { STAT_LABELS, CHART_LEGEND_HTML, TIME_CHART_HTML, VISITS_CHART_HTML, HOURLY_CHART_HTML, faviconUrl, loadFaviconCache, navButton } from '../../shared/utils.js';
import { formatHostnameLabel } from '../../shared/labels.js';
import { createRangeDropdown, initRangeSelect } from '../../shared/rangeSelect.js';
import { displayPath, stripQuery } from '../../shared/paths.js';
import { initDrill, isInDrillMode, enterDrill, exitDrillCompletely } from '../../shared/drill.js';
import { createHourlyChart } from '../../shared/hourlyChart.js';
import { buildOverviewData, drawOverviewCharts, subheadingText, renderBaseStats } from '../../shared/overview.js';
import { autoStartIfMatches } from '../../shared/tour.js';
import { fetchTrackingData, clearMockModeCache } from '../../shared/tourMockData.js';
import { intervalFetch } from '../../data/intervalProvider.js';
import { MSG_GET_SUBPAGES_BY_DAY, MSG_GET_SUBPAGES_BY_HOUR } from '../../shared/msgTypes.js';
import { PREF_CLOCK_FORMAT } from '../../shared/prefKeys.js';

const drillParams = new URLSearchParams(location.search);
if (!drillParams.has('ids') || !drillParams.has('path')) {
  location.href = '../dashboard/dashboard.html';
}

const siteIds = drillParams.get('ids').split(',');
const path = drillParams.get('path');
const prefix = drillParams.get('prefix') === '1';
const stripParams = drillParams.get('stripParams') === '1';
const siteId = siteIds[0];
const isMerged = siteIds.length > 1;
// ?source=interval routes data reads through the interval log; Phase B drops this.
const SOURCE = drillParams.get('source');
const fetchData = SOURCE === 'interval' ? intervalFetch : fetchTrackingData;
const SRC_Q = SOURCE ? `&source=${encodeURIComponent(SOURCE)}` : '';
const DASH = SOURCE === 'interval' ? '../interval-dashboard/interval-dashboard.html' : '../dashboard/dashboard.html';

document.querySelector('#header-center').appendChild(createRangeDropdown());
const limitBtn = document.querySelector('#limit-btn');
function wireLimit(host) {
  navButton(limitBtn, `../rules/rules.html?target=${encodeURIComponent(host + stripQuery(path))}`);
  limitBtn.style.display = '';
}
if (isMerged) limitBtn.style.display = 'none';
else wireLimit(siteId);
const chartsGrid = document.querySelector('#charts-grid');
chartsGrid.insertAdjacentHTML('afterbegin', TIME_CHART_HTML);
chartsGrid.insertAdjacentHTML('beforeend', VISITS_CHART_HTML);
chartsGrid.insertAdjacentHTML('beforeend', HOURLY_CHART_HTML);
const rangeSelect = document.querySelector('#range-select');
const timeChart = document.querySelector('#time-chart');
const timeTooltip = document.querySelector('#time-tooltip');
const timeLegend = document.querySelector('#time-legend');
const timeNoData = document.querySelector('#time-no-data');
const visitsChart = document.querySelector('#visits-chart');
const visitsTooltip = document.querySelector('#visits-tooltip');
const visitsNoData = document.querySelector('#visits-no-data');
const statsList = document.querySelector('#stats-list');
const backBtn = document.querySelector('#back-btn');
const crumbSite = document.querySelector('#path-crumb-site');

await loadFaviconCache();
const siteLabel = formatHostnameLabel(siteId);
document.querySelector('#site-label').textContent = siteLabel;
document.querySelector('#site-id').textContent = isMerged ? siteIds.join(', ') : siteId;
const faviconEl = document.querySelector('#site-favicon');
faviconEl.src = faviconUrl(siteId);
faviconEl.removeAttribute('hidden');
faviconEl.addEventListener('error', () => { faviconEl.style.display = 'none'; });
document.title = `BiteGuard — ${siteLabel} ${displayPath(path)}`;
const crumbPath = document.querySelector('#path-crumb-path');
const spacedPath = displayPath(path).replace(/\//g, ' / ').trimStart() + (prefix ? ' *' : '');
crumbPath.textContent = spacedPath;
crumbPath.title = displayPath(path) + (prefix ? '*' : '');

function setCrumbDomain(domain) {
  crumbSite.textContent = domain ?? siteIds.join(', ');
  if (domain) {
    crumbPath.href = `https://${domain}${path}`;
  } else {
    crumbPath.removeAttribute('href');
    crumbPath.removeAttribute('target');
  }
}
setCrumbDomain(isMerged ? null : siteId);

function resolveOwningDomain() {
  const owners = new Set();
  for (const sites of Object.values(byDayCache ?? {})) {
    for (const sid of siteIds) {
      const sitePaths = sites[sid];
      if (!sitePaths) continue;
      for (const k of Object.keys(sitePaths)) {
        if (matchesPath(k)) { owners.add(sid); break; }
      }
    }
  }
  return owners.size === 1 ? [...owners][0] : null;
}

const pathLinks = document.querySelector('#path-links');
const pathLinksToggle = document.querySelector('#path-links-toggle');
const pathLinksToggleLabel = document.querySelector('#path-links-toggle-label');

let singleLinkUrl = null;

function togglePathLinks(e) {
  e.stopPropagation();
  e.preventDefault();
  const open = pathLinks.classList.toggle('open');
  pathLinksToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function handleCrumbClick(e) {
  if (singleLinkUrl) {
    e.preventDefault();
    chrome.tabs.create({ url: singleLinkUrl });
    return;
  }
  if (pathLinksToggle.style.display !== 'none') togglePathLinks(e);
}

pathLinksToggle.addEventListener('click', handleCrumbClick);
crumbPath.addEventListener('click', handleCrumbClick);

document.addEventListener('click', (e) => {
  if (pathLinks.contains(e.target)) return;
  if (e.target === pathLinksToggle || pathLinksToggle.contains(e.target)) return;
  if (e.target === crumbPath && pathLinksToggle.style.display !== 'none') return;
  pathLinks.classList.remove('open');
  pathLinksToggle.setAttribute('aria-expanded', 'false');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    pathLinks.classList.remove('open');
    pathLinksToggle.setAttribute('aria-expanded', 'false');
  }
});

function resolveOwningEntries() {
  const totals = new Map();
  for (const sites of Object.values(byDayCache ?? {})) {
    for (const sid of siteIds) {
      const sitePaths = sites[sid];
      if (!sitePaths) continue;
      for (const [k, d] of Object.entries(sitePaths)) {
        if (!matchesPath(k)) continue;
        const key = `${sid}\0${k}`;
        const cur = totals.get(key) ?? { domain: sid, fullPath: k, activeMs: 0, visits: 0 };
        cur.activeMs += d.activeMs || 0;
        cur.visits += d.visits || 0;
        totals.set(key, cur);
      }
    }
  }
  const entries = [...totals.values()].filter(e => e.activeMs > 0 || e.visits > 0);
  entries.sort((a, b) => a.domain.localeCompare(b.domain) || a.fullPath.localeCompare(b.fullPath));
  return entries;
}

function chipLabel(fullPath) {
  return displayPath(fullPath);
}

function renderPathLinks(entries) {
  pathLinks.replaceChildren();
  singleLinkUrl = null;
  if (entries.length === 0) {
    pathLinksToggle.style.display = 'none';
    return;
  }
  pathLinksToggle.style.display = '';
  pathLinksToggleLabel.textContent = entries.length === 1 ? '(click to open link)' : '(click to see links)';
  if (entries.length === 1) {
    const { domain, fullPath } = entries[0];
    singleLinkUrl = `https://${domain}${fullPath}`;
    crumbPath.href = singleLinkUrl;
    return;
  }
  for (const { domain, fullPath } of entries) {
    const chip = document.createElement('a');
    chip.className = 'path-link-chip';
    chip.href = `https://${domain}${fullPath}`;
    chip.title = `https://${domain}${displayPath(fullPath)}`;
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chip.href });
    });
    const dom = document.createElement('span');
    dom.className = 'path-link-chip-domain';
    dom.textContent = domain;
    chip.append(dom, chipLabel(fullPath));
    pathLinks.appendChild(chip);
  }
}

const siteHref = (isMerged
  ? `../site/site.html?ids=${encodeURIComponent(siteIds.join(','))}`
  : `../site/site.html?id=${encodeURIComponent(siteId)}`) + SRC_Q;
backBtn.href = DASH;
crumbSite.href = siteHref;

const stats = [
  { label: STAT_LABELS.totalTime, id: 'stat-total-time' },
  { label: 'Daily avg', id: 'stat-daily-avg' },
  { label: STAT_LABELS.visits, id: 'stat-visits' },
];
stats.forEach(s => {
  const item = document.createElement('div');
  item.className = 'stat-item';
  item.innerHTML = `<span class="stat-label">${s.label}</span><span class="stat-value" id="${s.id}"></span>`;
  statsList.appendChild(item);
});

timeLegend.innerHTML = CHART_LEGEND_HTML;

const drillView = document.querySelector('#drill-view');

let byDayCache = null;
let byHourCache = null;

function matchesPath(key) {
  const k = stripParams ? stripQuery(key) : key;
  return prefix ? (k === path || k.startsWith(path + '/')) : k === path;
}

function entryFor(cache, key) {
  const acc = { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
  const data = cache?.[key];
  if (!data) return acc;
  for (const sid of siteIds) {
    const sitePaths = data[sid];
    if (!sitePaths) continue;
    for (const [k, d] of Object.entries(sitePaths)) {
      if (!matchesPath(k)) continue;
      acc.activeMs += d.activeMs || 0;
      acc.audioMs += d.audioMs || 0;
      acc.overlapMs += d.overlapMs || 0;
      acc.visits += d.visits || 0;
    }
  }
  return acc;
}

const getDayEntry = (dayKey) => entryFor(byDayCache, dayKey);
const getHourEntry = (hourKey) => entryFor(byHourCache, hourKey);

function avgPerClockHour(dayKeys) {
  if (dayKeys.length === 0) return new Array(24).fill(0);
  const sums = new Array(24).fill(0);
  for (const dayKey of dayKeys) {
    for (let h = 0; h < 24; h++) {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      sums[h] += getHourEntry(hourKey).activeMs;
    }
  }
  return sums.map(s => s / dayKeys.length);
}

const clockFormatStored = await chrome.storage.local.get(PREF_CLOCK_FORMAT);
const clockFormat = clockFormatStored[PREF_CLOCK_FORMAT] ?? DEFAULT_CLOCK_FORMAT;

const hourly = createHourlyChart({
  chart: document.querySelector('#hourly-chart'),
  tooltip: document.querySelector('#hourly-tooltip'),
  container: document.querySelector('#hourly-chart-container'),
  subheading: document.querySelector('#hourly-subheading'),
  notRelevant: document.querySelector('#hourly-not-relevant'),
  allDaysLabel: '(all days from earliest data, excluding today)',
  getRangeValue: () => rangeSelect.dataset.value,
  loadAvgPerHour: (range) => {
    const todayKey = localDayKey(Date.now());
    return avgPerClockHour(dayKeysForRange(range, byDayCache).filter(d => d !== todayKey));
  },
  clockFormat,
});

initDrill({
  chartsGrid,
  drillView,
  rangeSelect,
  clockFormat,
  getDayEntry,
  getHourEntriesForDay: (dayKey) => {
    const result = {};
    for (let h = 0; h < 24; h++) {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      result[hourKey] = getHourEntry(hourKey);
    }
    return result;
  },
  getAvgPerClockHour: avgPerClockHour,
  render,
});

initRangeSelect(rangeSelect, render);
window.addEventListener('storage', (e) => { if (e.key === 'theme') render(); });

const loadAndRenderPromise = loadAndRender();

async function loadAndRender() {
  [byDayCache, byHourCache] = await Promise.all([
    fetchData({ type: MSG_GET_SUBPAGES_BY_DAY }),
    fetchData({ type: MSG_GET_SUBPAGES_BY_HOUR }),
  ]);
  if (isMerged) {
    const owner = resolveOwningDomain();
    setCrumbDomain(owner);
    if (owner) wireLimit(owner);
  }
  renderPathLinks(resolveOwningEntries());
  render();
}

function render() {
  if (isInDrillMode()) return;
  const range = rangeSelect.dataset.value;
  const dayKeys = dayKeysForRange(range, byDayCache);
  const data = buildOverviewData({ range, dayKeys, clockFormat, getDayEntry, getHourEntry });
  drawOverviewCharts({
    data, range,
    timeChart, timeTooltip, timeLegend, timeNoData,
    visitsChart, visitsTooltip, visitsNoData,
    onEnterDrill: (r, metric) => enterDrill(r, null, metric),
  });
  renderStats(data, range);
  hourly.render(range);
}

function renderStats(data, range) {
  renderBaseStats(data, range, byDayCache);
  document.querySelector('#overview-subheading').textContent = subheadingText(range);
}

function ensureDrillOpen() {
  if (isInDrillMode()) return;
  const days = Object.keys(byDayCache ?? {}).sort();
  const pick = days[days.length - 1];
  if (pick) enterDrill(pick, null, 'time');
}

const pathTourSteps = [
  {
    selector: '#path-subheader',
    title: 'Path details',
    body: 'This page shows everything BiteGuard tracks for a single subpage. The site and path are shown here.',
  },
  {
    selector: '#time-chart-container',
    title: 'Time spent',
    body: 'Active browsing time and audio playback on this subpage, per day in the selected range.',
  },
  {
    selector: '#stats-container',
    title: 'Overview',
    body: 'Aggregate stats for this subpage: daily average, peak day, total time and more.',
  },
  {
    selector: '#visits-chart-container',
    title: 'Visits',
    body: 'Number of separate visits to this subpage per day.',
  },
  {
    selector: '#hourly-chart-container',
    title: 'Average per clock hour',
    body: 'Your typical browsing pattern on this subpage across the 24 hours of the day.',
  },
  {
    selector: '#time-chart-container',
    title: 'Drill into a day',
    body: 'Click any day in the time chart to see hourly detail for that single day.',
    advanceOn: 'click',
  },
  {
    selector: '#drill-chart-wrapper',
    title: 'Daily detail',
    body: 'This shows the activity for the chosen day in finer granularity.',
    drillStep: true,
    onEnter: ensureDrillOpen,
    onExit: ({ direction }) => {
      if (direction === 'backward' && isInDrillMode()) exitDrillCompletely();
    },
  },
  {
    selector: '#drill-controls',
    title: 'Navigate and switch metric',
    body: 'Move to neighboring days with the arrows, or switch between Time, Visits and Hourly average.',
    drillStep: true,
    onEnter: ensureDrillOpen,
  },
  {
    selector: '#nav-close',
    title: 'Back to overview',
    body: 'Click Overview to leave drill mode and return to the full range.',
    advanceOn: 'click',
    drillStep: true,
    onEnter: ensureDrillOpen,
  },
  {
    selector: '#back-btn',
    title: 'Back to the dashboard',
    body: 'Use back to return to the site, then back again to the dashboard, where the tour continues.',
    handoff: { nextSurface: 'dashboard', nextStepIndex: 6, mode: 'inPage' },
  },
];

loadAndRenderPromise.then(() => autoStartIfMatches('path', pathTourSteps, {
  onClose: ({ skipped }) => {
    if (skipped) {
      clearMockModeCache();
      byDayCache = null;
      byHourCache = null;
      loadAndRender();
    }
  },
}));
