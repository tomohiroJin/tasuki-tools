# docs — 文書地図

Tasuki の文書は目的ごとに置き場が分かれています。まずここで「知りたいことがどこにあるか」を確認してください。

## 正本の宣言

**規範**の正本は次の 3 つです。

- **憲法**（[`docs/constitution.md`](./constitution.md)） — 何を守るか
- **横断 ADR**（[`docs/adr/`](./adr/)、アプリ固有は `docs/<app>/adr/`） — なぜそう決まっているか
- **ガイド**（[`docs/guides/`](./guides/)） — 今日どう書くか

**機能ごとの設計文書**は [`docs/superpowers/`](./superpowers/) に日付つきのファイル名（例:
`2026-08-09-<topic>.md`）で置きます（現行のスキル運用の出力先であり、現行運用です）。
[`docs/plans/`](./plans/) は SDD（Specification-Driven Development）期の記録であり、
新規の設計文書の追加先ではありません。**`docs/plans/` も `docs/superpowers/` も追記のみで、
完了しても移動・改名しません**（規約の正本は
[`docs/adr/0002`](./adr/0002-document-system-three-layers.md) の追記節）。

## 目的別の入口

| 知りたいこと | 行き先 |
|---|---|
| 守るべき原則 | [憲法](./constitution.md) |
| なぜそう決まっているか | [`docs/adr/`](./adr/)（横断）・`docs/<app>/adr/`（例: [`docs/timer/adr/`](./timer/adr/)・[`docs/poker/adr/`](./poker/adr/)、アプリ固有） |
| 今日どう書くか（DoD・EARS・振り返り・アーキテクチャ・開発手順・セキュリティ・PR の粒度） | [`docs/guides/`](./guides/) |
| 機能の設計経緯 | [`docs/superpowers/specs/`](./superpowers/specs/)・[`docs/superpowers/plans/`](./superpowers/plans/) |
| 過去の SDD 記録 | [`docs/plans/`](./plans/) |
| timer の実験記録 | [`docs/timer/experiments/`](./timer/experiments/) |
| デプロイしたい | [`deploy/README.md`](../deploy/README.md) |
