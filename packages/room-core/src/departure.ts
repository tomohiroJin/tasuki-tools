/**
 * 退出したことを玄関（ハブ）へ伝える言葉（#95 S5c・I-1）。
 *
 * **退出の告知は遷移で失われる。** timer は退出が成立すると玄関へ送り直すが、
 * 「抜けた／外された」を伝えるバナーは遷移の前に破棄される。とりわけ**外された人は
 * 説明抜きで名乗りの画面に着く**ので、外されたと分からずに再参加し、また外される
 * （Issue #32 が塞いだ「退出が分からない」問題がそのまま戻る）。
 *
 * そこで**理由だけを URL に載せて運び、玄関側が告知を出す**。ここに置くのは、
 * **綴りを 1 つにするため**である —— 送る側（ツール）と読む側（玄関）が別々に
 * 文字列を書くと、片方を直したときにもう片方が黙って効かなくなる。
 *
 * 文言は `@tasuki/timer-core` の `error-messages.ts` が持つものと**一字一句同じ**にしてある。
 * 玄関は timer のドメインに依存しない（`docs/adr/0017`）ので取り込めないが、
 * 利用者から見れば同じ出来事なので、見える文字まで揃える。**どちらも既にある UI 文言なので、
 * 自己ホスト書体の base 層に収まっている**（`packages/ui/README.md`）。
 */

/** 退出の理由を運ぶクエリの名前。 */
export const DEPARTURE_PARAM = "left";

/** 退出の理由。`error-action.ts` の `errorAction()` が返す `leave-room` の `reason` と
 * 1 対 1 に対応する。**行き先はこの理由では分岐しない**（#290・D3）——
 * ルームがまだ在るかを判断するのは玄関であって、退出した本人ではない。 */
export type DepartureReason = "self" | "removed";

/** 玄関が受け取った値を理由へ直す。知らない値は null（告知を出さない）。 */
export function parseDepartureReason(value: string | null): DepartureReason | null {
  return value === "self" || value === "removed" ? value : null;
}

/** その理由を利用者へ伝える文。 */
export function departureNoticeFor(reason: DepartureReason): string {
  return reason === "self"
    ? "ルームから抜けました。"
    : "ルームから退出しました。再参加するには名前を入力してください。";
}
