# Tasuki Planning Poker

スクラムのストーリーポイント見積もりを、ルーム同期でリアルタイムに行うプランニングポーカー。
GitHub spec-kit（specify CLI）のフルワークフロー実践を兼ねた Tasuki ツール2号です。

- 公開 URL（**予定・未公開**）: `https://tasuki.niku9.click/poker`
  - ⚠ **現在このパスはタイマーの SPA フォールバックが返るだけで、Planning Poker は未公開。**
  - **公開は Issue #15〜#20（monorepo 統合）の完了後**に行う。サブパス公開には
    Caddy のルーティング・別ポート・別 systemd ユニットが必要で、それらは monorepo 統合の
    設計に含まれるため、先に個別対応すると二度手間になる
- 仕様・設計: [`specs/001-planning-poker-mvp/`](./specs/001-planning-poker-mvp/)（spec / plan / research / data-model / contracts / quickstart / tasks）
- プロジェクト憲法: [`docs/constitution.md`](../constitution.md)

## 機能（MVP）

- ルーム作成と招待リンク参加（名前入力のみ、アカウント不要）
- フィボナッチデッキ（0, 1, 2, 3, 5, 8, 13, 21, ?, ☕）による秘匿投票
- 全員投票 or 在室者の誰かの操作で一斉公開、平均・最頻値の表示（? / ☕ は平均から除外）
- 再投票・次ラウンド（どちらも在室者なら誰でも実行できる）、同一ブラウザからのトークン自動復帰
- 状態は揮発インメモリ（全員切断でルーム即時破棄。DB なし）

> **ホストは廃止した**（[#95](https://github.com/tomohiroJin/tasuki-tools/issues/95) S3・
> [#244](https://github.com/tomohiroJin/tasuki-tools/issues/244)・2026-09-08）。以前は
> ルーム作成者だけが公開と次ラウンドを実行でき、切断時には次の在室者へ権限が繰り上がっていた。
> 現在はルームに居る人が全員同格で、`isHost` は wire 契約からも画面からも消えている。

## 構成

pnpm + turbo のモノレポ（詳細は [plan.md](./specs/001-planning-poker-mvp/plan.md)）:

| パッケージ | 役割 |
|-----------|------|
| `packages/poker-core` | ドメイン（Room 集約・ラウンド状態機械・集計）+ WS プロトコル契約（Valibot / neverthrow） |
| `apps/poker-web` | React + Vite フロントエンド（base: `/poker/`） |
| `apps/tasuki-sync` | Bun + WebSocket 同期サーバー（受信者別秘匿スナップショット配信）。**timer と共用**（#95 S2 で統合） |
| `deploy/` | Caddyfile 断片・systemd ユニット・デプロイスクリプト |

## 開発

前提: Bun 1.x / **Node.js 22 以上** / pnpm 11.5.0（`corepack enable` で宣言どおりに入る）

```bash
pnpm install

# テスト・型検査（TDD: core 単体 + sync プロトコル結合 + web ユニット）
pnpm turbo test typecheck

# 開発サーバー（2プロセス）
pnpm --filter @tasuki/sync dev         # WS サーバー :8787（timer と共用）
pnpm --filter @tasuki/poker-web dev    # Vite :5174（/poker/ 配信、WS は :8787 へ proxy）
```

ブラウザで **`http://localhost:5174/poker/`** を開く。動作検証シナリオは
[quickstart.md](./specs/001-planning-poker-mvp/quickstart.md) を参照。

> 起動手順の正本は [開発手順ガイド](../guides/development.md) です。

## デプロイ

`pnpm turbo build` 後、`deploy/` の Caddyfile 断片と systemd ユニットを適用する
（implement の最終フェーズ。詳細は [deploy/README.md](../../deploy/README.md)）。
