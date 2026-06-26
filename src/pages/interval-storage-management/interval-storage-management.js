import { formatBytes } from '../../shared/utils.js';
import { localDayKey, formatSpan } from '../../shared/timeUtils.js';
import { intervalStats } from '../../data/intervalLog.js';
import { PREF_LAST_EXPORT_AT } from '../../shared/prefKeys.js';

const spanChip = document.querySelector('#span-chip');
const spanTooltip = document.querySelector('#span-tooltip');
spanChip.addEventListener('mouseenter', () => { spanTooltip.style.display = 'block'; });
spanChip.addEventListener('mousemove', e => {
  spanTooltip.style.left = `${e.clientX + 12}px`;
  spanTooltip.style.top = `${e.clientY - 30}px`;
});
spanChip.addEventListener('mouseleave', () => { spanTooltip.style.display = 'none'; });

document.querySelector('#export-btn').addEventListener('click', async () => {
  const { exportBiteGuardData } = await import('../../data/importData.js');
  await exportBiteGuardData();
  await loadStats();
});

async function renderInterval() {
  const [stats, est] = await Promise.all([
    intervalStats(),
    navigator.storage?.estimate ? navigator.storage.estimate().catch(() => null) : null,
  ]);
  document.querySelector('#count-domains').textContent  = stats.domains.toLocaleString();
  document.querySelector('#count-subpages').textContent = stats.subpages.toLocaleString();
  document.querySelector('#count-records').textContent  = stats.rows.toLocaleString();

  if (stats.earliest && stats.latest) {
    const from = localDayKey(stats.earliest), to = localDayKey(stats.latest);
    document.querySelector('#span-value').textContent = formatSpan(from, to);
    spanTooltip.textContent = `${from} → ${to}`;
  } else {
    document.querySelector('#span-value').textContent = '—';
    document.querySelector('#span-info').style.display = 'none';
    spanChip.style.cursor = 'default';
  }

  // Row mix by kind. The bar's denominator is total rows (composition, not quota).
  // Per-kind size is the IndexedDB total apportioned by row share (rows are uniform
  // shape, so this is a fair ~estimate; the total itself includes index overhead).
  const { active, audio, idle } = stats.kinds;
  const intervalBytes = est?.usage ?? null;
  const pct = n => stats.rows > 0 ? `${(n / stats.rows * 100).toFixed(1)}%` : '0%';
  const sizeOf = n => intervalBytes != null && stats.rows > 0
    ? ` (~${formatBytes(intervalBytes * n / stats.rows)})` : '';
  document.querySelector('#bar-active').style.width = pct(active);
  document.querySelector('#bar-audio').style.width  = pct(audio);
  document.querySelector('#bar-idle').style.width   = pct(idle);
  document.querySelector('#legend-active').textContent = `Active: ${active.toLocaleString()} rows${sizeOf(active)}`;
  document.querySelector('#legend-audio').textContent  = `Audio: ${audio.toLocaleString()} rows${sizeOf(audio)}`;
  document.querySelector('#legend-idle').textContent   = `Idle: ${idle.toLocaleString()} rows${sizeOf(idle)}`;
  document.querySelector('#interval-total-text').textContent =
    intervalBytes != null ? formatBytes(intervalBytes) : 'size unavailable';
}

async function renderQuota() {
  // chrome.storage.local 10 MB (settings, cache, rules, legacy buckets).
  const totalBytes = await chrome.storage.local.getBytesInUse(null);
  const quota = chrome.storage.local.QUOTA_BYTES ?? 10485760;
  document.querySelector('#quota-bar-fill').style.width = `${Math.min(100, totalBytes / quota * 100).toFixed(1)}%`;
  document.querySelector('#quota-text').textContent = `${formatBytes(totalBytes)} / ${formatBytes(quota)}`;
}

async function renderLastExport() {
  const prefs = await chrome.storage.local.get(PREF_LAST_EXPORT_AT);
  const lastExportAt = prefs[PREF_LAST_EXPORT_AT];
  if (lastExportAt) {
    const diffDays = Math.floor((Date.now() - lastExportAt) / 86400000);
    document.querySelector('#export-age').textContent   = diffDays === 0 ? 'Today' : diffDays;
    document.querySelector('#export-label').textContent = diffDays === 0 ? '' : `day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    document.querySelector('#export-age').textContent   = 'Never';
    document.querySelector('#export-label').textContent = 'exported';
  }
}

async function loadStats() {
  for (const [name, fn] of [
    ['interval', renderInterval],
    ['quota', renderQuota], ['last-export', renderLastExport],
  ]) {
    try { await fn(); } catch (e) { console.error(`interval-storage ${name}:`, e); }
  }
}

await loadStats();
