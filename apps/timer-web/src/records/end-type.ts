/**
 * セッションの終わり方（#592）。
 * 完成（complete）か中断（abort）か。記録・同期・画面が共有する型なので、画面（`ui/Summary.tsx`）ではなく内側に置く。
 */
export type EndType = "complete" | "abort";
