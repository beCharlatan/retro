// test/unit/icon-assets.test.js
// src/icon-assets.js is GENERATED from src/icons/*.png (bun run icons).
// These tests make sure the generated module still matches its sources and
// that every icon a game refers to actually exists and decodes.

import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ICONS } from '../../src/icon-assets.js';

const ICON_DIR = path.join(import.meta.dir, '..', '..', 'src', 'icons');
const pngNames = fs
  .readdirSync(ICON_DIR)
  .filter((f) => f.endsWith('.png'))
  .map((f) => f.replace(/\.png$/, ''))
  .sort();

const decode = (dataUri) => Buffer.from(dataUri.split(',')[1], 'base64');

describe('icon-assets.js', () => {
  test('has exactly one entry per source PNG', () => {
    expect(Object.keys(ICONS).sort()).toEqual(pngNames);
  });

  test('every entry is an embedded WebP data URI', () => {
    for (const uri of Object.values(ICONS)) {
      expect(uri.startsWith('data:image/webp;base64,')).toBe(true);
      const bytes = decode(uri);
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    }
  });

  test('each icon keeps the source size (the map zooms them ~4.6×) and its transparency', async () => {
    for (const name of pngNames) {
      const source = await sharp(path.join(ICON_DIR, `${name}.png`)).metadata();
      const built = await sharp(decode(ICONS[name])).metadata();
      expect([built.width, built.height]).toEqual([source.width, source.height]);
      expect(built.hasAlpha).toBe(true);
    }
  });

  test('each icon still looks like its source (no corrupted or swapped image)', async () => {
    for (const name of pngNames) {
      const grey = { r: 128, g: 128, b: 128 };
      const flat = (input) => sharp(input).flatten({ background: grey }).raw().toBuffer();
      const a = await flat(path.join(ICON_DIR, `${name}.png`));
      const b = await flat(decode(ICONS[name]));
      let squared = 0;
      for (let i = 0; i < a.length; i++) squared += (a[i] - b[i]) ** 2;
      const psnr = 10 * Math.log10((255 * 255) / (squared / a.length || 1e-9));
      expect(psnr).toBeGreaterThan(38);
    }
  });

  test('the whole set stays small (guards against re-embedding the PNGs)', () => {
    const total = Object.values(ICONS).reduce((sum, uri) => sum + uri.length, 0);
    expect(total).toBeLessThan(300 * 1024);
  });

  test('every game points at an icon that exists', () => {
    // state.js touches `document` at import time, so read the icon names
    // out of its source instead of importing it.
    const stateSource = fs.readFileSync(
      path.join(import.meta.dir, '..', '..', 'src', 'state.js'),
      'utf8',
    );
    const used = [...stateSource.matchAll(/^\s+icon: '([^']+)',$/gm)].map((m) => m[1]);
    expect(used.length).toBeGreaterThanOrEqual(13);
    for (const icon of used) expect(ICONS[icon]).toBeDefined();
  });
});
