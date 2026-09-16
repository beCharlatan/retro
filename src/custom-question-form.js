// The DOM half of the custom-question panel (the pure half is
// logic/custom-questions.js): reading the slot inputs out of a game's
// shadow root and clearing them again. Slot i's inputs are
// #custom-q-text-i / #custom-q-answer-i / #custom-q-unit-i.

export function readQuestionSlots(root, count) {
  return Array.from({ length: count }, (_, i) => ({
    text: root.getElementById(`custom-q-text-${i}`).value,
    answer: root.getElementById(`custom-q-answer-${i}`).value,
    unit: root.getElementById(`custom-q-unit-${i}`).value,
  }));
}

export function clearQuestionSlots(root, count) {
  for (let i = 0; i < count; i++) {
    root.getElementById(`custom-q-text-${i}`).value = '';
    root.getElementById(`custom-q-answer-${i}`).value = '';
    root.getElementById(`custom-q-unit-${i}`).value = '';
  }
}
