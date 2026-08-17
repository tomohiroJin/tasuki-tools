# poker-sync のポート/アダプタ再編（#165 PR-2）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/poker-sync` を `docs/adr/0004` の標準構成（ポート/アダプタ）へ再編し、`docs/adr/0016` 決定 2 項目 3（ドメインエラーは判別子と機械可読な詳細のみ）を満たす。**利用者から見える振る舞いは変えない。**

**Architecture:** 一度に作り替えず、**各タスクの終わりにテストが緑のまま**進む段階的抽出を採る。まず特性テストで安全網を張り（T1）、次にエラー型（T2）、続いてモジュールグローバルを 1 つずつポート＋アダプタへ移し（T3・T4）、最後に組み立てを `create-sync-server.ts` へ集約して `server.ts` をプロセス関心事だけに縮める（T5）。差し替えテスト（T6）と検査の宣言更新（T7）で閉じる。

**Tech Stack:** Bun 1.3.14（`Bun.serve` / `bun test`）/ neverthrow / Valibot / TypeScript 6

**Spec:** [`docs/superpowers/specs/2026-08-17-poker-sync-ports-and-adapters-design.md`](../specs/2026-08-17-poker-sync-ports-and-adapters-design.md)（D1〜D10）

**Branch:** `refactor/165-poker-sync-ports-and-adapters`（作成済み。設計文書の訂正 2 コミットが載っている）

## Global Constraints

- **利用者から見える振る舞いを変えない。** 公開 URL・WS プロトコル・画面の挙動は据え置き（epic #67 の制約）
- **WS で送る文字列を 1 文字も変えない**
- **WS の `code` を増やさない・変えない。** `ERROR_CODES` は 9 個のまま
- **ログの出力箇所を `listening` 以外に増やさない。** 増やすと `docs/adr/0012` の繰り越し条件が発火し、ロガー導入が本 PR の必須作業になる
- **`apps/poker-web` は変更しない**（`RoundError` / `RoomError` を使っていないことを実測済み）
- `docs/adr/0007` の追記（#72 E1）: **ポートを切るなら、差し替えを行うテストを同じ PR で足す（MUST）**
- 文書・コメントは日本語。コミットは Conventional Commits の type 接頭辞 ＋ 日本語タイトル ＋ 末尾に `（#165）`
- **作業ディレクトリは `/home/vscode/tasuki-work`**（overlay）。`/workspaces/claym/local/Tasuki` では作業しない
- 検査コマンドの前に `export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH` を通す
- **`git checkout -- .` のようなワークツリー全体を戻す操作は禁止。** 戻すときは必ずファイルを名指しする
- テストは `corepack pnpm --filter @tasuki/poker-sync test`（= `bun test --timeout 15000`）
- **各タスクの終わりに poker-sync 134 件 ＋ poker-core 70 件が緑であること**（T1 で件数は増える）

## 実測で確定している事実（推測を混ぜないこと）

すべて 2026-08-17 に実測済み。

| 事実 | 実測結果 |
|---|---|
| poker-sync のテスト | **134 件 / 14 ファイル** |
| poker-core のテスト | **70 件 / 6 ファイル** |
| poker の E2E | `e2e/specs/poker.spec.ts` の **2 件のみ**。主たる特性テストにしない |
| `RoomError` の文言 | **WS に届かない。** `NameSchema` が `validateName` と同じ規則で先に弾く。実測で `invalid-message`「メッセージ形式が不正です」が返る |
| poker-core のテスト | **`code` しか検証していない**（`_unsafeUnwrapErr().code`）。`message` を外しても 70 件は緑のまま通る |
| `apps/poker-web` | `RoundError` / `RoomError` を使っていない |
| `server.ts` の副作用 | モジュール直下に `config` / `deriveClientKey` / `rateLimiter` / `connections` / `missedPongs` / `connCounter` / `Bun.serve`。**export された関数が 1 つも無い**（＝注入点が無い） |
| `maxRooms` の検査 | `guards.test.ts` が `MAX_ROOMS=1` で実 WS 越しに検査済み |
| `generateRoomId` の衝突再試行 | **テスト 0 件** |
| ソケット同一性の判定 | **テスト 0 件**（`reconnect.test.ts` は逐次の切断→再接続だけ） |

## File Structure

```
apps/poker-sync/src/
  ports/
    room-store.ts          RoomStore（get / put / remove / has / count）
    monotonic-clock.ts     MonotonicClock（now）。壁時計ではない
    id-gen.ts              IdGen（roomIdCandidate / participantId / token）
    broadcaster.ts         Broadcaster（attach / detach / countIn / broadcastSnapshot / sendTo）
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
  server.ts                プロセスの振る舞いだけ

packages/poker-core/src/
  error-messages.ts        ★新設。code + op → 文言
  round.ts                 RoundError から message を外し op を足す
  room.ts                  RoomError から message を外す
```

---

### Task 1: 特性テストで安全網を張る（実装は 1 行も変えない）

**Files:**
- Create: `apps/poker-sync/tests/error-messages.characterization.test.ts`
- Create: `apps/poker-sync/tests/socket-identity.characterization.test.ts`
- Create: `packages/poker-core/tests/error-messages.characterization.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: T2 以降が壊していないことを示す安全網。**現在これらを守るテストは 0 件**

**なぜ最初に置くか:** poker-core のテストは `code` しか見ておらず、`message` を書き換えても 70 件は緑のまま通る。ソケット同一性も同じく 0 件。**先に置かないと、安全網ゼロで本番コードを触ることになる。**

- [ ] **Step 1: WS 経由の文言を固定するテストを書く**

`apps/poker-sync/tests/error-messages.characterization.test.ts` を新規作成する。

```ts
// 特性テスト（#165 PR-2）。**振る舞いを固定するためだけに存在する。**
//
// エラー型から message を外す（docs/adr/0016 決定 2 項目 3）作業の前に、
// WS で送っている文言をここへ写し取る。poker-core のテストは code しか見ておらず、
// このファイルが無いと文言を書き換えても全テストが緑のまま通る（2026-08-17 実測）。
//
// **RoomError の文言はここに無い。** protocol.ts の NameSchema が room.ts の
// validateName と同じ規則なので、不正な名前は境界で弾かれ WS には届かない（実測）。
// そちらは packages/poker-core 側の特性テストで固定する。
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { startServer, WsClient, isType, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server.stop();
});

/** ホスト 1 人のルームを作る（1 人なので投票すると即 revealed になる） */
async function soloRoom() {
  const host = await WsClient.connect(server.port);
  host.send({ type: 'create-room', name: 'たろう' });
  await host.nextMatching(isType('joined'));
  await host.nextMatching(isType('room-state'));
  return host;
}

/** ホストとゲストが居るルームを作る（どちらも未投票） */
async function pairRoom() {
  const host = await WsClient.connect(server.port);
  host.send({ type: 'create-room', name: 'たろう' });
  const joined = (await host.nextMatching(isType('joined'))) as { roomId: string };
  await host.nextMatching(isType('room-state'));

  const guest = await WsClient.connect(server.port);
  guest.send({ type: 'join-room', roomId: joined.roomId, name: 'はなこ' });
  await guest.nextMatching(isType('joined'));
  await guest.nextMatching(isType('room-state'));
  await host.nextMatching(isType('room-state'));
  return { host, guest };
}

describe('WS が送るドメインエラーの文言（特性テスト）', () => {
  it('公開後の vote は not-voting「現在は投票を受け付けていません」', async () => {
    // Given: 1 人だけのルームで投票し、自動公開まで進める
    const host = await soloRoom();
    host.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    await host.nextMatching(
      (m) => (m as { round?: { status?: string } }).round?.status === 'revealed',
    );

    // When: 公開後にもう一度投票する
    host.send({ type: 'vote', card: { kind: 'number', value: 8 } });

    // Then
    expect(await host.nextMatching(isType('error'))).toEqual({
      type: 'error',
      code: 'not-voting',
      message: '現在は投票を受け付けていません',
    });
    host.close();
  });

  it('公開後の reveal は not-voting「すでに公開されています」', async () => {
    // Given: 公開済みのルーム
    const host = await soloRoom();
    host.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    await host.nextMatching(
      (m) => (m as { round?: { status?: string } }).round?.status === 'revealed',
    );

    // When: もう一度公開する
    host.send({ type: 'reveal' });

    // Then: 同じ not-voting でも文言が違う（code だけでは復元できない）
    expect(await host.nextMatching(isType('error'))).toEqual({
      type: 'error',
      code: 'not-voting',
      message: 'すでに公開されています',
    });
    host.close();
  });

  it('非ホストの reveal は not-host「ホストのみが公開できます」', async () => {
    // Given
    const { host, guest } = await pairRoom();

    // When
    guest.send({ type: 'reveal' });

    // Then
    expect(await guest.nextMatching(isType('error'))).toEqual({
      type: 'error',
      code: 'not-host',
      message: 'ホストのみが公開できます',
    });
    host.close();
    guest.close();
  });

  it('非ホストの next-round は not-host「ホストのみが次のラウンドを開始できます」', async () => {
    // Given
    const { host, guest } = await pairRoom();

    // When
    guest.send({ type: 'next-round' });

    // Then: 同じ not-host でも文言が違う
    expect(await guest.nextMatching(isType('error'))).toEqual({
      type: 'error',
      code: 'not-host',
      message: 'ホストのみが次のラウンドを開始できます',
    });
    host.close();
    guest.close();
  });

  it('投票中の next-round は not-revealed「票の公開後にのみ次のラウンドを開始できます」', async () => {
    // Given: まだ公開していないルーム
    const host = await soloRoom();

    // When
    host.send({ type: 'next-round' });

    // Then
    expect(await host.nextMatching(isType('error'))).toEqual({
      type: 'error',
      code: 'not-revealed',
      message: '票の公開後にのみ次のラウンドを開始できます',
    });
    host.close();
  });
});
```

- [ ] **Step 2: 文言のテストが通ることを確認する**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/poker-sync exec bun test --timeout 15000 \
  tests/error-messages.characterization.test.ts 2>&1 | tail -6
```

期待: `5 pass` / `0 fail`。

**通らなければ止めて報告すること。** 文言が実装と違うということなので、写し取りが誤っている。

- [ ] **Step 3: 破壊検証 — この特性テストが本当に文言を守るか確かめる**

**緑のまま足したテストは恒真の疑いがある。** 壊して赤になることを確かめる。

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH

# (a) 文言を 1 文字変える
sed -i "s/現在は投票を受け付けていません/現在は投票を受け付けていませんX/" packages/poker-core/src/round.ts

# (b) 壊れたこと自体を先に確認する
grep -c "受け付けていませんX" packages/poker-core/src/round.ts
```

期待: `1`。0 なら書き換えに失敗しているので、赤にならなくても意味がない。

```bash
# (c) 特性テストが赤になることを確認
corepack pnpm --filter @tasuki/poker-sync exec bun test --timeout 15000 \
  tests/error-messages.characterization.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)"

# (d) 元に戻す（このファイルだけを名指しする）
git checkout -- packages/poker-core/src/round.ts
grep -c "受け付けていませんX" packages/poker-core/src/round.ts
```

期待: (c) で `1 fail` 以上、(d) の `grep -c` が `0`。

- [ ] **Step 4: ソケット同一性の特性テストを書く**

`apps/poker-sync/tests/socket-identity.characterization.test.ts` を新規作成する。

```ts
// 特性テスト（#165 PR-2）。**振る舞いを固定するためだけに存在する。**
//
// server.ts の detachFromCurrentRoom() にある次の判定を守る。
//
//   // 同一参加者が別ソケットで再接続済みなら（socket が入れ替わっていたら）何もしない
//   if (entry.sockets.get(participantId) !== ws) return;
//
// これを落とすと、**再接続直後に古いソケットの close が新しい接続を蹴り出す。**
// reconnect.test.ts は逐次の切断→再接続しか突いておらず、この競合を守るテストは
// 2026-08-17 時点で 0 件だった。T4（Broadcaster への分離）で最も壊れやすい不変条件なので、
// 先に固定する。
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { startServer, WsClient, isType, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server.stop();
});

describe('同一参加者の再接続とソケットの同一性（特性テスト）', () => {
  it('古いソケットを閉じても、後から繋いだ同一参加者は切断扱いにならない', async () => {
    // Given: ホストとゲストが居るルーム
    const host = await WsClient.connect(server.port);
    host.send({ type: 'create-room', name: 'たろう' });
    const hostJoined = (await host.nextMatching(isType('joined'))) as { roomId: string };
    await host.nextMatching(isType('room-state'));

    const oldSocket = await WsClient.connect(server.port);
    oldSocket.send({ type: 'join-room', roomId: hostJoined.roomId, name: 'はなこ' });
    const guestJoined = (await oldSocket.nextMatching(isType('joined'))) as {
      participantId: string;
      token: string;
    };
    await oldSocket.nextMatching(isType('room-state'));
    await host.nextMatching(isType('room-state'));

    // When: 古いソケットを開いたまま、同じ token で別ソケットから復帰する
    const newSocket = await WsClient.connect(server.port);
    newSocket.send({
      type: 'join-room',
      roomId: hostJoined.roomId,
      name: 'はなこ',
      token: guestJoined.token,
    });
    await newSocket.nextMatching(isType('joined'));
    await newSocket.nextMatching(isType('room-state'));
    await host.nextMatching(isType('room-state'));

    // そのあとで古いソケットを閉じる
    oldSocket.close();

    // Then: ホストから見て、この参加者は connected のままである
    // （古いソケットの close が新しい接続を蹴り出していない）
    host.send({ type: 'vote', card: { kind: 'number', value: 3 } });
    const state = (await host.nextMatching(isType('room-state'))) as {
      participants: Array<{ id: string; connected: boolean }>;
    };
    const guest = state.participants.find((p) => p.id === guestJoined.participantId);
    expect(guest).toBeDefined();
    expect(guest?.connected).toBe(true);

    host.close();
    newSocket.close();
  });
});
```

- [ ] **Step 5: ソケット同一性のテストが通り、かつ壊すと落ちることを確認する**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/poker-sync exec bun test --timeout 15000 \
  tests/socket-identity.characterization.test.ts 2>&1 | tail -6
```

期待: `1 pass` / `0 fail`。

```bash
# 破壊検証: 同一性判定を落とすと赤になるか
sed -i "s|if (entry.sockets.get(participantId) !== ws) return;|// 破壊検証中|" apps/poker-sync/src/server.ts
grep -c "破壊検証中" apps/poker-sync/src/server.ts
corepack pnpm --filter @tasuki/poker-sync exec bun test --timeout 15000 \
  tests/socket-identity.characterization.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
git checkout -- apps/poker-sync/src/server.ts
grep -c "破壊検証中" apps/poker-sync/src/server.ts
```

期待: `grep -c` が `1` → テストが `1 fail` → 復元後 `grep -c` が `0`。

**赤にならなければ、このテストは不変条件を守っていない。** 止めて報告すること。

- [ ] **Step 6: `RoomError` の文言を poker-core 側で固定する**

`packages/poker-core/tests/error-messages.characterization.test.ts` を新規作成する。

```ts
// 特性テスト（#165 PR-2）。**振る舞いを固定するためだけに存在する。**
//
// RoomError の文言は WS に届かない。protocol.ts の NameSchema が room.ts の
// validateName と同じ規則（NAME_MAX_LENGTH を共有）なので、不正な名前は境界で
// 弾かれ、handleCreateRoom / handleJoinRoom の isErr() 分岐には到達しない（2026-08-17 実測）。
//
// それでもこの分岐は残す（docs/adr/0005 が境界検証とドメイン検証の両方を MUST としている）。
// 残す以上、文言も固定しておく。
import { describe, expect, it } from 'vitest';
import { createRoom, joinRoom, NAME_MAX_LENGTH } from '../src/room';

const ids = { participantId: 'p1', token: 't1' };

describe('RoomError の文言（特性テスト）', () => {
  it('createRoom の名前が空なら invalid-name と定型文を返す', () => {
    // Given / When
    const result = createRoom('room1', '   ', ids);

    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'invalid-name',
      message: `名前は 1〜${NAME_MAX_LENGTH} 文字で入力してください`,
    });
  });

  it('joinRoom の名前が長すぎるなら invalid-name と定型文を返す', () => {
    // Given
    const room = createRoom('room1', 'たろう', ids)._unsafeUnwrap().room;

    // When
    const result = joinRoom(room, 'あ'.repeat(NAME_MAX_LENGTH + 1), {
      participantId: 'p2',
      token: 't2',
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'invalid-name',
      message: `名前は 1〜${NAME_MAX_LENGTH} 文字で入力してください`,
    });
  });
});
```

**`packages/poker-core` は `vitest` のままである**（移行したのは poker-sync だけ）。
既存の `packages/poker-core/tests/*.test.ts` の import を見て合わせること。

- [ ] **Step 7: 全体が緑であることを確認してコミット**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/poker-sync test 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
corepack pnpm --filter @tasuki/poker-core test 2>&1 | grep -E "Tests |Test Files "
git diff --stat -- apps/poker-sync/src packages/poker-core/src
echo "★ 上が空なら実装は 1 行も変えていない"
```

期待: poker-sync が **140 pass**（134 ＋ 6）、poker-core が **72 passed**（70 ＋ 2）、
`src` の差分が空。

```bash
git add apps/poker-sync/tests packages/poker-core/tests
git commit -m "test: エラー文言とソケット同一性の特性テストを足す（#165）

- 再編の前に振る舞いを写し取る。実装は 1 行も変えていない
- WS の 5 文言（not-host ×2・not-voting ×2・not-revealed）を固定した
  同じ code でも操作によって文言が違うため、code だけでは復元できない
- RoomError の 1 文言は WS に届かない（NameSchema が同じ規則で先に弾く）ので
  poker-core の単体テストで固定した
- ソケット同一性（再接続済みなら古い close で蹴り出さない）は
  これまでテストが 0 件だった。T4 で最も壊れやすい不変条件なので先に固定した
- どちらも破壊検証を実施し、壊すと赤になることを確認した"
```

---

### Task 2: エラー型から `message` を外し、文言生成関数を置く（D8）

**Files:**
- Create: `packages/poker-core/src/error-messages.ts`
- Modify: `packages/poker-core/src/round.ts`（`RoundError` の定義と 5 箇所の `err(...)`）
- Modify: `packages/poker-core/src/room.ts`（`RoomError` の定義と `validateName`）
- Modify: `packages/poker-core/src/index.ts`（`error-messages` を再エクスポート）
- Modify: `apps/poker-sync/src/server.ts`（`sendError` の呼び出し 3 箇所）

**Interfaces:**
- Consumes: T1 の特性テスト（これが唯一の安全網）
- Produces: `messageForRoundError(e: RoundError): string` と `messageForRoomError(e: RoomError): string`。T5 のアプリケーション層がこれを呼ぶ

- [ ] **Step 1: 文言生成関数を作る**

`packages/poker-core/src/error-messages.ts` を新規作成する。

```ts
// ドメインエラーの表示文言（docs/adr/0016 決定 2 項目 3）。
//
// エラー値は判別子と機械可読な詳細だけを持ち、文言はここが担う。
// **code だけでは文言を復元できない** — not-host も not-voting も、
// どの操作から来たかで文言が違う。そのため op を機械可読な詳細として持たせている。
//
// timer-core の displayMessageFor() と同じ役割で、同じく core の中に置く
// （「core の外に出す」という意味ではない。docs/adr/0016 決定 2 の注記）。
import { NAME_MAX_LENGTH, type RoomError } from './room';
import type { RoundError } from './round';

/** RoundError の表示文言。**#165 PR-2 以前の文字列をそのまま保つ。** */
export function messageForRoundError(error: RoundError): string {
  switch (error.code) {
    case 'not-voting':
      return error.op === 'vote' ? '現在は投票を受け付けていません' : 'すでに公開されています';
    case 'not-host':
      return error.op === 'reveal'
        ? 'ホストのみが公開できます'
        : 'ホストのみが次のラウンドを開始できます';
    case 'not-revealed':
      return '票の公開後にのみ次のラウンドを開始できます';
  }
}

/** RoomError の表示文言。**WS には届かない**（境界の NameSchema が先に弾く）が、
 *  ドメイン検証は docs/adr/0005 の MUST なので残っている。 */
export function messageForRoomError(error: RoomError): string {
  switch (error.code) {
    case 'invalid-name':
      return `名前は 1〜${NAME_MAX_LENGTH} 文字で入力してください`;
  }
}
```

- [ ] **Step 2: `RoundError` から `message` を外して `op` を足す**

`packages/poker-core/src/round.ts` の型定義を置き換える。

```ts
export type RoundError =
  | { code: 'not-host'; op: 'reveal' | 'next-round' }
  | { code: 'not-voting'; op: 'vote' | 'reveal' }
  | { code: 'not-revealed'; op: 'next-round' };
```

`requireHost` の第 3 引数を文言から `op` へ変える。

```ts
/** ホスト専用操作の認可ガード（reveal / next-round / 将来のホスト操作で共用） */
function requireHost(
  room: Room,
  participantId: string,
  op: 'reveal' | 'next-round',
): Result<void, RoundError> {
  const actor = room.participants.find((p) => p.id === participantId);
  if (!actor?.isHost) {
    return err({ code: 'not-host', op });
  }
  return ok(undefined);
}
```

5 箇所の `err(...)` を書き換える。

- `castVote`: `err({ code: 'not-voting', message: '現在は投票を受け付けていません' })` → `err({ code: 'not-voting', op: 'vote' })`
- `revealBy` の `requireHost(room, participantId, 'ホストのみが公開できます')` → `requireHost(room, participantId, 'reveal')`
- `revealBy` の `err<Room, RoundError>({ code: 'not-voting', message: 'すでに公開されています' })` → `err<Room, RoundError>({ code: 'not-voting', op: 'reveal' })`
- `nextRound` の `requireHost(room, participantId, 'ホストのみが次のラウンドを開始できます')` → `requireHost(room, participantId, 'next-round')`
- `nextRound` の `err<Room, RoundError>({ code: 'not-revealed', message: '...' })` → `err<Room, RoundError>({ code: 'not-revealed', op: 'next-round' })`

- [ ] **Step 3: `RoomError` から `message` を外す**

`packages/poker-core/src/room.ts`:

```ts
export type RoomError = { code: 'invalid-name' };
```

`validateName` の `err(...)`:

```ts
function validateName(raw: string): Result<string, RoomError> {
  if (!isValidName(raw)) {
    return err({ code: 'invalid-name' });
  }
  return ok(raw.trim());
}
```

- [ ] **Step 4: `index.ts` から文言生成関数を出す**

`packages/poker-core/src/index.ts` に 1 行足す。

```ts
export * from './error-messages';
```

**`export *` のままにする。** 明示列挙への変更は E6（#168）の担当で、本 PR の範囲外である。

- [ ] **Step 5: T1 で書いた poker-core の特性テストを新しい形へ直す**

Step 3 で `RoomError` から `message` が消えたので、T1 Step 6 のテストは通らなくなる。
**これは正しい失敗である。** 検証内容を変えずに、文言生成関数を経由する形へ直す。

`packages/poker-core/tests/error-messages.characterization.test.ts` の 2 つの
`expect(result._unsafeUnwrapErr()).toEqual({ code: 'invalid-name', message: ... })` を、
次の 2 行に置き換える（**期待する文言そのものは変えない**）。

```ts
    expect(result._unsafeUnwrapErr()).toEqual({ code: 'invalid-name' });
    expect(messageForRoomError(result._unsafeUnwrapErr())).toBe(
      `名前は 1〜${NAME_MAX_LENGTH} 文字で入力してください`,
    );
```

import に `messageForRoomError` を足す。

- [ ] **Step 6: `server.ts` の `sendError` 3 箇所を文言生成関数経由にする**

`apps/poker-sync/src/server.ts`:

- `handleCreateRoom` の `sendError(ws, 'invalid-message', result.error.message);`
  → `sendError(ws, 'invalid-message', messageForRoomError(result.error));`
- `handleJoinRoom` の同じ行 → 同じ書き換え
- `commitRoomAction` の `sendError(ws, result.error.code, result.error.message);`
  → `sendError(ws, result.error.code, messageForRoundError(result.error));`

**`handleMessage` の `sendError(ws, result.error.code, result.error.message);` は変えない。**
あれは `ProtocolError` で、`docs/adr/0016` の対象外である。

import に `messageForRoundError` と `messageForRoomError` を足す。

- [ ] **Step 7: 全体が緑であることを確認する**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/poker-core test 2>&1 | grep -E "Tests |Test Files "
corepack pnpm --filter @tasuki/poker-sync test 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
corepack pnpm --filter @tasuki/poker-core typecheck
corepack pnpm --filter @tasuki/poker-sync typecheck
```

期待: poker-core **72 passed**、poker-sync **140 pass / 0 fail**、typecheck 両方成功。

**T1 の WS 特性テスト 5 件が緑であることが、文言を 1 文字も変えていない証拠である。**
落ちたら文言の対応表（`error-messages.ts`）が間違っている。

- [ ] **Step 8: 変異検査 — 文言の対応表が本当に効いているか**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH

# op の分岐を潰す（not-host の 2 文言を同じにする）
sed -i "s|? 'ホストのみが公開できます'|? 'ホストのみが次のラウンドを開始できます'|" \
  packages/poker-core/src/error-messages.ts
grep -c "ホストのみが次のラウンドを開始できます" packages/poker-core/src/error-messages.ts
corepack pnpm --filter @tasuki/poker-sync exec bun test --timeout 15000 \
  tests/error-messages.characterization.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
git checkout -- packages/poker-core/src/error-messages.ts
grep -c "ホストのみが次のラウンドを開始できます" packages/poker-core/src/error-messages.ts
```

期待: 書き換え後 `grep -c` が `2` → テストが `1 fail` 以上 → 復元後 `grep -c` が `1`。

- [ ] **Step 9: コミット**

```bash
cd /home/vscode/tasuki-work
git add packages/poker-core apps/poker-sync/src/server.ts
git commit -m "refactor: ドメインエラーから文言を外し op を持たせる（#165）

- docs/adr/0016 決定 2 項目 3。判別子と機械可読な詳細だけを持つ形にした
- code だけでは文言を復元できない（not-host も not-voting も操作で文言が違う）
  ため op を足した。timer-core の DomainError と同じ形
- 文言は poker-core 内の error-messages.ts が担う（core の外には出さない）
- WS へ送る文字列は 1 文字も変えていない。T1 の特性テスト 5 件が証拠
- ProtocolError は対象外（docs/adr/0016）。handleMessage の sendError は変えない
- 変異検査で op の分岐を潰すと特性テストが赤になることを確認した"
```

---

### Task 3: `RoomStore` / `MonotonicClock` / `IdGen` のポートとアダプタ

**Files:**
- Create: `apps/poker-sync/src/ports/room-store.ts`
- Create: `apps/poker-sync/src/ports/monotonic-clock.ts`
- Create: `apps/poker-sync/src/ports/id-gen.ts`
- Create: `apps/poker-sync/src/adapters/in-memory-room-store.ts`
- Create: `apps/poker-sync/src/adapters/performance-clock.ts`
- Create: `apps/poker-sync/src/adapters/crypto-id-gen.ts`
- Modify: `apps/poker-sync/src/rooms.ts`（ストアの実体を移し、`broadcast` だけ残す）
- Modify: `apps/poker-sync/src/server.ts`（3 つのアダプタをモジュール変数で持ち、使う）

**Interfaces:**
- Consumes: T2 の `messageForRoundError` / `messageForRoomError`
- Produces: 次の 3 つのインタフェース。T5 の `createSyncServer` がこれらを注入する

```ts
export interface RoomStore {
  get(roomId: string): Room | undefined;
  put(room: Room): void;
  remove(roomId: string): void;
  has(roomId: string): boolean;
  count(): number;
}
export interface MonotonicClock { now(): number }
export interface IdGen {
  roomIdCandidate(): string;
  participantId(): string;
  token(): string;
}
```

**この段では `RoomEntry`（room ＋ sockets）を解体しない。** ソケットの分離は T4 で行う。
`RoomStore` は `Room` だけを持ち、`rooms.ts` は当面 `entry.sockets` を保持し続ける。

- [ ] **Step 1: 3 つのポートを書く**

`apps/poker-sync/src/ports/room-store.ts`:

```ts
/**
 * RoomStore ポート — ルームの揮発保管（憲法 原則 III）。
 *
 * **ソケットは持たない。** 誰が接続中かは Broadcaster の担当である
 * （docs/adr/0004 の背景が挙げた「エントリがルームとソケットを同梱」の解消）。
 */
import type { Room } from '@tasuki/poker-core';

export interface RoomStore {
  get(roomId: string): Room | undefined;
  put(room: Room): void;
  remove(roomId: string): void;
  /** ID の衝突再試行に使う */
  has(roomId: string): boolean;
  /** ルーム数の上限判定に使う（上限そのものは呼び出し側が決める） */
  count(): number;
}
```

`apps/poker-sync/src/ports/monotonic-clock.ts`:

```ts
/**
 * MonotonicClock ポート — 単調時計。
 *
 * **壁時計（epoch ms）ではない。** `performance.now()` 相当で、NTP のステップ調整で
 * 非単調になりうる値を渡してはならない（レート制限の窓の計測に使う。#103 設計正本 D8）。
 *
 * timer-sync の `Clock` は epoch ms を返す壁時計で、意味が違う。名前を分けている。
 * poker のドメインには時刻フィールドが 1 つも無いため、壁時計は要らない。
 */
export interface MonotonicClock {
  now(): number;
}
```

`apps/poker-sync/src/ports/id-gen.ts`:

```ts
/**
 * IdGen ポート — 識別子の生成。
 *
 * **衝突の再試行は呼び出し側の方針であり、ここではやらない。** ポートは候補を 1 つ返すだけで、
 * 既存 ID との突き合わせは RoomStore を持つアプリケーション層が行う。
 */
export interface IdGen {
  /** 8 文字英数字のルーム ID 候補を 1 つ返す（research R4） */
  roomIdCandidate(): string;
  participantId(): string;
  /** 再接続用トークン。本人以外へ配信してはならない */
  token(): string;
}
```

- [ ] **Step 2: 3 つのアダプタを書く**

`apps/poker-sync/src/adapters/in-memory-room-store.ts`:

```ts
/** RoomStore の揮発インメモリ実装（憲法 原則 III。再起動で失われてよい） */
import type { Room } from '@tasuki/poker-core';
import type { RoomStore } from '../ports/room-store';

export function createInMemoryRoomStore(): RoomStore {
  const rooms = new Map<string, Room>();
  return {
    get: (roomId) => rooms.get(roomId),
    put: (room) => void rooms.set(room.id, room),
    remove: (roomId) => void rooms.delete(roomId),
    has: (roomId) => rooms.has(roomId),
    count: () => rooms.size,
  };
}
```

`apps/poker-sync/src/adapters/performance-clock.ts`:

```ts
/** MonotonicClock の実装。`performance.now()` は単調で、壁時計とは別系統である */
import type { MonotonicClock } from '../ports/monotonic-clock';

export function createPerformanceClock(): MonotonicClock {
  return { now: () => performance.now() };
}
```

`apps/poker-sync/src/adapters/crypto-id-gen.ts`:

```ts
/** IdGen の実装。ルーム ID は UUID の先頭 8 文字を英数字小文字にしたもの（research R4） */
import type { IdGen } from '../ports/id-gen';

export function createCryptoIdGen(): IdGen {
  return {
    roomIdCandidate: () => crypto.randomUUID().replaceAll('-', '').slice(0, 8).toLowerCase(),
    participantId: () => crypto.randomUUID(),
    token: () => crypto.randomUUID(),
  };
}
```

- [ ] **Step 3: `rooms.ts` からストアの実体を抜く**

`apps/poker-sync/src/rooms.ts` から次を削除する。

- `const rooms = new Map<string, RoomEntry>();`
- `generateRoomId()` / `putRoom()` / `roomCount()` / `getRoom()` / `dropIfEmpty()`

**残すのは `RoomSocket` / `RoomEntry` の型と `broadcast()` だけ**にする。
`RoomEntry` は当面そのまま（T4 で解体する）。

- [ ] **Step 4: `server.ts` を新しい 3 つのアダプタで配線する**

`server.ts` のモジュール直下へ次を足す（既存の `config` などの隣）。

```ts
const store = createInMemoryRoomStore();
const clock = createPerformanceClock();
const idGen = createCryptoIdGen();
/** roomId → 接続中ソケット（T4 で Broadcaster へ移す） */
const socketsByRoom = new Map<string, Map<string, RoomSocket>>();
```

そのうえで:

- `getRoom(roomId)` の呼び出しを `store.get(roomId)` と `socketsByRoom.get(roomId)` の組へ置き換える
- `putRoom(entry)` → `store.put(room)` ＋ `socketsByRoom.set(room.id, new Map())`
- `dropIfEmpty(roomId)` → `store.remove(roomId)` ＋ `socketsByRoom.delete(roomId)`
- `roomCount()` → `store.count()`
- `newIds()` → `{ participantId: idGen.participantId(), token: idGen.token() }`
- `performance.now()` の 2 箇所 → `clock.now()`
- `generateRoomId()` → **衝突再試行をこのファイルの関数として書く**

```ts
/**
 * 衝突しないルーム ID を採る（research R4）。
 *
 * **再試行は方針であって I/O ではない**ので、ポートではなくここが持つ
 * （IdGen は候補を 1 つ返すだけ）。
 */
function generateRoomId(): string {
  for (;;) {
    const id = idGen.roomIdCandidate();
    if (!store.has(id)) return id;
  }
}
```

- [ ] **Step 5: 緑であることを確認してコミット**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/poker-sync typecheck
corepack pnpm --filter @tasuki/poker-sync test 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
```

期待: typecheck 成功、**140 pass / 0 fail**。

```bash
git add apps/poker-sync/src
git commit -m "refactor: RoomStore / MonotonicClock / IdGen をポートへ切り出す（#165）

- docs/adr/0004 の標準構成へ。ports/ と adapters/ を新設した
- 時計は MonotonicClock とした。timer の Clock は壁時計で意味が違う
  poker のドメインには時刻フィールドが 1 つも無い
- ルーム ID の衝突再試行はアプリケーション層の方針としてサーバー側に置いた
  ポートは候補を 1 つ返すだけにする
- ソケットの分離（RoomEntry の解体）は次のコミットで行う
- 振る舞いは変えていない。140 件が緑"
```

---

### Task 4: `Broadcaster` を切り、ソケットレジストリを分離する

**Files:**
- Create: `apps/poker-sync/src/ports/broadcaster.ts`
- Create: `apps/poker-sync/src/adapters/ws-broadcaster.ts`
- Delete: `apps/poker-sync/src/rooms.ts`（`broadcast` が Broadcaster へ移り、`RoomEntry` が不要になる）
- Modify: `apps/poker-sync/src/server.ts`

**Interfaces:**
- Consumes: T3 の `RoomStore`
- Produces:

```ts
export interface RoomSocket { send(data: string): void }
export interface Broadcaster {
  attach(roomId: string, participantId: string, socket: RoomSocket): void;
  detach(roomId: string, participantId: string, socket: RoomSocket): boolean;
  countIn(roomId: string): number;
  broadcastSnapshot(roomId: string, room: Room): void;
  sendTo(socket: RoomSocket, msg: ServerMessage): void;
}
```

**このタスクが最も壊れやすい。** T1 Step 4 のソケット同一性の特性テストが唯一の守りである。

- [ ] **Step 1: ポートを書く**

`apps/poker-sync/src/ports/broadcaster.ts`:

```ts
/**
 * Broadcaster ポート — 誰が接続中かと、どう届けるか。
 *
 * **ルーム保管とは分ける**（docs/adr/0004 の背景が挙げた非対称の解消）。
 * ただし timer-sync の形はそのまま写せない。timer は `Participant.connId` を持ち
 * Broadcaster が connId からソケットを引くが、**poker の Participant に connId は無い**。
 * 足すとスナップショットの形が変わり振る舞い不変を壊すため、接続レジストリは
 * アダプタの内側に置き、このポートはルーム ID と参加者 ID だけで話す。
 */
import type { Room, ServerMessage } from '@tasuki/poker-core';

export interface RoomSocket {
  send(data: string): void;
}

export interface Broadcaster {
  attach(roomId: string, participantId: string, socket: RoomSocket): void;
  /**
   * 指定ソケットが現在の登録と同一のときだけ外し、true を返す。
   * **異なれば何もせず false を返す**（同一参加者が別ソケットで再接続済みの場合）。
   * これを落とすと、再接続直後に古いソケットの close が新しい接続を蹴り出す。
   */
  detach(roomId: string, participantId: string, socket: RoomSocket): boolean;
  countIn(roomId: string): number;
  broadcastSnapshot(roomId: string, room: Room): void;
  sendTo(socket: RoomSocket, msg: ServerMessage): void;
}
```

- [ ] **Step 2: アダプタを書く**

`apps/poker-sync/src/adapters/ws-broadcaster.ts`:

```ts
/**
 * Broadcaster の実装。接続レジストリ（roomId → participantId → socket）を内側に持つ。
 *
 * 受信者別スナップショットの共有部分は 1 回だけ構築する（research R1）。
 */
import { createSnapshotBuilder, type Room, type ServerMessage } from '@tasuki/poker-core';
import type { Broadcaster, RoomSocket } from '../ports/broadcaster';

export function createWsBroadcaster(): Broadcaster {
  const byRoom = new Map<string, Map<string, RoomSocket>>();

  return {
    attach(roomId, participantId, socket) {
      const sockets = byRoom.get(roomId) ?? new Map<string, RoomSocket>();
      sockets.set(participantId, socket);
      byRoom.set(roomId, sockets);
    },

    detach(roomId, participantId, socket) {
      const sockets = byRoom.get(roomId);
      if (!sockets) return false;
      // 同一参加者が別ソケットで再接続済みなら（socket が入れ替わっていたら）何もしない
      if (sockets.get(participantId) !== socket) return false;
      sockets.delete(participantId);
      if (sockets.size === 0) byRoom.delete(roomId);
      return true;
    },

    countIn: (roomId) => byRoom.get(roomId)?.size ?? 0,

    broadcastSnapshot(roomId, room) {
      const sockets = byRoom.get(roomId);
      if (!sockets) return;
      const snapshotOf = createSnapshotBuilder(room);
      for (const [participantId, socket] of sockets) {
        socket.send(JSON.stringify(snapshotOf(participantId)));
      }
    },

    sendTo: (socket, msg) => socket.send(JSON.stringify(msg)),
  };
}
```

- [ ] **Step 3: `server.ts` を Broadcaster で配線し、`rooms.ts` を消す**

- `const socketsByRoom = ...`（T3 で足したもの）を `const broadcaster = createWsBroadcaster();` へ置き換える
- `entry.sockets.set(...)` → `broadcaster.attach(roomId, participantId, ws)`
- `entry.sockets.get(participantId) !== ws` の判定を含む `detachFromCurrentRoom` の本体を、
  `broadcaster.detach(roomId, participantId, ws)` の戻り値で分岐する形へ書き換える
- `entry.sockets.size === 0` → `broadcaster.countIn(roomId) === 0`
- `broadcast(entry)` → `broadcaster.broadcastSnapshot(roomId, room)`
- `sendError` / `sendJoined` の `ws.send(JSON.stringify(...))` は
  `broadcaster.sendTo(ws, { ... })` へ置き換えてよい（型が `ServerMessage` に合うことを確認する）
- `apps/poker-sync/src/rooms.ts` を `git rm` する

**`detachFromCurrentRoom` の順序の不変条件を保つこと。** 現在の実装は

1. `ws.data` を先にクリア
2. 参加者・ルームが無ければ何もしない
3. **ソケットが入れ替わっていたら何もしない**
4. 外して、残り 0 ならルーム破棄
5. そうでなければ `markDisconnected` → `applyAutoReveal` → 配信

の順である。**3 と 4 の間に他の処理を挟まないこと。**

- [ ] **Step 4: 緑であることを確認する（特に特性テスト）**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/poker-sync typecheck
corepack pnpm --filter @tasuki/poker-sync exec bun test --timeout 15000 \
  tests/socket-identity.characterization.test.ts 2>&1 | tail -6
corepack pnpm --filter @tasuki/poker-sync test 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
```

期待: typecheck 成功、ソケット同一性が `1 pass`、全体 **140 pass / 0 fail**。

**ソケット同一性が落ちたら、`detach` の同一性判定が効いていない。** 止めて報告すること。

- [ ] **Step 5: 変異検査 — `detach` の同一性判定が効いているか**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
sed -i "s|if (sockets.get(participantId) !== socket) return false;|// 変異検査中|" \
  apps/poker-sync/src/adapters/ws-broadcaster.ts
grep -c "変異検査中" apps/poker-sync/src/adapters/ws-broadcaster.ts
corepack pnpm --filter @tasuki/poker-sync exec bun test --timeout 15000 \
  tests/socket-identity.characterization.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
git checkout -- apps/poker-sync/src/adapters/ws-broadcaster.ts
grep -c "変異検査中" apps/poker-sync/src/adapters/ws-broadcaster.ts
```

期待: `1` → `1 fail` → `0`。

- [ ] **Step 6: コミット**

```bash
cd /home/vscode/tasuki-work
git add -A
git commit -m "refactor: Broadcaster を切りソケットをルーム保管から分離する（#165）

- docs/adr/0004 の背景が挙げた「エントリがルームとソケットを同梱」を解消した
- timer の形は写せない。poker の Participant に connId が無く、足すと
  スナップショットの形が変わって振る舞い不変を壊すため、接続レジストリは
  アダプタの内側に置きポートは roomId と participantId だけで話す
- detach は同一性が一致したときだけ外して true を返す。落とすと再接続直後に
  古いソケットの close が新しい接続を蹴り出す
- rooms.ts は役目を終えたので削除した
- 変異検査で同一性判定を潰すと特性テストが赤になることを確認した"
```

---

### Task 5: `application/` へ移し、`create-sync-server.ts` に組み立てを集約する

**Files:**
- Create: `apps/poker-sync/src/application/handlers.ts`
- Create: `apps/poker-sync/src/application/commit-room-action.ts`
- Create: `apps/poker-sync/src/application/rate-limit-gate.ts`
- Create: `apps/poker-sync/src/application/heartbeat.ts`
- Create: `apps/poker-sync/src/adapters/ws-adapter.ts`
- Create: `apps/poker-sync/src/create-sync-server.ts`
- Modify: `apps/poker-sync/src/server.ts`（プロセス関心事だけに縮める）

**Interfaces:**
- Consumes: T3・T4 の 4 ポートとアダプタ
- Produces:

```ts
export interface PokerSyncServer {
  /** 実際に bind したポート */
  readonly port: number;
  readonly store: RoomStore;
  close(): Promise<void>;
}
export function createSyncServer(config: PokerSyncConfig): PokerSyncServer;
```

**これが本 PR の山場である。** ここで初めてモジュールグローバルが消える。

- [ ] **Step 1: アプリケーション層へユースケースを移す**

`server.ts` から次の関数を移す。**ロジックは変えず、依存を引数で受け取る形にするだけ。**

| 移す関数 | 行き先 | 受け取る依存 |
|---|---|---|
| `handleCreateRoom` / `handleJoinRoom` / `handleCheckRoom` / `detachFromCurrentRoom` / `completeJoin` / `generateRoomId` | `application/handlers.ts` | `store` `broadcaster` `idGen` `clock` `rateLimiter` `config` |
| `commitRoomAction` / `dispatch` | `application/commit-room-action.ts` | `store` `broadcaster` |
| レート制限の判定順序（`shouldReject` → 照会 → `consume`） | `application/rate-limit-gate.ts` | `clock` `rateLimiter` |
| `startHeartbeat` | `application/heartbeat.ts` | 接続レジストリ・`config.heartbeatIntervalMs` / `heartbeatMaxMisses` |

**`handlers.ts` は依存をまとめて受け取るファクトリ形式にする**（timer-sync の `makeHandlers` と同じ形）。

```ts
export interface HandlerDeps {
  store: RoomStore;
  broadcaster: Broadcaster;
  idGen: IdGen;
  clock: MonotonicClock;
  rateLimiter: TokenBucketLimiter;
  maxRooms: number;
}

export function makeHandlers(deps: HandlerDeps) {
  // ここに移した関数群を閉じ込め、{ handleCreateRoom, handleJoinRoom, ... } を返す
}
```

**レート制限の判定順序を変えないこと。** 現在の実装は

1. `shouldReject` を**ルームを照会する前に**呼ぶ（逆順だと残量が無いときに `room-not-found` が返り、攻撃者がトークンを消費せずに存在確認を続けられる）
2. ルームが無いときだけ `consume` する

の順である。`guards.test.ts` と `rate-limit.test.ts` がこれを見ている。

- [ ] **Step 2: WS アダプタを作る**

`apps/poker-sync/src/adapters/ws-adapter.ts` に、`server.ts` から次を移す。

- `ConnectionData` の型
- `connections` / `missedPongs` / `connCounter`
- `handleOpen` / `handleClose` / `handleMessage` / `pong`
- `Bun.serve({...})` の呼び出し
- `console.log` の 3 箇所（`conn-rejected` ×2 と `derive-client-key-error`）

**ログの内容と件数を変えないこと。** 許可マーカー（`// log-hygiene:allow ...`）も一緒に移す。
`listening` のログは `server.ts` に残す。

- [ ] **Step 3: `create-sync-server.ts` を書く**

```ts
/**
 * 同期サーバーの配線（組み立て）を 1 箇所に閉じ込めた関数（docs/adr/0004 決定 4）。
 *
 * ⚠ **本番（`server.ts`）とテストが必ずこの関数を通ることが要点である。**
 * テスト側で同じ組み立てを書き写すと、写しが本番からずれた瞬間に
 * 「配線が繋がっているか」の検査が死ぬ。組み立ての知識はこのファイルだけが持つ。
 *
 * `server.ts` に残すのは、プロセスとしての振る舞い（設定の読み込み・起動ログ）だけである。
 */
import { randomBytes } from 'node:crypto';
import {
  createClientKeyDeriver,
  createTokenBucketLimiter,
  DEFAULT_CAPACITY,
  DEFAULT_REFILL_PER_SEC,
} from '@tasuki/rate-limit';
import { createInMemoryRoomStore } from './adapters/in-memory-room-store';
import { createPerformanceClock } from './adapters/performance-clock';
import { createCryptoIdGen } from './adapters/crypto-id-gen';
import { createWsBroadcaster } from './adapters/ws-broadcaster';
import { createWsAdapter } from './adapters/ws-adapter';
import { makeHandlers } from './application/handlers';
import { startHeartbeat } from './application/heartbeat';
import type { RoomStore } from './ports/room-store';
import type { PokerSyncConfig } from './config';

export interface PokerSyncServer {
  /** 実際に bind したポート（PORT=0 起動のときはここが正しい値） */
  readonly port: number;
  /** ルーム保管。検証から状態を覗くために公開する */
  readonly store: RoomStore;
  close(): Promise<void>;
}

export function createSyncServer(config: PokerSyncConfig): PokerSyncServer {
  const store = createInMemoryRoomStore();
  const clock = createPerformanceClock();
  const idGen = createCryptoIdGen();
  const broadcaster = createWsBroadcaster();

  // レート制限の相関ソルトはプロセス起動ごとに 1 度だけ。env にも設定にも置かない（ADR 0012 D3）
  const deriveClientKey = createClientKeyDeriver(randomBytes(32));
  const rateLimiter = createTokenBucketLimiter({
    capacity: DEFAULT_CAPACITY,
    refillPerSec: DEFAULT_REFILL_PER_SEC,
  });

  const handlers = makeHandlers({
    store,
    broadcaster,
    idGen,
    clock,
    rateLimiter,
    maxRooms: config.maxRooms,
  });

  const wsAdapter = createWsAdapter({ config, handlers, deriveClientKey });
  const stopHeartbeat = startHeartbeat(wsAdapter, config);

  return {
    port: wsAdapter.port,
    store,
    async close() {
      stopHeartbeat();
      await wsAdapter.close();
    },
  };
}
```

**`config` を引数で受け取ることが要点である。** これが無いとテストがアダプタを差し替えられない。

- [ ] **Step 4: `server.ts` をプロセス関心事だけに縮める**

```ts
/**
 * 同期サーバーのエントリポイント。
 *
 * ここが受け持つのは「プロセスとしての振る舞い」だけである。
 * 依存の組み立ては `create-sync-server.ts` の `createSyncServer()` が持つ。
 * テストも同じ関数を通ることで、配線がずれたときにテストが本当に落ちる。
 */
import { loadPokerSyncConfig } from './config';
import { createSyncServer } from './create-sync-server';
import { buildListeningLogFields } from './listening-log';

const config = loadPokerSyncConfig(process.env);
const server = createSyncServer(config);

// この 1 行は tests/helpers.ts と e2e/harness/sync.ts が JSON.parse して実ポートを
// 受け取る機械可読な契約である。形式を変えるとテストが全滅する。
console.log(JSON.stringify({ event: 'listening', ...buildListeningLogFields(config, server.port) })); // log-hygiene:allow テストハーネスとの契約
```

- [ ] **Step 5: 緑であることを確認する**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/poker-sync typecheck
corepack pnpm --filter @tasuki/poker-sync test 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
```

期待: typecheck 成功、**140 pass / 0 fail**。

**`listening` の行が出なくなるとテストが全滅する**（`helpers.ts` がこの行を待つ）。
「server did not start in time」で落ちたらそこを疑う。

- [ ] **Step 6: E2E が通ることを確認する**

`e2e/harness/sync.ts` が `apps/poker-sync/src/server.ts` を起動する。**エントリポイントの
契約が壊れていないこと**を実際に確かめる。

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/e2e exec playwright test specs/poker.spec.ts 2>&1 | tail -8
```

期待: 2 件が pass。

**落ちたら止めて報告すること。** 起動経路が壊れている可能性がある。

- [ ] **Step 7: コミット**

```bash
cd /home/vscode/tasuki-work
git add -A
git commit -m "refactor: 組み立てを create-sync-server.ts へ集約する（#165）

- docs/adr/0004 決定 4。本番の server.ts とテストの両方がこの関数を通る
- ユースケースを application/ へ、WS と接続レジストリを adapters/ws-adapter.ts へ移した
  ロジックは変えず、依存を引数で受け取る形にしただけ
- server.ts はプロセスの振る舞い（設定の読み込みと起動ログ）だけになった
- モジュールグローバルが消え、config を引数で渡せるようになった
- listening のログは server.ts に残した（helpers.ts と e2e の機械可読な契約）
- レート制限の判定順序（照会より前に shouldReject）を保った
- 振る舞いは変えていない。140 件と E2E 2 件が緑"
```

---

### Task 6: 各ポートに差し替えテストを足す（ADR-0007 追記の MUST）

**Files:**
- Create: `apps/poker-sync/tests/create-sync-server.substitution.test.ts`

**Interfaces:**
- Consumes: T5 の `createSyncServer(config)` と 4 ポート
- Produces: 4 ポートそれぞれの差し替えテスト。**これが無いとポートを切ったこと自体が
  `docs/adr/0007` 基準 1 の違反になる**

**このタスクの意義:** 4 本とも「**今は書けないこと**」を検証する。差し替えられないなら
ポートを切る理由が無い。

- [ ] **Step 1: 差し替えテストを書く**

`apps/poker-sync/tests/create-sync-server.substitution.test.ts` を新規作成する。

**`createSyncServer` はアダプタを内部で作るので、差し替えるにはユニット単位で
アプリケーション層を組み立てる。** ポートの差し替えが効くことを示すのが目的である。

```ts
// ポートの差し替えテスト（docs/adr/0007 の追記が定める MUST）。
//
// 「利用者（呼び出し箇所）が 1 つしかないものを抽出しない」の例外として、
// **テストからの差し替え利用を 2 つ目の利用者と数える**。ただし
// 「テストを書けば 2 つ目になる」では足りず、**差し替えを行うテストが現に存在する**
// ことが条件である。このファイルがその条件を満たす。
//
// 4 本とも「差し替えなしでは書けなかったこと」を検証する。
import { describe, expect, it } from 'bun:test';
import { createRoom } from '@tasuki/poker-core';
import { createInMemoryRoomStore } from '../src/adapters/in-memory-room-store';
import { makeHandlers } from '../src/application/handlers';
import type { IdGen } from '../src/ports/id-gen';
import type { MonotonicClock } from '../src/ports/monotonic-clock';
import type { Broadcaster, RoomSocket } from '../src/ports/broadcaster';

/** 送信を記録するだけのソケット */
function spySocket(): RoomSocket & { sent: string[] } {
  const sent: string[] = [];
  return { sent, send: (data) => void sent.push(data) };
}

describe('IdGen の差し替え（衝突再試行）', () => {
  it('候補が既存 ID と衝突する間は引き直す', () => {
    // Given: 最初の 2 回だけ既存 ID と同じ候補を返す IdGen
    const store = createInMemoryRoomStore();
    store.put(createRoom('taken001', 'たろう', { participantId: 'p', token: 't' })._unsafeUnwrap().room);

    const candidates = ['taken001', 'taken001', 'fresh999'];
    let i = 0;
    const idGen: IdGen = {
      roomIdCandidate: () => candidates[i++] ?? 'exhausted',
      participantId: () => 'p-new',
      token: () => 't-new',
    };

    // When / Then: 3 回目の候補が採用される
    // （衝突再試行は 2026-08-17 時点でテストが 0 件だった。差し替えなしでは
    //  crypto.randomUUID() の衝突を起こせず、この経路を通せない）
    const roomId = makeHandlers({
      store,
      broadcaster: nullBroadcaster(),
      idGen,
      clock: fixedClock(0),
      rateLimiter: alwaysAllowLimiter(),
      maxRooms: 50,
    }).generateRoomId();

    expect(roomId).toBe('fresh999');
    expect(i).toBe(3);
  });
});
```

**残る 3 本（`MonotonicClock` / `RoomStore` / `Broadcaster`）も同じファイルに書く。**
それぞれの検証内容:

- **`MonotonicClock`**: 固定時計を注入し、**レート制限の窓の境界**を検証する。
  時計を進めてトークンが補充される瞬間を決定的に作る（実時間を待たない）
- **`RoomStore`**: 事前にルームを `maxRooms` 個仕込んだストアを渡し、
  `server-busy` になることを検証する（WS を張らずに上限へ到達できる）
- **`Broadcaster`**: `spySocket()` を `attach` し、`broadcastSnapshot` の
  **宛先と回数**を検証する（受信側の WS からは見えない）

`nullBroadcaster()` / `fixedClock(n)` / `alwaysAllowLimiter()` は同ファイル内のヘルパとして書く。

- [ ] **Step 2: 4 本とも通ることを確認する**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/poker-sync exec bun test --timeout 15000 \
  tests/create-sync-server.substitution.test.ts 2>&1 | tail -6
```

期待: 4 件以上が pass。

- [ ] **Step 3: 4 本が「差し替えなしでは書けない」ことを確かめる**

**これは形式的な確認ではない。** 各テストについて、次を報告に書くこと。

- そのテストが**既存の WS 越しのテストで書けるか**
- 書けないなら**なぜ書けないか**（例: `crypto.randomUUID()` の衝突を起こせない）

**1 本でも「WS 越しでも書ける」なら、そのポートは `docs/adr/0007` 基準 1 を満たさない。**
止めて報告すること。

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/poker-sync/tests
git commit -m "test: 4 ポートの差し替えテストを足す（#165）

- docs/adr/0007 の追記（#72 E1）が定める MUST。差し替えを行うテストが
  現に存在することが、ポートを切る条件である
- IdGen: 衝突する候補を返すスタブで再試行を検証（実装以来テスト 0 件だった）
- MonotonicClock: 固定時計でレート制限の窓の境界を検証（実時間を待たない）
- RoomStore: 事前に仕込んだストアで maxRooms の上限を検証（WS を張らない）
- Broadcaster: 送信を記録するスパイで配信の宛先と回数を検証"
```

---

### Task 7: 検査の宣言を更新し、古くなったコメントを直す

**Files:**
- Modify: `scripts/audit-log-hygiene.mjs`（`REQUIRED_FILES` と `ALLOWED_FILES`）
- Modify: `apps/poker-sync/tests/helpers.ts`（サブプロセスの理由）
- Modify: `apps/poker-sync/tests/guards.test.ts`（同）
- Modify: `.github/workflows/ci.yml`（コメント）
- Modify: `docs/guides/architecture.md`（poker-sync の注記を消す）

**Interfaces:**
- Consumes: T5 の `create-sync-server.ts` と `adapters/ws-adapter.ts`
- Produces: 検査が新しい構成を守る状態

- [ ] **Step 1: `REQUIRED_FILES` に組み立て関数を足す**

`scripts/audit-log-hygiene.mjs` の `REQUIRED_FILES` へ 1 行足す。

```js
  "apps/poker-sync/src/create-sync-server.ts",
```

これが **E1 が E2 に割り当てた機械検査**（「`create-sync-server.ts` が実在する」）である。
新しいスクリプトは要らない。

- [ ] **Step 2: `ALLOWED_FILES` を新しいログの置き場に合わせる**

`console.log` の 3 箇所（`conn-rejected` ×2・`derive-client-key-error`）が
`adapters/ws-adapter.ts` へ移ったので、許可リストへ足す。

```js
  "apps/poker-sync/src/adapters/ws-adapter.ts",
```

**`apps/poker-sync/src/server.ts` は残す**（`listening` のログがそこにある）。

- [ ] **Step 3: ログ衛生が通ることを確認する**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
node scripts/audit-log-hygiene.mjs 2>&1 | tail -5; echo "exit: $?"
```

期待: 終了コード 0。

**`ALLOWED_FILES` を足さないと赤くなるはず**なので、足す前に一度走らせて赤を見てから
足すと、検査が効いていることを確認できる。

- [ ] **Step 4: 破壊検証 — `REQUIRED_FILES` が効いているか**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
git mv apps/poker-sync/src/create-sync-server.ts apps/poker-sync/src/create-sync-server.ts.bak
node scripts/audit-log-hygiene.mjs > /dev/null 2>&1; echo "exit: $?（1 なら検出できている）"
git mv apps/poker-sync/src/create-sync-server.ts.bak apps/poker-sync/src/create-sync-server.ts
node scripts/audit-log-hygiene.mjs > /dev/null 2>&1; echo "exit: $?（0 に戻る）"
git status --short
```

期待: 1 → 0、`git status` が空。

- [ ] **Step 5: 移行で古くなったコメントを直す**

`apps/poker-sync/tests/helpers.ts` の冒頭コメントは PR-1 で
「`src/server.ts` に設定の注入点が無い」と書き換えてある。**T5 でその注入点ができた**ので、
実態に合わせる。

```
// **サブプロセスにする理由は #165 で変わった。** 移行前は vitest（Node）上で走っており
// Bun.serve をそもそも呼べなかったが、bun test へ移った現在は in-process でも呼べる（実測）。
// それでもサブプロセスなのは、`src/server.ts` がモジュール読み込み時に config を読んで
// Bun.serve を呼ぶ設計で、**設定を差し替える注入点が無い**ためである。
// in-process 化は #165 の PR-2（create-sync-server.ts の導入）で行う。
```

を、次の趣旨へ直す。

```
// **既存の 14 ファイルはサブプロセス起動のままである。** #165 PR-2 で
// `create-sync-server.ts` ができ、`createSyncServer(config)` で in-process 起動が
// できるようになった（`tests/create-sync-server.substitution.test.ts` がそれを使う）。
// 既存テストの in-process への移行は、振る舞い不変の証拠を保つため本 PR では行わない。
```

`@param env` の説明と `guards.test.ts` の冒頭も同様に直す。

**「注入点が無い」という記述を残さないこと。** T5 で作ったので事実に反する。

- [ ] **Step 6: `ci.yml` のコメントと `architecture.md` の注記を直す**

`.github/workflows/ci.yml` の `setup-bun` の直前のコメント:

```
      # poker-sync は Bun 必須。tests/helpers.ts が `bun run src/server.ts` を
      # サブプロセス起動し、build も `bun build --target=bun` を使う。
```

は依然として正確である（`helpers.ts` は今もサブプロセス起動する）。**変更不要**。
**実際にそうか確認し、変わっていれば直すこと。**

`docs/guides/architecture.md` の poker-sync の注記:

```
**注記（poker-sync）:** `apps/poker-sync/src` は現在 `config.ts` / `rooms.ts` /
`server.ts` のモジュール関数中心の構成で、上表のポート/アダプタ標準形には
まだ従っていません。標準形への再編は #72（docs/adr/0004）で行います。
```

**この注記を削除する。** T5 で標準形になったので、残すと事実に反する。
削除したうえで、層対応表の `アダプタ` 行などが poker-sync も含む書き方になっているかを確認する。

- [ ] **Step 7: 全体の検査を通す**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm test 2>&1 | tail -8
node scripts/check-links.mjs > /dev/null 2>&1; echo "check-links: $?"
node scripts/audit-structure.mjs > /dev/null 2>&1; echo "audit-structure: $?"
node scripts/audit-log-hygiene.mjs > /dev/null 2>&1; echo "audit-log-hygiene: $?"
node --test $(node scripts/list-scan-targets.mjs script-tests) 2>&1 | tail -3
grep -rn "Bun ランタイム専用\|注入点が無い" apps/poker-sync/tests/ docs/guides/architecture.md
echo "★ 上が空なら古い記述は残っていない"
```

期待: 全部成功、grep が 0 件。

**`corepack pnpm test` は turbo 経由なので、poker-sync が `cache miss` か確認すること。**
FULL TURBO なら実行されていない。

- [ ] **Step 8: コミット**

```bash
cd /home/vscode/tasuki-work
git add -A
git commit -m "chore: 検査の宣言を新しい構成に合わせる（#165）

- REQUIRED_FILES へ create-sync-server.ts を足した
  E1 が E2 に割り当てた機械検査は、既存の宣言へ 1 行足すだけで済む
- ALLOWED_FILES へ adapters/ws-adapter.ts を足した
  conn-rejected と derive-client-key-error がそこへ移ったため
- helpers.ts と guards.test.ts の「注入点が無い」は PR-2 で解消したので直した
- architecture.md の poker-sync の注記を削除した（標準形になった）
- REQUIRED_FILES の破壊検証を実施した"
```

---

## Self-Review

**1. Spec coverage:** 設計正本の D1〜D10 を突き合わせた。

| 決定 | 実装するタスク |
|---|---|
| D1（PR を 2 本に分ける） | PR-1 で完了。本計画は PR-2 |
| D2（ポートは 4 本） | T3（3 本）・T4（Broadcaster） |
| D3（`MonotonicClock`） | T3 Step 1 |
| D4（ルームとソケットを分ける） | T4 |
| D5（4 ポートのインタフェース） | T3 Step 1・T4 Step 1 |
| D6（衝突再試行はアプリ層） | T3 Step 4 |
| D7（各ポートに差し替えテスト） | T6 |
| D8（エラー値に `op`） | T2 |
| D9（特性テスト） | T1 |
| D10（機械検査は既存の宣言へ） | T7 |

**漏れなし。**

**2. Placeholder scan:** 「TBD」「後で」「同様に」は無い。ただし **T5 Step 1 と T6 Step 1 は、
移す関数の一覧と検証内容を示して実コードは書いていない**。これは意図的である。
移動対象が 426 行あり、全文を計画へ写すと**写し間違いのほうが危険**なため、
「何をどこへ、どの依存を引数で受けるか」と**保つべき不変条件**（レート制限の判定順序・
`detachFromCurrentRoom` の順序）を明示する形にした。

**3. Type consistency:** `RoomStore` `MonotonicClock` `IdGen` `Broadcaster` `RoomSocket`
`PokerSyncServer` `HandlerDeps` は T3・T4・T5 で同じ名前・同じ形を使っている。
`messageForRoundError` / `messageForRoomError` は T2 で定義し T5 が使う。

**4. 順序の依存:**

- **T1 は必ず最初。** poker-core のテストは `code` しか見ておらず、T2 が文言を壊しても
  T1 が無ければ気づけない
- **T3 は T4 より前。** Broadcaster は `RoomStore` が分かれていることを前提にする
- **T5 は T3・T4 の後。** 4 ポートが揃わないと組み立て関数を書けない
- **T6 は T5 の後。** 差し替えテストは `makeHandlers` を呼ぶ
- **T7 は最後。** `create-sync-server.ts` と `ws-adapter.ts` が実在してから宣言へ足す
