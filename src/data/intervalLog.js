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

// Delete every row for a domain. Resolves to the number deleted.
export function deleteByDomain(domain) {
  return db.intervals.filter(r => r.domain === domain).delete();
}

// Delete rows that START within [fromTs, toTs), optionally only for `domain`.
// Resolves to the number deleted.
export function deleteRange(fromTs, toTs, domain = null) {
  return db.intervals.filter(r => r.from >= fromTs && r.from < toTs && (!domain || r.domain === domain)).delete();
}

// Delete every row for one domain+path. Resolves to the number deleted.
export function deletePath(domain, path) {
  return db.intervals.filter(r => r.domain === domain && r.path === path).delete();
}

// Collapse rows that START before `beforeTs` to site level: drop the path and
// merge each domain's same-kind ranges into the fewest disjoint rows. Preserves
// site-level active/audio time (a union, same as the aggregates compute) while
// shedding per-page detail and shrinking the log. Resolves to rows removed.
export async function dropPathsBefore(beforeTs) {
  const old = await db.intervals.filter(r => r.from < beforeTs).toArray();
  if (old.length === 0) return 0;

  const byKey = new Map();  // "domain\nkind" -> [[from,to], ...]
  for (const r of old) {
    const k = `${r.domain}\n${r.kind}`;
    let arr = byKey.get(k);
    if (!arr) { arr = []; byKey.set(k, arr); }
    arr.push([r.from, r.to]);
  }

  const merged = [];
  for (const [k, ranges] of byKey) {
    const [domain, kind] = k.split('\n');
    ranges.sort((a, b) => a[0] - b[0]);
    let [cs, ce] = ranges[0];
    for (let i = 1; i < ranges.length; i++) {
      const [s, e] = ranges[i];
      if (s <= ce) { if (e > ce) ce = e; }            // overlap/touch -> extend
      else { merged.push({ domain, path: '/', kind, from: cs, to: ce }); cs = s; ce = e; }
    }
    merged.push({ domain, path: '/', kind, from: cs, to: ce });
  }

  await db.transaction('rw', db.intervals, async () => {
    await db.intervals.bulkDelete(old.map(r => r.id));
    await db.intervals.bulkAdd(merged);
  });
  return old.length - merged.length;
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
