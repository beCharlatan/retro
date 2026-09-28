// test/unit/players.test.js
// The team list as pure functions: names are cleaned and unique, nothing is mutated, bad stored
// data never breaks the app.
import { describe, expect, test } from 'bun:test';
import {
  activeNames,
  addMany,
  addPlayer,
  allNames,
  cleanName,
  deserializePlayers,
  MAX_NAME,
  MAX_PLAYERS,
  makePlayers,
  nameError,
  parseNames,
  removePlayer,
  renamePlayer,
  SAMPLE_PLAYERS,
  serializePlayers,
  setActive,
  setAllActive,
  teamProblem,
} from '../../src/logic/players.js';

const team = () => makePlayers(['Анна', 'Борис', 'Вера']);

describe('cleanName / nameError', () => {
  test('trims and collapses whitespace', () => {
    expect(cleanName('  Анна   Мария \n')).toBe('Анна Мария');
    expect(cleanName(null)).toBe('');
    expect(cleanName(undefined)).toBe('');
  });

  test('rejects empty, too long and duplicate names — case-insensitively, Cyrillic included', () => {
    expect(nameError('   ', team())).toBe('empty');
    expect(nameError('x'.repeat(MAX_NAME + 1), team())).toBe('long');
    expect(nameError('x'.repeat(MAX_NAME), team())).toBeNull();
    expect(nameError('анна', team())).toBe('duplicate');
    expect(nameError('  БОРИС ', team())).toBe('duplicate');
    expect(nameError('Глеб', team())).toBeNull();
  });

  test('a person being renamed may keep their own name', () => {
    expect(nameError('Анна', team(), 0)).toBeNull();
    expect(nameError('Борис', team(), 0)).toBe('duplicate');
  });

  test('the list has a size limit', () => {
    const full = makePlayers(Array.from({ length: MAX_PLAYERS }, (_, i) => `p${i}`));
    expect(nameError('ещё', full)).toBe('full');
  });
});

describe('addPlayer / renamePlayer / removePlayer / setActive', () => {
  test('adding appends an active player with the cleaned name', () => {
    const r = addPlayer(team(), '  Глеб  ');
    expect(r.error).toBeNull();
    expect(r.players.at(-1)).toEqual({ name: 'Глеб', active: true });
    expect(r.players).toHaveLength(4);
  });

  test('a failed add returns the SAME list', () => {
    const list = team();
    const r = addPlayer(list, 'анна');
    expect(r.error).toBe('duplicate');
    expect(r.players).toBe(list);
  });

  test('nothing is mutated', () => {
    const list = team();
    const before = JSON.stringify(list);
    addPlayer(list, 'Глеб');
    renamePlayer(list, 0, 'Аня');
    removePlayer(list, 1);
    setActive(list, 2, false);
    setAllActive(list, false);
    expect(JSON.stringify(list)).toBe(before);
  });

  test('rename changes only that person and keeps their active flag', () => {
    const list = setActive(team(), 1, false);
    const r = renamePlayer(list, 1, ' Боря ');
    expect(r.players.map((p) => p.name)).toEqual(['Анна', 'Боря', 'Вера']);
    expect(r.players[1].active).toBe(false);
  });

  test('rename to a taken or empty name, or of a missing person, is refused', () => {
    expect(renamePlayer(team(), 0, 'вера').error).toBe('duplicate');
    expect(renamePlayer(team(), 0, '').error).toBe('empty');
    expect(renamePlayer(team(), 9, 'Х').error).toBe('empty');
  });

  test('remove and switch off / on', () => {
    expect(allNames(removePlayer(team(), 0))).toEqual(['Борис', 'Вера']);
    const off = setActive(team(), 1, false);
    expect(activeNames(off)).toEqual(['Анна', 'Вера']);
    expect(allNames(off)).toEqual(['Анна', 'Борис', 'Вера']);
    expect(activeNames(setAllActive(off, true))).toEqual(['Анна', 'Борис', 'Вера']);
  });
});

describe('parseNames / addMany', () => {
  test('splits on lines, commas, semicolons and tabs; drops blanks and repeats', () => {
    expect(parseNames('Анна, Борис\nВера;Глеб\t Даша\n\n  \nанна')).toEqual([
      'Анна',
      'Борис',
      'Вера',
      'Глеб',
      'Даша',
    ]);
    expect(parseNames('')).toEqual([]);
    expect(parseNames(null)).toEqual([]);
  });

  test('names that are too long are dropped', () => {
    expect(parseNames(`ok\n${'x'.repeat(MAX_NAME + 1)}`)).toEqual(['ok']);
  });

  test('addMany adds what fits and counts the rest', () => {
    const r = addMany(team(), ['Анна', 'Глеб', 'Даша', 'дАша']);
    expect(allNames(r.players)).toEqual(['Анна', 'Борис', 'Вера', 'Глеб', 'Даша']);
    expect(r.added).toBe(2);
    expect(r.skipped).toBe(2);
  });
});

describe('storage format', () => {
  test('round-trips, including who is switched off', () => {
    const list = setActive(team(), 1, false);
    expect(deserializePlayers(serializePlayers(list))).toEqual(list);
  });

  test('anything that is not a list gives null', () => {
    for (const bad of ['', 'not json', '{}', '42', 'null', '"x"']) {
      expect(deserializePlayers(bad)).toBeNull();
    }
  });

  test('bad entries are dropped, good ones kept, duplicates and blanks removed', () => {
    const json = JSON.stringify([
      { name: 'Анна', active: true },
      null,
      { name: 5 },
      { name: '  ' },
      { name: 'анна' },
      { name: 'Борис', active: false },
      { name: 'Вера' },
    ]);
    expect(deserializePlayers(json)).toEqual([
      { name: 'Анна', active: true },
      { name: 'Борис', active: false },
      { name: 'Вера', active: true },
    ]);
  });

  test('an empty stored list is a real (empty) list, not "nothing stored"', () => {
    expect(deserializePlayers('[]')).toEqual([]);
  });
});

describe('teamProblem', () => {
  test('nobody / one person / enough', () => {
    expect(teamProblem([])).toMatch(/Добавьте игроков/);
    expect(teamProblem(makePlayers(['Анна']))).toMatch(/хотя бы 2/);
    expect(teamProblem(makePlayers(['Анна', 'Борис']))).toBeNull();
  });

  test('people who are switched off do not count', () => {
    expect(teamProblem(setActive(makePlayers(['Анна', 'Борис']), 1, false))).toMatch(/хотя бы 2/);
  });
});

describe('the example team', () => {
  test('is a valid list of unique names', () => {
    const r = addMany([], SAMPLE_PLAYERS);
    expect(r.added).toBe(SAMPLE_PLAYERS.length);
    expect(r.skipped).toBe(0);
  });
});
