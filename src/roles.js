/* =========================================================
   SHARED PATTERN: role assignment (pairs & two-group splits)
   =========================================================
   Used by games where participants must be paired up
   (Ultimatum, Prisoner's Dilemma) or split into two groups
   (Endowment Effect, Framing) before the data-entry screen.

   Pure data functions only — no DOM. Every Lit game component
   (docs/modernization-plan.md Phase 2+) renders its own pair/group
   cards and click-to-select-then-swap interaction declaratively in
   its own template (reactive `selectedSwapName` state + these
   functions), rather than through HTML-string builders + imperative
   delegated listeners. This file used to also export `dotsHTML`/
   `pairsHTML`/`groupsHTML`/`bindShuffle`/`bindPairSwap`/`bindGroupSwap`
   for that older, imperative pattern — removed once all 13 games had
   migrated and nothing called them any more (see src/games/ultimatum.js
   and src/games/endowment.js for the declarative replacement this
   file's functions are used from).

   ---------------------------------------------------------
   USAGE (inside a Lit component):

     this.assignment = Roles.makePairs(state.participants);
     // assignment = { pairs: [{a,b}, ...], observer: name|null, trio: [3 names]|null }

     // click-to-select-then-swap, tracked as reactive state:
     _onSwapClick(name) {
       if (this.selectedSwapName === null) { this.selectedSwapName = name; return; }
       if (this.selectedSwapName === name) { this.selectedSwapName = null; return; }
       Roles.swapInPairs(this.assignment.pairs, this.selectedSwapName, name);
       this.selectedSwapName = null;
       this.assignment = { ...this.assignment }; // new reference so Lit re-renders
     }

   For a two-group game, swap makePairs/swapInPairs for
   makeGroups/swapInGroups — same pattern.
========================================================= */
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

  return { shuffle, makePairs, makeGroups, swapInPairs, swapInGroups };
})();
