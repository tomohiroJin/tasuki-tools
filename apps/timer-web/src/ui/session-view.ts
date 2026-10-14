/**
 * Session の画面の判断（#370 で `Session.tsx` から出した。`docs/adr/0015` 決定 1）。
 * React にも I/O にも依存しない。
 */

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
  /** 輪の長さ（`session.rotation.length`）。ナビの添字はこれで回す。 */
  readonly rotationLength: number;
  readonly currentIndex: number;
  /** 次の番（サーバーが決める・#276 D1 / D6）。決まっていなければ null。 */
  readonly nextIndex: number | null;
  readonly navigatorEnabled: boolean;
}

export interface DriverNames {
  readonly current: string;
  readonly next: string;
  /** ナビ（⑦）。出さないときは null。 */
  readonly navigator: string | null;
}

/**
 * いまのドライバー・次・ナビの呼び名。
 *
 * 「次は誰か」はサーバーが決める（#276 D1 / D6）。かつて画面に `(currentIndex + 1) % rotationLen` が
 * あったが、サーバーは不適格な席を飛ばして繰り上げるので食い違った。
 *
 * ナビゲーター（⑦）は次ドライバーと別概念で、「現ドライバーの前の人（直前に運転していた退役ドライバー）」を
 * メインナビとする。文脈を最も持つ人。輪が 1 人のときは現ドライバーと一致するため出さない。
 * ⚠ 1 つ前の席が飛ばされた席のときは、直前に運転していない人を指しうる（#374 で直す。ここは移す前の式のまま）。
 */
export function driverNames({ names, rotationLength, currentIndex, nextIndex, navigatorEnabled }: DriverNamesInput): DriverNames {
  const prevIndex = rotationLength > 0 ? (currentIndex - 1 + rotationLength) % rotationLength : 0;
  return {
    current: names[currentIndex] ?? "—",
    next: nextIndex !== null ? (names[nextIndex] ?? "—") : "—",
    navigator: navigatorEnabled && rotationLength > 1 ? (names[prevIndex] ?? null) : null,
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
