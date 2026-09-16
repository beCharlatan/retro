/* =========================================================
   FILTERS — the home screen's category × format filtering
   =========================================================
   Two independent filters ('all' or one value each): a game's category and
   its structure (solo / pairs / groups). Pure functions of the game list
   and the current filter values, so the counts on the filter buttons and
   the highlighting on the map can't disagree.
========================================================= */

export function matchesFilters(game, { category = 'all', structure = 'all' } = {}) {
  return (
    (category === 'all' || game.category === category) &&
    (structure === 'all' || game.structure === structure)
  );
}

// Is a filter actually narrowing things down? With both at "all" every game
// matches, and highlighting all of them would be noise, not a cue.
export function filtersActive({ category = 'all', structure = 'all' } = {}) {
  return category !== 'all' || structure !== 'all';
}

// "Label (N)": how many games would remain if THIS category were picked,
// holding the structure filter where it is — answers "what will I get"
// before clicking, not just "how many exist in this category overall".
export function countForCategory(games, categoryId, filters) {
  return games.filter((g) =>
    matchesFilters(g, { category: categoryId, structure: filters.structure }),
  ).length;
}

// Same, for a structure option, holding the category filter.
export function countForStructure(games, structureId, filters) {
  return games.filter((g) =>
    matchesFilters(g, { category: filters.category, structure: structureId }),
  ).length;
}

// Options for a filter row: the "all" option first, then one per key of
// `labels` ({ key: { label } }).
export function filterOptions(labels, allLabel = 'Все') {
  return [
    { id: 'all', label: allLabel },
    ...Object.keys(labels).map((k) => ({ id: k, label: labels[k].label })),
  ];
}
