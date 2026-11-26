/** nextWisp: fixed-draw spawn stream. Color / speed interpret t and occupied. */

import {
  WISP_R,
  MIN_SPAWN_SEP,
  POS_CANDIDATES,
  WANDER_AMP_MIN,
  WANDER_AMP_MAX,
  WANDER_FREQ_MIN,
  WANDER_FREQ_MAX,
  CLUSTER_DIST_MAX,
  TTL_MIN,
  TTL_MAX,
  COLOR_FLOOR,
  STACK_TARGET,
  bandAtT,
  fieldBoundsFor,
} from "./constants.mjs";
import { rngStep, rngRange } from "./rng.mjs";

function liveOccupied(occupied) {
  const out = [];
  if (!occupied) return out;
  for (const w of occupied) {
    if (w && w.phase !== "exit") out.push(w);
  }
  return out;
}

function colorCounts(live, nColors) {
  const counts = Array(nColors).fill(0);
  for (const w of live) {
    if ((w.color | 0) >= 0 && w.color < nColors) counts[w.color] += 1;
  }
  return counts;
}

/**
 * Keep every color at a floor of 3, then grow one color toward a 7-stack
 * so a burst chain is often on the field.
 */
function pickColor(counts, nColors, colorRoll, attractColor) {
  const idxs = [];
  for (let i = 0; i < nColors; i++) idxs.push(i);
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(colorRoll * list.length))];

  const belowFloor = idxs.filter((i) => counts[i] < COLOR_FLOOR);
  if (belowFloor.length > 0) return pick(belowFloor);

  if (
    attractColor != null &&
    attractColor >= 0 &&
    attractColor < nColors &&
    counts[attractColor] < STACK_TARGET + 2
  ) {
    return attractColor;
  }

  const maxC = Math.max(0, ...counts);
  if (maxC < STACK_TARGET) {
    const leaders = idxs.filter((i) => counts[i] === maxC);
    return pick(leaders);
  }

  const needy = idxs.filter((i) => counts[i] < 5);
  return pick(needy.length > 0 ? needy : idxs);
}

function inBounds(x, y, b) {
  return x >= b.xMin && x <= b.xMax && y >= b.yMin && y <= b.yMax;
}

function minDist(x, y, live) {
  let best = Infinity;
  for (const w of live) {
    const d = Math.hypot(x - w.x, y - w.y);
    if (d < best) best = d;
  }
  return best;
}

function nearestAnchorDist(x, y, anchors) {
  let best = Infinity;
  for (const w of anchors) {
    const d = Math.hypot(x - w.x, y - w.y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Next wisp in the deterministic stream.
 * Always consumes a fixed number of RNG draws so the stream stays aligned.
 * Speed is scaled by the current time band; color prefers a 7-stack after a floor of 3.
 *
 * @param {number} rngState uint32
 * @param {number} t elapsed run seconds
 * @param {Array<{x:number,y:number,color?:number,phase?:string}>} occupied
 * @param {{ x:number, y:number, color:number } | null} [attract]
 * @returns {{ wisp: object, rngState: number }}
 */
export function nextWisp(rngState, t, occupied, attract = null) {
  const band = bandAtT(t);
  const live = liveOccupied(occupied);
  const nColors = band.colors;
  const bounds = fieldBoundsFor(WISP_R);
  let a = rngState >>> 0;

  const colorRoll = rngStep(a);
  a = colorRoll.a;
  const clusterRoll = rngStep(a);
  a = clusterRoll.a;
  const anchorRoll = rngStep(a);
  a = anchorRoll.a;
  const clusterAng = rngRange(a, 0, Math.PI * 2);
  a = clusterAng.a;
  const clusterDist = rngRange(a, MIN_SPAWN_SEP, CLUSTER_DIST_MAX);
  a = clusterDist.a;

  const candidates = [];
  for (let i = 0; i < POS_CANDIDATES; i++) {
    const xr = rngRange(a, bounds.xMin, bounds.xMax);
    a = xr.a;
    const yr = rngRange(a, bounds.yMin, bounds.yMax);
    a = yr.a;
    candidates.push({ x: xr.value, y: yr.value });
  }

  const speedRoll = rngRange(a, band.speedMin, band.speedMax);
  a = speedRoll.a;
  const angleRoll = rngRange(a, 0, Math.PI * 2);
  a = angleRoll.a;
  const ampRoll = rngRange(a, WANDER_AMP_MIN, WANDER_AMP_MAX);
  a = ampRoll.a;
  const freqRoll = rngRange(a, WANDER_FREQ_MIN, WANDER_FREQ_MAX);
  a = freqRoll.a;
  const phaseRoll = rngRange(a, 0, Math.PI * 2);
  a = phaseRoll.a;
  const ttlRoll = rngRange(a, TTL_MIN, TTL_MAX);
  a = ttlRoll.a;

  const counts = colorCounts(live, nColors);
  const attractColor = attract && Number.isFinite(attract.color) ? attract.color | 0 : null;
  const color = pickColor(counts, nColors, colorRoll.value, attractColor);

  let chosen = null;
  let fallback = candidates[0];
  let fallbackSep = minDist(fallback.x, fallback.y, live);

  const consider = (px, py) => {
    if (!inBounds(px, py, bounds)) return;
    const sep = minDist(px, py, live);
    if (sep >= MIN_SPAWN_SEP && chosen == null) chosen = { x: px, y: py };
    if (sep > fallbackSep) {
      fallback = { x: px, y: py };
      fallbackSep = sep;
    }
  };

  const wantCluster = clusterRoll.value < band.cluster;
  const anchors = live.filter((w) => w.color === color);
  if (attract && attract.color === color && Number.isFinite(attract.x) && Number.isFinite(attract.y)) {
    anchors.push({ x: attract.x, y: attract.y, color });
  }

  if (wantCluster && anchors.length > 0) {
    const idx = Math.min(anchors.length - 1, Math.floor(anchorRoll.value * anchors.length));
    const anchor = anchors[idx];
    consider(
      anchor.x + Math.cos(clusterAng.value) * clusterDist.value,
      anchor.y + Math.sin(clusterAng.value) * clusterDist.value,
    );
    if (chosen == null) {
      let best = null;
      let bestAnchorD = Infinity;
      for (const c of candidates) {
        if (!inBounds(c.x, c.y, bounds)) continue;
        const sep = minDist(c.x, c.y, live);
        if (sep < MIN_SPAWN_SEP) continue;
        const ad = nearestAnchorDist(c.x, c.y, anchors);
        if (ad <= CLUSTER_DIST_MAX && ad < bestAnchorD) {
          best = c;
          bestAnchorD = ad;
        }
      }
      if (best) chosen = best;
    }
  }
  for (const c of candidates) consider(c.x, c.y);

  const pos = chosen || fallback;
  const speed = speedRoll.value;
  let ang = angleRoll.value;
  if (wantCluster && anchors.length > 0) {
    const idx = Math.min(anchors.length - 1, Math.floor(anchorRoll.value * anchors.length));
    const anchor = anchors[idx];
    if (anchor && Number.isFinite(anchor.vx) && Number.isFinite(anchor.vy)) {
      const base = Math.atan2(anchor.vy, anchor.vx);
      ang = base + (angleRoll.value - Math.PI) * 0.28;
    }
  }
  const wisp = {
    id: -1,
    x: pos.x,
    y: pos.y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    color,
    r: WISP_R,
    wander: { amp: ampRoll.value, freq: freqRoll.value, phase: phaseRoll.value },
    phase: "enter",
    life: 0,
    ttl: ttlRoll.value,
  };
  return { wisp, rngState: a >>> 0 };
}
