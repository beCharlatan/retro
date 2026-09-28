/* =========================================================
   collect — read what a game marked as public from its DOM
   =========================================================
   The rule is opt-in: nothing leaves the game window unless its template says so.

     data-projector="eyebrow|title|lede|body|reveal|chart"   this element goes to the projector
     data-projector-text="…"        …but show this text instead of the element's own
     data-no-projector              (on anything inside a marked element) leave it out
     data-projector-timer + data-seconds/-duration/-state/-label   the round's timer card

   Only the ACTIVE round's section is read, and only when it isn't still locked. Inputs,
   buttons and anything else interactive are stripped from every copy, so what the group
   texts, the participants' answers and the entry forms look like never matters here.
========================================================= */
import { BLOCK_ROLES } from './protocol.js';

const STRIP = 'input, textarea, select, button, script, style, iframe, [data-no-projector]';

// d3 keeps a transition's schedule on the node until it has finished; a chart copied before that
// would freeze mid-animation (bars at width 0, dots at radius 0).
export function isSettled(el) {
  for (const node of el.querySelectorAll('*')) if (node.__transition) return false;
  return true;
}

export function readTimer(section) {
  const el = section.querySelector('[data-projector-timer]');
  if (!el) return null;
  const seconds = Number(el.dataset.seconds);
  const duration = Number(el.dataset.duration);
  if (!Number.isFinite(seconds) || !Number.isFinite(duration)) return null;
  return { seconds, duration, state: el.dataset.state, label: el.dataset.label ?? '' };
}

// → { blocks, pending, charts }
//   pending  a chart is still animating (it is not copied mid-way)
//   charts   the last good copy of each chart, by order in the section: pass it back as `keep`
//            next time, so a chart that is being redrawn stays on the projector as it was
//            instead of blinking out until the animation ends.
export function readBlocks(section, keep = []) {
  const blocks = [];
  const charts = [];
  let pending = false;
  let chartN = 0;
  for (const el of section.querySelectorAll('[data-projector]')) {
    const role = el.dataset.projector;
    if (!BLOCK_ROLES.includes(role)) continue;
    if (el.parentElement?.closest('[data-projector]')) continue; // part of a bigger marked block
    const n = role === 'chart' ? chartN++ : -1;
    if (role === 'chart' && !isSettled(el)) {
      pending = true;
      if (keep[n]) {
        blocks.push({ role, html: keep[n] });
        charts[n] = keep[n];
      }
      continue;
    }
    const copy = el.cloneNode(true);
    for (const node of copy.querySelectorAll(STRIP)) node.remove();
    if (el.dataset.projectorText !== undefined) copy.textContent = el.dataset.projectorText;
    for (const attr of ['data-projector', 'data-projector-text', 'id']) copy.removeAttribute(attr);
    const html = copy.outerHTML;
    if (role === 'chart') charts[n] = html;
    blocks.push({ role, html });
  }
  return { blocks, pending, charts };
}
