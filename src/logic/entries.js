/* =========================================================
   ENTRIES — the facilitator's data-entry state, as pure functions
   =========================================================
   Every game keeps one array of per-participant rows ("entries" /
   "data") and edits it the same few ways: parse a typed number, replace
   one field of one row, count how many rows are complete, decide whether
   a saved draft still fits the current participants. Those used to be
   re-written in each Lit component; here they are once, with no DOM, and
   unit-tested (test/unit/entries.test.js).

   Everything returns NEW arrays/objects — never mutates its input — so
   Lit sees a changed reference and re-renders.
========================================================= */

// How many complete rows a screen needs before its "next" button unlocks:
// one participant's answer can't show a pattern, so solo games wait for
// two; the pair games (ultimatum, prisoner's dilemma) already have two
// people in one row.
export const MIN_FILLED = 2;
export const MIN_FILLED_PAIRS = 1;

export const hasEnough = (filled, min = MIN_FILLED) => filled >= min;

// A typed value → number or null. '' (and anything that isn't a number)
// means "not answered yet"; otherwise clamp to [min, max] if given.
export function parseNumberInput(raw, { min, max } = {}) {
  if (raw === '' || raw === null || raw === undefined) return null;
  let v = Number(raw);
  if (Number.isNaN(v)) return null;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}

// Row `idx` with `patch` merged in; every other row is the same object.
export function patchRow(rows, idx, patch) {
  return rows.map((row, i) => (i === idx ? { ...row, ...patch } : row));
}

// Row `idx` with `row[key][itemIdx]` replaced. `next` is the new value, or
// a function of the current item (for nested objects such as a
// calibration range { low, high }).
export function patchItem(rows, idx, key, itemIdx, next) {
  return rows.map((row, i) => {
    if (i !== idx) return row;
    const items = row[key].map((item, ii) =>
      ii === itemIdx ? (typeof next === 'function' ? next(item) : next) : item,
    );
    return { ...row, [key]: items };
  });
}

// Predicate: every listed field of the row is non-null.
export const hasFields =
  (...fields) =>
  (row) =>
    fields.every((f) => row[f] !== null);

export const countFilled = (rows, isFilled) => rows.filter(isFilled).length;

// The scarcest of several counts — a multi-question screen unlocks on its
// worst-covered question, not the total.
export const minCount = (counts) => (counts.length ? Math.min(...counts) : 0);

// A saved draft is only offered back if it still fits: same kind of
// payload, and (for one-row-per-person games) the same number of people.
//   key       payload field holding the rows
//   length    required row count (omit for pair games, whose rows depend
//             on a saved assignment instead)
//   requires  another payload field that must be present (`assignment`)
//   rowCheck  predicate every saved row must pass — rejects a draft saved by
//             an older version of the game with a different row shape
export function loadableDraft(loaded, { key, length, requires, rowCheck } = {}) {
  if (!loaded?.payload) return null;
  const rows = loaded.payload[key];
  if (!Array.isArray(rows)) return null;
  if (length !== undefined && rows.length !== length) return null;
  if (requires && !loaded.payload[requires]) return null;
  if (rowCheck && !rows.every((r) => r && rowCheck(r))) return null;
  return loaded;
}

// ---------- blank rows for the role-based games ----------
// Built from Roles.makeGroups() ({ groupA, groupB }) or Roles.makePairs()
// ({ pairs: [{ a, b, trio? }] }) once people are assigned.

// Endowment effect: one group SELLS every lot (owners), the other BUYS every
// lot — roles don't swap. Each row keeps one price per lot (mug, car, house…).
export const ENDOWMENT_LOT_COUNT = 3;

export function buildEndowmentEntries(groups, lotCount = ENDOWMENT_LOT_COUNT) {
  const blank = () => Array.from({ length: lotCount }, () => null);
  const owners = groups.groupA.map((name) => ({ name, role: 'owner', prices: blank() }));
  const buyers = groups.groupB.map((name) => ({ name, role: 'buyer', prices: blank() }));
  return owners.concat(buyers);
}

// Framing: two scenarios (rounds). In round 1 group A reads the gain frame and
// group B the loss frame; in round 2 they swap — so every person sees BOTH
// frames, one per scenario, and a group being braver by chance can't fake an
// effect. `choices[round]` is '1' (sure thing) | '2' (gamble) | null.
export const FRAMING_ROUND_COUNT = 2;

export function buildFramingEntries(groups, roundCount = FRAMING_ROUND_COUNT) {
  const blank = () => Array.from({ length: roundCount }, () => null);
  const a = groups.groupA.map((name) => ({ name, group: 'A', choices: blank() }));
  const b = groups.groupB.map((name) => ({ name, group: 'B', choices: blank() }));
  return a.concat(b);
}

// Ultimatum: per pair, round 1 `a` proposes and `b` responds; round 2 they swap.
export function buildUltimatumEntries(assignment) {
  return assignment.pairs.map((p) => ({
    a: p.a,
    b: p.b,
    trio: !!p.trio,
    r1_offer: null,
    r1_min: null,
    r2_offer: null,
    r2_min: null,
  }));
}

// Prisoner's dilemma: per pair, each player's move in round 1 and round 2.
export function buildDilemmaEntries(assignment) {
  return assignment.pairs.map((p) => ({
    a: p.a,
    b: p.b,
    trio: !!p.trio,
    r1a: null,
    r1b: null,
    r2a: null,
    r2b: null,
  }));
}
