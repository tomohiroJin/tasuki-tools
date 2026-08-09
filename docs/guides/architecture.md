# アーキテクチャガイド

## このガイドの位置づけ

**層とディレクトリの対応・判断フロー・ユビキタス言語の正本はこのガイドです。**
「同期サーバーはポート/アダプタ構成を標準とする」という決定そのものは
[`docs/adr/0004`](../adr/0004-sync-server-ports-and-adapters.md) と
`.specify/memory/constitution.md` 原則 VI「依存は内向き」が定めており、層の
呼び方・対応表・判断フローの追加や更新は ADR の改版を経ずにこのガイドの更新のみで
行います（`docs/adr/0002` の三層構造・書き分け規則）。

## 層とディレクトリの対応表

2026-08-10 時点で `apps/timer-sync/src`（`ls` で実在確認済み: `adapters/`
`application/` `ports/`）と `packages/` の構成に基づく対応表です。

| 層 | 置き場 | 依存してよいもの |
|---|---|---|
| ドメイン | `packages/timer-core` `packages/poker-core` | なし（純粋関数と型のみ） |
| プロトコル契約 | `packages/protocol`・各 core の `protocol.ts`（例: `packages/poker-core/src/protocol.ts`） | ドメインの型 |
| アプリケーション | `apps/*-sync/src/application` | ドメイン・ポート |
| ポート | `apps/*-sync/src/ports` | ドメインの型 |
| アダプタ | `apps/*-sync/src/adapters`・`apps/*-web` | 上のすべて |
| UI 資産 | `packages/ui` | なし（CSS トークンと静的資産） |

**注記（poker-sync）:** `apps/poker-sync/src` は現在 `config.ts` / `rooms.ts` /
`server.ts` のモジュール関数中心の構成で、上表のポート/アダプタ標準形には
まだ従っていません。標準形への再編は [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)
（[`docs/adr/0004`](../adr/0004-sync-server-ports-and-adapters.md)）で行います。
新しくコードを書く際は timer-sync 側（`apps/timer-sync/src`）を標準の参照実装と
してください。

## 判断フロー

新しいコードをどの層に置くか迷ったら、次の順で問いを立てます。

1. **I/O・時計・乱数に触るか？ → アダプタ。** WebSocket・ファイル・`Date.now()`・
   乱数生成などの副作用はすべてアダプタ（`apps/*-sync/src/adapters`）に置き、
   ポートの型で上位層へ注入します。
2. **複数アプリで使う純粋ロジックか？ → core。ただし ADR 0007 の抽出基準を
   先に確認。** `packages/timer-core` / `packages/poker-core` に置けるのは
   純粋関数・型のみです。抽出してよいかどうかは
   [`docs/adr/0007`](../adr/0007-abstraction-criteria.md)（抽象化の基準。
   憲法 原則 X「抽象は実需で」）を先に確認します。呼び出し箇所が 1 つしか
   無いものは抽出しません。
3. **メッセージの形か？ → protocol（契約の単一情報源）。** クライアント/サーバー間
   でやり取りするメッセージのスキーマ・型は `packages/protocol` または各 core の
   `protocol.ts` に置きます。契約の正本を 1 つに保ちます（憲法 原則 VIII
   「記録が正本」の「契約には単一の情報源を宣言する」）。

いずれにも当てはまらない純粋なユースケース（ドメインとポートのみに依存する
手続き）は `apps/*-sync/src/application` に置きます。

## ユビキタス言語の用語集

初期は最小限とし、実装・文書の変更に合わせて育てます。用語を追加・変更する際は
このガイドの更新のみで行います（ADR の改版は不要）。

| 用語 | 意味 |
|---|---|
| ルーム | 参加者が集まる同期セッションの単位 |
| 参加者 | ルームに参加しているユーザー |
| ホスト | ルームを開始した参加者。ルームの管理権限を持つ |
| ドライバー（timer） | timer において、現在タイマーを操作している運転者 |
| 交代 | ドライバーが別の参加者へ切り替わること |
| ラウンド（poker） | poker において、1 つのお題に対する 1 回の投票 |
| 公開（reveal） | poker において、伏せていた各参加者の見積り値を開示すること |
| お題 | **timer と poker で同名別概念。** timer では「TDD の練習課題」を指し、
  poker では「見積りの対象（ストーリー・タスク）」を指す。文書・会話で
  「お題」を使うときは、どちらの意味かを文脈で明示すること |

## 関連

- 決定の根拠: [`docs/adr/0004`](../adr/0004-sync-server-ports-and-adapters.md)（同期サーバーはポート/アダプタ構成を標準とする）
- 抽象化の基準: [`docs/adr/0007`](../adr/0007-abstraction-criteria.md)
- 書き分けの規則: [`docs/adr/0002`](../adr/0002-document-system-three-layers.md)（文書体系の三層構造）
- 憲法: `.specify/memory/constitution.md` 原則 VI「依存は内向き」・原則 VIII「記録が正本」・原則 X「抽象は実需で」
