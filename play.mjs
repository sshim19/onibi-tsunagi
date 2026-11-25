/**
 * 入力、rAF ループ、画面遷移の配線。
 *
 * エンジンインタフェース（engine/sim.mjs）:
 *   createInitialState({ seed, dateJst, bestScore, todayBestScore })
 *     → status は "playing"。タイトルはこちらで "title" にする。
 *   tick(state, input, dt) → 新しい state（非破壊）。dt は秒。最大 50ms。
 *   input は { held, x, y }（キャンバス論理座標、0..360 / 0..640、Y は下向き）。
 *   tick は input を書き換えない。立ち上がり・はなし判定は tick 側。
 */
import { tick, createInitialState } from "./engine/sim.mjs";
import { MAX_DT, FIXED_DT } from "./engine/constants.mjs";
import { drawScene, clientToLogical } from "./render/draw.mjs";
import { bindScreens } from "./render/screens.mjs";
import {
  getJstDate,
  seedString,
  loadBests,
  saveBests,
  shareText,
  sharePageUrl,
  tweetShareUrl,
  lineShareUrl,
} from "./render/share.mjs";

const screens = bindScreens(document);
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });

const motionQuery =
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

function reducedMotion() {
  return !!motionQuery.matches;
}

const { dateJst, dateLabel } = getJstDate();
const seed = seedString(dateJst);

let stored = loadBests(dateJst);
let state = titleStateFrom(stored);
let ended = false;
let held = false;
let pointerX = 180;
let pointerY = 320;
let activePointer = null;
let lastTs = 0;
let lastShare = shareText({ dateLabel, score: 0 });

function titleStateFrom(bests) {
  const playing = createInitialState({
    seed,
    dateJst,
    bestScore: bests.bestScore ?? 0,
    todayBestScore: bests.todayBestScore ?? 0,
  });
  return { ...playing, status: "title" };
}

function freshRun() {
  stored = loadBests(dateJst);
  ended = false;
  held = false;
  activePointer = null;
  pointerX = 180;
  pointerY = 320;
  lastTs = 0;
  return createInitialState({
    seed,
    dateJst,
    bestScore: stored.bestScore ?? 0,
    todayBestScore: stored.todayBestScore ?? 0,
  });
}

function finishRun(next) {
  if (ended) {
    state = next;
    return;
  }
  ended = true;
  clearPointer();
  state = next.status === "over" ? next : { ...next, status: "over" };
  const saved = saveBests({ dateJst, score: state.score });
  stored = { bestScore: saved.bestScore, todayBestScore: saved.todayBestScore };
  lastShare = shareText({ dateLabel, score: state.score });
  screens.showOver({
    score: state.score,
    todayBestScore: saved.todayBestScore,
    bestScore: saved.bestScore,
    isNewBest: saved.isNewBest,
    isNewTodayBest: saved.isNewTodayBest,
  });
}

function takeInput() {
  return { held, x: pointerX, y: pointerY };
}

function clearPointer() {
  held = false;
  activePointer = null;
}

function paint() {
  drawScene(ctx, state, { reducedMotion: reducedMotion() });
  if (state.status === "playing") {
    screens.updateHud({
      timeLeft: state.timeLeft,
      score: state.score,
      combo: state.combo,
    });
    screens.setHintVisible(!!state.hint);
  }
}

function frame(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(Math.max((ts - lastTs) / 1000, 0), MAX_DT);
  lastTs = ts;

  if (state.status === "playing") {
    const input = takeInput();
    const next = tick(state, input, dt);
    if (next.status === "over") {
      finishRun(next);
    } else {
      state = next;
    }
  } else if (state.status !== "over") {
    clearPointer();
  }

  paint();
  requestAnimationFrame(frame);
}

function startPlay() {
  state = freshRun();
  screens.showPlay();
  screens.updateHud({ timeLeft: state.timeLeft ?? 60, score: state.score ?? 0, combo: state.combo });
  screens.setHintVisible(state.hint !== false);
  paint();
}

/**
 * 「やめる」では、引いている鎖が3つ以上ならはなして得点してから終わる
 * （時間切れと同じ扱い）。
 */
function quitToOver() {
  if (state.status !== "playing") return;
  let next = state;
  if (held || state.pointer?.held) {
    held = false;
    next = tick(state, { held: false, x: pointerX, y: pointerY }, FIXED_DT);
  }
  finishRun(next.status === "over" ? next : { ...next, status: "over" });
  paint();
}

screens.el.btnStart?.addEventListener("click", () => {
  startPlay();
});

screens.el.btnRetry?.addEventListener("click", () => {
  startPlay();
});

screens.el.btnQuit?.addEventListener("click", () => {
  quitToOver();
});

function currentShare() {
  return {
    text: lastShare,
    url: sharePageUrl(),
  };
}

function guardClick(fn) {
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  };
}

function openShareTab(href) {
  if (!href) return;
  window.open(href, "_blank", "noopener,noreferrer");
}

screens.el.btnShareX?.addEventListener(
  "click",
  guardClick(() => {
    openShareTab(tweetShareUrl(currentShare()));
  }),
);

screens.el.btnShareLine?.addEventListener(
  "click",
  guardClick(() => {
    openShareTab(lineShareUrl(currentShare()));
  }),
);

function setLogicalFromEvent(e) {
  const pt = clientToLogical(canvas, e.clientX, e.clientY);
  if (Number.isFinite(pt.x)) pointerX = pt.x;
  if (Number.isFinite(pt.y)) pointerY = pt.y;
}

function pointerDown(e) {
  if (state.status !== "playing") return;
  if (e.isPrimary === false) return;
  if (activePointer != null) return;
  activePointer = e.pointerId;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  setLogicalFromEvent(e);
  held = true;
  if (e.cancelable) e.preventDefault();
}

function pointerMove(e) {
  if (state.status !== "playing") return;
  if (e.cancelable) e.preventDefault();
  if (e.pointerId !== activePointer) return;
  setLogicalFromEvent(e);
}

function pointerUp(e) {
  if (e.pointerId !== activePointer) return;
  if (
    e.type !== "pointercancel" &&
    Number.isFinite(e.clientX) &&
    Number.isFinite(e.clientY)
  ) {
    setLogicalFromEvent(e);
  }
  activePointer = null;
  held = false;
}

canvas.addEventListener("pointerdown", pointerDown, { passive: false });
canvas.addEventListener("pointermove", pointerMove, { passive: false });
canvas.addEventListener("pointerup", pointerUp, { passive: false });
canvas.addEventListener("pointercancel", pointerUp, { passive: false });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener(
  "touchmove",
  (e) => {
    if (state.status === "playing" && e.cancelable) e.preventDefault();
  },
  { passive: false },
);

screens.showTitle({ dateLabel, bestScore: stored.bestScore });
screens.updateHud({ timeLeft: 60, score: 0, combo: 1 });
paint();
requestAnimationFrame(frame);
