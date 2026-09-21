/* =========================================================
   CUSTOM QUESTIONS — swap in your own question(s) with a known answer
   =========================================================
   Quiz-style games (crowd-wisdom, calibration, false-consensus) ship
   with default questions but let the facilitator replace them. The
   validation rules and messages used to be copy-pasted per game; here
   they are once, DOM-free (the form is read by
   src/custom-question-form.js and handed in as plain slots), and
   unit-tested (test/unit/custom-questions.test.js).

   A "slot" is what the form holds for one question:
     { text: string, answer: string (the raw <input> value), unit: string }
========================================================= */

export const MESSAGES = {
  incomplete:
    'Для каждого заполненного вопроса нужен и текст, и числовой ответ — либо оставьте оба поля пустыми.',
  applied: '✓ Вопросы обновлены — используются при сборе данных и в результатах.',
  resetAll: '✓ Вернули все стандартные вопросы.',
  needText: 'Впишите текст вопроса.',
  appliedOne: '✓ Вопрос обновлён.',
  resetOne: '✓ Вернули стандартный вопрос.',
};

export const cloneQuestions = (defaults) => defaults.map((q) => ({ ...q }));

// Whole-number display with the game's unit suffix (" т", " км", …).
export const formatValue = (value, unit) => `${Math.round(value)}${unit}`;

// Turns the form's slots into the question list.
//   - a slot left completely blank keeps its default;
//   - a slot with only text or only an answer is a mistake → error;
//   - the unit is optional and is stored with a leading space (" км").
// `isCustom` is true only if something actually differs from the defaults
// (typing the default text back in doesn't count as customizing).
export function buildCustomQuestions(defaults, slots) {
  const questions = defaults.map((def, i) => {
    const { text = '', answer = '', unit = '' } = slots[i] ?? {};
    const cleanText = text.trim();
    const cleanUnit = unit.trim();
    if (!cleanText && answer === '') return { ...def };
    const value = Number(answer);
    if (!cleanText || answer === '' || Number.isNaN(value)) return null;
    return { q: cleanText, answer: value, unit: cleanUnit ? ` ${cleanUnit}` : '' };
  });
  if (questions.some((q) => q === null)) return { ok: false, error: MESSAGES.incomplete };
  const isCustom = questions.some(
    (q, i) => q.q !== defaults[i].q || q.answer !== defaults[i].answer,
  );
  return { ok: true, questions, isCustom, message: MESSAGES.applied };
}

// The single-question variant (false-consensus): just non-empty text.
export function buildCustomQuestionText(rawText) {
  const text = rawText.trim();
  if (!text) return { ok: false, error: MESSAGES.needText };
  return { ok: true, question: text, message: MESSAGES.appliedOne };
}
