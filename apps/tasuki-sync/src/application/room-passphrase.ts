/**
 * ルームの合言葉を設定・解除する（ハブの `room.passphrase.set`。#638）。
 *
 * かつては timer のコマンドで、`handlers.ts` の共通パイプラインから呼ばれた
 * （`command-handlers/room-passphrase-set.ts`）。合言葉が守るのは**ルーム全体の関門**
 * （`room-entry.ts`）なので、どの道具にも属さないハブ（玄関）の言葉へ移した。
 * 呼ぶのは `hub-handlers.ts` だけである。
 *
 * **在室確認と宛先の解決は呼び出し側の仕事**（ハブの接続が在席しているルームを引く）。
 * ここは保管の書き換えだけを担う。**在室者なら誰でも実行できる**（役割は無い・#95 S3）。
 *
 * 平文は {@link TokenStore}（`token-store.ts`）にだけ置く。名簿・snapshot・ログには載せない
 * （名簿が運ぶのは「付いているか」の印だけ。`roster-dto.ts`）。比較は `secure-compare.ts` の
 * 定時間比較で、参加の関門（`room-entry.ts` の `checkPassphrase`）が行う。
 */
import type { TokenStore } from "./token-store.js";

/**
 * 合言葉を設定・解除する。空文字・空白のみは解除。
 *
 * 前後の空白を正規化して保持する（設定側と参加側の `trim` の差による「正しいのに不一致」を防ぐ。
 * 参加側の比較も同じ `trim` を掛ける）。
 *
 * @returns 設定後に合言葉が付いているか
 */
export function applyRoomPassphrase(tokenStore: TokenStore, roomCode: string, raw: string): boolean {
  const passphrase = raw.trim();
  if (passphrase === "") {
    tokenStore.deletePassphrase(roomCode);
    return false;
  }
  tokenStore.setPassphrase(roomCode, passphrase);
  return true;
}
