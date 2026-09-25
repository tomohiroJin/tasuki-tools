# ADR-0005: 秘密ゼロ + BYOK + 代表生成によるお題

- **ステータス**: Superseded by [ADR-0008](./0008-server-resident-ai-generation.md)
  （2026-06-12 にサーバー常駐 `claude -p` 方式へ転換。BYOK 一式
  `apps/web/src/ai/{byok,key-storage}.ts` は UI から撤去し休眠残置。
  定型バンクへの縮退・Valibot 検証・出所バッジの原則は現行も有効）
- **関連要件**: FR-021〜FR-027, NFR セキュリティ, SC-003

## 背景

お題は AI 生成が望ましい一方、同期サーバーが AI 鍵を保持すると、鍵の漏洩リスク・運用コスト・
プライバシー責任を負います。また共有ルームでは「全員が同一のお題を見る」必要があり、各自が勝手に
生成すると食い違います。AI 生成は失敗・不正形式もあり得るため、画面を壊さない縮退が必須です。

## 決定

サーバーは AI 鍵を一切持たない **秘密ゼロ** とし、お題は次の方針で扱います。

- **BYOK（Bring Your Own Key）**: AI 生成は利用者本人のブラウザから直接 Anthropic API を呼ぶ。
  鍵はクライアントのみが持ち、サーバーへ送らない・ログに残さない。
- **代表生成**: 共有ルームでは代表クライアントが生成し、`problem.submit` でサーバーへ届ける。
  候補順 = 主催者 → 編集者以上かつ AI 鍵保有の online（参加時刻昇順）→ 末尾に定型担当。
  deadline 内に投入が無ければ次候補へ再委譲、全滅なら定型お題で確定。リロールは旧依頼をキャンセル。
- **検証と縮退**: AI 由来テキストは信頼しないデータとして Valibot でお題構造へ検証し、不正なら
  `pickFallback` で定型バンクへ縮退する（出所は AI / 定型をバッジ表示）。

## 影響

- **利点**: サーバーが秘密を持たないため攻撃面が小さく、揮発状態と相まって運用が単純。AI が
  使えない/失敗しても利用者は必ずお題を受け取れる（SC-003）。共有では全員に同一お題が反映される。
- **代償**: 代表委譲・タイムアウト・再委譲という調停ロジックが必要（`application/problem-delegation.ts`）。
  代表外の参加者からの投入は拒否し、リロード後の stale なタイマー発火は requestId 照合で無効化する。
- 将来枠: 運営鍵による代理（managed）やサブスク経由（subscription）は本実装のスコープ外。

## 改定（2026-09-25・#91 PR 3） — クライアントへ生成を委ねる経路を廃止した

本 ADR は [ADR-0008](./0008-server-resident-ai-generation.md) に置換されたが、決定の 2 項目目「代表生成」の
経路（代表クライアントが生成して `problem.submit` で届ける・候補順・deadline・再委譲）と、その候補を選ぶための
参加者の印（`hasAiKey`）・依頼の合図（signal の `need-problem`）は、置換の後も同期サーバーと timer に残っていた。
実クライアントが常に `hasAiKey: false` を送るため、**この経路は一度も通っていなかった**
（設計正本 [`docs/superpowers/specs/2026-09-23-shared-topic-design.md`](../../superpowers/specs/2026-09-23-shared-topic-design.md) §2・T7）。

[#91](https://github.com/tomohiroJin/tasuki-tools/issues/91) PR 3 で、この経路をすべて撤去した。

- 同期サーバー: 委譲の調停（`application/problem-delegation.ts`）・`problem.request` / `problem.submit` の
  ハンドラ・`need-problem` の送信を削除した
- timer の wire（`packages/timer-core`）: `room.join` の `hasAiKey`・参加者の印・`problem.*` のコマンド・
  `need-problem` の signal・委譲のエラーコード（`DELEGATION_UNAVAILABLE` / `STALE_SUBMISSION`）を削除した

お題の生成は、お題の文脈（`packages/topic-core`・同期サーバーの `application/topic-generation.ts`）の
**サーバー生成と定型だけ**になった（[`docs/adr/0021`](../../adr/0021-topic-as-shared-context.md)）。
「影響」の「代償: 代表委譲・タイムアウト・再委譲という調停ロジックが必要」は、その調停ごと無くなった。

**本文は書き換えない**（置換済みの決定の記録である）。本 ADR のうち現行も有効としていた
**定型バンクへの縮退と Valibot 検証**の原則は、お題の文脈がそのまま引き継いでいる
（出所はお題の `source`（`manual` / `ai` / `fallback`）として持つ）。

