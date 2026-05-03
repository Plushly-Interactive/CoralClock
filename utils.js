export function drawBarChart({ svgEl, tooltipEl, data, maxVal, getValue, formatVal, formatTooltip = formatVal, hideMidTicks = () => false, color }) {
  const W = 600, H = 200, padLeft = 52, padRight = 8, padTop = 10, padBottom = 28;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;
  const barW = Math.max(2, Math.floor(innerW / data.length) - 2);
  const gap = Math.floor(innerW / data.length);
  const labelEvery = data.length === 24 ? 3 : Math.ceil(data.length / 10);

  const yTicks = [0, 0.33, 0.66, 1].map(t => ({
    val: maxVal * t,
    y: padTop + innerH - Math.round(t * innerH),
  }));

  const hideMid = hideMidTicks(maxVal);
  const gridlines = yTicks.map(({ y, val }, i) => {
    const isMid = i === 1 || i === 2;
    const label = hideMid && isMid ? '' : `<text x="${padLeft - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#888">${formatVal(val)}</text>`;
    return `<line x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}" stroke="#f0f0f0" stroke-width="1"/>${label}`;
  }).join('');

  const rects = data.map((d, i) => {
    const val = getValue(d);
    const barH = maxVal > 0 ? Math.round((val / maxVal) * innerH) : 0;
    const x = padLeft + i * gap + (gap - barW) / 2;
    const y = padTop + innerH - barH;
    const showLabel = i % labelEvery === 0 || i === data.length - 1;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="2"></rect>
      <rect x="${x}" y="${padTop}" width="${barW}" height="${innerH}" fill="transparent"
        data-range="${d.range}" data-val="${val}"></rect>
      ${showLabel ? `<text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#888">${d.label}</text>` : ''}
    `;
  }).join('');

  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('width', '100%');
  svgEl.setAttribute('height', H);
  svgEl.innerHTML = gridlines + rects;

  svgEl.querySelectorAll('rect[data-range]').forEach(rect => {
    rect.addEventListener('mouseenter', () => {
      tooltipEl.textContent = `${formatTooltip(Number(rect.dataset.val))} / ${rect.dataset.range}`;
      tooltipEl.style.display = 'block';
    });
    rect.addEventListener('mousemove', (e) => {
      const box = svgEl.getBoundingClientRect();
      tooltipEl.style.left = `${e.clientX - box.left + 10}px`;
      tooltipEl.style.top = `${e.clientY - box.top - 28}px`;
    });
    rect.addEventListener('mouseleave', () => {
      tooltipEl.style.display = 'none';
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
