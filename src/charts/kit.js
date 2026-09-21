/* =========================================================
   CHART KIT — the small pieces every results chart shares
   =========================================================
   The charts in this folder only DRAW (d3 + SVG); what to draw comes from
   src/logic/chart-data.js and the game's own results. Each chart:
     - takes the <svg> element, a plain data object and the game's theme colours;
     - sizes itself from the data (so an export never gets a half-empty page);
     - pops its marks in (skipped under prefers-reduced-motion);
     - gives every mark a hover tooltip (chart-tip.js) with an enlarged, invisible
       hit target so thin bars and small dots are easy to point at.
========================================================= */
import * as d3 from 'd3';
import { ChartTip } from '../chart-tip.js';

export const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const SVG_NS = 'http://www.w3.org/2000/svg';
export const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
};

// The game's own colours, read from its wrapper (game-trail.js's gameAccentStyle sets
// --game-accent per game), with the app's palette as fallback.
export function readTheme(root) {
  const cs = getComputedStyle(root.querySelector('.wrap-wide'));
  const get = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  const accent = get('--game-accent', '#4E7FFF');
  return {
    accent,
    accentDeep: get('--game-accent-deep', accent),
    gold: get('--gold', '#b87503'),
    red: get('--red', '#ef3061'),
    ink: 'var(--ink)',
    inkSoft: 'var(--ink-soft)',
    inkFaint: 'var(--ink-faint)',
    line: 'var(--line)',
    white: 'var(--white)',
  };
}

// Empties the <svg> and gives it a viewBox; returns the d3 selection.
export function setupSvg(svg, width, height) {
  svg.innerHTML = '';
  return d3
    .select(svg)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');
}

// A staggered "pop" from radius 0 (the same easing the other charts use).
export function popIn(dots, radius, step = 26) {
  if (REDUCED_MOTION) return dots.attr('r', radius);
  return dots
    .transition()
    .delay((_d, i) => i * step)
    .duration(420)
    .ease(d3.easeBackOut.overshoot(1.7))
    .attr('r', radius);
}

// Adds an invisible larger circle right AFTER `dotNode` (keeping the DOM a plain
// [dot, hit, dot, hit…] sequence) that shows `html` in the tooltip and grows the dot.
export function addDotTip(dotNode, cx, cy, radius, html) {
  const hit = svgEl('circle', {
    cx,
    cy,
    r: radius + 5,
    fill: 'transparent',
    'pointer-events': 'all',
  });
  dotNode.after(hit);
  ChartTip.attach(hit, html);
  hit.addEventListener('mouseenter', () => {
    d3.select(dotNode)
      .style('fill-opacity', 1)
      .attr('r', radius * 1.2);
  });
  hit.addEventListener('mouseleave', () => {
    d3.select(dotNode).style('fill-opacity', 0.9).attr('r', radius);
  });
  return hit;
}

// A tooltip body: a bold title, then "label  value" rows.
export const tipHtml = (title, rows = []) =>
  `<b>${title}</b>${rows.map(([k, v]) => `<span class="tip-row"><span>${k}</span><span>${v}</span></span>`).join('')}`;

// A horizontal axis along y with tick labels below it.
export function drawXAxis(
  sel,
  scale,
  y,
  { ticks = 5, tickValues, format = (v) => v, color = 'var(--ink-faint)' } = {},
) {
  sel
    .append('line')
    .attr('x1', scale.range()[0])
    .attr('x2', scale.range()[1])
    .attr('y1', y)
    .attr('y2', y)
    .style('stroke', 'var(--ink)')
    .style('stroke-width', 1.2);
  const values = tickValues ?? scale.ticks(ticks);
  for (const v of values) {
    const x = scale(v);
    sel
      .append('line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', y)
      .attr('y2', y + 5)
      .style('stroke', color);
    sel
      .append('text')
      .attr('x', x)
      .attr('y', y + 18)
      .attr('text-anchor', 'middle')
      .style('font-size', '10.5px')
      .style('fill', color)
      .text(format(v));
  }
}

// A dashed vertical reference line with its label at the top.
export function drawVRef(sel, x, y1, y2, label, color, { anchor = 'middle', labelY } = {}) {
  sel
    .append('line')
    .attr('x1', x)
    .attr('x2', x)
    .attr('y1', y1)
    .attr('y2', y2)
    .style('stroke', color)
    .style('stroke-width', 1.5)
    .style('stroke-dasharray', '5,4');
  if (label) {
    sel
      .append('text')
      .attr('x', x)
      .attr('y', labelY ?? y1 - 5)
      .attr('text-anchor', anchor)
      .style('font-size', '10.5px')
      .style('font-weight', 700)
      .style('fill', color)
      .text(label);
  }
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Which way a label centred on `x` should be anchored so it never runs off the chart.
export const labelAnchor = (x, width, room = 90) =>
  x < room ? 'start' : x > width - room ? 'end' : 'middle';
