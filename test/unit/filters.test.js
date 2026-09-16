// test/unit/filters.test.js — the home screen's filtering (src/logic/filters.js)
import { describe, expect, test } from 'bun:test';
import {
  countForCategory,
  countForStructure,
  filterOptions,
  filtersActive,
  matchesFilters,
} from '../../src/logic/filters.js';

const GAMES = [
  { id: 'a', category: 'cognitive', structure: 'solo' },
  { id: 'b', category: 'cognitive', structure: 'groups' },
  { id: 'c', category: 'econ', structure: 'pairs' },
  { id: 'd', category: 'econ', structure: 'solo' },
  { id: 'e', category: 'social', structure: 'solo' },
];
const ALL = { category: 'all', structure: 'all' };

describe('matchesFilters', () => {
  test('"all" matches everything', () => {
    expect(GAMES.every((g) => matchesFilters(g, ALL))).toBe(true);
  });
  test('the two filters are ANDed', () => {
    const f = { category: 'econ', structure: 'solo' };
    expect(GAMES.filter((g) => matchesFilters(g, f)).map((g) => g.id)).toEqual(['d']);
  });
  test('each filter works alone', () => {
    expect(GAMES.filter((g) => matchesFilters(g, { ...ALL, category: 'cognitive' }))).toHaveLength(
      2,
    );
    expect(GAMES.filter((g) => matchesFilters(g, { ...ALL, structure: 'solo' }))).toHaveLength(3);
  });
  test('missing filter values default to "all"', () => {
    expect(matchesFilters(GAMES[0], {})).toBe(true);
    expect(matchesFilters(GAMES[0])).toBe(true);
  });
});

describe('filtersActive', () => {
  test('false only when both are "all"', () => {
    expect(filtersActive(ALL)).toBe(false);
    expect(filtersActive({ category: 'econ', structure: 'all' })).toBe(true);
    expect(filtersActive({ category: 'all', structure: 'solo' })).toBe(true);
  });
});

describe('counts on the filter buttons', () => {
  test('category counts hold the structure filter where it is', () => {
    expect(countForCategory(GAMES, 'all', ALL)).toBe(5);
    expect(countForCategory(GAMES, 'econ', ALL)).toBe(2);
    // With "solo" chosen, econ would leave only the solo econ game.
    expect(countForCategory(GAMES, 'econ', { category: 'all', structure: 'solo' })).toBe(1);
  });
  test('structure counts hold the category filter where it is', () => {
    expect(countForStructure(GAMES, 'solo', ALL)).toBe(3);
    expect(countForStructure(GAMES, 'solo', { category: 'econ', structure: 'all' })).toBe(1);
    expect(countForStructure(GAMES, 'all', { category: 'cognitive', structure: 'all' })).toBe(2);
  });
  test('the count matches what the map would actually show after clicking', () => {
    const filters = { category: 'all', structure: 'solo' };
    for (const cat of ['all', 'cognitive', 'econ', 'social']) {
      const shown = GAMES.filter((g) =>
        matchesFilters(g, { category: cat, structure: filters.structure }),
      ).length;
      expect(countForCategory(GAMES, cat, filters)).toBe(shown);
    }
  });
  test('an option no game has counts zero', () => {
    expect(countForCategory(GAMES, 'nope', ALL)).toBe(0);
  });
});

describe('filterOptions', () => {
  test('"all" first, then one option per key with its label', () => {
    expect(filterOptions({ solo: { label: 'Сам' }, pairs: { label: 'Пары' } })).toEqual([
      { id: 'all', label: 'Все' },
      { id: 'solo', label: 'Сам' },
      { id: 'pairs', label: 'Пары' },
    ]);
  });
});
