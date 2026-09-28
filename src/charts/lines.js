/* =========================================================
   LINES — values over rounds / weeks, one line per series
   =========================================================
   drawLines: e.g. the minimum effort per round (Слабое звено), the bar's
   attendance per evening (Эль Фароль), every link's orders per week
   (Пивная игра) — with dashed horizontal reference lines (capacity,
   the prize, the benchmark) and a hover tooltip on every point.

     drawLines(svg, {
       xLabels: ['1', '2', …],
       series: [{ label: 'Минимум', color, values: [7, 4, 2, …], dash?: true }],
       refs: [{ value: 60, label: 'мест в баре', color }],
       yDomain?: [0, 100], format?: (v) => `${v}%`, theme,
     })

   A null value leaves a gap. The height is fixed; the width is the kit's 640.
========================================================= */
import * as d3 from 'd3';
import { addDotTip, REDUCED_MOTION, setupSvg, tipHtml } from './kit.js';

const W = 640;
const H = 300;
const M = { top: 40, right: 20, bottom: 34, left: 44 };
const DOT_R = 3.6;

export function drawLines(
  svgNode,
  { xLabels, series, refs = [], yDomain, format = (v) => v, theme, xTitle = '' },
) {
  const svg = setupSvg(svgNode, W, H);
  const all = series.flatMap((s) => s.values.filter((v) => v !== null && v !== undefined));
  const refValues = refs.map((r) => r.value);
  const top = d3.max([...all, ...refValues, 1]);
  const domain = yDomain ?? [0, Math.ceil(top * 1.1)];
  const x = d3
    .scalePoint()
    .domain(xLabels.map((_, i) => i))
    .range([M.left, W - M.right])
    .padding(0.3);
  const y = d3
    .scaleLinear()
    .domain(domain)
    .range([H - M.bottom, M.top])
    .nice();

  // gridlines + y ticks
  for (const v of y.ticks(5)) {
    svg
      .append('line')
      .attr('x1', M.left)
      .attr('x2', W - M.right)
      .attr('y1', y(v))
      .attr('y2', y(v))
      .style('stroke', 'var(--line)');
    svg
      .append('text')
      .attr('x', M.left - 8)
      .attr('y', y(v) + 4)
      .attr('text-anchor', 'end')
      .style('font-size', '10.5px')
      .style('fill', 'var(--ink-faint)')
      .text(format(v));
  }

  // x labels — thinned out so they never collide
  const every = Math.ceil(xLabels.length / 14);
  xLabels.forEach((label, i) => {
    if (i % every !== 0 && i !== xLabels.length - 1) return;
    svg
      .append('text')
      .attr('x', x(i))
      .attr('y', H - M.bottom + 18)
      .attr('text-anchor', 'middle')
      .style('font-size', '10.5px')
      .style('fill', 'var(--ink-faint)')
      .text(label);
  });
  if (xTitle) {
    svg
      .append('text')
      .attr('x', W - M.right)
      .attr('y', H - 2)
      .attr('text-anchor', 'end')
      .style('font-size', '10.5px')
      .style('fill', 'var(--ink-faint)')
      .text(xTitle);
  }

  for (const r of refs) {
    svg
      .append('line')
      .attr('x1', M.left)
      .attr('x2', W - M.right)
      .attr('y1', y(r.value))
      .attr('y2', y(r.value))
      .style('stroke', r.color ?? theme.gold)
      .style('stroke-width', 1.5)
      .style('stroke-dasharray', '5,4');
    svg
      .append('text')
      .attr('x', W - M.right)
      .attr('y', y(r.value) - 5)
      .attr('text-anchor', 'end')
      .style('font-size', '10.5px')
      .style('font-weight', 700)
      .style('fill', r.color ?? theme.gold)
      .text(r.label);
  }

  // legend
  let lx = M.left;
  for (const s of series) {
    svg
      .append('rect')
      .attr('x', lx)
      .attr('y', 8)
      .attr('width', 14)
      .attr('height', 4)
      .attr('rx', 2)
      .style('fill', s.color);
    const t = svg
      .append('text')
      .attr('x', lx + 20)
      .attr('y', 14)
      .style('font-size', '11.5px')
      .style('fill', 'var(--ink-soft)')
      .text(s.label);
    lx += 20 + (t.node().getComputedTextLength?.() || s.label.length * 6.5) + 18;
  }

  const line = d3
    .line()
    .defined((d) => d.v !== null && d.v !== undefined)
    .x((d) => x(d.i))
    .y((d) => y(d.v))
    .curve(d3.curveMonotoneX);

  series.forEach((s, si) => {
    const pts = s.values.map((v, i) => ({ v, i }));
    const path = svg
      .append('path')
      .datum(pts)
      .attr('d', line)
      .style('fill', 'none')
      .style('stroke', s.color)
      .style('stroke-width', s.width ?? 2.5)
      .style('stroke-dasharray', s.dash ? '6,5' : null)
      .style('opacity', REDUCED_MOTION ? 1 : 0);
    if (!REDUCED_MOTION)
      path
        .transition()
        .delay(si * 120)
        .duration(500)
        .style('opacity', 1);
    if (s.dots === false) return;
    for (const p of pts) {
      if (p.v === null || p.v === undefined) continue;
      const dot = svg
        .append('circle')
        .attr('class', 'line-dot')
        .attr('cx', x(p.i))
        .attr('cy', y(p.v))
        .attr('r', DOT_R)
        .style('fill', s.color)
        .style('fill-opacity', 0.9)
        .style('stroke', 'var(--white)')
        .style('stroke-width', 1.2);
      addDotTip(
        dot.node(),
        x(p.i),
        y(p.v),
        DOT_R,
        tipHtml(s.label, [[xLabels[p.i], String(format(p.v))]]),
      );
    }
  });
}
