# Tasuki — TDD Mob Pro Timer

モブプログラミング × TDD のタイマー兼お題出題ツール。

- 仕様駆動開発（SDD）の成果物は [`docs/plans/tdd-mob-pro-timer/`](docs/plans/tdd-mob-pro-timer/) を参照。
  - [`spec.md`](docs/plans/tdd-mob-pro-timer/spec.md) — 何を・なぜ（要件・受け入れ基準）
  - [`plan.md`](docs/plans/tdd-mob-pro-timer/plan.md) — どう作るか（アーキテクチャ・技術選定・契約）
  - [`tasks.md`](docs/plans/tdd-mob-pro-timer/tasks.md) — 実行可能なコーディングタスク（TDD 順）
- 元設計書: [`docs/plans/tdd-mob-pro-timer-spec-v3.0-final.md`](docs/plans/tdd-mob-pro-timer-spec-v3.0-final.md)

## ステータス

M0〜M3 実装完了。モノレポ `tdd-mob-pro-timer/`（packages/core・apps/web・apps/sync）で稼働。

- 実装の概要・起動手順: [`tdd-mob-pro-timer/README.md`](tdd-mob-pro-timer/README.md)
- アーキテクチャ: [`tdd-mob-pro-timer/docs/ARCHITECTURE.md`](tdd-mob-pro-timer/docs/ARCHITECTURE.md)
- 設計判断（ADR）: [`tdd-mob-pro-timer/docs/adr/`](tdd-mob-pro-timer/docs/adr/)
- 振る舞いテスト（Example Map / 受け入れ基準 / Gherkin）: [`docs/plans/tdd-mob-pro-timer/`](docs/plans/tdd-mob-pro-timer/)

ユニットテスト 164 件・型チェック・ビルドが通過し、実ブラウザ（Playwright）と WS プロトコルでの
外部ブラックボックス検証も実施済み。M4（資源上限・セキュリティ網羅・PWA 等）は将来枠。

> このリポジトリは claym サンドボックス（`local/` は gitignore 対象）内に独立した Git リポジトリとして管理されます。
