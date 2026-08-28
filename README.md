# Tasuki

モブプログラミング × TDD を支援する**ツール群（単一 monorepo）**。
Tasuki は二本柱で成り立つ。**実用ツール集**（timer・poker 等、実務で使うツール群を提供する）と
**AI 駆動開発の実践場**（MCP・spec-kit・複数 AI エージェントによる開発プロセス自体の実践・実証）。

## 収録ツール

### 1. TDD Mob Pro Timer

モブプログラミングのドライバー交代タイマー＋お題出題ツール。**本番公開中。**

- **構成**
  - [`packages/timer-core`](packages/timer-core/) — ドメインロジック（集約・状態遷移・お題バンク・検証）
  - [`apps/timer-web`](apps/timer-web/) — フロントエンド（React + Vite・`base=/timer/`）
  - [`apps/timer-sync`](apps/timer-sync/) — リアルタイム同期サーバー（Bun + WebSocket・揮発インメモリ）
- **特徴**
  - WebSocket による全参加者リアルタイム同期（サーバープッシュ）
  - モブ順ローテーション表示・「今は誰の番か」の明示
  - 現ドライバー不在時の次担当への自動繰上
  - 任意のルーム参加合言葉
  - AI お題生成（任意・ホストの Claude サブスクで実行・未設定時は定型お題へ安全縮退）
- 概要: [`docs/timer/README.md`](docs/timer/README.md)
- アーキテクチャ: [`docs/timer/ARCHITECTURE.md`](docs/timer/ARCHITECTURE.md)
- 設計判断（ADR）: [`docs/timer/adr/`](docs/timer/adr/)

### 2. Planning Poker

見積り合意のためのプランニングポーカー。**本番公開中**（初回公開は 2026-08-28・[#66](https://github.com/tomohiroJin/tasuki-tools/issues/66)）。

- **構成**
  - [`packages/poker-core`](packages/poker-core/) — ドメインロジック（デッキ・ラウンド・集計）
  - [`apps/poker-web`](apps/poker-web/) — フロントエンド（React + Vite・`base=/poker/`）
  - [`apps/poker-sync`](apps/poker-sync/) — リアルタイム同期サーバー（Bun + WebSocket）
- 概要: [`docs/poker/README.md`](docs/poker/README.md)
- SDD 成果物: [`docs/poker/specs/`](docs/poker/specs/)

### 3. 玄関（ツール選択 LP）

訪問者がツールを選ぶための入口。ツール選択そのものを「手札」にしており、poker と同じ
象牙の札が並ぶ。**本番公開中**（初回公開は 2026-08-28・[#66](https://github.com/tomohiroJin/tasuki-tools/issues/66)）。

- **構成**: [`apps/landing`](apps/landing/) — Vite + React・静的サイト（同期サーバー無し・`base=/`）
- 世界観は [`packages/ui`](packages/ui/) の「夜のカードテーブル」を共有

## 🔗 ライブデモ

**<https://tasuki.niku9.click/>** — TDD Mob Pro Timer を実際に試せます（ルーム作成 → 招待リンクで参加 → リアルタイム同期）。

> 現在この URL は timer を直接開きます。[#66](https://github.com/tomohiroJin/tasuki-tools/issues/66) のデプロイ後は
> **`/` が玄関 LP、timer は `/timer/`** になります（旧 `/?room=...` の共有リンクは `/timer/` へ転送されます）。

## クイックスタート

### 前提

- **Node.js 22 以上**（pnpm 11.5.0 が `node:sqlite` を使うため、20 では起動しません）
- pnpm 11.5.0（`packageManager` 宣言に従うので `corepack enable` でよい）
- **Bun** — 同期サーバーの起動と `apps/poker-sync` のテスト・ビルドに必要

```bash
corepack enable
pnpm install
pnpm dev     # 全アプリの dev サーバーを並列起動する
pnpm test    # 全パッケージのテストを実行する
```

起動・個別プロセスの内訳・検査コマンドの詳しい手順は
[`docs/guides/development.md`](docs/guides/development.md) を参照してください。

## ドキュメント

- [`AGENTS.md`](AGENTS.md) — AI エージェント向けの絶対規則と二本柱
- [`docs/README.md`](docs/README.md) — 文書地図（目的別の入口）
- [`docs/guides/development.md`](docs/guides/development.md) — 起動・テスト・検査の詳しい手順

バックログは GitHub Issues で管理しています。

## 技術スタック

TypeScript / React 19 + Vite / Bun / WebSocket / Valibot / neverthrow / Vitest / bun:test / turbo

## ステータス

| ツール | 公開パス | 状態 |
|---|---|---|
| TDD Mob Pro Timer | `/timer/` | 本番公開中 |
| Planning Poker | `/poker/` | 本番公開中 |
| 玄関 LP | `/` | 本番公開中 |

単一 monorepo への統合は [epic #15](https://github.com/tomohiroJin/tasuki-tools/issues/15) で**実装完了**しました
（設計: [`docs/superpowers/specs/2026-08-04-monorepo-unification-design.md`](docs/superpowers/specs/2026-08-04-monorepo-unification-design.md)）。
**残るのは本番への反映 1 回だけ**で、[#66](https://github.com/tomohiroJin/tasuki-tools/issues/66) が引き継いでいます。
そこで poker と玄関 LP が初めて公開されます。

続く整備は [epic #67](https://github.com/tomohiroJin/tasuki-tools/issues/67)（規範・依存・CI/CD・ADR に沿った作り直し）と
[#73](https://github.com/tomohiroJin/tasuki-tools/issues/73)（E2E テスト新設）で進めます。
