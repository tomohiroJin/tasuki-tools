/**
 * 捨てたフレームが「画面を古くするもの」かどうかを、**検証器が返した経路から**決める（#212）。
 *
 * `parseServerMessage` は契約に合わないフレームを弾き、落ちた項目の経路を
 * `ProtocolError.paths` で渡してくる。その経路を見れば、捨てたのが
 * 画面の状態だったのかどうかが分かる。
 *
 * **フレーム自身が名乗る `type` は使わない。** それは契約検証に落ちた値であり、
 * 信頼できない。ここが使うのは**スキーマ自身の診断**なので、送り手の意図で曲げられない。
 *
 * ## 判定の向き —— 一過性の側を挙げる
 *
 * サーバー → クライアントは `joined` / `room-state` / `error` の 3 種しかなく、
 * **捨てて実害が出ないのは `error` だけ**である（`room-state` を捨てれば画面が固まり、
 * `joined` を捨てれば入室が成立しない）。そこで **`error` 固有の項目だけで落ちたときに
 * 限って一過性とみなし、それ以外はすべて「古くなる」側へ倒す。**
 *
 * この向きにすると、**知らない経路が来たときに安全側（古い）へ倒れる**。
 * 未知のキー名・`<root>`・`type` はいずれもここに入る。
 *
 * 経路の実測（2026-08-31・`ServerMessageSchema`）:
 *
 * | 捨てたフレーム | 経路 | 画面は古くなるか |
 * |---|---|---|
 * | 壊れた `room-state` | `participants.0.name` / `round.status` など | する |
 * | 壊れた `joined` | `token` / `roomId` / `participantId` | する |
 * | 余剰キーのあるフレーム | そのキー名（例: `evilKey`） | する（判別できない） |
 * | 素の数値・`null`・JSON として読めない | `<root>` | する（同上） |
 * | 配列・`type` 欠落・未知の `type` | `type` | する（同上） |
 * | 壊れた `error` | `code` / `message` | しない |
 *
 * **判別がつかないものは古い側へ倒す。** 画面が古いのに黙っているほうが、
 * 一時的に過剰へ倒れるより悪い（#212 はその「黙っている」を塞ぐための決定である）。
 */

/**
 * `error` フレームだけが持つ項目。**ここに挙がっていない経路は、すべて
 * 「画面を古くする」側へ倒れる。**
 *
 * `room-state` にも `joined` にも同名の項目は無い（`ServerMessageSchema` を実測）。
 */
const TRANSIENT_PATHS: readonly string[] = ['code', 'message'];

export function indicatesStaleState(paths: readonly string[]): boolean {
  // 経路が空なら、何が落ちたのかを説明できない。安全側（古い）へ倒す。
  if (paths.length === 0) return true;
  return !paths.every((path) => TRANSIENT_PATHS.includes(path));
}
