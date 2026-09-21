/* =========================================================
   SCATTER — two numbers per person, with guide lines
   =========================================================
   Ошибка планирования: best-case plan (x) vs what it really took (y), with the
   "on plan" diagonal (y = x) and a 1.5× "overrun" line.
   Ультиматум: the offer (x) vs the least the responder would accept (y); the y = x
   diagonal separates deals (below it) from rejections (above it).

     drawScatter(svg, { points: [{ x, y, color, tip }], xDomain, yDomain, xLabel,
                        yLabel, guides: [{ slope, label, color, dash }],
                        legend?: [{ label, color }], format?, theme })
========================================================= */
import * as d3 from 'd3';
import { addDotTip, popIn, setupSvg } from './kit.js';

const W = 640;
const H = 400;
const ML = 54;
const MR = 20;
const MT = 30;
const MB = 46;

export function drawScatter(
  svgNode,
  { points, xDomain, yDomain, xLabel, yLabel, guides = [], legend = [], format = (v) => v },
) {
  const svg = setupSvg(svgNode, W, H);
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;
  const x = d3
    .scaleLinear()
    .domain(xDomain)
    .range([ML, ML + plotW]);
  const y = d3
    .scaleLinear()
    .domain(yDomain)
    .range([MT + plotH, MT]);

  // grid + axes
  for (const v of y.ticks(5)) {
    svg
      .append('line')
      .attr('x1', ML)
      .attr('x2', ML + plotW)
      .attr('y1', y(v))
      .attr('y2', y(v))
      .style('stroke', 'var(--line)');
    svg
      .append('text')
      .attr('x', ML - 8)
      .attr('y', y(v) + 4)
      .attr('text-anchor', 'end')
      .style('font-size', '10.5px')
      .style('fill', 'var(--ink-faint)')
      .text(format(v));
  }
  for (const v of x.ticks(5)) {
    svg
      .append('line')
      .attr('x1', x(v))
      .attr('x2', x(v))
      .attr('y1', MT)
      .attr('y2', MT + plotH)
      .style('stroke', 'var(--line)');
    svg
      .append('text')
      .attr('x', x(v))
      .attr('y', MT + plotH + 18)
      .attr('text-anchor', 'middle')
      .style('font-size', '10.5px')
      .style('fill', 'var(--ink-faint)')
      .text(format(v));
  }
  svg
    .append('line')
    .attr('x1', ML)
    .attr('x2', ML)
    .attr('y1', MT)
    .attr('y2', MT + plotH)
    .style('stroke', 'var(--ink)')
    .style('stroke-width', 1.2);
  svg
    .append('line')
    .attr('x1', ML)
    .attr('x2', ML + plotW)
    .attr('y1', MT + plotH)
    .attr('y2', MT + plotH)
    .style('stroke', 'var(--ink)')
    .style('stroke-width', 1.2);
  svg
    .append('text')
    .attr('x', ML + plotW / 2)
    .attr('y', H - 6)
    .attr('text-anchor', 'middle')
    .style('font-size', '11.5px')
    .style('font-weight', 600)
    .style('fill', 'var(--ink-soft)')
    .text(xLabel);
  svg
    .append('text')
    .attr('x', 14)
    .attr('y', MT + plotH / 2)
    .attr('text-anchor', 'middle')
    .attr('transform', `rotate(-90 14 ${MT + plotH / 2})`)
    .style('font-size', '11.5px')
    .style('font-weight', 600)
    .style('fill', 'var(--ink-soft)')
    .text(yLabel);

  // guide lines y = slope·x, clipped to the plot box
  for (const g of guides) {
    const xEnd = Math.min(xDomain[1], yDomain[1] / g.slope);
    svg
      .append('line')
      .attr('x1', x(0))
      .attr('y1', y(0))
      .attr('x2', x(xEnd))
      .attr('y2', y(xEnd * g.slope))
      .style('stroke', g.color)
      .style('stroke-width', 1.6)
      .style('stroke-dasharray', g.dash ?? '6,4')
      .style('opacity', 0.85);
    svg
      .append('text')
      .attr('x', x(xEnd) - 6)
      .attr('y', y(xEnd * g.slope) + (g.slope >= 1 ? 14 : -6))
      .attr('text-anchor', 'end')
      .style('font-size', '10.5px')
      .style('font-weight', 700)
      .style('fill', g.color)
      .text(g.label);
  }

  const dots = svg
    .selectAll(null)
    .data(points)
    .join('circle')
    .attr('class', 'answer-dot')
    .attr('cx', (d) => x(d.x))
    .attr('cy', (d) => y(d.y))
    .attr('r', 0)
    .style('fill', (d) => d.color)
    .style('fill-opacity', 0.88)
    .style('stroke', 'var(--white)')
    .style('stroke-width', 1.4);
  popIn(dots, 6.5, 22);
  const nodes = dots.nodes();
  points.forEach((p, i) => {
    addDotTip(nodes[i], x(p.x), y(p.y), 6.5, () => p.tip);
  });

  legend.forEach((item, i) => {
    const lx = ML + 8 + i * 170;
    svg.append('circle').attr('cx', lx).attr('cy', 12).attr('r', 5).style('fill', item.color);
    svg
      .append('text')
      .attr('x', lx + 10)
      .attr('y', 16)
      .style('font-size', '11.5px')
      .style('fill', 'var(--ink-soft)')
      .text(item.label);
  });
}
