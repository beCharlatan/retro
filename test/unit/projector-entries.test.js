// test/unit/projector-entries.test.js
// What a game hands the projector as "entered so far": empty cells and empty people are dropped,
// the complete count is kept, and the wire format (normalizeEntries) is strict.
import { describe, expect, test } from 'bun:test';
import { projectorEntries, spaced } from '../../src/logic/projector-entries.js';
import { normalizeEntries } from '../../src/projector/protocol.js';

describe('projectorEntries', () => {
  const rows = [
    {
      who: ['Анна'],
      complete: true,
      cells: [
        { label: 'Число', value: 42 },
        { label: 'Оценка', value: '30%' },
      ],
    },
    {
      who: ['Борис'],
      complete: false,
      cells: [
        { label: 'Число', value: 7 },
        { label: 'Оценка', value: null },
      ],
    },
    {
      who: ['Вера'],
      complete: false,
      cells: [
        { label: 'Число', value: null },
        { label: 'Оценка', value: '' },
      ],
    },
  ];

  test('a person with no value yet is not listed; a half-filled one is, with only what is filled', () => {
    const e = projectorEntries({ title: 'Что внесли', total: 3, rows });
    expect(e.rows.map((r) => r.who[0])).toEqual(['Анна', 'Борис']);
    expect(e.rows[1].cells).toEqual([{ label: 'Число', value: '7' }]);
  });

  test('values become strings — including 0, which is a real answer', () => {
    const e = projectorEntries({
      title: 't',
      total: 1,
      rows: [{ who: ['А'], complete: true, cells: [{ label: 'x', value: 0 }] }],
    });
    expect(e.rows[0].cells[0].value).toBe('0');
  });

  test('filled counts the complete rows, total is passed through', () => {
    const e = projectorEntries({ title: 't', total: 14, rows });
    expect(e.filled).toBe(1);
    expect(e.total).toBe(14);
    expect(e.unit).toBe('человек');
    expect(e.anonymous).toBe(false);
  });

  test('nothing entered → no rows, filled 0', () => {
    const e = projectorEntries({ title: 't', total: 3, rows: rows.slice(2) });
    expect(e.rows).toEqual([]);
    expect(e.filled).toBe(0);
  });

  test('does not touch the rows it is given', () => {
    const before = JSON.stringify(rows);
    projectorEntries({ title: 't', total: 3, rows });
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe('spaced', () => {
  test('groups thousands with a no-break space', () => {
    expect(spaced(1000)).toBe('1 000');
    expect(spaced(10500000)).toBe('10 500 000');
    expect(spaced(12)).toBe('12');
  });
});

describe('normalizeEntries', () => {
  const good = {
    title: 'Что внесли',
    unit: 'человек',
    anonymous: false,
    total: 14,
    filled: 2,
    rows: [{ who: ['Анна'], tag: 'Владелец', key: 3, cells: [{ label: 'Число', value: '42' }] }],
  };

  test('a good list survives', () => {
    expect(normalizeEntries(good)).toEqual(good);
  });

  test('an anonymous list carries no names and no tags, whatever was sent', () => {
    const e = normalizeEntries({ ...good, anonymous: true });
    expect(e.anonymous).toBe(true);
    expect(e.rows[0].who).toEqual([]);
    expect(e.rows[0].tag).toBe('');
    expect(JSON.stringify(e)).not.toContain('Анна');
    expect(JSON.stringify(e)).not.toContain('Владелец');
  });

  test('rows without cells (or, when named, without anyone) are dropped', () => {
    const e = normalizeEntries({
      ...good,
      rows: [
        { who: ['А'], cells: [] },
        { who: [], cells: [{ label: 'x', value: '1' }] },
        good.rows[0],
      ],
    });
    expect(e.rows).toHaveLength(1);
  });

  test('non-string cells are dropped, counts are clamped to whole non-negative numbers', () => {
    const e = normalizeEntries({
      ...good,
      total: -3,
      filled: 2.5,
      rows: [
        {
          who: ['А'],
          cells: [
            { label: 'x', value: 5 },
            { label: 'y', value: '7' },
          ],
        },
      ],
    });
    expect(e.total).toBe(0);
    expect(e.filled).toBe(0);
    expect(e.rows[0].cells).toEqual([{ label: 'y', value: '7' }]);
  });

  test('a pair has two names at most; the number of rows and cells is capped', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      who: ['a', 'b', 'c'],
      cells: Array.from({ length: 10 }, (_, k) => ({ label: `l${k}`, value: `${i}` })),
    }));
    const e = normalizeEntries({ ...good, rows: many });
    expect(e.rows).toHaveLength(60);
    expect(e.rows[0].who).toEqual(['a', 'b']);
    expect(e.rows[0].cells).toHaveLength(6);
  });

  test('junk gives null', () => {
    for (const bad of [null, undefined, 'x', {}, { rows: [] }, { title: 5 }])
      expect(normalizeEntries(bad)).toBeNull();
  });
});
