export function formatMs(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = ms / 3600000;
  const days = ms / 86400000;
  if (ms < 3600000)  return `${totalMinutes}m`;
  if (ms < 36000000) return `${Math.floor(hours)}h${totalMinutes % 60}m`;
  if (ms < 86400000) return `${hours.toFixed(1)}h`;
  return `${days.toFixed(1)}d`;
}
