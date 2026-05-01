export function formatMs(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = ms / 3600000;
  const days = ms / 86400000;
  if (ms < 3600000)  return `${totalMinutes}m`;
  if (ms < 36000000) { const m = totalMinutes % 60; return m ? `${Math.floor(hours)}h${m}m` : `${Math.floor(hours)}h`; }
  if (ms < 86400000) { const h = hours.toFixed(1); return `${h.endsWith('.0') ? Math.floor(hours) : h}h`; }
  const d = days.toFixed(1); return `${d.endsWith('.0') ? Math.floor(days) : d}d`;
}
