# 玄関で名乗る前にルームの不在を知らせる（#274）実装計画

> **作業者へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: 参加用 URL で玄関を開いた人が、**名乗る前に**そのルームが見つからないことを知れるようにする。

**方式**: ハブの wire に照会 `room.check` を 1 つ足す。答えは 2 値（無いときだけ `ROOM_NOT_FOUND`、
在れば無音）。玄関は復帰の組を持たない人にだけ照会を送り、受けた `ROOM_NOT_FOUND` で
専用画面（`gone`）へ落とす。復帰の組を持つ人は照会せず、`room.join` の答えで同じ画面へ合流する。

**技術**: TypeScript / React / valibot / neverthrow / Bun（`apps/tasuki-sync`）/
vitest（`apps/landing`・`packages/room-core`）/ Playwright（`e2e`）

**設計正本**: `docs/superpowers/specs/2026-09-18-hub-room-check-design.md`
（**計画は正本に従属する。両方を読むこと**）

## 全体の制約

- **`room.check` は合言葉の関門（`mayEnter` / `checkPassphrase`）を通さない**（正本 D2）。
  通すと保護ルームを「存在しない」と答え、正規の招待客に嘘をつく
- **答えは 2 値。** 在るときは何も返さない。`HubServerMsg` に型を足さない（正本 D3）
- **レート制限の判定は照会より前。** 消費は**無かったときだけ**（正本 D4）
- **画面の見出しは「ルームが見つかりません」。** 「終了しています」と書かない（正本 D10）
- **`screenFor` の `gone` は `joined` より後**（正本 D6）
- テストランナーはパッケージごとに違う: `apps/tasuki-sync` は `bun:test`、
  `apps/landing` と `packages/room-core` は `vitest`
- コメント・docstring は日本語。「なぜ」を書く
- **各タスクの最後にコミットする。** ブランチは `feature/hub-room-check`

---

### Task 1: wire に `room.check` を足す

**ファイル**
- 変更: `packages/room-core/src/wire.ts`
- テスト: `packages/room-core/tests/wire.test.ts`

**インターフェース**
- 産出: `HubCommand` に `{ command: "room.check"; code: string }` の変種。
  `HubCommandSchema` が同じ形を検める。以降の全タスクがこの名前に依存する

- [ ] **手順 1: 落ちるテストを書く**

`packages/room-core/tests/wire.test.ts` の末尾へ追加する。

```ts
/**
 * ルームの生死の照会（#274）。**名前を受け取らない。**
 *
 * 通る形と落ちる形を対で置く（このファイルの冒頭の規律）。
 */
describe("生死の照会の wire", () => {
  it("Given コードだけの照会 / When 検証する / Then 通る", () => {
    const parsed = v.safeParse(HubCommandSchema, { command: "room.check", code: "朝会モブ-a1b2" });

    expect(parsed.success).toBe(true);
  });

  it("Given 空のコード / When 検証する / Then 落ちる", () => {
    // 空文字を通すと、サーバーが必ず ROOM_NOT_FOUND を返す問い合わせでバケツを消費できる
    const parsed = v.safeParse(HubCommandSchema, { command: "room.check", code: "" });

    expect(parsed.success).toBe(false);
  });

  it("Given 表示名を混ぜた照会 / When 検証する / Then 落ちる", () => {
    // **照会は名前を受け取らない。** 余剰フィールドを通すと、
    // 「名乗らずに尋ねる」という性質が wire の側から崩れる
    const parsed = v.safeParse(HubCommandSchema, {
      command: "room.check",
      code: "朝会モブ-a1b2",
      displayName: "あや",
    });

    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **手順 2: 落ちることを確かめる**

実行: `cd packages/room-core && pnpm vitest run tests/wire.test.ts`
期待: 3 件とも FAIL（`room.check` という variant が無いため `success` が false になる。
3 件目だけは「落ちる」を期待しているので**緑になる可能性がある** —— そのときは
1・2 件目の赤だけを根拠に進む）

- [ ] **手順 3: 実装する**

`packages/room-core/src/wire.ts` の `HubCommand` に変種を足す。

```ts
export type HubCommand =
  | { command: "room.create"; roomName: string; displayName: string }
  | {
      command: "room.join";
      code: string;
      displayName: string;
      resumeToken?: string | undefined;
      passphrase?: string | undefined;
    }
  /**
   * ルームの生死だけを尋ねる（#274）。**名前を受け取らない。**
   *
   * 招待リンクを踏んだ人が、名乗る前に不在を知るための問い合わせである。
   * 応答は**無いときだけ**返る（`HubServerMsg` の `error` / `ROOM_NOT_FOUND`）。
   * 在るときの肯定は返さない —— 無音で足りるうえ、確定的な肯定は開示が大きい。
   */
  | { command: "room.check"; code: string };
```

同じファイルの `HubCommandSchema` の配列末尾へ追加する。

```ts
  v.object({
    command: v.literal("room.check"),
    code: nonEmptyString,
  }),
```

- [ ] **手順 4: 通ることを確かめる**

実行: `cd packages/room-core && pnpm vitest run tests/wire.test.ts`
期待: PASS（全件）

- [ ] **手順 5: 壊して赤を見る（DoD 3）**

`nonEmptyString` を `v.string()` へ一時的に替え、「空のコードが落ちる」が FAIL することを確かめて戻す。
戻した後に `git diff --exit-code packages/room-core/src/wire.ts` が何も出さないことを見る。

- [ ] **手順 6: コミットする**

```bash
git add packages/room-core/src/wire.ts packages/room-core/tests/wire.test.ts
git commit -m "feat: ハブの wire にルームの生死の照会を足す（#274）"
```

---

### Task 2: サーバーの照会 `checkRoom`

**ファイル**
- 新設: `apps/tasuki-sync/src/application/check-room.ts`
- テスト: `apps/tasuki-sync/test/check-room.test.ts`

**インターフェース**
- 利用: `RoomStore`（`../ports/room-store.js`）の `get`、`RateLimitGate`
  （`./rate-limit-gate.js`）の `shouldReject` / `consume`、`ErrorCode`（`@tasuki/timer-core`）
- 産出: `checkRoom(deps: CheckRoomDeps, input: CheckRoomInput): Result<undefined, ErrorCode>`、
  `CheckRoomDeps { store; rateLimitGate }`、`CheckRoomInput { connId: string; code: string }`。
  Task 3 が `hub-handlers.ts` から呼ぶ

- [ ] **手順 1: 落ちるテストを書く**

`apps/tasuki-sync/test/check-room.test.ts` を新規作成する。

```ts
/**
 * ルームの生死だけを返す照会（#274）。
 *
 * **poker の `check-room` とは関門の扱いが逆である**（設計正本 D2）。
 * ここは合言葉の関門を通さない。通すと、合言葉を持つ正規の招待客に
 * 「存在しない」と答えることになる。保護ルームでも「在る」扱いになることは
 * `test/live-ws.hub.test.ts` が実プロトコル越しに見張る。
 */
import { describe, expect, it } from "bun:test";
import { checkRoom, type CheckRoomDeps } from "../src/application/check-room.js";

/** 指定したコードだけが在るストア。`checkRoom` は値の中身を見ないので空でよい。 */
function storeWith(codes: readonly string[]): CheckRoomDeps["store"] {
  return {
    get: (code: string) => (codes.includes(code) ? ({} as never) : undefined),
  };
}

/** 残量の有無を固定し、consume の回数を数えるゲート。 */
function gate(rejects: boolean): CheckRoomDeps["rateLimitGate"] & { consumed: () => number } {
  let consumed = 0;
  return {
    shouldReject: () => rejects,
    consume: () => {
      consumed += 1;
    },
    consumed: () => consumed,
  };
}

describe("ルームの生死の照会", () => {
  it("Given 在るルーム / When 照会する / Then 何も返さない", () => {
    const g = gate(false);

    const result = checkRoom({ store: storeWith(["朝会モブ-a1b2"]), rateLimitGate: g }, {
      connId: "conn-1",
      code: "朝会モブ-a1b2",
    });

    expect(result.isOk()).toBe(true);
    // **在るときはバケツを使わない。** 正常な招待客が枠を食うと、
    // 同じ NAT の後続が弾かれる
    expect(g.consumed()).toBe(0);
  });

  it("Given 無いルーム / When 照会する / Then ROOM_NOT_FOUND を返し、バケツを消費する", () => {
    const g = gate(false);

    const result = checkRoom({ store: storeWith([]), rateLimitGate: g }, {
      connId: "conn-1",
      code: "zzzzzzzz",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("ROOM_NOT_FOUND");
    expect(g.consumed()).toBe(1);
  });

  it("Given 残量が無い / When 照会する / Then ストアを引かずに JOIN_RATE_LIMITED を返す", () => {
    // **順序が肝である**（#103 設計正本 D3）。照会してから判定すると、
    // 残量が無いときに ROOM_NOT_FOUND が返り、攻撃者はトークンを消費せずに
    // 存在確認を続けられる
    let looked = 0;
    const store: CheckRoomDeps["store"] = {
      get: () => {
        looked += 1;
        return undefined;
      },
    };

    const result = checkRoom({ store, rateLimitGate: gate(true) }, {
      connId: "conn-1",
      code: "zzzzzzzz",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("JOIN_RATE_LIMITED");
    expect(looked, "残量が無いのにストアを引いた").toBe(0);
  });
});
```

- [ ] **手順 2: 落ちることを確かめる**

実行: `cd apps/tasuki-sync && bun test test/check-room.test.ts`
期待: FAIL（`check-room.js` が存在しない）

- [ ] **手順 3: 実装する**

`apps/tasuki-sync/src/application/check-room.ts` を新規作成する。

```ts
/**
 * ルームの生死だけを返す（#274・ハブ専用）。**wire を知らない。**
 *
 * ## poker の `check-room` と関門の扱いが逆である
 *
 * poker の `handleCheckRoom`（`poker-handlers.ts`）は合言葉の関門（`mayEnter`）を通す。
 * **poker の wire には合言葉の項目が無く**、保護ルームへの poker からの新規参加は
 * そもそも成立しないためで、通さないと「入れないルームが実在するか」を教える神託になる
 * （`docs/adr/0011` 決定2 の #95 S5b 追記）。
 *
 * **ハブは通さない。** ハブは合言葉を送れるので、保護ルームは「入れるルーム」である。
 * ここで関門を通すと、**合言葉を持つ正規の招待客に「存在しない」と答える**。
 * 開示の水準はハブの `room.join` と同じに揃う —— あちらは保護ルームへ
 * `PASSPHRASE_REQUIRED` を返しており、存在を既に開示している。
 *
 * **この 2 つを「揃っていない」として揃えてはならない。** 入口の能力が違うので、
 * 生死の問いに対する正しい答えが違う。
 *
 * ## 在るときは何も返さない
 *
 * 無いときだけ応える（設計正本 D3）。無音の意味は「生きている」ではなく
 * **「生きている、または拒否された」**である（#103 以来の約束）。
 *
 * ## 読み取りだけである
 *
 * 名簿に触らない。接続を付けない・ツール状態を作らない・ラウンドを作らない。
 * 読み取りの問い合わせで状態が生まれると、誰も入っていないルームに中身が積み上がる。
 */
import { err, ok, type Result } from "neverthrow";
import type { ErrorCode } from "@tasuki/timer-core";
import type { RoomStore } from "../ports/room-store.js";
import type { RateLimitGate } from "./rate-limit-gate.js";

export interface CheckRoomDeps {
  /** **読むだけ。** 書ける口を渡さないことで、この関数が状態を作らないことを型で示す。 */
  store: Pick<RoomStore, "get">;
  rateLimitGate: Pick<RateLimitGate, "shouldReject" | "consume">;
}

export interface CheckRoomInput {
  connId: string;
  code: string;
}

export function checkRoom(deps: CheckRoomDeps, input: CheckRoomInput): Result<undefined, ErrorCode> {
  const { store, rateLimitGate } = deps;

  // レート制限に渡すのは単調時計（`Clock.now()` の壁時計ではない・#103 設計正本 D8）。
  const rateNow = performance.now();

  // **ルームを照会する前に判定する**（#103 設計正本 D3）。照会してから判定すると、
  // 残量が無いときに ROOM_NOT_FOUND が返り、攻撃者はトークンを消費せずに
  // 存在確認を続けられる。
  if (rateLimitGate.shouldReject(input.connId, rateNow)) return err("JOIN_RATE_LIMITED");

  if (store.get(input.code) === undefined) {
    // 失敗が確定したときだけ積む。**在るときは積まない** ——
    // 正常な招待客が枠を食うと、同じ NAT の後続が弾かれる。
    rateLimitGate.consume(input.connId, rateNow);
    return err("ROOM_NOT_FOUND");
  }

  return ok(undefined);
}
```

- [ ] **手順 4: 通ることを確かめる**

実行: `cd apps/tasuki-sync && bun test test/check-room.test.ts`
期待: PASS（3 件）

- [ ] **手順 5: 壊して赤を見る（DoD 3）**

判定と照会の順序を入れ替え（`shouldReject` の行を `store.get` の後ろへ移す）、
3 件目が FAIL することを確かめて戻す。戻した後に `git status --porcelain` が空であることを見る。

- [ ] **手順 6: コミットする**

```bash
git add apps/tasuki-sync/src/application/check-room.ts apps/tasuki-sync/test/check-room.test.ts
git commit -m "feat: ハブ専用のルーム生死照会を足す（#274）"
```

---

### Task 3: ハブの入口へ結線し、実プロトコルで確かめる

**ファイル**
- 変更: `apps/tasuki-sync/src/application/hub-handlers.ts`
- 変更: `apps/tasuki-sync/src/application/poker-handlers.ts`（`handleCheckRoom` の doc コメントのみ）
- テスト: `apps/tasuki-sync/test/live-ws.hub.test.ts`

**インターフェース**
- 利用: Task 2 の `checkRoom` / `CheckRoomDeps`、Task 1 の `room.check`
- 産出: ハブの接続が `{ command: "room.check", code }` を送れる。
  無ければ `{ type: "error", code: "ROOM_NOT_FOUND", message }`、在れば無音

- [ ] **手順 1: 落ちるテストを書く**

`apps/tasuki-sync/test/live-ws.hub.test.ts` の `describe("ハブの入口（#95 S5a）", ...)` の中、
末尾へ 3 件を追加する。

```ts
  it("Given 在らぬルームコード / When ハブから生死を尋ねる / Then 見つからないと返る（#274）", async () => {
    const hub = await server.connectHub("asker");

    hub.send({ command: "room.check", code: "zzzzzzzz" });

    const reply = await hub.take((m) => m.type === "error", "照会への応答");
    if (reply.type !== "error") throw new Error("error ではない");
    expect(reply.code).toBe("ROOM_NOT_FOUND");
  });

  it("Given 在るルーム / When ハブから生死を尋ねる / Then 何も返らない（#274）", async () => {
    // Given: ハブでルームを作る（作成者は別の接続に居る）
    const owner = await server.connectHub("owner");
    const created = await hubCreate(owner, "朝会モブ", "あや");
    await owner.take((m) => m.type === "roster", "作成直後の roster");

    // When: まだ名乗っていない人が生死だけを尋ねる
    const hub = await server.connectHub("asker");
    hub.send({ command: "room.check", code: created.code });

    // Then: **無音である。** 肯定は返さない（設計正本 D3）。
    //       「来ないこと」は待っても証明できないので、**後から送った照会の答えが
    //       先に届くこと**で「在るルームの答えが混ざっていない」を示す
    hub.send({ command: "room.check", code: "zzzzzzzz" });
    const reply = await hub.take((m) => m.type === "error", "2 度目の照会への応答");
    if (reply.type !== "error") throw new Error("error ではない");
    expect(reply.code).toBe("ROOM_NOT_FOUND");
  });

  it("Given 合言葉で保護されたルーム / When ハブから生死を尋ねる / Then 見つからないとは言わない（#274）", async () => {
    // **この 1 件が設計正本 D2 を守っている。**
    // `mayEnter` を通すようにすると、合言葉を持つ正規の招待客に
    // 「存在しない」と答えることになる。
    //
    // Given: timer の入口でルームを作り、合言葉を掛ける
    const owner = await server.connect("owner");
    const room = await createRoom(owner, "ぬし");
    owner.send({ command: "room.passphrase.set", passphrase: "ひみつ" });
    await owner.take("snapshot");

    // When: 合言葉を知らない人が生死だけを尋ねる
    const hub = await server.connectHub("asker");
    hub.send({ command: "room.check", code: room.code });

    // Then: 無音。**在らぬコードの照会を続けて送り、その答えが先に届くことで示す**
    hub.send({ command: "room.check", code: "zzzzzzzz" });
    const reply = await hub.take((m) => m.type === "error", "2 度目の照会への応答");
    if (reply.type !== "error") throw new Error("error ではない");
    expect(reply.code).toBe("ROOM_NOT_FOUND");
  });
```

- [ ] **手順 2: 落ちることを確かめる**

実行: `cd apps/tasuki-sync && bun test test/live-ws.hub.test.ts`
期待: 追加した 3 件が FAIL（`room.check` が `handleJoin` へ落ち、
`displayName` が無いので `INVALID_COMMAND` になる）

- [ ] **手順 3: 実装する**

`apps/tasuki-sync/src/application/hub-handlers.ts` を変更する。

import へ追加:

```ts
import { checkRoom } from "./check-room.js";
```

`handleJoin` の直後へ `handleCheck` を足す:

```ts
  /**
   * ルームの生死だけを返す（#274）。**名乗る前に尋ねられる唯一の問い合わせである。**
   *
   * 規則は `check-room.ts` が持つ。**合言葉の関門は通さない**（同ファイルの理由を参照）。
   * 在るときは何も返さない —— 無音で足りるうえ、確定的な肯定は開示が大きい。
   */
  function handleCheck(connId: string, cmd: Extract<HubCommand, { command: "room.check" }>): void {
    const checked = checkRoom(deps, { connId, code: cmd.code });
    if (checked.isErr()) {
      // 文言の引き方は `handleJoin` と同じにする（言い回しの正本を 2 つ作らない）。
      const code = checked.error;
      fail(connId, code, code === "ROOM_NOT_FOUND" ? ROOM_NOT_FOUND_MESSAGE : errorMessageFor(code));
    }
  }
```

`handleMessage` の分岐を 3 つにする:

```ts
      const cmd = parsed.value;
      if (cmd.command === "room.create") {
        handleCreate(connId, cmd);
        return;
      }
      if (cmd.command === "room.check") {
        handleCheck(connId, cmd);
        return;
      }
      handleJoin(connId, cmd);
```

**同じファイルの `handleJoin` にある食い違うコメントを直す**（設計正本 D8）。
現在の次の 3 行を、

```ts
      // **文言は timer の入口と同じにする。** 選択画面から総当たりされたときに、
      // 「存在しないルーム」と「入れないルーム」を区別させない（ADR 0011）。
      // **文言の正本は 1 つ**（`@tasuki/timer-core` の文言表と `ROOM_NOT_FOUND_MESSAGE`）。
```

次へ置き換える。

```ts
      // **文言の正本は 1 つにする**（`@tasuki/timer-core` の文言表と `ROOM_NOT_FOUND_MESSAGE`）。
      // ここで書き下ろすと、同じコードに 2 つの言い回しが生まれ、片方だけが直る。
      //
      // ⚠ **ハブは「存在しないルーム」と「合言葉が要るルーム」を区別して返す。**
      // 前者は `ROOM_NOT_FOUND`、後者は `PASSPHRASE_REQUIRED` で、文言も違う。
      // ハブは合言葉を送れるので、これは意図された開示である（選択画面で合言葉を
      // 通ってからツールを選ぶのが正規の経路）。区別させないのは**合言葉を送れない
      // 入口**（poker）の側の規律であり、そちらは `room-entry.ts` が受け持つ。
      // S4a の入口ごとの門があった頃は、ここにも「区別させない」と書いてあったが、
      // 門の廃止（#95 S5b）で対象を失っていた（#274 で訂正）。
```

**`poker-handlers.ts` の `handleCheckRoom` の doc コメントへ、相手を名指しした一文を足す**
（設計正本 D2）。`「join と同じ関門を通す」(#95 S5b)` を説明している段落の末尾へ追加する。

```ts
   * ⚠ **ハブの照会（`check-room.ts` の `checkRoom`）は、これと逆に関門を通さない。**
   * ハブは合言葉を送れるので、保護ルームは「入れるルーム」である。あちらで関門を通すと
   * 合言葉を持つ正規の招待客に「存在しない」と答えることになる。**揃っていないのが正しい。**
```

- [ ] **手順 4: 通ることを確かめる**

実行: `cd apps/tasuki-sync && bun test test/live-ws.hub.test.ts`
期待: PASS（既存を含む全件）

- [ ] **手順 5: 型検査が緑に戻ることを確かめる**

⚠ **Task 1 が `HubCommand` に変種を足した時点で、このパッケージの型検査は壊れている。**
`handleMessage` の最後が `handleJoin(connId, cmd)` を呼ぶが、`cmd` は
`room.join | room.check` の union になっており、`handleJoin` は `room.join` しか受けない。
**それを直すのがこのタスクである。**

実行: `cd apps/tasuki-sync && bun run typecheck`
期待: 出力が `$ tsc --noEmit` だけ（エラー 0 件）

緑にならなければコミットせず、報告すること。

- [ ] **手順 6: 壊して赤を見る（DoD 3）**

`check-room.ts` の `store.get(...)` の判定へ関門を足す（`checkPassphrase(...)` を import して
`|| !checkPassphrase(deps.tokenStore.getPassphrase(input.code), undefined).isOk()` 相当を書く）。
**3 件目（保護ルーム）が FAIL する**ことを確かめて戻す。

⚠ 戻した後に `git status --porcelain` が空であることを見る。

- [ ] **手順 7: 変異検査（DoD 4）**

`handleMessage` の `room.check` の分岐を消し、追加した 3 件が赤くなることを確かめて戻す。

- [ ] **手順 8: コミットする**

```bash
git add apps/tasuki-sync/src/application/hub-handlers.ts \
        apps/tasuki-sync/src/application/poker-handlers.ts \
        apps/tasuki-sync/test/live-ws.hub.test.ts
git commit -m "feat: ハブの入口で生死の照会を受け付ける（#274）"
```

---

### Task 4: 不在を知らせる画面

**ファイル**
- 新設: `apps/landing/src/screens/RoomGone.tsx`
- テスト: `apps/landing/tests/hub/room-gone.test.tsx`

**インターフェース**
- 産出: `RoomGone({ code }: RoomGoneProps)`、`RoomGoneProps { readonly code: string }`。
  Task 5 が `App.tsx` から使う

- [ ] **手順 1: 落ちるテストを書く**

`apps/landing/tests/hub/room-gone.test.tsx` を新規作成する。

```tsx
/**
 * ルームが見つからないことを知らせる画面（#274）。
 *
 * **画面は表示に徹する**（`docs/adr/0015` MUST 3・`docs/adr/0019`）。
 * どちらへ落ちるかを決めるのは `hub/hub-state.ts` の `screenFor` である。
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomGone } from '../../src/screens/RoomGone.js';

describe('不在の知らせ', () => {
  it('Given 見つからないルーム / When 描く / Then 名乗りフォームが出ない', () => {
    // **これが #274 の本体である。** 名前を入れさせてから不在を告げるのをやめる
    render(<RoomGone code="朝会モブ-a1b2" />);

    // 見出しが出ていることを先に確かめる。**不在の判定だけに頼らない** ——
    // 何も描かれていない画面に対しても「フォームが無い」は緑になる
    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeTruthy();
    expect(screen.queryByLabelText('あなたの名前')).toBeNull();
    expect(screen.queryByRole('button', { name: '参加する' })).toBeNull();
  });

  it('Given 見つからないルーム / When 描く / Then どのコードかが出る', () => {
    render(<RoomGone code="朝会モブ-a1b2" />);

    expect(screen.getByText('朝会モブ-a1b2')).toBeTruthy();
  });

  it('Given 見つからないルーム / When 描く / Then 戻る道がある', () => {
    // これが無いと行き止まりになる（poker の同じ画面が持っている性質）
    render(<RoomGone code="朝会モブ-a1b2" />);

    const back = screen.getByRole('link', { name: '新しいルームを作る' });
    expect(back.getAttribute('href')).toBe('/');
  });

  it('Given 見つからないルーム / When 描く / Then 理由を断定しない', () => {
    // **玄関は入れない理由を知らない**（設計正本 D10）。終了したのか、
    // 最初から無いコードなのか、サーバーが再起動したのかを言い分けられない
    render(<RoomGone code="朝会モブ-a1b2" />);

    expect(screen.queryByText(/終了しています/)).toBeNull();
  });

  it('Given 見つからないルーム / When 描く / Then 端末の記録は見られる', () => {
    // ルームに入っていなくても記録は見られる（撤去した旧入口の性質を保つ）
    render(<RoomGone code="朝会モブ-a1b2" />);

    expect(screen.getByRole('link', { name: '記録を見る' })).toBeTruthy();
  });
});
```

- [ ] **手順 2: 落ちることを確かめる**

実行: `cd apps/landing && pnpm vitest run tests/hub/room-gone.test.tsx`
期待: FAIL（`RoomGone.js` が存在しない）

- [ ] **手順 3: 実装する**

`apps/landing/src/screens/RoomGone.tsx` を新規作成する。

```tsx
/**
 * ルームが見つからないことを知らせる画面（#274・#76 J-1 の性質の戻し先）。
 *
 * **名乗らせない。** これが無いと、終了したルームのリンクでも参加フォームが出て、
 * 名前を入れて送信して初めて「見つかりません」に変わる。
 *
 * **理由を断定しない。** 玄関は入れない理由を知らない —— 終了したのか、最初から
 * 無いコードなのか（打ち間違い・壊れた転送）、同期サーバーが再起動したのか
 * （本番は揮発インメモリ）を言い分けられない。文言は既存の 3 つ
 * （`ROOM_NOT_FOUND_MESSAGE` / poker / timer）と揃えて「見つかりません」にしてある。
 *
 * **画面は表示に徹する**（`docs/adr/0015` MUST 3・`docs/adr/0019`）。
 * どちらへ落ちるかを決めるのは `hub/hub-state.ts` の `screenFor` である。
 */
import { HistoryLink } from './HistoryLink.js';

export interface RoomGoneProps {
  /** 見つからなかったルームコード。**落とさない** —— どのリンクが死んでいるかを示す。 */
  readonly code: string;
}

export function RoomGone({ code }: RoomGoneProps) {
  return (
    <main className="page landing">
      <header className="landing-hero">
        <h1 className="wordmark">Tasuki</h1>
        <p className="tagline">
          <span className="hub-room-code">{code}</span>
        </p>
      </header>

      {/* ⚠ **見出しに `role` を付けない。** ARIA の `role` は暗黙の役割を**上書きする**ので、
          `<h2 role="status">` にすると**その要素は見出しでなくなる**（`getByRole('heading')`
          が見つけられず、支援技術の見出し一覧からも消える）。
          知らせは下の段落が持つ（`Resuming.tsx` と同じ形）。 */}
      <h2 className="hub-section-title">ルームが見つかりません</h2>

      {/* `role="alert"` にしない —— 画面そのものが替わっており、これは
          「いま起きたこと」の割り込みではなく、この画面の主題である。 */}
      <p className="hub-notice" role="status">
        終了したか、URL が正しくない可能性があります。
      </p>

      {/* **戻る道。** これが無いと行き止まりになる。 */}
      <a className="hub-submit" href="/">
        新しいルームを作る
      </a>

      {/* ルームに入っていなくても端末の記録は見られる（旧入口の性質を保つ）。 */}
      <HistoryLink roomCode={null} />
    </main>
  );
}
```

⚠ **見出しは見出しのままにする。** `role` を付けて上書きすると
`getByRole('heading', ...)` が見つけられなくなり、テストも E2E も落ちる。

- [ ] **手順 4: 通ることを確かめる**

実行: `cd apps/landing && pnpm vitest run tests/hub/room-gone.test.tsx`
期待: PASS（5 件）

- [ ] **手順 5: 壊して赤を見る（DoD 3）**

見出しを「このルームは終了しています」へ替え、「理由を断定しない」と
「名乗りフォームが出ない」（見出しの名前で引いている）が FAIL することを確かめて戻す。

- [ ] **手順 6: コミットする**

```bash
git add apps/landing/src/screens/RoomGone.tsx apps/landing/tests/hub/room-gone.test.tsx
git commit -m "feat: ルームが見つからないことを知らせる画面を足す（#274）"
```

---

### Task 5: 玄関の状態と照会

⚠ **このタスクは 3 ファイルを 1 つのコミットに載せる。** `screenFor` の入力に必須の
項目を足すと、呼び出し元の `App.tsx` が同時に直らなければ型検査が壊れる。さらに
`App.tsx` の `case 'gone'` は Task 4 の `RoomGone` が要る。**分けられない。**

**ファイル**
- 変更: `apps/landing/src/hub/hub-state.ts`
- 変更: `apps/landing/src/hub/use-hub-sync.ts`
- 変更: `apps/landing/src/App.tsx`
- テスト: `apps/landing/tests/hub/hub-state.test.ts`
- テスト: `apps/landing/tests/hub/use-hub-sync.test.tsx`

**インターフェース**
- 利用: Task 1 の `room.check`、Task 4 の `RoomGone`（`RoomGoneProps { code: string }`）
- 産出: `HubScreen` に `'gone'`、`HubScreenInput` に `readonly gone: boolean`、
  `HubSync` に `readonly gone: boolean`、フック内の `checkIfNeeded()`。
  Task 6 が `checkIfNeeded` と `JOIN_RATE_LIMITED` の分岐を使う

#### 画面判定（`hub-state.ts`）

- [ ] **手順 1: 落ちるテストを書く**

`apps/landing/tests/hub/hub-state.test.ts` の末尾へ追加する。
**既存の呼び出しにも `gone: false` を足す必要がある**（型が増えるため）。まず既存の
`screenFor({ code: ..., joined: ..., resuming: ... })` を全て
`screenFor({ ..., gone: false })` へ書き換えてから、次を追加する。

```ts
/**
 * 見つからないルームの参加用 URL（#274）。
 *
 * **名乗りフォームを出さない。** 出すと、送信して初めて不在が分かる。
 */
describe("ルームが見つからないとき", () => {
  it("Given 未参加で見つからない / When 画面を決める / Then 不在の画面になる", () => {
    expect(screenFor({ code: '朝会モブ-a1b2', joined: false, resuming: false, gone: true })).toBe(
      'gone',
    );
  });

  it("Given 復帰の返事待ちのまま見つからないと分かった / When 画面を決める / Then 不在の画面になる", () => {
    // 経路2。待ちが降りる前に判定が来ても、名乗りフォームへは落とさない
    expect(screenFor({ code: '朝会モブ-a1b2', joined: false, resuming: true, gone: true })).toBe(
      'gone',
    );
  });

  it("Given 参加済みなのに見つからない印が立っている / When 画面を決める / Then 選択画面のまま", () => {
    // **`joined` を先に見る。** ここを逆にすると「参加した後にルームが消えた」場合の
    // 選択画面の振る舞いまで変わる。それは #274 の射程外である
    expect(screenFor({ code: '朝会モブ-a1b2', joined: true, resuming: false, gone: true })).toBe(
      'choice',
    );
  });

  it("Given コードが無い / When 画面を決める / Then 作成のまま", () => {
    // どのルームの不在かを言えないので、不在の画面は出さない
    expect(screenFor({ code: null, joined: false, resuming: false, gone: true })).toBe('create');
  });
});
```

- [ ] **手順 2: 落ちることを確かめる**

実行: `cd apps/landing && pnpm vitest run tests/hub/hub-state.test.ts`
期待: FAIL（`gone` が `HubScreenInput` に無く、型検査とアサーションの両方で落ちる）

- [ ] **手順 3: 実装する**

`apps/landing/src/hub/hub-state.ts` を変更する。冒頭の表へ 1 行足す。

```ts
 * | `/?room=CODE` | 見つからない（消えた・最初から無い） | **不在の知らせ** |
```

型と関数を変える。

```ts
export type HubScreen = 'create' | 'join' | 'choice' | 'resuming' | 'gone';

export interface HubScreenInput {
  readonly code: string | null;
  readonly joined: boolean;
  readonly resuming: boolean;
  /**
   * そのルームが見つからないと分かったか（#274）。
   *
   * **名乗る前に分かることがある。** 復帰の組を持たない人には、玄関が接続と同時に
   * 生死を尋ねる（`use-hub-sync.ts`）。組を持つ人は `room.join` の答えで同じ印が立つ。
   */
  readonly gone: boolean;
}

export function screenFor({ code, joined, resuming, gone }: HubScreenInput): HubScreen {
  if (code === null) return 'create';
  if (joined) return 'choice';
  // **`joined` の後に見る。** 前に置くと「参加した後にルームが消えた」場合の
  // 選択画面の振る舞いまで変わり、#274 の射程を超える。
  //
  // **`resuming` より前に見る。** 復帰の返事が `ROOM_NOT_FOUND` だった人は、
  // 待ちが降りる前にここへ来る。後ろに置くと読み込み中の表示から抜けられない。
  if (gone) return 'gone';
  return resuming ? 'resuming' : 'join';
}
```

- [ ] **手順 4: 通ることを確かめる**

実行: `cd apps/landing && pnpm vitest run tests/hub/hub-state.test.ts`
期待: PASS（全件）

#### 照会と画面の結線（`use-hub-sync.ts` ＋ `App.tsx`）

- [ ] **手順 5: 落ちるテストを書く**

`apps/landing/tests/hub/use-hub-sync.test.tsx` の末尾へ追加する。
先頭の import に `saveResumeIdentity` を足すこと。

```tsx
import { saveResumeIdentity } from '@tasuki/sync-client';
```

```tsx
/**
 * 名乗る前にルームの不在を知る（#274・#76 J-1）。
 */
describe('ルームの生死の照会', () => {
  /** `?room=` 付きで玄関を開いた状態にする。 */
  const openWithRoom = (code: string): void => {
    window.history.replaceState(null, '', `/?room=${encodeURIComponent(code)}`);
  };

  /** 送られた `room.check` の件数。 */
  const checksSent = (): number =>
    socket().sent.filter((raw) => JSON.parse(raw).command === 'room.check').length;

  it('Given 復帰の組が無い参加用 URL / When 玄関を開く / Then 生死の照会が送られる', () => {
    openWithRoom('朝会モブ-a1b2');

    render(<App />);
    act(() => socket().open());

    expect(checksSent()).toBe(1);
  });

  it('Given 復帰の組がある参加用 URL / When 玄関を開く / Then 照会は送られない', () => {
    // **送るとバケツを二重に使うだけ**。この人には room.join が同じ答えを返す
    openWithRoom('朝会モブ-a1b2');
    saveResumeIdentity({
      code: '朝会モブ-a1b2',
      participantId: 'p1',
      resumeToken: 't1',
      displayName: 'あや',
    });

    render(<App />);
    act(() => socket().open());

    expect(checksSent()).toBe(0);
  });

  it('Given 照会を送った / When 見つからないと返る / Then 名乗りフォームを出さない（経路1）', () => {
    openWithRoom('朝会モブ-a1b2');
    render(<App />);
    act(() => socket().open());

    act(() =>
      socket().deliver({
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: '指定されたルームコードが見つかりません',
      }),
    );

    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeTruthy();
    expect(screen.queryByLabelText('あなたの名前')).toBeNull();
  });

  it('Given 復帰の組で入り直した / When 見つからないと返る / Then 名乗りフォームを出さない（経路2）', () => {
    // **Issue 本文が触れていない経路。** 症状は経路1 と同じである
    openWithRoom('朝会モブ-a1b2');
    saveResumeIdentity({
      code: '朝会モブ-a1b2',
      participantId: 'p1',
      resumeToken: 't1',
      displayName: 'あや',
    });
    render(<App />);
    act(() => socket().open());

    act(() =>
      socket().deliver({
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: '指定されたルームコードが見つかりません',
      }),
    );

    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeTruthy();
    expect(screen.queryByLabelText('あなたの名前')).toBeNull();
  });

  it('Given 照会を送った / When 混雑で弾かれる / Then 不在とは言わない', () => {
    // 無音の意味は「生きている、または拒否された」。**断定しない側にしか外れない**
    openWithRoom('朝会モブ-a1b2');
    render(<App />);
    act(() => socket().open());

    act(() =>
      socket().deliver({
        type: 'error',
        code: 'JOIN_RATE_LIMITED',
        message: '試行が多すぎます。しばらくしてからお試しください',
      }),
    );

    expect(screen.queryByRole('heading', { name: 'ルームが見つかりません' })).toBeNull();
  });
});
```

- [ ] **手順 6: 落ちることを確かめる**

実行: `cd apps/landing && pnpm vitest run tests/hub/use-hub-sync.test.tsx`
期待: 追加した 5 件のうち、照会を数える 2 件と画面を見る 2 件が FAIL
（「混雑で弾かれる」は現状でも緑になりうる。他の赤を根拠に進む）

- [ ] **手順 7: 実装する**

`apps/landing/src/hub/use-hub-sync.ts` を変更する。

`HubSync` へ追加:

```ts
  /**
   * そのルームが見つからないと分かったか（#274）。
   *
   * **名乗る前に立つことがある。** 復帰の組を持たない人には、接続と同時に
   * 生死を尋ねている。組を持つ人は `room.join` の答えで同じ印が立つ。
   */
  readonly gone: boolean;
```

状態を足す:

```ts
  const [gone, setGone] = useState(false);
```

`resumeIfPossible` の直後へ、照会を送る関数を足す:

```ts
  /**
   * ルームの生死だけを尋ねる（#274）。**復帰の組を持たない人にだけ送る。**
   *
   * 組を持つ人には `room.join` が同じ答えを返すので、送るとバケツを二重に使うだけである
   * （レート制限は IP 単位で、同じ NAT の利用者が枠を共有する）。
   */
  const checkIfNeeded = useCallback(() => {
    if (initialCode === null) return;
    if (loadResumeIdentity(initialCode) !== null) return;
    send({ command: 'room.check', code: initialCode });
  }, [initialCode, send]);
```

`onMessage` の `ROOM_NOT_FOUND` の分岐を差し替える:

```ts
        if (msg.code === 'ROOM_NOT_FOUND' && codeRef.current !== null) {
          // **保存済みの組で入れなかったら捨てる。** 残すと、消えたルームへ
          // 毎回入り直そうとして参加画面に戻れない（poker の clearIdentity と同じ扱い）。
          clearResumeIdentity(codeRef.current);
          // **名乗りフォームを出さない**（#274・#76 J-1）。照会の答えでも
          // 入室の答えでも、行き先は同じ画面である。
          setGone(true);
          // ここで返す。`error` を埋めると、不在の画面と参加画面用の文言が
          // 同じことを 2 通りの言い方で出すことになる。
          return;
        }
```

`room.created` / `room.joined` の分岐へ 1 行足す（他の初期化と揃える）:

```ts
          setGone(false);
```

接続の `useEffect` の中、読み込み時の復帰の直後へ照会を足す:

```ts
    // 読み込み時の復帰（R16）。同じ端末・同じルームなら名乗りを求めない。
    const saved = initialCode === null ? null : loadResumeIdentity(initialCode);
    if (saved !== null) {
      lastJoinRef.current = { displayName: saved.displayName };
      resumeIfPossible();
    }
    // **組が無い人には生死を尋ねる**（#274）。名乗る前に不在を知らせるため。
    checkIfNeeded();
```

`onReconnected` へも足す:

```ts
      onReconnected: () => {
        // 切断中に名簿が変わっているので、入り直して新しい名簿を受け取る。
        resumeIfPossible();
        // **切断中にルームが終わっていることがある。** 名乗りフォームの前で
        // 待っている人はそれを知らないので、尋ね直す（#274）。
        checkIfNeeded();
      },
```

`useEffect` の依存配列へ `checkIfNeeded` を足す。戻り値のオブジェクトへ `gone` を足す。

`apps/landing/src/App.tsx` を変更する。import へ `RoomGone` を足し、`screenFor` の呼び出しへ
`gone: hub.gone` を渡し、`case 'gone':` を足す。

```tsx
    case 'gone':
      // 見つからないルームの参加用 URL（#274）。**名乗らせない。**
      // 告知（`departure`）はここでは出さない —— 退出の告知と不在の告知を
      // 並べると冗長になる（`Resuming` と同じ扱い）。
      return <RoomGone code={hub.code ?? ''} />;
```

- [ ] **手順 8: 通ることを確かめる**

実行: `cd apps/landing && pnpm vitest run tests/hub/`
期待: PASS（既存を含む全件）

#### 壊して確かめる

- [ ] **手順 9: 壊して赤を見る その1（画面判定・DoD 3）**

`if (gone) return 'gone';` を `if (joined) return 'choice';` の前へ移し、
「参加済みなのに見つからない印」が FAIL することを確かめて戻す。

- [ ] **手順 10: 壊して赤を見る その2（照会・DoD 3）**

`checkIfNeeded` の `loadResumeIdentity(initialCode) !== null` の判定を外し、
「復帰の組がある参加用 URL では照会が送られない」が FAIL することを確かめて戻す。

- [ ] **手順 11: 変異検査（DoD 4）**

`setGone(true)` を消し、経路1・経路2 の 2 件が赤くなることを確かめて戻す。
⚠ 戻した後に `git status --porcelain` が空であることを見る。

- [ ] **手順 12: コミットする**

```bash
git add apps/landing/src/hub/hub-state.ts apps/landing/src/hub/use-hub-sync.ts \
        apps/landing/src/App.tsx \
        apps/landing/tests/hub/hub-state.test.ts apps/landing/tests/hub/use-hub-sync.test.tsx
git commit -m "feat: 玄関が名乗る前にルームの生死を尋ねるようにする（#274）"
```

---

### Task 6: 照会がレート制限で弾かれたら待ってから送り直す

**ファイル**
- 変更: `apps/landing/src/hub/use-hub-sync.ts`
- テスト: `apps/landing/tests/hub/use-hub-sync.test.tsx`

**インターフェース**
- 利用: Task 5 の `checkIfNeeded` と `JOIN_RATE_LIMITED` の分岐、
  `joinRetryDelayMs`（既に import 済み）

- [ ] **手順 1: 落ちるテストを書く**

Task 5 で足した `describe('ルームの生死の照会', ...)` の末尾へ追加する。

```tsx
  it('Given 照会が混雑で弾かれた / When 待ち時間が過ぎる / Then 照会を送り直す', () => {
    // **送り直さないと性質が効かない。** バケツが枯れている間、
    // 消えたルームのリンクを踏んだ人は名乗りフォームを見続ける。
    // poker は同じことを既にしている（`RoomPage.tsx` の再試行）
    vi.useFakeTimers();
    try {
      openWithRoom('朝会モブ-a1b2');
      render(<App />);
      act(() => socket().open());
      expect(checksSent(), '最初の照会').toBe(1);

      act(() =>
        socket().deliver({
          type: 'error',
          code: 'JOIN_RATE_LIMITED',
          message: '試行が多すぎます。しばらくしてからお試しください',
        }),
      );

      // **即時には送らない。** 即時に送り直すと、枯れたバケツを叩き続ける
      expect(checksSent(), '弾かれた直後').toBe(1);

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(checksSent(), '待った後').toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **手順 2: 落ちることを確かめる**

実行: `cd apps/landing && pnpm vitest run tests/hub/use-hub-sync.test.tsx -t '送り直す'`
期待: FAIL（「待った後」が 1 のまま。現状は `setError` で終わる）

- [ ] **手順 3: 実装する**

`use-hub-sync.ts` の `JOIN_RATE_LIMITED` の分岐を差し替える。

```ts
        if (msg.code === 'JOIN_RATE_LIMITED') {
          // 混雑で弾かれた人を、操作なしで先へ運ぶ（#147 と同じ方針）。
          const attempt = (retryRef.current += 1);
          const delay = joinRetryDelayMs(attempt);
          const last = lastJoinRef.current;
          const target = codeRef.current;
          if (delay === null || target === null) {
            setError(msg.message);
            return;
          }
          setError(msg.message);
          setTimeout(() => {
            // **`last === null` は「まだ名乗っていない」** ＝ 送ったのは照会だけである
            // （#274）。エラーのフレームに相関の手がかりが無いので、送った側の状態で
            // 見分ける。経路2 の人は復帰を送る前に `lastJoinRef` が埋まっている。
            if (last === null) {
              send({ command: 'room.check', code: target });
              return;
            }
            send({
              command: 'room.join',
              code: target,
              displayName: last.displayName,
              ...(last.passphrase !== undefined ? { passphrase: last.passphrase } : {}),
            });
          }, delay);
          return;
        }
```

`retryRef` の doc コメントを更新する。

```ts
  /**
   * 混雑で弾かれたときの再試行回数。**入室と照会で共有する。**
   *
   * 照会（名乗る前）と入室（名乗った後）が同時に飛ぶことはなく、`joinRoom` が
   * 呼ばれた時点で 0 に戻るため、1 本で足りる。
   */
  const retryRef = useRef(0);
```

- [ ] **手順 4: 通ることを確かめる**

実行: `cd apps/landing && pnpm vitest run tests/hub/`
期待: PASS（全件）

- [ ] **手順 5: 壊して赤を見る（DoD 3）**

`setTimeout` を外して即時に送るようにし、「弾かれた直後」が FAIL することを確かめて戻す。

- [ ] **手順 6: コミットする**

```bash
git add apps/landing/src/hub/use-hub-sync.ts apps/landing/tests/hub/use-hub-sync.test.tsx
git commit -m "fix: 混雑で弾かれた生死の照会を待ってから送り直す（#274）"
```

---

### Task 7: 実画面で確かめる（E2E）

**ファイル**
- 変更: `e2e/specs/landing.spec.ts`

**インターフェース**
- 利用: Task 1〜6 の全て。実サーバー・実ブラウザを通る

- [ ] **手順 1: 落ちるテストを書く**

⚠ **訂正（2026-09-18・実施中に判明）**: 下のコード例の `test(..., { tag: '@core' }, ...)` は
**このリポジトリが明文で禁じている形**である。`e2e/tests/spec-tags.test.ts` が
「タイトルに現れないので検査からは『タグ無し』に見え、それでいて `--grep` は選ぶ ——
**本検査が空振りしたまま本番へ流れる**」として弾く。
**正しい形は `test.describe('@core 見つからないルームの参加用 URL', ...)`**（タイトルへ埋め込む）。

`e2e/specs/landing.spec.ts` の末尾へ追加する。

```ts
/**
 * 見つからないルームの参加用 URL が行き止まりにならない（#274・#76 J-1）。
 *
 * 壊れていた頃は、終了したルームのリンクでも参加フォームが出て、**名前を入れて
 * 送信して初めて**「見つかりません」に変わった。
 *
 * **ルームを消す必要はない。** 存在しなかったコードで、サーバーは同じ経路
 * （`store.get` → `undefined`）を通る。
 *
 * ⚠ **このシナリオは入室の枠を 1 つ使う。** `room.check` は資源を引く前にレート判定を
 * 通り、**無かったときだけ** `consume` する。存在しないコードを指す照会は必ず
 * `ROOM_NOT_FOUND` で終わるので、そのぶんを消費する。枠は **IP 単位**で全 worker が
 * 1 つのバケツを共有している（`timer.spec.ts` の同じ注記を参照）。
 */
test.describe('見つからないルームの参加用 URL', () => {
  test('Given 存在しないルームコード / When 玄関を開く / Then 名乗らされずに知らされる', {
    tag: '@core',
  }, async ({ page }) => {
    // When: 在らぬコードの参加用 URL を開く
    await page.goto('/?room=zzzzzzzz');

    // Then その1: **見出しが出るのを先に待つ。** 待たずに「フォームが無い」だけを
    //             見ると、まだ描画されていない画面に対しても緑になる
    await expect(
      page.getByRole('heading', { name: 'ルームが見つかりません' }),
      '不在の知らせ',
    ).toBeVisible();

    // Then その2: **名乗らされない。** これが #274 の本体である
    await expect(page.getByLabel('あなたの名前'), '名乗りフォーム').toBeHidden();

    // Then その3: **戻る道がある。** これが無いと行き止まりになる
    await expect(
      page.getByRole('link', { name: '新しいルームを作る' }),
      '戻る導線',
    ).toBeVisible();
  });
});
```

- [ ] **手順 2: 落ちることを確かめる**

⚠ **ポートを 1 度に 1 本しか掴めない。** 他に `pnpm dev` が動いていないことを確かめてから走らせる。

**このタスクは Task 1〜6 の後に来るので、素の実行では緑になる。** 赤を見る手順は
手順 5（破壊検証）が受け持つ。ここでは**対照実行**として、まず緑になることを確かめる。

実行: `pnpm e2e --grep '見つからないルーム'`
期待: PASS（緑にならなければ Task 1〜6 のどこかが未完成。先へ進まない）

- [ ] **手順 3: タグの規律を確かめる**

実行: `cd e2e && pnpm vitest run tests/spec-tags.test.ts`
期待: PASS（`@core` は既存のタグ。**新しいタグを足していない**ことの確認）

- [ ] **手順 4: 通ることを確かめる**

実行: `pnpm e2e --grep '見つからないルーム'`
期待: PASS

その後、玄関まわりの回帰を確かめる。

実行: `pnpm e2e --grep '玄関|landing'`
期待: PASS（既存が壊れていないこと。§3.12 の実測どおりなら壊れない）

- [ ] **手順 5: 壊して赤を見る（DoD 3）**

`App.tsx` の `case 'gone':` を `return <JoinRoom ... />` 相当へ戻し、
このシナリオが FAIL することを確かめて戻す。

- [ ] **手順 6: コミットする**

```bash
git add e2e/specs/landing.spec.ts
git commit -m "test: 見つからないルームの参加用 URL を実画面で確かめる（#274）"
```

---

### Task 8: 規範文書を合わせる

**ファイル**
- 変更: `docs/adr/0011-threat-model-and-data-classification.md`
- 変更: `docs/superpowers/specs/2026-09-18-hub-room-check-design.md`（§5.1）
- 変更: `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md`（§5.7）
- 変更: `apps/poker-web/src/pages/RoomPage.tsx`（コメントのみ）

- [ ] **手順 1: ADR 0011 へ追補する**

⚠ **追記は文書の末尾へ置く。** 決定2 の途中へ節を差し込むと、直後の「### 決定3」が
親を変える（この repo で 2 回踏んでいる）。

文書の**いちばん最後**へ次を足す。

```markdown
## 追記（2026-09-18・#274）

**ハブの生死の照会は合言葉の関門を通さない。** 決定2 の #95 S5b 追記は
「`check-room`（生死の問い合わせ）も同じ関門を通す」としているが、**これは
合言葉を送れない入口（poker）についての規律である。**

ハブは合言葉を送れる。したがって保護ルームはハブから見て「入れるルーム」であり、
関門を通して「存在しない」と答えると、**合言葉を持つ正規の招待客に嘘をつく**。
ハブの `room.join` は既に保護ルームへ `PASSPHRASE_REQUIRED` を返して存在を開示しており、
照会の開示水準はそれと同じに揃う（新しく漏れる情報は無い）。

実装は `apps/tasuki-sync/src/application/check-room.ts`。poker の
`handleCheckRoom` と**関門の扱いが逆であることが正しい**。両方の doc コメントが
相手を名指ししてこの理由を持つ。

設計正本: `docs/superpowers/specs/2026-09-18-hub-room-check-design.md` D2。
```

- [ ] **手順 2: この設計正本の §5.1 を実装に合わせる**

⚠ **正本が実装と食い違っている。** Task 1 のレビューが拾った。
`docs/superpowers/specs/2026-09-18-hub-room-check-design.md` の §5.1 は

```ts
v.object({ command: v.literal("room.check"), code: nonEmptyString }),
```

と書いているが、実装は `v.strictObject` である（Task 1 の `63ff381`）。
**正本を読んだ次の担当者が「非 strict」を前提に組む**ので、放置しない。

その行を次へ置き換え、直後へ理由を 1 段落足すこと。

```ts
v.strictObject({ command: v.literal("room.check"), code: nonEmptyString }),
```

```markdown
**ここだけ strict にする。** 余剰フィールドを拒むのは `docs/adr/0011` 決定2 の脅威 S3 が
MUST とする規律で、poker の `ClientMessage`（`packages/poker-core/src/protocol.ts`）は
既に `v.strictObject` で揃えてある。**同じファイルの `room.create` / `room.join` が
非 strict なのは古い取り決めの名残である** —— このファイル冒頭が挙げる非 strict の理由
（サーバーが項目を足したとき、古いクライアントがフレームごと捨てるのを避ける）は
**サーバーから画面へ送る `HubServerMsg` の話**であって、画面からサーバーへ送るコマンドには
当てはまらない。新設のこのコマンドには古いクライアントが居ないので、厳しい側から始める。
**あの 2 つを strict にするのは #274 の射程外**（申し送り）。
```

- [ ] **手順 3: #95 設計正本の §5.7 へ 1 行足す**

`docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md` の §5.7 の画面の表へ、
既存の行と同じ体裁で追加する（**表の他の行は触らない**）。

```markdown
| `/?room=CODE` | 見つからない | **不在の知らせ**（#274） |
```

- [ ] **手順 4: `RoomPage.tsx` のコメントを直す**

`apps/poker-web/src/pages/RoomPage.tsx` の次の 3 行を、

```ts
  // **ルームの消滅が分かるのは名乗った後である。** 玄関は先に名乗らせてから参加を試み、
  // 失敗して初めて不在を告げる（`apps/landing/src/screens/JoinRoom.tsx`）。
  // 「名前を入れる前に知らせる」という #76 J-1 の性質は、いまハブ側の宿題である（Issue #274）。
```

次へ置き換える。⚠ **完了形で書かない**（規範が現況について嘘をつくのを避ける）。

```ts
  // **不在は名乗る前に分かる。** 玄関は、復帰の組を持たない人のために接続と同時に
  // ルームの生死を尋ね、見つからなければ名乗りフォームを出さずに知らせる
  // （`apps/landing/src/hub/use-hub-sync.ts` と `screens/RoomGone.tsx`・#76 J-1）。
  // ここへ送り返した人は、その判定を玄関側で受ける。
```

- [ ] **手順 5: 文書の検査を走らせる**

実行: `node scripts/check-links.mjs`（CI の `docs` ジョブが走らせているのと同じもの）
期待: PASS

⚠ **リンク検査は `git ls-files` を見る。** 新規ファイルは `git add` するまで走査されない。
Task 8 に入る前に、これまでのタスクが全てコミット済みであることを確かめる。

- [ ] **手順 6: コミットする**

```bash
git add docs/adr/0011-threat-model-and-data-classification.md \
        docs/superpowers/specs/2026-09-18-hub-room-check-design.md \
        docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md \
        apps/poker-web/src/pages/RoomPage.tsx
git commit -m "docs: ハブの生死照会が関門を通さない理由を規範へ書く（#274）"
```

---

## 仕上げ

- [ ] **全部を通す**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

⚠ **`pnpm test` には scripts の自己テストと `pnpm audit` が入っていない。**
検査や許可表を触っていれば、押す前にそれらも回す。

- [ ] **実経路で確かめる（DoD 5）**

`pnpm dev` を起動し、`http://localhost:5175/?room=zzzzzzzz` を開く。
⚠ **入口は :5175 だけ。** :5173 / :5174 を直接開くと再読み込みが止まらなくなる。
⚠ **終わったらポートを解放する**（起動しっぱなしにすると利用者の `pnpm dev` を潰す）。

見るもの: 名乗りフォームが出ないこと・見出し・戻る道・`RoomGone` の `role` の読み上げが
不自然でないこと（Task 4 手順 3 の ⚠）。

- [ ] **敵対的レビューを回す**

`/code-review` を PR 番号を明示して回す。
⚠ **worktree で作った PR は番号を明示する**（宛先を間違えたレビューが別 PR を検証した事故がある）。
⚠ **採点が走っている間に直さない**（実在した指摘が「もう直っている」を理由に 0 点になる）。

- [ ] **PR を作る**

DoD 8 項目を PR 本文へ転記し、各項目に実行結果か「該当なし」を明記する。
⚠ **閉鎖キーワード（`Closes #274`）を地の文へ書かない。** squash マージで勝手に閉じる。
