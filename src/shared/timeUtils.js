export function dayKeysForRange(range, allDaysSource) {
  if (range === 'today') return [localDayKey(Date.now())];
  if (range === 'all') return Object.keys(allDaysSource ?? {}).sort();
  const now = new Date();
  const n = parseInt(range);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (n - 1 - i));
    return localDayKey(d.getTime());
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
