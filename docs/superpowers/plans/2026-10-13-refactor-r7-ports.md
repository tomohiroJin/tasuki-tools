# R7 同期サーバーのポートを整える — 重なり・名前のぶつかり・大域呼び出しの注入（#367）— 実装計画

- **Issue**: [#367](https://github.com/tomohiroJin/tasuki-tools/issues/367)（親 [#360](https://github.com/tomohiroJin/tasuki-tools/issues/360)）
- **設計正本**: [`2026-10-13-large-refactoring-design.md`](../specs/2026-10-13-large-refactoring-design.md) §5.6
- **日付**: 2026-10-13
- **実測時点**: main `e9180c9` ＋ #379 の作業ブランチ（#361〜#366 の後。`fcecf9c`）
- **#94 PR 3 との関係**: `docs/guides/architecture.md` は PR 3 が触るので、この PR では変えない（ポートの置き場の変更は、PR 3 の後に追記する。§2）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 時計を差し替えて振る舞いを固定するテストが無いもの（ルームの回収の定期実行）は、先に足す（Task 1）。大域の呼び出しを拒むテストは、違反を残したまま赤を見てから直す（Task 3） |
| II. 技術選定は ADR を通す | 該当なし | 依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | 状態の持ち方に触れない |
| IV. 境界の型安全 | 通過 | ポートの型を名前で区別する（壁時計と単調時計・timer と poker の配信） |
| V. 実画面検証 | 通過 | 実 WS 越しのテスト（#366 の入口の特性テストを含む）が緑のままであることを確かめる |
| VI. 依存は内向き | 通過 | アプリケーション層が大域の時計・乱数を直接呼ばず、ポートを通す（Task 3）。配信のアダプタを組み立てから `adapters/` へ出す（Task 5） |
| VII. 検査は壊して確かめる | 通過 | 大域の呼び出しを拒むテストは、呼び出しを書き戻して赤を見る（Task 3） |
| VIII. 記録が正本 | 通過 | `docs/adr/0004`（ポート/アダプタ）・`docs/adr/0007` 追記 2026-08-17（タイマーのポート）の決定に従う。見送ったものは理由を残す |
| IX. 小さく回す | 通過 | #379 に積む（2026-10-13 の利用者の了承）。コミットはタスクごと。デプロイは伴わない |
| X. 抽象は実需で | 通過 | タイマーのポートは足さない（差し替えるテストが既に bun の偽のタイマーで足りている。§1）。ID の生成器 2 つは寄せない（形式が違う） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | ログの形を変えない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 1. 着手時点の実測（Issue 本文の前提との差）

| Issue の項目 | 実測 | 確かめた場所 |
|---|---|---|
| 時計のポートの重なり | `Clock`（`ports/clock.ts`。壁時計・`SystemClock`）と `MonotonicClock`（`ports/poker-monotonic-clock.ts`。単調時計・`adapters/poker-performance-clock.ts`）。**どちらも `now(): number` だけで、型では区別できない**<br>`MonotonicClock` は poker とルーレットが使う。`Clock` を使うファイルは src・test で 19 | `grep` |
| アプリケーション層の大域の呼び出し | **Issue の前提から変わっていた**<br>・`performance.now()`: `join-room.ts:113`・`topic-handlers.ts:138`、**Issue に無かった `check-room.ts:49`**。どれもレート制限の時刻（単調時計）<br>・`Math.random`: `handlers.ts` から #366 で `room-commands/shuffle-order.ts:13` へ移った。`RandomSource` ポート（`randomInt`）がある<br>・`Date.now()`: `room-reclaimer.ts:68`（定期実行の中で回収の時刻を読む）<br>・`setTimeout` / `setInterval`: `schedule.ts`・`presence.ts`・`topic-generation.ts`・`room-reclaimer.ts`<br>・`new Date(now)`（`ai-limits.ts:106`）は渡された時刻の書式化で、時刻を読んでいない | `grep` |
| タイマーのポート | **差し替えるテストは、bun の偽のタイマー（`jest.useFakeTimers`）で既に書かれている**（`schedule.test.ts`・`driver-absence*.test.ts`・`handlers.lifecycle.test.ts` など 6 ファイル）。ポートを足しても差し替えの実需が無い（`docs/adr/0007` 追記 2026-08-17 の条件を満たさない） | `grep` |
| 時間に依存する振る舞いのテスト | 自動交代・在室の判定・お題の生成の時間切れは、偽のタイマーか直接の呼び出しで固定されている<br>**ルームの回収の定期実行（`RoomReclaimer#start`）だけは固定されていない**（テストは `sweep(now)` を直接呼ぶ） | 同左 |
| `ServerTopicProvider` の契約 | `generate()` が `Promise<unknown>` を返し、失敗は `ProviderFailure`（理由つきの例外）で伝える<br>**生成器（`topic-generation.ts`）は、どの例外も捕まえて「理由: other」にする経路を持つ**（想定外の例外を隔離するため。同期の throw も `try/catch` で包む） | `topic-generation.ts:61,155-174` |
| `LogSink` / `Logger` の置き場 | `application/log/logger.ts` が、ポートの型（`LogSink`）・アプリケーションの型（`Logger`）・実装（`formatLine`・`createLogger`）を 1 つのファイルに持つ。`LogSink` を実装するのは `adapters/console-log-sink.ts` | 同左 |
| 組み立ての中のアダプタ | **Issue のとおり。** timer の `Broadcaster` と `HubBroadcaster`、宛先の選び方 3 つが `create-sync-server.ts:155-210` にある<br>前方参照の `let wsAdapter`・`let destroyRoom` は、ハンドラ ↔ WS アダプタの循環を断つためのもので、アダプタを出しても残る | 同左 |
| 名前のぶつかり | `Broadcaster`（timer / poker）・`HandlerDeps` と `makeHandlers`（timer / poker）・`RoomState`（`apply-room-level-event.ts` / `poker-handlers.ts:173`）<br>`RateLimitGate` は #366 で `PokerRateLimitGate` に分けた<br>poker 側の名前を使うファイルは、それぞれ 5〜7 | `grep` |
| 依存の袋 | **Issue の前提は当たっていなかった。** timer の `HandlerDeps`（14 項目）・poker（11 項目）とも、すべての項目を使っている<br>topic・roulette が受け取る `timers`・`codeGen` も、参加（`joinRoom`）が使う（timer の状態の遅延生成・参加者 ID の生成） | 項目ごとに `grep` |
| ID の生成器の重なり | `RoomCodeGen`（ルームコード・参加者 ID・復帰トークン）と poker の `IdGen`（参加者 ID・トークン）。**形式が違う**（ルームコードの形・ID の接頭辞） | `ports/code-gen.ts`・`ports/poker-id-gen.ts` |
| poker の `Broadcaster` の 2 つの役割 | 接続の登録（`attach` / `detach` / `resetRoom`）と配信（`broadcastSnapshot` / `sendTo`）。分けると poker のハンドラの依存の形が変わる | `ports/poker-broadcaster.ts` |
| 変異のパッチ | 触るファイルに当たるものは実装のときに数える（名前の変更は差分の文脈に掛かりうる）。当たらなければ当て直す（ID は変えない） | `scripts/mutations/*.patch` |

## 2. この PR でやること・やらないこと

**やること**

1. **ルームの回収の定期実行を、差し替えた時計で固定する**（Task 1）
2. **時計のポートを名前で分ける**（Task 2）
   - `Clock` → `WallClock`（`ports/wall-clock.ts`）、`SystemClock` → `SystemWallClock`
   - `ports/poker-monotonic-clock.ts` → `ports/monotonic-clock.ts`、`adapters/poker-performance-clock.ts` → `adapters/performance-clock.ts`
   - 型の中身は変えない（どちらも `now(): number`）。名前が意味を運ぶ
3. **アプリケーション層の大域の時計・乱数の呼び出しをポートに通し、テストで拒む**（Task 3）
   - レート制限の時刻（3 か所）は、依存に `monotonicClock: MonotonicClock` を足して読む。本番は `performance.now()` の実装を渡すので値は同じ
   - 並び替えの乱数は `RandomSource#randomInt` を受ける。本番は `crypto` の実装になる（§3 で確かめる）
   - ルームの回収の定期実行は `WallClock` を受ける
   - `test/application-globals.test.ts`: `src/application` に `performance.now(`・`Math.random(`・`Date.now(` が無いことを見る（タイマーは対象外。理由は「やらないこと」）
4. **`LogSink` を `ports/log-sink.ts` へ移す**（Task 4）。`Logger`（アプリケーションの型）と実装は `application/log/` に残す
5. **timer の配信のアダプタを `adapters/timer-ws-broadcaster.ts` へ出す**（Task 5）
   - 中身は `Broadcaster`・`HubBroadcaster`・宛先の選び方 3 つ
   - `create-sync-server.ts` は組み立てだけになる
   - 前方参照の `let` は循環を断つために残す（理由をコメントに書く）
6. **同じ名前の別物を区別する**（Task 6）
   - poker 側を改める: `PokerBroadcaster`・`PokerHandlerDeps`・`makePokerHandlers`・`PokerRoomState`
   - timer 側は名前を変えない。使う場所が多く、#94 PR 3 の手元とぶつかりやすいため

**やらないこと（理由つき）**

| 項目 | 理由 |
|---|---|
| タイマー（`setTimeout` / `setInterval`）のポート | 差し替えるテストは bun の偽のタイマーで既に書けている。`docs/adr/0007` 追記 2026-08-17 は「差し替えるテストが同じ PR にある場合だけ足す」と決めていて、その条件を満たさない |
| `ServerTopicProvider` を `Result` を返す契約にする | 生成器は、アダプタが想定外の例外を投げたときに隔離する経路（理由: other）を持ち続ける必要がある。`Result` にしても `try/catch` は消えず、契約が 2 通り（`Result` の失敗と例外）になる。得るものより複雑さが増える（原則 X） |
| 依存の袋を `Pick` で細くする | 実測ですべての項目を使っていた（§1）。細くするには、ハンドラ群そのものを分ける必要がある（#366 の範囲を越える） |
| `RoomCodeGen` と poker の `IdGen` を寄せる | 生成する形式が違う。寄せると、どちらかの ID の形が変わる |
| poker の `Broadcaster` の 2 つの役割を分ける | 分けると poker のハンドラの依存の形と、そのテストのフェイクがすべて変わる。名前の区別（Task 6）にとどめる |
| timer 側の型の名前を変える | 使う場所が多い（`Clock` だけで 19 ファイル）。ぶつかりは poker 側を改めれば解ける |
| `docs/guides/architecture.md` の更新 | #94 PR 3 が触るファイルである。ポートの置き場の変更（`LogSink`・時計の名前）は、PR 3 の後に追記する（#360 の順番の約束） |

## 3. 振る舞いを保つ方法

- **時計**: 名前を変えるだけで、本番で渡す実装（`Date.now()`・`performance.now()`）は変えない
- **レート制限の時刻**: 本番は `performance.now()` の実装をそのまま渡す。テストでも、既存のテストは実装の既定（本物の単調時計）を受け取るので、時刻の読み方は変わらない
- **並び替えの乱数**: `Math.random` → `RandomSource#randomInt`（本番は `crypto` の一様な整数）になる。**乱数の出どころが変わるので、出る順列の分布は同じ（一様）だが、同じ種で同じ順列にはならない。** 並び替えの結果は今も予測できない値で、テストは性質（順列であること・現ドライバーの位置）しか見ていない。利用者から見える違いは無い
  - ⚠ これを「振る舞いの変更」とみなすかは、#364 のログのときと同じく利用者に確かめる（§5）
- **ルームの回収**: 定期実行が読む時刻を `Date.now()` から注入した `WallClock` にする。本番は `SystemWallClock`（`Date.now()`）を渡す
- **フレーム**: 実 WS 越しのテスト（#366 の入口の特性テストを含む）が緑のままであること

## 4. タスク

### Task 1: ルームの回収の定期実行を固定する

**足すテスト**（`test/room-reclaimer.test.ts`）

- 偽のタイマーと偽の時計で、`start(interval)` の後に時間を進めると、空のルームが猶予の後に回収される
- 偽の時計は、システムの時刻と大きくずれた時刻を返す（偽のタイマーが `Date.now()` まで偽にする場合でも、時計の注入の有無で結果が分かれるように）
- このテストは、いまの実装（`Date.now()` を読む）では偽の時計の時刻が届かないので、**時計を注入するまで赤になる**（Task 3 で緑にする。先に赤で書く）
- 所要: 45 分

### Task 2: 時計のポートを名前で分ける

- `ports/clock.ts` → `ports/wall-clock.ts`（`WallClock`）
- `adapters/system-clock.ts` の `SystemClock` → `SystemWallClock`
  - テスト用の `FakeClock` は `FakeWallClock` にしない（テスト 30 ファイル余りが使う。中身は時計の偽物で、壁時計に限らず使える）
- `ports/poker-monotonic-clock.ts` → `ports/monotonic-clock.ts`、`adapters/poker-performance-clock.ts` → `adapters/performance-clock.ts`
- ファイル名の変更は `git mv` で行い、取り込みを直す。型検査が残りを拾う
- 所要: 1 時間

### Task 3: 大域の時計・乱数の呼び出しをポートに通し、テストで拒む

**先に書く赤いテスト**: `test/application-globals.test.ts`

- `src/application/**/*.ts` に `performance.now(`・`Math.random(`・`Date.now(` が 0 件（いまは 5 件で赤）
- 字面の検査。コメントの中の語も拾う（`audit-domain-side-effects` と同じ作法）

**変えるファイル**

- `join-room.ts`・`check-room.ts`: 依存（`JoinRoomDeps`・`CheckRoomDeps`）に `monotonicClock: MonotonicClock` を足し、`performance.now()` をそれに置き換える
- `topic-handlers.ts`: 同じく `monotonicClock` を受ける（ルーレットは既に持っている）
- `room-commands/shuffle-order.ts`: `randomInt: (n: number) => number` を受ける。`handlers.ts` は `HandlerDeps.random`（`RandomSource`）から渡す
- `room-reclaimer.ts`: コンストラクタで `WallClock` を受ける
- `create-sync-server.ts`: 本番の実装を渡す（`performance.now()` の時計は 1 つ作って共有する）
- テストの組み立て（`test/support/room-builder.ts` ほか、依存を組む所）: 本物の単調時計と、`Math.random` を使う乱数の偽物（テスト用。`test/support/` に置く）を既定で渡す

**確かめる**

- 大域の呼び出しのテストは、どこか 1 つに `performance.now()` を書き戻すと赤（壊して確かめる）
- Task 1 のテストが緑になる
- 実 WS 越しのテスト・レート制限のテストが緑
- 所要: 3 時間

### Task 4: `LogSink` を `ports/` へ移す

- `ports/log-sink.ts` に `LogSink`（と `LogLevel`）を置き、`application/log/logger.ts` と `adapters/console-log-sink.ts` はそこから取る
- `audit-log-hygiene.mjs` の許可ファイルは変えない（`publicText` も `as LogSafe` も動かさない）
- 所要: 30 分

### Task 5: timer の配信のアダプタを `adapters/` へ出す

**先に書くテスト**: `test/timer-ws-broadcaster.test.ts`（単体）

- 宛先の選び方 3 つ: timer の接続だけ・ハブの接続だけ・ハブとルーレットの接続（名簿の配信先）
- 名簿が無いルームへの配信は何も送らない
- いまは `create-sync-server.ts` の中の関数なので、取り出すまで赤

**変えるファイル**

- `adapters/timer-ws-broadcaster.ts`（新規）: `createTimerWsBroadcaster({ store, ws })` が `Broadcaster` と `HubBroadcaster` を返す。`ws` は送る口（`send`・`broadcast`・`sendHub`・`broadcastHub`）の小さなインタフェース
- `create-sync-server.ts`: それを呼ぶだけにする。`let wsAdapter` の前方参照は残す（WS アダプタはハンドラを受け、ハンドラは配信を受けるので循環する。理由をコメントに書く）

**確かめる**: `audit-assembly-wiring.mjs`・`audit-dependency-direction.mjs` が許可表を広げずに緑。実 WS 越しのテストが緑

- 所要: 2 時間

### Task 6: 同じ名前の別物を区別する

- poker の `Broadcaster` → `PokerBroadcaster`（`ports/poker-broadcaster.ts`）
- poker の `HandlerDeps` / `makeHandlers` → `PokerHandlerDeps` / `makePokerHandlers`
- poker の `RoomState` → `PokerRoomState`
- 取り込みの別名（`import { makeHandlers as makePokerHandlers }` のような書き方）が残っていれば外す
- 所要: 1 時間

### Task 7: 文書を合わせ、通して確かめる

- 設計正本 §5.6 に、この計画で決めたこと（§2）を日付つきで追記する
- `docs/adr/0004` と食い違いが無いことを確かめる（ポートの置き場を `ports/` にそろえる方向なので、決定と同じ向き）
- 計画の末尾に「実施の記録」を足す。`docs/guides/architecture.md` への追記事項（`LogSink` の置き場・時計の名前）を書いておく（PR 3 の後に反映する）
- 通しで確かめる
  - `pnpm test`・`pnpm typecheck`・`pnpm lint`
  - 構造監査（`audit-assembly-wiring`・`audit-domain-side-effects`・`audit-dependency-direction`・`audit-log-hygiene`・`audit-structure`）
  - `node scripts/mutation-check.mjs`
  - e2e は CI で確かめる
- 所要: 1 時間（変異検査の時間を除く）

## 5. 着手の前に確かめること

- **並び替えの乱数の出どころを変えてよいか**（§3）
  - いまは `Math.random`、変えた後は `crypto` の一様な整数になる
  - 出る順列の分布は同じで、利用者から見える違いは無い。ただし乱数の出どころは変わる
  - 推奨: 変える。アプリケーション層の乱数を `RandomSource` の 1 つにそろえる
  - 変えない場合は、`Math.random` を使う実装を `adapters/` に置き、それを渡す。アプリケーション層からは大域の呼び出しが消え、乱数の出どころは今のまま

## 6. 変異の ID

**新しい ID は使わない**（#361〜#366 と同じ理由。#94 PR 3 の宣言とぶつかる）。新しいテストの破壊検証は、手で壊して赤を見る。

## 7. 完了条件（#367 の完了条件をこの計画に合わせて読み替えたもの）

- [x] `audit-assembly-wiring.mjs`・`audit-domain-side-effects.mjs`・`audit-dependency-direction.mjs` が、許可表を広げずに緑
- [x] アプリケーション層に大域の時計・乱数の呼び出しが無く、テストが拒む（壊して確かめた）
- [x] 実 WS 越しのテスト・変異検査が緑。e2e は CI で緑
- [x] 時計・配信・ハンドラの型の名前で、壁時計と単調時計、timer と poker が区別できる
- [x] `create-sync-server.ts` にアダプタの実装が無い（組み立てだけ）
- [x] `docs/adr/0004` と食い違いが無い。`docs/guides/architecture.md` への追記事項を記録に残した（#94 PR 3 の後に反映）
- [x] #360 の共通の守りを満たす

## 8. 実施の記録（2026-10-13）

計画から外れたこと・計画の時点で分かっていなかったことだけを書く。

- **§5 の「並び替えの乱数の出どころ」は、利用者が推奨（`RandomSource` にそろえる）を了承した。** 本番の `member.shuffle` は `node:crypto` の一様な整数になった
- **大域の呼び出しの検査は、コメントの中の語も拾うので、5 か所のコメントを言い換えた**（`performance.now()` → 「単調時計（`MonotonicClock`）」など）。検査の作法（`audit-domain-side-effects` と同じ）どおり
- **Task 1 と Task 3 は 1 つのコミットにした。** 回収のテストは時計の注入の型が無いと型検査を通らないため。赤（回収されない）は注入の前に確かめた
- **テストの組み立ては `test/support/test-clocks.ts` の既定（本物の単調時計と一様な乱数）を渡す。** 依存を組む 8 ファイルに足した
- **poker 側の名前を変えると、`Handlers`（poker のハンドラの型）もぶつかっていた。** 計画の 4 つに足して `PokerHandlers` に改め、組み立てと ws-adapter の取り込みの別名（`as makePokerHandlers`・`as PokerHandlers`）を外した
- **`docs/guides/architecture.md` は、改めた名前（`ports/clock.ts`・`poker-monotonic-clock`・`LogSink` の置き場）をどれも書いていなかった。** #94 PR 3 の後に追記することは無い。`docs/adr/0004` の「背景」にある `clock.ts` は、決定の時点の構成の記録なので変えない
- **変異のパッチを 6 本当て直した**（m12・m28・m30・m81・m83・m158。ID と変異の中身は変えない）。m28・m158 は、配信のアダプタ（`adapters/timer-ws-broadcaster.ts`）を変異させる形になった
- 変異検査は全件検出。`pnpm test`・`pnpm typecheck`・`pnpm lint`・構造監査（許可表は広げていない）・スクリプトの自己テストが緑
