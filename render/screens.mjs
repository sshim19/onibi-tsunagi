/** タイトル / HUD / 終了の DOM と文言。DESIGN.md の文言をそのまま使う。 */

import { formatScore, formatTime } from "./share.mjs";

/**
 * @param {ParentNode} [root]
 */
export function bindScreens(root = document) {
  const el = {
    body: document.body,
    html: document.documentElement,
    playBar: root.querySelector("#play-bar"),
    hud: root.querySelector("#play-hud"),
    hudTime: root.querySelector("#hud-time"),
    hudScore: root.querySelector("#hud-score"),
    hudCombo: root.querySelector("#hud-combo"),
    hint: root.querySelector("#play-hint"),
    title: root.querySelector("#screen-title"),
    titleHeading: root.querySelector("#screen-title h1"),
    titleDate: root.querySelector("#title-date"),
    titleRecord: root.querySelector("#title-record"),
    btnStart: root.querySelector("#btn-start"),
    over: root.querySelector("#screen-over"),
    overHeading: root.querySelector("#screen-over h1"),
    overScore: root.querySelector("#over-score"),
    overToday: root.querySelector("#over-today"),
    overBest: root.querySelector("#over-best"),
    overNewBest: root.querySelector("#over-new-best"),
    overNewToday: root.querySelector("#over-new-today"),
    btnRetry: root.querySelector("#btn-retry"),
    btnShareX: root.querySelector("#btn-share-x"),
    btnShareLine: root.querySelector("#btn-share-line"),
    btnQuit: root.querySelector("#btn-quit"),
    canvas: root.querySelector("#game"),
  };


  function setPlaying(on) {
    el.body?.classList.toggle("is-playing", !!on);
    el.html?.classList.toggle("is-playing", !!on);
  }

  function hide(node, on) {
    if (!node) return;
    node.hidden = !!on;
  }

  function focusHeading(node) {
    if (!node) return;
    try {
      node.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {{ dateLabel: string, bestScore: number | null }} data
   */
  function showTitle(data) {
    setPlaying(false);
    hide(el.title, false);
    hide(el.over, true);
    hide(el.playBar, true);
    hide(el.hud, true);
    hide(el.hint, true);
    if (el.titleDate) el.titleDate.textContent = `今日の鬼火（${data.dateLabel}）`;
    if (el.titleRecord) {
      const best = data.bestScore;
      el.titleRecord.textContent =
        best == null || best <= 0 ? "記録はまだありません" : `最高記録 ${formatScore(best)}点`;
    }
    focusHeading(el.titleHeading);
  }

  function showPlay() {
    setPlaying(true);
    hide(el.title, true);
    hide(el.over, true);
    hide(el.playBar, false);
    hide(el.hud, false);
  }

  /**
   * @param {{
   *   score: number,
   *   todayBestScore: number | null,
   *   bestScore: number | null,
   *   isNewBest?: boolean,
   *   isNewTodayBest?: boolean,
   * }} data
   */
  function showOver(data) {
    setPlaying(false);
    hide(el.title, true);
    hide(el.over, false);
    hide(el.playBar, true);
    hide(el.hud, true);
    hide(el.hint, true);
    const score = Math.max(0, Math.floor(Number(data.score) || 0));
    if (el.overScore) el.overScore.textContent = `${formatScore(score)}点でした`;
    const today = Math.max(0, Math.floor(Number(data.todayBestScore) || 0));
    const best = Math.max(0, Math.floor(Number(data.bestScore) || 0));
    if (el.overToday) {
      el.overToday.textContent =
        today <= 0 ? "今日の最高はまだありません" : `今日の最高 ${formatScore(today)}点`;
    }
    if (el.overBest) {
      el.overBest.textContent =
        best <= 0 ? "これまでの最高はまだありません" : `これまでの最高 ${formatScore(best)}点`;
    }
    hide(el.overNewBest, !data.isNewBest);
    hide(el.overNewToday, !data.isNewTodayBest);
    focusHeading(el.overHeading);
  }

  /**
   * @param {{ timeLeft: number, score: number, combo?: number }} data
   */
  function updateHud(data) {
    if (el.hudTime) el.hudTime.textContent = `残り ${formatTime(data.timeLeft)}`;
    if (el.hudScore) {
      el.hudScore.replaceChildren();
      el.hudScore.append(document.createTextNode(formatScore(data.score)));
      const unit = document.createElement("span");
      unit.className = "hud-unit";
      unit.textContent = "点";
      el.hudScore.append(unit);
    }
    const combo = Math.floor(Number(data.combo) || 0);
    if (el.hudCombo) {
      if (combo >= 2) {
        el.hudCombo.hidden = false;
        el.hudCombo.textContent = `×${combo}`;
      } else {
        el.hudCombo.hidden = true;
        el.hudCombo.textContent = "";
      }
    }
  }

  /** @param {boolean} visible */
  function setHintVisible(visible) {
    hide(el.hint, !visible);
  }

  return {
    el,
    showTitle,
    showPlay,
    showOver,
    updateHud,
    setHintVisible,
  };
}
