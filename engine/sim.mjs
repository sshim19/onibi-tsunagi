/** tick(state, input, dt) → state. Move, spawn, chain, score, time. No DOM. */

import {
  FIXED_DT,
  MAX_DT,
  RUN_TIME,
  POP_MAX,
  GRAB_RADIUS,
  BURST_RADIUS,
  BURST_BONUS,
  COMBO_WINDOW,
  COMBO_MAX,
  ENTER_TIME,
  EXIT_TIME,
  EFFECT_LIFE,
  CLEAR_MIN,
  bandAtT,
  baseScore,
  fieldBoundsFor,
} from "./constants.mjs";
import { hashSeed } from "./rng.mjs";
import { nextWisp } from "./spawn.mjs";
import { hitsAlongSegment, tryAddWisp, tryUndoLast, resolveRelease } from "./chain.mjs";

function cloneState(s) {
  return {
    ...s,
    pointer: { ...s.pointer },
    chain: { color: s.chain.color, ids: s.chain.ids.slice(), broke: s.chain.broke },
    wisps: s.wisps.map((w) => ({ ...w, wander: { ...w.wander } })),
    effects: s.effects.map((e) => ({ ...e })),
  };
}

function liveWisps(wisps) {
  return wisps.filter((w) => w.phase !== "exit");
}

function wanderVel(w, t) {
  const s = Math.sin(w.wander.freq * t + w.wander.phase);
  const sp = Math.hypot(w.vx, w.vy) || 1;
  const nx = -w.vy / sp;
  const ny = w.vx / sp;
  return { wx: nx * w.wander.amp * s, wy: ny * w.wander.amp * s };
}

function moveWisp(w, t, dt) {
  const { wx, wy } = wanderVel(w, t);
  w.x += (w.vx + wx) * dt;
  w.y += (w.vy + wy) * dt;
  const b = fieldBoundsFor(w.r);
  if (w.x < b.xMin) {
    w.x = b.xMin;
    w.vx = Math.abs(w.vx);
  } else if (w.x > b.xMax) {
    w.x = b.xMax;
    w.vx = -Math.abs(w.vx);
  }
  if (w.y < b.yMin) {
    w.y = b.yMin;
    w.vy = Math.abs(w.vy);
  } else if (w.y > b.yMax) {
    w.y = b.yMax;
    w.vy = -Math.abs(w.vy);
  }
}

function updateFades(state, dt) {
  for (const w of state.wisps) {
    if (w.phase === "enter") {
      w.life = Math.min(1, w.life + dt / ENTER_TIME);
      if (w.life >= 1) {
        w.phase = "live";
        w.life = 1;
      }
    } else if (w.phase === "exit") {
      w.life = Math.max(0, w.life - dt / EXIT_TIME);
    }
  }
  state.wisps = state.wisps.filter((w) => w.phase !== "exit" || w.life > 0);
  for (const e of state.effects) {
    e.life = Math.max(0, e.life - dt / EFFECT_LIFE);
  }
  state.effects = state.effects.filter((e) => e.life > 0);
}

function stepPhysics(state, dt) {
  for (const w of state.wisps) moveWisp(w, state.t, dt);
  updateFades(state, dt);
  state.t += dt;
  state.timeLeft = Math.max(0, RUN_TIME - state.t);
  if (state.timeLeft < 1e-9) state.timeLeft = 0;
  state.comboT = Math.max(0, state.comboT - dt);
  if (state.comboT === 0) state.combo = 1;
}

function lastInChain(state) {
  const id = state.chain.ids[state.chain.ids.length - 1];
  if (id == null) return null;
  return state.wisps.find((w) => w.id === id) || null;
}

function processHits(state, ax, ay, bx, by) {
  let hits = hitsAlongSegment(state.wisps, ax, ay, bx, by, GRAB_RADIUS);
  const chained = state.chain.ids.length > 0 && state.chain.color != null;
  if (chained) {
    const prevId = state.chain.ids[state.chain.ids.length - 2];
    // Other colors are ignored; the previous wisp is kept so we can backtrack.
    hits = hits.filter((h) => h.wisp.color === state.chain.color || h.wisp.id === prevId);
  } else if (hits.length > 1) {
    // Start on the nearest wisp so an overlap does not grab the wrong color.
    hits = hits.slice().sort((a, b) => a.dist - b.dist || a.t - b.t || a.wisp.id - b.wisp.id);
    hits = [hits[0]];
  }

  const pointer = { x: bx, y: by };
  for (const { wisp } of hits) {
    const tail = lastInChain(state);
    const undone = tryUndoLast(state.chain, wisp, pointer, tail);
    if (undone.event === "undo") {
      state.chain = undone.chain;
      continue;
    }
    const { chain, event } = tryAddWisp(state.chain, wisp, tail);
    if (event === "skip") continue;
    state.chain = chain;
  }
}

function applyPointer(state, input) {
  const held = !!input?.held;
  const x = Number(input?.x) || 0;
  const y = Number(input?.y) || 0;
  const wasHeld = !!state.pointer.held;
  const px = state.pointer.x;
  const py = state.pointer.y;

  if (held && !wasHeld) {
    processHits(state, x, y, x, y);
  } else if (held && wasHeld) {
    processHits(state, px, py, x, y);
  } else if (!held && wasHeld) {
    processHits(state, px, py, x, y);
    applyRelease(state);
  }

  state.pointer = { x, y, held };
}

function markExit(state, wisp, type) {
  if (!wisp || wisp.phase === "exit") return;
  wisp.phase = "exit";
  wisp.life = 1;
  state.effects.push({ type, x: wisp.x, y: wisp.y, color: wisp.color, r: wisp.r, life: 1 });
}

function applyRelease(state) {
  const result = resolveRelease(state.chain, state.wisps);
  state.chain = { color: null, ids: [], broke: false };
  if (!result.scored) return;

  if (state.comboT > 0) state.combo = Math.min(COMBO_MAX, state.combo + 1);
  else state.combo = 1;
  state.comboT = COMBO_WINDOW;

  const gained = baseScore(result.n) * state.combo + result.burstIds.length * BURST_BONUS;
  state.score += gained;
  updateBests(state);
  state.hint = false;
  state.lastClearN = result.n;

  if (result.burstIds.length > 0) {
    state.effects.push({
      type: "burst",
      x: result.x,
      y: result.y,
      color: result.color,
      r: BURST_RADIUS,
      life: 1,
    });
  }
  const clearSet = new Set(result.clearedIds.concat(result.burstIds));
  for (const w of state.wisps) {
    if (clearSet.has(w.id)) markExit(state, w, "pop");
  }
}

function updateBests(state) {
  if (state.score <= 0) return;
  if (state.score > state.bestScore) state.bestScore = state.score;
  if (state.score > state.todayBestScore) state.todayBestScore = state.score;
}

function fillPopulation(state) {
  const target = Math.min(bandAtT(state.t).pop, POP_MAX);
  while (liveWisps(state.wisps).length < target) {
    const occupied = liveWisps(state.wisps);
    const { wisp, rngState } = nextWisp(state.rngState, state.t, occupied);
    wisp.id = state.spawnSeq;
    state.spawnSeq += 1;
    state.rngState = rngState;
    state.wisps.push(wisp);
  }
}

/** True when elapsed time has reached 60s, allowing for IEEE rounding. */
function timeIsUp(t) {
  return t + 1e-9 >= RUN_TIME;
}

function endRun(state) {
  if (state.chain.ids.length >= CLEAR_MIN) applyRelease(state);
  else state.chain = { color: null, ids: [], broke: false };
  if (state.t < RUN_TIME) state.t = RUN_TIME;
  state.timeLeft = 0;
  state.status = "over";
  updateBests(state);
}

/**
 * Near-pure: same state+input+dt → same result. Does not mutate state or input.
 * Clamps dt to 50ms and steps physics at 1/60 + remainder.
 */
export function tick(state, input, dt) {
  if (state.status !== "playing") return cloneState(state);
  const s = cloneState(state);
  let left = Math.min(Math.max(Number(dt) || 0, 0), MAX_DT);
  while (left > 0 && s.status === "playing") {
    const stepDt = Math.min(FIXED_DT, left);
    stepPhysics(s, stepDt);
    left -= stepDt;
  }
  applyPointer(s, input);
  if (timeIsUp(s.t)) endRun(s);
  else fillPopulation(s);
  updateBests(s);
  return s;
}

/** Fresh playing state for a run. bestScore / todayBestScore are in-memory; persist elsewhere. */
export function createInitialState({ seed, dateJst, bestScore = 0, todayBestScore = 0 } = {}) {
  return {
    status: "playing",
    seed,
    dateJst: dateJst ?? null,
    t: 0,
    timeLeft: RUN_TIME,
    score: 0,
    combo: 1,
    comboT: 0,
    rngState: hashSeed(seed),
    spawnSeq: 0,
    pointer: { x: 0, y: 0, held: false },
    chain: { color: null, ids: [], broke: false },
    wisps: [],
    effects: [],
    bestScore: bestScore || 0,
    todayBestScore: todayBestScore || 0,
    hint: true,
    lastClearN: 0,
  };
}
