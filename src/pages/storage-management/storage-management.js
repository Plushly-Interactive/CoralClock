function buildHourDropdown(id, initHour) {
  const wrap = document.querySelector(`#${id}`);
  wrap.dataset.direction = 'up';
  const btn = document.createElement('button');
  btn.className = 'dropdown-btn';
  btn.dataset.value = initHour;
  btn.innerHTML = `${String(initHour).padStart(2, '0')}h<span class="dropdown-arrow">▼</span>`;
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  for (let h = 0; h <= 24; h++) {
    const opt = document.createElement('button');
    opt.value = h;
    opt.textContent = String(h).padStart(2, '0') + 'h';
    menu.appendChild(opt);
  }
  wrap.append(btn, menu);
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
  });
  menu.querySelectorAll('button').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      btn.firstChild.textContent = opt.textContent;
      btn.dataset.value = opt.value;
      menu.classList.remove('open');
    });
  });
}

buildHourDropdown('range-from-hour', 0);
buildHourDropdown('range-to-hour', 23);
buildHourDropdown('repeat-from-hour', 9);
buildHourDropdown('repeat-to-hour', 17);

document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
});

const spanChip = document.querySelector('#span-chip');
const spanTooltip = document.querySelector('#span-tooltip');
spanChip.addEventListener('mouseenter', () => { spanTooltip.style.display = 'block'; });
spanChip.addEventListener('mousemove', e => {
  spanTooltip.style.left = `${e.clientX + 12}px`;
  spanTooltip.style.top = `${e.clientY - 30}px`;
});
spanChip.addEventListener('mouseleave', () => { spanTooltip.style.display = 'none'; });

const notif = document.querySelector('#notification');

function showNotif(msg) {
  notif.textContent = msg;
  notif.removeAttribute('hidden');
  setTimeout(() => notif.setAttribute('hidden', ''), 3000);
}

function showConfirm(html, confirmLabel, onConfirm) {
  const ov = document.createElement('div');
  ov.className = 'dlg-overlay';
  const dlg = document.createElement('div');
  dlg.className = 'dlg';
  dlg.innerHTML = `<div class="dlg-body">${html}</div><div class="dlg-actions"><button class="btn dlg-cancel">Cancel</button><button class="btn dlg-ok">${confirmLabel}</button></div>`;
  document.body.append(ov, dlg);
  const close = () => { ov.remove(); dlg.remove(); };
  ov.onclick = close;
  dlg.querySelector('.dlg-cancel').onclick = close;
  dlg.querySelector('.dlg-ok').onclick = () => { close(); onConfirm(); };
  dlg.querySelector('.dlg-ok').focus();
}

const scanOverlay = document.querySelector('#scan-overlay');
document.querySelector('#scan-btn').addEventListener('click', () => { scanOverlay.style.display = ''; });
document.querySelector('#overlay-close').addEventListener('click', () => { scanOverlay.style.display = 'none'; });
document.querySelector('#overlay-delete-btn').addEventListener('click', () => {
  showConfirm('Delete all selected insignificant records?<br><br>This cannot be undone.', 'Delete', () => {
    scanOverlay.style.display = 'none';
    showNotif('Insignificant records deleted — freed approx 2.1 KB.');
  });
});

const contiguousForm = document.querySelector('#range-form-row');
const repeatForm = document.querySelector('#repeat-form');
document.querySelector('#mode-contiguous-btn').addEventListener('click', () => {
  contiguousForm.style.display = '';
  repeatForm.style.display = 'none';
  document.querySelector('#mode-contiguous-btn').classList.add('active');
  document.querySelector('#mode-repeat-btn').classList.remove('active');
});
document.querySelector('#mode-repeat-btn').addEventListener('click', () => {
  contiguousForm.style.display = 'none';
  repeatForm.style.display = '';
  document.querySelector('#mode-repeat-btn').classList.add('active');
  document.querySelector('#mode-contiguous-btn').classList.remove('active');
});

const siteInput = document.querySelector('#site-filter-input');
const deleteAllBtn = document.querySelector('#delete-all-site-btn');
function syncDeleteAllBtn() { deleteAllBtn.disabled = !siteInput.value.trim(); }
siteInput.addEventListener('input', syncDeleteAllBtn);
document.querySelector('#site-filter-clear').addEventListener('click', () => { siteInput.value = ''; syncDeleteAllBtn(); });
deleteAllBtn.addEventListener('click', () => {
  const s = siteInput.value.trim();
  showConfirm(`<strong>Delete all data for ${s}?</strong><br><br>This permanently removes all tracking records for ${s} — domains, subpages, daily and hourly — across all dates. This cannot be undone.`, 'Delete', () => showNotif(`All data for ${s} deleted.`));
});

document.querySelector('#delete-range-btn').addEventListener('click', () => {
  showConfirm('Delete records in the selected range?<br><br>This cannot be undone.', 'Delete', () => showNotif('Range deleted.'));
});

document.querySelector('#drop-hourly-btn').addEventListener('click', () => {
  const days = document.querySelector('#drop-days-input').value;
  showConfirm(`Drop all hourly data older than ${days} days?<br><br>Daily aggregates are preserved. This cannot be undone.`, 'Drop hourly', () => showNotif(`Hourly data older than ${days} days dropped — freed ~280 KB.`));
});

const repairOverlay = document.querySelector('#repair-overlay');
document.querySelector('#repair-btn').addEventListener('click', () => { repairOverlay.style.display = ''; });
document.querySelector('#repair-overlay-close').addEventListener('click', () => { repairOverlay.style.display = 'none'; });
document.querySelector('#repair-overlay-cancel-btn').addEventListener('click', () => { repairOverlay.style.display = 'none'; });
document.querySelector('#repair-all-btn').addEventListener('click', () => {
  repairOverlay.style.display = 'none';
  const healthCard = document.querySelector('#health-card');
  healthCard.querySelector('.health-dot').classList.add('ok');
  const textSpan = healthCard.querySelector('.health-status span:last-child');
  textSpan.innerHTML = '<strong>All checks passed</strong>';
  healthCard.querySelector('.issue-list').style.display = 'none';
  document.querySelector('#repair-btn').style.display = 'none';
  showNotif('14 issues reconciled — tracking data is now consistent.');
});

document.querySelector('#export-btn').addEventListener('click', () => showNotif('Export downloaded.'));
