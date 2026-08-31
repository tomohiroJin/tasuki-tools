/**
 * 捨てたフレームが「画面を古くするもの」かどうかを、**検証器が返した経路から**決める（#209）。
 *
 * `dispatch.ts` は契約に合わないフレームを捨て、落ちた項目の経路だけを渡してくる。
 * その経路を見れば、捨てたのがルームの状態だったかどうかが分かる。
 *
 * **フレーム自身が名乗る `type` は使わない。** それは契約検証に落ちた値であり、
 * 信頼できない。ここが使うのは**スキーマ自身の診断**なので、送り手の意図で曲げられない。
 *
 * 経路の実測（2026-08-31・`ServerMsgSchema`）:
 *
 * | 捨てたフレーム | 経路 | 画面は古くなるか |
 * |---|---|---|
 * | 壊れた `snapshot` | `room.config.members.0` | する |
 * | `room` が数値／欠落 | `room` | する |
 * | 素の数値・`null`・文字列 | `<root>` | する（何だったか分からない） |
 * | 配列・`type` 欠落・未知の `type` | `type` | する（何だったか分からない） |
 * | 壊れた `signal` | `nextDriverName` など | しない |
 * | 壊れた `error` | `message` | しない |
 * | 壊れた `room.joined` | `resumeToken` | しない |
 *
 * **判別がつかないものは古い側へ倒す。** 画面が古いのに黙っているほうが、
 * 一時的に過剰へ倒れるより悪い（#209 はその「黙っている」を塞ぐための決定である）。
 */

/** 落ちた項目が 1 つも分からないときの経路（`dispatch.ts` が入れる）。 */
const ROOT = "<root>";
/** どの種類のフレームかを決められなかったときの経路。 */
const DISCRIMINANT = "type";
/** ルームの状態そのものを載せている項目。 */
const ROOM = "room";

export function indicatesStaleRoom(paths: readonly string[]): boolean {
  // 経路が空なら、何が落ちたのかを説明できない。安全側（古い）へ倒す。
  if (paths.length === 0) return true;
  return paths.some(
    (path) =>
      path === ROOT ||
      path === DISCRIMINANT ||
      path === ROOM ||
      // `roomName` のような別項目を巻き込まないよう、区切りまで含めて見る。
      path.startsWith(`${ROOM}.`),
  );
}
