# plan: App.tsx の state/ref 二重管理を解消する（Issue #41）

## 方針

**採用: 「useLatestRef 経由の4本を、1本の集約 ref にまとめる」（reducer 化はしない）**

### 検討した選択肢

1. **reducer 化**（#28 の「あるべき姿」の一案）
   - `room` / `endType` / `participantId` / `generatingProblem` を1つの `useReducer` に
     統合し、`useLatestRef` を1回だけ呼ぶ。
   - 却下理由: 4つの state は更新タイミングが独立している
     （`room` は `onRoom` snapshot、`participantId` は `onIdentity`、`endType` は
     `handleComplete`/`handleAbort`、`generatingProblem` は `beginGenerating`/
     `endGenerating` と、発生源も更新の粒度もバラバラ）。reducer 化すると
     action 型・reducer 関数の新設が必要になり、変更差分と退行リスクが
     「二重管理の解消」という目的に対して過大になる（YAGNI 違反）。
2. **`useEffect` ＋ 1本の ref に集約**（#28 の「あるべき姿」のもう一案）
   - 却下理由: `useLatestRef` の同期は意図的に **render 本体内**で行っている
     （`use-latest-ref.ts` のコメント参照）。`setState` 直後、同一同期区間内で
     ref を読む既存コード（`onError` の `leave-room` 分岐で `roomRef.current` を
     `setRoom(null)` 前に読む等）があり、`useEffect` に変えると 1 レンダー分
     古い値を読む退行が生じる。
3. **採用: 4本の `useLatestRef` 呼び出しを、1本の `useLatestRef({ room, endType,
   participantId, generatingProblem })` 呼び出しに置き換える**
   - `useLatestRef<T>` は既に汎用（`T` は任意の型。オブジェクトも可、
     `apps/web/test/ui/use-latest-ref.test.tsx` の「オブジェクト/null も値として
     そのまま保持できる」で検証済み）。
   - render 本体内で `{ room, endType, participantId, generatingProblem }` という
     新しいオブジェクトを毎レンダー作り直して渡すだけで、既存の
     「render 本体内で ref.current を同期する」タイミングは完全に保たれる
     （4本のときと1本のときで、値が最新化される瞬間は同じレンダーパス内）。
   - 変更は「宣言1箇所の統合」＋「16箇所の参照を `latestRef.current.room` 等に
     書き換える」という機械的な差分に収まり、`useLatestRef` 自体のロジックは
     一切変えない（= 最もリスクが低い）。

### 二重管理の残り方について

REQ-1 は「ref 宣言を1本に集約する」ことを要求しており、state 自体
（`useState` 4本）はそのまま残る。これは意図的な選択である。
`room` などは画面描画にも使われる値であり、closure 用の ref と render 用の
state という「2つの読み方」が要る構造そのものは、`makeClient` のコールバックが
closure である以上避けられない（`use-latest-ref.ts` の設計コメントに明記済み）。
Issue #41 が問題視しているのは「ref の同期処理が state ごとに手書きで散っている」
点であり、これは集約 ref 1本で解消できる。

## 影響範囲

- `apps/web/src/App.tsx`
  - 宣言: L72, L83, L93, L97 の4本の `useLatestRef` 呼び出しを1本にまとめる。
  - 参照: `roomRef.current` (7箇所) / `endTypeRef.current` (1箇所) /
    `participantIdRef.current` (4箇所) / `generatingRef.current` (1箇所) の
    計13箇所（grep実測は16行だが `roomRef.current` は複数式中に重複あり）を
    `latestRef.current.xxx` に書き換える。
- 新規: `apps/web/test/ui/App.state-ref.test.tsx`（characterization test）。
- 変更しない: `apps/web/src/ui/use-latest-ref.ts`（汎用のまま。変更不要）。
- 変更しない: 10個のガード用 ref、`SyncClient`、`dispatch.ts`。

## テスト戦略

1. **Red**: 現状の `App.tsx` に対し、4組が実際に関与する代表フローを
   `FakeWS`（`apps/web/test/support/fakes.ts`）を使って駆動する
   characterization test を先に書き、**リファクタ前の挙動**を緑にする。
   - ルーム作成 → `room.created`（`onIdentity`）→ `snapshot`（`onRoom`）で
     `participantIdRef` 経由の自己判定（`selfRole`/`StatusStrip` 表示）が
     正しく解決する。
   - 中断（`session.abort` 相当の `endType`）で完成記録が作られない
     （`endTypeRef` 経由の判定）。
   - お題変化で `generatingProblem` が解除される（`generatingRef` 経由）。
   - `roomRef` 経由で `copyProblem` 等が最新の room を参照する。
2. **Green**: 集約 ref へ置き換えた後も同テストが緑のままであることを確認する。
3. **Refactor**: 命名・コメントを整理し、`code-review` で確認する。

## ロールバック

差分は `App.tsx` 1ファイル＋新規テスト1ファイルに閉じているため、
問題が出た場合は当該コミットを revert すれば main 相当に戻せる。
