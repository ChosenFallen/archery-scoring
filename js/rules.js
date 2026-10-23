// Scoring rules for indoor rounds.
// World Archery 40cm faces: 10 rings, each 2cm wide. The inner 10 (X) ring is 2cm across.

export const ROUNDS = {
  wa18: { id: 'wa18', name: 'World Archery 18m', distance: '18m', ends: 20, arrowsPerEnd: 3, halves: 2 },
};

export const BOWS = { recurve: 'Recurve', compound: 'Compound', barebow: 'Barebow' };
export const FACES = { full40: '40cm full face', triple40: '40cm triple spot' };

export const X_RADIUS = 1;
export const ringOuter = n => (11 - n) * 2;

// Compound archers only score 10 inside the inner ring, so there is no separate X count.
export const hasX = bow => bow !== 'compound';
export const lowestRing = face => (face === 'triple40' ? 6 : 1);

export function allowedLabels(bow, face) {
  const labels = hasX(bow) ? ['X'] : [];
  for (let n = 10; n >= lowestRing(face); n--) labels.push(String(n));
  labels.push('M');
  return labels;
}

export function arrowValue(label) {
  if (label === 'X') return 10;
  if (label === 'M' || label == null) return 0;
  return Number(label);
}

const sortKey = label => (label === 'X' ? 11 : arrowValue(label));
export const sortArrows = arrows => [...arrows].sort((a, b) => sortKey(b.v) - sortKey(a.v));

// Score for an arrow whose centre is distCm from the spot centre.
// An arrow touching a line scores the higher ring, so the arrow's radius is subtracted first.
export function scoreAtDistance(bow, face, distCm, arrowDiameterMm) {
  const eff = distCm - arrowDiameterMm / 20;
  if (bow === 'compound') {
    if (eff <= X_RADIUS) return '10';
    if (eff <= ringOuter(9)) return '9';
  } else {
    if (eff <= X_RADIUS) return 'X';
    if (eff <= ringOuter(10)) return '10';
  }
  for (let n = 9; n >= lowestRing(face); n--) {
    if (eff <= ringOuter(n)) return String(n);
  }
  return 'M';
}

// The range of distances (arrow edge from centre, in cm) that score `label`, as
// [low, high] where low is exclusive and high inclusive. Null if the label can't be scored.
export function scoreBand(bow, face, label) {
  const lowest = lowestRing(face);
  if (label === 'M') return [ringOuter(lowest), Infinity];
  if (label === (bow === 'compound' ? '10' : 'X')) return [-Infinity, X_RADIUS];
  if (label === '10') return [X_RADIUS, ringOuter(10)];
  const n = Number(label);
  // Compound's 9 includes the outer part of the 10 ring.
  if (bow === 'compound' && n === 9) return [X_RADIUS, ringOuter(9)];
  if (!(n >= lowest && n <= 9)) return null;
  return [ringOuter(n + 1), ringOuter(n)];
}

export function labelClass(label) {
  if (label === 'X' || label === '10' || label === '9') return 'z-gold';
  if (label === '8' || label === '7') return 'z-red';
  if (label === '6' || label === '5') return 'z-blue';
  if (label === '4' || label === '3') return 'z-black';
  if (label === '2' || label === '1') return 'z-white';
  return 'z-miss';
}

export function rulesHint(bow, face) {
  const parts = [];
  if (bow === 'compound') parts.push('Compound: only the small inner ring scores 10. The rest of the 10 ring counts as 9.');
  else parts.push(`${BOWS[bow]}: the whole 10 ring scores 10. The inner ring is recorded as X (10 points, used for tie-breaks).`);
  if (face === 'triple40') parts.push('Triple spot: only rings 10 to 6 score. Outside the 6 ring is a miss (M).');
  else parts.push('Full face: rings 10 to 1 score. Off the face is a miss (M).');
  parts.push('An arrow touching a line scores the higher ring.');
  return parts;
}

// Rounds from before multiple archers existed have no archerId and belong to "me".
export const archerOf = r => r.archerId || 'me';
// Personal bests and stats are kept separately for each archer, round, bow and face.
export const configKey = r => `${archerOf(r)}|${r.type}|${r.bow}|${r.face}`;
export const describeConfig = r => `${BOWS[r.bow]} · ${FACES[r.face]}`;

export function roundStats(round) {
  const tpl = ROUNDS[round.type];
  const perHalf = tpl.ends / tpl.halves;
  let total = 0, tens = 0, xs = 0, arrows = 0, misses = 0;
  const endTotals = [], running = [], halfTotals = new Array(tpl.halves).fill(0);
  round.ends.forEach((end, i) => {
    let t = 0;
    for (const a of end) {
      t += arrowValue(a.v);
      arrows++;
      if (a.v === 'X') { xs++; tens++; }
      else if (a.v === '10') tens++;
      else if (a.v === 'M') misses++;
    }
    total += t;
    endTotals.push(t);
    running.push(total);
    const h = Math.min(Math.floor(i / perHalf), tpl.halves - 1);
    halfTotals[h] += t;
  });
  const maxArrows = tpl.ends * tpl.arrowsPerEnd;
  return {
    total, tens, xs, arrows, misses, endTotals, running, halfTotals,
    avg: arrows ? total / arrows : 0,
    maxArrows,
    maxScore: maxArrows * 10,
    complete: arrows >= maxArrows,
  };
}

// Ranking order: total, then number of 10s, then number of Xs.
export function compareScores(a, b) {
  return (b.total - a.total) || (b.tens - a.tens) || (b.xs - a.xs);
}
