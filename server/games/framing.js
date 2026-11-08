/* =========================================================
   ONLINE DECLARATION: Эффект фрейминга (framing)
   Two groups; in each of two scenarios one group hears the GAIN
   wording, the other the LOSS wording — then they swap. Logic from
   src/logic/results.js (framingFrame / framingResults).
   Scenario texts come from src/games/framing.js — the wording each
   group sees is fixed there; online MVP shows the neutral form and
   lets the facilitator read the wordings aloud (like the offline
   room flow).
========================================================= */
import { framingFrame, framingResults } from '../../src/logic/results.js';
import { Roles } from '../../src/roles.js';
import { choiceValue } from './validate.js';

const CHOICES = [
  { value: '1', label: 'Вариант 1' },
  { value: '2', label: 'Вариант 2' },
];

const groupOf = (me, assignment) =>
  assignment?.groupA?.includes(me) ? 'A' : assignment?.groupB?.includes(me) ? 'B' : null;

export default {
  id: 'framing',
  name: 'Эффект фрейминга',
  category: 'cognitive',
  minPlayers: 4,
  structure: 'groups',
  rounds: 2,
  roundTitles: ['Сценарий 1', 'Сценарий 2 · меняемся формулировками'],

  rules: {
    flow: ['Две команды', 'Два сценария', 'Две формулировки', 'Результаты'],
    items: [
      {
        title: 'Две команды',
        text: 'Ведущий делит вас на две команды. Каждый сценарий вы слышите в своей формулировке — «в плюсе» или «в минусе».',
      },
      {
        title: 'Выбор',
        text: 'В каждом сценарии — выбор между двумя программами. Варианты математически равноценны, но звучат по-разному.',
      },
    ],
  },

  assignment: (participants) => {
    const { groupA, groupB } = Roles.makeGroups(participants.map((p) => p.name));
    return { groupA, groupB };
  },

  roster: (assignment) =>
    assignment
      ? {
          kind: 'groups',
          title: 'Команды',
          groups: [
            { label: 'Команда A', tone: 'a', names: assignment.groupA ?? [] },
            { label: 'Команда B', tone: 'b', names: assignment.groupB ?? [] },
          ],
        }
      : null,

  fieldsFor: (round) => [
    {
      key: `r${round + 1}`,
      kind: 'choice',
      label: `Сценарий ${round + 1}: какую программу выбираете? (формулировку читает ведущий)`,
      options: CHOICES,
    },
  ],

  myInfo: (round, ctx) => {
    const g = groupOf(ctx.me, ctx.assignment);
    if (!g) return null;
    const frame = framingFrame(g, round);
    return `Вы в команде ${g}. В этом сценарии ваша формулировка — «${frame === 'gain' ? 'в плюсе (спасённые)' : 'в минусе (потери)'}». Слушайте ведущего внимательно.`;
  },

  empty: () => ({ r1: null, r2: null }),

  flatten: (payload) => ({ r1: payload.r1 ?? null, r2: payload.r2 ?? null }),

  validateRound(raw, round, ctx) {
    if (!groupOf(ctx.me, ctx.assignment)) return { ok: false, error: 'Вас нет ни в одной команде' };
    const v = choiceValue(raw[`r${round + 1}`], CHOICES);
    if (v === null) return { ok: false, error: 'Выберите вариант' };
    return { ok: true, patch: { [`r${round + 1}`]: v } };
  },

  roundFilled: (payload, round) => payload[`r${round + 1}`] != null,

  complete: (named, assignment) =>
    named.length >= 4 &&
    named.every((n) => n.payload.r1 != null && n.payload.r2 != null && groupOf(n.name, assignment)),

  entries(named, assignment) {
    return named.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      tag: groupOf(name, assignment) ? `Команда ${groupOf(name, assignment)}` : '',
      cells: [1, 2].map((r) => ({
        label: `С${r}`,
        value: payload[`r${r}`] == null ? '—' : payload[`r${r}`] === '2' ? 'Риск' : 'Надёжно',
      })),
      payload,
    }));
  },

  compute(named, assignment) {
    const entries = named
      .map((n) => ({
        name: n.name,
        group: groupOf(n.name, assignment),
        choices: [n.payload.r1, n.payload.r2],
      }))
      .filter((e) => e.group);
    const r = framingResults(entries, 2);
    return {
      gainRisky: r.gainRisky,
      lossRisky: r.lossRisky,
      diff: r.diff,
      flippedRounds: r.flippedRounds,
      decided: r.decided,
    };
  },

  headline: (r) =>
    r.gainRisky === null || r.lossRisky === null
      ? '—'
      : `${Math.round(r.gainRisky)}% / ${Math.round(r.lossRisky)}%`,
  detail: (r) =>
    'Доля выбравших рискованный вариант: «в плюсе» / «в минусе». Формулировка смещает выбор, не меняя сути.',
  timerSeconds: () => 30,
};
