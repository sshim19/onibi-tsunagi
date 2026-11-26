/**
 * 鎖の長さ・コンボに応じた演出。エンジンは触らず、state の変化から起こす。
 * 粒子は最大 PARTICLE_CAP。画面揺れは 6px / 250ms 以内。
 */

import { formatScore } from "./share.mjs";
import { COLORS, VIEW_W, VIEW_H } from "../engine/constants.mjs";

export const PARTICLE_CAP = 300;
export const SHAKE_MAX_PX = 6;
export const SHAKE_MAX_S = 0.22;

/** 鎖の長さに対する短い掛け声。大きいほうを優先。 */
export const CALLOUTS = [
  { min: 10, text: "大連鎖！" },
  { min: 7, text: "一気消し！" },
  { min: 5, text: "きれい！" },
];

export function calloutForN(n) {
  const x = Math.floor(Number(n) || 0);
  for (const c of CALLOUTS) if (x >= c.min) return c.text;
  return null;
}

export function comboLabel(combo) {
  const x = Math.floor(Number(combo) || 0);
  return x >= 2 ? `×${x} コンボ` : null;
}

function colorHex(color) {
  const i = Math.max(0, Math.floor(Number(color) || 0));
  return (COLORS[i] || COLORS[0]).fill;
}

function rgba(hex, a) {
  const { r, g, b } = (() => {
    const n = parseInt(String(hex).replace("#", ""), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  })();
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function createFx() {
  return {
    particles: [],
    floats: [],
    rings: [],
    shake: null,
    flash: null,
    badge: 0,
    prev: null,
  };
}

export function resetFx(fx) {
  if (!fx) return;
  fx.particles.length = 0;
  fx.floats.length = 0;
  fx.rings.length = 0;
  fx.shake = null;
  fx.flash = null;
  fx.badge = 0;
  fx.prev = null;
}

function capParticles(fx) {
  const extra = fx.particles.length - PARTICLE_CAP;
  if (extra > 0) fx.particles.splice(0, extra);
}

function addParticle(fx, p) {
  if (fx.particles.length >= PARTICLE_CAP) fx.particles.shift();
  fx.particles.push(p);
}

function sparksPerSource(n, combo) {
  let k = 7 + Math.min(8, Math.max(0, n - 3));
  if (combo >= 2) k += 2;
  if (n >= 7) k += 3;
  if (n >= 10) k += 3;
  return k;
}

function spawnSparks(fx, x, y, color, n, combo, reduced) {
  const count = reduced ? Math.min(4, 2 + Math.floor(n / 3)) : sparksPerSource(n, combo);
  const size = 1.4 + Math.min(2.2, n * 0.12) + (combo > 1 ? 0.25 : 0);
  const speed = 70 + n * 8 + (n >= 7 ? 30 : 0);
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = speed * (0.35 + Math.random() * 0.8);
    addParticle(fx, {
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 40,
      color,
      r: size * (0.6 + Math.random() * 0.8),
      life: 0.35 + Math.random() * 0.35 + (n >= 7 ? 0.08 : 0),
      max: 0,
    });
  }
}

function spawnClear(fx, { n, combo, gained, pops, burst, color, reduced }) {
  const sources = pops.length ? pops : [];
  let cx = 0;
  let cy = 0;
  if (sources.length) {
    for (const p of sources) {
      cx += p.x;
      cy += p.y;
    }
    cx /= sources.length;
    cy /= sources.length;
  } else {
    cx = VIEW_W / 2;
    cy = VIEW_H * 0.42;
  }

  if (sources.length) {
    for (const p of sources) spawnSparks(fx, p.x, p.y, p.color, n, combo, reduced);
  } else {
    spawnSparks(fx, cx, cy, color, n, combo, reduced);
  }

  const scale = n >= 10 ? 1.35 : n >= 7 ? 1.2 : n >= 5 ? 1.08 : 1;
  fx.floats.push({
    kind: "score",
    text: `+${formatScore(gained)}点`,
    x: cx,
    y: cy - 18,
    life: 1.05,
    scale,
    color: n >= 7 ? "#ffd56a" : "#fff8e6",
  });

  const shout = calloutForN(n);
  const comboText = comboLabel(combo);
  if (shout || comboText) {
    fx.floats.push({
      kind: "callout",
      text: shout,
      comboText,
      x: cx,
      y: Math.max(110, cy - 78),
      life: 1.05,
      scale: n >= 10 ? 1.2 : n >= 7 ? 1.08 : 1,
      color: n >= 10 ? "#ffd56a" : "#fff8e6",
    });
  }

  if (!reduced && n >= 7) {
    const amp = burst || n >= 10 ? SHAKE_MAX_PX : 4.2;
    fx.shake = { t: 0, dur: n >= 10 ? SHAKE_MAX_S : 0.18, amp };
    fx.flash = { t: 0, dur: 0.16, alpha: n >= 10 ? 0.22 : 0.16, color: "#fff8e6" };
  }
}

function spawnLink(fx, wisp, reduced) {
  if (!wisp) return;
  fx.rings.push({
    x: wisp.x,
    y: wisp.y,
    color: wisp.color,
    r: wisp.r || 19,
    life: reduced ? 0.16 : 0.28,
  });
  if (!reduced) {
    const color = wisp.color;
    for (let i = 0; i < 5; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 50;
      addParticle(fx, {
        x: wisp.x,
        y: wisp.y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 20,
        color,
        r: 1.2 + Math.random(),
        life: 0.22 + Math.random() * 0.12,
        max: 0,
      });
    }
  }
}

function findWisp(state, id) {
  const wisps = state?.wisps || [];
  for (const w of wisps) if (w && w.id === id) return w;
  return null;
}

/**
 * state の差分を見て演出を起こし、既存の粒子を進める。
 * @param {object} fx
 * @param {object} state
 * @param {number} dt
 * @param {{ reducedMotion?: boolean }} [opts]
 */
export function syncFx(fx, state, dt, opts = {}) {
  if (!fx) return;
  const reduced = !!opts.reducedMotion;
  const t = Math.min(Math.max(Number(dt) || 0, 0), 0.05);
  const prev = fx.prev;

  if (state?.status === "playing" || state?.status === "over") {
    const ids = state.chain?.ids || [];
    const prevIds = prev?.chainIds || [];
    const held = !!state.pointer?.held;
    if (held && ids.length > prevIds.length) {
      for (let i = prevIds.length; i < ids.length; i++) {
        spawnLink(fx, findWisp(state, ids[i]), reduced);
      }
      fx.badge = 1;
    }

    const score = Math.max(0, Number(state.score) || 0);
    const prevScore = prev ? Math.max(0, Number(prev.score) || 0) : score;
    const n = Math.floor(Number(state.lastClearN) || 0);
    if (prev && score > prevScore && n >= 3) {
      const pops = (state.effects || [])
        .filter((e) => e && e.type === "pop" && Number(e.life) > 0.55)
        .map((e) => ({ x: e.x, y: e.y, color: e.color, r: e.r }));
      const burst = (state.effects || []).some((e) => e && e.type === "burst" && Number(e.life) > 0.55);
      spawnClear(fx, {
        n,
        combo: Math.floor(Number(state.combo) || 1),
        gained: score - prevScore,
        pops,
        burst,
        color: pops[0]?.color ?? 0,
        reduced,
      });
    }
  }

  if (t > 0) {
    const g = 260;
    for (const p of fx.particles) {
      p.life -= t;
      p.x += p.vx * t;
      p.y += p.vy * t;
      p.vy += g * t;
      p.vx *= 1 - Math.min(1, 2.4 * t);
    }
    fx.particles = fx.particles.filter((p) => p.life > 0);

    for (const r of fx.rings) r.life -= t;
    fx.rings = fx.rings.filter((r) => r.life > 0);

    for (const f of fx.floats) f.life -= t;
    fx.floats = fx.floats.filter((f) => f.life > 0);

    if (fx.shake) {
      fx.shake.t += t;
      if (fx.shake.t >= fx.shake.dur) fx.shake = null;
    }
    if (fx.flash) {
      fx.flash.t += t;
      if (fx.flash.t >= fx.flash.dur) fx.flash = null;
    }
    if (fx.badge > 0) fx.badge = Math.max(0, fx.badge - t / 0.2);
  }

  capParticles(fx);
  fx.prev = {
    score: state?.score ?? 0,
    lastClearN: state?.lastClearN ?? 0,
    chainIds: (state?.chain?.ids || []).slice(),
  };
}

export function shakeOffset(fx) {
  const s = fx?.shake;
  if (!s || s.dur <= 0) return { x: 0, y: 0 };
  const u = Math.max(0, 1 - s.t / s.dur);
  const amp = Math.min(SHAKE_MAX_PX, s.amp) * u * u;
  return {
    x: Math.sin(s.t * 92) * amp,
    y: Math.cos(s.t * 80) * amp * 0.7,
  };
}

export function badgeScale(fx) {
  const b = fx?.badge || 0;
  if (b <= 0) return 1;
  return 1 + 0.3 * b * b;
}

export function drawFx(ctx, view, fx, reducedMotion) {
  if (!fx) return;
  const px = (wu) => view.px(wu);

  for (const r of fx.rings) {
    const u = Math.max(0, Math.min(1, r.life / 0.28));
    const expand = 1 - u;
    const x = view.sx(r.x);
    const y = view.sy(r.y);
    const color = colorHex(r.color);
    const rad = px(r.r || 19) * (1.1 + 1.1 * expand);
    ctx.strokeStyle = rgba("#fff8e6", 0.85 * u);
    ctx.lineWidth = Math.max(2, px(2.4) * u);
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(color, 0.7 * u);
    ctx.lineWidth = Math.max(1.5, px(1.8));
    ctx.beginPath();
    ctx.arc(x, y, rad * 0.78, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const p of fx.particles) {
    const u = Math.max(0, Math.min(1, p.life / 0.55));
    const x = view.sx(p.x);
    const y = view.sy(p.y);
    const rad = Math.max(0.8, px(p.r) * (0.6 + 0.4 * u));
    const color = colorHex(p.color);
    ctx.fillStyle = rgba(color, 0.2 + 0.8 * u);
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba("#fff8e6", 0.55 * u);
    ctx.beginPath();
    ctx.arc(x, y, rad * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const f of fx.floats) {
    const dur = 1.05;
    const u = Math.max(0, Math.min(1, f.life / dur));
    const age = 1 - u;
    let pop = 1;
    if (!reducedMotion) {
      if (age < 0.12) pop = 0.7 + 0.55 * (age / 0.12);
      else if (age < 0.22) pop = 1.25 - 0.25 * ((age - 0.12) / 0.1);
      else pop = 1;
    }
    const fade = u < 0.25 ? u / 0.25 : 1;
    const lift = age * (f.kind === "score" ? 42 : 22);
    const x = view.sx(f.x);
    const y = view.sy(f.y) - view.px(lift);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop * (f.scale || 1), pop * (f.scale || 1));
    ctx.globalAlpha = fade;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const font = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
    if (f.kind === "score") {
      const size = Math.max(18, view.px(22) * (f.scale || 1));
      ctx.font = `700 ${size}px ${font}`;
      ctx.fillStyle = f.color || "#fff8e6";
      ctx.shadowColor = "rgba(7, 11, 22, 0.75)";
      ctx.shadowBlur = 6;
      ctx.fillText(f.text, 0, 0);
    } else {
      let yy = 0;
      if (f.text) {
        const size = Math.max(26, view.px(30) * (f.scale || 1));
        ctx.font = `700 ${size}px ${font}`;
        ctx.fillStyle = f.color || "#fff8e6";
        ctx.shadowColor = "rgba(7, 11, 22, 0.8)";
        ctx.shadowBlur = 8;
        ctx.fillText(f.text, 0, yy);
        yy += view.px(30);
      }
      if (f.comboText) {
        const size = Math.max(16, view.px(18));
        ctx.font = `700 ${size}px ${font}`;
        ctx.fillStyle = "#ffd56a";
        ctx.shadowColor = "rgba(7, 11, 22, 0.8)";
        ctx.shadowBlur = 6;
        ctx.fillText(f.comboText, 0, yy);
      }
    }
    ctx.restore();
  }
}

export function drawFlash(ctx, cssW, cssH, fx) {
  const f = fx?.flash;
  if (!f || f.dur <= 0) return;
  const u = Math.max(0, 1 - f.t / f.dur);
  ctx.fillStyle = rgba(f.color || "#fff8e6", f.alpha * u * u);
  ctx.fillRect(0, 0, cssW, cssH);
}

