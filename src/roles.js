/* =========================================================
   SHARED PATTERN: role assignment (pairs & two-group splits)
   =========================================================
   Used by games where participants must be paired up
   (Ultimatum, Prisoner's Dilemma) or split into two groups
   (Endowment Effect, Framing) before the data-entry screen.

   Data functions are pure (no DOM). HTML helpers return plain
   markup strings a game can drop straight into its own
   template literal — same authoring style as every other
   game module in src/games/.

   Besides the "🎲 Перемешать" full reshuffle, names are
   individually clickable: click one person, then another, to
   swap just those two — e.g. to keep a specific pair together,
   split up two people who ended up paired, or hand one person
   a specific role without re-rolling everyone else.

   ---------------------------------------------------------
   USAGE (inside a game's render function):

     let assignment = Roles.makePairs(state.participants);
     // assignment = { pairs: [{a,b}, ...], observer: name|null }

     // ...inside the screen-1 template:
     <div id="pairs-holder">
       ${Roles.pairsHTML(assignment.pairs, assignment.observer, {
         labelA: 'Предлагающий', labelB: 'Отвечающий'
       })}
     </div>
     <button class="shuffle-btn" id="shuffle-btn">🎲 Перемешать пары</button>

     // ...after inserting the HTML, wire the shuffle button and the
     // click-to-swap behaviour on names:
     function renderPairsHolder(){
       const el = document.getElementById('pairs-holder');
       el.innerHTML = Roles.pairsHTML(assignment.pairs, assignment.observer, {...});
       Roles.bindPairSwap(el, () => assignment.pairs, renderPairsHolder);
     }
     renderPairsHolder();
     Roles.bindShuffle(document.getElementById('shuffle-btn'), () => {
       assignment = Roles.makePairs(state.participants);
       renderPairsHolder();
     });

   For a two-group game, swap makePairs/pairsHTML/bindPairSwap for
   makeGroups/groupsHTML/bindGroupSwap — same pattern.

   Both screens should use dotsHTML(totalScreens, activeIndex) so
   the progress bar reflects the extra "role assignment" step
   (these games have 5 screens instead of 4: instructions →
   roles → data entry → results → context).
========================================================= */
import { avatarName } from './state.js';

export const Roles = (() => {
  // Fisher–Yates shuffle — returns a new array, does not mutate input.
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Split names into random pairs. With an EVEN count, straightforward
  // disjoint pairs. With an ODD count, nobody sits out as an observer
  // any more — instead three people form a "trio" that plays a
  // triangle: (p1,p2), (p2,p3), (p3,p1). Each trio member ends up in
  // two of those three matches, so — like a normal pair going through
  // a game's own round-1/round-2 role-swap — everyone still gets to
  // play every role, just via two different partners instead of one
  // partner twice. Trio-sourced pairs are flagged with `.trio = true`;
  // `assignment.trio` also lists the three names for UI messaging.
  // Callers (ultimatum.js, prisoners-dilemma.js) don't need to treat
  // these specially — they're plain {a,b} pairs like any other and
  // flow through the exact same screens.
  function makePairs(names) {
    const shuffled = shuffle(names);
    const isOdd = shuffled.length % 2 === 1;

    if (isOdd && shuffled.length >= 3) {
      const regularCount = shuffled.length - 3;
      const pairs = [];
      for (let i = 0; i + 1 < regularCount; i += 2) {
        pairs.push({ a: shuffled[i], b: shuffled[i + 1] });
      }
      const [p1, p2, p3] = shuffled.slice(regularCount);
      pairs.push({ a: p1, b: p2, trio: true });
      pairs.push({ a: p2, b: p3, trio: true });
      pairs.push({ a: p3, b: p1, trio: true });
      return { pairs, observer: null, trio: [p1, p2, p3] };
    }

    // Even count (or the degenerate case of fewer than 3 people total,
    // where a trio can't be formed) — plain disjoint pairing.
    const pairs = [];
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      pairs.push({ a: shuffled[i], b: shuffled[i + 1] });
    }
    const observer = isOdd ? shuffled[shuffled.length - 1] : null;
    return { pairs, observer, trio: null };
  }

  // Split names into two roughly-even random groups. With an odd
  // count, group A gets the extra person.
  function makeGroups(names) {
    const shuffled = shuffle(names);
    const mid = Math.ceil(shuffled.length / 2);
    return { groupA: shuffled.slice(0, mid), groupB: shuffled.slice(mid) };
  }

  // Swaps two people's positions within a pairs array IN PLACE —
  // works whether they're in the same pair (flips their roles) or
  // different pairs (splits/reunites partnerships). No-op if either
  // name isn't found (e.g. the odd-one-out observer).
  function swapInPairs(pairs, nameX, nameY) {
    if (nameX === nameY) return;
    let posX = null,
      posY = null;
    pairs.forEach((p, i) => {
      if (p.a === nameX) posX = { i, side: 'a' };
      if (p.b === nameX) posX = { i, side: 'b' };
      if (p.a === nameY) posY = { i, side: 'a' };
      if (p.b === nameY) posY = { i, side: 'b' };
    });
    if (!posX || !posY) return;
    pairs[posX.i][posX.side] = nameY;
    pairs[posY.i][posY.side] = nameX;
  }

  // Swaps two people between groupA/groupB IN PLACE. If both are
  // already in the same group, it's a no-op (nothing meaningful to
  // swap). Keeps group sizes exactly as they were.
  function swapInGroups(groups, nameX, nameY) {
    if (nameX === nameY) return;
    const aHasX = groups.groupA.includes(nameX);
    const aHasY = groups.groupA.includes(nameY);
    if (aHasX === aHasY) return; // same group (or neither found) — nothing to do
    const from = aHasX ? groups.groupA : groups.groupB;
    const to = aHasX ? groups.groupB : groups.groupA;
    from[from.indexOf(nameX)] = nameY;
    to[to.indexOf(nameY)] = nameX;
  }

  // Generic progress-dots row for games with N screens instead of
  // the usual 4 (e.g. 5, once a role-assignment screen is added).
  function dotsHTML(count, activeIndex) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `<div class="dot${i === activeIndex ? ' active' : ''}" data-dot="${i}"></div>`;
    }
    return html;
  }

  // Renders a grid of pair-cards. `opts.labelA`/`labelB` are optional
  // role names shown under each side (e.g. "Предлагающий" /
  // "Отвечающий"); leave both empty for symmetric games like
  // Prisoner's Dilemma. `opts.symbol` overrides the connector
  // (defaults to "↔"). Names render as buttons so bindPairSwap() can
  // wire click-to-swap on them. Trio-sourced pairs (see makePairs)
  // get a small badge and their own explanatory note instead of the
  // old "someone sits out" observer message.
  function pairsHTML(pairs, observer, opts) {
    opts = opts || {};
    const labelA = opts.labelA || '';
    const labelB = opts.labelB || '';
    const symbol = opts.symbol || '↔';
    let html = '<div class="role-pairs">';
    pairs.forEach((p) => {
      html += `
        <div class="role-pair-card${p.trio ? ' role-pair-trio' : ''}">
          ${p.trio ? '<span class="role-pair-trio-badge">🔺 трио</span>' : ''}
          <div class="role-pair-side left">
            <button type="button" class="role-pair-name" data-swap-name="${p.a}">${avatarName(p.a)}</button>
            ${labelA ? `<div class="role-pair-label">${labelA}</div>` : ''}
          </div>
          <div class="role-pair-vs">${symbol}</div>
          <div class="role-pair-side right">
            <button type="button" class="role-pair-name" data-swap-name="${p.b}">${avatarName(p.b)}</button>
            ${labelB ? `<div class="role-pair-label">${labelB}</div>` : ''}
          </div>
        </div>`;
    });
    html += '</div>';
    html +=
      '<p class="note swap-hint">Нажмите на двух участников по очереди, чтобы поменять их местами.</p>';
    const trioNames = pairs.filter((p) => p.trio).map((p) => p.a);
    const trioUnique = [...new Set(trioNames.concat(pairs.filter((p) => p.trio).map((p) => p.b)))];
    if (trioUnique.length === 3) {
      html += `<p class="note">🔺 Нечётное число участников — ${trioUnique.join(', ')} играют трио по кругу вместо пары: каждый сыграет дважды, с двумя разными партнёрами, но зато без исключений.</p>`;
    } else if (observer) {
      html += `<p class="note">${observer} — нечётное число участников, в этом раунде наблюдатель: ведёт протокол или подыгрывает за отсутствующего.</p>`;
    }
    return html;
  }

  // Renders two labeled columns of name-chips for a group split.
  // Chips render as buttons so bindGroupSwap() can wire click-to-swap.
  function groupsHTML(groupA, groupB, opts) {
    opts = opts || {};
    const labelA = opts.labelA || 'Группа А';
    const labelB = opts.labelB || 'Группа Б';
    function chips(list) {
      return list
        .map(
          (n) =>
            `<button type="button" class="role-chip" data-swap-name="${n}">${avatarName(n)}</button>`,
        )
        .join('');
    }
    return `
      <div class="role-groups">
        <div class="role-group-col role-group-a">
          <div class="role-group-title">${labelA} <span class="note" style="margin:0;">· ${groupA.length} чел.</span></div>
          <div class="role-group-chips">${chips(groupA)}</div>
        </div>
        <div class="role-group-col role-group-b">
          <div class="role-group-title">${labelB} <span class="note" style="margin:0;">· ${groupB.length} чел.</span></div>
          <div class="role-group-chips">${chips(groupB)}</div>
        </div>
      </div>
      <p class="note swap-hint">Нажмите на двух участников по очереди, чтобы поменять их местами.</p>`;
  }

  // Wires a shuffle-btn's click to a re-roll callback and adds a
  // small spin animation for tactile feedback. `onShuffle` receives
  // no arguments and should re-run the appropriate make* function,
  // re-render the holder, and update any dependent state.
  function bindShuffle(buttonEl, onShuffle) {
    buttonEl.addEventListener('click', () => {
      buttonEl.classList.add('spin');
      setTimeout(() => buttonEl.classList.remove('spin'), 350);
      onShuffle();
    });
  }

  // Shared click-to-select-then-swap behaviour, used by both
  // bindPairSwap and bindGroupSwap below. `getMutable` returns the
  // live pairs array / groups object to mutate; `doSwap` performs the
  // actual swap on it; `onSwap` re-renders afterwards.
  function bindNameSwap(containerEl, getMutable, doSwap, onSwap) {
    let selected = null; // the data-swap-name currently awaiting a partner
    containerEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-swap-name]');
      if (!btn || !containerEl.contains(btn)) return;
      const name = btn.dataset.swapName;

      if (selected === null) {
        selected = name;
        btn.classList.add('swap-selected');
        return;
      }
      if (selected === name) {
        // clicking the same person again cancels the selection
        btn.classList.remove('swap-selected');
        selected = null;
        return;
      }
      doSwap(getMutable(), selected, name);
      selected = null;
      onSwap();
    });
  }

  function bindPairSwap(containerEl, getPairs, onSwap) {
    bindNameSwap(containerEl, getPairs, swapInPairs, onSwap);
  }

  function bindGroupSwap(containerEl, getGroups, onSwap) {
    bindNameSwap(containerEl, getGroups, swapInGroups, onSwap);
  }

  return {
    shuffle,
    makePairs,
    makeGroups,
    swapInPairs,
    swapInGroups,
    dotsHTML,
    pairsHTML,
    groupsHTML,
    bindShuffle,
    bindPairSwap,
    bindGroupSwap,
  };
})();
