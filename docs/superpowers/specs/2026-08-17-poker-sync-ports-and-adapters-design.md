# 設計: poker-sync をポート/アダプタ構成へ再編し、エラー型を揃える（#72 E2）

**Issue:** [#165](https://github.com/tomohiroJin/tasuki-tools/issues/165)（親 [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72) 段階 E2）
**ステータス:** Draft（利用者レビュー待ち）
**基準コミット:** main `d1ce5c7`（2026-08-17 実測）
**前段:** [E1 の設計正本](./2026-08-17-adr-alignment-e1-design.md)

## 概要

`apps/poker-sync` を [`docs/adr/0004`](../../adr/0004-sync-server-ports-and-adapters.md) の
標準構成（ポート/アダプタ）へ再編し、あわせて
[`docs/adr/0016`](../../adr/0016-core-domain-representation.md) 決定 2 項目 3
（ドメインエラーは判別子と機械可読な詳細のみを持つ）を満たす。

**利用者から見える振る舞いは変えない。** WS で送る文字列は 1 文字も変えない。

**2 つの PR に分ける**（PR 粒度ガイドの分割理由 1「独立して revert したい単位が複数ある」・
理由 3「危険度の異なる変更が混ざっている」）。

## 背景

### 現状（2026-08-17 実測）

`apps/poker-sync/src` は 5 ファイル 660 行。`server.ts`（426 行）に
WS ハンドリング・ID 生成・ルーム操作・心拍・ディスパッチが同居している。

**モジュール読み込み時に副作用が走る。**

```ts
// すべて apps/poker-sync/src/server.ts のモジュール直下
const config = loadPokerSyncConfig(process.env);
const deriveClientKey = createClientKeyDeriver(randomBytes(32));
const rateLimiter = createTokenBucketLimiter({ ... });
const connections = new Map<string, Ws>();
const missedPongs = new Map<string, number>();
let connCounter = 0;
const server = Bun.serve<ConnectionData, never>({ ... });  // import しただけでサーバーが起動する
```

**行番号は書かない。** E2 はこのファイルを全面的に書き換えるため、番号は着手した瞬間に腐る。

`rooms.ts` も `const rooms = new Map<string, RoomEntry>()` をモジュールに持つ。

### 本質的な障害はテストランナーだった

| | `apps/timer-sync` | `apps/poker-sync` |
|---|---|---|
| `test` スクリプト | `bun test` | **`vitest run`** |
| `Bun.serve` の in-process 起動 | できる | **できない**（vitest は Node） |
| テストの組み立て経路 | `createSyncServer()` を直接呼ぶ | **`bun run src/server.ts` をサブプロセス起動** |
| アダプタの差し替え | できる（`test/fail-closed.test.ts`） | **env 変数しか注入経路が無い** |

14 テストファイル中 **11 本**が `startServer`（サブプロセス）を使う。

`docs/adr/0004` の MUST は「本番のエントリポイント（`server.ts`）とテストの両方が、
この関数を経由して組み立てる」だが、**ADR-0004 が根拠に挙げた「テスト時にアダプタを
差し替えられる構成」は vitest のままでは実現しない。**

### 移行は安い（実測）

| 移行に必要なもの | 規模 |
|---|---|
| `from 'vitest'` → `from 'bun:test'` | **14 箇所**（14 ファイル × 1 import） |
| `package.json` の `test` スクリプト | 1 行 |
| `vitest.config.ts` の timeout（15 秒 × 2）の移し替え | `bun test --timeout 15000`（実測。下記） |
| CI の変更 | **不要**（`ci` ジョブに `setup-bun` が既にある） |
| `vi.*` の書き換え | **0 件** |

`vi.useFakeTimers` を 1 件も使っていないため、timer-sync の移行（#61・#62）で実測された
Bun の最大の制約（fake timer の全フェイク化・`useRealTimers` 往復で `setInterval` が失われる）は
当たらない。

**vitest から import している名前は 6 種類だけ**（`it` `expect` `describe` `beforeAll`
`afterAll` `afterEach`）で、`expect.extend` やスナップショットは 0 件。すべて `bun:test` にある。

**`it.each` / `describe.each` は `bun:test` で動く**（2026-08-17 に実測。単一引数・タプルとも 7/7 pass）。
poker-sync のテストはテーブル駆動を多用しており、ここが動かなければ移行は成立しなかった。

**timeout は `bun test --timeout 15000` で移す。** `bunfig.toml` はリポジトリのどこにも無く、
timer-sync は既定（5 秒）で動いている。poker-sync はサブプロセス起動を待つため 15 秒が要る。
実測: 既定 5 秒では 6.5 秒の `beforeAll` がタイムアウトして落ち、`--timeout 15000` を付けると通る
（**`--timeout` はフックにも効く**ため、`testTimeout` と `hookTimeout` の両方をこれ 1 つで置き換えられる）。

**vitest 環境に `Bun` は無い**（`typeof Bun === 'undefined'` を poker-sync の vitest 上で実測）。
PR-1 が要るのはこのためである。

## 決定

### D1: PR を 2 本に分ける

- **PR-1**: `vitest` → `bun test` への移行。**`src/` は 0 行変更**
- **PR-2**: ポート/アダプタへの再編 ＋ エラー型の是正

分けないと「テストランナーを変えたせいで落ちたのか、再編で壊したのか」を切り分けられない。

### D2: ポートは 4 本（timer-sync の構成に揃える）

`ports/` に `room-store.ts` `monotonic-clock.ts` `id-gen.ts` `broadcaster.ts` を置く。
timer-sync が持つ 5 本のうち poker に対応するのがこの 4 本
（5 本目の `server-problem-provider.ts` は timer 固有の AI お題）。

**採らなかった案:**

- **最小限（`room-store` と `clock` の 2 本）** — `broadcaster` を切らないとアプリケーション層が
  `socket.send` に直接依存し続け、`docs/adr/0004` 決定 3「ユースケースはポートにのみ依存する」を
  満たせない
- **転送層（WS）もポートにする** — PR-1 で `bun test` へ移行すれば `Bun.serve` は
  in-process で使えるようになり、この抽象を入れる実需が消える。
  [`docs/adr/0007`](../../adr/0007-abstraction-criteria.md) 基準 3 に当たる

### D3: 時計のポートは `MonotonicClock` とする（timer の `Clock` を写さない）

**poker のドメインには時刻が無い。**

```
packages/poker-core/src/room.ts
  Participant { id, token, name, isHost, connected, joinOrder }   ← joinedAt は無い
  Room        { id, participants, round }                          ← 時刻フィールド 0 個
```

poker-sync が時刻を使うのは `performance.now()` の 2 箇所（レート制限）だけである。
timer-sync の `Clock { now(): number }` は epoch ms の**壁時計**であり、これを写すと
`handleJoinRoom()` 内のコメントが警告する混同をこちらから招く。

```ts
/** 単調時計。`performance.now()` 相当で、壁時計（epoch ms）ではない。
 *  NTP のステップ調整で非単調になりうる値を渡してはならない。 */
export interface MonotonicClock { now(): number }
```

「timer-sync 型に揃える」は構成の話であって、意味の違うものに同じ名前を付けることではない。

**あわせて `handleJoinRoom()` 内のコメントを直す。** 「ルームの会計（`joinedAt` 等）に使う
壁時計とは別系統」と書いてあるが、**`joinedAt` は poker に存在しない**。

### D4: ルームとソケットを分ける

`docs/adr/0004` の背景表が、この同梱を解消対象として名指ししている
（timer は「ソケットは別の Broadcaster が持つ」、poker は「エントリがルームとソケットを同梱」）。

ただし **timer の形をそのまま写せない。** timer は `Participant.connId` を持ち Broadcaster が
connId からソケットを引くが、**poker の `Participant` に `connId` は無い**。足すと
スナップショットの形が変わり振る舞い不変を壊す。

**接続レジストリは Broadcaster アダプタの内側に置き、ポートはルーム ID と参加者 ID だけで話す。**

### D5: 4 ポートのインタフェース

```ts
// ports/room-store.ts — ルームの揮発保管（ソケットは持たない）
export interface RoomStore {
  get(roomId: string): Room | undefined;
  put(room: Room): void;
  remove(roomId: string): void;
  has(roomId: string): boolean;   // ID 衝突の再試行に使う
  count(): number;                // ルーム数上限の判定に使う
}

// ports/monotonic-clock.ts
export interface MonotonicClock { now(): number }

// ports/id-gen.ts — 識別子の生成（衝突再試行は呼び出し側の方針）
export interface IdGen {
  roomIdCandidate(): string;
  participantId(): string;
  token(): string;
}

// ports/broadcaster.ts — 誰が接続中かと、どう届けるか
export interface Broadcaster {
  attach(roomId: string, participantId: string, socket: RoomSocket): void;
  /** 指定ソケットが現在の登録と同一のときだけ外す。異なれば false（再接続済み） */
  detach(roomId: string, participantId: string, socket: RoomSocket): boolean;
  countIn(roomId: string): number;
  broadcastSnapshot(roomId: string, room: Room): void;
  sendTo(socket: RoomSocket, msg: ServerMessage): void;
}
```

`detach` が `boolean` を返すのは、現在の不変条件を保つため。

`detachFromCurrentRoom()` にこの判定がある。

```ts
// 同一参加者が別ソケットで再接続済みなら（socket が入れ替わっていたら）何もしない
if (entry.sockets.get(participantId) !== ws) return;
```

この同一性判定を落とすと、**再接続直後に古いソケットの close が新しい接続を蹴り出す。**

### D6: 衝突再試行はアプリケーション層へ移す

`rooms.ts` の `generateRoomId()` は `for(;;)` ループでストアを直接見ている。
これは I/O ではなく方針（衝突したら引き直す）なので、ポートは候補を作るだけにし、
再試行はアプリケーション層が `RoomStore.has()` を見て回す。

### D7: 各ポートに差し替えテストを同じ PR で足す（MUST）

`docs/adr/0007` の追記（#72 E1）が定める条件である。

| ポート | 差し替えテスト | それで初めて書けること |
|---|---|---|
| `MonotonicClock` | 固定時計 | レート制限の窓の**境界**。現在は実時間依存 |
| `IdGen` | 衝突する候補を返すスタブ | **`generateRoomId` の衝突再試行**。`grep` で確認して**テストは 0 件** |
| `RoomStore` | 事前にルームを仕込んだストア | `maxRooms` の境界を**WS を張らずに**検証できる。現在は `guards.test.ts` が `MAX_ROOMS=1` で実 WS 越しに見ており（未検査ではない）、境界を増やすたびに接続を積む必要がある |
| `Broadcaster` | 送信を記録するスパイ | 配信の**宛先と回数**。現在は受信側で間接的にしか見ていない |

### D8: エラー値に操作を持たせる

**`code` だけでは現行の文言を復元できない**（2026-08-17 実測）。

| code | 文言 | 出所 |
|---|---|---|
| `not-host` | ホストのみが**公開**できます | `revealBy` |
| `not-host` | ホストのみが**次のラウンドを開始**できます | `nextRound` |
| `not-voting` | 現在は投票を受け付けていません | `castVote` |
| `not-voting` | **すでに公開されています** | `revealBy` |
| `not-revealed` | 票の公開後にのみ次のラウンドを開始できます | `nextRound` |
| `invalid-name` | 名前は 1〜24 文字で入力してください | `createRoom` / `joinRoom` |

`docs/adr/0016` 決定 2 項目 3 は「判別子と機械可読な詳細のみを持つ」と書いたが、
**判別子だけで足りると読める書き方だった。** 操作を機械可読な詳細として持たせる。

```ts
export type RoundError =
  | { code: 'not-host'; op: 'reveal' | 'next-round' }
  | { code: 'not-voting'; op: 'vote' | 'reveal' }
  | { code: 'not-revealed'; op: 'next-round' };
```

これは timer-core の `DomainError`（`{ type: "DuplicateName"; name: string }`）と同じ形である。

**コードを細分する案（`already-revealed` の新設）は採らない。** WS で送る `code` が変わり、
振る舞い変更になる。

文言生成関数は poker-core 内の別モジュールへ置く（`docs/adr/0016` 決定 2 の注記どおり、
「core の外に出す」という意味ではない）。

**対象外**: `ProtocolError`（`parseClientMessage` の境界エラー）と `ServerMessage` の
`message` フィールド。E1 の最終レビューで範囲を確定済み。

### D9: 特性テストを PR-2 の最初のコミットで足す（文言と不変条件）

**現在、6 文言を守るテストが 1 件も無い**（`apps/poker-sync/tests` / `packages/poker-core` /
`e2e` / `apps/poker-web` を grep して、ヒットしたのは実装ファイル 2 本だけ）。
つまり文言を書き換えても全テストが緑のまま通る。

**poker-core のテストは `code` しか検証していない**（`expect(result._unsafeUnwrapErr().code).toBe(...)`。
2026-08-17 実測）。したがって **D8 でエラー型から `message` を外しても poker-core の 70 件は
緑のまま通る。** 特性テストが無ければ、この変更が振る舞いを壊しても誰も気づけない。

**`apps/poker-web` は `RoundError` / `RoomError` を使っていない**（`ParticipantView` `RoundStats`
`NAME_MAX_LENGTH` `Card` `RoomStateMessage` などの型のみを import。2026-08-17 実測）。
**エラー型の変更は web へ波及しない。**

D8 が触る `sendError` の呼び出しは 3 箇所である。`handleCreateRoom()` と `handleJoinRoom()` が
流す `RoomError.message`、`commitRoomAction()` が流す `RoundError.message`。
`handleMessage()` が流す `ProtocolError.message` は**対象外**（上記のとおり）。

実装を 1 行も変えずに特性テストを足し、**書いた直後に文言を 1 文字変えて赤くなることを確認する**
（緑のまま足すテストは恒真の疑いがあるため）。

**`invalid-name` の畳み込みも固定する。** `handleCreateRoom()` / `handleJoinRoom()` が
`sendError(ws, 'invalid-message', result.error.message)` としており、`RoomError` の `code` は
WS へ出ない（`ERROR_CODES` の 9 個に `invalid-name` は無い）。

**あわせて D5 のソケット同一性の不変条件も固定する。** 2026-08-17 の実測で、
`reconnect.test.ts` は逐次の切断→再接続しか突いておらず、**「同一参加者が別ソケットで
再接続済みのとき、古いソケットの close が新しい接続を蹴り出さない」を直接守るテストは
1 件も無い**ことが分かった。再編でこの判定を落としても、現状のテストは全緑のまま通る。

先に特性テストを足す。`grep -rn "再接続\|reconnect\|入れ替わ" apps/poker-sync/tests/*.test.ts`
は 0 件だった。

### D10: 機械検査は新設せず、既存の宣言へ足す

E1 は「E2 が `create-sync-server.ts` の実在を検査する」と割り当てたが、**置き場は既にある。**

```
scripts/audit-log-hygiene.mjs
  REQUIRED_FILES = [ "apps/timer-sync/src/create-sync-server.ts", ... ]
```

`apps/poker-sync/src/create-sync-server.ts` を 1 行足す。新しいスクリプトは要らない。

**あわせて `ALLOWED_FILES` を更新する。** poker-sync の `console.log` は 4 箇所すべて
`server.ts` にあり、許可リストにも `server.ts` だけが登録されている。

| 出力 | 現在の場所 | 再編後の行き先 |
|---|---|---|
| `conn-rejected` / `client-address` | `handleOpen()` | **ws-adapter** |
| `conn-rejected` / `origin` | `handleOpen()` | **ws-adapter** |
| `derive-client-key-error` | `Bun.serve` の `fetch` 内 | **ws-adapter** |
| `listening` | モジュール末尾 | `server.ts` に残す |

**3 箇所が移るので、許可リストを更新しないとログ衛生が赤くなる。** timer 側は
`apps/timer-sync/src/adapters/ws-adapter.ts` が既に登録済みなので、同じ形に揃うだけである。

**ログの内容と件数は増やさない。** `docs/adr/0012` は poker-sync へのロガー導入を
「poker 側のログ出力が `listening` 以外にも増えるとき」まで繰り越しており、増やすと発火する。

## 触れる外部配線（2026-08-17 実測）

| 参照元 | 内容 | E2 での扱い |
|---|---|---|
| `apps/poker-sync/package.json` の `dev` / `start` / `build` | `src/server.ts` | 変更なし |
| `e2e/harness/sync.ts` | `apps/poker-sync/src/server.ts` を起動 | 変更なし |
| `apps/poker-sync/tests/helpers.ts` | `{"event":"listening","port":N}` を待つ | **契約は残す**（E2E が使う） |
| `.github/workflows/ci.yml` の `setup-bun` 直前のコメント | 「`tests/helpers.ts` が `bun run src/server.ts` をサブプロセス起動し」 | **コメントを実態へ。** Bun は `bun build --target=bun` のため引き続き必要 |
| `scripts/audit-log-hygiene.mjs` の `SCAN_DIRS` | `${pkg}/src` を再帰走査 | サブディレクトリ追加は問題なし |

## ファイル構造（PR-2 後）

```
apps/poker-sync/src/
  ports/
    room-store.ts
    monotonic-clock.ts
    id-gen.ts
    broadcaster.ts
  adapters/
    in-memory-room-store.ts
    performance-clock.ts
    crypto-id-gen.ts
    ws-adapter.ts          Bun.serve と接続レジストリ（connections / missedPongs / connCounter）
  application/
    handlers.ts            create-room / join-room / check-room
    commit-room-action.ts  vote / reveal / next-round の単一コミットポイント
    heartbeat.ts           死活監視
    rate-limit-gate.ts     レート制限の判定順序（照会より前）
  config.ts                現状のまま
  client-key-safety.ts     現状のまま
  listening-log.ts         現状のまま
  create-sync-server.ts    組み立ての唯一の場所
  server.ts                プロセスの振る舞いだけ（env 読み込み・起動ログ・SIGTERM）
```

## 作業手順

**PR-1（`bun test` への移行・`src/` は 0 行）**

1. `tests/*.ts` の `from 'vitest'` → `from 'bun:test'`（14 ファイル × 1 import）
2. `package.json` の `test` を **`bun test --timeout 15000`** へ。`vitest.config.ts` を削除する
3. **134 件が同じテスト名で通ることを示す**（件数だけでなく名前の集合を突き合わせる）

**PR-2（再編＋エラー型）**

1. 文言の特性テストを足す（実装不変）→ 1 文字変えて赤くなることを確認
2. `ports/` 4 本と `adapters/` を作り、`application/` へユースケースを移す
3. `create-sync-server.ts` に組み立てを集約。`server.ts` はプロセスの振る舞いだけに
4. 各ポートに差し替えテストを足す（D7）
5. `RoundError` / `RoomError` に `op` を足し、文言生成関数を poker-core 内に置く
6. `REQUIRED_FILES` へ `apps/poker-sync/src/create-sync-server.ts` を追加
7. `ALLOWED_FILES` へ `apps/poker-sync/src/adapters/ws-adapter.ts` を追加
8. `ci.yml` のコメントと `handleJoinRoom()` 内の単調時計コメントを実態に合わせる
9. 変異検査で既存テストが恒真化していないか確認

## 振る舞い不変をどう示すか

| 段 | 手段 |
|---|---|
| 1 | **文言の特性テスト**（D9）。破壊検証つき |
| 2 | 既存 134 件が全緑 |
| 3 | **変異検査**（#72 の進め方の MUST） |
| 4 | `e2e/specs/poker.spec.ts` の 2 件 |

**E2E は 2 件しかないので主たる証拠にしない**（E1 の申し送り）。主役は 1 と 3 である。

## 完了条件

1. `apps/poker-sync/src` が `ports/` `adapters/` `application/` を持ち、
   `create-sync-server.ts` が組み立てを集約している
2. `server.ts` とテストの**両方**が `createSyncServer()` を経由する（テスト側は import で示す）
3. **WS で送る文字列が 1 文字も変わっていない**（特性テストで固定）
4. 4 ポートすべてに差し替えテストがあり、それぞれ「今は書けないこと」を検証している
5. `apps/poker-sync/tests` の 134 件が全緑
6. 変異検査で恒真化していないことを確認した
7. `audit-log-hygiene` と `audit-structure` が終了コード 0
8. ログの出力箇所が `listening` 以外に増えていない

## スコープ外

- 振る舞いを変える改善 → #72 の外
- poker-sync へのロガー導入 → `docs/adr/0012` の繰り越し条件が発火したとき
- `packages/poker-core` の `index.ts` の `export *` 撤去 → **E6（#168）**
- `packages/timer-core` の `Date.now()` 除去 → **E3（#166）**
- E2E の異常系 → #142

## 関連

- [`docs/adr/0004`](../../adr/0004-sync-server-ports-and-adapters.md)（ポート/アダプタ標準）
- [`docs/adr/0007`](../../adr/0007-abstraction-criteria.md)（抽象の導入基準。E1 の追記を含む）
- [`docs/adr/0012`](../../adr/0012-logging-secrets-and-disclosure.md)（poker-sync のロガー繰り越し）
- [`docs/adr/0016`](../../adr/0016-core-domain-representation.md)（ドメイン表現）
- [`docs/guides/pr-granularity.md`](../../guides/pr-granularity.md)（PR の粒度）
- [E1 の設計正本](./2026-08-17-adr-alignment-e1-design.md)
