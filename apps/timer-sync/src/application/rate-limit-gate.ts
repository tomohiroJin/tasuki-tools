/**
 * 接続 ID とクライアント鍵の橋渡し。
 *
 * ## なぜ 1 枚挟むのか
 *
 * ハンドラは `connId` しか持っていない。一方、数える単位はクライアント鍵（IP の HMAC）
 * である。この対応表をここに閉じ込めることで、ハンドラ側の呼び出しは `connId` のまま
 * 変わらず、`@tasuki/rate-limit` は接続という概念を知らずに済む。
 *
 * ## 未登録の connId が自分自身を鍵にする理由
 *
 * 業務ロジックのテストは WS アダプタを通さず `handlers.handleCommand("conn-1", ...)` を
 * 直接呼ぶ。その経路では `open()` が呼ばれないので鍵が無い。`connId` へ落とすことで、
 * それらのテストは従来どおり「接続ごとに独立」の挙動で動き続ける。
 *
 * ## 渡す `now` は単調時計であること
 *
 * `shouldReject` / `consume` の `now` は `performance.now()`（単調時計）でなければ
 * ならない（設計正本 `2026-08-14-ip-rate-limit-design.md` D8）。ルームの会計に使う
 * `Clock.now()`（epoch ms の壁時計）とは**別系統**であり、混同してはいけない。
 * ゲート自身は `now` を解釈せずそのまま限定器へ渡すだけなので、この契約を守る責務は
 * 呼び出し元（`room-join.ts` / `ai-unlock.ts`）にある。
 *
 * ## 保持期間
 *
 * 対応表のエントリは接続の生存期間だけ存在する（`open` で入り `close` で消える）。
 * **鍵は IP の HMAC であり、生の IP はここまで届かない。**
 *
 * ⚠ この保持は `docs/adr/0012` D3 の現行文（「レート制限の窓が閉じたら、ハッシュ値も
 * 破棄する（MUST）」）より長い。長寿命の WebSocket 接続を IP 単位で縛るには接続の
 * 生存期間ぶん相関キーを覚える以外に方法がなく、設計正本 D7 がこの保持を選んだうえで
 * **ADR 0012 D3 の改訂を要求している**（改訂そのものは #103 の後続タスク）。
 */
import type { RateLimiter } from "@tasuki/rate-limit";

export interface RateLimitGate {
  /** 接続の受理時に、その接続が属するクライアント鍵を登録する。 */
  open(connId: string, rateKey: string): void;
  /**
   * 接続クローズ時に対応を捨てる。
   *
   * **`open()` を経ていない `connId` に対しても呼ばれる**（`onConnect` が throw した
   * 接続でも `onDisconnect` は通知される。`WsAdapterOptions.onDisconnect` の契約）。
   * したがって未知の `connId` でも安全でなければならない。
   */
  close(connId: string): void;
  /** **資源を照会する前に呼ぶ。** 残量が無ければ true。 */
  shouldReject(connId: string, now: number): boolean;
  /** 失敗が確定したときだけ呼ぶ。 */
  consume(connId: string, now: number): void;
}

export function createRateLimitGate(limiter: RateLimiter): RateLimitGate {
  /** connId → クライアント鍵 */
  const keys = new Map<string, string>();
  const keyOf = (connId: string): string => keys.get(connId) ?? connId;

  return {
    open(connId, rateKey) {
      keys.set(connId, rateKey);
    },
    // Map#delete は未知のキーでも false を返すだけで throw しない（上の契約を満たす）。
    close(connId) {
      keys.delete(connId);
    },
    shouldReject: (connId, now) => limiter.shouldReject(keyOf(connId), now),
    consume: (connId, now) => limiter.consume(keyOf(connId), now),
  };
}
