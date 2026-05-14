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
