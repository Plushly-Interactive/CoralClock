import { rotatedDayLabels, weekDow } from './weekStart.js';
import { localDayKey } from './timeUtils.js';
import { t, getLocale } from './i18n.js';

function monthName(m) {
  return new Intl.DateTimeFormat(getLocale(), { month: 'long' }).format(new Date(2023, m, 1));
}
const PREV_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="15 18 9 12 15 6"></polyline></svg>';
const NEXT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="9 18 15 12 9 6"></polyline></svg>';
const YEAR_SPAN = 15;

export function getDateValue(id) {
  return document.querySelector(`#${id} .dropdown-btn`).dataset.value || '';
}

export function buildDatePicker(id, initDateStr, onChange) {
  const wrap = document.querySelector(`#${id}`);
  wrap.dataset.direction = 'up';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dropdown-btn';
  btn.dataset.value = initDateStr || '';
  btn.innerHTML = `<span class="date-btn-label">${initDateStr || t('datePicker_selectDate')}</span><span class="icon-mask icon-calendar date-btn-icon"></span>`;
  btn.querySelector('.date-btn-label').title = initDateStr || t('datePicker_selectDate');

  const popup = document.createElement('div');
  popup.className = 'dropdown-menu calendar-popup';

  const yearRow = document.createElement('div');
  yearRow.className = 'nav-strip calendar-year-row';
  const yearWrap = document.createElement('span');
  yearWrap.className = 'custom-dropdown';
  const yearBtn = document.createElement('button');
  yearBtn.type = 'button';
  yearBtn.className = 'link-btn cal-year-btn';
  const yearMenu = document.createElement('div');
  yearMenu.className = 'dropdown-menu year-menu';
  yearWrap.append(yearBtn, yearMenu);
  yearRow.append(yearWrap);

  const navStrip = document.createElement('div');
  navStrip.className = 'nav-strip calendar-nav-strip';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'link-btn nav-arrow-btn';
  prevBtn.innerHTML = PREV_ICON;
  const monthLabel = document.createElement('span');
  monthLabel.className = 'nav-period-label';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'link-btn nav-arrow-btn';
  nextBtn.innerHTML = NEXT_ICON;
  navStrip.append(prevBtn, monthLabel, nextBtn);

  const weekdaysRow = document.createElement('div');
  weekdaysRow.className = 'calendar-weekdays';

  const daysWrap = document.createElement('div');
  daysWrap.className = 'calendar-days-wrap';
  const daysGrid = document.createElement('div');
  daysGrid.className = 'calendar-days';
  const todayBtn = document.createElement('button');
  todayBtn.type = 'button';
  todayBtn.className = 'link-btn cal-today-btn';
  todayBtn.textContent = t('stat_today');
  daysWrap.append(daysGrid, todayBtn);

  popup.append(yearRow, navStrip, weekdaysRow, daysWrap);
  wrap.append(btn, popup);
  popup.addEventListener('click', e => {
    e.stopPropagation();
    if (!yearWrap.contains(e.target)) yearMenu.classList.remove('open');
  });

  const initDate = initDateStr ? new Date(`${initDateStr}T00:00:00`) : new Date();
  let viewYear = initDate.getFullYear();
  let viewMonth = initDate.getMonth();

  function renderYearMenu() {
    yearMenu.innerHTML = '';
    const maxYear = new Date().getFullYear();
    for (let y = viewYear - YEAR_SPAN; y <= Math.min(viewYear + YEAR_SPAN, maxYear); y++) {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.textContent = y;
      if (y === viewYear) opt.classList.add('is-selected');
      opt.addEventListener('click', () => {
        viewYear = y;
        yearMenu.classList.remove('open');
        renderMonth();
      });
      yearMenu.appendChild(opt);
    }
  }

  function renderMonth() {
    yearBtn.textContent = viewYear;
    monthLabel.textContent = monthName(viewMonth);

    weekdaysRow.innerHTML = '';
    for (const label of rotatedDayLabels()) {
      const span = document.createElement('span');
      span.textContent = label;
      weekdaysRow.appendChild(span);
    }

    daysGrid.innerHTML = '';
    const leading = weekDow(new Date(viewYear, viewMonth, 1));
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayKey = localDayKey(Date.now());
    const selectedKey = btn.dataset.value;

    for (let i = 0; i < leading; i++) {
      const blank = document.createElement('span');
      blank.className = 'cal-day cal-day-blank';
      daysGrid.appendChild(blank);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const key = localDayKey(new Date(viewYear, viewMonth, d).getTime());
      const dayBtn = document.createElement('button');
      dayBtn.type = 'button';
      dayBtn.className = 'cal-day';
      if (key === todayKey) dayBtn.classList.add('today');
      if (key === selectedKey) dayBtn.classList.add('is-selected');
      dayBtn.textContent = d;
      dayBtn.addEventListener('click', () => {
        btn.dataset.value = key;
        const label = btn.querySelector('.date-btn-label');
        label.textContent = key;
        label.title = key;
        popup.classList.remove('open');
        if (onChange) onChange();
      });
      daysGrid.appendChild(dayBtn);
    }

    const trailing = 42 - leading - daysInMonth;
    for (let i = 0; i < trailing; i++) {
      const blank = document.createElement('span');
      blank.className = 'cal-day cal-day-blank';
      daysGrid.appendChild(blank);
    }
  }
  renderMonth();

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = popup.classList.contains('open');
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
    if (!isOpen) { renderMonth(); popup.classList.add('open'); }
  });
  prevBtn.addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderMonth();
  });
  nextBtn.addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderMonth();
  });
  todayBtn.addEventListener('click', () => {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    const key = localDayKey(now.getTime());
    btn.dataset.value = key;
    const label = btn.querySelector('.date-btn-label');
    label.textContent = key;
    label.title = key;
    popup.classList.remove('open');
    if (onChange) onChange();
  });
  yearBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = yearMenu.classList.contains('open');
    document.querySelectorAll('.dropdown-menu.open').forEach(m => { if (!m.contains(yearMenu)) m.classList.remove('open'); });
    if (isOpen) {
      yearMenu.classList.remove('open');
    } else {
      renderYearMenu();
      yearMenu.classList.add('open');
      yearMenu.querySelector('.is-selected')?.scrollIntoView({ block: 'center' });
    }
  });
}
