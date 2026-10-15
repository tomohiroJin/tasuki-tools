# #382 roulette の INVALID_SETTLE がログを残さない 実装計画

**Goal:** 乱数源の契約違反 `INVALID_SETTLE` を受けたとき、`INVALID_RANDOM`（#364）と同じ水準（error）でハンドラからログを 1 行残す。利用者へ返る `INTERNAL_ERROR` は変えない。

**Tech Stack:** TypeScript（`apps/tasuki-sync`・bun test）／ログ衛生（ADR 0012）

## 前提の実測（Issue 本文との差）

- 本文の行番号（189-190）は古い。#364 のマージ後は `roulette-handlers.ts` の `roulette.spin` に `INVALID_RANDOM` だけがログ（`on-message-error name=RangeError`）を残し、`INVALID_SETTLE` は無言（実測で確認。再現テストが赤）。
- `randomSettle` が NaN を返しても `INVALID_SETTLE` に落ちる（テストで確認）。

## 決めること

ログの形。候補は (a) `on-message-error` に `reason` を足す、(b) 新しいイベント名 `roulette-random-violation` に `reason` を載せる。
**推奨は (b)。** `on-message-error name=RangeError` は INVALID_RANDOM の既存の行で、文字列を変えない。`INVALID_SETTLE` は例外ではなく `name` が無い。別イベントにすると 2 つが行の頭で区別でき、`journalctl` の grep も単純になる。理由は語彙（`RANDOM_VIOLATION_REASONS.invalidSettle` = `invalid-settle`）に置き、自由文・例外メッセージ・乱数源の返した値は載せない。水準は INVALID_RANDOM と同じ error。

## 変更

1. `application/log/vocabulary.ts` に `RANDOM_VIOLATION_REASONS` を足す。
2. `application/roulette-handlers.ts` の `roulette.spin` で `INVALID_SETTLE` のとき `logger.error("roulette-random-violation", { reason })` を残す。冒頭のコメントと「元からログが無い」の散文を更新する。
3. テスト: `test/roulette-handlers.test.ts` に settle が範囲外（0.1・0.9・NaN）の再現テスト。INTERNAL_ERROR のフレームと保管が変わらないことも固定する。
4. 変異 m240〜m242（行を残さない／水準を warn にする／INVALID_RANDOM と同じ行にする）。

## /code-review 後の追補

- `INVALID_RANDOM` にも `roulette-random-violation reason=invalid-random` を足す（監視が 1 本で拾えるように。既存の `on-message-error name=RangeError` は先頭に残す）。
- 2 つの分岐をそれぞれ `fail(connId, "INTERNAL_ERROR"); return;` で閉じ、三項演算子をやめる。
- 契約の境界（0.2・0.8 は成功でログ空、すぐ外・±Infinity・NaN はログあり）と、利用者の操作による失敗（人数不足）でログが空であることを固定する。
- 変異 m243（契約違反の判定を全失敗に広げる）・m244（INVALID_RANDOM の reason を invalid-settle に取り違える）。
- 設計正本（ルーレット）に手段としてログの行を書き、大規模リファクタリングの記録には日付つきの追記を 1 行足す。

- INVALID_RANDOM は error が 2 行になる（既存の接続層の行＋reason の行）。意図どおり。
- 2 つの分岐は code → { reason, keepsRangeErrorLine } の表（`VIOLATION_REASON_OF`）で 1 つにまとめた。

## 実プロトコルでの確認

`live-ws.roulette.test.ts` は本物の WebSocket だが乱数源を差し替えられない。本番の乱数源（`node:crypto`）は契約を守るため、実プロトコルでは再現できない経路である。ハンドラ層に乱数源を注入して `handleMessage` から入るテスト（`roulette-handlers.test.ts`）が、ワイヤ上の `INTERNAL_ERROR` フレームと同じ値を `send` で受けて固定するので、これで代替する。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 再現テストを先に書き、赤を見てから実装する |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | 状態の持ち方に触れない |
| IV. 境界の型安全 | 該当なし | wire・コマンド・フレームに触れない（利用者へ返る値は同じ） |
| V. 実画面検証 | 該当なし | 画面に触れない。本番では届かない経路で、実プロトコルでは再現できない（上の節） |
| VI. 依存は内向き | 通過 | アプリケーション層の中だけで完結する |
| VII. 検査は壊して確かめる | 通過 | 変異 m240〜m244 の 5 件を足し、`--id` で検出を確かめる |
| VIII. 記録が正本 | 通過 | 決定と理由を本計画に残す |
| IX. 小さく回す | 通過 | PR 1 本。配布は指示待ち |
| X. 抽象は実需で | 通過 | 語彙 2 件（invalid-random・invalid-settle）とログ行 2 種（`roulette-random-violation` と既存の `on-message-error`）。code → reason の表 1 つで汎用の契約違反ロガーは作らない |
| XI. 秘密と個人情報を持ち込まない | 通過 | 固定の語彙だけを載せる。`audit-log-hygiene` で確かめる |

**逸脱なし。**

## 検証の実行時間の見積もり

| コマンド | 見積もり |
|---|---|
| `pnpm --filter @tasuki/tasuki-sync test`（bun test） | 1 分以内 |
| `node scripts/audit-log-hygiene.mjs` | 数秒 |
| `node scripts/mutation-check.mjs --changed` | 新しい変異 5 件（m240〜m244）と作り直した m172 を足して、対照を含め 1 分前後（見積もり）。**実測は 1091 秒**（`scripts/mutation-check.mjs` が差分に入り機構が変わったため全件 158 件に倒れた。見積もりの約 18 倍。新しい変異だけの確認は `--id` で 12 秒） |
| `pnpm test`（全体・キャッシュ可） | 数分 |
