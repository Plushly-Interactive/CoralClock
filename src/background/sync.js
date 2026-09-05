import init, { Engine } from '../vendor/reeflect-core/reeflect_core_wasm.js';
import { buildTime } from '../vendor/reeflect-core/time-from-date.mjs';
import { syncStorage } from '../data/syncStorage.js';
import { db, deviceId, appendIntervals, count, deleteByDomain } from '../data/intervalLog.js';
import { invalidate } from '../data/intervalAggregates.js';
import { PREF_WEEK_START } from '../shared/prefKeys.js';
import { DEFAULT_WEEK_START } from '../shared/weekStart.js';
import { dbg } from './trackingDebug.js';

// Where the extension syncs to. One server for everyone; `_syncBaseUrl` in storage.local is a
// hidden developer override, never shown on the settings page.
export const SYNC_BASE_URL_DEFAULT = 'http://127.0.0.1:8787';
export const SYNC_ALARM = 'sync';
const SYNC_STATUS_KEY = 'syncStatus';
const DAY = 86_400_000;

let wasmReady = null;
function loadCore() {
  wasmReady ??= init(chrome.runtime.getURL('src/vendor/reeflect-core/reeflect_core_wasm_bg.wasm'));
  return wasmReady;
}

const fetchHttp = {
  async send(requestJson) {
    const req = JSON.parse(requestJson);
    const headers = { 'content-type': 'application/json' };
    if (req.bearer) headers.authorization = `Bearer ${req.bearer}`;
    const r = await fetch(req.path, { method: req.method, headers, body: req.body ?? undefined });
    return JSON.stringify({ status: r.status, body: await r.text() });
  },
};

// The DEK lives only in storage.session: in memory, survives service-worker restarts,
// gone when the browser closes, unreachable from content scripts.
const sessionKeys = {
  async loadDek() {
    const { _dek } = await chrome.storage.session.get('_dek');
    return _dek ? new Uint8Array(_dek) : null;
  },
  async storeDek(dek) {
    await chrome.storage.session.set({ _dek: Array.from(dek) });
  },
  async clearDek() {
    await chrome.storage.session.remove('_dek');
  },
};

async function makeEngine() {
  await loadCore();
  const { _syncBaseUrl } = await chrome.storage.local.get('_syncBaseUrl');
  const config = JSON.stringify({ clientType: 'web', baseUrl: _syncBaseUrl || SYNC_BASE_URL_DEFAULT });
  return new Engine(config, syncStorage, fetchHttp, sessionKeys);
}

async function timeJson(now) {
  const { [PREF_WEEK_START]: ws = DEFAULT_WEEK_START } = await chrome.storage.local.get(PREF_WEEK_START);
  return JSON.stringify(buildTime(ws.slice(0, 3), now - 400 * DAY, now));
}

export async function hasAccount() {
  return (await db.meta.get('account')) != null;
}

// One engine per run: the service worker is torn down when idle anyway.
export async function runSync(now = Date.now()) {
  if (!(await hasAccount())) return { skipped: 'no account' };
  const engine = await makeEngine();
  const status = { lastRunAt: now };
  try {
    const report = JSON.parse(await engine.tick(await timeJson(now)));
    if (report.pulled || report.deletedLocal) invalidate();
    status.lastReport = report;
    dbg('sync: tick', report);
  } catch (e) {
    status.lastError = String(e?.message ?? e);
    dbg('sync: tick failed', status.lastError);
  }
  await chrome.storage.local.set({ [SYNC_STATUS_KEY]: status });
  return status;
}

export async function register(passphrase) {
  const engine = await makeEngine();
  const phrase = await engine.register(passphrase);
  dbg('sync: registered');
  return phrase;
}

export async function linkDevice(phrase) {
  const engine = await makeEngine();
  await engine.linkDevice(phrase);
  dbg('sync: linked');
}

export async function unlock(passphrase) {
  const engine = await makeEngine();
  await engine.unlock(passphrase);
}

export async function requestDelete() {
  const engine = await makeEngine();
  await engine.requestDelete();
  await db.meta.clear();
  await chrome.storage.local.remove(SYNC_STATUS_KEY);
}

// Design: clamp(L_tightest / (10 × max(1, N−1)), 1, 5) minutes, so the overshoot from
// unsynced devices stays a tenth of the tightest limit. N comes from the device registry
// once the UI fetches it; until then two devices are assumed.
export async function syncPeriodMinutes() {
  const { rules = [], _syncDeviceCount = 2 } = await chrome.storage.local.get(['rules', '_syncDeviceCount']);
  const mult = { minutes: 1, hours: 60, days: 1440 };
  const tightest = Math.min(...rules.filter((r) => r.enabled).map((r) => r.limit * (mult[r.limitUnit] ?? 1)), Infinity);
  if (!Number.isFinite(tightest)) return 5;
  return Math.min(5, Math.max(1, tightest / (10 * Math.max(1, _syncDeviceCount - 1))));
}

export async function ensureSyncAlarm() {
  const periodInMinutes = await syncPeriodMinutes();
  const existing = await chrome.alarms.get(SYNC_ALARM);
  if (!existing || existing.periodInMinutes !== periodInMinutes) chrome.alarms.create(SYNC_ALARM, { periodInMinutes });
}

// Test seam for scripts/os/sync-smoke.mjs, which drives the service worker from Playwright.
globalThis.reeflectSync = { register, linkDevice, unlock, runSync, requestDelete, hasAccount, deviceId, appendIntervals, count, deleteByDomain, resetReconcileGate: () => db.meta.delete('lastReconciledAt') };
