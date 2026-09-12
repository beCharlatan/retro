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
export function copyToClipboard(text, btn) {
  const done = () => {
    showToast('Скопировано в буфер обмена');
    if (btn) {
      const original = btn.dataset.label || btn.textContent;
      btn.dataset.label = original;
      btn.textContent = '✓ Скопировано';
      clearTimeout(btn._copyTm);
      btn._copyTm = setTimeout(() => {
        btn.textContent = original;
      }, 1600);
    }
  };
  const fail = () => showToast('Не удалось скопировать — выделите текст вручную');

  if (navigator.clipboard && navigator.clipboard.writeText) {
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
