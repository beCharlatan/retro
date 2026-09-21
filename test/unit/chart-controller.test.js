// test/unit/chart-controller.test.js — ChartController with a fake host and render root.
import { describe, expect, test } from 'bun:test';
import { ChartController } from '../../src/controllers/chart-controller.js';

function fakeHost(svgs = {}) {
  const host = {
    controllers: [],
    addController(c) {
      host.controllers.push(c);
    },
    renderRoot: { getElementById: (id) => svgs[id] ?? null },
  };
  return host;
}
// The real readTheme needs a DOM; stub it.
const controller = (host, charts) => {
  const c = new ChartController(host, charts);
  c.readTheme = () => ({ accent: '#123' });
  return c;
};

describe('ChartController', () => {
  test('registers itself with the host', () => {
    const host = fakeHost();
    const c = controller(host, []);
    expect(host.controllers).toContain(c);
  });

  test('draws a due chart into its <svg>, passing the theme', () => {
    const svg = {};
    const seen = [];
    const c = controller(fakeHost({ a: svg }), [
      { id: 'a', when: () => true, draw: (el, theme) => seen.push([el, theme]) },
    ]);
    c.hostUpdated();
    expect(seen).toEqual([[svg, { accent: '#123' }]]);
  });

  test('leaves a chart alone until its data exists', () => {
    let due = false;
    let drawn = 0;
    const c = controller(fakeHost({ a: {} }), [{ id: 'a', when: () => due, draw: () => drawn++ }]);
    c.hostUpdated();
    expect(drawn).toBe(0);
    due = true;
    c.hostUpdated();
    expect(drawn).toBe(1);
  });

  test('skips a chart whose <svg> is not in the DOM', () => {
    let drawn = 0;
    const c = controller(fakeHost({}), [{ id: 'missing', when: () => true, draw: () => drawn++ }]);
    expect(() => c.hostUpdated()).not.toThrow();
    expect(drawn).toBe(0);
  });

  test('redraws on every update (the results template re-renders)', () => {
    let drawn = 0;
    const c = controller(fakeHost({ a: {} }), [{ id: 'a', when: () => true, draw: () => drawn++ }]);
    c.hostUpdated();
    c.hostUpdated();
    expect(drawn).toBe(2);
  });

  test('a chart that throws does not stop the others', () => {
    const drawn = [];
    const c = controller(fakeHost({ a: {}, b: {} }), [
      {
        id: 'a',
        when: () => true,
        draw: () => {
          throw new Error('boom');
        },
      },
      { id: 'b', when: () => true, draw: () => drawn.push('b') },
    ]);
    const original = console.error;
    console.error = () => {};
    try {
      c.hostUpdated();
    } finally {
      console.error = original;
    }
    expect(drawn).toEqual(['b']);
  });

  test('reads the theme once per pass, however many charts are due', () => {
    let reads = 0;
    const host = fakeHost({ a: {}, b: {} });
    const c = new ChartController(host, [
      { id: 'a', when: () => true, draw: () => {} },
      { id: 'b', when: () => true, draw: () => {} },
    ]);
    c.readTheme = () => {
      reads++;
      return {};
    };
    c.hostUpdated();
    expect(reads).toBe(1);
  });

  test('a host without a render root yet is ignored', () => {
    const c = controller({ addController() {}, renderRoot: undefined }, [
      { id: 'a', when: () => true, draw: () => {} },
    ]);
    expect(() => c.hostUpdated()).not.toThrow();
  });
});
