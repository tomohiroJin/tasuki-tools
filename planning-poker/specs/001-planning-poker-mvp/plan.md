# Implementation Plan: プランニングポーカー MVP

**Branch**: `001-planning-poker-mvp` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-planning-poker-mvp/spec.md`

## Summary

スクラムのストーリーポイント見積もりをルーム同期でリアルタイムに行うプランニングポーカーの MVP。
ホストがルームを作成して招待リンクを共有し、参加者は名前入力のみで参加。フィボナッチデッキで
秘匿投票し、全員投票またはホスト操作で一斉公開、平均・最頻値を表示して次ラウンドへ進む。

技術アプローチ: `packages/core` に純粋なドメインロジック（Room 集約・ラウンド状態機械・集計）を
TDD で実装し、`apps/sync`（Bun + WebSocket）がそれをホストして揮発インメモリでルーム状態を管理、
`apps/web`（React + Vite、base `/poker/`）が WebSocket 経由で同期する3パッケージ構成。
メッセージ境界は Valibot で検証し、ドメイン操作は neverthrow の Result 型で表現する。

## Technical Context

**Language/Version**: TypeScript 5.x（strict モード）

**Primary Dependencies**: React + Vite（フロントエンド）/ Bun + 標準 WebSocket API（同期サーバー）/ Valibot（スキーマ検証）/ neverthrow（Result 型エラー処理）

**Storage**: なし（揮発インメモリのみ。憲法原則 III により DB 導入禁止）

**Testing**: Vitest（packages/core の単体テスト、apps/sync のプロトコル結合テスト）

**Target Platform**: モダンブラウザ（PC・スマートフォン）+ Linux サーバー（Bun ランタイム、systemd 常駐）

**Project Type**: Web アプリケーション（pnpm + turbo モノレポ、core / web / sync の3パッケージ）

**Performance Goals**: 状態変化のルーム内配信 1 秒以内（SC-002）/ ホスト切断からの権限繰上 5 秒以内（SC-005）

**Constraints**: サブパス `/poker/` 配信（Vite base 設定）/ 票の公開前は選択値を通信内容にも露出しない（SC-004）/ 既存サービスと別ポートで同居

**Scale/Scope**: 1 ルーム 1〜20 人、同時存続ルーム数十程度。画面は2ルート（トップ／ルーム。参加フォームはルーム画面内の未参加状態として表示）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|------|------|------|
| I. テスト駆動開発（NON-NEGOTIABLE） | ✅ PASS | core は Vitest 単体テストで TDD、sync はプロトコル結合テストを計画（quickstart.md に検証手順を記載） |
| II. 技術スタックの固定 | ✅ PASS | 使用技術は固定スタックのみ。追加依存なし（nanoid 等の ID 生成も標準 `crypto.randomUUID()` で代替） |
| III. 3パッケージ構成と揮発インメモリ | ✅ PASS | packages/core / apps/web / apps/sync の3パッケージ。DB・永続ストレージなし |
| IV. 型安全なエラー処理とスキーマ検証 | ✅ PASS | WS メッセージは境界で Valibot 検証（contracts/ws-protocol.md）、ドメイン操作は Result 型 |
| V. 実画面検証による完了定義 | ✅ PASS | quickstart.md にブラウザでの実画面検証シナリオ（`/poker/` サブパス含む）を定義 |
| 追加制約（サブパス配信・別ポート同居・デプロイ最終化） | ✅ PASS | Vite base `/poker/`、sync は独立ポート。デプロイ作業は implement の最終フェーズに配置 |

**Phase 1 設計後の再評価**: ✅ PASS — 設計成果物（data-model / contracts / quickstart)は
すべて固定スタックの範囲内であり、パッケージ追加・永続化の導入はない。Complexity Tracking への
記載事項なし。

## Project Structure

### Documentation (this feature)

```text
specs/001-planning-poker-mvp/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── ws-protocol.md   # WebSocket メッセージプロトコル契約
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
planning-poker/                  # 独立 pnpm モノレポ
├── package.json                 # ワークスペースルート（pnpm + turbo）
├── pnpm-workspace.yaml
├── turbo.json
├── packages/
│   └── core/                    # ドメイン層（純粋 TypeScript、UI/IO 依存なし）
│       ├── src/
│       │   ├── deck.ts          # デッキ定義（フィボナッチ10種）
│       │   ├── room.ts          # Room 集約（参加者管理・ホスト繰上）
│       │   ├── round.ts         # 投票ラウンド状態機械（voting → revealed）
│       │   ├── stats.ts         # 集計（平均・最頻値、?/☕ 除外）
│       │   ├── protocol.ts      # WS メッセージ型 + Valibot スキーマ（web/sync 共有）
│       │   └── index.ts
│       └── tests/               # Vitest 単体テスト（TDD）
├── apps/
│   ├── web/                     # React + Vite（base: /poker/）
│   │   ├── src/
│   │   │   ├── pages/           # トップ（作成）／ルーム画面（参加フォームは未参加状態として内包）
│   │   │   ├── components/      # カード・参加者リスト・結果表示
│   │   │   └── hooks/           # WS 接続・ルーム状態購読
│   │   └── tests/
│   └── sync/                    # Bun + WebSocket 同期サーバー（揮発インメモリ）
│       ├── src/
│       │   ├── server.ts        # Bun.serve + WS ハンドラ
│       │   └── rooms.ts         # ルームレジストリ（Map、全員切断で即時破棄）
│       └── tests/               # プロトコル結合テスト
└── deploy/                      # Caddyfile 断片・poker-sync.service・deploy.sh（実装最終フェーズ）
```

**Structure Decision**: 憲法原則 III の3パッケージ構成をそのまま採用。プロトコル定義
（メッセージ型 + Valibot スキーマ）は `packages/core` に置き、web / sync 双方から import して
契約の単一情報源とする（core はドメイン + プロトコルの共有パッケージを兼ねる）。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Google Fonts（fonts.googleapis.com への外部ランタイム依存。原則 II の「上記以外の依存」に該当しうる） | UI 刷新で採用した書体（Fraunces / Zen Kaku Gothic New）の配信。npm 依存は増やさない | フォント同梱（self-hosting）はアセット管理・サブセット化・ライセンス確認の作業が増えるため初回リリースでは見送り。オフライン/CDN 障害時はフォールバックフォント（Hiragino 等）で機能に影響なし。将来同梱に切替可 |

上記以外の憲法違反なし。
