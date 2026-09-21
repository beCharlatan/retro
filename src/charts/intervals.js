/* =========================================================
   INTERVALS — the "90% sure" ranges people named, per question
   =========================================================
   Калибровка уверенности: for every question a lane with one thin bar per
   person (their low…high range), the true answer as a dashed vertical line,
   bars that caught the answer in the game's colour and bars that missed in red.
   The axis covers the answer and the middle of what people said; wilder ranges
   are clipped at the edge and marked with an arrow (logic/chart-data.js).

     drawIntervals(svg, { lanes: [{ title, answer, unit, bars: [{ name, low, high, hit }] }], theme })
========================================================= */
import * as d3 from 'd3';
import { ChartTip } from '../chart-tip.js';
import { clipInterval, intervalDomain, sortIntervals } from '../logic/chart-data.js';
import { labelAnchor, REDUCED_MOTION, setupSvg, svgEl, tipHtml } from './kit.js';

const W = 640;
const ML = 24;
const MR = 24;
const TITLE = 40;
const ROW = 11;
const BAR = 6;
const AXIS = 26;
const GAP = 22;

const fmt = (n) => Number(n.toFixed(2)).toLocaleString('ru-RU');

export function drawIntervals(svgNode, { lanes, theme }) {
  const laneHeights = lanes.map((l) => TITLE + Math.max(1, l.bars.length) * ROW + AXIS);
  const height = laneHeights.reduce((a, b) => a + b, 0) + GAP * (lanes.length - 1) + 6;
  const svg = setupSvg(svgNode, W, height);

  let top = 0;
  lanes.forEach((lane, li) => {
    const bars = sortIntervals(lane.bars);
    const domain = intervalDomain(bars, lane.answer);
    const x = d3
      .scaleLinear()
      .domain(domain)
      .range([ML, W - MR]);
    const rowsTop = top + TITLE;
    const axisY = rowsTop + Math.max(1, bars.length) * ROW + 6;

    svg
      .append('rect')
      .attr('x', 0)
      .attr('y', top)
      .attr('width', W)
      .attr('height', laneHeights[li])
      .attr('rx', 14)
      .style('fill', `color-mix(in srgb, ${theme.accent} 6%, white)`);
    const title = lane.title.length > 78 ? `${lane.title.slice(0, 77)}…` : lane.title;
    svg
      .append('text')
      .attr('x', 14)
      .attr('y', top + 17)
      .style('font-size', '12px')
      .style('font-weight', 700)
      .style('fill', theme.accentDeep)
      .text(title);

    // the true answer
    const ax = x(lane.answer);
    svg
      .append('line')
      .attr('x1', ax)
      .attr('x2', ax)
      .attr('y1', top + 24)
      .attr('y2', axisY)
      .style('stroke', theme.gold)
      .style('stroke-width', 1.8)
      .style('stroke-dasharray', '5,4');
    svg
      .append('text')
      .attr('x', ax)
      .attr('y', top + 34)
      .attr('text-anchor', labelAnchor(ax, W, 110))
      .style('font-size', '10.5px')
      .style('font-weight', 700)
      .style('fill', theme.gold)
      .text(`верный ответ: ${fmt(lane.answer)}${lane.unit ?? ''}`);

    // axis
    svg
      .append('line')
      .attr('x1', ML)
      .attr('x2', W - MR)
      .attr('y1', axisY)
      .attr('y2', axisY)
      .style('stroke', 'var(--ink)')
      .style('stroke-width', 1.2);
    for (const v of x.ticks(5)) {
      svg
        .append('line')
        .attr('x1', x(v))
        .attr('x2', x(v))
        .attr('y1', axisY)
        .attr('y2', axisY + 5)
        .style('stroke', 'var(--ink-faint)');
      svg
        .append('text')
        .attr('x', x(v))
        .attr('y', axisY + 18)
        .attr('text-anchor', 'middle')
        .style('font-size', '10.5px')
        .style('fill', 'var(--ink-faint)')
        .text(fmt(v));
    }

    bars.forEach((b, i) => {
      const clip = clipInterval(b.low, b.high, domain);
      if (!clip.visible) return;
      const y = rowsTop + i * ROW;
      const color = b.hit ? theme.accent : theme.red;
      const x1 = x(clip.low);
      const w = Math.max(3, x(clip.high) - x1);
      const rect = svg
        .append('rect')
        .attr('class', 'interval-bar')
        .attr('x', x1)
        .attr('y', y)
        .attr('width', REDUCED_MOTION ? w : 0)
        .attr('height', BAR)
        .attr('rx', BAR / 2)
        .style('fill', color)
        .style('opacity', b.hit ? 0.85 : 0.6);
      if (!REDUCED_MOTION)
        rect
          .transition()
          .delay(i * 30)
          .duration(450)
          .ease(d3.easeCubicOut)
          .attr('width', w);
      // an arrow-head where the range runs off the axis
      const arrow = (px, dir) =>
        svg
          .append('path')
          .attr('d', `M ${px} ${y - 1} l ${dir * 5} ${BAR / 2 + 1} l ${-dir * 5} ${BAR / 2 + 1} z`)
          .style('fill', color)
          .style('opacity', 0.9);
      if (clip.clippedLow) arrow(x1, -1);
      if (clip.clippedHigh) arrow(x1 + w, 1);

      const hit = svgEl('rect', {
        x: ML,
        y: y - 2,
        width: W - ML - MR,
        height: ROW,
        fill: 'transparent',
        'pointer-events': 'all',
      });
      svgNode.appendChild(hit);
      ChartTip.attach(
        hit,
        tipHtml(b.name, [
          ['Диапазон', `${fmt(b.low)} — ${fmt(b.high)}${lane.unit ?? ''}`],
          ['Верный ответ', `${fmt(lane.answer)}${lane.unit ?? ''}`],
          ['Итог', b.hit ? '✓ попал' : '✕ мимо'],
        ]),
      );
      hit.addEventListener('mouseenter', () =>
        rect
          .style('opacity', 1)
          .attr('height', BAR + 2)
          .attr('y', y - 1),
      );
      hit.addEventListener('mouseleave', () =>
        rect
          .style('opacity', b.hit ? 0.85 : 0.6)
          .attr('height', BAR)
          .attr('y', y),
      );
    });

    top += laneHeights[li] + GAP;
  });
}
