// test/unit/format.test.js — src/logic/format.js
import { describe, expect, test } from 'bun:test';
import {
  avatarInitial,
  buildExportFilename,
  escapeHtml,
  formatPercent,
  formatRuDate,
  formatSigned,
  outcomeMark,
  pickAvatarColor,
  plural,
  timeAgo,
} from '../../src/logic/format.js';

const PEOPLE = ['участник', 'участника', 'участников'];

describe('plural (Russian)', () => {
  test('one / few / many for the usual numbers', () => {
    expect(plural(1, PEOPLE)).toBe('участник');
    expect(plural(2, PEOPLE)).toBe('участника');
    expect(plural(4, PEOPLE)).toBe('участника');
    expect(plural(5, PEOPLE)).toBe('участников');
    expect(plural(0, PEOPLE)).toBe('участников');
    expect(plural(13, PEOPLE)).toBe('участников');
  });
  test('the teens are always "many", even though they end in 1–4', () => {
    for (const n of [11, 12, 13, 14, 111, 112, 114]) expect(plural(n, PEOPLE)).toBe('участников');
  });
  test('21, 22, 25, 101 follow the last digit', () => {
    expect(plural(21, PEOPLE)).toBe('участник');
    expect(plural(22, PEOPLE)).toBe('участника');
    expect(plural(25, PEOPLE)).toBe('участников');
    expect(plural(101, PEOPLE)).toBe('участник');
  });
  test('negative numbers use the absolute value', () => {
    expect(plural(-2, PEOPLE)).toBe('участника');
  });
});

describe('escapeHtml', () => {
  test('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });
  test('null and undefined become an empty string; numbers become text', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
  test('plain Cyrillic text passes through untouched', () => {
    expect(escapeHtml('Эффект якоря')).toBe('Эффект якоря');
  });
});

describe('formatRuDate', () => {
  test('day, month name and year in Russian', () => {
    const s = formatRuDate(new Date(2026, 8, 19));
    expect(s).toContain('19');
    expect(s).toContain('сентября');
    expect(s).toContain('2026');
  });
});

describe('buildExportFilename', () => {
  const d = new Date(2026, 8, 5); // 5 Sept 2026
  test('game name with underscores, DD.MM.YYYY and an extension', () => {
    expect(buildExportFilename('Эффект якоря', d)).toBe('Эффект_якоря_05.09.2026.png');
  });
  test('strips characters a file name cannot hold', () => {
    expect(buildExportFilename('A/B: C*D?', d)).toBe('AB_CD_05.09.2026.png');
  });
  test('collapses runs of whitespace and trims', () => {
    expect(buildExportFilename('  Игра   диктатора  ', d)).toBe('Игра_диктатора_05.09.2026.png');
  });
  test('the extension is configurable', () => {
    expect(buildExportFilename('X', d, 'pdf')).toBe('X_05.09.2026.pdf');
  });
});

describe('timeAgo', () => {
  const now = 1_000_000_000_000;
  const ago = (ms) => timeAgo(now - ms, now);
  const MIN = 60_000;
  test('under a minute', () => {
    expect(ago(20_000)).toBe('только что');
  });
  test('one minute has no number', () => {
    expect(ago(MIN)).toBe('минуту назад');
  });
  test('2–4 minutes vs 5+', () => {
    expect(ago(2 * MIN)).toBe('2 минуты назад');
    expect(ago(4 * MIN)).toBe('4 минуты назад');
    expect(ago(5 * MIN)).toBe('5 минут назад');
  });
  test('regression: 21 and 22 minutes decline like "one" and "few", not "many"', () => {
    expect(ago(21 * MIN)).toBe('21 минуту назад');
    expect(ago(22 * MIN)).toBe('22 минуты назад');
    expect(ago(30 * MIN)).toBe('30 минут назад');
  });
  test('hours', () => {
    expect(ago(60 * MIN)).toBe('час назад');
    expect(ago(3 * 60 * MIN)).toBe('3 ч. назад');
  });
});

describe('avatars', () => {
  const PALETTE = ['#111', '#222', '#333'];
  test('initial is the uppercased first letter, ? for an empty name', () => {
    expect(avatarInitial('олег')).toBe('О');
    expect(avatarInitial('  Ирина')).toBe('И');
    expect(avatarInitial('')).toBe('?');
    expect(avatarInitial(null)).toBe('?');
  });
  test('colour follows the person’s position and wraps around the palette', () => {
    const people = ['A', 'B', 'C', 'D'];
    expect(pickAvatarColor('A', people, PALETTE)).toBe('#111');
    expect(pickAvatarColor('C', people, PALETTE)).toBe('#333');
    expect(pickAvatarColor('D', people, PALETTE)).toBe('#111');
  });
  test('an unknown name gets the first colour', () => {
    expect(pickAvatarColor('Nobody', ['A'], PALETTE)).toBe('#111');
  });
});

describe('formatSigned', () => {
  test('positive gets an explicit plus, negative keeps its minus, zero counts as positive', () => {
    expect(formatSigned(150, ' ₽')).toBe('+150 ₽');
    expect(formatSigned(-40, ' ₽')).toBe('-40 ₽');
    expect(formatSigned(0)).toBe('+0');
    expect(formatSigned(2.5)).toBe('+2.5');
  });
});

describe('table cells', () => {
  test('outcomeMark: hit, miss, unanswered', () => {
    expect(outcomeMark(true)).toBe('✓');
    expect(outcomeMark(false)).toBe('✕');
    expect(outcomeMark(null)).toBe('—');
  });
  test('formatPercent: a number gets %, nothing answered gets a dash (0% is a real answer)', () => {
    expect(formatPercent(67)).toBe('67%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(null)).toBe('—');
  });
});
