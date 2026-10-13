# R4 core の不変条件を型と事前条件で表す（#364）— 実装計画

- **Issue**: [#364](https://github.com/tomohiroJin/tasuki-tools/issues/364)（親 [#360](https://github.com/tomohiroJin/tasuki-tools/issues/360)）
- **設計正本**: [`2026-10-13-large-refactoring-design.md`](../specs/2026-10-13-large-refactoring-design.md) §5.4
- **日付**: 2026-10-13
- **実測時点**: main `e9180c9` ＋ #379 の作業ブランチ（#361・#362・#363 の後）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 不変条件は性質のテストで先に固定する（Task 1）。`Result` へ変える関数は、変えた後の契約のテストを先に赤で書く（Task 2・Task 5） |
| II. 技術選定は ADR を通す | 該当なし | 依存を足さない（fast-check は timer-core に既にある） |
| III. 揮発インメモリと単純運用 | 該当なし | 状態の持ち方に触れない |
| IV. 境界の型安全 | 通過 | この Issue の本体。ドメインは投げない・失敗は `Result`・不変条件は型か性質のテストで表す |
| V. 実画面検証 | 通過 | 実 WS 越しのテストで、wire の応答が変わらないことを確かめる（Task 7） |
| VI. 依存は内向き | 通過 | ドメインのモジュールの状態を外へ出し、呼び出し側（アプリケーション層）が持つ（Task 3） |
| VII. 検査は壊して確かめる | 通過 | ドメインの `throw` とトップレベルの `let` を拒む規則を、既存の検査に足して壊して確かめる（Task 6） |
| VIII. 記録が正本 | 通過 | `docs/adr/0017` 決定 5 とコード（room-core）の食い違いを、コードを直して解く |
| IX. 小さく回す | 通過 | PR 1 本。デプロイは伴わない |
| X. 抽象は実需で | 通過 | 新しい抽象は作らない。ブランド型と配列の畳み込みは見送る（§2） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密・個人情報を扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 1. 着手時点の実測（Issue 本文の前提との差）

| Issue の項目 | 実測 | 確かめた場所 |
|---|---|---|
| roulette-core の `throw` | `draw.ts:35` の 1 件だけ（packages の core 全体で `throw` はこれだけ）<br>**既に同じ形の前例がある**: 乱数源のもう 1 つの契約違反（`randomSettle`）は `INVALID_SETTLE` を `Result` で返し、同期サーバーが `INTERNAL_ERROR` に読み替えている（`roulette-handlers.ts:189-190`・`errors.ts:27`）<br>`draw.test.ts:115-116` が「`RangeError` を投げる」を固定している | 同左 |
| 〃 いまの wire の応答 | `throw` は同期サーバーのハンドラを突き抜け、接続層が隔離して `INTERNAL_ERROR`（「サーバー内部でエラーが発生しました」）を返す。**ログに `on-message-error` を 1 行残す**。`INVALID_SETTLE` の経路はログを残さない | `ws-adapter.ts` の `handleRouletteMessage` |
| `records.ts` のモジュールの状態 | `let counter = 0`（packages の core 全体でトップレベルの `let` はこれだけ）<br>ID の形は `${現在時刻36進}-${連番36進5桁}` で、利用者の端末が記録を保存するときの ID になる<br>**呼び出しは同期サーバーの 1 か所**（`apply-room-level-event.ts:143`。`applyEvents` を通る呼び出しは src に 4 か所） | `records.ts`・`grep` |
| `as IntervalMinutes` | `evolve.ts:426` の `buildConfigFromReset` が、秒 → 分 → 秒の往復のために分へ戻している。`initialAggregate` が分を受けて秒に直すため<br>**秒のまま渡せば、変換も `as` も要らない** | `evolve.ts:60,423-428`・`aggregate.ts:217-235` |
| `rotation` と `driverCounts` の並んだ配列 | `driverCounts` は 11 ファイル・25 か所で使われ、**wire（`Room.session.driverCounts`）・端末の保存形式・まとめの画面**にも出る<br>畳むと wire の外の 3 層まで動く | `grep` |
| `evolve` の `NaN` | `decideMemberRemove` が止めているので届かない（#376 で直す） | `decide.ts:285-288` |
| room-core の `Result` | 黙って何もしない関数が 4 つある<br>・`addParticipant`（同じ ID でも足す）<br>・`removeParticipant`（居ない ID）<br>・`attachConnection`（居ない参加者）<br>・`removeConnection`（知らない接続）<br>**呼び出しは同期サーバーの 7 か所で、どれも先に存在を確かめてから呼ぶ**（失敗の枝はいまは届かない）<br>`room.test.ts` が「何も起きない」を仕様として固定している（`:65,213,241`） | `room.ts:61-111`・`grep` |
| room-core の ID のブランド型 | 取り違えは、#95 S4a で関数名を変えて（`detachConnection` → `removeConnection`）型検査で拾える形にした。ID は同期サーバーの全体（接続層・ハンドラ・ポート）を流れる | `room.ts:94-101` |
| 事前条件のそろい方 | `decideMemberAdd` が**参加者 ID**を trim して `EmptyName` / `DuplicateName` を返す。**どちらも wire に出るエラーコード**<br>`decideAddProxy` と `decideRename` の空の名前の確かめ（各 3 行）は、境界の表示名の規約（`normalizeCommandNames`）が先に拒むので、wire からは届かない | `decide.ts:118-146,245-265` |
| 非 null の断定 `!` | `evolve.ts:396`・`topic-core/fallback.ts:35`・`room-core/display-name.ts:217`・`markdown/blocks.ts:89`（2 つ） | `grep` |
| 使っていない引数 | `evolve(_now)`（公開 API。全ての呼び出しの形をそろえるため）<br>`decideConfigSet(_agg)`（モジュールの内側）<br>poker の `revealBy` / `nextRound` の `_actorId`（`RoomAction` の型に合わせるため） | 同左 |
| 機械の検査 | `audit-domain-side-effects.mjs` は、ドメインのパッケージの `src` に禁止の字面（`Date.now(` など）が無いことを見る。**`throw` とトップレベルの `let` は見ていない** | `scripts/audit-domain-side-effects.mjs:77-161` |
| 変異のパッチ | 触るファイルに当たるもの<br>・roulette: draw（m151・m152）・roulette（m153・m157）・roulette-handlers（m156・m171・m172）<br>・timer: aggregate（m01）・evolve（m06）・apply-room-level-event（m97・m109）<br>・room-core: room（m26）・display-name（m04・m49〜m54）<br>・同期サーバー: join-room（m12・m31）・poker-handlers（m30・m33）<br>・その他: markdown blocks（m107）・audit-domain-side-effects（m14） | `scripts/mutations/*.patch` |

## 2. この PR でやること・やらないこと

**やること（PR 1 本）**

1. **不変条件を性質のテストで固定する**（Task 1）
   - `rotation.length === driverCounts.length`
   - `0 ≤ currentIndex < rotation.length`（輪が空でないとき）
   - どちらも `decide` → `evolve` の任意の列で成り立つ
2. **roulette の `throw` を `Result` にする**（Task 2）。前例（`INVALID_SETTLE`）と同じ形で `INVALID_RANDOM` を返し、同期サーバーが `INTERNAL_ERROR` に読み替える
3. **記録の ID の生成器を注入にする**（Task 3）。`createRecordIdGenerator()` を timer-core に置き、状態は呼び出し側（同期サーバーの組み立て）が持つ。ID の形は変えない
4. **`as IntervalMinutes` を外す**（Task 4）。リセットは秒のまま初期の集約を組む
5. **room-core の 4 つの関数を `Result` にする**（Task 5。`docs/adr/0017` 決定 5 にコードを合わせる。2026-10-13 の利用者の判断）。呼び出し側は、失敗のとき今と同じく何もしない
6. **ドメインの `throw` とトップレベルの `let` を、既存の検査で拒む**（Task 6）
7. **`!` を、確かめてから狭める形に置き換える**（Task 7）。置き換えられないものは理由を 1 行で残す
8. **`decideConfigSet` の使っていない引数を外す**（Task 7）

**やらないこと（理由つき）**

| 項目 | 理由 |
|---|---|
| `rotation` と `driverCounts` を 1 つの席の配列に畳む | wire・端末の保存形式・画面まで動く（11 ファイル・25 か所）。不変条件は性質のテストで守る（Task 1） |
| room-core の ID をブランド型にする | 同期サーバーの全体に広がる。取り違えは関数名で既に防いでいる。`docs/adr/0007` 基準 3（変更が現に難しいときだけ） |
| `evolve` の `NaN` を直す | 振る舞いの変更（#376）。ここでは届かないことを Task 1 の性質のテストで固定する |
| `decideMemberAdd` の `EmptyName` / `DuplicateName` を、ID 向けのエラーに改める | wire のエラーコードが変わる |
| 空の名前の確かめ（各 3 行）をまとめる | `docs/adr/0007` 基準 2 に満たない |
| `evolve(_now)`・poker の `_actorId` を外す | 公開 API と型（`RoomAction`）の形をそろえるための引数である。外すと呼び出し側が全て変わる |

## 3. 振る舞いを保つ方法

**「変えない」の定義**（設計正本 §4.1）

- プロトコル: wire の応答が変わらない
- ドメイン: 同じ入力に同じ結果
- ログ: 変わらない（下の「ログを保つ」）

**ドメインの関数の契約は、2 つの所で意図して変える**（どちらも利用者からは見えない）。

- roulette の `drawWinner`: 投げる → `Result` を返す
- room-core の 4 つの関数: 黙って同じ値を返す → `Result` を返す

既存のテストのうち、この 2 つの契約を固定しているもの（`draw.test.ts:115-116`・`room.test.ts:65,213,241`）は、新しい契約に書き換える。**書き換えるのはこの 4 件だけで、PR に列挙する。**

**ログを保つ**（2026-10-13 の利用者の判断）: roulette の乱数源が契約を破ったとき、いまは接続層が `on-message-error name=RangeError` を error で 1 行残す。`Result` にすると例外が接続層へ届かなくなり、このままではログが消える。**ログが消えるのは振る舞いの変更**なので、ハンドラが同じ行を自分で残す。

- ログが消えると困ること: 起きないはずの乱数源の不具合（アダプタの誤り・将来の退行）を本番で知る手がかりは、この 1 行だけである。利用者には「サーバー内部でエラーが発生しました」しか見えないので、問い合わせを受けても原因も回数も追えなくなる
- 形: roulette のハンドラにロガーを渡し（`RouletteHandlerDeps.logger`）、`INVALID_RANDOM` を受けたら `logger.error("on-message-error", { name: ERROR_NAMES.rangeError })` を出してから `INTERNAL_ERROR` を返す。行の中身・水準・順（ログ → エラーフレーム）は接続層と同じ
- 例外の名前はログの語彙（`application/log/vocabulary.ts`）に置く。ハンドラの中で `publicText` を呼ばない（`audit-log-hygiene` の許可ファイルを増やさない）
- 「このファイルはログを書かない」（冒頭の注記）は、利用者の入力（ゲストの名前・表示名）を書かないという意味に改める。出すのは固定の語彙だけ
- 前例の `INVALID_SETTLE` はもともとログを残していない。足すと振る舞いが変わるので、この PR では触らず [#382](https://github.com/tomohiroJin/tasuki-tools/issues/382) で扱う

## 4. タスク

### Task 1: 不変条件を性質のテストで固定する

**変えるファイル**: `packages/timer-core/test/properties.test.ts`（既存の fast-check の生成器 `actionArb` を使う）

- 任意の操作の列を `decide` → `evolve` で流し、各段で次が成り立つ
  - `rotation.length === driverCounts.length`
  - 輪が空でないなら `0 ≤ currentIndex < rotation.length`
  - **輪が空にならない**（`decide` が最後の 1 人の `member.remove` を拒む。#376 の `NaN` に届かないことの固定）
- **確かめる（緑で入るので、壊して赤を見る）**
  - `decideMemberRemove` の `rotation.length <= 1` の確かめを外す → 赤
  - `evolveMemberAdded` の `driverCounts` を伸ばす行を外す → 赤
- 所要: 1.5 時間

### Task 2: roulette の `throw` を `Result` にする

**先に書く赤いテスト**

- `packages/roulette-core/tests/draw.test.ts:115-116` を、「`randomInt` が範囲外を返したら `INVALID_RANDOM` の `Result` を返す」に書き換える（書き換える 4 件の 1 つ）
- `startSpin` が `INVALID_RANDOM` を返す組を `roulette.test.ts` に足す
- `apps/tasuki-sync/test/roulette-handlers.test.ts` に、範囲外を返す乱数源を差し込む組を足す
  - `INTERNAL_ERROR`（「サーバー内部でエラーが発生しました」）のエラーフレームを返す
  - ロガーに `on-message-error name=RangeError` が error で 1 行だけ残る
  - いまは `throw` がハンドラを突き抜けるので、この組は赤になる
  - 接続層が隔離したときと同じフレーム・同じ行になることを、期待値に直書きして示す

**変えるファイル**

- `roulette-core/src/draw.ts`: `drawWinner` が `Result<DrawResult, RouletteError<"INVALID_RANDOM">>` を返す
- `roulette-core/src/errors.ts`: ドメインのコードに `INVALID_RANDOM` を足す。wire に載せないコードの注記（`:27`）に並べる
- `roulette-core/src/roulette.ts`: `startSpin` が `INVALID_RANDOM` を伝える
- `apps/tasuki-sync/src/application/roulette-handlers.ts:189-190`: `INTERNAL_ERROR` に読み替える。`INVALID_RANDOM` のときだけ、先にログを 1 行残す（§3「ログを保つ」）
- `apps/tasuki-sync/src/application/log/vocabulary.ts`: `ERROR_NAMES.rangeError` を足す
- `apps/tasuki-sync/src/create-sync-server.ts`: ハンドラにロガーを渡す

**確かめる**: 実 WS 越しのルーレットのテスト（`live-ws.roulette.test.ts`）が緑。変異 m151・m152・m153・m157・m156・m171・m172 を当て直す（ID は変えない）

- 所要: 2 時間

### Task 3: 記録の ID の生成器を注入にする

**先に書く赤いテスト**（`packages/timer-core/test/records.test.ts`）

- `createRecordIdGenerator()` が返す関数は、同じ時刻でも違う ID を返す
- ID の形は `${時刻36進}-${連番36進5桁}`（いまの形。正規表現で固定する）
- 生成器ごとに連番が独立している

**変えるファイル**

- `timer-core/src/records.ts`
  - `let counter` を外し、`createRecordIdGenerator()`（連番をクロージャに持つ）を置く
  - `buildCompletionRecord` は ID の生成器（`(now: number) => string`）を引数で受ける
- `apps/tasuki-sync/src/application/apply-room-level-event.ts`: `applyEvents` が生成器を受けて渡す（呼び出し 4 か所）
- 生成器は、同期サーバーの組み立て（`makeHandlers` の中、または `create-sync-server.ts`）で 1 つだけ作る。いまのモジュールの状態と同じく、プロセスに 1 つ
- `timer-core/src/index.ts`: `createRecordIdGenerator` を明示して列挙する（同期サーバーが使う）

**確かめる**

- 完成記録の ID が、いままでと同じ形で、同じ順に振られる（同期サーバーの完成のテストが緑）
- 変異 m97・m109 を当て直す
- 所要: 2 時間

### Task 4: `as IntervalMinutes` を外す

**変えるファイル**

- `timer-core/src/aggregate.ts`: `initialAggregate` の本体を、秒を受ける内側の関数に分ける。`initialAggregate(config, rotation)` は分を秒にしてそれを呼ぶ（公開の形は変えない）
- `timer-core/src/evolve.ts`: リセット（`:60`）は秒のまま内側の関数を呼ぶ。`buildConfigFromReset` と `as IntervalMinutes` を外す

**確かめる**

- リセットの後の `intervalSeconds` と `secondsLeftAtAnchor` が変わらない（`reset-restart.test.ts`）
- 変異 m01・m06 を当て直す
- 所要: 45 分

### Task 5: room-core の 4 つの関数を `Result` にする

**先に書く赤いテスト**（`packages/room-core/tests/room.test.ts`）

`room.test.ts:65,213,241` の 3 件を、新しい契約に書き換える（書き換える 4 件のうちの残り 3 件）。足すのは同じ ID の `addParticipant` の 1 件。

| 関数 | 失敗の条件 | 返すエラー |
|---|---|---|
| `removeParticipant` | 居ない ID | `PARTICIPANT_NOT_FOUND` |
| `attachConnection` | 居ない参加者 | `PARTICIPANT_NOT_FOUND` |
| `removeConnection` | 知らない接続 | `CONNECTION_NOT_FOUND` |
| `addParticipant` | 同じ ID が居る | `DUPLICATE_PARTICIPANT` |

**変えるファイル**

- `room-core/src/room.ts`
  - 上の 4 つの関数を `Result<Room, RoomError>` にする
  - エラーの値は判別子だけを持つ（`docs/adr/0016` 決定 2・`audit-domain-error-shape.mjs` の宣言に足す）
- room-core の `package.json`: neverthrow を足す。**ほかの core と同じ版の範囲**（`^8.2.0`）で、新しい依存の種類ではない（原則 II の対象外）。`audit-supply-chain-config` と lockfile を確かめる
- 同期サーバーの呼び出し 7 か所（`join-room.ts`・`poker-handlers.ts`・`presence.ts`・`participant-remove.ts`）
  - 失敗のときは**今と同じく元の `Room` のまま**進む
  - 失敗の枝が届かないことは、呼び出しの手前の存在の確かめが保証する。それを 1 行のコメントで書く

**確かめる**

- 同期サーバーの全テスト・実 WS 越しのテストが緑
- 変異 m26・m12・m31・m30・m33 を当て直す
- 所要: 2.5 時間

### Task 6: ドメインの `throw` とトップレベルの `let` を、検査で拒む

**変えるファイル**: `scripts/audit-domain-side-effects.mjs`（と自己テスト）

- `FORBIDDEN` に `throw ` を足す
- トップレベルの `let`（行頭の `let ` / `export let `）を拒む規則を足す
- 字面で見る検査なので、コメントの中の語も拾う（この検査の既存の方針どおり。#360 時点で該当の字面は Task 2・3 の後に 0 件になる）

**確かめる（壊して赤を見る）**

- `roulette-core` の `src` に `throw new Error("x")` を足す → 赤
- `timer-core` の `src` に `let x = 0;` を足す → 赤
- 変異 m14 を当て直す
- 所要: 1 時間

### Task 7: `!` と使っていない引数

- `!` の 5 か所を、確かめてから狭める形にする
  - 例: `const entry = pool[i]; if (entry === undefined) …`
  - 置き換えると振る舞いが変わる（到達しない枝で別の値を返す）ものは、`!` のまま残し、なぜ届かないかを 1 行で書く
  - どれをどちらにしたかを PR に書く
- `decideConfigSet` の `_agg` を外す（モジュールの内側だけ）
- 変異 m04・m49〜m54・m107 を当て直す
- 所要: 1 時間

### Task 8: 文書を合わせ、通して確かめる

- 設計正本 §5.4 に、この計画で決めたこと（§2）を日付つきで追記する
- `docs/adr/0017` 決定 5 は、コードが決定に追いつくので追記は要らない。追いついた日付と PR を、追記ではなく PR の本文に書く
- 通しで確かめる
  - `pnpm test`・`pnpm typecheck`
  - 構造監査（`audit-domain-side-effects`・`audit-domain-error-shape`・`audit-public-surface`・`audit-structure`・`audit-supply-chain-config`）
  - `node scripts/mutation-check.mjs`
  - e2e は CI で確かめる
- 所要: 1 時間（変異検査の時間を除く）

## 5. 変異の ID

**新しい ID は使わない**（#361〜#363 と同じ理由。#94 PR 3 の宣言とぶつかる）。新しい検査と性質のテストの破壊検証は、手で壊して赤を見る。

## 6. 完了条件（#364 の完了条件をこの計画に合わせて読み替えたもの）

- [x] packages のドメイン（`audit-domain-side-effects` の宣言）に `throw` とトップレベルの `let` が無く、検査がそれを拒む（壊して確かめた）
- [x] 並んだ配列の長さと `currentIndex` の範囲が、性質のテストで固定されている
- [x] room-core の 4 つの関数の失敗が型に出ていて、呼び出し側がそれを扱っている
- [x] wire の応答・ドメインの結果・ログが変わっていない。書き換えた既存のテストは 4 件で、PR に列挙した
- [x] 変異検査が緑（パッチの ID は変えない）
- [x] 見直したことを設計正本 §5.4 と #364 に残した

## 7. 実施の記録（2026-10-13）

計画から外れたこと・計画の時点で分かっていなかったことだけを書く。

- **ログを今と同じに保った**（§3「ログを保つ」。着手前の利用者の判断）。roulette のハンドラにロガーを渡し、`INVALID_RANDOM` のときに `on-message-error name=RangeError` を error で 1 行残す
  - 行の中身・水準・順（ログ → エラーフレーム）を `roulette-handlers.test.ts` が固定する。ログの行を消すと赤になることを確かめた
  - 前例の `INVALID_SETTLE` に記録の抜けがあることが分かった。足すと振る舞いが変わるので #382 に分けた
- **不変条件の性質のテストは、既にコマンドの種類ごとにあった**（`properties.test.ts`）。足したのは「全てのコマンドを混ぜた列」の 1 本である
  - **既存のテストは、最後の 1 人の削除の確かめを外しても緑のままだった。** fast-check は既定で配列を短く作るので、輪が 1 人まで減る列がほとんど生まれない。新しいテストは `size: "max"` と削除の重みで届かせ、外すと赤になることを確かめた
- **記録の ID の連番は、ルームごとではなくハンドラ（本番ではプロセス）に 1 つ**である。2 つのルームの記録が 1 つの連番を共有することを `handlers.lifecycle.test.ts` で固定した（生成器をルームごとに作ると赤になる）
  - `applyEvents` の `now` は使われていなかった（`applyRoomLevelEvent` の `_now`）ので、生成器に置き換えた
- **`as IntervalMinutes` を外しても値が変わらない根拠**: `intervalSeconds` に書き込むのは `IntervalMinutes * 60` の 2 か所だけで、60 の倍数の秒は分との往復で値が変わらない。リセット後の集約の全体を特性テストで固定した
- **room-core の失敗の枝は、1 か所だけ届く。** 計画は「呼び出しはどれも先に存在を確かめる」としていたが、`participant-remove.ts` は代理を外すときに `removeParticipant` の `PARTICIPANT_NOT_FOUND` へ届く（代理は名簿に居ない）。名簿の中身は前と同じ（`unwrapOr` で元の名簿）で、そのことをコメントに書いた。ほかの 6 か所は手前の確かめか、生成したばかりの ID で届かない
- **`throw` の検査は語ではなく正規表現にした**（`FORBIDDEN_PATTERNS`）。`"throw "` の字面では poker-core のコメントの「neverthrow の」を拾ってしまう
- **`!` は 6 つとも残し、届かない理由を 1 行ずつ書いた。** どれも作りの上で届かない枝で、置き換えると届かない枝の振る舞い（`undefined` のまま進むか、`TypeError` で落ちるか）が変わる
- **書き換えた既存のテストは計画どおり 4 件**（`draw.test.ts` 1 件・`room.test.ts` 3 件）。成功の組で戻り値の中身を取り出すための `_unsafeUnwrap()` は、期待値を変えていないので数えていない
- **変異のパッチは 7 本を当て直した**（m26・m109・m151・m152・m153・m172。ID と変異の中身は変えない）。変異検査は全件検出
