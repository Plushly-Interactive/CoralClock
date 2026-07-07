// Messages must use positional $1/$2 substitution only — no named $FOO$
// placeholders, no literal $ escaping. chrome.i18n.getMessage supports those,
// but the override loader below (used when the user picks a language that
// differs from the browser's) does not, and the two must behave identically.
import { PREF_LANGUAGE } from './prefKeys.js';

export const DEFAULT_LANGUAGE = 'auto';

let overrideMessages = null;

export async function initI18n() {
  const stored = (await chrome.storage.local.get(PREF_LANGUAGE))[PREF_LANGUAGE];
  const lang = stored || DEFAULT_LANGUAGE;
  if (lang === DEFAULT_LANGUAGE) {
    overrideMessages = null;
    return;
  }
  const res = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
  overrideMessages = res.ok ? await res.json() : null;
}

export function t(key, subs) {
  const entry = overrideMessages?.[key];
  if (!entry) return chrome.i18n.getMessage(key, subs);
  const list = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs];
  return entry.message.replace(/\$(\d+)/g, (_match, n) => list[n - 1] ?? '');
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  // For elements with non-text children after the label (e.g. a dropdown
  // button's arrow icon) — replaces only the leading text node, not the whole subtree.
  root.querySelectorAll('[data-i18n-firstchild]').forEach((el) => {
    el.firstChild.textContent = t(el.dataset.i18nFirstchild);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
}
