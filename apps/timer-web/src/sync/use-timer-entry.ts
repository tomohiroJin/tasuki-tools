/**
 * 開かれた URL から入口を決めて適用する（#95 S5c・R9。#369 Task 10 で `use-timer-sync.ts` から分けた）。
 * **mount 時の一度きり。**
 *
 * 判定の正本は `decideEntry` 1 つに保つ（#95 S5c のレビュー指摘）。ここで独自に
 * `?room=` だけを見ると、`?view=history&room=CODE` のように「記録を見るだけ」の
 * URL でも `room.join` を送ってしまい、見ているだけの人が他の参加者の名簿に現れる
 * （在席は接続に紐づく・#95 S4b）。
 *
 * | URL | すること |
 * |---|---|
 * | `?view=history`（`?room=` の有無を問わず） | 何もしない（画面側が履歴を出す） |
 * | `?room=CODE` ＋ 端末に同一性あり | `resume` を呼ぶ（保存済みの `resumeToken` で `room.join`・#76 F-3） |
 * | `?room=CODE` ＋ 同一性なし | **玄関のそのルームへ replace**（名乗りはハブに 1 つ） |
 * | それ以外 | **玄関へ replace**（旧入口を撤去したので行き先が無い） |
 *
 * 送るのは `replace` である。`assign` だと、戻るボタンが行き場の無い URL へ戻り、
 * そこからまた送り返される往復になる。
 */
import { useEffect, useRef } from "react";
import { loadResumeIdentity, type ResumeIdentity } from "@tasuki/sync-client";
import { shouldResumeOnLoad } from "./resume-identity.js";
import { decideEntry, hubRoomPath } from "../ui/entry.js";
import { currentSearch, redirectTo } from "../platform/location.js";
import { useLatestRef } from "../ui/use-latest-ref.js";

/**
 * @param resume 端末に同一性があるときに、そのルームへ入る手順（接続を張って `room.join` を送る）。
 *   毎レンダー作り直されてよい（最新を ref で読む。このファイルの effect は mount 時の 1 回きり）。
 */
export function useTimerEntry(resume: (code: string, saved: ResumeIdentity) => void): void {
  // 入口の適用（`decideEntry` の結果）を mount 時の一度きりにするためのガード。
  const entryAppliedRef = useRef(false);
  const resumeRef = useLatestRef(resume);

  useEffect(() => {
    if (entryAppliedRef.current) return;
    entryAppliedRef.current = true;
    const entry = decideEntry(currentSearch());
    if (entry.kind === "redirect") {
      redirectTo(entry.to);
      return;
    }
    if (entry.kind === "history") return;
    const code = entry.code;

    const saved = loadResumeIdentity(code);
    if (!shouldResumeOnLoad(saved, code)) {
      // 名乗りはハブに 1 つだけある。**コードは落とさずに運ぶ** —— 落とすと、
      // リンクで来た人が入りたかったルームを失う。
      redirectTo(hubRoomPath(code));
      return;
    }
    resumeRef.current(code, saved);
    // 依存は ref のみで、再生成されない。ref オブジェクトの同一性はレンダーを跨いで
    // 保たれるため、依存に挙げてもこの effect は mount 時の 1 回きり。
  }, [resumeRef]);
}
