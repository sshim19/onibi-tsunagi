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

/**
 * Next wisp in the deterministic stream.
 * Always consumes a fixed number of RNG draws so the stream stays aligned.
 * Speed is scaled by the current time band; color prefers undersupplied colors.
 *
 * @param {number} rngState uint32
 * @param {number} t elapsed run seconds
 * @param {Array<{x:number,y:number,color?:number,phase?:string}>} occupied
 * @returns {{ wisp: object, rngState: number }}
 */
export function nextWisp(rngState, t, occupied) {
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

  const counts = colorCounts(live, nColors);
  const needy = [];
  for (let i = 0; i < nColors; i++) if (counts[i] < 3) needy.push(i);
  const palette = needy.length > 0 ? needy : Array.from({ length: nColors }, (_, i) => i);
  const color = palette[Math.min(palette.length - 1, Math.floor(colorRoll.value * palette.length))];

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

  if (clusterRoll.value < band.cluster) {
    const anchors = live.filter((w) => w.color === color);
    if (anchors.length > 0) {
      const idx = Math.min(anchors.length - 1, Math.floor(anchorRoll.value * anchors.length));
      const anchor = anchors[idx];
      consider(
        anchor.x + Math.cos(clusterAng.value) * clusterDist.value,
        anchor.y + Math.sin(clusterAng.value) * clusterDist.value
      );
    }
  }
  for (const c of candidates) consider(c.x, c.y);

  const pos = chosen || fallback;
  const speed = speedRoll.value;
  const ang = angleRoll.value;
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
  };
  return { wisp, rngState: a >>> 0 };
}
