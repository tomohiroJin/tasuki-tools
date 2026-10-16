/**
 * 休憩の表示の純粋関数と文言（#402）。
 *
 * **文言はここにだけ置く。** 「休」「憩」は書体の base 層に無いので、条件「なし」のルームでは描かない
 * （設計 D9）。それ以外の字は base 層に収める（`test/ui/break-copy-fits-font-base.test.ts` が測る）。
 */
import { breakPolicyOf, type Room, type SessionConfig } from "@tasuki/timer-core";

export const BREAK_TEXT = {
  settingsLabel: "休憩の条件",
  triggerNone: "なし",
  triggerElapsed: "経過時間",
  triggerRounds: "周回",
  everyLabel: "休憩の間隔",
  modeLabel: "入り方",
  modeAuto: "自動で休憩に入る",
  modeSuggest: "知らせるだけ",
  startButton: "休憩する",
  startHint: "次の休憩までを数え直します",
  overlayHeading: "休憩中",
  endButton: "休憩を終える",
  nextDriver: (name: string) => `休憩明けは${name}さん`,
  reclaimWarning: "全員がこの画面を閉じると、しばらくしてルームは消えます。",
  reclaimWarningLast: "あなたが最後の一人です。この画面を閉じると、しばらくしてルームは消えます。",
  suggestBand: "休憩の時間です",
  announceStarted: (name: string) => `休憩に入りました。休憩明けは${name}さんです`,
  announceEnded: "休憩が終わりました",
  osNotifyTitle: "休憩の時間です",
  roundsEstimate: (minutes: number) => `約 ${minutes} 分ごと`,
  roundsUnavailableAlone: "1 人では周回の条件は使えません",
  minutes: (n: number) => `${n}分`,
  rounds: (n: number) => `${n}周`,
} as const;

export function isBreakEnabled(config: SessionConfig): boolean {
  return breakPolicyOf(config).trigger !== "none";
}

/** 休憩中か。`session.break` が無い snapshot（古いサーバー）は休憩中でないとみなす */
export function isOnBreakRoom(room: Room): boolean {
  return (room.session.break?.since ?? null) !== null;
}

/** 休憩の経過ミリ秒。端末の時計を `clockOffset` でサーバーの時計へ寄せて引く。負にはしない */
export function breakElapsedMs(since: number, now: number, clockOffset: number): number {
  return Math.max(0, now + clockOffset - since);
}

/** 「知らせるだけ」の帯。いまの交代で知らせたときだけ出し、次の交代で消える（設計 §5.5） */
export function isSuggestBandVisible(room: Room): boolean {
  const brk = room.session.break;
  if (brk === undefined || brk.since !== null || brk.suggestedAtSwitches === null) return false;
  return brk.suggestedAtSwitches === room.session.totalSwitches;
}

/** 周回の条件が、何分ごとにあたるかの目安（交代間隔 × 適格な席 × 周） */
export function roundsEstimateMinutes(intervalMinutes: number, eligibleSeats: number, rounds: number): number {
  return intervalMinutes * eligibleSeats * rounds;
}

/**
 * 周回の目安の文。適格な席が 1 つ以下では輪が回らず周回の条件が満ちないので、分の目安を出さずにそう言う
 * （席 × 間隔の積は「約 0 分」「約 3 分」の嘘になる・総合レビュー I2）。
 */
export function roundsEstimateText(intervalMinutes: number, eligibleSeats: number, rounds: number): string {
  if (eligibleSeats <= 1) return BREAK_TEXT.roundsUnavailableAlone;
  return BREAK_TEXT.roundsEstimate(roundsEstimateMinutes(intervalMinutes, eligibleSeats, rounds));
}
