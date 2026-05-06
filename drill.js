import { formatMs, drawBarChart } from './utils.js';

let drillPeriod = null;
let drillPrevPeriod = null;
let drillDepth = 0;
let drillMetric = 'time';
let exitingDrill = false;

const byHourDayCache = {};

let ctx = null;

export function initDrill(context) {
  ctx = context;

  ctx.backBtn.addEventListener('click', (e) => {
    if (!drillPeriod) return;
    e.preventDefault();
    exitDrillCompletely();
  });

  ctx.navPrev.addEventListener('click', () => navigatePeriod(-1));
  ctx.navNext.addEventListener('click', () => navigatePeriod(1));
  ctx.navClose.addEventListener('click', exitDrillCompletely);

  ctx.drillTimeBtn.addEventListener('click', () => {
    drillMetric = 'time';
    ctx.drillTimeBtn.classList.add('active');
    ctx.drillVisitsBtn.classList.remove('active');
    renderDrillChart();
  });

  ctx.drillVisitsBtn.addEventListener('click', () => {
    drillMetric = 'visits';
    ctx.drillVisitsBtn.classList.add('active');
    ctx.drillTimeBtn.classList.remove('active');
    renderDrillChart();
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

export function enterDrill(period, fromPeriod) {
  drillPrevPeriod = fromPeriod ?? null;
  drillPeriod = period;
  drillDepth++;
  ctx.chartsGrid.style.display = 'none';
  ctx.drillView.style.display = 'flex';
  ctx.rangeSelect.style.display = 'none';
  ctx.navLabel.textContent = formatPeriodLabel(drillPeriod);
  history.pushState({ drill: true, period, prevPeriod: fromPeriod ?? null, depth: drillDepth }, '');
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
    drillPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    ctx.drillMonthLink.onclick = () => enterDrill(monthKey, null);
  }

  const hasData = data.some(d => d.activeMs > 0 || d.visits > 0);
  ctx.drillNoData.style.display = hasData ? 'none' : 'block';
  ctx.drillChart.style.display = hasData ? 'block' : 'none';
  ctx.drillLegend.style.display = 'none';
  if (!hasData) return;

  const onBarClick = isMonthDrill ? r => enterDrill(r, drillPeriod) : null;
  const maxTimeMs = isMonthDrill ? 24 * 3600000 : 3600000;

  if (drillMetric === 'time') {
    const hasAudio = data.some(d => d.audioMs > 0);
    ctx.drillLegend.style.display = hasAudio ? 'flex' : 'none';
    const series = hasAudio
      ? [
          { label: 'Active', getValue: d => d.activeMs, color: '#2563eb', formatVal: formatMs },
          { label: 'Audio', getValue: d => d.audioMs, color: '#7c3aed', formatVal: formatMs },
        ]
      : undefined;

    drawBarChart({
      svgEl: ctx.drillChart,
      tooltipEl: ctx.drillTooltip,
      data,
      maxVal: maxTimeMs,
      getValue: d => d.activeMs,
      formatVal: formatMs,
      color: '#2563eb',
      series,
      onBarClick,
      fontSize: '8',
    });
  } else {
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
      color: '#ea580c',
      onBarClick,
      fontSize: '8',
    });
  }
}
