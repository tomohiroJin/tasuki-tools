# #381 内部エラーの文言をそろえる 実装計画

**Goal:** メッセージ層が失敗したときの `INTERNAL_ERROR` の文言を、timer・ハブ・お題・ルーレットの 4 つの接続で同じにする。

**Architecture:** 文言の正本は `apps/tasuki-sync/src/application/connection-errors.ts` の `CONNECTION_ERROR_TEXT.INTERNAL_ERROR`。timer 専用の `TIMER_INTERNAL_ERROR_TEXT` を廃し、timer の受け口も `connectionErrorFrame("INTERNAL_ERROR")` から取る。

## 前提の実測（Issue 本文を叩いた結果）

- timer の画面はこの wire の文を出さない。`use-timer-sync.ts` の `onError` は `code` だけを `handleError` へ渡し、`message` を捨てる。画面の文は `displayMessageFor(code)` で引くが、`ERROR_MESSAGES` に `INTERNAL_ERROR` は無く、既定文言「操作を完了できませんでした。」が出る。よって timer では **wire の文だけの問題**で、画面は変わらない。
- お題・ルーレットの文は変えない（すでに「サーバー内部でエラーが発生しました」）。書体の base 層の決まり（`copy-fits-font-base` 系）に変化は無い。timer に新しい画面文言は増えない。
- topic-core・roulette-core の表と `connection-error-text-sources.test.ts` はすでに「サーバー内部でエラーが発生しました」を前提にしている。

## 決めること

どちらの文にそろえるか → **「サーバー内部でエラーが発生しました」**。理由: 3 経路と core の表が前提にしており、動かす箇所が最小（timer の 1 箇所と定数 1 つの削除）。timer の画面表示には影響しない。

## 追加の決定（/code-review の指摘を受けて）

- **timer も reject で `on-message-error` を残す**（r8 計画が #381 に預けた `logsRejection`）。EARS「どの接続の種類でも同じ」に合い、ログの語彙は既存の行のまま使える。`logsRejection` を廃し、`createTextChannel` が常に残す。timer の行の tooLarge / internalError も他の 3 行と同じ `frames` から取る。
- 旧い文「内部エラーが発生しました」は `connection-error-text-sources.test.ts` の `RETIRED_TEXTS` に残し、src への直書きを禁じる。
- `on-message-error` に、どの接続の失敗かを示す `protocol` 項目を足す（値は `error-log.ts` の `PROTOCOL_LOG_NAMES` の固定の語彙。ログ衛生に従う）。変異 m232。
- 旧い文の禁止の走査は、`timer-core`・`timer-web` の src にも広げる。固定のエラーフレームは受け口を作るときに 1 回だけ文字列にする。
- `protocol` の語彙 `PROTOCOL_LOG_NAMES` は `vocabulary.ts` に置き、受け口の表は鍵から `protocol` を受け取る（`channelsByKey`）。同期の throw の経路・poker にも `protocol` の検査を足し、poker 用に変異 m233 を足す。
- 旧い文の走査は、引用符つきの完全一致ではなく部分文字列で落とす（連結で組み立てる道は受け入れる）。
- 変異 m231（reject のログを落とす）を足す。m230 は新しい配線に合わせて作り直した。

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
4. 追加の決定（上）を実装し、変異 m230・m231 を足し、適用して赤を確かめる。
