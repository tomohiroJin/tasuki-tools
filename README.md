# Tasuki

モブプログラミング × TDD を支援する**ツール群（モノレポ）**。
Tasuki は複数ツールをまとめる傘ブランドで、各ツールはこのリポジトリ内のサブディレクトリとして管理します。

## 🔗 ライブデモ

**<https://tasuki.niku9.click/>** — TDD Mob Pro Timer を実際に試せます（ルーム作成 → 招待リンクで参加 → リアルタイム同期）。

## 収録ツール

### 1. TDD Mob Pro Timer — [`tdd-mob-pro-timer/`](tdd-mob-pro-timer/)

モブプログラミングのドライバー交代タイマー＋お題出題ツール。

- **構成**: pnpm モノレポ
  - `packages/core` — ドメインロジック（集約・状態遷移・お題バンク・検証）
  - `apps/web` — フロントエンド（React + Vite）
  - `apps/sync` — リアルタイム同期サーバー（Bun + WebSocket・揮発インメモリ）
- **特徴**
  - WebSocket による全参加者リアルタイム同期（サーバープッシュ）
  - モブ順ローテーション表示・「今は誰の番か」の明示
  - 現ドライバー不在時の次担当への自動繰上
  - 任意のルーム参加合言葉
  - AI お題生成（任意・ホストの Claude サブスクで実行・未設定時は定型お題へ安全縮退）
- 概要・起動手順: [`tdd-mob-pro-timer/README.md`](tdd-mob-pro-timer/README.md)
- アーキテクチャ: [`tdd-mob-pro-timer/docs/ARCHITECTURE.md`](tdd-mob-pro-timer/docs/ARCHITECTURE.md)
- 設計判断（ADR）: [`tdd-mob-pro-timer/docs/adr/`](tdd-mob-pro-timer/docs/adr/)

## ドキュメント

- 仕様駆動開発（SDD）の成果物: [`docs/plans/tdd-mob-pro-timer/`](docs/plans/tdd-mob-pro-timer/)（spec / plan / tasks）
- バックログ: [`docs/BACKLOG.md`](docs/BACKLOG.md)
- 開発計画・設計メモ: [`docs/superpowers/`](docs/superpowers/)

## 技術スタック

TypeScript / React + Vite / Bun / WebSocket / Valibot / neverthrow / Vitest

## ステータス

TDD Mob Pro Timer を本番公開中（上記ライブデモ）。
今後、Tasuki 傘下にモブプログラミング/開発支援の他ツールを追加していく予定です。
