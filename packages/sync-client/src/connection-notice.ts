/**
 * 接続状態を、利用者へ伝える告知の種類に翻訳する規則（#76 F-2・#212）。
 *
 * 「まだ繋ぎに行っている途中」「切れたが戻る見込みがある」「繋がらない」「繋がっているのに
 * 契約に合わないフレームを捨てて画面が古い」を区別する。**文言は持たない**（利用者に見える言葉は
 * `@tasuki/web-kit/room` の `connectionNotice` が持つ。書体の base 層の検査もそこで掛かる）。
 *
 * **写しはもう無い**（#94 PR 2 のレビュー）。poker-web・お題ツール・ルーレットが同じ規則と
 * 同じ閾値を別々に持っていたので、ここへ寄せた。
 */

/** 接続の状態（`SyncConnection` の開閉を画面の語彙にしたもの）。 */
export type ConnectionStatus = "connecting" | "open" | "closed";

export type ConnectionNoticeKind = "none" | "reconnecting" | "unreachable" | "stale";

/**
 * 一度繋がった後、ここまで連続で失敗したら「戻る見込み」を諦めて伝え方を変える。
 *
 * **export しない**（製品コードでこの値を読む場所は無く、諦めたことは
 * {@link connectionNoticeKind} が `unreachable` を返して伝える）。
 */
const GIVE_UP_AFTER_ATTEMPTS = 3;

export function connectionNoticeKind(input: {
  readonly status: ConnectionStatus;
  /** この画面で一度でも接続が確立したか */
  readonly everConnected: boolean;
  /** 直近の接続確立以降、連続して失敗した回数 */
  readonly failedAttempts: number;
  /** 契約に合わないフレームを捨てて以降、新しい状態を受け取れていないか（#212） */
  readonly syncStale: boolean;
}): ConnectionNoticeKind {
  // **接続が切れているなら、そちらが先に伝えるべきことである。** 同期が古いのは
  // 切断の結果でもあり、再接続すれば新しい状態が届いて解消しうる。
  if (input.status === "open") return input.syncStale ? "stale" : "none";
  // 開いた直後のまだ失敗していない一瞬に警告を出すと、正常時にちらつくだけで害になる。
  if (input.failedAttempts === 0) return "none";
  // 一度も繋がっていないなら「切断された」わけではない。待っても直らないので最初から伝える。
  if (!input.everConnected) return "unreachable";
  // 使えていた接続が切れた場合は、まず自動復帰に賭ける。戻らないと分かったら言い方を変える。
  return input.failedAttempts >= GIVE_UP_AFTER_ATTEMPTS ? "unreachable" : "reconnecting";
}
