/**
 * Session の画面の判断（#370 で `Session.tsx` から出した。`docs/adr/0015` 決定 1）。
 * React にも I/O にも依存しない。
 */

import type { SeatSkipReason } from "@tasuki/timer-core";

/** 残り時間がこの秒数以下で緊急表示にする */
export const URGENT_THRESHOLD_SECONDS = 10;

/**
 * 表示用の残り時間。サーバー権威の残り（0 でクランプ済み）を、上は間隔で抑える。
 *
 * 交代直後に clockOffset 等で残りが一瞬 interval を僅かに超え、ceil 表示で「05:01」のような
 * interval+1 秒が1フレーム出るのを防ぐ（0 下限は `secondsLeft` 側）。
 */
export function displayRemainingSeconds(intervalSeconds: number, secondsLeft: number): number {
  return Math.min(intervalSeconds, secondsLeft);
}

export interface DriverNamesInput {
  /** 輪の席の呼び名（輪と同じ順）。 */
  readonly names: readonly string[];
  /** 輪の席が飛ばされる理由（輪と同じ順・`Seat.skipReason`）。null は「番が回る」。 */
  readonly skipReasons: readonly (SeatSkipReason | null)[];
  readonly currentIndex: number;
  /** 次の番（サーバーが決める・#276 D1 / D6）。決まっていなければ null。 */
  readonly nextIndex: number | null;
  /**
   * 直前に実際に運転した人の席（サーバーが持つ・#374）。分からなければ null。
   * 旧サーバーは項目を送らないので、呼び出し側は `?? null` で渡す。
   */
  readonly previousDriverIndex: number | null;
  readonly navigatorEnabled: boolean;
}

export interface DriverNames {
  readonly current: string;
  readonly next: string;
  /** ナビ（⑦）。出さないときは null。 */
  readonly navigator: string | null;
}

/** ナビを隠す飛ばされる理由（#374）。不在（away）は含めない（`driverNames` の注記）。 */
function hidesNavigator(reason: SeatSkipReason | null | undefined): boolean {
  return reason === "stood-down" || reason === "disconnected";
}

/**
 * いまのドライバー・次・ナビの呼び名。
 *
 * 「次は誰か」はサーバーが決める（#276 D1 / D6）。かつて画面に `(currentIndex + 1) % rotationLen` が
 * あったが、サーバーは不適格な席を飛ばして繰り上げるので食い違った。
 *
 * ナビゲーター（⑦）は次ドライバーと別概念で、「直前に運転していた退役ドライバー」をメインナビとする。
 * 文脈を最も持つ人。**「直前に運転した人」もサーバーが決める**（#374）。かつてここは輪の上の
 * 1 つ前の席（`(currentIndex - 1 + len) % len`）を引いていたが、交代は飛ばされる席を飛ばし、
 * 強制指名は輪のどこへでも飛ぶので、運転していない人をナビに出していた。席の状態は「いま」しか
 * 持たないので、画面が逆向きにたどっても復元できない（運転の後に戻った人・強制指名・並べ替え）。
 *
 * 次のときはナビを出さない（分からない・務められない。輪が 1 人のときと同じ作法）:
 * - 直前の人が分からない（交代前・輪から外れた・旧サーバー）
 * - 直前の人の席がいまの運転者と同じ（削除で添字が詰まったとき）
 * - 直前の人が本人の選んだ見送り（stood-down）中か、切断している —— ナビを務められない
 *
 * **不在（away）では隠さない。** timer のタブに居ないだけ（ハブや poker のタブへ移った）で、
 * 隠すとタブを切り替えるたびに全員の画面でナビが点滅する。
 */
export function driverNames({
  names,
  skipReasons,
  currentIndex,
  nextIndex,
  previousDriverIndex,
  navigatorEnabled,
}: DriverNamesInput): DriverNames {
  const navigatorSeat =
    navigatorEnabled &&
    previousDriverIndex !== null &&
    previousDriverIndex !== currentIndex &&
    !hidesNavigator(skipReasons[previousDriverIndex])
      ? previousDriverIndex
      : null;
  return {
    current: names[currentIndex] ?? "—",
    next: nextIndex !== null ? (names[nextIndex] ?? "—") : "—",
    navigator: navigatorSeat !== null ? (names[navigatorSeat] ?? null) : null,
  };
}

/** 動いていて、残りが閾値以下なら急ぎ。 */
export function isUrgent(running: boolean, remainingSeconds: number): boolean {
  return running && remainingSeconds <= URGENT_THRESHOLD_SECONDS;
}

/** 間隔のうち過ぎた割合（%）。間隔が 0 なら 1 秒として扱う（0 除算を避ける）。 */
export function progressPercent(intervalSeconds: number, remainingSeconds: number): number {
  const interval = intervalSeconds || 1;
  return ((interval - remainingSeconds) / interval) * 100;
}

/**
 * 円形計器の大きさ（px）。PC ではタイマーを主役として大きく見せる。
 *
 * モバイルでは固定 px の計器が Card 内に収まるよう、ビューポート幅から利用可能幅
 * （Stage px-4=32 + Card p-6=48 + 枠 2 を差し引く）でクランプする。これで 360px 幅でも
 * TeamOrbit/CircularProgress が横にはみ出さない（R5-3）。リング（タイマー）は orbit に対して
 * 概ね 224/340 の比率を保ち、アバターと重ならない大きさにする。
 * （CSS へ移すかは #372 で判断する。）
 */
export function orbitSizes(isWide: boolean, viewportWidth: number): { orbit: number; ring: number } {
  const mobileMaxOrbit = Math.min(340, Math.max(248, viewportWidth - 82));
  return {
    orbit: isWide ? 460 : mobileMaxOrbit,
    ring: isWide ? 300 : Math.round(mobileMaxOrbit * (224 / 340)),
  };
}
