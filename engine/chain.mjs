/** Segment hit tests, chain add / break, release, and burst targeting. */

import { GRAB_RADIUS, LINK_DIST, CLEAR_MIN, BURST_MIN, BURST_RADIUS } from "./constants.mjs";

/** Distance and clamped t in [0, 1] from point (px, py) to segment AB. */
export function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { dist: Math.hypot(px - ax, py - ay), t: 0 };
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return { dist: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

/**
 * Live / entering wisps whose centers come within grabR of segment AB,
 * in order along the segment (then by id).
 */
export function hitsAlongSegment(wisps, ax, ay, bx, by, grabR = GRAB_RADIUS) {
  const hits = [];
  for (const w of wisps) {
    if (!w || w.phase === "exit") continue;
    const { dist, t } = distPointToSegment(w.x, w.y, ax, ay, bx, by);
    if (dist <= grabR) hits.push({ wisp: w, t, dist });
  }
  hits.sort((a, b) => a.t - b.t || a.wisp.id - b.wisp.id);
  return hits;
}

export function canLink(a, b, maxDist = LINK_DIST) {
  if (!a || !b) return false;
  return Math.hypot(a.x - b.x, a.y - b.y) <= maxDist;
}

/**
 * Try to extend chain with wisp.
 * lastWisp is the current tail (needed for the link-distance check).
 * @returns {{ chain: object, event: "start" | "add" | "break" | "skip" }}
 */
export function tryAddWisp(chain, wisp, lastWisp) {
  if (!wisp || wisp.phase === "exit") return { chain, event: "skip" };
  if (chain.ids.includes(wisp.id)) return { chain, event: "skip" };
  if (chain.ids.length === 0 || chain.color == null) {
    return { chain: { color: wisp.color, ids: [wisp.id], broke: false }, event: "start" };
  }
  if (wisp.color !== chain.color) {
    return { chain: { color: null, ids: [], broke: true }, event: "break" };
  }
  if (lastWisp && !canLink(lastWisp, wisp, LINK_DIST)) {
    return { chain, event: "skip" };
  }
  return {
    chain: { color: chain.color, ids: chain.ids.concat(wisp.id), broke: false },
    event: "add",
  };
}

/** Wisps within radius of (cx, cy) that are not in excludeIds and not exiting. */
export function burstTargets(wisps, cx, cy, radius = BURST_RADIUS, excludeIds = new Set()) {
  const out = [];
  for (const w of wisps) {
    if (!w || w.phase === "exit") continue;
    if (excludeIds.has(w.id)) continue;
    if (Math.hypot(w.x - cx, w.y - cy) <= radius) out.push(w);
  }
  return out;
}

/**
 * Outcome of releasing the current chain.
 * Does not mutate chain or wisps.
 */
export function resolveRelease(chain, wisps) {
  const n = chain.ids.length;
  const color = chain.color;
  if (n < CLEAR_MIN) {
    return { scored: false, n, clearedIds: [], burstIds: [], x: 0, y: 0, color };
  }
  const last = wisps.find((w) => w.id === chain.ids[n - 1]);
  const burstIds =
    n >= BURST_MIN && last
      ? burstTargets(wisps, last.x, last.y, BURST_RADIUS, new Set(chain.ids)).map((w) => w.id)
      : [];
  return {
    scored: true,
    n,
    clearedIds: chain.ids.slice(),
    burstIds,
    x: last ? last.x : 0,
    y: last ? last.y : 0,
    color,
  };
}
