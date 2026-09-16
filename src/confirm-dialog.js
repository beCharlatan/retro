/* =========================================================
   CONFIRM DIALOG — a real <dialog>, not window.confirm()
   =========================================================
   `confirmDialog({...})` resolves to true (confirmed) or false (cancelled,
   Escape, or a click on the dim backdrop). It uses the platform's modal
   <dialog> — top layer, focus trapped inside, Escape and screen readers
   handled by the browser — where window.confirm() blocked the whole page,
   can't be styled, looks different in every browser and was hostile to
   test automation.

   The element is created on demand in document.body (so it also works when
   called from inside a game's shadow DOM; the global stylesheet styles it,
   see .confirm-dialog in styles.css) and removed once closed.

   Focus starts on the cancel button: the action being confirmed is
   destructive, so a stray Enter should keep the person where they are.
========================================================= */
import { escapeHtml } from './logic/format.js';

let dialogCounter = 0;

export function confirmDialog({
  title,
  message = '',
  confirmLabel = 'Да',
  cancelLabel = 'Отмена',
}) {
  return new Promise((resolve) => {
    const id = `confirm-dialog-${++dialogCounter}`;
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    if (message) dialog.setAttribute('aria-describedby', `${id}-text`);
    dialog.innerHTML = `
      <form method="dialog">
        <h2 id="${id}-title">${escapeHtml(title)}</h2>
        ${message ? `<p id="${id}-text">${escapeHtml(message)}</p>` : ''}
        <div class="confirm-actions">
          <button type="submit" value="cancel" class="ghost" autofocus>${escapeHtml(cancelLabel)}</button>
          <button type="submit" value="ok" class="primary">${escapeHtml(confirmLabel)}</button>
        </div>
      </form>
    `;
    // A click on the ::backdrop is reported as a click on the dialog itself.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close('cancel');
    });
    // Fires for the buttons (returnValue = the button's value) and for Escape
    // (returnValue stays '').
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'ok';
      dialog.remove();
      resolve(confirmed);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
