/**
 * Web Audio だけで鳴らす効果音。ファイルもライブラリも使わない。
 * エンジンは触らず、state の変化から成功・失敗を判断する（fx.mjs と同じ考え方）。
 */

export const MUTE_KEY = "onibi-tsunagi:muted";

const MASTER_GAIN = 0.42;

function readMuted(storage) {
  if (!storage) return false;
  try {
    const v = storage.getItem(MUTE_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function writeMuted(muted, storage) {
  if (!storage) return;
  try {
    storage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadMuted(storage = globalThis.localStorage) {
  return readMuted(storage);
}

/**
 * 直前の snapshot と新しい state から、鳴らすべき音を決める。純関数。
 * @returns {{ type: "success", n: number, combo: number, burst: boolean } | { type: "fail", n: number } | null}
 */
export function soundEvent(prev, state) {
  if (!prev || !state) return null;
  if (state.status !== "playing" && state.status !== "over") return null;

  const score = Math.max(0, Number(state.score) || 0);
  const prevScore = Math.max(0, Number(prev.score) || 0);
  const n = Math.floor(Number(state.lastClearN) || 0);
  if (score > prevScore && n >= 3) {
    const burst = (state.effects || []).some(
      (e) => e && e.type === "burst" && Number(e.life) > 0.55,
    );
    return {
      type: "success",
      n,
      combo: Math.max(1, Math.floor(Number(state.combo) || 1)),
      burst,
    };
  }

  const wasHeld = !!prev.held;
  const held = !!state.pointer?.held;
  const prevN = (prev.chainIds || []).length;
  const nowN = (state.chain?.ids || []).length;
  if (wasHeld && !held && prevN >= 1 && prevN < 3 && nowN === 0 && score === prevScore) {
    return { type: "fail", n: prevN };
  }
  return null;
}

function snapshot(state) {
  return {
    score: state?.score ?? 0,
    lastClearN: state?.lastClearN ?? 0,
    held: !!state?.pointer?.held,
    chainIds: (state?.chain?.ids || []).slice(),
  };
}

export function createSfx() {
  return {
    prev: null,
    muted: loadMuted(),
    ctx: null,
    master: null,
    compressor: null,
    noiseBuf: null,
  };
}

export function resetSfx(sfx) {
  if (!sfx) return;
  sfx.prev = null;
}

function applyMuteGain(sfx, now) {
  if (!sfx?.master || !sfx.ctx) return;
  const g = sfx.master.gain;
  const t = now ?? sfx.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(sfx.muted ? 0 : MASTER_GAIN, t + 0.03);
}

export function setMuted(sfx, muted, storage = globalThis.localStorage) {
  if (!sfx) return;
  sfx.muted = !!muted;
  writeMuted(sfx.muted, storage);
  applyMuteGain(sfx);
}

export function isMuted(sfx) {
  return !!sfx?.muted;
}

/** 最初の操作で AudioContext を作り、iOS 向けに resume する。 */
export function unlockSfx(sfx) {
  if (!sfx) return;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  try {
    if (!sfx.ctx) {
      const ctx = new AC();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 10;
      compressor.ratio.value = 3.2;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.14;
      const master = ctx.createGain();
      master.gain.value = sfx.muted ? 0 : MASTER_GAIN;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      sfx.ctx = ctx;
      sfx.master = master;
      sfx.compressor = compressor;
    }
    if (sfx.ctx.state === "suspended") {
      const p = sfx.ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  } catch {
    /* AudioContext unavailable */
  }
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function successPitches(n, combo) {
  const count = Math.min(8, Math.max(3, n) + (n >= 7 ? 1 : 0));
  const root = 71 + Math.min(4, Math.max(0, n - 3)) * 0.4 + Math.min(7, Math.max(0, combo - 1));
  const steps = [0, 4, 7, 11, 12, 16, 19, 23];
  const out = [];
  for (let i = 0; i < count; i++) out.push(midiToFreq(root + steps[i]));
  return out;
}

function playTone(ctx, dest, { freq, type = "sine", t0, dur, peak, attack = 0.012, endFreq }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq && endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => {
    try {
      osc.disconnect();
      g.disconnect();
    } catch {
      /* already gone */
    }
  };
}

function successBus(ctx, master, t0, wetAmt) {
  const dry = ctx.createGain();
  dry.gain.value = 1;
  dry.connect(master);

  const delay = ctx.createDelay(0.4);
  delay.delayTime.value = 0.15;
  const fb = ctx.createGain();
  fb.gain.value = 0.2;
  const wet = ctx.createGain();
  wet.gain.setValueAtTime(wetAmt, t0);
  wet.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 700;
  dry.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(hp);
  hp.connect(wet);
  wet.connect(master);

  const stopAt = (t0 + 1.1 - ctx.currentTime) * 1000 + 50;
  setTimeout(() => {
    try {
      dry.disconnect();
      delay.disconnect();
      fb.disconnect();
      hp.disconnect();
      wet.disconnect();
    } catch {
      /* already gone */
    }
  }, Math.max(200, stopAt));

  return dry;
}

function noiseBuffer(sfx) {
  if (sfx.noiseBuf) return sfx.noiseBuf;
  const ctx = sfx.ctx;
  const len = Math.max(1, Math.floor(ctx.sampleRate * 0.3));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  sfx.noiseBuf = buf;
  return buf;
}

function playSuccess(sfx, ev) {
  const ctx = sfx.ctx;
  const t0 = ctx.currentTime + 0.01;
  const n = ev.n;
  const combo = ev.combo;
  const big = n >= 7 || ev.burst;
  const bus = successBus(ctx, sfx.master, t0, big ? 0.28 : 0.2);
  const pitches = successPitches(n, combo);
  const gap = n >= 10 ? 0.055 : big ? 0.062 : 0.072;
  const peak = (big ? 0.11 : 0.09) * (1 + Math.min(0.2, (combo - 1) * 0.03));

  for (let i = 0; i < pitches.length; i++) {
    const t = t0 + i * gap;
    const dur = (big ? 0.42 : 0.34) + i * 0.025;
    playTone(ctx, bus, { freq: pitches[i], type: "sine", t0: t, dur, peak, attack: 0.01 });
    playTone(ctx, bus, {
      freq: pitches[i] * 2,
      type: "sine",
      t0: t,
      dur: dur * 0.7,
      peak: peak * 0.28,
      attack: 0.008,
    });
  }

  if (big) {
    const sparkle = pitches[pitches.length - 1] * 2;
    playTone(ctx, bus, {
      freq: sparkle,
      type: "sine",
      t0: t0 + pitches.length * gap * 0.35,
      dur: 0.5,
      peak: 0.07,
      attack: 0.008,
    });
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(sfx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2400;
    const ng = ctx.createGain();
    const ts = t0 + 0.02;
    ng.gain.setValueAtTime(0.0001, ts);
    ng.gain.linearRampToValueAtTime(0.05, ts + 0.012);
    ng.gain.exponentialRampToValueAtTime(0.0001, ts + 0.16);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(bus);
    src.start(ts);
    src.stop(ts + 0.18);
  }
}

function playFail(sfx) {
  const ctx = sfx.ctx;
  const t0 = ctx.currentTime + 0.005;
  const dest = sfx.master;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(sfx);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(640, t0);
  filter.frequency.exponentialRampToValueAtTime(240, t0 + 0.18);
  filter.Q.value = 0.85;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.linearRampToValueAtTime(0.14, t0 + 0.014);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
  src.connect(filter);
  filter.connect(ng);
  ng.connect(dest);
  src.start(t0);
  src.stop(t0 + 0.22);
  src.onended = () => {
    try {
      src.disconnect();
      filter.disconnect();
      ng.disconnect();
    } catch {
      /* already gone */
    }
  };

  playTone(ctx, dest, {
    freq: 196,
    endFreq: 92,
    type: "sine",
    t0,
    dur: 0.2,
    peak: 0.09,
    attack: 0.01,
  });
}

/**
 * state の差分を見て効果音を鳴らす。
 * @param {object} sfx
 * @param {object} state
 */
export function syncSound(sfx, state) {
  if (!sfx) return null;
  const ev = soundEvent(sfx.prev, state);
  sfx.prev = snapshot(state);
  if (!ev || sfx.muted || !sfx.ctx) return ev;
  try {
    if (ev.type === "success") playSuccess(sfx, ev);
    else if (ev.type === "fail") playFail(sfx);
  } catch {
    /* audio graph failed; ignore */
  }
  return ev;
}
