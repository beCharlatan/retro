/* =========================================================
   LEADERBOARD — the end-of-game standings, shown to the whole room
   =========================================================
     renderLeaderboard({ rows: rankScores([...]), unit: ['очко', 'очка', 'очков'] })

   Projected (data-projector="body"): by the results screen the game is over and
   every person's own score is theirs to see. Only games where people really
   earn points use it — never a game whose choices were meant to stay anonymous.
   The top three places are highlighted; ties share a place.
========================================================= */
import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { formatSigned, plural } from './logic/format.js';
import { avatarName } from './state.js';

// unit: a word ('₽') or the three plural forms (['очко', 'очка', 'очков'])
export function renderLeaderboard({
  rows,
  title = 'Кто сколько набрал',
  unit = '',
  signed = false,
}) {
  if (!rows?.length) return '';
  const fmt = (v) => (signed ? formatSigned(v) : String(v));
  const word = (v) => (Array.isArray(unit) ? plural(Math.abs(v), unit) : unit);
  return html`
    <div class="leaderboard" data-projector="body" data-testid="leaderboard">
      <div class="leaderboard-title">${title}</div>
      <ol>
        ${rows.map(
          (r) => html`<li class="place-${r.place <= 3 ? r.place : 'rest'}">
            <span class="leaderboard-place">${r.place}</span>
            <span class="leaderboard-name">${unsafeHTML(avatarName(r.name))}</span>
            <span class="leaderboard-score">${fmt(r.score)}${unit ? html`<small> ${word(r.score)}</small>` : ''}</span>
          </li>`,
        )}
      </ol>
    </div>
  `;
}
