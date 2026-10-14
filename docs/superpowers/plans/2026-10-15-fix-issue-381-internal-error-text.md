# #381 内部エラーの文言をそろえる 実装計画

**Goal:** メッセージ層が失敗したときの `INTERNAL_ERROR` の文言を、timer・ハブ・お題・ルーレットの 4 つの接続で同じにする。

**Architecture:** 文言の正本は `apps/tasuki-sync/src/application/connection-errors.ts` の `CONNECTION_ERROR_TEXT.INTERNAL_ERROR`。timer 専用の `TIMER_INTERNAL_ERROR_TEXT` を廃し、timer の受け口も `connectionErrorFrame("INTERNAL_ERROR")` から取る。

## 前提の実測（Issue 本文を叩いた結果）

- timer の画面はこの wire の文を出さない。`use-timer-sync.ts` の `onError` は `code` だけを `handleError` へ渡し、`message` を捨てる。画面の文は `displayMessageFor(code)` で引くが、`ERROR_MESSAGES` に `INTERNAL_ERROR` は無く、既定文言「操作を完了できませんでした。」が出る。よって timer では **wire の文だけの問題**で、画面は変わらない。
- お題・ルーレットの文は変えない（すでに「サーバー内部でエラーが発生しました」）。書体の base 層の決まり（`copy-fits-font-base` 系）に変化は無い。timer に新しい画面文言は増えない。
- topic-core・roulette-core の表と `connection-error-text-sources.test.ts` はすでに「サーバー内部でエラーが発生しました」を前提にしている。

## 決めること

どちらの文にそろえるか → **「サーバー内部でエラーが発生しました」**。理由: 3 経路と core の表が前提にしており、動かす箇所が最小（timer の 1 箇所と定数 1 つの削除）。timer の画面表示には影響しない。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 特性テストの timer の組を先に新しい文へ書き換えて赤を見る |
| II. 技術選定は ADR を通す | 該当なし | 技術・依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | 状態管理に触れない |
| IV. 境界の型安全 | 該当なし | フレームの型（`code`・`message`）は変えない。文だけ |
| V. 実画面検証 | 通過 | timer の画面は `message` を使わないので変わらない。実プロトコルは統合テスト（実 WS）で見る |
| VI. 依存は内向き | 該当なし | 依存の向きを変えない |
| VII. 検査は壊して確かめる | 通過 | 変異 m230 を足し、壊して赤を確かめる |
| VIII. 記録が正本 | 通過 | 文言の正本を 1 つにする（廃した定数の残りを grep して直す） |
| IX. 小さく回す | 通過 | PR 1 本 |
| X. 抽象は実需で | 通過 | 抽象を足さず、専用の定数を 1 つ減らす |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 文言に内部情報は含めない |

**逸脱なし。**

## 検証の実行時間の見積もり

| 検証 | 1 回 | 回数 | 小計 |
|---|---|---|---|
| `bun test`（tasuki-sync の対象 2 ファイル） | 数秒 | 3 回 | 約 1 分 |
| `pnpm --filter @tasuki/sync` の test・typecheck・lint | 約 1〜2 分 | 1 回 | 約 2 分 |
| `pnpm test`（全体、ターボのキャッシュ可） | 約 3〜5 分（推測） | 1 回 | 約 5 分 |
| `node scripts/mutation-check.mjs --changed` | 約 1〜3 分（推測） | 1 回 | 約 3 分 |
| scripts の自己テスト | 約 2 分 | 1 回 | 約 2 分 |

## Tasks

1. `connection-error-text.test.ts` の timer の組を新しい文へ書き換え、赤を見る。
2. `TIMER_INTERNAL_ERROR_TEXT` を廃し、`ws-adapter.ts` の timer の受け口も正本から取る。緑。
3. 消した記号と旧文を grep し、散文・コメント・テストを直す。
4. 変異 m230 を足し、適用して赤を確かめる。
