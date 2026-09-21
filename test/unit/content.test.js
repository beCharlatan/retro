// test/unit/content.test.js
// The texts in src/content/*.json — checked so a wording edit can't break a
// screen: right shape, only the few inline tags the renderer expects, balanced
// tags, known {placeholders}, and one file per game.
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_TAGS, fill } from '../../src/content.js';

const CONTENT_DIR = join(import.meta.dir, '../../src/content');
const GAMES_DIR = join(import.meta.dir, '../../src/games');
const KNOWN_PLACEHOLDERS = ['pot', 'stake', 'question'];

const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json'));
const load = (file) => JSON.parse(readFileSync(join(CONTENT_DIR, file), 'utf8'));

// Every string in a content file, with where it lives (for failure messages).
function strings(node, path = '') {
  if (typeof node === 'string') return [[path, node]];
  if (Array.isArray(node)) return node.flatMap((n, i) => strings(n, `${path}[${i}]`));
  return Object.entries(node).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
}

const text = (v) => typeof v === 'string' && v.trim().length > 0;

describe('content files', () => {
  test('there is one for every game', () => {
    const games = readdirSync(GAMES_DIR)
      .filter((f) => f.endsWith('.js'))
      .map((f) => f.replace(/\.js$/, ''));
    expect(files.map((f) => f.replace(/\.json$/, '')).sort()).toEqual(games.sort());
  });

  for (const file of files) {
    describe(file, () => {
      const content = load(file);

      test('steps have a title and text (a title may be left out only with an id)', () => {
        for (const step of content.intro?.steps ?? []) {
          expect(text(step.text)).toBe(true);
          expect(text(step.title) || text(step.id)).toBe(true);
        }
        for (const step of content.facts ?? []) {
          expect(text(step.title) && text(step.text)).toBe(true);
        }
      });

      test('the context has a lede and blocks that are a paragraph or a stat row', () => {
        if (!content.context) return;
        expect(text(content.context.lede)).toBe(true);
        expect(content.context.blocks.length).toBeGreaterThan(0);
        for (const block of content.context.blocks) {
          if (block.stats) {
            expect(block.stats.length).toBeGreaterThan(0);
            for (const s of block.stats) expect(text(s.n) && text(s.label)).toBe(true);
          } else {
            expect(text(block.p)).toBe(true);
          }
        }
      });

      test('every game has its intro steps, context and facts', () => {
        expect(content.intro?.steps?.length).toBeGreaterThan(0);
        expect(content.context).toBeDefined();
        expect(content.facts?.length).toBeGreaterThan(0);
      });

      test('only <b>, <i> and <br> are used, and they are balanced', () => {
        for (const [path, value] of strings(content)) {
          const tags = [...value.matchAll(/<\/?\s*([a-z0-9]+)[^>]*>/gi)];
          for (const t of tags)
            expect([path, ALLOWED_TAGS.includes(t[1].toLowerCase())]).toEqual([path, true]);
          for (const name of ['b', 'i']) {
            const open = (value.match(new RegExp(`<${name}>`, 'g')) ?? []).length;
            const close = (value.match(new RegExp(`</${name}>`, 'g')) ?? []).length;
            expect([path, open]).toEqual([path, close]);
          }
        }
      });

      test('placeholders are known and no template syntax leaked in', () => {
        for (const [path, value] of strings(content)) {
          expect([path, value.includes('${')]).toEqual([path, false]);
          for (const m of value.matchAll(/\{(\w+)\}/g)) {
            expect([path, KNOWN_PLACEHOLDERS.includes(m[1])]).toEqual([path, true]);
          }
        }
      });

      test('no stray whitespace at the ends or doubled inside', () => {
        for (const [path, value] of strings(content)) {
          expect([path, value === value.trim() && !/\s{2,}/.test(value)]).toEqual([path, true]);
        }
      });
    });
  }
});

describe('fill', () => {
  test('replaces known placeholders and leaves unknown ones alone', () => {
    expect(fill('{pot} ₽ и {other}', { pot: 1000 })).toBe('1000 ₽ и {other}');
  });

  test('escapes what it inserts (a typed question cannot inject markup)', () => {
    expect(fill('«{question}»', { question: '<img src=x onerror=alert(1)> & "q"' })).toBe(
      '«&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;»',
    );
  });
});
