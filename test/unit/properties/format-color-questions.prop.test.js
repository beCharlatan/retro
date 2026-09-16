// Property tests for format.js, color.js and custom-questions.js
import { describe, expect, test } from 'bun:test';
import { darken, hexToRgb, hslToHex } from '../../../src/logic/color.js';
import { buildCustomQuestions, formatValue } from '../../../src/logic/custom-questions.js';
import {
  avatarInitial,
  buildExportFilename,
  escapeHtml,
  formatPercent,
  formatSigned,
  pickAvatarColor,
  plural,
  timeAgo,
} from '../../../src/logic/format.js';
import { fc, int, num, RUNS } from './helpers.js';

describe('format', () => {
  test('plural always returns one of the three forms', () => {
    const forms = ['a', 'b', 'c'];
    fc.assert(
      fc.property(fc.integer({ min: -1e6, max: 1e6 }), (n) =>
        expect(forms).toContain(plural(n, forms)),
      ),
      RUNS,
    );
  });
  test('plural depends only on the last two digits', () => {
    const forms = ['a', 'b', 'c'];
    fc.assert(
      fc.property(int(0, 99), int(0, 9999), (n, hundreds) =>
        expect(plural(hundreds * 100 + n, forms)).toBe(plural(n, forms)),
      ),
      RUNS,
    );
  });

  test('escapeHtml output contains no raw markup characters and is longer-or-equal', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = escapeHtml(s);
        expect(out).not.toMatch(/[<>"']/);
        expect(out.length).toBeGreaterThanOrEqual(s.length);
        // every '&' left is the start of one of our entities
        expect(out.replace(/&(amp|lt|gt|quot|#39);/g, '')).not.toContain('&');
      }),
      RUNS,
    );
  });
  test('escapeHtml can be undone (nothing is lost)', () => {
    const unescape_ = (s) =>
      s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
    fc.assert(
      fc.property(fc.string(), (s) => expect(unescape_(escapeHtml(s))).toBe(s)),
      RUNS,
    );
  });

  test('formatSigned: starts with + or -, and the number can be read back', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e6, max: 1e6 }), (n) => {
        const s = formatSigned(n);
        expect(s[0] === '+' || s[0] === '-').toBe(true);
        expect(Number(s)).toBe(n);
      }),
      RUNS,
    );
  });

  test('formatPercent only ever shows a dash or a whole percent', () => {
    fc.assert(
      fc.property(fc.option(int(0, 100), { nil: null }), (p) =>
        expect(formatPercent(p)).toMatch(/^(—|\d+%)$/),
      ),
      RUNS,
    );
  });

  test('buildExportFilename is a safe single file name for any game title', () => {
    fc.assert(
      fc.property(fc.string(), (title) => {
        const name = buildExportFilename(title, new Date(2026, 8, 5));
        expect(name).not.toMatch(/[:/\\*?"<>|\s]/);
        expect(name.endsWith('_05.09.2026.png')).toBe(true);
      }),
      RUNS,
    );
  });

  test('timeAgo is readable for any age and never leaks NaN/undefined', () => {
    fc.assert(
      fc.property(int(0, 1e7), (ms) => {
        const s = timeAgo(0, ms * 1000);
        expect(s).not.toMatch(/NaN|undefined|null/);
        expect(s.endsWith('назад') || s === 'только что').toBe(true);
      }),
      RUNS,
    );
  });

  test('avatars: the colour is always from the palette, the initial is one character', () => {
    const palette = ['#111', '#222', '#333', '#444'];
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 15 }), fc.string(), (people, name) => {
        expect(palette).toContain(pickAvatarColor(name, people, palette));
        expect([...avatarInitial(name)].length).toBeGreaterThanOrEqual(1);
      }),
      RUNS,
    );
  });
});

describe('color', () => {
  test('hslToHex always yields a valid #rrggbb', () => {
    fc.assert(
      fc.property(num(0, 359.99), num(0, 1), num(0, 1), (h, s, l) =>
        expect(hslToHex(h, s, l)).toMatch(/^#[0-9a-f]{6}$/),
      ),
      RUNS,
    );
  });
  test('hexToRgb inverts the channel encoding', () => {
    const hex2 = (n) => n.toString(16).padStart(2, '0');
    fc.assert(
      fc.property(int(0, 255), int(0, 255), int(0, 255), (r, g, b) =>
        expect(hexToRgb(`#${hex2(r)}${hex2(g)}${hex2(b)}`)).toEqual([r, g, b]),
      ),
      RUNS,
    );
  });
  test('darken keeps the colour valid and never makes it lighter', () => {
    const lightness = (hex) => {
      const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    };
    fc.assert(
      fc.property(int(0, 0xffffff), num(0.2, 1), (n, amount) => {
        const hex = `#${n.toString(16).padStart(6, '0')}`;
        const dark = darken(hex, amount);
        expect(dark).toMatch(/^#[0-9a-f]{6}$/);
        expect(lightness(dark)).toBeLessThanOrEqual(lightness(hex) + 0.01);
      }),
      RUNS,
    );
  });
});

describe('custom questions', () => {
  const DEFAULTS = [
    { q: 'Один?', answer: 1, unit: '' },
    { q: 'Два?', answer: 2, unit: ' т' },
    { q: 'Три?', answer: 3, unit: ' км' },
  ];
  const slot = fc.record({ text: fc.string(), answer: fc.string(), unit: fc.string() });

  test('for any form input: either a full valid list, or an error — never a half-applied list', () => {
    fc.assert(
      fc.property(fc.array(slot, { maxLength: 3 }), (slots) => {
        const r = buildCustomQuestions(DEFAULTS, slots);
        if (r.ok) {
          expect(r.questions).toHaveLength(DEFAULTS.length);
          for (const q of r.questions) {
            expect(typeof q.q).toBe('string');
            expect(q.q.length).toBeGreaterThan(0);
            expect(Number.isFinite(q.answer)).toBe(true);
            expect(q.unit === '' || q.unit.startsWith(' ')).toBe(true);
          }
        } else {
          expect(r.questions).toBeUndefined();
          expect(r.error.length).toBeGreaterThan(0);
        }
      }),
      RUNS,
    );
  });

  test('blank slots always keep the defaults, whatever whitespace is typed', () => {
    const blankish = fc.record({
      text: fc.constantFrom('', ' ', '  \t'),
      answer: fc.constant(''),
      unit: fc.string(),
    });
    fc.assert(
      fc.property(fc.array(blankish, { minLength: 3, maxLength: 3 }), (slots) => {
        const r = buildCustomQuestions(DEFAULTS, slots);
        expect(r.ok).toBe(true);
        expect(r.questions).toEqual(DEFAULTS);
        expect(r.isCustom).toBe(false);
      }),
      RUNS,
    );
  });

  test('formatValue always ends with the unit and starts with a whole number', () => {
    fc.assert(
      fc.property(num(-1e6, 1e6), fc.constantFrom('', ' т', ' км'), (v, unit) => {
        const s = formatValue(v, unit);
        expect(s.endsWith(unit)).toBe(true);
        expect(s).toMatch(/^-?\d+/);
      }),
      RUNS,
    );
  });
});
