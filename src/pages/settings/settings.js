import { autoStartIfMatches } from '../../shared/tour.js';
import { PREF_CLOCK_FORMAT, PREF_IDLE_THRESHOLD_SEC, PREF_WEEK_START, PREF_BADGE_ENABLED, PREF_LANGUAGE } from '../../shared/prefKeys.js';
import { WEEK_DAYS, DEFAULT_WEEK_START } from '../../shared/weekStart.js';
import { getIdleThresholdSec } from '../../shared/idleConfig.js';
import { initCustomDropdowns } from '../../shared/dropdown.js';
import { confirmDialog } from '../../shared/confirmDialog.js';
import { DEFAULT_CLOCK_FORMAT } from '../../shared/timeUtils.js';
import { DEFAULT_BADGE_ENABLED } from '../../background/badge.js';
import { BRAND_NAME } from '../../shared/brand.js';
import { enhanceNumberInput } from '../../shared/numberInput.js';
import { initI18n, applyI18n, t, DEFAULT_LANGUAGE } from '../../shared/i18n.js';

await initI18n();
applyI18n();
document.title = `${BRAND_NAME} — ${t('settings_pageTitle')}`;
document.querySelector('#idle-threshold-desc').textContent = t('settings_idleThresholdDesc', [BRAND_NAME]);

const CLOCK_FORMATS = ['24h', '12h'];
const LANGUAGES = ['auto', 'en', 'fr', 'es'];
const LANGUAGE_NAMES = { en: 'English', fr: 'Français', es: 'Español' };

const idleInput = document.querySelector('#idle-threshold-input');
const weekStartBtn = document.querySelector('#week-start-btn');
const weekStartMenu = document.querySelector('#week-start-menu');
const clockFormatBtn = document.querySelector('#clock-format-btn');
const clockFormatMenu = document.querySelector('#clock-format-menu');
const badgeEnabledInput = document.querySelector('#badge-enabled-input');
const languageBtn = document.querySelector('#language-btn');
const languageMenu = document.querySelector('#language-menu');

function languageLabel(code) {
  return code === DEFAULT_LANGUAGE ? t('settings_languageAuto') : LANGUAGE_NAMES[code];
}

function dayLabel(name) {
  return t(`weekday_${name}`);
}

const stored = await chrome.storage.local.get([PREF_WEEK_START, PREF_CLOCK_FORMAT, PREF_BADGE_ENABLED, PREF_LANGUAGE]);
const idleSec = await getIdleThresholdSec();
idleInput.value = Math.round(idleSec / 60);

let lastConfirmedDay = WEEK_DAYS.includes(stored[PREF_WEEK_START]) ? stored[PREF_WEEK_START] : DEFAULT_WEEK_START;
weekStartBtn.dataset.value = lastConfirmedDay;
weekStartBtn.firstChild.textContent = dayLabel(lastConfirmedDay);

badgeEnabledInput.checked = stored[PREF_BADGE_ENABLED] ?? DEFAULT_BADGE_ENABLED;

let currentClockFormat = CLOCK_FORMATS.includes(stored[PREF_CLOCK_FORMAT]) ? stored[PREF_CLOCK_FORMAT] : DEFAULT_CLOCK_FORMAT;
clockFormatBtn.dataset.value = currentClockFormat;
clockFormatBtn.firstChild.textContent = currentClockFormat;

let currentLanguage = LANGUAGES.includes(stored[PREF_LANGUAGE]) ? stored[PREF_LANGUAGE] : DEFAULT_LANGUAGE;
languageBtn.dataset.value = currentLanguage;
languageBtn.firstChild.textContent = languageLabel(currentLanguage);

function rebuildLanguageMenu() {
  languageMenu.replaceChildren();
  for (const code of LANGUAGES) {
    if (code === currentLanguage) continue;
    const opt = document.createElement('button');
    opt.value = code;
    opt.textContent = languageLabel(code);
    opt.addEventListener('click', onLanguagePick, { capture: true });
    languageMenu.append(opt);
  }
}

async function onLanguagePick(e) {
  e.stopPropagation();
  currentLanguage = e.currentTarget.value;
  languageMenu.classList.remove('open');
  await chrome.storage.local.set({ [PREF_LANGUAGE]: currentLanguage });
  location.reload();
}

rebuildLanguageMenu();

function rebuildClockFormatMenu() {
  clockFormatMenu.replaceChildren();
  for (const fmt of CLOCK_FORMATS) {
    if (fmt === currentClockFormat) continue;
    const opt = document.createElement('button');
    opt.value = fmt;
    opt.textContent = fmt;
    opt.addEventListener('click', onClockFormatPick, { capture: true });
    clockFormatMenu.append(opt);
  }
}

function onClockFormatPick(e) {
  e.stopPropagation();
  currentClockFormat = e.currentTarget.value;
  clockFormatBtn.dataset.value = currentClockFormat;
  clockFormatBtn.firstChild.textContent = currentClockFormat;
  clockFormatMenu.classList.remove('open');
  chrome.storage.local.set({ [PREF_CLOCK_FORMAT]: currentClockFormat });
  rebuildClockFormatMenu();
}

rebuildClockFormatMenu();

function rebuildWeekStartMenu() {
  weekStartMenu.replaceChildren();
  for (const name of WEEK_DAYS) {
    if (name === lastConfirmedDay) continue;
    const opt = document.createElement('button');
    opt.value = name;
    opt.textContent = dayLabel(name);
    opt.addEventListener('click', onWeekStartPick, { capture: true });
    weekStartMenu.append(opt);
  }
}

async function onWeekStartPick(e) {
  e.stopPropagation();
  const newValue = e.currentTarget.value;
  const ok = await confirmDialog({ message: t(weekStartBtn.dataset.i18nConfirm) });
  if (!ok) return;
  lastConfirmedDay = newValue;
  weekStartBtn.dataset.value = newValue;
  weekStartBtn.firstChild.textContent = dayLabel(newValue);
  weekStartMenu.classList.remove('open');
  await chrome.storage.local.set({ [PREF_WEEK_START]: newValue });
  rebuildWeekStartMenu();
}

rebuildWeekStartMenu();
initCustomDropdowns(document);

badgeEnabledInput.addEventListener('change', () => {
  chrome.storage.local.set({ [PREF_BADGE_ENABLED]: badgeEnabledInput.checked });
});

idleInput.addEventListener('change', async () => {
  const minutes = Math.max(1, Math.round(Number(idleInput.value)));
  idleInput.value = minutes;
  await chrome.storage.local.set({ [PREF_IDLE_THRESHOLD_SEC]: minutes * 60 });
});

enhanceNumberInput('idle-threshold-input');

autoStartIfMatches('settings', [
  {
    selector: '#settings-main',
    title: t('tour_settings_main_title'),
    body: t('tour_settings_main_body'),  },
  {
    selector: '#back-btn',
    title: t('tour_settings_back_title'),
    body: t('tour_settings_back_body', [BRAND_NAME]),
    handoff: { nextSurface: 'dashboard', nextStepIndex: 10, mode: 'inPage' },  },
]);
