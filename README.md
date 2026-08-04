# Tasuki

モブプログラミング × TDD を支援する**ツール群（単一 monorepo）**。
Tasuki は複数ツールをまとめる傘ブランドで、各ツールは 1 つの pnpm workspace 上のパッケージとして管理します。

## 🔗 ライブデモ

**<https://tasuki.niku9.click/>** — TDD Mob Pro Timer を実際に試せます（ルーム作成 → 招待リンクで参加 → リアルタイム同期）。

## 収録ツール

### 1. TDD Mob Pro Timer（本番公開中）

モブプログラミングのドライバー交代タイマー＋お題出題ツール。

- **構成**
  - [`packages/timer-core`](packages/timer-core/) — ドメインロジック（集約・状態遷移・お題バンク・検証）
  - [`apps/timer-web`](apps/timer-web/) — フロントエンド（React + Vite）
  - [`apps/timer-sync`](apps/timer-sync/) — リアルタイム同期サーバー（Bun + WebSocket・揮発インメモリ）
- **特徴**
  - WebSocket による全参加者リアルタイム同期（サーバープッシュ）
  - モブ順ローテーション表示・「今は誰の番か」の明示
  - 現ドライバー不在時の次担当への自動繰上
  - 任意のルーム参加合言葉
  - AI お題生成（任意・ホストの Claude サブスクで実行・未設定時は定型お題へ安全縮退）
- 概要・起動手順: [`docs/timer/README.md`](docs/timer/README.md)
- アーキテクチャ: [`docs/timer/ARCHITECTURE.md`](docs/timer/ARCHITECTURE.md)
- 設計判断（ADR）: [`docs/timer/adr/`](docs/timer/adr/)

### 2. Planning Poker（**本番未公開**）

見積り合意のためのプランニングポーカー。**まだ本番へデプロイしていません**（epic #15 の S4 で LP と同時に公開予定）。

- **構成**
  - [`packages/poker-core`](packages/poker-core/) — ドメインロジック（デッキ・ラウンド・集計）
  - [`apps/poker-web`](apps/poker-web/) — フロントエンド（React + Vite・`base=/poker/`）
  - [`apps/poker-sync`](apps/poker-sync/) — リアルタイム同期サーバー（Bun + WebSocket）
- 概要: [`docs/poker/README.md`](docs/poker/README.md)
- SDD 成果物: [`docs/poker/specs/`](docs/poker/specs/)

### 3. 玄関（ツール選択 LP・**本番未公開**）

訪問者がツールを選ぶための入口。ツール選択そのものを「手札」にしており、poker と同じ
象牙の札が並ぶ。

- **構成**: [`apps/landing`](apps/landing/) — Vite + React・静的サイト（同期サーバー無し）
- 世界観は [`packages/ui`](packages/ui/) の「夜のカードテーブル」を共有
- 公開パスは S3 時点で暫定の `/home/`。S4（[#19](https://github.com/tomohiroJin/tasuki-tools/issues/19)）でルート `/` へ移す

## 開発

単一の pnpm workspace + turbo。ルートで全ツールをまとめて検証できます。

```bash
pnpm install

pnpm test        # 全パッケージのテスト（1,743 件）
pnpm typecheck
pnpm lint
pnpm build

# 単一アプリだけを対象にする
pnpm turbo run build --filter=@tasuki/timer-web
```

**Node 22 以上が必要です**（pnpm 11.5.0 が `node:sqlite` を使うため）。
`apps/poker-sync` のテストとビルドには **Bun** が要ります。

### パッケージ

| パッケージ | ディレクトリ | 役割 |
|---|---|---|
| `@tasuki/timer-core` | `packages/timer-core` | timer のドメイン |
| `@tasuki/timer-web` | `apps/timer-web` | timer の画面 |
| `@tasuki/timer-sync` | `apps/timer-sync` | timer の同期サーバー |
| `@tasuki/poker-core` | `packages/poker-core` | poker のドメイン |
| `@tasuki/poker-web` | `apps/poker-web` | poker の画面 |
| `@tasuki/poker-sync` | `apps/poker-sync` | poker の同期サーバー |
| `@tasuki/landing` | `apps/landing` | 玄関 LP（**本番未公開**） |
| `@tasuki/ui` | `packages/ui` | 共通ビジュアル「夜のカードテーブル」（CSS のみ） |
| `@tasuki/protocol` | `packages/protocol` | 信頼境界のパース（外部入力 → 検証済みの値） |

## ドキュメント

- ツール別ドキュメント: [`docs/timer/`](docs/timer/) / [`docs/poker/`](docs/poker/)
- 仕様駆動開発（SDD）の成果物: [`docs/plans/`](docs/plans/)（spec / plan / tasks）
- バックログ: [`docs/BACKLOG.md`](docs/BACKLOG.md)
- 開発計画・設計メモ: [`docs/superpowers/`](docs/superpowers/)
- デプロイ資材: [`deploy/timer/`](deploy/timer/) / [`deploy/poker/`](deploy/poker/)

## 技術スタック

TypeScript / React + Vite / Bun / WebSocket / Valibot / neverthrow / Vitest / turbo

## ステータス

TDD Mob Pro Timer を本番公開中（上記ライブデモ）。
Planning Poker と玄関 LP は実装済み・**本番未公開**。

単一 monorepo への統合は [epic #15](https://github.com/tomohiroJin/tasuki-tools/issues/15) で
段階的に進めている。設計は [`docs/superpowers/specs/2026-08-04-monorepo-unification-design.md`](docs/superpowers/specs/2026-08-04-monorepo-unification-design.md)。
残るのは S4（timer を `/timer` へ移し、ルートを LP にする・[#19](https://github.com/tomohiroJin/tasuki-tools/issues/19)）で、
そこで poker と LP を初めて公開する。
