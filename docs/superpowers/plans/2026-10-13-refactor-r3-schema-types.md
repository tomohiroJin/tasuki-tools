# R3 手書きの型とスキーマを型で結び、検証済みのコマンドを型のまま運ぶ（#363）— 実装計画

- **Issue**: [#363](https://github.com/tomohiroJin/tasuki-tools/issues/363)（親 [#360](https://github.com/tomohiroJin/tasuki-tools/issues/360)）
- **設計正本**: [`2026-10-13-large-refactoring-design.md`](../specs/2026-10-13-large-refactoring-design.md) §5.3
- **日付**: 2026-10-13
- **実測時点**: main `e9180c9` ＋ #379 の作業ブランチ（#361・#362 の後）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 翻訳（wire のコマンド → ドメインのコマンド）の表を特性テストで先に固定する（Task 1）。型の結びつきは型のテストで固定し、壊して赤を見る（Task 2） |
| II. 技術選定は ADR を通す | 該当なし | 依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | 状態の持ち方に触れない |
| IV. 境界の型安全 | 通過 | この Issue の本体。境界で検証した値を、型を失わずに運ぶ。実行時の確かめ直し（`typeof`）と `as` を、型の絞り込みに置き換える（Task 4） |
| V. 実画面検証 | 通過 | 実 WS 越しのテストで、受け付けないコマンドの応答（UNKNOWN_COMMAND）が変わらないことを確かめる（Task 1・Task 5） |
| VI. 依存は内向き | 通過 | 語彙の定数は core に置き、同期サーバーはそれを使う（外から内）。core の依存の許可表は変えない |
| VII. 検査は壊して確かめる | 通過 | 型のテストは、型の片側だけを変えて赤（型検査の失敗）を見る（Task 2）。特性テストは壊して赤を見る（Task 1） |
| VIII. 記録が正本 | 通過 | wire の型の正本（手書きの型）とスキーマの一致を、型のテストが守る。語彙の集合は 1 つの配列から導く |
| IX. 小さく回す | 通過 | PR 1 本。デプロイは伴わない |
| X. 抽象は実需で | 通過 | 新しい抽象は作らない。型の等しさを見る補助の型（1 行）だけを足す |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密・個人情報を扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 1. 着手時点の実測（Issue 本文・設計正本 §5.3 の前提との差）

型の等しさは、一時ファイルで `Eq<A, B>`（双方向の等しさ）を型検査して測った。

| 前提 | 実測 | 確かめた場所 |
|---|---|---|
| 手書きの型とスキーマが食い違っているかもしれない | **食い違いは無かった。** topic の `Topic`・`TopicState` と roulette の `RouletteView` は、スキーマの出力と**厳密に等しい**。timer の `Room` も、**任意項目に `undefined` が入るかどうか**の 1 点を除けば等しい | 一時ファイルの型検査（作業ブランチ `cff4666` の後） |
| 〃 timer の 1 点の差 | valibot の `v.optional` は出力の型に `\| undefined` を足す。手書きの `Room` は `exactOptionalPropertyTypes` のもとで `?: boolean` と書いている。**型の差であって、wire の値の差ではない**（JSON は `undefined` を運べない） | `wire.ts` の `Participant`・`TimerConfig` ほか、`schemas.ts:261-262,305,313-314,329` |
| 手書きの型をスキーマから導く（`InferOutput`）か、`GenericSchema<T>` で注釈する | **どちらも、このままでは採れない**<br>・導くと、timer の `Room` の任意項目が `\| undefined` を含む型に変わり、型の上で振る舞いが変わる（使う側の型検査に響く）<br>・`v.optional` を `v.exactOptional` に替えれば等しくなるが、**実行時に「キーはあるが値が `undefined`」を拒むようになる**。同期サーバーが組み立てた `room` を `RoomSchema` に通すテストがあり（`apps/tasuki-sync/test/timer-snapshot-dto.test.ts:115-117`）、組み立ての中で値が `undefined` の項目があれば落ちる<br>・`GenericSchema<T>` の注釈は一方向しか見ない（スキーマに余分な項目が増えても型検査は通る）<br>・手書きの型は、項目ごとの doc コメント（ドメインの語彙の説明）を持っている | `wire.ts`（143 行のうち約半分が説明）・`topic.ts`・`roulette.ts` |
| `DecideCommand` を `Command` から導く | **導けない。別のものである。** `DecideCommand` はドメインのコマンドで、wire に無い値をサーバーが埋める<br>・`member.shuffle` の `order`<br>・`session.act` の `ineligible`<br>・`driver.assign` の `index`（参加者 ID から解決する）<br>・`session.complete` の `topicTitle`（保管から埋める）<br>`build-domain-command.ts` は wire → ドメインの**翻訳**（DDD の腐敗防止層）であり、あってよい | `decide.ts:21-47`・`build-domain-command.ts` |
| 翻訳が、検証済みの値を `typeof` と `as` で確かめ直している | 正しい。原因は**型を失う 1 か所**にある<br>・`handleCommand` は `RoomScopedCommand \| PreRoomCommand`（検証済みの型）を受ける<br>・ところが `handleRoomCommand` の引数が `{ command: string; [key: string]: unknown }`（`handlers.ts:444`）で、ここで型が消える<br>・その先の `buildDomainCommand`・`:561,:648` の `typeof`・各所の `as` は、すべてこの型の消失を埋め合わせている | `handlers.ts:66-84,373-405,442-684` |
| 〃 `create-sync-server.ts` の `as Command` | `WsAdapterOptions.onMessage` の `msg` が `unknown` で、検証済みの値の型が接続層で消えている | `create-sync-server.ts:483`・`ws-adapter.ts` の `WsAdapterOptions` |
| **翻訳が持つ、テストの無い知識** | wire の `session.act` は `action` に **7 つ**（`START`・`SWITCH`・`PAUSE`・`RESUME`・`RESTART`・`COMPLETE`・`RESET`）を受けるが、ドメインが扱うのは **5 つ**。`COMPLETE`・`RESET` は翻訳で `null` になり、UNKNOWN_COMMAND が返る。**この振る舞いを見ているテストは無い**（`"COMPLETE"` を送るテストは 0 件）。`build-domain-command.ts` の単体テストも無い | `schemas.ts:99-107`・`build-domain-command.ts:11-29`・`grep` |
| `RoomPhase` が 6 回書かれている | 正しい: `aggregate.ts:99`（型）・`decide.ts:39`・`schemas.ts:94,323`（picklist）・`build-domain-command.ts:12,58`（集合と `as`） | `grep` |
| セッションの操作が 4 回書かれている | 正しい。ただし**集合が 2 つある**（wire の 7 つ・ドメインの 5 つ）。1 つにはできず、**「ドメインの 5 つ ⊂ wire の 7 つ」という関係を 1 か所で表す**のが正しい | `decide.ts:24,154`・`schemas.ts:99`・`build-domain-command.ts:11` |
| 変異のパッチ | 触るファイルに当たるもの: aggregate（m01）・handlers（m105）・create-sync-server（m28・m81・m150・m158）・ws-adapter（m13・m36・m82・m83・m167）・topic-core schemas（m76）・roulette-core roulette（m153・m157）・roulette-core schemas（m168） | `scripts/mutations/*.patch` |

## 2. この PR でやること・やらないこと

**型の正本は手書きの型に置く。** 手書きの型はドメインの語彙で、項目の意味を doc コメントで持つ。スキーマは境界の検証で、手書きの型と等しいことを**型のテストが守る**。#362 と同じ形である（正本を 1 つにし、取り込めない写しは一致をコードで守る）。

**やること（PR 1 本）**

1. **翻訳の表を特性テストで固定する**（Task 1）。`buildDomainCommand` の単体テストと、`session.act` の `COMPLETE` が UNKNOWN_COMMAND になる実 WS 越しのテスト
2. **手書きの型とスキーマの等しさを、型のテストで固定する**（Task 2）。timer の `Room`（任意項目の `undefined` の差を除いて等しい）・topic の `Topic`・`TopicState`・roulette の `RouletteView`
3. **語彙の集合を 1 つの配列から導く**（Task 3）。部屋の段階（`ROOM_PHASES`）と、ドメインのセッションの操作（`SESSION_ACTIONS`）。wire の 7 つは「ドメインの 5 つ ＋ 受けるが扱わない 2 つ」として組む
4. **検証済みのコマンドを型のまま運ぶ**（Task 4）
   - `handleRoomCommand` と `buildDomainCommand` の引数を `RoomScopedCommand` にする
   - `typeof` の確かめ直しと `as` を、型の絞り込みに置き換える
   - `WsAdapterOptions.onMessage` の `msg` を `Command` にし、`as Command` を外す

**やらないこと（理由つき）**

| 項目 | 理由 |
|---|---|
| 手書きの型を `InferOutput` で導き直す | timer の `Room` の任意項目の型が変わる（§1）。doc コメントも失う |
| `v.optional` を `v.exactOptional` に替える | 実行時に受け付ける値が変わる（キーがあり値が `undefined` の項目を拒む）。振る舞いの変更になる |
| `DecideCommand` を `Command` から導く | 別のものである（ドメインのコマンドは、サーバーが埋める値を持つ）。翻訳は残す |
| `COMPLETE`・`RESET` を wire から外す、またはドメインで扱う | 振る舞いが変わる。いまの振る舞い（UNKNOWN_COMMAND）を固定するだけにする |
| スキーマの制約（上限・必須かどうか）を変える | 振る舞いが変わる。合言葉の上限の違いは #377 |
| `v.pipe(v.number(), v.integer(), v.minValue(0))` の 11 回に名前を付ける | 1 行の式で、`docs/adr/0007` 基準 2 に満たない。契約の単一情報源（原則 VIII）にも当たらない（どれも同じ制約を独立に掛けているだけ） |

## 3. 振る舞いを保つ方法

**「変えない」の定義**（設計正本 §4.1）:

- プロトコル: 受け付けるコマンド・返すエラーのフレームが変わらない
- ドメイン: 同じコマンドに同じ `decide` / `evolve` の結果を返す

**型だけの変更（Task 2・3・4 の大半）は、実行時のコードを変えない。** 変わるのは Task 4 の `typeof` の確かめ直しを外すところだけで、そこは Task 1 の特性テストで前後を比べる。

## 4. タスク

### Task 1: 翻訳の表を特性テストで固定する

**変えるファイル**

- `apps/tasuki-sync/test/build-domain-command.test.ts`（新規）
- `apps/tasuki-sync/test/live-ws.errors.test.ts`（1 件足す）

**`buildDomainCommand` の表**: wire のコマンド（スキーマを通る形）ごとに、返すドメインのコマンドを固定する。

| wire のコマンド | 期待する結果 |
|---|---|
| `session.act` の `START`・`SWITCH`・`PAUSE`・`RESUME`・`RESTART` | `{ command: "session.act", action, ineligible: undefined }` |
| `session.act` の `COMPLETE`・`RESET` | `null`（受けるが扱わない） |
| `session.complete` | `topicTitle: null`（保管から後で埋める） |
| `session.reset` | `{ command: "session.reset" }` |
| `config.set` | `config` をそのまま |
| `driver.assign` | `index: -1`（後で参加者 ID から解決する） |
| `member.add`・`member.remove`・`member.move`・`phase.set`・`handoff.note.set`・`session.abort`・`participant.addProxy`・`participant.rename`・`driver.skip`・`driver.resume` | 同じ値を写した形 |
| `member.shuffle`・`participant.remove`・`room.passphrase.set`・`break.start`・`break.end` | `null`（翻訳の対象外。前段か UNKNOWN_COMMAND で扱う。`presence.ping` は `PreRoomCommand` 側なので表に入らない） |

- 表の行は、`RoomScopedCommand` の全てのコマンドを網羅する。網羅していることを型で固定する（コマンド名の一覧を `RoomScopedCommand["command"]` から引き、表のキーと突き合わせる）
- **実 WS 越し**: `session.act` に `action: "COMPLETE"` を送ると、UNKNOWN_COMMAND のエラーフレームが返る（`live-ws.errors.test.ts` の `break.start` の組の隣に足す）

**確かめる（緑で入るので、壊して赤を見る）**

- `build-domain-command.ts` の `VALID_ACTIONS` に `"COMPLETE"` を足す → 表と実 WS 越しの組が赤
- `driver.assign` の `index: -1` を `0` にする → 表が赤
- 所要: 2 時間

### Task 2: 手書きの型とスキーマの等しさを、型のテストで固定する

**変えるファイル**（どれもテストの置き場。CI の `pnpm typecheck` はテストも型検査する。各パッケージの `tsconfig.json` の `include` を確かめた）

- `packages/timer-core/test/wire-types.test.ts`（新規）: `Room` と `v.InferOutput<typeof RoomSchema>` の等しさ。任意項目の `| undefined` だけを除いて比べる補助の型を、このファイルの中に置く（doc コメントで、なぜその差だけを除くのかを書く）
- `packages/topic-core/tests/wire-types.test.ts`（新規）: `Topic`・`TopicState` と各スキーマの出力の厳密な等しさ
- `packages/roulette-core/tests/wire-types.test.ts`（新規）: `RouletteView` と `RouletteFrameSchema` の出力の `state` の厳密な等しさ

**形**: `const _: Equals<手書きの型, スキーマの出力> = true;` を型検査させる。実行時には何もしないので、各ファイルに 1 件ずつ、型のテストであることを名前に書いた実行時のテスト（`it("型の等しさは型検査が見る", () => {})`）を添える。テストの数え方（SC-036）と Given/When/Then の検査（SC-032）に合わせるためである。

**確かめる（壊して赤を見る）**

- `wire.ts` の `Participant` に項目を 1 つ足す → timer の型検査が赤
- `schemas.ts` の `ParticipantSchema` に項目を 1 つ足す → 同じく赤（一方向の注釈では見逃す向き）
- topic の `TopicSchema` の `source` の候補を 1 つ減らす → topic の型検査が赤
- roulette の `RouletteView` の `spin` の項目を 1 つ消す → roulette の型検査が赤
- 所要: 1.5 時間

### Task 3: 語彙の集合を 1 つの配列から導く

**変えるファイル**

- `packages/timer-core/src/aggregate.ts`: `export const ROOM_PHASES = ["setup", "ready", "session", "celebration"] as const;` を置き、`RoomPhase` をそこから導く
- `packages/timer-core/src/decide.ts`: `export const SESSION_ACTIONS = ["START", "SWITCH", "PAUSE", "RESUME", "RESTART"] as const;`（ドメインが扱う 5 つ）を置き、`DecideCommand` と `decideSessionAct` の引数を導く。`phase.set` の `phase` は `RoomPhase` にする
- `packages/timer-core/src/schemas.ts`
  - 2 つの `v.picklist([...段階...])` を `v.picklist(ROOM_PHASES)` にする
  - wire の操作の集合を `[...SESSION_ACTIONS, "COMPLETE", "RESET"] as const` と組む。後ろの 2 つは「受けるが扱わない（UNKNOWN_COMMAND）」と doc コメントに書く
- `apps/tasuki-sync/src/application/build-domain-command.ts`: `VALID_ACTIONS`・`VALID_PHASES` を外す（Task 4 で型の絞り込みに置き換える）

**公開面**: `ROOM_PHASES`・`SESSION_ACTIONS` を同期サーバーが使うなら、`index.ts` に明示して列挙する（`audit-public-surface.mjs`・ADR-0016 決定 2）。サブパスの取り込みで足りるなら公開しない。どちらにしたかを PR に書く。

**確かめる**

- timer-core のテスト・同期サーバーのテスト・型検査が緑
- Task 1 の表が緑（集合の中身が変わっていない）
- 所要: 1 時間

### Task 4: 検証済みのコマンドを型のまま運ぶ

**変えるファイル**

- `apps/tasuki-sync/src/application/handlers.ts`
  - `handleRoomCommand` の引数を `RoomScopedCommand` にする
  - `handleCommand` の `switch` の各 `case` の `as`（`:381,387,399`）を外す（判別共用体の絞り込みで足りる）
  - `:473,492` の `as` と、`:561,648` の `typeof cmd.participantId === "string"` を、絞り込みに置き換える
- `apps/tasuki-sync/src/application/build-domain-command.ts`
  - 引数を `RoomScopedCommand` にする
  - `typeof` の確かめ直しと `as` を外す
  - **`COMPLETE`・`RESET` を `null` にする分岐は、型の上でも明示して残す**（Task 1 の表が守る）
- `apps/tasuki-sync/src/adapters/ws-adapter.ts`: `WsAdapterOptions.onMessage` の `msg` を `Command` にする（接続層で検証と正規化を済ませた値なので、型でそう言える）
- `apps/tasuki-sync/src/create-sync-server.ts:483`: `as Command` を外す
- 型の都合で残る `as` があれば、なぜ残るのかを 1 行のコメントで書く

**コミットの順番**: `onMessage` の型 → `handleRoomCommand` の引数と `handleCommand` の `as` → `buildDomainCommand` の引数と確かめ直し。各コミットで、同期サーバーの全テストと型検査が緑

**確かめる**

- Task 1 の特性テストが各コミットで緑
- 変えた範囲の `as`（`as const` を除く）の数を前後で数え、PR に書く（`grep -c " as [A-Z{(]"` を変えたファイルに流す）
- 所要: 2 時間

### Task 5: 変異のパッチ・文書を合わせ、通して確かめる

- §1 の 15 本に `git apply --check` を流し、当たらないものだけ文脈を直す（ID は変えない）
- 設計正本 §5.3 に、この計画で見直したこと（§2）を日付つきで追記する
- 通しで確かめる: `pnpm test`・`pnpm typecheck`・構造監査（`audit-structure`・`audit-public-surface`・`audit-dependency-direction`・`audit-domain-error-shape`）・`node scripts/mutation-check.mjs`。e2e は CI で確かめる
- 所要: 1 時間（変異検査の時間を除く）

## 5. 変異の ID

**新しい ID は使わない**（#361・#362 と同じ理由。#94 PR 3 の宣言とぶつかる）。特性テストと型のテストの破壊検証は、手で壊して赤を見る。

## 6. 完了条件（#363 の完了条件をこの計画に合わせて読み替えたもの）

- [ ] 翻訳の表（wire → ドメイン）が特性テストで固定されていて、`COMPLETE`・`RESET` が UNKNOWN_COMMAND になる振る舞いが変わっていない
- [ ] 手書きの型とスキーマの等しさを型のテストが守り、片側だけを変えると型検査が落ちる（4 通りに壊して確かめた）
- [ ] 部屋の段階とセッションの操作が、それぞれ 1 つの配列から導かれている
- [ ] 同期サーバーの中で、検証済みのコマンドの型が失われていない（`handleRoomCommand`・`buildDomainCommand`・`onMessage`）。`as` の前後の数を PR に書いた
- [ ] 変異検査が緑（パッチの ID は変えない）
- [ ] 見直したことを設計正本 §5.3 と #363 に残した
