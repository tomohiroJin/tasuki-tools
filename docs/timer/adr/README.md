# アーキテクチャ決定記録（ADR）

このディレクトリには、TDD Mob Pro Timer の重要な設計判断を記録します。各 ADR は
Michael Nygard 形式（背景 / 決定 / 影響 / ステータス）に従い、「なぜその選択をしたか」を残します。

> ADR は不変の記録です。判断が覆ったら ADR を削除せず、新しい ADR で `Superseded`（置換）します。

## 一覧

| # | タイトル | ステータス |
|---|---|---|
| [0001](./0001-monorepo-shared-core.md) | モノレポ + 共有 core パッケージ | Accepted |
| [0002](./0002-decider-pure-domain.md) | Decider パターンと純粋ドメイン | Accepted |
| [0003](./0003-server-authoritative-clock.md) | サーバー権威 ServerClock と時刻導出 | Accepted |
| [0004](./0004-full-snapshot-sync.md) | full snapshot による状態同期（差分なし） | Accepted |
| [0005](./0005-secret-zero-byok-problem.md) | 秘密ゼロ + BYOK + 代表生成によるお題 | Superseded by 0008 |
| [0006](./0006-result-and-boundary-validation.md) | Result 型のエラー処理と Valibot 境界検証 | Accepted（docs/adr/0005 へ昇格） |
| [0007](./0007-volatile-in-memory-state.md) | 揮発インメモリ状態と再起動安全 | Accepted |
| [0008](./0008-server-resident-ai-generation.md) | AI お題生成はサーバー常駐 `claude -p` + 合言葉解錠 | Accepted（0005 を置換） |
| [0009](./0009-test-conventions.md) | テストの書き方の規約（G3: 名前・構造・関心の一括是正） | Accepted（docs/adr/0006 へ昇格） |
| [0010](./0010-design-doc-source.md) | 設計文書の正本は `docs/plans/`（`docs/superpowers/` は履歴アーカイブ） | Superseded by docs/adr/0002 |
