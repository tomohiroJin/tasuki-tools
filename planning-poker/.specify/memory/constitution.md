<!--
Sync Impact Report
==================
- Version change: (template) → 1.0.0
- Modified principles: 全プレースホルダーを初回制定として具体化
  - [PRINCIPLE_1] → I. テスト駆動開発（NON-NEGOTIABLE）
  - [PRINCIPLE_2] → II. 技術スタックの固定
  - [PRINCIPLE_3] → III. 3パッケージ構成と揮発インメモリ
  - [PRINCIPLE_4] → IV. 型安全なエラー処理とスキーマ検証
  - [PRINCIPLE_5] → V. 実画面検証による完了定義
- Added sections: 「追加制約」「開発ワークフロー」
- Removed sections: なし
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check は動的参照のため変更不要
  - ✅ .specify/templates/spec-template.md — 憲法への直接参照なし、変更不要
  - ✅ .specify/templates/tasks-template.md — 憲法への直接参照なし、変更不要
- Follow-up TODOs: なし
-->

# Tasuki Planning Poker Constitution

## Core Principles

### I. テスト駆動開発（NON-NEGOTIABLE）

TDD は必須である。Red-Green-Refactor サイクルを厳守すること:
テストを書く → テストが失敗することを確認する → 実装する → テストが通る →
リファクタリングする。テストより先に実装コードを書いてはならない（MUST NOT）。

- `packages/core` は Vitest による単体テストで TDD を実施する（MUST）
- `apps/sync` は WebSocket プロトコルの結合テストを備える（MUST）
- テストが失敗する状態でタスクを完了扱いにしてはならない（MUST NOT）

**根拠**: ドメインロジック（ルーム集約・投票ラウンド状態機械）の正しさが本ツールの
中核価値であり、リアルタイム同期のバグは手動検証では再現困難なため。

### II. 技術スタックの固定

技術スタックは以下に固定する。plan 工程での代替技術の再検討・追加ライブラリの
安易な導入を禁止する（MUST NOT）:

- 言語: TypeScript
- フロントエンド: React + Vite
- 同期サーバー: Bun + WebSocket
- スキーマ検証: Valibot
- エラー処理: neverthrow
- テスト: Vitest
- パッケージ管理・ビルド: pnpm + turbo

上記以外の依存を追加する場合は、Complexity Tracking での正当化を必須とする（MUST）。

**根拠**: spec-kit ワークフロー実践が本プロジェクトの目的の一つであり、
plan 工程での技術選定の発散（暴走）を防ぐ必要があるため。

### III. 3パッケージ構成と揮発インメモリ

リポジトリは独立 pnpm モノレポとし、以下の3パッケージ構成を維持する（MUST）:

- `packages/core` — ドメイン: Room 集約・投票ラウンド状態機械・デッキ定義
- `apps/web` — React + Vite フロントエンド（Vite base: `/poker/`）
- `apps/sync` — Bun + WebSocket 同期サーバー（別ポート・揮発インメモリ）

状態はすべて揮発インメモリで保持する。データベース・永続ストレージを
導入してはならない（MUST NOT）。4つ目のパッケージ追加は Complexity Tracking
での正当化を必須とする（MUST）。

**根拠**: MVP スコープ（結果の永続記録はスコープ外）に対して DB は過剰であり、
実績のある tdd-mob-pro-timer の構成をミラーすることで運用リスクを抑えるため。

### IV. 型安全なエラー処理とスキーマ検証

- WebSocket メッセージは境界で Valibot によるスキーマ検証を必須とする（MUST）
- ドメイン操作の失敗は neverthrow の `Result` 型で表現する（MUST）。
  ドメイン層で例外を制御フローとして使用してはならない（MUST NOT）
- 検証に失敗した入力は握りつぶさず、明示的なエラーとして処理する（MUST）

**根拠**: リアルタイム同期では不正・欠損メッセージが常態であり、境界での検証と
型で追跡可能なエラーが無言の状態破壊を防ぐ唯一の手段であるため。

### V. 実画面検証による完了定義

フロントエンド（`apps/web`）のタスクは、テスト通過だけでは「完了」としない。
実際にブラウザで画面を表示し、目視で動作確認することを完了条件に含める（MUST）。

- 画面遷移・表示崩れ・インタラクションは実画面で確認する（MUST）
- サブパス `/poker/` 配信を前提とした動作確認を行う（MUST）

**根拠**: tdd-mob-pro-timer v2 で「テストは通るが画面が壊れている」事故が
発生した教訓による。ユニットテストはレイアウト・アセットパス・実配信環境の
問題を検出できない。

## 追加制約

- **公開方式**: `https://tasuki.niku9.click/poker` のサブパス方式で配信する。
  Vite の `base` は `/poker/` に設定する（MUST）
- **同居ポリシー**: `apps/sync` は既存サービスとは別ポートの別 systemd
  サービスとして稼働させる。既存 `tdd-mob-pro-timer/` には手を入れない（MUST NOT）
- **デプロイ時期**: デプロイは implement 完了後の最終フェーズとし、
  それまではローカル開発で完結させる
- **切断・再接続**: ホスト切断時の権限繰上は既存ツール（tdd-mob-pro-timer）の
  パターンを流用する（SHOULD）
- **MVP スコープ外**: お題リスト管理・結果の永続記録・観戦者ロール・デッキ切替・
  AI 連携は初回リリースに含めない（MUST NOT）

## 開発ワークフロー

- spec-kit のフルワークフローを順守する:
  `constitution → specify → plan → tasks → implement`（MUST）
- 仕様・計画・タスクの成果物は `specs/` 配下に保存する（MUST）
- plan 工程の Constitution Check で本憲法の各原則への適合を検証し、
  違反がある場合は Complexity Tracking に正当化を記録する（MUST）
- コミットメッセージ・ブランチ命名は claym リポジトリの
  git-workflow 規約（Conventional Commits）に従う（MUST）

## Governance

- 本憲法は本プロジェクトにおける他のすべてのプラクティス・ガイドラインに優先する
- **改正手続き**: 改正は本ファイルの更新として提案し、Sync Impact Report に
  変更内容を記録した上で、依存テンプレート（plan/spec/tasks）との整合を確認する
- **バージョニング**: セマンティックバージョニングに従う —
  MAJOR: 原則の削除・後方互換性のない再定義 /
  MINOR: 原則・セクションの追加または実質的な拡張 /
  PATCH: 文言修正・明確化
- **コンプライアンスレビュー**: すべての plan は Constitution Check ゲートを
  通過しなければならない。原則からの逸脱は Complexity Tracking での
  正当化なしに認めない

**Version**: 1.0.0 | **Ratified**: 2026-07-16 | **Last Amended**: 2026-07-16
