/* =========================================================
   PERF — "lite" mode for weak machines
   =========================================================
   Chromium on a low-memory device (few GB RAM, few cores, no GPU
   raster) can't keep up with the decorative effects — blurred/
   drop-shadowed layers, infinite CSS loops, a per-frame map loop —
   and everything stutters, on the home map and inside games alike.

   Rather than guessing from the UA alone, decide from two signals:
     1. Static hints: navigator.deviceMemory / hardwareConcurrency.
     2. A short FPS probe right after boot: if frames take >~24ms on
        average the machine is struggling regardless of what it claims.
   Either flips `data-perf="lite"` on <html>; CSS (styles.css,
   map-styles.css via :host-context) then drops the expensive effects,
   and map-render.js throttles its loop. `?perf=lite|full` overrides
   both, for testing.
========================================================= */

const PROBE_FRAMES = 45;
const SLOW_FRAME_MS = 24;

function forcedMode() {
  try {
    const v = new URLSearchParams(location.search).get('perf');
    return v === 'lite' || v === 'full' ? v : null;
  } catch {
    return null;
  }
}

function weakHardware() {
  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  return (typeof mem === 'number' && mem <= 4) || (typeof cores === 'number' && cores <= 4);
}

export function isLite() {
  return document.documentElement.dataset.perf === 'lite';
}

function setLite(on) {
  if (on) document.documentElement.dataset.perf = 'lite';
  else delete document.documentElement.dataset.perf;
  window.dispatchEvent(new CustomEvent('perfchange', { detail: { lite: on } }));
}

function probeFps() {
  let last = null;
  let frames = 0;
  let total = 0;
  let skipped = 0;
  function step(t) {
    if (last !== null) {
      const dt = t - last;
      // The first frames after boot are always slow (layout, image
      // decode); a hidden tab reports huge gaps. Ignore both.
      if (skipped < 10) skipped++;
      else if (dt < 500) {
        total += dt;
        frames++;
      }
    }
    last = t;
    if (frames < PROBE_FRAMES) requestAnimationFrame(step);
    else if (total / frames > SLOW_FRAME_MS) setLite(true);
  }
  requestAnimationFrame(step);
}

export function initPerf() {
  const forced = forcedMode();
  if (forced) return setLite(forced === 'lite');
  if (weakHardware()) setLite(true);
  else probeFps();
}
