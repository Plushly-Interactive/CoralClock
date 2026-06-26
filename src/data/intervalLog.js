import Dexie from '../vendor/dexie.min.mjs';

// Storage for the interval-tracking experiment: one store, one row per closed
// presence range — { domain, path, kind, from, to }, kind ∈ active|audio|idle.
// overlap is NOT stored (= active ∩ audio, derivable). Nothing else is stored:
// time aggregates AND visit counts are derived from these ranges at read time.
// No secondary index — the only reader (intervalAggregates) scans the whole
// store, so an index would be dead weight.
const db = new Dexie('biteguard-intervals');
db.version(1).stores({
  intervals: '++id',
});

if (navigator.storage?.persist) navigator.storage.persist();

// One definition of "still the same continuous session" used in two places:
// the live-row flush extends a row across gaps this small (stitching flush/SW
// seams), and visit counting merges presence across gaps this small. Keeping it
// shared means a row boundary and a visit boundary mean the same thing.
export const SESSION_GAP_MS = 1000;

export function appendIntervals(rows) {
  return db.intervals.bulkAdd(rows);
}

// Insert one row, resolving to its id (for live-row coalescing).
export function appendInterval(row) {
  return db.intervals.add(row);
}

// Extend an open live row's end in place.
export function touch(id, to) {
  return db.intervals.update(id, { to });
}

export function allIntervals() {
  return db.intervals.toArray();
}

export function clearAll() {
  return db.intervals.clear();
}

// Delete rows by id (for import conflict resolution).
export function deleteByIds(ids) {
  return db.intervals.bulkDelete(ids);
}

// Row count, for the dashboard's size indicator.
export function count() {
  return db.intervals.count();
}

// Rows, distinct domains/subpages, and date span in one streaming pass (each()
// does not build a full array, so this stays low-memory as the log grows).
// earliest/latest are ms timestamps, null when empty.
export async function intervalStats() {
  let rows = 0, earliest = Infinity, latest = -Infinity;
  const domains = new Set(), subpages = new Set();
  const kinds = { active: 0, audio: 0, idle: 0 };
  await db.intervals.each(r => {
    rows++;
    domains.add(r.domain);
    subpages.add(`${r.domain}\n${r.path}`);
    if (r.kind in kinds) kinds[r.kind]++;
    if (r.from < earliest) earliest = r.from;
    if (r.to > latest) latest = r.to;
  });
  return {
    rows, domains: domains.size, subpages: subpages.size, kinds,
    earliest: rows ? earliest : null, latest: rows ? latest : null,
  };
}
