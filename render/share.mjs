/** 共有文と localStorage の読み書き。日付は実行時の JST。 */

import {
  STORAGE_BEST,
  STORAGE_DAILY_PREFIX,
  SEED_PREFIX,
} from "../engine/constants.mjs";

export { STORAGE_BEST, STORAGE_DAILY_PREFIX, SEED_PREFIX };

export const GAME_TITLE = "鬼火つなぎ";

/**
 * @param {Date} [now]
 * @returns {{ dateJst: string, dateLabel: string, year: number, month: number, day: number }}
 */
export function getJstDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const pick = (type) => Number(parts.find((p) => p.type === type)?.value);
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  const dateJst = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dateLabel = `${month}月${day}日`;
  return { dateJst, dateLabel, year, month, day };
}

export function dailyKey(dateJst) {
  return `${STORAGE_DAILY_PREFIX}${dateJst}`;
}

export function seedString(dateJst) {
  return `${SEED_PREFIX}${dateJst}`;
}

/** 画面表示用。共有文には使わない。 */
export function formatScore(score) {
  return Math.max(0, Math.floor(Number(score) || 0)).toLocaleString("ja-JP");
}

/** 残り秒 → 分:秒。60 は 1:00、0 は 0:00。切り上げで減っていく。 */
export function formatTime(timeLeft) {
  const total = Math.max(0, Math.ceil(Number(timeLeft) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function readNum(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} dateJst
 * @param {Storage} [storage]
 * @returns {{ bestScore: number | null, todayBestScore: number | null }}
 */
export function loadBests(dateJst, storage = globalThis.localStorage) {
  if (!storage) return { bestScore: null, todayBestScore: null };
  return {
    bestScore: readNum(storage, STORAGE_BEST),
    todayBestScore: readNum(storage, dailyKey(dateJst)),
  };
}

/**
 * 今回の得点を保存する。0点は書き込まない（未記録のまま。0 を新記録にしない）。
 * isNewTodayBest は自己ベスト更新と重なるときは false（文言を重ねない）。
 *
 * @param {{ dateJst: string, score: number }} rec
 * @param {Storage} [storage]
 */
export function saveBests({ dateJst, score }, storage = globalThis.localStorage) {
  const prev = loadBests(dateJst, storage);
  const value = Math.max(0, Math.floor(Number(score) || 0));
  if (value <= 0) {
    return {
      bestScore: prev.bestScore,
      todayBestScore: prev.todayBestScore,
      isNewBest: false,
      isNewTodayBest: false,
    };
  }
  const isNewBest = value > (prev.bestScore ?? 0);
  const todayGrew = value > (prev.todayBestScore ?? 0);
  const bestScore = prev.bestScore == null ? value : Math.max(prev.bestScore, value);
  const todayBestScore =
    prev.todayBestScore == null ? value : Math.max(prev.todayBestScore, value);
  try {
    if (bestScore > 0) storage?.setItem(STORAGE_BEST, String(bestScore));
    if (todayBestScore > 0) storage?.setItem(dailyKey(dateJst), String(todayBestScore));
  } catch {
    /* private mode など */
  }
  return {
    bestScore,
    todayBestScore,
    isNewBest,
    isNewTodayBest: todayGrew && !isNewBest,
  };
}

/**
 * 改行3行。攻略や配置は出さない。点数はカンマなし。
 * @param {{ dateLabel: string, score: number }} rec
 */
export function shareText({ dateLabel, score }) {
  const n = Math.max(0, Math.floor(Number(score) || 0));
  return `${GAME_TITLE}\n${dateLabel}\n${n}点`;
}

/**
 * 公開ページの URL。query / hash は付けない。file: は空文字。
 * @param {Pick<Location, "origin" | "protocol" | "pathname">} [loc]
 */
export function sharePageUrl(loc = globalThis.location) {
  if (!loc || loc.protocol === "file:" || !loc.origin || loc.origin === "null") return "";
  let path = String(loc.pathname || "/");
  path = path.replace(/\/index\.html$/i, "/");
  if (!path) path = "/";
  return `${loc.origin}${path}`;
}

/** @param {{ text: string, url?: string }} rec */
export function tweetShareUrl({ text, url = "" }) {
  const params = new URLSearchParams();
  if (text) params.set("text", text);
  if (url) params.set("url", url);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/** 結果文と URL を本文に載せる。 */
/** @param {{ text: string, url?: string }} rec */
export function lineShareUrl({ text, url = "" }) {
  const body = [text, url].filter(Boolean).join("\n");
  return `https://line.me/R/share?text=${encodeURIComponent(body)}`;
}
