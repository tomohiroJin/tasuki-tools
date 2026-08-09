# アーキテクチャ決定記録（横断）

このディレクトリには、**複数のアプリ・パッケージにまたがる**設計判断を記録します。
Michael Nygard 形式（背景 / 決定 / 影響 / ステータス）に従い、「なぜその選択をしたか」を残します。

> ADR は不変の記録です。判断が覆ったら ADR を削除せず、新しい ADR で `Superseded`（置換）します。

## 置き場の使い分け

| 置き場 | 範囲 |
|---|---|
| `docs/adr/`（ここ） | `packages/` と複数の `apps/` にまたがる判断 |
| `docs/timer/adr/` | `apps/timer-web` / `apps/timer-sync` に閉じた判断（0001〜0010） |

`docs/timer/adr/README.md` は「TDD Mob Pro Timer の重要な設計判断」を対象と宣言しているため、
横断的な判断はそちらに入れません。

**採番は各ディレクトリで独立**です。参照するときは `docs/adr/0001` のように
置き場ごと書いてください。

> **#68 で解消済み**: ADR のテンプレートと採番規約の統一は #68 が行いました。
> テンプレートは [`docs/adr/template.md`](./template.md)、採番規約の正本は
> [`docs/adr/0002`](./0002-document-system-three-layers.md) です。

## 一覧

| # | タイトル | ステータス |
|---|---|---|
| [0001](./0001-design-system-scope.md) | デザインシステムの適用範囲と層構造 | Accepted |
| [0002](./0002-document-system-three-layers.md) | 文書体系の三層構造 | Accepted |
| [0003](./0003-agile-operations.md) | アジャイル運用の形式化 | Accepted |
| [0004](./0004-sync-server-ports-and-adapters.md) | 同期サーバーはポート/アダプタ構成を標準とする | Accepted |
| [0005](./0005-result-and-boundary-validation.md) | 境界の型安全と関数型中心（Result 型のエラー処理と Valibot 境界検証） | Accepted |
| [0006](./0006-test-conventions.md) | テスト規約（検査は壊して確かめる） | Accepted |
| [0007](./0007-abstraction-criteria.md) | 抽象の導入基準 | Accepted |
