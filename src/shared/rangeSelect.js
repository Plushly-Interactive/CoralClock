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
  div.innerHTML = `<button class="dropdown-btn" id="range-select" data-value="7">Last 7 days<span class="dropdown-arrow">▼</span></button>
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

  rangeSelect.parentElement.querySelector('.dropdown-menu').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      rangeSelect.dataset.value = btn.value;
      rangeSelect.firstChild.textContent = btn.textContent;
      rangeSelect.parentElement.querySelector('.dropdown-menu').classList.remove('open');
      sessionStorage.setItem('timeRange', btn.value);
      onChange();
    });
  });

  rangeSelect.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = rangeSelect.parentElement.querySelector('.dropdown-menu');
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  });
}
