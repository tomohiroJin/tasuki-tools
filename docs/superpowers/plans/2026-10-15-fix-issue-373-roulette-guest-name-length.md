# ルーレットのゲストの名前欄の上限を表示名の規約に合わせる（#373）実装計画

**Goal:** ルーレットのゲストの名前欄が 24 字で切れる欠陥を直し、上限を `@tasuki/room-core` の `MAX_DISPLAY_NAME`（40）から取る。

**Architecture:** `GuestForm.tsx` の自前定数 `MAX_NAME_LENGTH = 24` を消し、`maxLength` に `MAX_DISPLAY_NAME` を渡す。landing の `CreateRoom` / `JoinRoom`、timer の `RosterPanel` と同じ扱い（`maxLength` だけ。正規化と検証はサーバーが持つ）にそろえる。

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 名前欄の `maxLength` が 40 であることを見るテストを先に書き、24 の赤を見てから直す |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない（roulette-web は room-core に依存済み） |
| III. 揮発インメモリと単純運用 | 該当なし | サーバーの状態に触れない |
| IV. 境界の型安全 | 該当なし | wire・コマンドに触れない（サーバーは既に 40 で検証している） |
| V. 実画面検証 | 通過 | 40 字の名前を載せた輪と札の見え方は jsdom ではレイアウトされないため、統括が実画面で確かめる手順を報告に残す |
| VI. 依存は内向き | 通過 | アプリから共有パッケージ `@tasuki/room-core` への向きのみ |
| VII. 検査は壊して確かめる | 通過 | 変異 m200（上限を 24 に戻す）を足し、テストが赤くなることを見る |
| VIII. 記録が正本 | 通過 | 誤ったコメントを消し、上限の正本の所在をコメントに残す |
| IX. 小さく回す | 通過 | 1 ファイルの 1 行の修正。配布は伴わない |
| X. 抽象は実需で | 通過 | 新しい抽象を作らない |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 扱わない |

**逸脱なし。**

## 前提の実測

- `GuestForm.tsx` は `MAX_NAME_LENGTH = 24` を `maxLength` に渡している（Issue 本文どおり）。`MAX_DISPLAY_NAME = 40`（room-core）。
- 他のツールは `maxLength={MAX_DISPLAY_NAME}` のみ。貼り付けは `maxLength` がブラウザで切り、正規化は境界（サーバー）で行う。したがって「同じ扱い」とは `maxLength={MAX_DISPLAY_NAME}` である。

## 決めること

- 超過の扱い: 他と同じ `maxLength` に委ねる（推奨案）。クライアント側で正規化してから数える案は、他のツールに無い振る舞いを足すので採らない。
- 輪の上での省略はスコープ外。

## 検証の実行時間の見積もり

| コマンド | 見積もり |
|---|---|
| `pnpm --filter @tasuki/roulette-web test` | 30 秒 |
| 型検査・lint（roulette-web） | 30 秒 |
| `pnpm test`（全体・ターボのキャッシュ可） | 3〜5 分 |
| `node scripts/mutation-check.mjs --changed` | 1〜2 分 |
| scripts の自己テスト | 1 分 |
