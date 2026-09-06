# アーキテクチャガイド

## このガイドの位置づけ

**層とディレクトリの対応・判断フロー・ユビキタス言語の正本はこのガイドです。**
「同期サーバーはポート/アダプタ構成を標準とする」という決定そのものは
[`docs/adr/0004`](../adr/0004-sync-server-ports-and-adapters.md) と
`docs/constitution.md` 原則 VI「依存は内向き」が定めており、層の
呼び方・対応表・判断フローの追加や更新は ADR の改版を経ずにこのガイドの更新のみで
行います（`docs/adr/0002` の三層構造・書き分け規則）。

## 層とディレクトリの対応表

2026-08-17 時点の構成に基づく対応表です。`apps/timer-sync/src` と
`apps/poker-sync/src` はどちらも `ls` で `adapters/` `application/` `ports/` の
実在を確認済みで、表の `apps/*-sync/...` の行は両方に当てはまります。

| 層 | 置き場 | 依存してよいもの |
|---|---|---|
| ドメイン（メンバーシップ文脈） | `packages/room-core` | なし（純粋関数と型のみ） |
| ドメイン（ツール） | `packages/timer-core` `packages/poker-core` | なし（純粋関数と型のみ）。ただし `packages/timer-core` → `packages/room-core` は #95 S1 で生じた期限つきの一時依存で、**依存そのものは S4a で消える**（timer-core から表示名の扱いが無くなる段）。`scripts/audit-dependency-direction.mjs` の許可表からその行を削除するのは S4b（`docs/adr/0017` 決定 4） |
| プロトコル契約 | `packages/protocol`・各 core の `protocol.ts`（例: `packages/poker-core/src/protocol.ts`） | ドメインの型 |
| 共有ユーティリティ（sync 専用） | `packages/rate-limit` | なし（node 標準ライブラリのみ。ドメインの型にも依存しない） |
| アプリケーション | `apps/*-sync/src/application` | ドメイン・ポート・`packages/rate-limit` |
| ポート | `apps/*-sync/src/ports` | ドメインの型 |
| アダプタ | `apps/*-sync/src/adapters`・`apps/*-web` | 上のすべて |
| web の純粋判断 | `apps/*-web` 配下で React・I/O に依存しない `.ts`（例: `apps/timer-web/src/ui/screen.ts`・`apps/poker-web/src/router.ts` の `parseRoute` / `roomPath` / `topPath`） | ドメインの型のみ（React・I/O に依存しない） |
| web の同期フック | `apps/*-web` の同期フック 1 本（例: `apps/poker-web/src/hooks/useSync.ts`） | 上のすべて ＋ WebSocket |
| web の画面 | `apps/*-web` の `.tsx` | 同期フックと純粋判断のみ（同期クライアントを直接 import しない） |
| UI 資産 | `packages/ui` | なし（CSS トークンと静的資産） |

**web 層の 3 行について**: 責務の分離そのものを定めているのは
[`docs/adr/0015`](../adr/0015-web-layer-structure.md) です。本ガイドはその置き場を
示します。`apps/poker-web` は `hooks/useSync.ts` へ、`apps/timer-web` は `sync/use-timer-sync.ts` へ、
それぞれ WS の配線を集約しています（timer-web の再編は
[#167](https://github.com/tomohiroJin/tasuki-tools/issues/167) で完了）。
この境界は `scripts/audit-web-sync-boundary.mjs` が機械で見ています。

**`packages/rate-limit` について**: HMAC によるクライアント鍵導出とトークンバケツによる
レート制限（#103）を提供する node 専用パッケージ。`node:crypto` / `node:net` に依存するため
ブラウザバンドルへは載せられず、`packages/protocol` とは同居できない。ドメインの型も知らない
（IP 文字列とキー文字列のみを扱う）ため「ドメイン」でもなく、両 sync アプリが使い、
置き場も `src/` 直下（設定・組み立て）・`application/`・`adapters/` にまたがる
横断的な共有ユーティリティとして独立の行に置く。**どの層から import するかは
アプリごとに一様ではありません**（例: `apps/poker-sync/src/adapters` からの import は
0 件）。現況は `grep -rn "@tasuki/rate-limit" apps/*-sync/src` で引けます。

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
   
   **core に置くと決めたら、次に表現を選びます。** イベントの履歴・再生が要るなら
   Decider（`decide` / `evolve`）、状態遷移だけで足りるなら直接遷移関数 ＋ `Result`
   です。選択基準と、どちらを採っても揃える点（`Result`・`index.ts` の明示列挙・
   エラー型・`Date.now()` 禁止）の正本は
   [`docs/adr/0016`](../adr/0016-core-domain-representation.md) です。
   **どちらを採ったかは、そのアプリの ADR（`docs/<app>/adr/`）へ記録します（MUST）。**
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
| ラウンド（poker） | poker において、1 テーマに対する 1 回の投票 |
| 公開（reveal） | poker において、伏せていた各参加者の見積り値を開示すること |
| お題 | **timer では実装済みのドメイン概念、poker では未実装の提案段階の語。** timer では「TDD の練習課題」を指し、`packages/timer-core/src/problem.ts` の `Problem` 型として実装されている。poker では「見積り対象」を指す語として [#93](https://github.com/tomohiroJin/tasuki-tools/issues/93)（お題の入力と結果の書き出し）で提案中だが、現行の poker 実装（`packages/poker-core` `apps/poker-sync` `apps/poker-web` `packages/protocol`。`grep -rn "お題"` で 0 件を確認済み）にこの概念は存在しない。poker の初回リリース範囲外であることは `docs/poker/specs/001-planning-poker-mvp/spec.md` の Assumptions（「お題（ストーリー）リストの管理…は初回リリースに含めない」）にも明記されている。#93 が実装されるまでは、**timer の「お題」だけが実装済みのドメイン概念**であり、「お題」を使うときは同名別概念になりうることを文脈で明示すること |

## 一般的な方法論との対応

この体系は、方法論の名前ではなく**このプロジェクト固有の判断**として原則を立てている
（#68 設計時の決定。SOLID のような一般論を名前ごとに原則化せず、固有の判断に織り込む）。
名前で探す読者のための対応表:

| 方法論 | この体系での置き場 |
|---|---|
| DDD（ドメイン駆動設計） | 憲法 VI（ドメインの純粋性・境界）+ 本ガイドの層対応表とユビキタス言語の用語集 + [`docs/adr/0016`](../adr/0016-core-domain-representation.md)（ドメイン表現の選択制） |
| クリーンアーキテクチャ / ヘキサゴナル | 憲法 VI「依存は内向き」+ [`docs/adr/0004`](../adr/0004-sync-server-ports-and-adapters.md)（同期サーバーのポート/アダプタ標準）+ [`docs/adr/0015`](../adr/0015-web-layer-structure.md)（web 層の責務分離） |
| DbC（契約による設計） | 憲法 IV「事前条件 = 境界検証・不変条件 = 型」+ [`docs/adr/0005`](../adr/0005-result-and-boundary-validation.md) |
| SOLID | 単独の原則としては立てない。S（単一責任）と D（依存性逆転）は憲法 VI に、O・I はポート設計（[`docs/adr/0004`](../adr/0004-sync-server-ports-and-adapters.md)）に織り込み済み |
| TDD / BDD | 憲法 I（テスト駆動開発）+ [`docs/adr/0006`](../adr/0006-test-conventions.md)（Given/When/Then は構造監査 SC032 が機械検査） |
| DRY / YAGNI / デザインパターン抑制 | 憲法 X「抽象は実需で」+ [`docs/adr/0007`](../adr/0007-abstraction-criteria.md)（DRY は知識の重複に限る） |
| SOT（単一の情報源） | 憲法 VIII「記録が正本」（契約の単一情報源宣言を含む） |
| Tidy First（リファクタリング運用） | DoD 項目 6（[`docs/guides/definition-of-done.md`](definition-of-done.md)） |

## 関連

- 決定の根拠: [`docs/adr/0004`](../adr/0004-sync-server-ports-and-adapters.md)（同期サーバーはポート/アダプタ構成を標準とする）
- web 層の責務分離: [`docs/adr/0015`](../adr/0015-web-layer-structure.md)
- ドメイン表現の選択制: [`docs/adr/0016`](../adr/0016-core-domain-representation.md)
- 抽象化の基準: [`docs/adr/0007`](../adr/0007-abstraction-criteria.md)
- 書き分けの規則: [`docs/adr/0002`](../adr/0002-document-system-three-layers.md)（文書体系の三層構造）
- 憲法: `docs/constitution.md` 原則 VI「依存は内向き」・原則 VIII「記録が正本」・原則 X「抽象は実需で」
