import { formatMs } from './timeUtils.js';
import { drawBarChart } from './utils.js';

export function createHourlyChart({ chart, tooltip, container, subheading, notRelevant, siteIds, allDaysLabel, getRangeValue }) {
  const cache = {};

  async function load(range) {
    if (cache[range]) return;
    cache[range] = await chrome.runtime.sendMessage({ type: 'getAvgPerClockHour', siteIds, range });
  }

  function subheadingText(range) {
    if (range === 'all') return allDaysLabel;
    return `(past ${parseInt(range)} days, excluding today)`;
  }

  function render(range) {
    container.style.display = 'block';

    if (range === 'today') {
      chart.style.display = 'none';
      subheading.textContent = '';
      notRelevant.textContent = 'Not relevant for "Today".';
      notRelevant.style.display = 'block';
      return;
    }

    subheading.textContent = subheadingText(range);

    if (!cache[range]) {
      load(range).then(() => render(getRangeValue()));
      return;
    }

    const data = cache[range].map((avgMs, h) => {
      const hStr = String(h).padStart(2, '0');
      const hNext = String(h + 1).padStart(2, '0');
      return { label: `${hStr}:00`, range: `${hStr}:00 - ${hNext}:00`, activeMs: avgMs };
    });

    const hasData = data.some(d => d.activeMs > 0);
    if (!hasData) {
      chart.style.display = 'none';
      notRelevant.textContent = 'No data for past days yet.';
      notRelevant.style.display = 'block';
      return;
    }

    chart.style.display = 'block';
    notRelevant.style.display = 'none';

    const color = getComputedStyle(document.documentElement).getPropertyValue('--color-chart-hourly');
    drawBarChart({
      svgEl: chart,
      tooltipEl: tooltip,
      data,
      maxVal: Math.max(...data.map(d => d.activeMs), 1),
      getValue: d => d.activeMs,
      formatVal: ms => formatMs(ms),
      color,
    });
  }

  return {
    render,
    clearCache() { Object.keys(cache).forEach(k => delete cache[k]); },
  };
}
