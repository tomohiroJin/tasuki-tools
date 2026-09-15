/**
 * 退出したことの告知を URL から読み取る（#95 S5c・I-1）。
 *
 * ツール（timer / poker）は退出が成立すると玄関へ送り直すが、**告知のバナーは
 * 遷移で失われる**。とりわけ外された人は説明抜きで名乗りの画面に着き、外されたと
 * 分からずに再参加してまた外される（Issue #32 が塞いだ問題の再発）。
 * 理由だけを URL で運び、文言はここで引く。
 *
 * **綴りの正本は `@tasuki/room-core` の 1 か所**である（送る側と読む側で割れないため）。
 *
 * 読んだ印は URL から落とす。残すと、再読込のたびに同じ告知が出て、
 * 「いま外された」と誤って伝わる。
 */
import { DEPARTURE_PARAM, departureNoticeFor, parseDepartureReason } from '@tasuki/room-core';

export interface DepartureNotice {
  /** 出すべき告知（無ければ null）。 */
  readonly notice: string | null;
  /** 印を落とした後の URL（`history.replaceState` へ渡す）。 */
  readonly cleanedHref: string;
}

/** URL から告知を読み、印を落とした URL と一緒に返す。 */
export function readDepartureNotice(href: string): DepartureNotice {
  const url = new URL(href);
  const reason = parseDepartureReason(url.searchParams.get(DEPARTURE_PARAM));
  url.searchParams.delete(DEPARTURE_PARAM);
  return {
    notice: reason === null ? null : departureNoticeFor(reason),
    cleanedHref: url.toString(),
  };
}
