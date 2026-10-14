# R6 同期サーバーのアプリケーション層の重複を解き、巨大な関数を分ける（#366）— 実装計画

- **Issue**: [#366](https://github.com/tomohiroJin/tasuki-tools/issues/366)（親 [#360](https://github.com/tomohiroJin/tasuki-tools/issues/360)）
- **設計正本**: [`2026-10-13-large-refactoring-design.md`](../specs/2026-10-13-large-refactoring-design.md) §5.5
- **日付**: 2026-10-13
- **実測時点**: main `e9180c9` ＋ #379 の作業ブランチ（#361〜#365 の後。`51dbbdb`）
- **順番の約束**: #375（ルームのコードの衝突）と同じファイル（`create-room.ts` の周り）に触る。**この計画は `create-room.ts` を変えない**ので、どちらを先にしてもぶつからない

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 入口ごとの参加の結果（送るフレーム）を、実 WS 越しの特性テストで先に固定する（Task 1）。新しいモジュールは単体テストを先に赤で書く |
| II. 技術選定は ADR を通す | 該当なし | 依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | 保管の形に触れない。接続 ID の索引（性能）は足さない |
| IV. 境界の型安全 | 通過 | 境界の検証は変えない。参加のユースケースは検証済みの `HubCommand` の `room.join` を受ける |
| V. 実画面検証 | 通過 | 実 WS 越しのテストで、入口ごとのフレームが変わらないことを確かめる（Task 1・Task 8）。e2e は CI で流す |
| VI. 依存は内向き | 通過 | アプリケーション層の中の逆向きの取り込み（`topic-broadcast.ts` → `hub-handlers.ts`）を外す（Task 2） |
| VII. 検査は壊して確かめる | 通過 | 「接続からルームを引く走査は 1 か所」を守るテストを足し、写しを置いて赤を見る（Task 3） |
| VIII. 記録が正本 | 通過 | 寄せないもの（poker の参加・保存して配る補助・失敗の補助）は、理由を計画と各ファイルの冒頭に書く |
| IX. 小さく回す | 通過 | #379 に積む（2026-10-13 の利用者の了承）。コミットはタスクごと。デプロイは伴わない |
| X. 抽象は実需で | 通過 | 寄せるのは、同じ知識が 3 か所以上にあるものだけ（`docs/adr/0007`）。形が似ていても知識が違うものは寄せない（§2） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | ログの形を変えない（`audit-log-hygiene.mjs` が見る） |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 1. 着手時点の実測（Issue 本文の前提との差）

| Issue の項目 | 実測 | 確かめた場所 |
|---|---|---|
| 接続からルームを引く走査 | **Issue のとおり 7 か所**<br>・ツールを問わない 5 つ: `isInAnyRoom`（hub `:109`・topic `:154`・roulette `:140`）・`findStateByConnId`（`handlers.ts:691`）・`findRoomByConnId`（`presence.ts:192`）<br>・ツールで絞る 2 つ: `roomCodeOf`（topic `:144`）・`roomOf`（roulette `:133`）<br>`store.list()` を呼ぶほかの 3 か所（ルーム数の上限 2・回収 1）は接続を引かない | `grep` |
| 参加の流れの写し | **hub の `handleJoin` も同じ流れだった**（topic・roulette と合わせて 3 つ）<br>・違いは 3 点: ツール ID・`room.joined` を送る口（hub は `hub.sendTo`）・参加の後に送るもの（どれも「いまのお題／いまの状態を本人へ 1 通」）<br>・hub だけが `timers.put(timer)` を呼ぶ。ツールを宣言しない参加では `joinRoom` は保管にある timer の状態をそのまま返す（`join-room.ts:125-128`）ので、同じ値を置き直すだけ（`InMemoryTimerStore.put` は `Map#set` だけ）<br>・2 度目の参加の文言は 3 つとも「コマンドの形式が不正です」で同じ（引く場所が 3 通り。#362 の特性テストが一致を固定している）<br>timer の `room.join`（`command-handlers/room-join.ts`）は、timer の状態を作る・snapshot を返す点で流れが違う | 各ファイル |
| `ROOM_NOT_FOUND` の文言の書き分け | **Issue のとおり 5 か所**（hub の join と check・topic・roulette・timer の room-join） | `grep` |
| `fail` の補助 | 6 つあるが、**送る口と型がそれぞれ違う 1〜2 行の関数**（hub の `hub.sendTo`・topic と roulette の `send` とそれぞれの文言表・timer の `broadcaster.sendTo`・poker の `ws.send`）。重なっている知識は「参加の失敗の文言の引き方」だけ | 同左 |
| 状態を取り出し、無ければ初期値を置く | 3 つのうち **2 つが同じ topic の保管に対する写し**（`topic-handlers.ts:158` と `topic-broadcast.ts:58`）。roulette は 1 つ | 同左 |
| 保存してから配る補助 | 4 つは**それぞれ違うことをする**（timer は名簿と timer の状態を保管して snapshot を配る・poker はラウンドも・topic は 2 行・roulette は「変わらなければ何もしない」を持つ）。同じ知識の写しではない | 同左 |
| 巨大な関数 | 60 行を超える関数は `apps/tasuki-sync/src` に **18 個**（TypeScript の構文木で数えた。`makeX` の工場関数は中の関数を含む）<br>・`makeHandlers`（timer）519・poker の `makeHandlers` 486・`createSyncServer` 434・`handleRoomCommand` 243・`makeTopicHandlers` 187・`makeRouletteHandlers` 181・`makeHubHandlers` 178・`handleParticipantRemove` 155 ほか | 一時の計測スクリプト |
| `handleRoomCommand` の形 | `if (domainCmd && domainCmd.command === "...")` の事前条件が 4 つ（`member.add`・`participant.addProxy`・`participant.rename`・`driver.assign`）、事後処理が 2 つ（`driver.skip`・`driver.assign`）。事前条件はどれも「名簿を引いて、居なければ／ぶつかれば失敗を送って `Err`」の形 | `handlers.ts:434-676` |
| `TOOL_HUB` の置き場所 | `hub-handlers.ts:49`。`topic-broadcast.ts` と `test/timer-snapshot-dto.test.ts` がそこから取る | `grep` |
| 2 つの `RateLimitGate` | `rate-limit-gate.ts`（接続 ID から鍵を引く）と `poker-rate-limit-gate.ts`（鍵を直接受ける）。poker の側を使うのは `poker-handlers.ts` だけ | 同左 |
| 特性テストの手持ち | 実 WS 越しのテストは入口ごとに散らばっている。**合言葉の誤り（`PASSPHRASE_MISMATCH`）は 3 つの入口のどれも固定されていない**。`PASSPHRASE_REQUIRED` は hub だけ、`JOIN_RATE_LIMITED` は topic と roulette だけ | `grep` |
| 変異のパッチ | 触るファイルに当たるもの 17 本: m12・m31（join-room）・m78・m86（topic）・m108・m110（hub）・m156・m171・m172（roulette）・m85・m96・m159（topic-broadcast）・m161（roulette-broadcast）・m105（handlers）・m98（command-handlers）・m30・m33（poker） | `scripts/mutations/*.patch` |

## 2. この PR でやること・やらないこと

**やること**

1. **入口ごとの参加の結果を、実 WS 越しの特性テストで固定する**（Task 1）
2. **`TOOL_HUB` を `tool-id.ts` へ移す**（Task 2）
3. **接続からルームを引く問い合わせを `room-lookup.ts` に集め、写しが増えないことをテストで守る**（Task 3）
4. **hub・topic・roulette の参加の流れを 1 つのユースケース（`join-tool-room.ts`）にする**（Task 4）
   - 引数はツール ID・`room.joined` を送る口・参加の後の 1 通
   - 失敗の文言の引き方（`ROOM_NOT_FOUND` の書き分け）を `joinFailureMessage(code)` の 1 つにし、timer の `room-join` と hub の `room.check` もそれを使う
   - timer の `room.join` は寄せない（timer の状態を作り、snapshot を返す。流れが違う）
5. **topic の「状態を取り出し、無ければ初期値を置く」の写しを 1 つにする**（Task 5）
6. **`handleRoomCommand` を、事前条件の表と事後処理に分ける。`makeHandlers` から、スケジューラの突き合わせと並び替えの生成を外へ出す**（Task 6）
7. **poker の `RateLimitGate` の名前を `PokerRateLimitGate` に改める**（Task 7。API はそろえない）

**やらないこと（理由つき）**

| 項目 | 理由 |
|---|---|
| `fail` の補助 6 つを 1 つにする | 送る口と型がそれぞれ違う 1〜2 行の関数で、寄せると型の分岐が増える。重なっている知識（参加の失敗の文言）は 4 で 1 つにする |
| 保存してから配る補助 4 つを 1 つにする | 4 つは違うことをしている（§1）。形が似ているだけで、同じ知識ではない（原則 X） |
| roulette の「無ければ初期値」まで含めて汎用の関数にする | 写しは topic の 2 つだけ。roulette は 1 つで、汎用にする実需が無い（`docs/adr/0007` 基準 1） |
| poker の `admit` / `mayEnter` を共通のユースケースに寄せる | 部屋 ID がぶつかったときの方針が違う（振る舞い）。設計正本 §5.5 の決定。直すのは #375 の後 |
| 2 つの `RateLimitGate` の API をそろえる | 鍵の受け取り方が違うのは、poker が `connId → 鍵` の対応を使わないため（`handlers.ts:239-243` の注記）。API をそろえると poker が対応表を持つことになり、設計の判断が変わる |
| timer の `handleCommand` の `Result` を本番で使う | 戻り値を使うと振る舞い（ログやフレーム）が変わる。いまの形を保つ |
| 工場関数（`makeX`）を 60 行未満にする | 中の関数を含めて数えるので、1 つのハンドラ群を 1 つの工場に置く限り 60 行を超える。減らす対象は中の関数（`handleJoin`・`handleRoomCommand` など） |
| `handleParticipantRemove`（155 行）・poker の `handleJoinRoom`（115 行）を分ける | この Issue が名指ししていない。数は §6 の記録に残し、次に触る Issue へ回す |
| 接続 ID からルームを引く索引 | Issue のスコープ外（性能の改善） |

## 3. 振る舞いを保つ方法

- **フレーム**: 入口ごと（hub・topic・roulette・timer）の参加の結果を、送るフレームの並び（`type`・`code`・`message`・その後に届く名簿やお題の 1 通）まで特性テストで固定する（Task 1）。寄せる前と後で同じテストが緑
- **保管**: hub の `timers.put` は、ツールを宣言しない参加では同じ値を置き直すだけで、ほかの入口に広げても保管の中身は変わらない。**ただし広げずに、hub の参加の後処理として残す**（変える理由が無い）
- **ログ**: 触らない。`audit-log-hygiene.mjs` を流す
- **ルームの引き方**: `room-lookup.ts` の関数は、いまの 7 つの走査と同じ順（`store.list()` の順）で最初に当たったものを返す。単体テストで「ツールで絞る版は、別のツールとして在席している接続を引かない」を固定する（変異 m86 が見ている性質）

## 4. タスク

### Task 1: 入口ごとの参加の結果を特性テストで固定する

**足すファイル**: `apps/tasuki-sync/test/live-ws.join-entries.test.ts`（実 WS 越し。`test/support/live-sync-server.ts` を使う）

表で回す。行は入口（hub・topic・roulette・timer）、列は次の 8 つの場面。各セルで「送られたフレームの並び」を期待値に直書きする（`participantId`・`resumeToken` などの値は形だけを見る）。

| 場面 | 作り方 |
|---|---|
| 新しく参加する | 作ったルームへ別の接続で参加する |
| 復帰する | 返ってきた `resumeToken` で、別の接続から参加し直す |
| 2 度目の参加 | 参加済みの接続から、もう一度 `room.join` を送る |
| 表示名が規約に合わない | 見えない文字だけの名前で参加する |
| ルームが無い | 無いコードで参加する |
| 合言葉が要る | 合言葉つきのルームへ、合言葉なしで参加する |
| 合言葉が違う | 合言葉つきのルームへ、違う合言葉で参加する |
| 参加の試しすぎ | `JOIN_RATE_LIMITED` が返るまで、無いコードへの参加を続ける |

- 手持ちのテストと重なる組は、重なりを表にして PR に書く（消さない）
- **確かめる（緑で入るので、壊して赤を見る）**
  - roulette の 2 度目の参加の確かめを外す → 赤
  - topic の参加の後の 1 通（`sendCurrent`）を外す → 赤
  - `ROOM_NOT_FOUND` の書き分けを hub だけ外す → 赤
- 所要: 3 時間

### Task 2: `TOOL_HUB` を `tool-id.ts` へ移す

- `tool-id.ts` に `TOOL_HUB` を置く（型は `ToolId | null`。ハブはツールを宣言しない）
- `hub-handlers.ts`・`topic-broadcast.ts`・`test/timer-snapshot-dto.test.ts` は `tool-id.ts` から取る
- `audit-dependency-direction.mjs` と型検査が緑
- 所要: 20 分

### Task 3: 接続からルームを引く問い合わせを `room-lookup.ts` に集める

**先に書く赤いテスト**

- `test/room-lookup.test.ts`（単体）
  - `findRoomByConnId(store, connId)`: 参加者として在席しているルームを返す。居なければ `undefined`
  - `findRoomByToolConnection(store, connId, tool)`: その接続がそのツールとして在席しているルームだけを返す。**別のツールとして在席している接続では `undefined`**
- `test/room-lookup-sources.test.ts`（写しの検査）: `src` の中で、`store.list()`（`this.store.list()`・`deps.store.list()` を含む）に `findParticipantByConnId` を続けて引く書き方が、`room-lookup.ts` の外に 0 件であること
  - いまは 7 件で赤になる
  - 書き方の検出は字面で行い、検出漏れの向き（別名で受けて呼ぶ等）はファイルの冒頭に書く（ほかの写しの検査と同じ作法）

**変えるファイル**: 7 つの走査を `room-lookup.ts` の 2 つの関数に置き換える（hub・topic・roulette の `isInAnyRoom` / `roomCodeOf` / `roomOf`・`handlers.ts` の `findStateByConnId` の中・`presence.ts` の `findRoomByConnId`）

**確かめる**

- 写しの検査は、どこか 1 つに走査を書き戻すと赤（壊して確かめる）
- 変異 m86 を当て直す（ID は変えない。変異の場所が `room-lookup.ts` へ移るなら、パッチのヘッダの「検出を期待するテスト」も書き直す）
- 所要: 2 時間

### Task 4: hub・topic・roulette の参加の流れを 1 つのユースケースにする

**先に書く赤いテスト**: `test/join-tool-room.test.ts`（単体。依存は既存のフェイクで組む）

- `joinFailureMessage(code)`: `ROOM_NOT_FOUND` は `ROOM_NOT_FOUND_MESSAGE`、それ以外は timer-core の文言表
- `joinToolRoom(deps, { connId, cmd, tool, reply, afterJoin })`
  - 2 度目の参加 → `INVALID_COMMAND`（「コマンドの形式が不正です」）を返し、何も変えない
  - 表示名が規約に合わない → `INVALID_COMMAND`（表示名の文言）
  - `joinRoom` の失敗 → そのコードと `joinFailureMessage` の文言
  - 成功 → `room.joined` を送り、名簿を保管して配り（`saveRoster`）、`afterJoin` を呼ぶ。この順

**変えるファイル**

- `application/join-tool-room.ts`（新規）
- `hub-handlers.ts`・`topic-handlers.ts`・`roulette-handlers.ts` の `handleJoin` を、`joinToolRoom` の呼び出しに置き換える。hub は `afterJoin` で `timers.put` とお題の 1 通を行う
- `command-handlers/room-join.ts` と hub の `room.check` は、`joinFailureMessage` を使う
- `resumeToken` / `passphrase` を条件付きで広げる書き方は、`joinToolRoom` の中の 1 か所と timer の `room-join` の 2 か所になる

**確かめる**

- Task 1 の特性テスト・既存の実 WS 越しのテストが緑
- 変異 m108・m110・m78・m156・m98・m12・m31 を当て直す。**変異の場所が共有のユースケースへ移るもの（m108「hub の 2 度目の参加を通す」など）は、共有の場所を変異させる形に作り直し、ヘッダの「検出を期待するテスト」に 3 つの入口のテストを並べる**（ID は変えない）
- 所要: 3 時間

### Task 5: topic の「無ければ初期値を置く」の写しを 1 つにする

- `topic-broadcast.ts` の `stateOf` を、broadcaster の公開のメソッド（`currentState(roomCode)`）として出す
- `topic-handlers.ts` の `currentState` は、それを呼ぶ
- 変異 m85・m96・m159 を当て直す
- 所要: 30 分

### Task 6: `handleRoomCommand` を事前条件の表と事後処理に分け、`makeHandlers` から 2 つを出す

**先に書く特性テスト**: 事前条件の 4 つ（`member.add` の参加者が居ない・`participant.addProxy` の名前がぶつかる・`participant.rename` の相手が居ない／名前がぶつかる・`driver.assign` の相手が居ない／輪に居ない／離席中）と事後処理の 2 つ（`driver.skip` の繰り上げ・`driver.assign` の自動復帰）が、それぞれ送るフレームと状態を固定する。**手持ちのテストで足りているかを先に表にし、足りない組だけを足す**

**変えるファイル**

- `application/room-commands/preconditions.ts`（新規）: ドメインのコマンド名 → 事前条件の関数の表。関数は `(state, cmd) => Result<補った値, 失敗>` を返す（失敗を送るのは `handleRoomCommand` の 1 か所）
- `application/room-commands/after-effects.ts`（新規）: `driver.skip` の繰り上げと `driver.assign` の自動復帰
- `application/scheduler-sync.ts`（新規）: スケジューラの突き合わせ
- `application/shuffle-order.ts`（新規）: 並び替えの生成
- `handlers.ts`: `handleRoomCommand` は「ルームと参加者を引く → 専用の処理か → 事前条件 → `decide` → `evolve` → 事後処理 → 保管と配信」の並びだけを持つ

**確かめる**

- 特性テスト・既存のテストが緑。変異 m105 を当て直す
- `handleRoomCommand` が 60 行以下になる
- 所要: 4 時間

### Task 7: poker の `RateLimitGate` の名前を改める

- `poker-rate-limit-gate.ts` の `RateLimitGate` を `PokerRateLimitGate`、`RateLimitGateDeps` を `PokerRateLimitGateDeps`、`createRateLimitGate` を `createPokerRateLimitGate` に改める
- ファイルの冒頭に、timer 側のゲートと API が違う理由（鍵を直接受ける）を 1 段落で書く
- 所要: 20 分

### Task 8: 文書を合わせ、通して確かめる

- 設計正本 §5.5 に、この計画で決めたこと（§2）を日付つきで追記する
- 計画の末尾に「実施の記録」を足す。60 行を超える関数の数（前 18 個）と、`handleRoomCommand` などの前後の行数を書く
- 通しで確かめる
  - `pnpm test`・`pnpm typecheck`・`pnpm lint`
  - 構造監査（`audit-assembly-wiring`・`audit-dependency-direction`・`audit-log-hygiene`・`audit-structure`）
  - `node scripts/mutation-check.mjs`
  - e2e は CI で確かめる
- 所要: 1 時間（変異検査の時間を除く）

## 5. 変異の ID

**新しい ID は使わない**（#361〜#365 と同じ理由。#94 PR 3 の宣言とぶつかる）。特性テストと写しの検査の破壊検証は、手で壊して赤を見る。

変異の場所が共有のモジュールへ移るものは、ID を変えずにパッチとヘッダを作り直す。その一覧を PR に書く。

## 6. 完了条件（#366 の完了条件をこの計画に合わせて読み替えたもの）

- [x] 実 WS 越しのテスト（Task 1 の特性テストを含む）・変異検査が緑。送るフレームが変更前と同じ。e2e は CI で緑
- [x] `audit-assembly-wiring.mjs`・`audit-dependency-direction.mjs`・`audit-log-hygiene.mjs` が緑
- [x] 接続からルームを引く走査が `room-lookup.ts` の 1 か所にあり、写しをテストが拒む（壊して確かめた）
- [x] hub・topic・roulette の参加が 1 つのユースケースを通る
- [x] 60 行を超える関数の数が減っている。前後の件数を PR に書く
- [x] 寄せなかったものの理由が、計画と各ファイルの冒頭にある
- [x] #360 の共通の守りを満たす

## 7. 実施の記録（2026-10-13）

計画から外れたこと・計画の時点で分かっていなかったことだけを書く。

- **計画の §2 の判断（失敗の補助と保存して配る補助はまとめない）は、着手前に利用者が了承した**
- **特性テストで、入口の違いが 3 つ見えた**（32 件。どれも変えずに固定した）
  - topic の参加には名簿のフレームが届かない（hub と roulette には届く）
  - timer は 2 度目の参加を拒まない（hub・topic・roulette は拒む）
  - timer は表示名の規約の失敗を「コマンドの形式が不正です」で返す（ほかは「表示名の形式が正しくありません」）
- **参加の試しすぎは、1 回ずつ待つとバケツが補充されて拒まれなかった。** 容量を超える数を一度に送り、拒んだフレームの形だけを固定した（何回目で拒まれるかは補充の時刻で揺れる）
- **`joinFailureMessage` は計画の `join-tool-room.ts` ではなく `join-room.ts` に置いた。** `ROOM_NOT_FOUND_MESSAGE` の隣で、timer の参加（`join-tool-room.ts` を通らない）も使うため
- **hub の `timers.put` は、名簿の保管の後（参加の後の処理）へ移った。** ツールを宣言しない参加では保管にある同じ値を置き直すだけなので、結果は変わらない
- **topic の「無ければ初期値」は、broadcaster のメソッドではなく関数（`topicStateOrInitial`）にした。** `TopicBroadcaster` の形を変えると、テストのフェイクがすべて響くため
- **事前条件のうち `member.add`（在室者だけを並べる）だけが、どのテストにも固定されていなかった。** 表へ移す前にテストを足した
- **`handleRoomCommand` は事前条件・サーバーが埋める値・事後処理の 3 つへ分けた**（計画は 2 つ）。`session.complete` のタイトル・代理の ID・SWITCH の対象外は、事前条件ではなく「サーバーが埋める値」なので、別のモジュール（`server-values.ts`）にした
- **`UNKNOWN_COMMAND` の確かめを事前条件の前へ移した。** 以前も事前条件は翻訳できたコマンドにしか掛からなかったので、結果は同じ
- **変異のパッチを 3 本当て直した**（m86・m105・m108。ID と意味は変えない）
  - m86 は、topic の在席ルームの引き方がツールを見ない形のまま、取り込みも含めた
  - m108 は、2 度目の参加の拒否が共有のユースケースへ移ったので、3 つの入口をまとめて壊す変異になった
  - m105 は、埋める処理の移動先（`server-values.ts`）を変異させる
- **60 行を超える関数: 18 → 16**
  - `handleRoomCommand` 243 → 58 行
  - timer の `makeHandlers` 519 → 349 行
  - `makeTopicHandlers` 187 → 139・`makeRouletteHandlers` 181 → 146・`makeHubHandlers` 178 → 134 行
  - hub の `handleJoin` 61 → 18 行
  - 残る 16 個のうち、この Issue の対象は工場関数（中の関数を含めて数えるので 60 行を超える）。`handleParticipantRemove`（155）と poker の `handleJoinRoom`（115）は次に触る Issue へ回す
- 変異検査は全件検出。`pnpm test`・`pnpm typecheck`・`pnpm lint`・構造監査・スクリプトの自己テストが緑
