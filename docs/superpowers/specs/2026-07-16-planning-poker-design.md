# Tasuki Planning Poker — 設計文書（spec-kit 入力用）

- 日付: 2026-07-16
- ステータス: 承認済み
- 位置づけ: Tasuki ツール2号。GitHub spec-kit（specify CLI）の実践を兼ねる。
  本文書は詳細仕様ではなく、spec-kit ワークフローへの**入力となる決定事項**を記録する。
  受け入れ基準・エッジケースの列挙は `/speckit.specify` 以降に委ねる。

## 目的

- スクラムのストーリーポイント見積もりをルーム同期でリアルタイムに行うプランニングポーカーを提供する
- 本家 spec-kit のフルワークフロー（constitution → specify → plan → tasks → implement）を実プロダクトで体験・評価する

## 決定事項

### プロダクト

- **ツール**: プランニングポーカー
- **スコープ（ミニマム MVP）**:
  - ルーム作成（ホスト）・招待リンクによる参加（名前入力のみ）
  - フィボナッチデッキ（0, 1, 2, 3, 5, 8, 13, 21, ?, ☕）で投票
  - 投票中は「投票済み」状態のみ可視。全員投票 or ホスト操作で一斉公開
  - 結果表示（各票・平均・最頻値）→ 再投票 or 次ラウンド
- **スコープ外（初回）**: お題（ストーリー）リスト管理、結果の永続記録、観戦者ロール、デッキ切替、AI 連携

### プロセス（spec-kit）

- `local/Tasuki/planning-poker/` を新規作成し、その中で `specify init --here --ai claude`
- `/speckit.constitution` に以下の既定制約を明記して plan 工程の技術選定の暴走を防ぐ:
  - スタック固定: TypeScript / React + Vite / Bun + WebSocket / Valibot / neverthrow / Vitest / pnpm + turbo
  - core / web / sync の3パッケージ構成、揮発インメモリ（DB なし）
  - TDD 必須（Red-Green-Refactor）
  - サブパス `/poker` 配信前提
  - フロント「完了」条件に実画面目視を含める（tdd-mob-pro-timer v2 の教訓）
- 以後 `/speckit.specify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.implement` を順に実施

### アーキテクチャ（tdd-mob-pro-timer をミラー）

```
local/Tasuki/planning-poker/     # 独立 pnpm モノレポ（兄弟ディレクトリ）
├── .specify/                    # spec-kit テンプレート・スクリプト
├── specs/                       # spec-kit 成果物（001-mvp/ 等）
├── packages/core                # ドメイン: Room 集約・投票ラウンド状態機械・デッキ定義
├── apps/web                     # React + Vite（Vite base: /poker/）
├── apps/sync                    # Bun + WebSocket 同期サーバー（別ポート・揮発インメモリ）
└── deploy/                      # Caddyfile 断片・poker-sync.service・deploy.sh
```

- 既存 `tdd-mob-pro-timer/` には手を入れない
- sync は既存サービスと**別ポートの別 systemd サービス**として同居

### 公開

- URL: `https://tasuki.niku9.click/poker`（サブパス方式）
- Caddy に `/poker` ルートを追加（静的配信 + WS リバースプロキシ）
- デプロイは implement 完了後の最終フェーズ。それまではローカル開発

### エラー処理・テスト方針

- WS メッセージは Valibot でスキーマ検証、ドメイン操作は neverthrow の Result 型
- packages/core は Vitest 単体テストで TDD、apps/sync はプロトコル結合テスト
- 切断・再接続時のホスト権限繰上は既存ツールのパターンを流用

## 検討した代替案

| 論点 | 採用 | 不採用と理由 |
|------|------|-------------|
| ツール内容 | プランニングポーカー | レトロボード等（core/web/sync 構成の流用度でポーカーが最良） |
| SDD 手法 | GitHub spec-kit 本体 | 自作 spec-plan-tasks スキル（「本家を試す」目的に合わない） |
| URL | サブパス /poker | サブドメイン（DNS/証明書追加が不要な方を選択） |
| 配置 | 兄弟ディレクトリで独立モノレポ | 既存モノレポ同居（既存ツールへの影響を避ける） |
| spec-kit の init 位置 | planning-poker/ 内 | Tasuki ルート（constitution をツール専用にするため） |
