/**
 * ルームの生死だけを返す（#274・ハブ専用）。**wire を知らない。**
 *
 * ## poker の `check-room` と関門の扱いが逆である
 *
 * poker の `handleCheckRoom`（`poker-handlers.ts`）は合言葉の関門（`mayEnter`）を通す。
 * **poker の wire には合言葉の項目が無く**、保護ルームへの poker からの新規参加は
 * そもそも成立しないためで、通さないと「入れないルームが実在するか」を教える神託になる
 * （`docs/adr/0011` 決定2 の #95 S5b 追記）。
 *
 * **ハブは通さない。** ハブは合言葉を送れるので、保護ルームは「入れるルーム」である。
 * ここで関門を通すと、**合言葉を持つ正規の招待客に「存在しない」と答える**。
 * 開示の水準はハブの `room.join` と同じに揃う —— あちらは保護ルームへ
 * `PASSPHRASE_REQUIRED` を返しており、存在を既に開示している。
 *
 * **この 2 つを「揃っていない」として揃えてはならない。** 入口の能力が違うので、
 * 生死の問いに対する正しい答えが違う。
 *
 * ## 在るときは何も返さない
 *
 * 無いときだけ応える（設計正本 D3）。無音の意味は「生きている」ではなく
 * **「生きている、または拒否された」**である（#103 以来の約束）。
 *
 * ## 読み取りだけである
 *
 * 名簿に触らない。接続を付けない・ツール状態を作らない・ラウンドを作らない。
 * 読み取りの問い合わせで状態が生まれると、誰も入っていないルームに中身が積み上がる。
 */
import { err, ok, type Result } from "neverthrow";
import type { ErrorCode } from "@tasuki/timer-core";
import type { RoomStore } from "../ports/room-store.js";
import type { RateLimitGate } from "./rate-limit-gate.js";

export interface CheckRoomDeps {
  /** **読むだけ。** 書ける口を渡さないことで、この関数が状態を作らないことを型で示す。 */
  store: Pick<RoomStore, "get">;
  rateLimitGate: Pick<RateLimitGate, "shouldReject" | "consume">;
}

export interface CheckRoomInput {
  connId: string;
  code: string;
}

export function checkRoom(deps: CheckRoomDeps, input: CheckRoomInput): Result<undefined, ErrorCode> {
  const { store, rateLimitGate } = deps;

  // レート制限に渡すのは単調時計（`Clock.now()` の壁時計ではない・#103 設計正本 D8）。
  const rateNow = performance.now();

  // **ルームを照会する前に判定する**（#103 設計正本 D3）。照会してから判定すると、
  // 残量が無いときに ROOM_NOT_FOUND が返り、攻撃者はトークンを消費せずに
  // 存在確認を続けられる。
  if (rateLimitGate.shouldReject(input.connId, rateNow)) return err("JOIN_RATE_LIMITED");

  if (store.get(input.code) === undefined) {
    // 失敗が確定したときだけ積む。**在るときは積まない** ——
    // 正常な招待客が枠を食うと、同じ NAT の後続が弾かれる。
    rateLimitGate.consume(input.connId, rateNow);
    return err("ROOM_NOT_FOUND");
  }

  return ok(undefined);
}
