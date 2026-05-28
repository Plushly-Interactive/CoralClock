export function confirmDialog({ message, confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.id = 'confirm-dialog';
    dialog.innerHTML = `
      <div id="confirm-dialog-body"></div>
      <div id="confirm-dialog-actions">
        <button id="confirm-dialog-cancel" class="btn"></button>
        <button id="confirm-dialog-ok" class="btn"></button>
      </div>
    `;
    dialog.querySelector('#confirm-dialog-body').textContent = message;
    dialog.querySelector('#confirm-dialog-cancel').textContent = cancelLabel;
    dialog.querySelector('#confirm-dialog-ok').textContent = confirmLabel;

    const overlay = document.createElement('div');
    overlay.id = 'confirm-dialog-overlay';

    function close(result) {
      document.removeEventListener('keydown', onKey);
      dialog.remove();
      overlay.remove();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    }

    overlay.addEventListener('click', () => close(false));
    dialog.querySelector('#confirm-dialog-cancel').addEventListener('click', () => close(false));
    dialog.querySelector('#confirm-dialog-ok').addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKey);

    document.body.append(overlay, dialog);
    dialog.querySelector('#confirm-dialog-ok').focus();
  });
}
