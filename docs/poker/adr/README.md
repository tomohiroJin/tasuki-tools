# アーキテクチャ決定記録（poker）

このディレクトリには、`apps/poker-web` / `apps/poker-sync` / `packages/poker-core` に
閉じた設計判断を記録します。各 ADR は Michael Nygard 形式（背景 / 決定 / 影響 /
ステータス）に従い、「なぜその選択をしたか」を残します。

> ADR は不変の記録です。判断が覆ったら ADR を削除せず、新しい ADR で `Superseded`（置換）します。

**採番はこのディレクトリで独立**です。参照するときは `docs/poker/adr/0001` のように
置き場ごと書いてください（採番規約の正本は `docs/adr/0002`）。
横断的な判断は `docs/adr/` に置きます。

## 一覧

| # | タイトル | ステータス |
|---|---|---|
| [0001](./0001-poker-domain-direct-transition.md) | poker のドメインは直接遷移関数 ＋ Result を採る | Accepted |
| [0002](./0002-discarded-frame-disclosure.md) | 契約に合わないサーバーメッセージを捨てたことを利用者へ伝える | Accepted |
