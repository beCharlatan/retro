/* =========================================================
   ChartController — draws a game's d3 charts after each render
   =========================================================
   The results charts are imperative SVG (d3), drawn into <svg> elements the
   game's template already contains. This controller does the wiring every
   game used to repeat by hand: after each Lit update, for every registered
   chart whose `when()` says there's something to show, find its <svg> in the
   host's render root and call `draw(svg, theme)`.

     this.charts = new ChartController(this, [
       { id: 'pg-chart', when: () => this.results, draw: (svg, theme) => drawSwarm(svg, {...}) },
     ]);

   A chart that isn't due yet (no results) is left alone; one that is due but
   whose <svg> isn't in the DOM is skipped. The theme is read once per pass.
   Errors in one chart never stop the others (or the game) from rendering.
========================================================= */
import { readTheme } from '../charts/kit.js';

export class ChartController {
  constructor(host, charts) {
    this.host = host;
    this.charts = charts;
    host.addController(this);
  }

  hostUpdated() {
    const root = this.host.renderRoot;
    if (!root) return;
    let theme = null;
    for (const chart of this.charts) {
      if (!chart.when()) continue;
      const svg = root.getElementById(chart.id);
      if (!svg) continue;
      try {
        theme ??= this.readTheme(root);
        chart.draw(svg, theme);
      } catch (err) {
        console.error(`chart "${chart.id}" failed to draw`, err);
      }
    }
  }

  readTheme(root) {
    return readTheme(root);
  }
}
