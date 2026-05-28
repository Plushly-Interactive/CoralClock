import { PREF_IDLE_THRESHOLD_SEC, PREF_WEEK_START } from '../../shared/prefKeys.js';
import { WEEK_DAYS, DEFAULT_WEEK_START } from '../../shared/weekStart.js';
import { getIdleThresholdSec } from '../../shared/idleConfig.js';
import { initCustomDropdowns } from '../../shared/dropdown.js';
import { confirmDialog } from '../../shared/confirmDialog.js';

const idleInput = document.querySelector('#idle-threshold-input');
const weekStartBtn = document.querySelector('#week-start-btn');
const weekStartMenu = document.querySelector('#week-start-menu');

function dayLabel(name) {
  return name[0].toUpperCase() + name.slice(1);
}

const stored = await chrome.storage.local.get(PREF_WEEK_START);
const idleSec = await getIdleThresholdSec();
idleInput.value = Math.round(idleSec / 60);

let lastConfirmedDay = WEEK_DAYS.includes(stored[PREF_WEEK_START]) ? stored[PREF_WEEK_START] : DEFAULT_WEEK_START;
weekStartBtn.dataset.value = lastConfirmedDay;
weekStartBtn.firstChild.textContent = dayLabel(lastConfirmedDay);

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

idleInput.addEventListener('change', async () => {
  const minutes = Math.max(1, Math.round(Number(idleInput.value)));
  idleInput.value = minutes;
  await chrome.storage.local.set({ [PREF_IDLE_THRESHOLD_SEC]: minutes * 60 });
});
