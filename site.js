import { formatMs, localDayKey } from './timeUtils.js';
import { drawBarChart, formatWithSmallSub, STAT_LABELS } from './utils.js';
import { resolveSite } from './siteResolution.js';
import { initDrill, isInDrillMode, enterDrill } from './drill.js';

const params = new URLSearchParams(location.search);
const siteId = params.get('id');
const siteIds = params.get('ids')?.split(',') ?? null;
const isMerged = !!siteIds;
const effectiveSiteIds = isMerged ? siteIds : [siteId];
const rangeSelect = document.querySelector('#range-select');
const timeChart = document.querySelector('#time-chart');
const visitsChart = document.querySelector('#visits-chart');
const timeNoData = document.querySelector('#time-no-data');
const visitsNoData = document.querySelector('#visits-no-data');
const peakTooltip = document.querySelector('#peak-tooltip');
const statsContainer = document.querySelector('#stats-container');

const statsList = document.querySelector('#stats-list');

const rootStyle = getComputedStyle(document.documentElement);

const topStats = [
  { label: STAT_LABELS.today, id: 'stat-today' },
  { label: STAT_LABELS.dailyAvg, id: 'stat-daily-avg' },
  { label: STAT_LABELS.peakDay, id: 'stat-peak' },
];

const bottomStats = [
  { label: STAT_LABELS.totalTime, id: 'stat-total-time' },
  { label: STAT_LABELS.visits, id: 'stat-visits' },
  { label: STAT_LABELS.avgSession, id: 'stat-avg-session' },
];

topStats.forEach((stat, i) => {
  const item = document.createElement('div');
  item.className = 'stat-item';
  if (i === 2) {
    item.id = 'stat-peak-item';
    item.innerHTML = `<span class="stat-label">${stat.label}</span><span class="stat-value-row"><span class="stat-value" id="${stat.id}"></span><span id="stat-peak-info" class="stat-info" style="display:none" title="">ⓘ</span></span>`;
  } else {
    item.innerHTML = `<span class="stat-label">${stat.label}</span><span class="stat-value" id="${stat.id}"></span>`;
  }
  statsList.appendChild(item);
});

const divider = document.createElement('hr');
divider.id = 'stats-divider';
statsList.appendChild(divider);

bottomStats.forEach(stat => {
  const item = document.createElement('div');
  item.className = 'stat-item';
  item.innerHTML = `<span class="stat-label">${stat.label}</span><span class="stat-value" id="${stat.id}"></span>`;
  statsList.appendChild(item);
});

const peakItem = document.querySelector('#stat-peak-item');
const peakInfo = document.querySelector('#stat-peak-info');

peakItem.addEventListener('mouseenter', () => {
  if (!peakInfo.dataset.date) return;
  peakTooltip.textContent = peakInfo.dataset.date;
  peakTooltip.style.display = 'block';
});
peakItem.addEventListener('mousemove', (e) => {
  if (!peakInfo.dataset.date) return;
  const box = statsContainer.getBoundingClientRect();
  peakTooltip.style.left = `${e.clientX - box.left + 10}px`;
  peakTooltip.style.top = `${e.clientY - box.top - 28}px`;
});
peakItem.addEventListener('mouseleave', () => {
  peakTooltip.style.display = 'none';
});

function entrySum(obj) {
  const zero = { activeMs: 0, audioMs: 0, visits: 0 };
  if (!obj) return zero;
  if (!isMerged) {
    const e = obj[siteId];
    return e ? { activeMs: e.activeMs ?? 0, audioMs: e.audioMs ?? 0, visits: e.visits ?? 0 } : zero;
  }
  return siteIds.reduce((acc, id) => {
    const e = obj[id];
    if (!e) return acc;
    return { activeMs: acc.activeMs + (e.activeMs ?? 0), audioMs: acc.audioMs + (e.audioMs ?? 0), visits: acc.visits + (e.visits ?? 0) };
  }, { ...zero });
}

if (siteId || siteIds) {
  const { siteLabel } = resolveSite(siteId ?? siteIds[0]);
  document.querySelector('#site-label').textContent = siteLabel;
  document.querySelector('#site-id').textContent = isMerged ? siteIds.join(', ') : siteId;
  document.title = `BiteGuard — ${siteLabel}`;
}

let byDayCache = null;
let byHourCache = null;
const avgPerHourCache = {};

const chartsGrid = document.querySelector('#charts-grid');
const drillView = document.querySelector('#drill-view');
const navLabel = document.querySelector('#nav-label');
const navPrev = document.querySelector('#nav-prev');
const navNext = document.querySelector('#nav-next');
const navClose = document.querySelector('#nav-close');
const drillChart = document.querySelector('#drill-chart');
const drillTooltip = document.querySelector('#drill-tooltip');
const drillLegend = document.querySelector('#drill-legend');
const drillTimeBtn = document.querySelector('#drill-time-btn');
const drillVisitsBtn = document.querySelector('#drill-visits-btn');
const drillHourBtn = document.querySelector('#drill-hour-btn');
const drillNoData = document.querySelector('#drill-no-data');
const drillMonthLink = document.querySelector('#drill-month-link');
const drillStats = document.querySelector('#drill-stats');
const drillScaleBtn = document.querySelector('#drill-scale-btn');
const drillKeysBtn = document.querySelector('#drill-keys-btn');
const drillKeysPopup = document.querySelector('#drill-keys-popup');
const backBtn = document.querySelector('#back-btn');

const hourlyChart = document.querySelector('#hourly-chart');
const hourlyTooltip = document.querySelector('#hourly-tooltip');
const hourlyChartContainer = document.querySelector('#hourly-chart-container');
const hourlyNotRelevant = document.querySelector('#hourly-not-relevant');
const hourlySubheading = document.querySelector('#hourly-subheading');

function hourlySubheadingText(range) {
  if (range === 'all') return '(all days from earliest data, excluding today)';
  return `(past ${parseInt(range)} days, excluding today)`;
}

const opts = { today: 'Today', '7': 'Last 7 days', '30': 'Last 30 days', '180': 'Last 6 months', '365': 'Last year', all: 'All time' };
const savedRange = sessionStorage.getItem('analyticsRange') || '7';
rangeSelect.dataset.value = savedRange;
rangeSelect.firstChild.textContent = opts[savedRange];

rangeSelect.parentElement.querySelector('.dropdown-menu').querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    rangeSelect.dataset.value = btn.value;
    rangeSelect.firstChild.textContent = btn.textContent;
    rangeSelect.parentElement.querySelector('.dropdown-menu').classList.remove('open');
    sessionStorage.setItem('analyticsRange', btn.value);
    render();
  });
});

rangeSelect.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = rangeSelect.parentElement.querySelector('.dropdown-menu');
  const isOpen = menu.classList.contains('open');
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  if (!isOpen) menu.classList.add('open');
});

document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
});

window.addEventListener('storage', (e) => {
  if (e.key === 'theme') render();
});

initDrill({
  chartsGrid,
  drillView,
  rangeSelect,
  backBtn,
  navPrev,
  navNext,
  navClose,
  drillTimeBtn,
  drillVisitsBtn,
  drillHourBtn,
  drillChart,
  drillTooltip,
  drillLegend,
  drillNoData,
  drillMonthLink,
  drillStats,
  drillScaleBtn,
  drillKeysBtn,
  drillKeysPopup,
  navLabel,
  entrySum,
  get byDayCache() { return byDayCache; },
  siteIds: effectiveSiteIds,
  render,
});

loadAndRender();

async function loadAndRender() {
  byDayCache = await chrome.runtime.sendMessage({ type: 'getAnalyticsByDay' });
  if (rangeSelect.dataset.value === 'today') await loadByHour();
  render();
}

async function loadByHour() {
  if (byHourCache) return;
  byHourCache = await chrome.runtime.sendMessage({ type: 'getAnalyticsByHourToday' });
}

async function loadAvgPerHour(range) {
  if (avgPerHourCache[range]) return;
  avgPerHourCache[range] = await chrome.runtime.sendMessage({ type: 'getAvgPerClockHour', siteIds: effectiveSiteIds, range });
}

function render() {
  if (isInDrillMode()) return;
  const range = rangeSelect.dataset.value;

  let data;
  if (range === 'today') {
    if (!byHourCache) { loadByHour().then(render); return; }
    const dayKey = localDayKey(Date.now());
    data = Array.from({ length: 24 }, (_, h) => {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      const hStr = String(h).padStart(2, '0');
      const hNext = String(h + 1).padStart(2, '0');
      return { label: `${hStr}:00`, range: `${hStr}:00 - ${hNext}:00`, ...entrySum(byHourCache[hourKey]) };
    });
  } else {
    let dayKeys;
    if (range === 'all') {
      const allDays = Object.keys(byDayCache ?? {}).sort();
      const daysWithSiteData = allDays.filter(day => {
        const entry = entrySum(byDayCache[day]);
        return entry.activeMs > 0 || entry.visits > 0;
      });
      if (daysWithSiteData.length > 0) {
        const firstDay = daysWithSiteData[0];
        const [y1, m1, d1] = firstDay.split('-').map(Number);
        const today = new Date();
        const [y2, m2, d2] = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
        dayKeys = [];
        for (let date = new Date(y1, m1 - 1, d1); date <= new Date(y2, m2 - 1, d2); date.setDate(date.getDate() + 1)) {
          dayKeys.push(localDayKey(date.getTime()));
        }
      } else {
        dayKeys = [];
      }
    } else {
      const now = new Date();
      dayKeys = Array.from({ length: parseInt(range) }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (parseInt(range) - 1 - i));
        return localDayKey(d.getTime());
      });
    }
    if (range === 'all' || parseInt(range) > 90) {
      let monthKeys;
      if (range === 'all') {
        monthKeys = [...new Set(dayKeys.map(day => day.slice(0, 7)))].sort();
      } else {
        const numMonths = Math.round(parseInt(range) / 30);
        const now = new Date();
        monthKeys = Array.from({ length: numMonths }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (numMonths - 1 - i), 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        });
      }
      data = monthKeys.map(month => {
        const days = dayKeys.filter(day => day.startsWith(month));
        const totals = days.reduce((acc, day) => {
          const e = entrySum(byDayCache?.[day]);
          return { activeMs: acc.activeMs + e.activeMs, audioMs: acc.audioMs + e.audioMs, visits: acc.visits + e.visits };
        }, { activeMs: 0, audioMs: 0, visits: 0 });
        return { label: month, range: month, ...totals };
      });
    } else {
      const shortLabel = parseInt(range) <= 30;
      data = dayKeys.map(day => ({ label: shortLabel ? day.slice(5) : day, range: day, ...entrySum(byDayCache?.[day]) }));
    }
  }

  const hasData = data.some(d => d.activeMs > 0 || d.visits > 0);
  document.querySelector('#time-legend').style.display = 'none';
  timeChart.style.display = hasData ? 'block' : 'none';
  visitsChart.style.display = hasData ? 'block' : 'none';
  timeNoData.style.display = hasData ? 'none' : 'block';
  visitsNoData.style.display = hasData ? 'none' : 'block';
  if (hasData) drawChart(data, range);
  renderHourly(range);
  renderStats(data, range);
}


function renderStats(data, range) {
  const todayKey = localDayKey(Date.now());
  const todayMs = entrySum(byDayCache?.[todayKey]).activeMs;

  const totalMs = data.reduce((s, d) => s + d.activeMs, 0);
  const totalVisits = data.reduce((s, d) => s + d.visits, 0);
  let activeDays = 0;
  if (range !== 'today') {
    if (range === 'all') {
      const allDays = Object.keys(byDayCache ?? {}).sort();
      if (allDays.length > 0) {
        const [y1, m1, d1] = allDays[0].split('-').map(Number);
        const [y2, m2, d2] = allDays[allDays.length - 1].split('-').map(Number);
        const start = new Date(y1, m1 - 1, d1);
        const end = new Date(y2, m2 - 1, d2);
        activeDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
      }
    } else {
      activeDays = parseInt(range);
    }
  }
  const avgMs = activeDays > 0 ? totalMs / activeDays : 0;

  let peakMs = 0, peakLabel = '';
  if (range !== 'today' && byDayCache) {
    const cutoff = range === 'all' ? null : (() => {
      const d = new Date();
      d.setDate(d.getDate() - (parseInt(range) - 1));
      return localDayKey(d.getTime());
    })();
    for (const [day, sites] of Object.entries(byDayCache)) {
      if (cutoff && day < cutoff) continue;
      const ms = entrySum(sites).activeMs;
      if (ms > peakMs) { peakMs = ms; peakLabel = day; }
    }
  }

  document.querySelector('#stat-today').textContent = formatMs(todayMs) || '0m';
  const dailyAvgEl = document.querySelector('#stat-daily-avg');
  if (activeDays > 0) {
    dailyAvgEl.innerHTML = formatWithSmallSub(formatMs(avgMs));
  } else {
    dailyAvgEl.textContent = '—';
  }
  const peakEl = document.querySelector('#stat-peak');
  peakEl.textContent = peakMs > 0 ? formatMs(peakMs) : '—';
  peakEl.classList.remove('has-tooltip');
  peakInfo.style.display = peakMs > 0 ? 'inline' : 'none';
  peakInfo.dataset.date = peakMs > 0 ? peakLabel : '';
  peakInfo.title = '';
  const totalTimeEl = document.querySelector('#stat-total-time');
  if (totalMs > 0) {
    const full = formatMs(totalMs);
    const match = full.match(/^(.+?)(\s*\(.+\))?$/);
    totalTimeEl.innerHTML = match[2] ? `${match[1]}<span class="stat-sub"> ${match[2]}</span>` : full;
  } else {
    totalTimeEl.textContent = '—';
  }
  document.querySelector('#stat-visits').textContent = totalVisits > 0 ? totalVisits : '—';
  document.querySelector('#stat-avg-session').textContent = totalVisits > 0 ? formatMs(totalMs / totalVisits) : '—';

  const subheadings = { today: '(today)', '7': '(last 7 days)', '30': '(last 30 days)', '180': '(last 6 months)', '365': '(last year)', all: '(all time, from earliest data)' };
  document.querySelector('#overview-subheading').textContent = subheadings[range] ?? '';
}

function renderHourly(range) {
  hourlyChartContainer.style.display = 'block';

  if (range === 'today') {
    hourlyChart.style.display = 'none';
    hourlyNotRelevant.textContent = 'Not relevant for "Today".';
    hourlyNotRelevant.style.display = 'block';
    hourlySubheading.textContent = '';
    return;
  }

  hourlySubheading.textContent = hourlySubheadingText(range);

  if (!avgPerHourCache[range]) {
    loadAvgPerHour(range).then(() => renderHourly(rangeSelect.dataset.value));
    return;
  }

  const data = avgPerHourCache[range].map((avgMs, h) => {
    const hStr = String(h).padStart(2, '0');
    const hNext = String(h + 1).padStart(2, '0');
    return { label: `${hStr}:00`, range: `${hStr}:00 - ${hNext}:00`, activeMs: avgMs };
  });

  const hasData = data.some(d => d.activeMs > 0);
  if (!hasData) {
    hourlyChart.style.display = 'none';
    hourlyNotRelevant.textContent = 'No data for past days yet.';
    hourlyNotRelevant.style.display = 'block';
    return;
  }

  hourlyChart.style.display = 'block';
  hourlyNotRelevant.style.display = 'none';

  drawBarChart({
    svgEl: hourlyChart,
    tooltipEl: hourlyTooltip,
    data,
    maxVal: Math.max(...data.map(d => d.activeMs)),
    getValue: d => d.activeMs,
    formatVal: ms => formatMs(ms),
    color: rootStyle.getPropertyValue('--color-chart-hourly'),
  });
}

function drawChart(data, range) {
  const timeOnClick = range !== 'today' ? r => enterDrill(r, null, 'time') : null;
  const visitsOnClick = range !== 'today' ? r => enterDrill(r, null, 'visits') : null;
  const hasAudio = data.some(d => d.audioMs > 0);
  document.querySelector('#time-legend').style.display = hasAudio ? 'flex' : 'none';

  const timeSeriesData = hasAudio
    ? [
        { label: 'Active', getValue: d => d.activeMs, color: rootStyle.getPropertyValue('--color-chart-time'), formatVal: formatMs },
        { label: 'Audio', getValue: d => d.audioMs, color: rootStyle.getPropertyValue('--color-chart-audio'), formatVal: formatMs },
      ]
    : undefined;

  drawBarChart({
    svgEl: timeChart,
    tooltipEl: document.querySelector('#time-tooltip'),
    data,
    maxVal: Math.max(...data.map(d => Math.max(d.activeMs, d.audioMs || 0))),
    getValue: d => d.activeMs,
    formatVal: ms => formatMs(ms),
    color: rootStyle.getPropertyValue('--color-chart-time'),
    series: timeSeriesData,
    onBarClick: timeOnClick,
  });

  drawBarChart({
    svgEl: visitsChart,
    tooltipEl: document.querySelector('#visits-tooltip'),
    data,
    maxVal: Math.max(...data.map(d => d.visits)),
    getValue: d => d.visits,
    formatVal: v => `${Math.round(v)}`,
    formatTooltip: v => { const n = Math.round(v); return `${n} visit${n === 1 ? '' : 's'}`; },
    hideMidTicks: maxVal => maxVal < 3,
    color: rootStyle.getPropertyValue('--color-chart-visits'),
    onBarClick: visitsOnClick,
  });
}

