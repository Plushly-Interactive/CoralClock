export const STAT_LABELS = {
  today: 'Today',
  dailyAvg: 'Daily avg',
  peakDay: 'Peak day',
  totalTime: 'Total time',
  visits: 'Visits',
  avgSession: 'Avg session',
};

export function formatWithSmallSub(text) {
  const match = text.match(/^(.+?)(\s*\(.+\))?$/);
  return match[2] ? `${match[1]}<span class="stat-sub">${match[2]}</span>` : text;
}

export function formatWithSmallSubSvg(text, baseFontSize) {
  const match = text.match(/^(.+?)(\s*\(.+\))?$/);
  if (!match[2]) return text;
  const rootStyle = getComputedStyle(document.documentElement);
  const varValue = rootStyle.getPropertyValue('--stat-sub-size').trim();
  const ratio = parseFloat(varValue) || 0.75;
  const smallSize = (baseFontSize * ratio).toFixed(1);
  return `${match[1]}<tspan font-size="${smallSize}">${match[2]}</tspan>`;
}

export function drawBarChart({ svgEl, tooltipEl, data, maxVal, getValue, formatVal, formatTooltip = formatVal, hideMidTicks = () => false, color, series, onBarClick, scale = 'linear', gridLineWidth = 1 }) {
  const W = 600, H = 260, padLeft = 38, padRight = 8, padTop = 10, padBottom = 40;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;
  const gap = Math.floor(innerW / data.length);
  const labelEvery = data.length === 24 ? 3 : Math.ceil(data.length / 10);

  const rootStyle = getComputedStyle(document.documentElement);
  const gridColor = rootStyle.getPropertyValue('--color-border').trim() || '#f0f0f0';

  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('width', '100%');
  svgEl.removeAttribute('height');

  const rect = svgEl.getBoundingClientRect();
  const svgScale = Math.min(rect.width / W, rect.height / H) || 1;
  const targetFontPx = parseFloat(rootStyle.getPropertyValue('--font-sm')) || 12;
  const axisFontSize = (targetFontPx / svgScale).toFixed(1);

  const toFrac = scale === 'sqrt'
    ? v => maxVal > 0 ? Math.sqrt(v / maxVal) : 0
    : v => maxVal > 0 ? v / maxVal : 0;

  const yTicks = [0, 1/3, 2/3, 1].map(t => ({
    val: maxVal * t,
    y: padTop + innerH - Math.round(toFrac(maxVal * t) * innerH),
  }));

  const hideMid = hideMidTicks(maxVal);
  const gridlines = yTicks.map(({ y, val }, i) => {
    const isMid = i === 1 || i === 2;
    const label = hideMid && isMid ? '' : `<text x="${padLeft - 6}" y="${y + 4}" text-anchor="end" font-size="${axisFontSize}" fill="var(--color-text-secondary)">${formatWithSmallSubSvg(formatVal(val), axisFontSize)}</text>`;
    return `<line x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}" stroke="${gridColor}" stroke-width="${gridLineWidth}"/>${label}`;
  }).join('');

  let rects;
  if (series) {
    rects = data.map((d, i) => {
      const showLabel = i % labelEvery === 0 || i === data.length - 1;
      const labelHtml = showLabel ? `<text x="${padLeft + i * gap + gap / 2}" y="${H - 8}" text-anchor="middle" font-size="${axisFontSize}" fill="var(--color-text-secondary)">${d.label}</text>` : '';

      const nonZeroBars = series.filter(s => s.getValue(d) > 0);
      const hasAnyData = nonZeroBars.length > 0;

      let bars = series.map((s, idx) => {
        const val = s.getValue(d);
        if (val === 0) return '';
        const barH = Math.round(toFrac(val) * innerH);
        const y = padTop + innerH - barH;

        let x, barWidth;
        if (idx === 0) {
          x = padLeft + i * gap;
          barWidth = gap - 2;
          return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="${s.color}" rx="2"></rect>`;
        } else {
          barWidth = Math.max(2, Math.floor((gap - 2) / 3));
          x = padLeft + i * gap + (gap - 2) - barWidth;
          const borderColor = rootStyle.getPropertyValue('--color-bg').trim() || '#f0f0f0';
          return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="${s.color}" rx="2"></rect>
            <path d="M ${x+2} ${y} L ${x+barWidth-2} ${y} A 2 2 0 0 1 ${x+barWidth} ${y+2} L ${x+barWidth} ${y+barH-2} A 2 2 0 0 1 ${x+barWidth-2} ${y+barH} L ${x+2} ${y+barH} A 2 2 0 0 1 ${x} ${y+barH-2} L ${x} ${y+2} A 2 2 0 0 1 ${x+2} ${y}" fill="none" stroke="${borderColor}" stroke-width="0.5"></path>`;
        }
      }).join('');

      if (hasAnyData) {
        const seriesData = nonZeroBars.map(s => {
          const val = s.getValue(d);
          const formatted = s.formatVal ? s.formatVal(val) : formatVal(val);
          return `${s.label}: ${formatted}`;
        }).join('\n');
        bars += `<rect x="${padLeft + i * gap}" y="${padTop}" width="${gap - 2}" height="${innerH}" fill="transparent"
          data-range="${d.range}" data-all-series="true" data-series-list="${seriesData}"></rect>`;
      } else {
        bars += `<rect x="${padLeft + i * gap}" y="${padTop}" width="${gap - 2}" height="${innerH}" fill="transparent"
          data-range="${d.range}" data-val="0"></rect>`;
      }
      return bars + labelHtml;
    }).join('');
  } else {
    const barW = Math.max(2, Math.floor(gap) - 2);
    rects = data.map((d, i) => {
      const val = getValue(d);
      const barH = Math.round(toFrac(val) * innerH);
      const x = padLeft + i * gap;
      const y = padTop + innerH - barH;
      const showLabel = i % labelEvery === 0 || i === data.length - 1;
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="2"></rect>
        <rect x="${x}" y="${padTop}" width="${barW}" height="${innerH}" fill="transparent"
          data-range="${d.range}" data-val="${val}"></rect>
        ${showLabel ? `<text x="${padLeft + i * gap + gap / 2}" y="${H - 8}" text-anchor="middle" font-size="${axisFontSize}" fill="var(--color-text-secondary)">${d.label}</text>` : ''}
      `;
    }).join('');
  }

  svgEl.innerHTML = gridlines + rects;

  let hoverOverlay = null;

  svgEl.querySelectorAll('rect[data-range]').forEach(rect => {
    if (onBarClick) {
      rect.style.cursor = 'pointer';
      rect.addEventListener('click', () => onBarClick(rect.dataset.range));
    }
    rect.addEventListener('mouseenter', () => {
      let html;
      if (rect.dataset.allSeries) {
        const seriesLines = rect.dataset.seriesList.split('\n');
        const seriesHtml = seriesLines.map(line => formatWithSmallSub(line)).join('<br>');
        html = `${seriesHtml}<br>${rect.dataset.range}`;
        if (onBarClick) html += '<br>(click to open detailed chart)';
        tooltipEl.innerHTML = html;
      } else if (rect.dataset.series) {
        const text = `${rect.dataset.series}: ${rect.dataset.format} / ${rect.dataset.range}`;
        if (onBarClick) {
          tooltipEl.innerHTML = `${text}<br>(click to open detailed chart)`;
        } else {
          tooltipEl.textContent = text;
        }
      } else {
        const val = Number(rect.dataset.val);
        let text = val === 0 ? rect.dataset.range : formatWithSmallSub(formatTooltip(val)) + '<br>' + rect.dataset.range;
        if (onBarClick) text += '<br>(click to open detailed chart)';
        if (onBarClick || val > 0) {
          tooltipEl.innerHTML = text;
        } else {
          tooltipEl.textContent = text;
        }
      }
      tooltipEl.style.display = 'block';

      if (hoverOverlay) hoverOverlay.remove();
      hoverOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hoverOverlay.setAttribute('x', rect.getAttribute('x'));
      hoverOverlay.setAttribute('y', rect.getAttribute('y'));
      hoverOverlay.setAttribute('width', rect.getAttribute('width'));
      hoverOverlay.setAttribute('height', rect.getAttribute('height'));
      hoverOverlay.setAttribute('fill', rootStyle.getPropertyValue('--color-border'));
      hoverOverlay.setAttribute('opacity', '0.20');
      hoverOverlay.setAttribute('pointer-events', 'none');
      hoverOverlay.setAttribute('rx', '2');
      const firstRect = svgEl.querySelector('rect');
      svgEl.insertBefore(hoverOverlay, firstRect);
    });
    rect.addEventListener('mousemove', (e) => {
      const box = svgEl.getBoundingClientRect();
      const ttW = tooltipEl.offsetWidth;
      const flipLeft = e.clientX + 10 + ttW > window.innerWidth;
      tooltipEl.style.left = flipLeft
        ? `${e.clientX - box.left - ttW - 10}px`
        : `${e.clientX - box.left + 10}px`;
      tooltipEl.style.top = `${e.clientY - box.top - 28}px`;
    });
    rect.addEventListener('mouseleave', () => {
      tooltipEl.style.display = 'none';
      if (hoverOverlay) {
        hoverOverlay.remove();
        hoverOverlay = null;
      }
    });
  });
}

export function localDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function localHourKey(ts) {
  return `${localDayKey(ts)}T${String(new Date(ts).getHours()).padStart(2, '0')}`;
}

export function splitByHour(from, to) {
  const segs = [];
  let t = from;
  while (t < to) {
    const nextHour = new Date(t);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const end = Math.min(nextHour.getTime(), to);
    segs.push({ hourKey: localHourKey(t), dayKey: localDayKey(t), ms: end - t });
    t = end;
  }
  return segs;
}

export function formatMs(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = ms / 3600000;
  const days = ms / 86400000;
  if (ms < 60000)    return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000)  { const r = Math.round(ms / 60000); return r < 60 ? `${r}m` : '1h'; }
  if (ms < 36000000) { const m = totalMinutes % 60; return m ? `${Math.floor(hours)}h${m}m` : `${Math.floor(hours)}h`; }
  if (ms < 86400000) { const h = hours.toFixed(1); return `${h.endsWith('.0') ? Math.floor(hours) : h}h`; }
  const hStr = Math.floor(hours);
  const dTruncated = Math.floor(days * 10) / 10;
  const dStr = dTruncated >= 10 || dTruncated % 1 === 0 ? Math.floor(dTruncated) : dTruncated.toFixed(1);
  return `${hStr}h (${dStr}d)`;
}

export function formatMsAsDays(ms) {
  const days = ms / 86400000;
  if (days === Math.floor(days)) return `${Math.floor(days)}d`;
  return `${days.toFixed(1)}d`;
}
