/* Sizing of the projector canvas — pure, so it can be tested without a browser. */
// The picture is laid out like the app's game screen on a fixed-width canvas (content + the trail rail;
// the content splits in two when a chart is shown) and the whole canvas is scaled to fit the window — never scrolled, because the people
// looking at a shared window can't scroll it.
export const CANVAS_WIDTH = 1320;
export const WIDE_CANVAS_WIDTH = 1560;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.6;

export function fitScale(canvasW, canvasH, boxW, boxH) {
  if (!(canvasW > 0 && canvasH > 0 && boxW > 0 && boxH > 0)) return 1;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, boxW / canvasW, boxH / canvasH));
}

export const SHORT_CHART = 0.62; // viewBox height / width up to which a chart is "short"

// How tall a chart is next to its width, from the svg's viewBox (1 if it can't be told).
export function chartAspect(markup) {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(markup);
  return m ? Number(m[2]) / Number(m[1]) : 1;
}
