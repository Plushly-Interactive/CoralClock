export function drawBarChart({ svgEl, tooltipEl, data, maxVal, getValue, formatVal, formatTooltip = formatVal, hideMidTicks = () => false, color, series, onBarClick, fontSize = '10' }) {
  const W = 600, H = 260, padLeft = 52, padRight = 8, padTop = 10, padBottom = 40;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;
  const gap = Math.floor(innerW / data.length);
  const labelEvery = data.length === 24 ? 3 : Math.ceil(data.length / 10);

  const rootStyle = getComputedStyle(document.documentElement);
  const axisColor = rootStyle.getPropertyValue('--color-chart-axis').trim() || '#888';
  const gridColor = rootStyle.getPropertyValue('--color-chart-grid').trim() || '#f0f0f0';

  const yTicks = [0, 1/3, 2/3, 1].map(t => ({
    val: maxVal * t,
    y: padTop + innerH - Math.round(t * innerH),
  }));

  const hideMid = hideMidTicks(maxVal);
  const gridlines = yTicks.map(({ y, val }, i) => {
    const isMid = i === 1 || i === 2;
    const label = hideMid && isMid ? '' : `<text x="${padLeft - 6}" y="${y + 4}" text-anchor="end" font-size="${fontSize}" fill="${axisColor}">${formatVal(val)}</text>`;
    return `<line x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}" stroke="${gridColor}" stroke-width="1"/>${label}`;
  }).join('');

  let rects;
  if (series) {
    rects = data.map((d, i) => {
      const showLabel = i % labelEvery === 0 || i === data.length - 1;
      const labelHtml = showLabel ? `<text x="${padLeft + i * gap + gap / 2}" y="${H - 8}" text-anchor="middle" font-size="${fontSize}" fill="${axisColor}">${d.label}</text>` : '';

      const nonZeroBars = series.filter(s => s.getValue(d) > 0);
      const hasAnyData = nonZeroBars.length > 0;

      let bars = series.map((s, idx) => {
        const val = s.getValue(d);
        if (val === 0) return '';
        const barH = maxVal > 0 ? Math.round((val / maxVal) * innerH) : 0;
        const y = padTop + innerH - barH;

        let x, barWidth;
        if (idx === 0) {
          x = padLeft + i * gap;
          barWidth = gap - 2;
          return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="${s.color}" rx="2"></rect>`;
        } else {
          barWidth = Math.max(2, Math.floor((gap - 2) / 3));
          x = padLeft + i * gap + (gap - 2) - barWidth;
          const borderColor = rootStyle.getPropertyValue('--color-chart-grid').trim() || '#f0f0f0';
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
      const barH = maxVal > 0 ? Math.round((val / maxVal) * innerH) : 0;
      const x = padLeft + i * gap + (gap - barW) / 2;
      const y = padTop + innerH - barH;
      const showLabel = i % labelEvery === 0 || i === data.length - 1;
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="2"></rect>
        <rect x="${x}" y="${padTop}" width="${barW}" height="${innerH}" fill="transparent"
          data-range="${d.range}" data-val="${val}"></rect>
        ${showLabel ? `<text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle" font-size="${fontSize}" fill="${axisColor}">${d.label}</text>` : ''}
      `;
    }).join('');
  }

  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('width', '100%');
  svgEl.removeAttribute('height');
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
        const seriesHtml = seriesLines.join('<br>');
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
        if (val === 0) {
          tooltipEl.textContent = rect.dataset.range;
        } else {
          const text = formatTooltip(val);
          html = text + '<br>' + rect.dataset.range;
          if (onBarClick) html += '<br>(click to open detailed chart)';
          tooltipEl.innerHTML = html;
        }
      }
      tooltipEl.style.display = 'block';

      if (hoverOverlay) hoverOverlay.remove();
      hoverOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hoverOverlay.setAttribute('x', rect.getAttribute('x'));
      hoverOverlay.setAttribute('y', rect.getAttribute('y'));
      hoverOverlay.setAttribute('width', rect.getAttribute('width'));
      hoverOverlay.setAttribute('height', rect.getAttribute('height'));
      hoverOverlay.setAttribute('fill', 'white');
      hoverOverlay.setAttribute('opacity', '0.15');
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

export function formatMs(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = ms / 3600000;
  const days = ms / 86400000;
  if (ms < 3600000)  return `${totalMinutes}m`;
  if (ms < 36000000) { const m = totalMinutes % 60; return m ? `${Math.floor(hours)}h${m}m` : `${Math.floor(hours)}h`; }
  if (ms < 86400000) { const h = hours.toFixed(1); return `${h.endsWith('.0') ? Math.floor(hours) : h}h`; }
  const d = days.toFixed(1); return `${d.endsWith('.0') ? Math.floor(days) : d}d`;
}
