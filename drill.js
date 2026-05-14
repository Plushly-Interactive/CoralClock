import { formatMs, formatMsAsDays, localDayKey } from './timeUtils.js';
import { drawBarChart, formatWithSmallSub, STAT_LABELS } from './utils.js';

let drillPeriod = null;
let drillPrevPeriod = null;
let drillDepth = 0;
let drillMetric = 'time';
let drillScale = 'linear';
let exitingDrill = false;

const byHourDayCache = {};

let ctx = null;

export function initDrill(context) {
  ctx = context;

  ctx.backBtn.addEventListener('click', (e) => {
    if (!drillPeriod) return;
    e.preventDefault();
    location.href = 'dashboard.html';
  });

  ctx.navPrev.addEventListener('click', () => navigatePeriod(-1));
  ctx.navNext.addEventListener('click', () => navigatePeriod(1));
  ctx.navClose.addEventListener('click', exitDrillCompletely);

  ctx.drillTimeBtn.addEventListener('click', () => {
    drillMetric = 'time';
    updateDrillButtons();
    renderDrillChart();
  });

  ctx.drillVisitsBtn.addEventListener('click', () => {
    drillMetric = 'visits';
    updateDrillButtons();
    renderDrillChart();
  });

  ctx.drillHourBtn.addEventListener('click', () => {
    drillMetric = 'hour';
    updateDrillButtons();
    renderDrillChart();
  });

  ctx.drillScaleBtn.addEventListener('change', () => {
    drillScale = ctx.drillScaleBtn.checked ? 'sqrt' : 'linear';
    renderDrillChart();
  });

  ctx.drillKeysBtn.addEventListener('click', () => {
    const visible = ctx.drillKeysPopup.style.display !== 'none';
    ctx.drillKeysPopup.style.display = visible ? 'none' : 'flex';
    ctx.drillKeysBtn.textContent = visible ? '?' : '×';
  });

  window.addEventListener('keydown', (e) => {
    if (!drillPeriod) return;
    if (e.key === ' ') {
      e.preventDefault();
      const isMonthDrill = drillPeriod.length === 7;
      const modes = isMonthDrill ? ['time', 'visits', 'hour'] : ['time', 'visits'];
      const next = modes[(modes.indexOf(drillMetric) + 1) % modes.length];
      drillMetric = next;
      updateDrillButtons();
      renderDrillChart();
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); navigatePeriod(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); navigatePeriod(1); }
    else if (e.key === 'ArrowUp') {
      if (drillPeriod.length !== 10) return;
      e.preventDefault();
      enterDrill(drillPeriod.slice(0, 7), null, drillMetric);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      exitDrillCompletely();
    } else if (e.key === 'ArrowDown') {
      if (drillPeriod.length !== 7) return;
      e.preventDefault();
      const [y, m] = drillPeriod.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const dayKey = `${drillPeriod}-${String(i).padStart(2, '0')}`;
        const entry = ctx.entrySum(ctx.byDayCache?.[dayKey]);
        if (entry.activeMs > 0 || entry.visits > 0) {
          enterDrill(dayKey, drillPeriod, drillMetric);
          break;
        }
      }
    }
  });

  window.addEventListener('storage', (e) => {
    if (e.key === 'theme' && drillPeriod) renderDrillChart();
  });

  window.addEventListener('popstate', (e) => {
    if (exitingDrill) {
      exitingDrill = false;
      return;
    }
    if (e.state?.drill) {
      drillPeriod = e.state.period;
      drillPrevPeriod = e.state.prevPeriod;
      drillDepth = e.state.depth ?? 1;
      ctx.chartsGrid.style.display = 'none';
      ctx.drillView.style.display = 'flex';
      ctx.rangeSelect.style.display = 'none';
      ctx.navLabel.textContent = formatPeriodLabel(drillPeriod);
      renderDrillChart();
    } else if (drillPeriod) {
      drillDepth = 0;
      drillPeriod = null;
      drillPrevPeriod = null;
      ctx.chartsGrid.style.display = '';
      ctx.drillView.style.display = 'none';
      ctx.rangeSelect.style.display = '';
      ctx.render();
    }
  });
}

export function isInDrillMode() {
  return drillPeriod !== null;
}

export function enterDrill(period, fromPeriod, metric = 'time') {
  drillPrevPeriod = fromPeriod ?? null;
  drillPeriod = period;
  drillDepth++;
  drillMetric = metric;
  ctx.chartsGrid.style.display = 'none';
  ctx.drillView.style.display = 'flex';
  ctx.rangeSelect.style.display = 'none';
  ctx.navLabel.textContent = formatPeriodLabel(drillPeriod);
  history.pushState({ drill: true, period, prevPeriod: fromPeriod ?? null, depth: drillDepth }, '');
  updateDrillButtons();
  renderDrillChart();
}

function exitDrillCompletely() {
  const depth = drillDepth;
  drillDepth = 0;
  drillPeriod = null;
  drillPrevPeriod = null;
  ctx.chartsGrid.style.display = '';
  ctx.drillView.style.display = 'none';
  ctx.rangeSelect.style.display = '';
  ctx.render();
  if (depth > 0) {
    exitingDrill = true;
    history.go(-depth);
  }
}

function updateDrillButtons() {
  ctx.drillTimeBtn.classList.toggle('active', drillMetric === 'time');
  ctx.drillVisitsBtn.classList.toggle('active', drillMetric === 'visits');
  ctx.drillHourBtn.classList.toggle('active', drillMetric === 'hour');
}

function formatPeriodLabel(period) {
  if (period.length === 7) {
    const [y, m] = period.split('-');
    return new Date(+y, +m - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  const [y, m, d] = period.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function navigatePeriod(dir) {
  if (drillPeriod.length === 7) {
    const [y, m] = drillPeriod.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    drillPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  } else {
    const [y, m, day] = drillPeriod.split('-').map(Number);
    const d = new Date(y, m - 1, day + dir);
    drillPeriod = localDayKey(d.getTime());
  }
  ctx.navLabel.textContent = formatPeriodLabel(drillPeriod);
  renderDrillChart();
}

async function loadByHourForDay(dayKey) {
  if (byHourDayCache[dayKey]) return byHourDayCache[dayKey];
  const result = (await chrome.runtime.sendMessage({ type: 'getAnalyticsByHourForDay', dayKey })) ?? {};
  byHourDayCache[dayKey] = result;
  return result;
}

async function renderDrillChart() {
  const isMonthDrill = drillPeriod.length === 7;
  ctx.drillHourBtn.style.display = isMonthDrill ? 'block' : 'none';
  if (!isMonthDrill && drillMetric === 'hour') {
    drillMetric = 'time';
    updateDrillButtons();
  }
  let data;

  if (isMonthDrill) {
    const [y, m] = drillPeriod.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    data = Array.from({ length: daysInMonth }, (_, i) => {
      const dayKey = `${drillPeriod}-${String(i + 1).padStart(2, '0')}`;
      return { label: String(i + 1), range: dayKey, ...ctx.entrySum(ctx.byDayCache?.[dayKey]) };
    });
  } else {
    const hourData = await loadByHourForDay(drillPeriod);
    data = Array.from({ length: 24 }, (_, h) => {
      const hourKey = `${drillPeriod}T${String(h).padStart(2, '0')}`;
      const hStr = String(h).padStart(2, '0');
      const hNext = String(h + 1).padStart(2, '0');
      return { label: `${hStr}:00`, range: `${hStr}:00–${hNext}:00`, ...ctx.entrySum(hourData[hourKey]) };
    });
  }

  if (isMonthDrill) {
    ctx.drillMonthLink.style.display = 'none';
  } else {
    const monthKey = drillPeriod.slice(0, 7);
    ctx.drillMonthLink.textContent = formatPeriodLabel(monthKey);
    ctx.drillMonthLink.style.display = 'block';
    ctx.drillMonthLink.onclick = () => enterDrill(monthKey, null, drillMetric);
  }

  const hasData = data.some(d => d.activeMs > 0 || d.visits > 0);
  ctx.drillNoData.style.display = hasData ? 'none' : 'block';
  ctx.drillChart.style.display = hasData ? 'block' : 'none';
  ctx.drillLegend.style.display = 'none';

  const totalMs = data.reduce((s, d) => s + d.activeMs, 0);
  const totalVisits = data.reduce((s, d) => s + d.visits, 0);
  const stats = [];
  if (totalMs > 0) stats.push({ label: STAT_LABELS.totalTime, value: formatMs(totalMs) });
  if (totalVisits > 0) stats.push({ label: STAT_LABELS.visits, value: totalVisits });
  if (totalMs > 0 && totalVisits > 0) stats.push({ label: STAT_LABELS.avgSession, value: formatMs(totalMs / totalVisits) });
  ctx.drillStats.innerHTML = stats.map(s => {
    const isTimeValue = s.label === STAT_LABELS.totalTime || s.label === STAT_LABELS.avgSession;
    const displayValue = isTimeValue ? formatWithSmallSub(s.value) : s.value;
    return `<div><span class="stat-label">${s.label}</span> <span class="stat-value">${displayValue}</span></div>`;
  }).join('');

  if (!hasData) return;

  const onBarClick = isMonthDrill ? r => enterDrill(r, drillPeriod, drillMetric) : null;
  const maxTimeMs = isMonthDrill ? 24 * 3600000 : 3600000;

  const rootStyle = getComputedStyle(document.documentElement);
  
  if (drillMetric === 'time') {
    const hasAudio = data.some(d => d.audioMs > 0);
    ctx.drillLegend.style.display = hasAudio ? 'flex' : 'none';
    const formatValForAxis = isMonthDrill
      ? (val) => Math.abs(val - maxTimeMs) < 1 ? formatMsAsDays(val) : formatMs(val)
      : formatMs;
    const series = hasAudio
      ? [
          { label: 'Active', getValue: d => d.activeMs, color: rootStyle.getPropertyValue('--color-chart-time'), formatVal: formatMs },
          { label: 'Audio', getValue: d => d.audioMs, color: rootStyle.getPropertyValue('--color-chart-audio'), formatVal: formatMs },
        ]
      : undefined;

    drawBarChart({
      svgEl: ctx.drillChart,
      tooltipEl: ctx.drillTooltip,
      data,
      maxVal: maxTimeMs,
      getValue: d => d.activeMs,
      formatVal: formatValForAxis,
      color: rootStyle.getPropertyValue('--color-chart-time'),
      series,
      onBarClick,

      scale: drillScale,
      gridLineWidth: 0.5,
    });
  } else if (drillMetric === 'visits') {
    ctx.drillLegend.style.display = 'none';
    drawBarChart({
      svgEl: ctx.drillChart,
      tooltipEl: ctx.drillTooltip,
      data,
      maxVal: Math.max(...data.map(d => d.visits), 1),
      getValue: d => d.visits,
      formatVal: v => `${Math.round(v)}`,
      formatTooltip: v => { const n = Math.round(v); return `${n} visit${n === 1 ? '' : 's'}`; },
      hideMidTicks: maxVal => maxVal < 3,
      color: rootStyle.getPropertyValue('--color-chart-visits'),
      onBarClick,

      scale: drillScale,
      gridLineWidth: 0.5,
    });
  } else if (drillMetric === 'hour') {
    ctx.drillLegend.style.display = 'none';
    let hourlyData;
    let dayKeys;
    if (isMonthDrill) {
      const [y, m] = drillPeriod.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      dayKeys = [];
      for (let i = 1; i <= daysInMonth; i++) {
        dayKeys.push(`${drillPeriod}-${String(i).padStart(2, '0')}`);
      }
    } else {
      dayKeys = [drillPeriod];
    }

    const avgPerHours = await chrome.runtime.sendMessage({ type: 'getAvgPerClockHour', siteIds: ctx.siteIds, range: null, dayKeys });
    hourlyData = avgPerHours.map((avgMs, h) => {
      const hStr = String(h).padStart(2, '0');
      const hNext = String(h + 1).padStart(2, '0');
      return { label: `${hStr}:00`, range: `${hStr}:00–${hNext}:00`, activeMs: avgMs };
    });

    const hasHourlyData = hourlyData.some(d => d.activeMs > 0);
    ctx.drillNoData.style.display = hasHourlyData ? 'none' : 'block';
    ctx.drillChart.style.display = hasHourlyData ? 'block' : 'none';
    if (!hasHourlyData) return;

    drawBarChart({
      svgEl: ctx.drillChart,
      tooltipEl: ctx.drillTooltip,
      data: hourlyData,
      maxVal: 3600000,
      getValue: d => d.activeMs,
      formatVal: formatMs,
      color: rootStyle.getPropertyValue('--color-chart-hourly'),

      scale: drillScale,
      gridLineWidth: 0.5,
    });
  }
}
