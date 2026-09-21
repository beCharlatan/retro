/* =========================================================
   content — renders the texts kept in src/content/<game>.json
   =========================================================
   Each game's intro steps, "context" section and facts live in a JSON file next
   to the others, so the wording can be edited without touching JS:

     {
       "intro":   { "steps": [{ "title", "text" }], "note"? },
       "context": { "lede", "blocks": [{ "p" } | { "stats": [{ "n", "label" }] }] },
       "facts":   [{ "title", "text" }]
     }

   Strings are trusted, repo-authored HTML — only <b>, <i>, <br> are expected
   (test/unit/content.test.js enforces it). `{name}` is replaced from the
   `vars` a game passes (e.g. { pot: 1000 }); values are HTML-escaped, so a
   person-typed question can go in safely. A step may carry an `id` for its text.
========================================================= */
import { html } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { escapeHtml } from './logic/format.js';

export const ALLOWED_TAGS = ['b', 'i', 'br'];

export function fill(text, vars = {}) {
  return text.replace(/\{(\w+)\}/g, (whole, name) =>
    name in vars ? escapeHtml(String(vars[name])) : whole,
  );
}

const rich = (text, vars) => unsafeHTML(fill(text, vars));

export function renderSteps(steps, vars) {
  return html`
    <ol class="step-list">
      ${steps.map(
        (step, i) => html`
          <li>
            <div class="step-num">${i + 1}</div>
            <div class="step-body">
              ${step.title ? html`<b>${rich(step.title, vars)}</b>` : ''}<span id=${ifDefined(step.id)}>${rich(step.text, vars)}</span>
            </div>
          </li>
        `,
      )}
    </ol>
  `;
}

export function renderNote(text, vars) {
  return html`<p class="note">${rich(text, vars)}</p>`;
}

// The context screen's lede and body, up to (not including) the facts.
export function renderContext({ lede, blocks }, vars) {
  return html`
    <p class="lede">${rich(lede, vars)}</p>
    ${blocks.map((block) =>
      block.stats
        ? html`
            <div class="stat-row">
              ${block.stats.map(
                (s) => html`
                  <div class="stat">
                    <div class="n">${rich(s.n, vars)}</div>
                    <div class="lab">${rich(s.label, vars)}</div>
                  </div>
                `,
              )}
            </div>
          `
        : html`<p>${rich(block.p, vars)}</p>`,
    )}
  `;
}

export function renderFacts(facts, vars) {
  return facts.map(
    (fact) => html`
      <div class="fact"><b>${rich(fact.title, vars)}</b><span>${rich(fact.text, vars)}</span></div>
    `,
  );
}
