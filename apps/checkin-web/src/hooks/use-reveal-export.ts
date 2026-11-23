/**
 * 開いた結果の持ち出しの、回ごとの状態（#676・設計 §16）。
 *
 * 書き出す時刻と、手で選ぶ欄を開いたままにするかは、**回（`seq`）ごとに、卓の出し入れで捨てられない層（`CheckinRoom`）で持つ**。
 * ［別のやり方］で卓ごと外れて［いまの回に戻る］で作り直されても、同じ回のあいだは時刻も欄も変わらない。次の回では取り直す・閉じる。
 * 時刻の意味は「**この端末で、その回の開いた結果を最初に出した時刻**」（再読み込みした人・後から入った人は、その人が出した時刻）。
 */
import { useCallback, useState } from 'react';

interface Session {
  readonly seq: number;
  readonly at: number;
  readonly manualKept: boolean;
}

export interface RevealExport {
  /** その回の結果を最初に出した時刻（epoch ms） */
  readonly at: number;
  readonly manualKept: boolean;
  readonly setManualKept: (kept: boolean) => void;
}

/** `revealedSeq` は、いま開いた結果を出している回の番号（開いていなければ null）。 */
export function useRevealExport(revealedSeq: number | null, now: () => number = Date.now): RevealExport | null {
  const [session, setSession] = useState<Session | null>(null);
  // 書き込みは回の番号で固定する（回が替わるまで同じ関数）。ほかの回への書き込みは捨てる
  const setManualKept = useCallback(
    (kept: boolean) => setSession((s) => (s !== null && s.seq === revealedSeq ? { ...s, manualKept: kept } : s)),
    [revealedSeq],
  );
  if (revealedSeq !== null && session?.seq !== revealedSeq) {
    // 描画の中で state を直す正規の形（同じ描画のうちに作り直される）。時刻は回が替わったときだけ読む
    setSession({ seq: revealedSeq, at: now(), manualKept: false });
    return null;
  }
  if (revealedSeq === null || session === null) return null;
  return {
    at: session.at,
    manualKept: session.manualKept,
    setManualKept,
  };
}
