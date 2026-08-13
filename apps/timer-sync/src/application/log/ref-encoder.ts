/**
 * ログの相関 ID を作る（ADR 0012 D2）。
 *
 * **部分表示（先頭 N 文字）は採らない。** ルーム名つきのルームコードは推測困難な
 * 部分が短く、一部が漏れると探索空間が実用的な範囲へ落ちる（設計正本 2.3 節）。
 *
 * ソルトはプロセス起動ごとに変える。再起動をまたぐと相関は切れるが、
 * 共有状態が揮発する設計（憲法 III）と整合するので受け入れる。
 *
 * ソルトは引数で受け取る（憲法 VI: 副作用はアダプタに置き、ドメインへは注入する）。
 */
import { createHmac } from "node:crypto";
import type { LogSafe } from "./log-safe.js";

export interface RefEncoder {
  /** ルームコードから相関 ID を作る（`r_` 接頭辞）。 */
  room(code: string): LogSafe;
  /** リクエスト ID から相関 ID を作る（`q_` 接頭辞）。 */
  request(requestId: string): LogSafe;
}

/** 種別ごとに名前空間を分ける。同じ文字列でも種別が違えば別の ID になる。 */
function digest(salt: Buffer, kind: string, value: string): string {
  return createHmac("sha256", salt)
    .update(kind)
    .update(" ")
    .update(value)
    .digest("hex")
    .slice(0, 8);
}

export function createRefEncoder(salt: Buffer): RefEncoder {
  return {
    room: (code) => `r_${digest(salt, "room", code)}` as LogSafe,
    request: (requestId) => `q_${digest(salt, "request", requestId)}` as LogSafe,
  };
}
