// Debug logging is off by default and gated on a `_debug` flag in
// chrome.storage.local. To enable in the field without a rebuild:
//   chrome.storage.local.set({ _debug: true })  // then reload the extension
// Logs include full tab URLs, so keep it off unless actively debugging.
let _debug = false;

// Read the flag once at startup. Called from bootstrap before listeners run.
export async function initDebug() {
  const { _debug: flag = false } = await chrome.storage.local.get('_debug');
  _debug = flag;
}

// Whether debug logging is on. Use at call sites to skip building expensive
// log arguments (e.g. JSON.stringify) when logging is off.
export function isDebug() {
  return _debug;
}

// Debug logger with a local YYYY-MM-DD HH:MM:SS.mmm timestamp prefix, so the
// [BG-DBG] trace can be correlated against the day/hour buckets in stored data.
export function dbg(...args) {
  if (!_debug) return;
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  console.log(`[BG-DBG ${date} ${time}]`, ...args);
}
