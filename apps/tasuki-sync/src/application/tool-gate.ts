/**
 * 入口ごとの門（#95 S4a）。**そのツールの状態があるルームにだけ入れる。**
 *
 * 名簿の保管を 1 つにした結果、ルームコードの空間が両ツールで共有された。門が無いと
 * パスフレーズ保護された timer のルームへ poker の入口から入れてしまう（poker 側に
 * 合言葉の概念が無い）。応答は「存在しないルーム」と同一にする —— 区別できると
 * ルームコード列挙の手がかりになる（`docs/adr/0011`）。
 *
 * ## 判定材料は「ツールの状態」であって印ではない
 *
 * 名簿（`@tasuki/room-core` の `Room`）には、どちらの入口で作られたかを示す欄が無い。
 * **足さない。** 門は timer の状態（`TimerStore`）と poker のラウンド（`RoundStore`）の
 * 有無だけで判定する。**S5 で入口が 1 つになると、この門は D8 のツール状態の
 * 遅延生成に置き換わる** —— そのとき「入口で作られた印」は嘘になるが、
 * 「そのツールの状態があるか」はそのまま意味を持ち続ける。
 *
 * ## 2 つの入口で同じ 1 個を使う
 *
 * 生成は配線（`create-sync-server.ts`）が 1 度だけ行い、timer の `makeHandlers` と
 * poker の `makeHandlers` の両方へ同じインスタンスを渡す。規則が 1 箇所にしか
 * 無いことが、片方の入口だけが直る／片方だけが緩む事故を防ぐ。
 */

/** 門が判定に使う材料。どちらも「そのルームにそのツールの状態があるか」だけを答える。 */
export interface ToolGateDeps {
  /** timer の状態（`TimerStore`）がそのルームコードにあるか。 */
  hasTimerState: (code: string) => boolean;
  /** poker のラウンド（`RoundStore`）がそのルームコードにあるか。 */
  hasRound: (code: string) => boolean;
}

export interface ToolGate {
  /**
   * その入口からそのルームへ入ってよいか。
   *
   * **false のときの応答は「存在しないルーム」と完全に同一にすること**
   * （コード・文言・レート制限の積算まで）。呼び出し側の責務である。
   */
  canEnterVia(tool: "timer" | "poker", code: string): boolean;
}

export function createToolGate(deps: ToolGateDeps): ToolGate {
  return {
    canEnterVia(tool: "timer" | "poker", code: string): boolean {
      return tool === "timer" ? deps.hasTimerState(code) : deps.hasRound(code);
    },
  };
}
