import { autoStartIfMatches } from '../../shared/tour.js';
import { PREF_CLOCK_FORMAT, PREF_IDLE_THRESHOLD_SEC, PREF_WEEK_START, PREF_BADGE_ENABLED } from '../../shared/prefKeys.js';
import { WEEK_DAYS, DEFAULT_WEEK_START } from '../../shared/weekStart.js';
import { getIdleThresholdSec } from '../../shared/idleConfig.js';
import { initCustomDropdowns } from '../../shared/dropdown.js';
import { confirmDialog } from '../../shared/confirmDialog.js';
import { DEFAULT_CLOCK_FORMAT } from '../../shared/timeUtils.js';
import { DEFAULT_BADGE_ENABLED } from '../../background/badge.js';

const CLOCK_FORMATS = ['24h', '12h'];

const idleInput = document.querySelector('#idle-threshold-input');
const weekStartBtn = document.querySelector('#week-start-btn');
const weekStartMenu = document.querySelector('#week-start-menu');
const clockFormatBtn = document.querySelector('#clock-format-btn');
const clockFormatMenu = document.querySelector('#clock-format-menu');
const badgeEnabledInput = document.querySelector('#badge-enabled-input');

function dayLabel(name) {
  return name[0].toUpperCase() + name.slice(1);
}

const stored = await chrome.storage.local.get([PREF_WEEK_START, PREF_CLOCK_FORMAT, PREF_BADGE_ENABLED]);
const idleSec = await getIdleThresholdSec();
idleInput.value = Math.round(idleSec / 60);

let lastConfirmedDay = WEEK_DAYS.includes(stored[PREF_WEEK_START]) ? stored[PREF_WEEK_START] : DEFAULT_WEEK_START;
weekStartBtn.dataset.value = lastConfirmedDay;
weekStartBtn.firstChild.textContent = dayLabel(lastConfirmedDay);

badgeEnabledInput.checked = stored[PREF_BADGE_ENABLED] ?? DEFAULT_BADGE_ENABLED;

let currentClockFormat = CLOCK_FORMATS.includes(stored[PREF_CLOCK_FORMAT]) ? stored[PREF_CLOCK_FORMAT] : DEFAULT_CLOCK_FORMAT;
clockFormatBtn.dataset.value = currentClockFormat;
clockFormatBtn.firstChild.textContent = currentClockFormat;

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
  const ok = await confirmDialog({ message: weekStartBtn.dataset.confirmMessage });
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

autoStartIfMatches('settings', [
  {
    selector: '#settings-main',
    title: 'Settings',
    body: 'Adjust idle threshold, clock format, and week start day. Changes take effect immediately.',
    newInVersion: 3,
  },
  {
    selector: '#back-btn',
    title: 'Back to the dashboard',
    body: 'Click the back arrow to return to the dashboard and finish the tour.',
    handoff: { nextSurface: 'dashboard', nextStepIndex: 8, mode: 'inPage' },
    newInVersion: 3,
  },
]);
