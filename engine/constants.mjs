/** Dimensions, bands, scoring, colors, and storage keys. Y is down. */

export const VIEW_W = 360;
export const VIEW_H = 640;

export const FIELD_PAD_X = 20;
export const FIELD_PAD_TOP = 56;
export const FIELD_PAD_BOTTOM = 24;
export const FIELD_LEFT = FIELD_PAD_X;
export const FIELD_RIGHT = VIEW_W - FIELD_PAD_X;
export const FIELD_TOP = FIELD_PAD_TOP;
export const FIELD_BOTTOM = VIEW_H - FIELD_PAD_BOTTOM;
export const FIELD_W = FIELD_RIGHT - FIELD_LEFT;
export const FIELD_H = FIELD_BOTTOM - FIELD_TOP;

export const WISP_R = 17;
export const GRAB_SLOP = 8;
export const GRAB_RADIUS = WISP_R + GRAB_SLOP;
export const LINK_DIST = 128;
export const MIN_SPAWN_SEP = 36;

export const POP_MAX = 22;
export const RUN_TIME = 60;
export const FIXED_DT = 1 / 60;
export const MAX_DT = 0.05;

export const CLEAR_MIN = 3;
export const BURST_MIN = 7;
export const BURST_RADIUS = 92;
export const BURST_BONUS = 30;

export const COMBO_WINDOW = 1.2;
export const COMBO_MAX = 8;

/** Fade durations for enter / exit / effects (seconds). Not gameplay-critical. */
export const ENTER_TIME = 0.2;
export const EXIT_TIME = 0.25;
export const EFFECT_LIFE = 0.45;

export const STORAGE_BEST = "onibi-tsunagi:bestScore";
export const STORAGE_DAILY_PREFIX = "onibi-tsunagi:daily:";
export const SEED_PREFIX = "onibi-tsunagi:";

export const RED_COLOR = 4;
export const COLOR_COUNT_EARLY = 4;
export const COLOR_COUNT_LATE = 5;
export const RED_UNLOCK_T = 28;

/** Marks are for color-vision support (render). */
export const COLORS = [
  { id: 0, name: "青", fill: "#6ec8ff", mark: "dot" },
  { id: 1, name: "緑", fill: "#7dffb0", mark: "vline" },
  { id: 2, name: "紫", fill: "#c59bff", mark: "diamond" },
  { id: 3, name: "金", fill: "#ffd56a", mark: "hline" },
  { id: 4, name: "紅", fill: "#ff8a9b", mark: "triangle" },
];

/**
 * Difficulty bands by elapsed run time t (seconds).
 * cluster is the chance to try placing near a same-color wisp.
 */
export const BANDS = [
  { upTo: 12, pop: 12, colors: 4, speedMin: 24, speedMax: 40, cluster: 0.8 },
  { upTo: 28, pop: 14, colors: 4, speedMin: 38, speedMax: 58, cluster: 0.4 },
  { upTo: 44, pop: 16, colors: 5, speedMin: 52, speedMax: 76, cluster: 0.15 },
  { upTo: Infinity, pop: 18, colors: 5, speedMin: 64, speedMax: 92, cluster: 0.1 },
];

export const POS_CANDIDATES = 8;
export const WANDER_AMP_MIN = 8;
export const WANDER_AMP_MAX = 18;
export const WANDER_FREQ_MIN = 0.7 * Math.PI * 2;
export const WANDER_FREQ_MAX = 1.5 * Math.PI * 2;
export const CLUSTER_DIST_MAX = 90;

export function bandAtT(t) {
  const x = Number(t) || 0;
  for (const b of BANDS) if (x < b.upTo) return b;
  return BANDS[BANDS.length - 1];
}

/** Base points for a cleared chain of length n: 20 × n × (n − 2). */
export function baseScore(n) {
  return 20 * n * (n - 2);
}

export function fieldBoundsFor(r) {
  return {
    xMin: FIELD_LEFT + r,
    xMax: FIELD_RIGHT - r,
    yMin: FIELD_TOP + r,
    yMax: FIELD_BOTTOM - r,
  };
}

export function seedString(dateJst) {
  return SEED_PREFIX + dateJst;
}

export const PALETTE = {
  sky: ["#070b16", "#12182c", "#1a2038"],
  stone: ["#2a3148", "#3d4560", "#5c657e"],
  mist: "#8a9bb8",
  cream: ["#f4ead0", "#fff8e6"],
};
