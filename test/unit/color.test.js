// test/unit/color.test.js — src/logic/color.js
import { describe, expect, test } from 'bun:test';
import { darken, hexToRgb, hslToHex } from '../../src/logic/color.js';

describe('hexToRgb', () => {
  test('splits a hex colour into channels', () => {
    expect(hexToRgb('#ff8458')).toEqual([255, 132, 88]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
  });
});

describe('hslToHex', () => {
  test('primary hues at full saturation, mid lightness', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#ff0000');
    expect(hslToHex(120, 1, 0.5)).toBe('#00ff00');
    expect(hslToHex(240, 1, 0.5)).toBe('#0000ff');
  });
  test('greys have no saturation', () => {
    expect(hslToHex(0, 0, 0)).toBe('#000000');
    expect(hslToHex(0, 0, 1)).toBe('#ffffff');
    expect(hslToHex(200, 0, 0.5)).toBe('#808080');
  });
});

describe('darken', () => {
  const lightness = (hex) => {
    const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
    return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  };
  test('makes every colour darker, by roughly the requested factor', () => {
    for (const hex of ['#ff8458', '#1bd29d', '#8976f7', '#f7a203', '#3399ff']) {
      const dark = darken(hex);
      expect(lightness(dark)).toBeLessThan(lightness(hex));
      expect(lightness(dark)).toBeCloseTo(lightness(hex) * 0.72, 1);
    }
  });
  test('keeps the hue (the dominant channel stays dominant)', () => {
    const [r, g, b] = hexToRgb(darken('#ff2200'));
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });
  test('greys darken to a grey', () => {
    const [r, g, b] = hexToRgb(darken('#808080'));
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeLessThan(0x80);
  });
  test('an amount of 1 leaves the colour (almost) unchanged', () => {
    const [r, g, b] = hexToRgb(darken('#ff8458', 1));
    expect(Math.abs(r - 255)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 132)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 88)).toBeLessThanOrEqual(1);
  });
  test('always returns a valid #rrggbb string', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#123456']) {
      expect(darken(hex)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
