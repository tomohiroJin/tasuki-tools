/**
 * 入室失敗のレート制限（#103）の**判定順序**を閉じ込めたゲート。
 *
 * ## なぜ 1 枚挟むのか
 *
 * この機能の要は「限度を超えたか」ではなく**呼ぶ順序**である。
 *
 * 1. `shouldReject` を**資源（ルーム）を照会する前に**呼ぶ
 * 2. 照会の結果「無かった」と分かったときだけ `consume` する
 *
 * 逆順にすると、残量が無いときに `room-not-found` が返り、攻撃者はトークンを
 * 消費せずにルーム ID の存在確認を続けられる（#103 設計正本 D3）。
 * 順序は 2 箇所（`join-room` と `check-room`）で必要なので、順序そのものを
 * 型で表してここに置く。呼び出し側は「切符を取る → 拒否なら返す → 空振りなら消費」
 * の形しか書けない。
 *
 * ## 数える単位
 *
 * **接続ではなくクライアント（IP の HMAC）**である。接続単位だと再接続で窓が
 * リセットされ、ルーム ID の総当たりを止められない。鍵は接続の受理時に決まり
 * （`ConnectionData.rateKey`）、ここへは決まった鍵が渡ってくるだけである。
 *
 * poker には合言葉が無く、`check-room` が存在確認そのものなので、
 * join と check は同じバケツを共有する。
 *
 * ## 渡す `now` は単調時計であること
 *
 * `MonotonicClock`（`performance.now()` 相当）でなければならない（設計正本 D8・MUST）。
 * `Date.now()` は NTP のステップ調整で非単調になりうる。ルームの会計に使う壁時計とは
 * **別系統**であり、混同しないこと。poker のドメインには時刻フィールドが 1 つも無いため、
 * このゲートが単調時計の唯一の利用者である。
 *
 * **時計は 1 判定につき 1 度だけ読む。** `shouldReject` と `consume` に別の時刻を
 * 渡すと、その差のぶんだけトークンが補充されて判定と消費が食い違う。切符
 * （{@link RateLimitDecision}）が読んだ時刻を保持することでこれを構造的に防ぐ。
 *
 * ## timer 側のゲートとの違い（#366 で名前を分けた）
 *
 * timer・ハブ・お題・ルーレットの入口は `rate-limit-gate.ts` の `RateLimitGate` を通す。あちらは**接続 ID
 * から鍵を引く**（接続の受理時に `connId → 鍵` の対応を登録する）。こちらは**鍵を直接受ける** ——
 * poker の接続は `ws.data.rateKey` に鍵を持つので、対応表が要らない（`handlers.ts` の注記）。
 * バケツ（`RateLimiter`）は同じ 1 本を共有する。API をそろえると poker が対応表を持つことになり、
 * 設計の判断が変わるので、そろえない。以前は両方が `RateLimitGate` という同じ名前だった。
 */
import type { MonotonicClock } from '../ports/poker-monotonic-clock.js';
import type { RateLimiter } from '@tasuki/rate-limit';

/** 1 回ぶんの判定。`begin()` が返す「切符」。 */
export interface RateLimitDecision {
  /** 残量が無い（＝拒否すべき）。**true なら資源を照会せずに rate-limited を返す。** */
  readonly rejected: boolean;
  /**
   * 照会の結果「無かった」と分かったときだけ呼ぶ。トークンを 1 つ消費する。
   * 成功した照会では呼ばない（正当な利用者の残量を削らない）。
   */
  consumeOnMiss(): void;
}

export interface PokerRateLimitGate {
  /**
   * 1 回ぶんの判定を始める。**資源を照会する前に呼ぶ。**
   * 単調時計はこの時点で 1 度だけ読み、同じ値を `consumeOnMiss()` にも使う。
   */
  begin(rateKey: string): RateLimitDecision;
}

export interface PokerRateLimitGateDeps {
  clock: MonotonicClock;
  rateLimiter: RateLimiter;
}

export function createPokerRateLimitGate({ clock, rateLimiter }: PokerRateLimitGateDeps): PokerRateLimitGate {
  return {
    begin(rateKey) {
      const now = clock.now();
      return {
        rejected: rateLimiter.shouldReject(rateKey, now),
        consumeOnMiss: () => rateLimiter.consume(rateKey, now),
      };
    },
  };
}
