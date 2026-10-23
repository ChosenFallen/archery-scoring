// Target face drawing (SVG, units are centimetres) and hit testing.

import { ringOuter, lowestRing, X_RADIUS, scoreAtDistance } from './rules.js';

const RING_FILL = {
  1: '#ffffff', 2: '#ffffff', 3: '#1d1d1f', 4: '#1d1d1f', 5: '#14a0d8',
  6: '#14a0d8', 7: '#e8343c', 8: '#e8343c', 9: '#ffe047', 10: '#ffe047',
};

// Vertical triple spot: three spots stacked, centres 22cm apart.
const TRIPLE_GAP = 22;

export function geometry(face) {
  if (face === 'triple40') {
    return { spots: [{ x: 0, y: -TRIPLE_GAP }, { x: 0, y: 0 }, { x: 0, y: TRIPLE_GAP }], viewBox: [-12, -34, 24, 68] };
  }
  return { spots: [{ x: 0, y: 0 }], viewBox: [-21.5, -21.5, 43, 43] };
}

function spotSVG(cx, cy, lowest) {
  let s = '';
  for (let n = lowest; n <= 10; n++) {
    // The line inside the black zone is white; all other lines are black.
    const stroke = n === 4 ? '#ffffff' : '#111111';
    s += `<circle cx="${cx}" cy="${cy}" r="${ringOuter(n)}" fill="${RING_FILL[n]}" stroke="${stroke}" stroke-width="0.05"/>`;
  }
  s += `<circle cx="${cx}" cy="${cy}" r="${X_RADIUS}" fill="none" stroke="#111111" stroke-width="0.04"/>`;
  s += `<path d="M${cx - 0.25} ${cy}h0.5M${cx} ${cy - 0.25}v0.5" stroke="#111111" stroke-width="0.04"/>`;
  return s;
}

function svgOpen(viewBox, attrs = '') {
  const [x, y, w, h] = viewBox;
  return `<svg class="face" ${attrs} viewBox="${x} ${y} ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect class="boss" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`;
}

export function faceSVG(face, content = '', attrs = '') {
  const g = geometry(face);
  return svgOpen(g.viewBox, attrs) + g.spots.map(p => spotSVG(p.x, p.y, lowestRing(face))).join('') + content + '</svg>';
}

// A single spot with every arrow overlaid on it. Used for grouping plots, and for plotting
// on the triple spot, where one large spot is far easier to tap accurately than three small ones.
export function singleSpotSVG(face, content = '', attrs = '') {
  const lowest = lowestRing(face);
  const r = ringOuter(lowest) + 1;
  return svgOpen([-r, -r, r * 2, r * 2], attrs) + spotSVG(0, 0, lowest) + content + '</svg>';
}

export function hitTest(face, bow, x, y, arrowDiameterMm, single = false) {
  const spots = single ? [{ x: 0, y: 0 }] : geometry(face).spots;
  let s = 0, dist = Infinity;
  spots.forEach((p, i) => {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < dist) { dist = d; s = i; }
  });
  const p = spots[s];
  return {
    v: scoreAtDistance(bow, face, dist, arrowDiameterMm),
    x: Math.round((x - p.x) * 100) / 100,
    y: Math.round((y - p.y) * 100) / 100,
    s,
  };
}

const hasPos = a => typeof a.x === 'number' && typeof a.y === 'number';
export const plotted = arrows => arrows.filter(hasPos);

// Marker for an arrow on the full face (positions are stored relative to their spot).
export function markerSVG(face, a, { label = '', cls = 'mk', r = 0.7, single = false } = {}) {
  if (!hasPos(a)) return '';
  const p = single ? { x: 0, y: 0 } : geometry(face).spots[a.s || 0] || { x: 0, y: 0 };
  const x = p.x + a.x, y = p.y + a.y;
  // Labels sit beside the marker so the marker itself can be drawn at true arrow size.
  const text = label ? `<text x="${x + r + 0.25}" y="${y - r - 0.15}" font-size="1.5">${label}</text>` : '';
  return `<g class="${cls}"><circle cx="${x}" cy="${y}" r="${r}"/>${text}</g>`;
}

export function groupCentre(arrows) {
  const pts = plotted(arrows);
  if (!pts.length) return null;
  return {
    x: pts.reduce((t, a) => t + a.x, 0) / pts.length,
    y: pts.reduce((t, a) => t + a.y, 0) / pts.length,
    n: pts.length,
  };
}

export function centreSVG(c) {
  if (!c) return '';
  return `<path class="centre" d="M${c.x - 1.2} ${c.y}h2.4M${c.x} ${c.y - 1.2}v2.4"/>`;
}

export function describeOffset(c) {
  if (!c) return '';
  const fmt = v => `${Math.abs(v).toFixed(1)}cm`;
  const parts = [];
  if (Math.abs(c.y) >= 0.3) parts.push(`${fmt(c.y)} ${c.y < 0 ? 'high' : 'low'}`);
  if (Math.abs(c.x) >= 0.3) parts.push(`${fmt(c.x)} ${c.x < 0 ? 'left' : 'right'}`);
  return parts.length ? `Group centre is ${parts.join(' and ')}.` : 'Group centre is right in the middle.';
}
