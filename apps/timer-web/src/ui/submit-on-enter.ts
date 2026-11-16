/** Enter で送る（レビュー指摘4）。閉じずにその場で直させる形にした以上、直後の自然な操作はこれ。 */
export interface EnterKeyEvent {
  key: string;
  /** 旧い入力経路向け。かな漢字変換の確定中は 229 になる */
  keyCode?: number;
  /** React の合成イベントは変換中かどうかを nativeEvent に持つ（React の型は読まない） */
  nativeEvent?: { isComposing?: boolean };
  preventDefault(): void;
}

/**
 * かな漢字変換の確定の Enter（`isComposing` か `keyCode === 229`）は変換の確定であって、送信の合図ではない。
 * 変換中は送らず、`preventDefault` もしない（確定そのものを止めない）。
 */
export const submitOnEnter = (submit: () => void) => (e: EnterKeyEvent) => {
  if (e.key !== "Enter") return;
  if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  submit();
};
