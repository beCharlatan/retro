/* =========================================================
   BARS — horizontal bars, plain and stacked
   =========================================================
   drawBars:        one bar per item, e.g. % correct per question
                    (Эвристика доступности), with a reference line (chance = 50%)
   drawStackedBars: one row per item, split into segments that add up to a total,
                    e.g. what the pairs did in each round (Дилемма заключённого)
========================================================= */
import * as d3 from 'd3';
import { ChartTip } from '../chart-tip.js';
import { drawVRef, labelAnchor, REDUCED_MOTION, setupSvg, svgEl, tipHtml } from './kit.js';

const W = 640;
const LABEL_W = 176;
const RIGHT = 56;
const ROW_H = 24;
const ROW_GAP = 16;
const TOP = 30;
const BOTTOM = 24;

function rowLabel(sel, y, text) {
  sel
    .append('text')
    .attr('x', 0)
    .attr('y', y + ROW_H / 2 + 4)
    .style('font-size', '12.5px')
    .style('font-weight', 600)
    .style('fill', 'var(--ink-soft)')
    .text(text.length > 26 ? `${text.slice(0, 25)}…` : text);
}

function grow(bars, targetWidth) {
  if (REDUCED_MOTION) return bars.attr('width', targetWidth);
  return bars
    .transition()
    .delay((_d, i) => i * 90)
    .duration(600)
    .ease(d3.easeCubicOut)
    .attr('width', targetWidth);
}

// bars: [{ label, value, color, tip, valueLabel }]; domain e.g. [0, 100]
export function drawBars(
  svgNode,
  { bars, domain = [0, 100], refs = [], theme, format = (v) => `${v}%` },
) {
  const height = TOP + bars.length * (ROW_H + ROW_GAP) + BOTTOM - ROW_GAP;
  const svg = setupSvg(svgNode, W, height);
  const x = d3
    .scaleLinear()
    .domain(domain)
    .range([LABEL_W, W - RIGHT]);

  // gridlines + tick labels
  for (const v of x.ticks(5)) {
    svg
      .append('line')
      .attr('x1', x(v))
      .attr('x2', x(v))
      .attr('y1', TOP - 6)
      .attr('y2', height - BOTTOM + 6)
      .style('stroke', 'var(--line)');
    svg
      .append('text')
      .attr('x', x(v))
      .attr('y', height - 6)
      .attr('text-anchor', 'middle')
      .style('font-size', '10.5px')
      .style('fill', 'var(--ink-faint)')
      .text(format(v));
  }
  for (const ref of refs)
    drawVRef(svg, x(ref.value), TOP - 6, height - BOTTOM + 6, ref.label, ref.color ?? theme.gold, {
      anchor: labelAnchor(x(ref.value), W, 110),
      labelY: TOP - 12,
    });

  bars.forEach((b, i) => {
    const y = TOP + i * (ROW_H + ROW_GAP);
    rowLabel(svg, y, b.label);
    svg
      .append('rect')
      .attr('x', LABEL_W)
      .attr('y', y)
      .attr('width', W - RIGHT - LABEL_W)
      .attr('height', ROW_H)
      .attr('rx', 8)
      .style('fill', 'color-mix(in srgb, var(--ink) 4%, white)');
    const bar = svg
      .append('rect')
      .attr('class', 'chart-bar')
      .attr('x', LABEL_W)
      .attr('y', y)
      .attr('width', 0)
      .attr('height', ROW_H)
      .attr('rx', 8)
      .style('fill', b.color);
    grow(bar, Math.max(0, x(b.value) - LABEL_W));
    svg
      .append('text')
      .attr('x', W - RIGHT + 8)
      .attr('y', y + ROW_H / 2 + 4.5)
      .style('font-size', '13px')
      .style('font-weight', 700)
      .style('fill', b.color)
      .text(b.valueLabel ?? format(b.value));
    const hit = svgEl('rect', {
      x: 0,
      y: y - ROW_GAP / 2,
      width: W,
      height: ROW_H + ROW_GAP,
      fill: 'transparent',
      'pointer-events': 'all',
    });
    svgNode.appendChild(hit);
    ChartTip.attach(hit, b.tip ?? tipHtml(b.label, []));
    hit.addEventListener('mouseenter', () => bar.style('opacity', 0.82));
    hit.addEventListener('mouseleave', () => bar.style('opacity', 1));
  });
}

// rows: [{ label, segments: [{ key, label, value, color, tip }] }]; every row's
// segments are drawn as shares of that row's own total.
// legend: [{ label, color }]
export function drawStackedBars(svgNode, { rows, legend, theme }) {
  const height = TOP + 14 + rows.length * (ROW_H + ROW_GAP) + 8 - ROW_GAP;
  const svg = setupSvg(svgNode, W, height);
  const barX = 96;
  const barW = W - barX - 8;

  legend.forEach((item, i) => {
    const lx = barX + i * 190;
    svg
      .append('rect')
      .attr('x', lx)
      .attr('y', 4)
      .attr('width', 12)
      .attr('height', 12)
      .attr('rx', 4)
      .style('fill', item.color);
    svg
      .append('text')
      .attr('x', lx + 18)
      .attr('y', 14)
      .style('font-size', '11.5px')
      .style('fill', 'var(--ink-soft)')
      .text(item.label);
  });

  rows.forEach((row, i) => {
    const y = TOP + 14 + i * (ROW_H + ROW_GAP);
    svg
      .append('text')
      .attr('x', 0)
      .attr('y', y + ROW_H / 2 + 4)
      .style('font-size', '12.5px')
      .style('font-weight', 700)
      .style('fill', 'var(--ink-soft)')
      .text(row.label);
    const total = row.segments.reduce((a, s) => a + s.value, 0) || 1;
    svg
      .append('rect')
      .attr('x', barX)
      .attr('y', y)
      .attr('width', barW)
      .attr('height', ROW_H)
      .attr('rx', 8)
      .style('fill', 'color-mix(in srgb, var(--ink) 4%, white)');
    let offset = 0;
    row.segments.forEach((seg) => {
      const w = (seg.value / total) * barW;
      if (w > 0) {
        const rect = svg
          .append('rect')
          .attr('class', 'chart-bar')
          .attr('x', barX + offset)
          .attr('y', y)
          .attr('width', REDUCED_MOTION ? w : 0)
          .attr('height', ROW_H)
          .attr('rx', 6)
          .style('fill', seg.color)
          .style('stroke', 'var(--white)')
          .style('stroke-width', 2);
        if (!REDUCED_MOTION)
          rect
            .transition()
            .delay(i * 120)
            .duration(600)
            .ease(d3.easeCubicOut)
            .attr('width', w);
        if (w > 26) {
          svg
            .append('text')
            .attr('x', barX + offset + w / 2)
            .attr('y', y + ROW_H / 2 + 4.5)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('font-weight', 700)
            .style('fill', '#fff')
            .style('pointer-events', 'none')
            .text(seg.value);
        }
        const hit = svgEl('rect', {
          x: barX + offset,
          y,
          width: w,
          height: ROW_H,
          fill: 'transparent',
          'pointer-events': 'all',
        });
        svgNode.appendChild(hit);
        ChartTip.attach(hit, seg.tip);
        hit.addEventListener('mouseenter', () => rect.style('opacity', 0.85));
        hit.addEventListener('mouseleave', () => rect.style('opacity', 1));
      }
      offset += w;
    });
  });
}
