/* =========================================================
   SWARM — beeswarm lanes: one dot per person along a value axis
   =========================================================
   Used by Общественное благо (round 1 vs round 2, with a line per person),
   Ложный консенсус (yes-sayers vs no-sayers, real share as a reference line),
   Эффект владения (sellers vs buyers for each lot) and Эффект Барнума
   (ratings 0–5, stacked on their integers).

     drawSwarm(svg, {
       lanes: [{ label, color, domain: [min, max], ticks?, format?,
                 points: [{ id, value, tip }], refs?: [{ value, label, color }] }],
       links?: true,   // join points sharing an `id` in consecutive lanes
       theme,
     })

   Every lane has its own axis (endowment's mug and house prices differ 10 000×);
   each lane's height comes from its own pile of dots, and the SVG height from the
   lanes (logic/chart-layout.js), so a chart is never taller than its data needs.
========================================================= */
import * as d3 from 'd3';
import { stackLanes, swarmHeight } from '../logic/chart-layout.js';
import { dodge } from '../logic/stats.js';
import { addDotTip, drawVRef, labelAnchor, popIn, setupSvg, svgEl } from './kit.js';

const W = 640;
const ML = 24;
const MR = 24;
const DOT_R = 6;
const TOP = 34; // room above a lane's dots for its label and reference labels
const AXIS = 30; // room below the baseline for the axis
const GAP = 12;

export function drawSwarm(svgNode, { lanes, links = false, theme, dotR = DOT_R }) {
  const populated = lanes.filter((l) => l.points.length);
  if (!populated.length) {
    setupSvg(svgNode, W, 10);
    return;
  }

  const prepared = lanes.map((lane) => {
    const x = d3
      .scaleLinear()
      .domain(lane.domain)
      .range([ML, W - MR]);
    const swarm = dodge(lane.points, (p) => x(p.value), dotR + 1.5);
    return { lane, x, swarm, contentH: swarmHeight(swarm, dotR) };
  });
  const { baselines, height } = stackLanes(
    prepared.map((p) => p.contentH),
    { firstTop: TOP, gap: TOP + AXIS + GAP, bottom: AXIS },
  );
  const svg = setupSvg(svgNode, W, height);

  // Lane backgrounds, labels, axes, reference lines.
  prepared.forEach((p, i) => {
    const { lane, x } = p;
    const base = baselines[i];
    const top = base - p.contentH - TOP + 6;
    svg
      .append('rect')
      .attr('x', 0)
      .attr('y', top)
      .attr('width', W)
      .attr('height', base - top + 8)
      .attr('rx', 14)
      .style('fill', `color-mix(in srgb, ${lane.color} 7%, white)`);
    svg
      .append('text')
      .attr('x', 14)
      .attr('y', top + 18)
      .style('font-size', '12px')
      .style('font-weight', 700)
      .style('fill', lane.color)
      .text(lane.label);
    for (const ref of lane.refs ?? []) {
      const rx = x(ref.value);
      drawVRef(svg, rx, top + 22, base, ref.label, ref.color ?? theme.gold, {
        anchor: labelAnchor(rx, W, 80),
        labelY: top + 18,
      });
    }
    // axis under the lane
    svg
      .append('line')
      .attr('x1', ML)
      .attr('x2', W - MR)
      .attr('y1', base + 4)
      .attr('y2', base + 4)
      .style('stroke', 'var(--ink)')
      .style('stroke-width', 1.2);
    const tickValues = lane.ticks ?? x.ticks(5);
    for (const v of tickValues) {
      svg
        .append('line')
        .attr('x1', x(v))
        .attr('x2', x(v))
        .attr('y1', base + 4)
        .attr('y2', base + 9)
        .style('stroke', 'var(--ink-faint)');
      svg
        .append('text')
        .attr('x', x(v))
        .attr('y', base + 21)
        .attr('text-anchor', 'middle')
        .style('font-size', '10.5px')
        .style('fill', 'var(--ink-faint)')
        .text((lane.format ?? ((n) => n))(v));
    }
  });

  // Where each dot sits (needed by the links, drawn first so dots overlay them).
  const placed = prepared.map((p, i) =>
    p.swarm.map((s) => ({
      ...s.data,
      cx: s.x,
      cy: baselines[i] - dotR - 2 - s.y,
      color: p.lane.color,
    })),
  );

  if (links) {
    for (let i = 0; i < placed.length - 1; i++) {
      const next = new Map(placed[i + 1].map((pt) => [pt.id, pt]));
      const lines = placed[i]
        .filter((pt) => pt.id !== undefined && next.has(pt.id))
        .map((pt) => ({ from: pt, to: next.get(pt.id) }));
      svg
        .selectAll(null)
        .data(lines)
        .join('line')
        .attr('class', 'swarm-link')
        .attr('x1', (d) => d.from.cx)
        .attr('y1', (d) => d.from.cy)
        .attr('x2', (d) => d.to.cx)
        .attr('y2', (d) => d.to.cy)
        .style('stroke', 'var(--ink-faint)')
        .style('stroke-width', 1)
        .style('opacity', 0.32);
    }
  }

  placed.forEach((points) => {
    const dots = svg
      .selectAll(null)
      .data(points)
      .join('circle')
      .attr('class', 'answer-dot')
      .attr('cx', (d) => d.cx)
      .attr('cy', (d) => d.cy)
      .attr('r', 0)
      .style('fill', (d) => d.color)
      .style('fill-opacity', 0.9)
      .style('stroke', 'var(--white)')
      .style('stroke-width', 1.4);
    popIn(dots, dotR);
    const nodes = dots.nodes();
    points.forEach((pt, i) => {
      addDotTip(nodes[i], pt.cx, pt.cy, dotR, () => pt.tip);
    });
  });
}

// Height helper for callers/tests: how tall would this data draw?
export function swarmChartHeight(lanes, dotR = DOT_R) {
  const heights = lanes.map((lane) => {
    const x = d3
      .scaleLinear()
      .domain(lane.domain)
      .range([ML, W - MR]);
    return swarmHeight(
      dodge(lane.points, (p) => x(p.value), dotR + 1.5),
      dotR,
    );
  });
  return stackLanes(heights, { firstTop: TOP, gap: TOP + AXIS + GAP, bottom: AXIS }).height;
}

export { svgEl };
