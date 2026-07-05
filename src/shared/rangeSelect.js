import { initCustomDropdowns } from './dropdown.js';

const RANGE_OPTS = {
  today: 'Today',
  '7': 'Last 7 days',
  '30': 'Last 30 days',
  '180': 'Last 6 months',
  '365': 'Last year',
  all: 'All time',
};

export function createRangeDropdown() {
  const div = document.createElement('div');
  div.className = 'custom-dropdown';
  div.innerHTML = `<button class="dropdown-btn" id="range-select" data-value="7">Last 7 days<span class="dropdown-arrow"><svg width="12" height="12" viewBox="0 0 24 24"><polygon points="6,9 18,9 12,17" fill="currentColor" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/></svg></span></button>
    <div class="dropdown-menu">
      <button value="today">Today</button>
      <button value="7">Last 7 days</button>
      <button value="30">Last 30 days</button>
      <button value="180">Last 6 months</button>
      <button value="365">Last year</button>
      <button value="all">All time</button>
    </div>`;
  return div;
}

export function initRangeSelect(rangeSelect, onChange) {
  const savedRange = sessionStorage.getItem('timeRange') || '7';
  rangeSelect.dataset.value = savedRange;
  rangeSelect.firstChild.textContent = RANGE_OPTS[savedRange];

  initCustomDropdowns(rangeSelect.parentElement);

  rangeSelect.parentElement.querySelectorAll('.dropdown-menu button').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem('timeRange', btn.value);
      onChange();
    });
  });
}
