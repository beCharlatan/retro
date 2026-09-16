/* =========================================================
   SHARED PATTERN: toast feedback + clipboard copy
========================================================= */
export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(() => t.classList.remove('show'), 1800);
}

// Copies plain text to the clipboard and gives brief feedback both on
// the button itself (label flips to "Скопировано") and via the shared
// toast. Falls back gracefully if the Clipboard API is unavailable
// (e.g. non-secure context) instead of throwing.
//
// If the button has a `.btn-label` child, only THAT child's text gets
// swapped — needed for a button that also renders a Lit-managed icon
// (unsafeHTML(ICON_COPY)) as a sibling: overwriting the whole button's
// textContent would delete that icon's DOM node along with it, and Lit
// throws on the next re-render trying to update a ChildPart whose
// anchor no longer exists. Buttons with no icon (plain text only, no
// `.btn-label` wrapper) keep swapping the whole button as before.
export function copyToClipboard(text, btn) {
  const done = () => {
    showToast('Скопировано в буфер обмена');
    if (btn) {
      const target = btn.querySelector('.btn-label') || btn;
      const original = target.dataset.label || target.textContent;
      target.dataset.label = original;
      target.textContent = '✓ Скопировано';
      clearTimeout(btn._copyTm);
      btn._copyTm = setTimeout(() => {
        target.textContent = original;
      }, 1600);
    }
  };
  const fail = () => showToast('Не удалось скопировать — выделите текст вручную');

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fail);
  } else {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch {
      fail();
    }
  }
}
