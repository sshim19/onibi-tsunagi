/** 背景・鬼火・鎖・バースト。state の読み取りのみ。Y は下向き。ワールド＝画面。 */

import {
  VIEW_W,
  VIEW_H,
  WISP_R,
  COLORS,
  PALETTE,
  EFFECT_LIFE,
} from "../engine/constants.mjs";

export { VIEW_W, VIEW_H };

const SKY = PALETTE.sky[0];
const MID = PALETTE.sky[1];
const GROUND = PALETTE.sky[2];
const STONE_A = PALETTE.stone[0];
const STONE_B = PALETTE.stone[1];
const STONE_C = PALETTE.stone[2];
const MIST = PALETTE.mist;
const CREAM = PALETTE.cream[0];
const FLARE = PALETTE.cream[1];

function u32(n) {
  return n >>> 0;
}

function mix(a, b) {
  let h = u32(a);
  h = Math.imul(h ^ u32(b), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return u32(h ^ (h >>> 16));
}

function rand01(h) {
  return u32(h) / 4294967296;
}

function hashSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return u32(seed);
  const s = String(seed ?? 0);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return u32(h);
}

function hexRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex, a) {
  const { r, g, b } = hexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function colorInfo(color) {
  const i = Math.max(0, Math.floor(Number(color) || 0));
  return COLORS[i] || COLORS[0];
}

function wispHex(color) {
  return colorInfo(color).fill;
}

function wispMark(color) {
  return colorInfo(color).mark;
}

function clampLife(v, fallback = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

/**
 * キャンバスを CSS サイズ × DPR に合わせ、描画は CSS ピクセル座標で行う。
 * @returns {{ cssW: number, cssH: number, dpr: number }}
 */
export function syncCanvasSize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = Math.max(1, canvas.clientWidth || VIEW_W);
  const cssH = Math.max(1, canvas.clientHeight || VIEW_H);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { cssW, cssH, dpr };
}

/**
 * 幅に合わせて 360×640 を置く。縦に余れば同じ夜色で埋める。
 * 高さが足りないときは contain して欠けるのを防ぐ。Y は下向き（反転しない）。
 */
export function makeView(cssW, cssH) {
  let scale = cssW / VIEW_W;
  if (VIEW_H * scale > cssH + 0.5) scale = cssH / VIEW_H;
  const drawW = VIEW_W * scale;
  const drawH = VIEW_H * scale;
  const ox = (cssW - drawW) / 2;
  const oy = 0;
  return {
    scale,
    ox,
    oy,
    drawW,
    drawH,
    cssW,
    cssH,
    sx(x) {
      return ox + x * scale;
    },
    sy(y) {
      return oy + y * scale;
    },
    px(wu) {
      return wu * scale;
    },
    worldX(cssX) {
      return (cssX - ox) / scale;
    },
    worldY(cssY) {
      return (cssY - oy) / scale;
    },
  };
}

/**
 * クライアント座標をキャンバス論理座標（0..360, 0..640, Y 下向き）へ。
 * @returns {{ x: number, y: number }}
 */
export function clientToLogical(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cssW = canvas.clientWidth || rect.width || VIEW_W;
  const cssH = canvas.clientHeight || rect.height || VIEW_H;
  const view = makeView(cssW, cssH);
  const cssX = ((clientX - rect.left) / (rect.width || 1)) * cssW;
  const cssY = ((clientY - rect.top) / (rect.height || 1)) * cssH;
  return { x: view.worldX(cssX), y: view.worldY(cssY) };
}

function fillNight(ctx, cssW, cssH) {
  const g = ctx.createLinearGradient(0, 0, 0, cssH);
  g.addColorStop(0, SKY);
  g.addColorStop(0.42, MID);
  g.addColorStop(1, GROUND);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);
}

function drawTorii(ctx, view, cx, cy, w, h) {
  const x = view.sx(cx);
  const y = view.sy(cy);
  const pw = view.px(w);
  const ph = view.px(h);
  const pillar = Math.max(2, pw * 0.08);
  const top = Math.max(3, ph * 0.1);
  ctx.fillStyle = STONE_A;
  // 笠木
  ctx.fillRect(x - pw / 2 - pw * 0.06, y, pw * 1.12, top);
  // 島木
  ctx.fillRect(x - pw / 2, y + top * 1.35, pw, top * 0.7);
  // 柱
  ctx.fillRect(x - pw / 2 + pillar * 0.2, y + top, pillar, ph - top);
  ctx.fillRect(x + pw / 2 - pillar * 1.2, y + top, pillar, ph - top);
  // 貫
  ctx.fillStyle = STONE_B;
  ctx.fillRect(x - pw / 2 + pillar * 0.15, y + ph * 0.42, pw - pillar * 0.3, top * 0.55);
}

function drawStone(ctx, view, cx, cy, w, h, shade) {
  const x = view.sx(cx);
  const y = view.sy(cy);
  const pw = view.px(w);
  const ph = view.px(h);
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(x - pw / 2, y + ph);
  ctx.lineTo(x - pw / 2, y + ph * 0.22);
  ctx.quadraticCurveTo(x, y - ph * 0.08, x + pw / 2, y + ph * 0.22);
  ctx.lineTo(x + pw / 2, y + ph);
  ctx.closePath();
  ctx.fill();
}

function drawLantern(ctx, view, cx, cy, s, reducedMotion, t, flickerId) {
  const x = view.sx(cx);
  const y = view.sy(cy);
  const u = view.px(s);
  ctx.fillStyle = STONE_A;
  // 基礎
  ctx.fillRect(x - u * 0.55, y + u * 1.15, u * 1.1, u * 0.28);
  // 柱
  ctx.fillStyle = STONE_B;
  ctx.fillRect(x - u * 0.16, y + u * 0.15, u * 0.32, u * 1.05);
  // 火袋
  ctx.fillStyle = STONE_A;
  ctx.fillRect(x - u * 0.42, y - u * 0.55, u * 0.84, u * 0.78);
  // 屋根
  ctx.fillStyle = STONE_C;
  ctx.beginPath();
  ctx.moveTo(x - u * 0.7, y - u * 0.48);
  ctx.lineTo(x, y - u * 0.95);
  ctx.lineTo(x + u * 0.7, y - u * 0.48);
  ctx.closePath();
  ctx.fill();
  // 火袋の明かり
  let glow = 0.55;
  if (!reducedMotion) {
    glow = 0.42 + 0.2 * Math.sin(t * 2.2 + flickerId * 6.1);
  }
  const g = ctx.createRadialGradient(x, y - u * 0.16, 0, x, y - u * 0.16, u * 0.9);
  g.addColorStop(0, rgba("#ffd56a", glow));
  g.addColorStop(0.45, rgba("#ffd56a", glow * 0.28));
  g.addColorStop(1, rgba("#ffd56a", 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y - u * 0.16, u * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(FLARE, 0.55 * glow + 0.15);
  ctx.fillRect(x - u * 0.22, y - u * 0.4, u * 0.44, u * 0.48);
}

function drawFog(ctx, view, seed, t, reducedMotion, cssW, cssH) {
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const h = mix(seed, 900 + i * 17);
    const y0 = view.sy(220 + i * 140 + rand01(h) * 40);
    const amp = view.px(18 + rand01(mix(h, 3)) * 16);
    const drift = reducedMotion ? 0 : Math.sin(t * (0.12 + i * 0.05) + i) * view.px(20);
    const gy = Math.min(cssH, y0);
    const g = ctx.createLinearGradient(0, gy - amp, 0, gy + amp * 2.2);
    g.addColorStop(0, rgba(MIST, 0));
    g.addColorStop(0.45, rgba(MIST, 0.045));
    g.addColorStop(1, rgba(MIST, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, gy - amp, cssW, amp * 3.2);
    ctx.fillStyle = rgba(MIST, 0.03);
    ctx.beginPath();
    ctx.ellipse(view.sx(180) + drift, gy + amp * 0.4, view.px(200), amp * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBackground(ctx, view, state, reducedMotion) {
  const seed = hashSeed(state?.seed);
  const t = Number(state?.t) || 0;
  const { cssW, cssH } = view;

  // 遠くの鳥居（小さく、上寄り）
  const toriiW = 110 + rand01(mix(seed, 11)) * 30;
  const toriiX = 120 + rand01(mix(seed, 13)) * 120;
  drawTorii(ctx, view, toriiX, 70 + rand01(mix(seed, 19)) * 20, toriiW, 90);

  // 墓石
  const stones = 5 + Math.floor(rand01(mix(seed, 29)) * 3);
  for (let i = 0; i < stones; i++) {
    const h = mix(seed, 40 + i * 97);
    const x = 28 + rand01(h) * 304;
    const y = 430 + rand01(mix(h, 2)) * 150;
    const w = 14 + rand01(mix(h, 3)) * 16;
    const ht = 22 + rand01(mix(h, 5)) * 20;
    const shade = rand01(mix(h, 7)) > 0.5 ? STONE_A : STONE_B;
    drawStone(ctx, view, x, y, w, ht, shade);
  }

  // 灯籠
  const lanterns = [
    { x: 42 + rand01(mix(seed, 51)) * 18, y: 250 + rand01(mix(seed, 53)) * 80, s: 16 },
    { x: 300 + rand01(mix(seed, 57)) * 20, y: 210 + rand01(mix(seed, 59)) * 70, s: 15 },
    { x: 70 + rand01(mix(seed, 61)) * 30, y: 500 + rand01(mix(seed, 63)) * 40, s: 18 },
    { x: 280 + rand01(mix(seed, 67)) * 24, y: 470 + rand01(mix(seed, 71)) * 50, s: 17 },
  ];
  lanterns.forEach((L, i) => drawLantern(ctx, view, L.x, L.y, L.s, reducedMotion, t, i + 1));

  drawFog(ctx, view, seed, t, reducedMotion, cssW, cssH);

  // 画面下の余白も同じ地色で続き、切れ目を出さない
  if (cssH > view.oy + view.drawH + 0.5) {
    const top = view.oy + view.drawH - 1;
    const g = ctx.createLinearGradient(0, top, 0, cssH);
    g.addColorStop(0, GROUND);
    g.addColorStop(1, GROUND);
    ctx.fillStyle = g;
    ctx.fillRect(0, top, cssW, cssH - top + 1);
    ctx.fillStyle = rgba(MIST, 0.04);
    ctx.fillRect(0, top, cssW, cssH - top + 1);
  }
}

/**
 * 鬼火の life は見え方 0..1。enter は 0→1、exit は 1→0、live は 1
 * （engine/sim.mjs の更新に合わせる）。
 */
function wispAlpha(wisp) {
  return clampLife(wisp.life, wisp.phase === "enter" ? 0 : 1);
}

function drawColorMark(ctx, x, y, r, color, alpha) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.strokeStyle = rgba(SKY, 0.72);
  ctx.fillStyle = rgba(SKY, 0.72);
  ctx.lineWidth = Math.max(1.2, r * 0.16);
  ctx.lineCap = "round";
  const mark = wispMark(color);
  if (mark === "dot") {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.2, r * 0.16), 0, Math.PI * 2);
    ctx.fill();
  } else if (mark === "vline") {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.42);
    ctx.lineTo(x, y + r * 0.42);
    ctx.stroke();
  } else if (mark === "diamond") {
    const d = r * 0.34;
    ctx.beginPath();
    ctx.moveTo(x, y - d);
    ctx.lineTo(x + d, y);
    ctx.lineTo(x, y + d);
    ctx.lineTo(x - d, y);
    ctx.closePath();
    ctx.fill();
  } else if (mark === "hline") {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.42, y);
    ctx.lineTo(x + r * 0.42, y);
    ctx.stroke();
  } else {
    // triangle
    const d = r * 0.36;
    ctx.beginPath();
    ctx.moveTo(x, y - d);
    ctx.lineTo(x + d * 0.9, y + d * 0.7);
    ctx.lineTo(x - d * 0.9, y + d * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawWisp(ctx, view, wisp, chained, reducedMotion, t) {
  const alpha = wispAlpha(wisp);
  if (alpha <= 0.01) return;
  const x = view.sx(wisp.x);
  const y = view.sy(wisp.y);
  const r = view.px(wisp.r || WISP_R);
  const color = wispHex(wisp.color);
  let pulse = 1;
  if (!reducedMotion) {
    pulse = 1 + 0.05 * Math.sin((Number(t) || 0) * 3 + (Number(wisp.id) || 0) * 1.7);
  }
  const glowR = r * 2.35 * pulse;

  const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
  g.addColorStop(0, rgba(FLARE, 0.95 * alpha));
  g.addColorStop(0.16, rgba(FLARE, 0.8 * alpha));
  g.addColorStop(0.32, rgba(color, 0.7 * alpha));
  g.addColorStop(0.58, rgba(color, 0.22 * alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, Math.PI * 2);
  ctx.fill();

  // 小さなフレア（縦に少し長い）
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.7, 1.15);
  const flare = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
  flare.addColorStop(0, rgba(FLARE, 0.35 * alpha));
  flare.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = flare;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = rgba(FLARE, 0.92 * alpha);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.34, 0, Math.PI * 2);
  ctx.fill();

  drawColorMark(ctx, x, y, r, wisp.color, alpha * 0.95);

  if (chained) {
    ctx.strokeStyle = rgba(FLARE, 0.85 * alpha);
    ctx.lineWidth = Math.max(1.5, view.px(1.8));
    ctx.beginPath();
    ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(color, 0.7 * alpha);
    ctx.lineWidth = Math.max(2, view.px(2.4));
    ctx.beginPath();
    ctx.arc(x, y, r * 1.2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function wispById(wisps, id) {
  for (const w of wisps) {
    if (w && w.id === id) return w;
  }
  return null;
}

function drawChain(ctx, view, state) {
  const chain = state.chain;
  if (!chain || !chain.ids || chain.ids.length === 0) return;
  const wisps = state.wisps || [];
  const pts = [];
  for (const id of chain.ids) {
    const w = wispById(wisps, id);
    if (w) pts.push({ x: view.sx(w.x), y: view.sy(w.y) });
  }
  if (state.pointer?.held) {
    pts.push({ x: view.sx(state.pointer.x), y: view.sy(state.pointer.y) });
  }
  if (pts.length < 2) return;

  const color = wispHex(chain.color);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.strokeStyle = rgba(color, 0.28);
  ctx.lineWidth = Math.max(6, view.px(7));
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  ctx.strokeStyle = rgba(color, 0.9);
  ctx.lineWidth = Math.max(2, view.px(2.4));
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  ctx.strokeStyle = rgba(FLARE, 0.55);
  ctx.lineWidth = Math.max(1, view.px(1.1));
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/**
 * effects[].life は残り 1→0（発生時 1。engine/sim.mjs が EFFECT_LIFE で減らす）。
 * 1 を超える値は残り秒とみなし正規化する。環は life が減るにつれて広がる。
 */
function effectRemaining(e) {
  const n = Number(e.life);
  if (!Number.isFinite(n)) return 0;
  if (n > 1) return Math.max(0, Math.min(1, n / EFFECT_LIFE));
  return Math.max(0, Math.min(1, n));
}

function drawEffects(ctx, view, effects, reducedMotion) {
  if (!effects || !effects.length) return;
  for (const e of effects) {
    const life = effectRemaining(e);
    if (life <= 0.01) continue;
    const x = view.sx(e.x);
    const y = view.sy(e.y);
    const color = wispHex(e.color);
    const base = view.px(e.r || 24);
    const expand = reducedMotion ? 0.35 : 1 - life;

    if (e.type === "burst") {
      const radius = base * (0.35 + 0.85 * expand);
      ctx.strokeStyle = rgba(FLARE, 0.85 * life);
      ctx.lineWidth = Math.max(2, view.px(3) * life);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = rgba(color, 0.55 * life);
      ctx.lineWidth = Math.max(1.5, view.px(2));
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.15);
      g.addColorStop(0, rgba(FLARE, 0.22 * life));
      g.addColorStop(0.5, rgba(color, 0.16 * life));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.15, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === "break") {
      const radius = base * (0.5 + 0.6 * expand);
      ctx.strokeStyle = rgba(CREAM, 0.7 * life);
      ctx.lineWidth = Math.max(1.5, view.px(2));
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - radius * 0.7, y - radius * 0.7);
      ctx.lineTo(x + radius * 0.7, y + radius * 0.7);
      ctx.moveTo(x + radius * 0.7, y - radius * 0.7);
      ctx.lineTo(x - radius * 0.7, y + radius * 0.7);
      ctx.stroke();
    } else {
      // pop とその他
      const radius = base * (0.4 + 0.7 * expand);
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, rgba(FLARE, 0.7 * life));
      g.addColorStop(0.4, rgba(color, 0.45 * life));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawVignette(ctx, view) {
  const { cssW, cssH } = view;
  const edge = Math.max(28, cssW * 0.14);
  let g = ctx.createLinearGradient(0, 0, edge, 0);
  g.addColorStop(0, rgba(SKY, 0.55));
  g.addColorStop(1, rgba(SKY, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, edge, cssH);

  g = ctx.createLinearGradient(cssW, 0, cssW - edge, 0);
  g.addColorStop(0, rgba(SKY, 0.55));
  g.addColorStop(1, rgba(SKY, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cssW - edge, 0, edge, cssH);

  const top = Math.max(24, cssH * 0.1);
  g = ctx.createLinearGradient(0, 0, 0, top);
  g.addColorStop(0, rgba(SKY, 0.42));
  g.addColorStop(1, rgba(SKY, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, top);

  const bot = Math.max(32, cssH * 0.16);
  g = ctx.createLinearGradient(0, cssH, 0, cssH - bot);
  g.addColorStop(0, rgba(SKY, 0.5));
  g.addColorStop(1, rgba(SKY, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, cssH - bot, cssW, bot);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} [state]
 * @param {{ reducedMotion?: boolean }} [opts]
 */
export function drawScene(ctx, state, opts = {}) {
  const canvas = ctx.canvas;
  const { cssW, cssH, dpr } = syncCanvasSize(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  fillNight(ctx, cssW, cssH);

  const view = makeView(cssW, cssH);
  const reducedMotion = !!opts.reducedMotion;
  const t = Number(state?.t) || 0;

  ctx.save();
  drawBackground(ctx, view, state, reducedMotion);

  const wisps = state?.wisps || [];
  const chained = new Set(state?.chain?.ids || []);

  // 奥の弱いものから
  for (const wisp of wisps) {
    if (!chained.has(wisp.id)) drawWisp(ctx, view, wisp, false, reducedMotion, t);
  }
  drawChain(ctx, view, state || {});
  for (const wisp of wisps) {
    if (chained.has(wisp.id)) drawWisp(ctx, view, wisp, true, reducedMotion, t);
  }
  drawEffects(ctx, view, state?.effects, reducedMotion);
  drawVignette(ctx, view);
  ctx.restore();
}
