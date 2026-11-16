/** 待ちの共通部分（タイムアウトの既定・無音の観測時間・前提の構築に失敗したときのエラー）。 */

/** 待ちの既定タイムアウト（ms）。実 I/O を挟むので in-process より長く取る。 */
export const DEFAULT_TIMEOUT_MS = 3_000;
/** 「これ以上は届かない」を確かめるときの観測時間（ms）。 */
export const SILENCE_MS = 200;

/** 前提の構築（接続・ルーム作成など）に失敗したことを表すエラー。検証の失敗と区別する。 */
export class LiveSetupError extends Error {
  constructor(message: string) {
    super(`live-sync-server: ${message}`);
    this.name = "LiveSetupError";
  }
}
