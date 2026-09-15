/**
 * ルームの画面が決まるまでの受け皿（#95 S5c 追補・利用者の実画面フィードバック）。
 *
 * **旧入口を撤去した副作用を埋める。** `AppMode` から `setup` / `join` が消えたので、
 * 復帰の `room.join` に対する snapshot が届くまで `mode` は `null` のままになり、
 * `App.tsx` は何も描かなかった（`StatusStrip` も `mode === null` では出ない）。
 * 撤去前はここに `Setup` が居た —— 選択画面から timer を開いた人には、
 * その間ずっと白い画面しか見えない（dev で実測して約 300ms、実ブラウザの
 * 初回読み込みではさらに延びる）。
 *
 * 意匠は既にある「お題を準備中です…」の待ち表示（`Lobby.tsx`）に合わせてある。
 * 凝ったものは要らない —— **いま何も出ていないのではなく待っている**と分かればよい。
 */
export function Loading() {
  return (
    <div className="py-16 text-center text-[var(--bone-subtle)]" role="status" aria-live="polite">
      {/* 点滅する点は装飾。読み上げは下の文言だけで足りる */}
      <span
        className="inline-block h-4 w-4 animate-pulse rounded-full bg-[var(--signal)] mb-2"
        aria-hidden="true"
      />
      <p>読み込んでいます…</p>
    </div>
  );
}
