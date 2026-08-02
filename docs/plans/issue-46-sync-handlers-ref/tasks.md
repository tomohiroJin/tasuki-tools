# tasks: SyncClient のコールバックを最新ハンドラ束へ転送する（Issue #46 / #41）

詳細な手順・コードは `plan.md` を参照。ここは進捗チェック用の一覧。

- [ ] T1: characterization test を追加する（`apps/web/test/ui/App.sync-handlers.test.tsx`・4件）。
      未カバーだった `onError`/leave-room・`onRoom`/driver 宣言・`onRoom`/resume 保存・
      `onNeedProblem` を覆う。**リファクタ前の実装に対して緑**であることを確認する（REQ-6）。
- [ ] T2: UI から呼ばれる4関数（`leaveRotation` / `changeOwnRole` / `copyProblem` /
      `regenerateProblem`）の `latestRef` 読みを素の state 読みへ置き換える。
      `leaveRotation` のコメントも実態に合わせる（REQ-8 の一部）。
- [ ] T3: `makeClient(getConfig)` の引数を撤去し、`onNeedProblem` 内で言語・難易度を
      直接読む。読み取りは `await` より前に置く（REQ-7）。
- [ ] T4: ハンドラ束（`handleRoom` / `handleIdentity` / `handleNeedProblem` /
      `handleError` / `handleReconnected` / `handleNotice`）を render 本体へ移し、
      `useLatestRef` で `handlersRef` に同期。`SyncClient` へは転送関数だけを渡し、
      `latestRef` を撤去する（REQ-1/2/3）。`client.ts` は無改造。
- [ ] T5: 実態と食い違うコメントを更新する（`use-latest-ref.ts` の doc 全体、
      `App.state-ref.test.tsx` のヘッダ追記）（REQ-8）。
- [ ] T6: 全体検証（`test` / `typecheck` / `lint`）と `client.ts` 無差分の確認。
      `docs/plans/codebase-refactoring/baseline.md` に §17 として実測値を追記する。
- [ ] T7: 実画面確認（ルーム作成 → ロビーお題自動生成 → 別のお題にする → 設定変更で再生成
      → ドライバー参加 → セッション開始 → 退出させる（コード引き継ぎ）→ 完成 → 中断）。
      ★型が変わらない意味変更は静的検査もテストも検出できない（Issue #22 の実例）。
- [ ] T8: PR を作成する（`Closes #46` / `Closes #41`）。
- [ ] T9: `code-review:code-review` で PR を敵対的に検証し、指摘に対応する。

## 実行順の制約

- T1 は必ず T2 より前（安全網を張ってからリファクタする）。
- T3 は T4 より前（`makeClient` の引数を先に外しておくと T4 の置換が素直になる）。
- T7 は T6 の後（テストが緑の状態で実画面を見る）。
- T7 で退行が見つかったら T4 の差分を疑い、修正して T6 からやり直す。

## ベースライン（2026-08-03 実測）

| 指標 | 値 |
|---|---:|
| `apps/web` テスト | 82ファイル / 571件 すべて pass |
| `App.tsx` 行数 | 764 |
| `useState` 宣言 | 11 |
| ref 宣言（`useRef` + `useLatestRef`） | 11（うち state の写し 1・ガード用 10） |

T1 で +4件 → 完了時は **82ファイル / 575件**が期待値。

## 環境メモ

- `pnpm` は PATH に無い。`corepack pnpm` で起動する。
- 全件テストは約660秒かかる。実装中は
  `corepack pnpm --filter @tdd-mob/web exec vitest run test/ui/<file>` を使う
  （`@tdd-mob/core` は vitest.config.ts でソースへ alias されておりビルド不要）。
