/**
 * ルームへ入れるかの判定（#95 S5b）。**4 つの入口が同じものを通る**（#91 でお題が加わった）。
 *
 * ## 門の置き換え
 *
 * S4a〜S5a は**入口ごとの門**（`tool-gate.ts`）が越境を止めていた —— 「そのツールの
 * 状態があるルームにだけ入れる」。名簿を 1 つにしたことでルームコードの空間が両ツールで
 * 共有され、**合言葉の概念を持たない poker の入口から timer の保護ルームへ入れてしまう**
 * ためである（`docs/adr/0011` 決定 2 の S4a 追記）。
 *
 * S5b でツール状態を遅延生成にした（D8）ので、「そのツールの状態があるか」はもう
 * 参加の可否を意味しない。**代わりに合言葉がルーム参加の唯一の関門になる。**
 * ADR 0011 の同じ追記が「S5 で入口が 1 つになったときは、合言葉の検査がルーム参加の
 * 唯一の経路に集約される」と予告していた形である。
 *
 * ## 復帰は免除される
 *
 * 有効な復帰の組（そのルームの名簿に居る参加者を指すトークン）を持っている人は、
 * **一度その関門を通った人**である。再認証を求めない（S4b・D12 で同一性を端末へ
 * 移したときからの規律で、`join-room.ts` の復帰経路が先に return していたのと同じ）。
 *
 * ## poker は合言葉を送れない
 *
 * poker の wire には合言葉の項目が無い。したがって**保護ルームへの poker からの新規参加は
 * 成立しない**（存在しないルームと同一の応答で拒む）。選択画面で合言葉を通ってから
 * ツールを選べば入れるので、利用者の導線は塞がらない。旧入口は S5c で消える。
 */
import { err, ok, type Result } from "neverthrow";
import { findParticipant, type Participant, type Room } from "@tasuki/room-core";
import type { TokenStore } from "./token-store.js";
import { constantTimeEqual } from "./secure-compare.js";

/** 合言葉の関門を通らなかった理由。**入口ごとに wire への畳み方が違う。** */
export type PassphraseRejection = "PASSPHRASE_REQUIRED" | "PASSPHRASE_MISMATCH";

/**
 * 復帰の組が指す参加者を返す（無効なら `undefined`）。
 *
 * 判定は 2 段ある。**いま実際に越境を止めているのは後段の `findParticipant` である。**
 * トークンが指す参加者 ID が、要求されたルームの名簿に居なければ復帰は成立しない。
 * 参加者 ID は全ルームを通じて一意（poker は `crypto.randomUUID()`、timer は
 * `p_${nanoid(16)}`）なので、別ルームのトークンはここで必ず外れる。
 * **この 1 行を「冗長だ」として外してはならない。** 前段だけでは止まらない。
 *
 * 前段の `roomCode === code` は**現状では到達しない分岐**であり、変異検査でも殺せない
 * （外しても全テストが緑のまま。2026-09-10 実測）。それでも置くのは、ID 生成が変わって
 * 同じ ID が 2 つのルームに現れうる形になったときに唯一の防波堤になるためである。
 */
export function findResumableParticipant(
  tokenStore: Pick<TokenStore, "getResume">,
  room: Room,
  code: string,
  resumeToken: string | undefined,
): Participant | undefined {
  if (resumeToken === undefined) return undefined;
  const tokenData = tokenStore.getResume(resumeToken);
  if (tokenData === undefined || tokenData.roomCode !== code) return undefined;
  return findParticipant(room, tokenData.participantId);
}

/**
 * 合言葉の関門（R4-2）。**復帰が成立した人は呼び出し側が先に通すこと。**
 *
 * 保持側と同じく前後空白を正規化して比較する。秘密の照合は定数時間で行う
 * （`docs/adr/0012`・管理トークン／AI 解錠と同じ規律）。
 *
 * 合言葉が設定されていないルームは誰でも入れる（`required === undefined`）。
 */
export function checkPassphrase(
  required: string | undefined,
  provided: string | undefined,
): Result<undefined, PassphraseRejection> {
  if (required === undefined) return ok(undefined);
  const given = (provided ?? "").trim();
  if (constantTimeEqual(given, required)) return ok(undefined);
  return err(given ? "PASSPHRASE_MISMATCH" : "PASSPHRASE_REQUIRED");
}
