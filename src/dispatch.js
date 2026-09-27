/* =========================================================
   DISPATCH — "Раздача": private messages the facilitator sends out
   =========================================================
   Some games give each person something only they may know: a dossier
   (Скрытый профиль), the quality of their car (Рынок «лимонов»), their
   warehouse this week (Пивная игра). The app writes each message; the
   facilitator copies it into a private chat. One row per person: name,
   role, the ready text and a copy button — a copied row gets a ✓ so it's
   clear who already has theirs.

     renderDispatch({
       title: 'Раздача · раунд 2',
       rows: [{ name: 'Аня', tag: 'Продавец · лот 3', text: '…' }, { name: 'Вика', tag: 'Покупатель', text: null }],
       sent: this.sent,                      // Set of names already copied
       onSent: (name) => { this.sent = new Set(this.sent).add(name); },
     })

   Never marked data-projector: the room must not see any of it. A row whose
   `text` is null has nothing to send (shown dimmed, no button).
========================================================= */
import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ICON_COPY } from './icons.js';
import { avatarName } from './state.js';
import { copyToClipboard } from './toast.js';

export function renderDispatch({ title, hint, rows, sent, onSent }) {
  const toSend = rows.filter((r) => r.text);
  const done = toSend.filter((r) => sent.has(r.name)).length;
  return html`
    <div class="dispatch" data-testid="dispatch">
      <div class="dispatch-head">
        <div class="dispatch-title">${title}</div>
        <div class="dispatch-count">Отправлено: <b>${done}</b> из ${toSend.length}</div>
      </div>
      <p class="dispatch-hint">
        ${hint ?? 'Скопируйте сообщение и отправьте человеку в личку. Экран ведущего — на проектор это не попадает.'}
      </p>
      ${rows.map((r) => dispatchRow(r, sent.has(r.name), onSent))}
    </div>
  `;
}

function dispatchRow(row, isSent, onSent) {
  if (!row.text) {
    return html`
      <div class="dispatch-row empty">
        <div class="dispatch-who">${unsafeHTML(avatarName(row.name))}<span class="dispatch-tag">${row.tag}</span></div>
        <div class="dispatch-none">— ничего не отправлять —</div>
      </div>
    `;
  }
  return html`
    <div class="dispatch-row ${isSent ? 'sent' : ''}">
      <div class="dispatch-who">
        ${unsafeHTML(avatarName(row.name))}<span class="dispatch-tag">${row.tag}</span>
      </div>
      <details class="dispatch-text">
        <summary>Текст сообщения</summary>
        <pre>${row.text}</pre>
      </details>
      <button
        type="button"
        class="ghost dispatch-copy"
        aria-label="Скопировать сообщение для ${row.name}"
        @click=${(e) => {
          copyToClipboard(row.text, e.currentTarget);
          onSent(row.name);
        }}
      >
        ${unsafeHTML(ICON_COPY)} <span class="btn-label">${isSent ? '✓ Отправлено' : 'Копировать'}</span>
      </button>
    </div>
  `;
}
