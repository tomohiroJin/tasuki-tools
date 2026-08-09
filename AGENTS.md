# Tasuki — AI エージェント向けガイド

Tasuki は二本柱で成り立つ。**実用ツール集**（timer・poker 等、実務で使うツール群を提供する）と
**AI 駆動開発の実践場**（MCP・spec-kit・複数 AI エージェントによる開発プロセス自体の実践・実証）。

## 絶対規則

正本は [`.specify/memory/constitution.md`](.specify/memory/constitution.md)。以下は
その見出し（原則 I〜X）を転記したものに過ぎない。内容・詳細は必ず正本を参照すること。

- I. テスト駆動開発（NON-NEGOTIABLE）
- II. 技術選定は ADR を通す
- III. 揮発インメモリと単純運用
- IV. 境界の型安全
- V. 実画面検証
- VI. 依存は内向き
- VII. 検査は壊して確かめる
- VIII. 記録が正本
- IX. 小さく回す
- X. 抽象は実需で

### AI 運用規則

- 本番デプロイ（deploy.sh / systemctl / Caddy reload）は明示指示を待つ
- テスト・検査はコンテナ native の FS で回す（9p マウント上で回さない）
- 起動した dev サーバーは使い終わったら止める（`ss -tlnp` で確認）

## 文書地図

- 憲法: [`.specify/memory/constitution.md`](.specify/memory/constitution.md) —
  何を守るか（原則 I〜X）
- ADR: [`docs/adr/`](docs/adr/)（横断）・`docs/<app>/adr/`（アプリ固有） —
  なぜそう決まっているか。参照は置き場つき（例: `docs/adr/0002`）
- ガイド: [`docs/guides/`](docs/guides/) —
  今日どう書くか（DoD・EARS・振り返り・アーキテクチャ・開発手順）
- 設計文書: [`docs/superpowers/`](docs/superpowers/) —
  機能ごとの設計経緯（日付つきファイル）
- 全体像・目的別の入口は [`docs/README.md`](docs/README.md) を参照

## 基本コマンド

- `pnpm test` — 全パッケージのテスト
- `pnpm e2e` — E2E テスト
- `node scripts/audit-structure.mjs` — 構造監査
- `node scripts/mutation-check.mjs` — 変異検査
