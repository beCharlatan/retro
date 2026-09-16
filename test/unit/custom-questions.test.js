// test/unit/custom-questions.test.js
// Validation for the "задать свой вопрос" panel shared by crowd-wisdom,
// calibration and false-consensus (src/logic/custom-questions.js).
import { describe, expect, test } from 'bun:test';
import {
  buildCustomQuestions,
  buildCustomQuestionText,
  cloneQuestions,
  formatValue,
  MESSAGES,
} from '../../src/logic/custom-questions.js';

const DEFAULTS = [
  { q: 'Сколько весит МКС?', answer: 420, unit: ' т' },
  { q: 'Сколько костей у человека?', answer: 206, unit: '' },
  { q: 'Длина экватора?', answer: 40075, unit: ' км' },
];
const blank = { text: '', answer: '', unit: '' };

describe('buildCustomQuestions', () => {
  test('all slots blank → the defaults, and nothing counts as customized', () => {
    const r = buildCustomQuestions(DEFAULTS, [blank, blank, blank]);
    expect(r.ok).toBe(true);
    expect(r.questions).toEqual(DEFAULTS);
    expect(r.isCustom).toBe(false);
  });

  test('replaces only the filled slot, keeps the other defaults', () => {
    const r = buildCustomQuestions(DEFAULTS, [
      blank,
      { text: 'Строк кода в репозитории?', answer: '48000', unit: 'строк' },
      blank,
    ]);
    expect(r.ok).toBe(true);
    expect(r.questions[0]).toEqual(DEFAULTS[0]);
    expect(r.questions[1]).toEqual({
      q: 'Строк кода в репозитории?',
      answer: 48000,
      unit: ' строк',
    });
    expect(r.questions[2]).toEqual(DEFAULTS[2]);
    expect(r.isCustom).toBe(true);
  });

  test('the unit is optional; a filled unit gets a leading space', () => {
    const r = buildCustomQuestions(DEFAULTS, [
      { text: 'Вопрос', answer: '5', unit: '' },
      blank,
      blank,
    ]);
    expect(r.questions[0].unit).toBe('');
    const r2 = buildCustomQuestions(DEFAULTS, [
      { text: 'Вопрос', answer: '5', unit: '  км  ' },
      blank,
      blank,
    ]);
    expect(r2.questions[0].unit).toBe(' км');
  });

  test('trims the question text', () => {
    const r = buildCustomQuestions(DEFAULTS, [
      { text: '   Привет?  ', answer: '1', unit: '' },
      blank,
      blank,
    ]);
    expect(r.questions[0].q).toBe('Привет?');
  });

  test('text without an answer is rejected, not silently applied', () => {
    const r = buildCustomQuestions(DEFAULTS, [
      { text: 'Только текст', answer: '', unit: '' },
      blank,
      blank,
    ]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(MESSAGES.incomplete);
  });

  test('an answer without text is rejected', () => {
    const r = buildCustomQuestions(DEFAULTS, [
      blank,
      { text: '  ', answer: '10', unit: '' },
      blank,
    ]);
    expect(r.ok).toBe(false);
  });

  test('a non-numeric answer is rejected', () => {
    const r = buildCustomQuestions(DEFAULTS, [
      { text: 'Вопрос', answer: 'много', unit: '' },
      blank,
      blank,
    ]);
    expect(r.ok).toBe(false);
  });

  test('zero and negative answers are valid numbers', () => {
    const r = buildCustomQuestions(DEFAULTS, [
      { text: 'Ноль?', answer: '0', unit: '' },
      { text: 'Минус?', answer: '-5', unit: '' },
      blank,
    ]);
    expect(r.ok).toBe(true);
    expect(r.questions[0].answer).toBe(0);
    expect(r.questions[1].answer).toBe(-5);
  });

  test('typing the default text and answer back in is not "custom"', () => {
    const r = buildCustomQuestions(DEFAULTS, [
      { text: DEFAULTS[0].q, answer: String(DEFAULTS[0].answer), unit: 'т' },
      blank,
      blank,
    ]);
    expect(r.ok).toBe(true);
    expect(r.isCustom).toBe(false);
  });

  test('one bad slot fails the whole batch (nothing half-applied)', () => {
    const r = buildCustomQuestions(DEFAULTS, [
      { text: 'Хороший', answer: '1', unit: '' },
      { text: 'Плохой', answer: '', unit: '' },
      blank,
    ]);
    expect(r.ok).toBe(false);
    expect(r.questions).toBeUndefined();
  });

  test('missing slots are treated as blank', () => {
    expect(buildCustomQuestions(DEFAULTS, []).questions).toEqual(DEFAULTS);
  });

  test('the defaults array is never mutated or aliased', () => {
    const r = buildCustomQuestions(DEFAULTS, [blank, blank, blank]);
    r.questions[0].answer = 1;
    expect(DEFAULTS[0].answer).toBe(420);
  });
});

describe('buildCustomQuestionText (single question)', () => {
  test('accepts and trims text', () => {
    const r = buildCustomQuestionText('  Готовы ли вы?  ');
    expect(r).toMatchObject({ ok: true, question: 'Готовы ли вы?' });
  });
  test('empty or whitespace-only text is rejected', () => {
    expect(buildCustomQuestionText('').ok).toBe(false);
    expect(buildCustomQuestionText('   ').error).toBe(MESSAGES.needText);
  });
});

describe('cloneQuestions / formatValue', () => {
  test('cloneQuestions makes independent copies', () => {
    const copy = cloneQuestions(DEFAULTS);
    copy[0].answer = 1;
    expect(DEFAULTS[0].answer).toBe(420);
    expect(copy).toHaveLength(3);
  });
  test('formatValue rounds to a whole number and appends the unit', () => {
    expect(formatValue(419.6, ' т')).toBe('420 т');
    expect(formatValue(206, '')).toBe('206');
    expect(formatValue(40075.4, ' км')).toBe('40075 км');
  });
});
