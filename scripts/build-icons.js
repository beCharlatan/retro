// Regenerates src/icon-assets.js from src/icons/*.png.
//
//   bun run icons
//
// The PNGs in src/icons/ are the source of truth (300×300, RGBA — big
// enough that the map camera can zoom an icon ~4.6× without it turning
// into blocky pixel art). This script re-encodes each as lossy WebP and
// embeds it as a base64 data URI so the icons still ship inside the one
// self-contained dist/index.html. WebP at quality 90 is about 5× smaller
// than the PNGs with no visible difference (PSNR > 44 dB, alpha kept at
// full quality) and decodes quickly, which matters on low-memory
// machines where the ~1 MB of PNG data was a big part of the bundle.
//
// Needs `sharp` (devDependency — build time only, never shipped).

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.join(import.meta.dir, '..');
const SRC_DIR = path.join(ROOT, 'src', 'icons');
const OUT = path.join(ROOT, 'src', 'icon-assets.js');

export const WEBP_OPTIONS = { quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true };

const HEADER = `/* =========================================================
   Иконки карточек игр — 3D-рендеры геометрических фигур, чисто
   декоративные, без привязки к смыслу конкретной игры — назначены
   играм произвольно (state.js, поле GAMES[i].icon).

   ЭТОТ ФАЙЛ СГЕНЕРИРОВАН — не править руками:  bun run icons
   (scripts/build-icons.js). Источник — src/icons/*.png (300×300,
   RGBA; размер выбран так, чтобы гейм-карта могла приближать иконку
   камерой в разы, не разваливаясь в блочный пиксель-арт). Скрипт
   перекодирует каждую в WebP (quality 90, ≈5× легче PNG, разницы на
   глаз нет) и кладёт base64 прямо в модуль, чтобы иконки попали в
   собранный dist/index.html без отдельных файловых запросов — тот же
   self-contained-файл принцип, что и у всего остального в проекте.
========================================================= */
`;

const isPlainIdentifier = (name) => /^[A-Za-z_$][\w$]*$/.test(name);

async function main() {
  const files = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.png'))
    .sort();
  let pngBytes = 0;
  let webpBytes = 0;
  const entries = [];
  for (const file of files) {
    const png = fs.readFileSync(path.join(SRC_DIR, file));
    const webp = await sharp(png).webp(WEBP_OPTIONS).toBuffer();
    pngBytes += png.length;
    webpBytes += webp.length;
    const key = file.replace(/\.png$/, '');
    const quoted = isPlainIdentifier(key) ? key : `'${key}'`;
    entries.push(`  ${quoted}:\n    'data:image/webp;base64,${webp.toString('base64')}',`);
  }
  fs.writeFileSync(OUT, `${HEADER}export const ICONS = {\n${entries.join('\n')}\n};\n`);
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log(
    `${files.length} icons: PNG ${kb(pngBytes)} → WebP ${kb(webpBytes)} (${Math.round((1 - webpBytes / pngBytes) * 100)}% smaller)`,
  );
}

main();
