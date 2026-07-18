import { CHANGELOG_ENTRIES } from './changelogEntries.js';

const CHANGELOG_KEY = 'lastShownChangelogVersion';

async function readLastShownVersion() {
  const { [CHANGELOG_KEY]: version } = await chrome.storage.local.get(CHANGELOG_KEY);
  return version;
}

async function writeLastShownVersion(version) {
  await chrome.storage.local.set({ [CHANGELOG_KEY]: version });
}

// Stored value lives in entries-space (the newest authored entry), not the
// manifest version — a patch release with no changelog-worthy entry would
// otherwise never match an entry.version and getUnseenChangelogEntries()
// would fall into its idx===-1 branch on every future open.
function newestEntryVersion() {
  return CHANGELOG_ENTRIES.at(-1)?.version ?? chrome.runtime.getManifest().version;
}

export async function seedChangelogOnInstall() {
  await writeLastShownVersion(newestEntryVersion());
}

// Existing installs never had CHANGELOG_KEY set before this feature shipped —
// seed silently on first check so they don't see the entire past history at once.
export async function getUnseenChangelogEntries() {
  const lastShown = await readLastShownVersion();
  if (lastShown === undefined) {
    await seedChangelogOnInstall();
    return [];
  }
  const idx = CHANGELOG_ENTRIES.findIndex(e => e.version === lastShown);
  // A lastShown value with no matching entry (e.g. seeded before any entries
  // existed) is treated as caught-up rather than dumping the whole history.
  return idx === -1 ? [] : CHANGELOG_ENTRIES.slice(idx + 1);
}

export async function markChangelogSeen() {
  await writeLastShownVersion(newestEntryVersion());
}
