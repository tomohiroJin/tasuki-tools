# tasks: SyncClient のコールバックを最新ハンドラ束へ転送する（Issue #46 / #41）

詳細な手順・コードは `plan.md` を参照。ここは進捗チェック用の一覧。

- [x] T1: characterization test を追加する（`apps/web/test/ui/App.sync-handlers.test.tsx`・4件）。
      未カバーだった `onError`/leave-room・`onRoom`/driver 宣言・`onRoom`/resume 保存・
      `onNeedProblem` を覆う。**リファクタ前の実装に対して緑**であることを確認する（REQ-6）。
      実績: 上記ファイルを新設し4件追加。後に typecheck エラー（TS2493 × 2）を修正
      （`FakeWS.send()` が引数なし宣言のため `mock.calls` の要素型が空タプルになる問題）。
- [x] T2: UI から呼ばれる4関数（`leaveRotation` / `changeOwnRole` / `copyProblem` /
      `regenerateProblem`）の `latestRef` 読みを素の state 読みへ置き換える。
      `leaveRotation` のコメントも実態に合わせる（REQ-8 の一部）。
      実績: 4関数を素の state 読みへ置換。`leaveRotation` のコメントも更新。
- [x] T3: `makeClient(getConfig)` の引数を撤去し、`onNeedProblem` 内で言語・難易度を
      直接読む。読み取りは `await` より前に置く（REQ-7）。
      実績: `makeClient` の引数を撤去。`onNeedProblem` は `await` より前に読む形にした。
- [x] T4: ハンドラ束（`handleRoom` / `handleIdentity` / `handleNeedProblem` /
      `handleError` / `handleReconnected` / `handleNotice`）を render 本体へ移し、
      `useLatestRef` で `handlersRef` に同期。`SyncClient` へは転送関数だけを渡し、
      `latestRef` を撤去する（REQ-1/2/3）。`client.ts` は無改造。
      実績: 6コールバックを転送化、`latestRef` 撤去。`SyncClient` は無改造
      （`client.ts` は `main` と差分ゼロ）。
- [x] T5: 実態と食い違うコメントを更新する（REQ-8）。REQ-8 が挙げる3箇所のうち、
      `App.tsx` の `latestRef` 宣言部は T4 で宣言ごと消え、`leaveRotation` の記述は
      T2 で更新済みのため、本項目では残る `use-latest-ref.ts` の doc 全体を更新する。
      あわせて `App.state-ref.test.tsx` のヘッダ（旧実装前提の記述）も追記修正する。
      実績: `use-latest-ref.ts` の doc / `App.state-ref.test.tsx` ヘッダに加え、実装時に
      新たに見つかった `App.tsx` の `handleRoom` 冒頭コメント（`latestRef` 前提の記述）も
      対象に含めて更新した。
- [x] T6: 全体検証（`test` / `typecheck` / `lint`）と `client.ts` 無差分の確認。
      `docs/plans/codebase-refactoring/baseline.md` に §17 として実測値を追記する。
      実績: core 30ファイル/662件・sync 55ファイル/388件・web 83ファイル/575件すべて PASS
      （変更前ベースライン web 82/571）。typecheck / lint 全パッケージ通過。`baseline.md` に
      §17 を追記。
- [ ] T7: 実画面確認（ルーム作成 → ロビーお題自動生成 → 別のお題にする → 設定変更で再生成
      → ドライバー参加 → セッション開始 → 退出させる（コード引き継ぎ）→ 完成 → 中断）。
      ★型が変わらない意味変更は静的検査もテストも検出できない（Issue #22 の実例）。
      ★この開発環境では実行不可（`apps/sync` の起動に `bun` が必要だが未インストール、
      ブラウザ／Playwright も無し）。web の本番ビルド成功と vite dev の起動までは確認済み。
      **実画面確認はユーザーが実施する。**
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

完了時実績: web 83ファイル / 575件 PASS（T1 で +1ファイル / +4件）。`App.tsx` 行数
764 → 790、`useState` 11（不変）、ref 宣言 11（不変・`latestRef` → `handlersRef`）。

## 環境メモ

- `pnpm` は PATH に無い。`corepack pnpm` で起動する。
- 全件テストは約660秒かかる。実装中は
  `corepack pnpm --filter @tdd-mob/web exec vitest run test/ui/<file>` を使う
  （`@tdd-mob/core` は vitest.config.ts でソースへ alias されておりビルド不要）。
