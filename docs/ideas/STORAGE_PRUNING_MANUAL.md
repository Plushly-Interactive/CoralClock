# Manual Storage Pruning

Manual pruning flips the model: user controls retention, extension monitors size and alerts.

---

## Measuring storage

### Size calculation

Chrome `storage.local` quota: **10 MB** (without `unlimitedStorage` permission)

Measure by serializing and measuring JSON size:
```js
const analyticsByHour = await storage.local.get('analyticsByHour');
const analyticsByDay = await storage.local.get('analyticsByDay');
const hourSize = new Blob([JSON.stringify(analyticsByHour.analyticsByHour)]).size;
const daySize = new Blob([JSON.stringify(analyticsByDay.analyticsByDay)]).size;
const totalSize = hourSize + daySize;
```

Could also use `chrome.storage.local.getBytesInUse()` (gives actual quota usage including metadata).

### When to measure

Options:
- A: On service worker startup (cheap, ties to extension lifecycle)
- B: On a periodic alarm (e.g. daily or weekly, more predictable)
- C: Both (on startup, then cache until next alarm)

---

## Alerting thresholds

When does the user need to know?

| Threshold | Action | Rationale |
|---|---|---|
| 70% (7 MB) | Show warning badge/banner in options page | Give user time to prune |
| 95% (9.5 MB) | Show urgent warning + recommend immediate pruning | At risk of quota exhaustion |
| 100% | Writes start failing silently | Data loss risk |

**Open question:** Does the UI live in:
- The main options/settings page (one section for storage info)?
- A dedicated "Storage" or "Data Management" tab?
- Both (small widget in settings, full page in admin area)?

---

## Manual pruning UI

### What the user controls

Two models:

**Model A: Date-based retention sliders**
```
Hourly data: Keep for [1 month |--------|] [6 months]
Daily data:  Keep for [1 year  |--------|] [5 years]
[Prune Now] button
```
Pros: Direct, predictable
Cons: User may not know what "retention" means; doesn't tie to their usage pattern

**Model B: "Keep last N sites / N days" + safety valve**
```
Keep hourly data from last [N] months
Keep daily data from last [N] years
Current size: 2.3 MB / 10 MB

[Delete oldest hourly data]  (removes 1 month bucket)
[Delete oldest daily data]   (removes 1 year bucket)
```
Pros: Granular, user can prune incrementally
Cons: More clicks if deleting a lot

**Model C: "Safe defaults" + expert mode**
```
[Use recommended retention] (3 months/2 years)
☐ Show advanced pruning options

If checked:
  Hourly retention: [3 months]
  Daily retention: [2 years]
  [Prune] [Delete all historical data]
```
Pros: Simple for most users, experts can tune
Cons: Extra clicks for power users

---

## Data flow

1. **Service worker on startup** → measure size → store in `storage.local` as `storageStatus: { sizeBytes, lastMeasured, analyticsByHourSize, analyticsByDaySize }`
2. **Options page (on open)** → read `storageStatus` → display size bar + current thresholds
3. **User adjusts sliders + clicks [Prune]** → runs pruning logic with those params → updates `storageStatus`
4. **Service worker daily alarm** → re-measure size (optional, for background monitoring)

---

## Open questions

1. **Measurement method:** `Blob.size` (simpler) or `chrome.storage.local.getBytesInUse()` (more accurate)?
2. **UI location:** widget in main settings, dedicated Storage tab, or both?
3. **UI model:** which of A/B/C above?
4. **Default retention:** if keeping 3 months/2 years, do we auto-prune to those on first install, or let user manually prune?
5. **Re-measurement frequency:** on startup only, or also on a periodic alarm?

---

## Pruning implementation

Once parameters are set:

```js
async function pruneTo(hourlyMonths, dailyYears) {
  const now = new Date();
  const hourCutoff = new Date(now.getFullYear(), now.getMonth() - hourlyMonths, 1);
  const dayCutoff = new Date(now.getFullYear() - dailyYears, now.getMonth(), now.getDate());
  
  // Get both stores
  const { analyticsByHour, analyticsByDay } = await storage.local.get(['analyticsByHour', 'analyticsByDay']);
  
  // Delete old keys
  const prunedHour = Object.fromEntries(
    Object.entries(analyticsByHour || {}).filter(([key]) => key >= hourCutoff.toISOString().split('T')[0])
  );
  const prunedDay = Object.fromEntries(
    Object.entries(analyticsByDay || {}).filter(([key]) => key >= dayCutoff.toISOString().split('T')[0])
  );
  
  await storage.local.set({ analyticsByHour: prunedHour, analyticsByDay: prunedDay });
  
  // Re-measure and update status
  await measureStorage();
}
```

---

## Next steps

Pick:
- Measurement method
- UI model (A/B/C)
- Storage thresholds (keep 70%/95%?)
- Default retention (if any)
