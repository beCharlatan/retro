/* =========================================================
   renderSpoilerCard — a hidden-by-default text with show/hide and copy
   =========================================================
   The facilitator can send the text privately instead of reading it off a shared
   screen. Element ids (tests and styles rely on them):
   toggle-/copy-/text-/placeholder-<key>.

     renderSpoilerCard(spoilers, {
       key, title, hint, body, copyText,
       borderColor?, footer?,
     })
========================================================= */
import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ICON_COPY, ICON_HIDE, ICON_SHOW } from './icons.js';
import { copyToClipboard } from './toast.js';

export function renderSpoilerCard(
  spoilers,
  { key, title, hint, body, copyText, borderColor, footer },
) {
  const hidden = spoilers.isHidden(key);
  return html`
    <div class="quote-card spoiler-card" style=${borderColor ? `border-left-color:${borderColor};` : ''}>
      <div class="spoiler-head">
        <b>${title}</b>
        <div class="spoiler-actions">
          <button type="button" class="ghost spoiler-toggle" id="toggle-${key}" @click=${() => spoilers.toggle(key)}>
            ${hidden ? html`${unsafeHTML(ICON_SHOW)} Показать` : html`${unsafeHTML(ICON_HIDE)} Скрыть`}
          </button>
          <!-- .btn-label wraps only the text, not the icon: copyToClipboard()
               (toast.js) swaps that span's text imperatively for the
               "✓ Скопировано" feedback — doing that to the whole button would
               delete the icon's Lit-managed ChildPart along with it and throw on
               the next render ("ChildPart has no parentNode"). -->
          <button type="button" class="ghost" id="copy-${key}" @click=${(e) => copyToClipboard(copyText, e.currentTarget)}>
            ${unsafeHTML(ICON_COPY)} <span class="btn-label">Скопировать</span>
          </button>
        </div>
      </div>
      <p class="spoiler-placeholder" id="placeholder-${key}" ?hidden=${!hidden}>${hint}</p>
      <div class="spoiler-text" id="text-${key}" ?hidden=${hidden}>${body}</div>
      ${footer ?? ''}
    </div>
  `;
}
