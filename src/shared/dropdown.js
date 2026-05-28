// Wires the standard custom-dropdown pattern (`.custom-dropdown` → `.dropdown-btn` +
// `.dropdown-menu`) within `root`: click the button to toggle, click an option to
// update the button's visible label + `dataset.value` and close the menu, click
// anywhere else to close any open menu. Specific dropdowns that need their own
// click logic (theme picker, rules-form matchtype) opt out via id.
export function initCustomDropdowns(root = document) {
  root.querySelectorAll('.dropdown-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      const isOpen = menu.classList.contains('open');
      root.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
      if (!isOpen) menu.classList.add('open');
    });
  });

  root.querySelectorAll('.dropdown-menu:not(#theme-dropdown):not(#form-matchtype-menu) button').forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = option.parentElement;
      const btn = menu.previousElementSibling;
      btn.firstChild.textContent = option.textContent;
      btn.dataset.value = option.value;
      menu.classList.remove('open');
    });
  });

  document.addEventListener('click', () => {
    root.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  });
}
