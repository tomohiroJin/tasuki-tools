# R8 `ws-adapter.ts` を責務ごとに分ける — 入場の門・生存確認・ツールの受け口・送り出し・HTTP（#368）— 実装計画

- **Issue**: [#368](https://github.com/tomohiroJin/tasuki-tools/issues/368)（親 [#360](https://github.com/tomohiroJin/tasuki-tools/issues/360)）
- **設計正本**: [`2026-10-13-large-refactoring-design.md`](../specs/2026-10-13-large-refactoring-design.md) §5.7
- **日付**: 2026-10-13
- **実測時点**: main `e9180c9` ＋ #379 の作業ブランチ（#361〜#367 の後。`13b95b6`）
- **#94 PR 3 との関係**: PR 3 のブランチ（`feature/issue-94-roulette-web`）は `apps/tasuki-sync/**` に触らない（`git diff --stat` で確認）。
  `docs/guides/architecture.md` は PR 3 が触るので、この PR では変えない（§2）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 13 の責務の固定を表にし（§1）、欠けている特性テストを分ける前に足す（Task 1）。入場の判定と HTTP の応答は、純粋な関数にしてから単体テストを先に書く |
| II. 技術選定は ADR を通す | 該当なし | 依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | 状態の持ち方に触れない |
| IV. 境界の型安全 | 通過 | ツールの受け口は、ツールごとのエラーフレームの型（`ServerMsg`・`HubServerMsg`・`TopicOwnFrame`・`RouletteOwnFrame`）を型引数で保つ。送り出しの型の区別（#181）も保つ |
| V. 実画面検証 | 通過 | 実 WS 越しのテスト（`live-ws.*`）と `pnpm e2e` が緑のままであることを確かめる |
| VI. 依存は内向き | 通過 | 表示名の正規化（業務の検証）をアダプタからアプリケーション層へ戻し、アダプタがアプリケーション層から取り込むものを許可表のテストで固定する（Task 2） |
| VII. 検査は壊して確かめる | 通過 | 新しいテストは、守る対象を壊して赤を見る。変異のパッチ 5 本を ID と意味を変えずに当て直す |
| VIII. 記録が正本 | 通過 | `docs/adr/0011`（脅威モデル）・`docs/adr/0012`（ログ）の守りを弱めない。見つけた振る舞いの違いは変えずに固定し、記録する |
| IX. 小さく回す | 通過 | #379 に積む（2026-10-13 の利用者の了承）。コミットはタスクごと。デプロイは伴わない |
| X. 抽象は実需で | 通過 | ツールの受け口の定義は、同じ形が実際に 4 つある（§1）ので 1 つにする。poker は形が違うので無理に寄せない。タイマーのポートは足さない（ハートビートのテストは短い間隔の実時間で書けている） |
| XI. 秘密と個人情報を持ち込まない | 通過 | ログの形を変えない（`audit-log-hygiene.mjs`）。`publicText` を呼ぶ場所は動かすだけで増やさない（§2） |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 1. 着手時点の実測（Issue 本文の前提との差）

### 1.1 構造

| Issue の項目 | 実測 | 確かめた場所 |
|---|---|---|
| 行数 | 1,016 行（Issue のとおり）。うち約半分が docstring | `wc -l` |
| 60 行を超える関数 | `handleMessage`（83 行）・`handleOpen`（68 行） | 関数の行数の集計（#366 と同じ道具） |
| `readyState === WebSocket.OPEN` | 12 か所。**全てこのファイルの中**（他に無い） | `grep` |
| `handleHub/Topic/RouletteMessage` | 3 つは**エラーフレームの型だけが違い、中身は同じ** | 読んで比べた |
| timer の受け口 | 上の 3 つと**3 点違う**<br>・境界の検証（`CommandSchema`）と表示名の正規化をする<br>・**非同期の失敗（reject）ではログを出さない**（同期の throw では出す）。他の 3 つはどちらでも出す<br>・内部エラーの文言が違う（#381 で扱う） | `ws-adapter.ts:711-757` |
| poker の受け口 | 形が違う。接続（socket）そのものを渡し、エラーは `poker.sendError` で返し、同期の失敗では 1011 で閉じる。受理で `onConnect` を呼ばず、切断で `onDisconnect` ではなく `detachFromCurrentRoom` を呼ぶ | `:655,780-802,994-1004` |
| 層の規則で正規化の import を拒めるか | **拒めない。** `audit-dependency-direction.mjs` はパッケージの単位で、アプリの中の層（`adapters/` → `application/`）を見ていない | `scripts/audit-dependency-direction.mjs` |
| アダプタがアプリケーション層から取り込むもの | `connection-errors`・`log/logger`・`log/log-safe`・`log/vocabulary`・`normalize-command-names`・`poker-handlers`（型）・`roster-dto`・`tool-id` | `grep`（`src/adapters/*.ts`） |
| `publicText` を呼ぶ場所 | `classifyError` と `derive-client-key-error` の 2 か所。`audit-log-hygiene.mjs` の `ALLOWED_FILES` に `ws-adapter.ts` が載っている | `scripts/audit-log-hygiene.mjs:123` |
| このファイルに掛かる変異 | m13（鍵を `x-real-ip` から読む）・m36（`?tool=` を常に timer にする）・m82 / m167（topic / roulette で `onConnect` を飛ばす）・m83（timer の本文をお題のスキーマで横取りする） | `scripts/mutations/*.patch` |
| 外から使う所 | 組み立て（`create-sync-server.ts`）・timer の配信のアダプタ・テスト 11 ファイル（構築は `test/support/test-ws-adapter.ts` に集まっている。`onHub/Topic/RouletteMessage` の参照は 38） | `grep` |

> **解消（#381）**: 上の表の「timer の受け口」の違いのうち、内部エラーの文言と reject のログは #381 でそろえた（境界の検証と表示名の正規化だけが timer 固有）。

### 1.2 13 の責務の固定（テストの有無）

| # | 責務 | 固定しているテスト | 欠け |
|---|---|---|---|
| 1 | 起動と停止 | `ws-adapter.admin`（`close()` で同じポートに listen し直せる）・`ws-adapter.integration`（`port: 0`） | **bind の失敗（`process.exit(1)`）はテストできない**（テストのプロセスごと終わる） |
| 2 | HTTP | `ws-adapter.admin`（応答・426・ヘッダの許可表・`handleFetch` の隔離・`development: false`） | なし |
| 3 | `?tool=` の判定 | `ws-adapter-tool-query`（5 値。m36） | なし |
| 4 | 入場の可否 | `ws-adapter.integration`（Origin 1008・接続数 1013・空の許可表）・`ws-adapter.client-key`（鍵・弾いた接続で `onConnect` を呼ばない）・`ws-adapter.reject-log`（client-address・origin の 1 行） | **a.** 知らないツールの拒否のログ（`reason=tool`）<br>**b.** 判定の順番。鍵の無い接続のテストは Origin を許す設定（`allowedOrigins: []`）で書かれていて、**「鍵の検査が Origin より前」を固定していない**（`handleOpen` のコメントが守ろうとしている順番）。知らないツールが鍵より前であることも同じ<br>**c.** 接続数の超過ではログを出さないこと |
| 5 | 接続の登録と ID | `ws-adapter-connection-data`・`ws-adapter.client-key`（`rateKey`） | **d.** poker の受理で `onConnect` を呼ばない・切断で `onDisconnect` を呼ばない（topic・roulette は m82・m167 が見ている） |
| 6 | 生存確認 | `ws-adapter.heartbeat`（terminate・pong で保つ・1 回の欠落・`close()`） | なし |
| 7 | 大きさの制限 | `connection-error-text`（5 ツールのコードと文言）・`ws-adapter.message`（timer のバイト数） | **e.** フレームの上限（`maxPayloadLength`）を超えたときの閉じ方 |
| 8 | timer の検証と正規化 | `ws-adapter.message`・`connection-error-text`・`live-ws.display-name` | なし（Task 2 で、正規化で拒んだときのフレームを文言まで固定する） |
| 9 | poker の検証と振り分け | `connection-error-text`（大きすぎる）・`ws-adapter.message`（throw の隔離）・poker のテスト | **f.** 解析の失敗が `sendError(code, message)` で返ること（着手時に poker のテストを確かめ、無ければ足す） |
| 10 | 5 つの層への振り分け | `ws-adapter-tool-query`・`ws-adapter.message`（topic・roulette が他の層へ届かない） | なし |
| 11 | 例外の隔離とログ | `ws-adapter.message`（同期の throw: timer・hub・topic・roulette・poker）・`connection-error-text`（reject の文言）・`ws-adapter.client-key`（`onConnect`・`onDisconnect`） | **g.** reject のときのログ（hub・topic・roulette は出す、timer は出さない）<br>**h.** poker の `detachFromCurrentRoom` の throw のログ |
| 12 | 送り出し | `ws-adapter.message`（timer の `send` / `broadcast`）・`live-ws.*`（間接） | **i.** hub・topic・roulette の `send` / `broadcast` を直接は見ていない。知らない接続 ID を黙って飛ばすことも |
| 13 | 切断の通知 | `ws-adapter.heartbeat`（terminate で `onDisconnect`）・`ws-adapter.client-key` | d・h と同じ |

## 2. この PR でやること・やらないこと

**やること**

1. 欠けている特性テストを足す（§1.2 の a〜i。Task 1）
2. 表示名の正規化をアプリケーション層へ戻し、アダプタの取り込み先を許可表のテストで固定する（Task 2）
3. 部品を `adapters/ws/` に出す。**`ws-adapter.ts` は今の場所に残し、組み立て役にする**（下の判断 3）

   ```text
   apps/tasuki-sync/src/adapters/
     ws-adapter.ts            組み立て（Bun.serve・接続の表・下の部品を束ねる）
     ws/
       http-fallback.ts       管理用の経路・ヘッダーの許可表・426（純粋な関数）
       connection-gate.ts     ?tool= の判定・入場の判定（純粋な関数。順番もここで決まる）
       heartbeat.ts           ping/pong と欠落の数え上げ
       tool-channel.ts        ツールの受け口（大きさの上限・解析・渡す先・失敗の隔離とエラーフレーム）
       ws-send.ts             OPEN のときだけ送る 1 か所
       error-log.ts           例外の分類をログへ出す 1 か所（publicText を呼ぶのはここだけ）
   ```

4. **ツールの受け口を 1 つの定義にする。** hub・topic・roulette・timer の 4 つは `createTextChannel(spec)` 1 つで作る（違いは、解析・エラーフレーム・reject でログを出すかを spec で渡す）。
   poker は形が違う（接続そのものを渡す・1011 で閉じる）ので `createPokerChannel` に分ける。振り分けは「プロトコル → 受け口」の表 1 つから引く
5. 送り出し: 公開のメソッド 8 つ（`send`・`broadcast`・`sendHub`…）の名前と型は残し、中身を `ws-send.ts` の 1 つに寄せる。呼び出し元は変えない
6. `process.exit(1)` を組み立て（`server.ts`）へ移す（下の判断 2）
7. `WsAdapterOptions` の形をそろえる（下の判断 1）

**やらないこと**

- 守りの強化・設定値の変更（Issue のスコープ外）
- 振る舞いの違いをそろえること。timer だけが reject でログを出さない・timer だけ内部エラーの文言が違う（#381）は、**変えずに固定する**
  - **解消（#381）**: 内部エラーの文言・reject のログとも 4 つの接続でそろえた。
- `docs/guides/architecture.md` の更新（#94 PR 3 が触る。置き場の変更は PR 3 の後に追記する）
- タイマーのポート（`setInterval` の差し替え）。ハートビートのテストは短い間隔の実時間で書けている

### 判断していただきたいこと

| # | 論点 | 推す案 | 理由 | 退ける案 |
|---|---|---|---|---|
| 1 | `WsAdapterOptions` の形 | **ツールごとに `{ handleMessage }` を持つ handler オブジェクトにそろえる**（`timer`・`hub`・`topic`・`roulette`・`poker`）。接続の受理と切断（`onConnect`・`onDisconnect`）はコールバックのまま | hub・topic・roulette のハンドラは既に `handleMessage(connId, raw)` を持つので、組み立ての包むだけの関数 3 つが消える。poker は接続そのものと切断の後始末が要るので、コールバックにはできない | 全部をコールバックにする（poker が収まらない）。今の形のまま（20 項目の形が混ざったまま） |
| 2 | `process.exit(1)` | **組み立て（`server.ts`）へ移す。** アダプタは bind に失敗したら今と同じ 1 行のログを出して例外を投げ、`server.ts` が受けて `exit(1)` する | 本番で出るログの行と終了コードは同じ。**bind の失敗がテストできるようになる**（今はテストのプロセスごと終わる） | アダプタに残す |
| 3 | 置き場 | **`adapters/ws-adapter.ts` は今の場所に残し、部品だけ `adapters/ws/` に置く**（設計正本 §5.7 は `ws-adapter.ts` も `ws/` に入れる絵だった） | テスト 11 ファイル・変異のパッチ・`audit-log-hygiene.mjs`・コメント 20 か所以上がこのパスを指す。動かしても読み手の得が無い | 設計正本の絵のとおり `ws/ws-adapter.ts` へ動かす |

## 3. 振る舞いを保つ方法

- **入場の可否**: 判定を純粋な関数（`admit`）にし、拒否ごとの close コード・理由・ログの理由と**判定の順番**を表のテストで固定する。実 WS 越しのテスト（`ws-adapter.integration`・`client-key`・`reject-log`）は期待値を変えずに通す
- **大きさの制限・エラーフレーム**: `connection-error-text.test.ts`（5 ツール × コードと文言）と `ws-adapter.message.test.ts` を期待値を変えずに通す
- **ログの形**: Task 1 で、reject・throw・拒否のログの行を文字列まで固定する。`audit-log-hygiene.mjs` が緑。`publicText` を呼ぶ場所は 2 か所のまま `error-log.ts` へ動かし、`ALLOWED_FILES` の `ws-adapter.ts` を `ws/error-log.ts` に**置き換える**（項目は増やさない）
- **実経路**: `live-ws.*`（#366 の入口の特性テスト 32 件を含む）・`pnpm e2e`
- **変異**: m13・m36・m82・m83・m167 を、ID と意味を変えずに新しい置き場へ当て直す。`node scripts/mutation-check.mjs` で全変異の検出を確かめる
- **セキュリティの観点のレビュー**（Issue の完了条件）: 入場の門・クライアント鍵・大きさの上限に掛かる差分を、`/security-review` で見たうえで、利用者にも見ていただく

## 4. タスク

### Task 1: 欠けている特性テストを足す（緑で入れて、壊して赤を見る）

§1.2 の a〜i を、既存のテストのファイルに足す（新しいファイルは作らない）。

| 欠け | 足す先 | 壊して赤を見る方法 |
|---|---|---|
| a. 知らないツールの拒否のログ `conn-rejected reason=tool` | `ws-adapter.reject-log` | ログの理由を `origin` に書き換える |
| b. 判定の順番（知らないツール → 鍵 → Origin → 接続数）。「鍵も Origin も満たさない接続は `client-address` で拒む」「知らないツールで鍵も無い接続は `Unknown tool` で拒む」 | `ws-adapter.reject-log` | `handleOpen` の検査の順番を入れ替える |
| c. 接続数の超過ではログを出さない | `ws-adapter.reject-log` | 超過の枝にログを足す |
| d. poker の受理で `onConnect`、切断で `onDisconnect` を呼ばない（代わりに `detachFromCurrentRoom` を 1 回） | `ws-adapter-tool-query` | poker の早期 return を外す |
| e. フレームの上限（`maxFrameBytes`）を超えたときの閉じ方（close コードを実測して固定） | `ws-adapter.message` | `maxPayloadLength` を外す |
| f. poker の解析の失敗が `sendError(code, message)` で返る（poker のテストに無ければ） | `ws-adapter.message` | `sendError` に渡すコードを変える |
| g. reject のときのログ: hub・topic・roulette は `on-message-error name=Error`、timer は出さない | `connection-error-text` の reject の表に足す | hub の `.catch` からログを外す／timer の `.catch` にログを足す |
| h. poker の `detachFromCurrentRoom` の throw は `on-disconnect-error` を出し、プロセスは落ちない | `ws-adapter.client-key`（`onDisconnect` の throw と並べる） | `try/catch` を外す |
| i. hub・topic・roulette の `send` / `broadcast` が宛先にだけ届き、知らない接続 ID は黙って飛ばす | `ws-adapter.message`（timer の 2 本と同じ形で表にする） | `broadcastTopic` の宛先の絞り込みを外す |

### Task 2: 表示名の正規化をアプリケーション層へ戻す

1. **先に赤**: `test/adapter-imports.test.ts` を足す。`src/adapters/**` が `src/application/` から取り込んでよいものを許可表で持ち、表に無い取り込みを拒む。
   許可表は §1.1 の 8 つから `normalize-command-names` を除いた 7 つ。今は赤（`ws-adapter.ts` が `normalize-command-names` を取り込んでいる）
2. timer の受け口のアプリケーション側に `receiveTimerCommand(deps, connId, cmd)`（仮の名前）を置く。正規化 → 失敗なら `INVALID_COMMAND`（`CONNECTION_ERROR_TEXT.INVALID_COMMAND`）を本人へ返す → 通れば今の振り分け（`presence.ping` / `handleCommand`）。
   組み立ての `onMessage` の中身をこれに置き換える
3. アダプタから正規化を外す。**応答のフレームは今と同じ**（コード・文言）。`live-ws.display-name` の拒否のテストを、フレームを文言まで見る形に強める（緑のまま）
4. `CommandSchema` による境界の検証はアダプタに残す（受け口の形の検査で、業務の検証ではない。wire の契約の型を受け口で保つため）

### Task 3: HTTP を `ws/http-fallback.ts` へ出す

- `pickHeaders`・`ADMIN_HTTP_ALLOWED_HEADERS`・`HttpRequestInfo` と、「`httpHandler` の結果 → `Response`、無ければ 426」を純粋な関数にする。単体テストを先に書く
- `handleFetch` の全体の隔離（I-4）と `development: false` はアダプタに残す。`ws-adapter.admin` を期待値を変えずに通す

### Task 4: 入場の門を `ws/connection-gate.ts` へ出す

- `protocolFromRequestUrl` を移す（m36 を当て直す）
- `admit({ protocol, clientKey, origin }, { requireClientAddress, allowedOrigins, maxConnections, connectionCount })` → 受理か「拒否（close コード・理由の文・ログの理由または無し）」を返す純粋な関数にする。単体テストを先に書き、判定の順番を表で固定する
- `handleOpen` は判定を実行するだけにする（60 行を超える関数が 1 つ減る）

### Task 5: 生存確認を `ws/heartbeat.ts` へ出す

- 欠落の数え上げ（`track`・`pong`・`forget`）と定期実行（`start`・`stop`）を 1 つのクラスにする。間隔と閾値の下限の丸め（`Math.max(1, …)`・`Math.max(0, …)`）もここへ
- `ws-adapter.heartbeat` を期待値を変えずに通す

### Task 6: 送り出しを `ws/ws-send.ts` に寄せる

- 「OPEN のときだけ送る」と「宛先の ID の並びへ同じ JSON を送る」を 1 つずつにする。12 か所の `readyState` の確認が 1 か所になる
- 公開のメソッド 8 つは、型を保ったまま 1 行で委ねる（呼び出し元は変えない）

### Task 7: ツールの受け口を 1 つの定義にし、`WsAdapterOptions` をそろえる

1. `ws/tool-channel.ts` に `createTextChannel<Payload, Frame>(spec)` を置く。spec は「解析（無ければ生テキスト）・大きすぎるときのフレーム・内部エラーのフレーム・reject でログを出すか・渡す先」。hub・topic・roulette・timer の 4 つをこれで作る
2. poker は `createPokerChannel(handlers)`。受理で `onConnect` を呼ばない・切断で `detachFromCurrentRoom` を呼ぶ、も受け口の定義に持たせる（今の `if (protocol === "poker") return` の分岐が表の値になる）
3. 振り分けは「プロトコル → 受け口」の表 1 つ。`handleMessage`（83 行）は表を引くだけになる
4. `WsAdapterOptions` を判断 1 の形にする。組み立てと `test/support/test-ws-adapter.ts` を合わせる（テストの期待値は変えない）
5. 例外の分類のログを `ws/error-log.ts` に寄せ、`audit-log-hygiene.mjs` の `ALLOWED_FILES` の項目を置き換える
6. 変異のパッチ m13・m82・m83・m167 を当て直す（m82・m167 は「topic・roulette の受け口で受理の通知を止める」、m83 は「timer の受け口がお題のスキーマで横取りする」と意味を保つ）

### Task 8: `process.exit(1)` を `server.ts` へ移す

- **先に赤**: bind に失敗したら（同じポートで 2 つ目を起こす）、構築が例外を投げ、`http-server-error` のログが 1 行出ることのテストを書く（今はテストのプロセスごと終わるので、`process.exit` を差し替えずには書けない — 赤は「例外が投げられない」で見る）
- アダプタは例外を投げ直し、`server.ts` が `createSyncServer` の失敗を受けて `exit(1)` する（`config-error` と同じ形）。本番のログの行と終了コードは変わらない

### Task 9: 文書を合わせ、通して確かめる

- 設計正本 §5.7 に実施の追記（置き場・やらなかったこと）。この計画の末尾に実施の記録
- `ws-adapter.ts` の行や関数を指しているコメント（`normalize-command-names.ts`・`tool-id.ts`・`room-lookup.ts`・`connection-errors.ts` など）を新しい置き場に合わせる
- 通しの確認: §7

## 5. 着手の前に確かめること

- [ ] #379 の CI が緑（`13b95b6`）
- [ ] §1.2 の f（poker の解析の失敗）が poker のテストに既にあるか
- [ ] e（フレームの上限）を超えたときの close コードを Bun 1.3 で実測する（1009 のはず。違えば実測の値で固定する）

## 6. 変異の ID

**新しい ID は足さない**（#94 PR 3 の m162〜m182 とぶつけないため）。当て直すのは m13・m36・m82・m83・m167 の 5 本で、ID・名前・検出を期待するテストは変えない。

## 7. 完了条件（#368 の完了条件をこの計画に合わせて読み替えたもの）

- [ ] 入場の可否・大きさの制限・生存確認の振る舞いが変更前と同じ（既存の `ws-adapter.*` を期待値を変えずに通し、Task 1 の特性テストが緑。`docs/adr/0011` の守りが弱まっていない。`/security-review` と利用者のレビュー）
- [ ] ログの形が変わっていない（`audit-log-hygiene.mjs` が緑。Task 1 のログの固定。`ALLOWED_FILES` は増やさない）
- [ ] 実 WS 越しのテスト・`pnpm e2e`・変異検査が緑。変異のパッチ 5 本は ID を変えずに当て直した
- [ ] `ws-adapter.ts` に 60 行を超える関数が無い。`readyState` の確認が 1 か所
- [ ] アダプタがアプリケーション層から取り込むものが許可表で固定され、正規化を取り込んでいない
- [ ] `pnpm test`・`pnpm typecheck`・`pnpm lint`・構造監査・スクリプトの自己テストが緑
- [ ] #360 の共通の守りを満たす

## 8. 実施の記録（2026-10-13）

計画から外れたこと・計画の時点で分かっていなかったことだけを書く。

- **§2 の判断 1〜3 は、利用者が推奨を了承した**（ツールごとの handler オブジェクト・`process.exit(1)` を `server.ts` へ・`ws-adapter.ts` は今の場所）
- **フレームの上限を超えたときは 1006 で切れる**（§5 の見込みは 1009 だった。Bun 1.4 で実測した値で固定した。`ws-adapter.ts` の既存のコメントの「1006 切断」と同じ）
- **§1.2 の f（poker の解析の失敗）は、poker のテストに無かった**ので、接続層のテストに足した
- **ログの検査（`audit-log-hygiene.mjs`）は、ロガの event に文字列リテラルしか許さない。** 例外の分類のログを関数 1 つに寄せる案はこれに当たるので、`ws/error-log.ts` は `LogSafe` の値（`classifyError`・`errorName`）を作るだけにし、event は呼び出し側に残した。`ALLOWED_FILES` は `ws-adapter.ts` を `ws/error-log.ts` に置き換えただけ（項目は増やしていない）
- **取り込みの許可表のテストの字面を分けた。** `audit-dependency-direction.mjs` がテストの本文の `from "../../…"` も走査し、パッケージの外の取り込みとして拾ったため
- **起動の失敗のテストは、この機械が持たないアドレス（TEST-NET-3）で起こす。** テストの中では、同じポートの 2 つ目の bind を Bun が通すことがあった（`Bun.serve` を直に 2 回呼ぶと EADDRINUSE になる。テストの中だけの差は追っていない）
- **`/security-review` の指摘は無し**（入場の門の順番・鍵の fail-closed・レート制限の鍵の結び付け・大きさの上限・例外の隔離・ログの衛生・管理用のヘッダの許可表・起動を、分割の前と並べて確かめた）
- **`/code-review` の指摘のうち、次を直した**（1 つのコミット）
  - **正規化を飛ばす配線を型で落とす。** 正規化を接続層から移すと、「どの入口も正規化を通る」ことは組み立ての書き方に頼る形になる。timer の受け口をブランド型（`TimerCommandReceiver`）にし、`createTimerCommandReceiver` が作ったものしか `WsAdapterOptions.timer` に渡せないようにした（`@ts-expect-error` のテストで、ブランドを外すと型検査が赤になることを確かめた）。接続層のテストは、同期の throw を試すために素の関数をブランドだけ付けて渡す（`test/support/test-ws-adapter.ts`）。アダプタの取り込みの許可表に、型だけの `timer-command-receiver` を足した
  - 取り込みの許可表のテストが、一重引用符・副作用だけの取り込み・動的な取り込みも拾う
  - 接続層のエラーフレームを `connectionErrorFrame`（`application/connection-errors.ts`）1 つで作る
  - ハブ・お題・ルーレットの受け口の定義を 1 つの関数にした。フレームは行ごとに渡し、キャストせずその行の型で検査させる
  - 切断の後始末を受け口のメソッドとして呼ぶ（`this` を落とさない）
  - 入場の門の docstring の置き場と数、`docs/guides/security.md` の `publicText` の置き場
- **`/code-review` の指摘のうち、直さなかったもの**
  - 生存確認の ping / terminate を接続ごとに隔離すること: 分割の前から同じ形で、隔離を足すと振る舞いが変わる（リファクタリングの範囲外）
  - timer だけが reject でログを残さないこと（`logsRejection`）: 今の振る舞いを固定した（Task 1）。そろえるのは振る舞いの変更なので、#381（timer の内部エラーの文言）と合わせて決める
  - **解消（#381）**: timer も reject で `on-message-error` を残すようにそろえた（`logsRejection` を廃した）。
- **`pnpm e2e` はこの環境で走らない**（Playwright が求める Chromium の版がコンテナに無い）。CI の e2e で確かめる
- 結果: `ws-adapter.ts` は 1,016 行 → 522 行（半分以上が docstring）で、60 行を超える関数は無い。`readyState` の確認は `ws/ws-send.ts` の 1 か所。変異のパッチは m36・m82・m83・m150・m167 の 5 本を当て直した（m150 は組み立てのハブの配線の形が変わったため。計画の見込みの m13 はそのまま当たった）。変異検査は全件検出。`pnpm test`・`pnpm typecheck`・`pnpm lint`・構造監査・スクリプトの自己テスト（948 件）・同期サーバーのテスト（975 件）が緑
