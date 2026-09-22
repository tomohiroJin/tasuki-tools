# ルームを離れたあとの行き先と、最後のドライバーの退出（#290）実装計画

> **実行者へ**: 各ステップはチェックボックス（`- [ ]`）で進捗を追う。
> 実行方式は `superpowers:subagent-driven-development` か `superpowers:executing-plans` を使う。

**Goal**: ルームを離れる 3 つの経路（退出・追い出し・終了後）を 1 つの考え方で揃え、
最後のドライバーでも退出が成立するようにする。

**Architecture**: サーバーは「輪の最後の席が抜けるなら、見学者を繰り上げてから外す」。
tool は行き先を分岐せず常に `/?room=CODE&left=<reason>` へ送り、**ルームの生死は玄関が
サーバーへ尋ねて判定する**（#274 の仕組みに乗る）。wire は変えない。

**Tech Stack**: TypeScript / React 19 / Vitest（web・landing）/ `bun test`（tasuki-sync）/ Playwright（E2E）

**Spec**: [`docs/superpowers/specs/2026-09-22-leaving-a-room-design.md`](../specs/2026-09-22-leaving-a-room-design.md)
—— **計画は設計正本に対する議論なので、実行者は両方を読むこと。**

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 繰り上げ先の選択を純粋関数に切り出し、Red → Green で書く |
| II. 技術選定は ADR を通す | 該当なし | 新しい依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | 状態の保持方式に触れない（既存の store/evolve をそのまま通す） |
| IV. 境界の型安全 | 該当なし | **wire を変えない。** スキーマにも境界検証にも触れない |
| V. 実画面検証 | 通過 | Task 9 で玄関から 2 人で通す。アサーションの前に探索を 1 回走らせる |
| VI. 依存は内向き | 通過 | 純粋関数は `apps/tasuki-sync/src/application/` に置く。domain（`timer-core`）へ依存を足さない |
| VII. 検査は壊して確かめる | 通過 | Task 9 で変異検査。既存パッチの当たり判定を先に見る |
| VIII. 記録が正本 | 通過 | 決定は設計正本、退出の表は `docs/timer/ARCHITECTURE.md` を同じ PR で更新する |
| IX. 小さく回す | 通過 | PR 1 本。**デプロイは伴わない**（利用者の承認を得て別途） |
| X. 抽象は実需で | 通過 | `pickPromotionTarget` は Task 2 に実需がある。前倒しの抽象を作らない |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密・個人情報を扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- **wire（`packages/protocol` / `RoomSchema`）を変えない。** 配布の窓（#276）を増やさないため
- **`evolve` と `decide.ts` を変えない。** 輪を空にしない不変条件はそのまま守る
- **`docs/plans/` 配下の既存計画書は書き換えない。** 当時の記録である
- テスト名には `@requirements` タグの作法を守る（`#290` のような裸の番号を名前に埋めない）
- GWT マーカー（Given / When / Then）を持つ既存テストの様式に合わせる（監査 SC-032）
- 数える場面では実行して数える。`| head` を付けない（SIGPIPE が `exit 0` に見える）

---

## Task 1: 繰り上げ先を選ぶ純粋関数

**Files:**
- Create: `apps/tasuki-sync/src/application/pick-promotion-target.ts`
- Test: `apps/tasuki-sync/test/pick-promotion-target.test.ts`

**Interfaces:**
- Consumes: `Participant`（`@tasuki/room-core`。`id` / `connections: ReadonlyMap` / `joinedAt` を読む）
- Produces: `pickPromotionTarget(participants, seatedIds, leavingId): Participant | null`
  —— Task 2 がこの名前と戻り値で呼ぶ

- [ ] **Step 1: 失敗するテストを書く**

`apps/tasuki-sync/test/pick-promotion-target.test.ts`:

```ts
/**
 * 輪の最後の席が抜けるときの繰り上げ先の選択（#290・D2）。
 *
 * **候補を必ず 2 人以上置く。** 1 人しか置かないと「誰でも繰り上げる」実装と
 * 区別が付かず、緑でも何も守らない。
 */
import { describe, it, expect } from "bun:test";
import { pickPromotionTarget } from "../src/application/pick-promotion-target.js";
import type { Participant } from "@tasuki/room-core";

const person = (
  id: string,
  joinedAt: number,
  online: boolean,
): Participant => ({
  id,
  displayName: id,
  connections: online ? new Map([[`c-${id}`, null]]) : new Map(),
  joinedAt,
});

describe("pickPromotionTarget", () => {
  it("在席の人を優先する（先に参加した離席者より後）", () => {
    // Given: 離席の Bob が先に、在席の Carol が後から参加している
    const participants = [person("bob", 100, false), person("carol", 200, true)];

    // When
    const picked = pickPromotionTarget(participants, new Set(), "alice");

    // Then: joinedAt では Bob が先だが、在席の Carol が選ばれる
    expect(picked?.id).toBe("carol");
  });

  it("在席が並ぶときは joinedAt の早い順で選ぶ", () => {
    // Given: どちらも在席で、Bob のほうが先に参加している
    const participants = [person("carol", 200, true), person("bob", 100, true)];

    // When
    const picked = pickPromotionTarget(participants, new Set(), "alice");

    // Then
    expect(picked?.id).toBe("bob");
  });

  it("全員が離席なら joinedAt の早い順で選ぶ", () => {
    // Given
    const participants = [person("carol", 200, false), person("bob", 100, false)];

    // When
    const picked = pickPromotionTarget(participants, new Set(), "alice");

    // Then
    expect(picked?.id).toBe("bob");
  });

  it("既に席を持つ人は候補にしない", () => {
    // Given: 在席の Carol は既に輪の席を持っている
    const participants = [person("bob", 100, false), person("carol", 200, true)];

    // When
    const picked = pickPromotionTarget(participants, new Set(["carol"]), "alice");

    // Then: 席を持たない Bob が選ばれる（在席優先より席の有無が先）
    expect(picked?.id).toBe("bob");
  });

  it("退出する本人は候補にしない", () => {
    // Given: 在席で最も早く参加しているのは、いま抜ける本人である
    const participants = [person("alice", 50, true), person("bob", 100, true)];

    // When
    const picked = pickPromotionTarget(participants, new Set(), "alice");

    // Then
    expect(picked?.id).toBe("bob");
  });

  it("候補が居なければ null を返す", () => {
    // Given: 名簿には抜ける本人しか居ない
    const participants = [person("alice", 50, true)];

    // When
    const picked = pickPromotionTarget(participants, new Set(), "alice");

    // Then
    expect(picked).toBeNull();
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

```bash
cd apps/tasuki-sync && corepack pnpm exec bun test test/pick-promotion-target.test.ts
```

期待: `Cannot find module '../src/application/pick-promotion-target.js'` で FAIL。

- [ ] **Step 3: 最小の実装を書く**

`apps/tasuki-sync/src/application/pick-promotion-target.ts`:

```ts
/**
 * 輪の最後の席が抜けるとき、代わりに輪へ入れる人を選ぶ（#290・D2）。
 *
 * **在席を優先する。** 離席中の人を唯一のドライバーに据えると、#276 が扱った
 * 「席は在るのに誰も居ない」状態を自分で作ることになる。同条件なら参加の早い順で、
 * 選択を決定的にする（順序が揺れるとテストも実挙動も再現しない）。
 *
 * **判定だけを持ち、状態を変えない。** 輪へ実際に入れるのは呼び出し側である
 * （`command-handlers/participant-remove.ts`）。
 */
import type { Participant } from "@tasuki/room-core";

export function pickPromotionTarget(
  participants: readonly Participant[],
  seatedIds: ReadonlySet<string>,
  leavingId: string,
): Participant | null {
  const candidates = participants.filter(
    (p) => p.id !== leavingId && !seatedIds.has(p.id),
  );
  if (candidates.length === 0) return null;
  // 在席を 0・離席を 1 とし、小さいほうを優先する。
  const presenceRank = (p: Participant): number => (p.connections.size > 0 ? 0 : 1);
  return candidates.reduce((best, p) => {
    const byPresence = presenceRank(p) - presenceRank(best);
    if (byPresence !== 0) return byPresence < 0 ? p : best;
    return p.joinedAt < best.joinedAt ? p : best;
  });
}
```

- [ ] **Step 4: 通ることを確かめる**

```bash
cd apps/tasuki-sync && corepack pnpm exec bun test test/pick-promotion-target.test.ts
```

期待: 6 件すべて PASS。

- [ ] **Step 5: コミット**

```bash
git add apps/tasuki-sync/src/application/pick-promotion-target.ts apps/tasuki-sync/test/pick-promotion-target.test.ts
git commit -m "feat: 輪の最後の席が抜けるときの繰り上げ先を選ぶ関数を足す（#290）"
```

---

## Task 2: 最後のドライバーの退出を成立させる

**Files:**
- Modify: `apps/tasuki-sync/src/application/command-handlers/participant-remove.ts:183-199`
- Modify: `apps/tasuki-sync/test/solo-leave.test.ts:274-292`（**旧挙動を固定している。書き換える**）
- Test: `apps/tasuki-sync/test/solo-leave.test.ts`（上記に追記）

**Interfaces:**
- Consumes: Task 1 の `pickPromotionTarget`
- Produces: `participant.remove` が、輪の最後の席の持ち主に対しても `ok` を返すようになる

- [ ] **Step 1: 既存テストを新しい期待へ書き換え、頭書きの場面を足す**

`apps/tasuki-sync/test/solo-leave.test.ts` の `it("実在の在室者が 1 人残るなら、rotation 最後の 1 人の退出は従来どおり拒否される", ...)`
（274-292 行）を丸ごと次へ置き換える:

```ts
  it("実在の在室者が残るなら、rotation 最後の 1 人の退出は見学者を繰り上げて成立する", async () => {
    // Given: Alice を輪から外し rotation=[Bob]・在室は Alice と Bob の 2 名にする
    await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    await handlers.handleCommand(BOB, { command: "member.add", participantId: pidOf("Bob") });
    await handlers.handleCommand(HOST, { command: "member.remove", index: 0 });
    expect(roomViewOf(store, timers, code).session.rotation).toEqual([pidOf("Bob")]);
    broadcaster.sent.length = 0;

    // When: rotation 上の最後の 1 人である Bob が自己退出する
    const result = await handlers.handleCommand(BOB, {
      command: "participant.remove", participantId: pidOf("Bob"),
    });

    // Then: 拒まれず、見学だった Alice が繰り上がって輪に 1 席残る
    expect(result.isOk()).toBe(true);
    expect(roomViewOf(store, timers, code).session.rotation).toEqual([pidOf("Alice")]);
    expect(roomViewOf(store, timers, code).participants).toHaveLength(1);
    // 自己退出なので「外された」ではない
    expect(lastError(BOB)?.code).toBe("LEFT_ROOM");
  });

  it("作成者と参加者だけのルームで、作成者が抜けられる（#290 の頭書きの場面）", async () => {
    // Given: Alice が作ったルーム（rotation=[Alice]）へ Bob が参加しただけの状態。
    // **Bob は輪に入っていない（見学）** —— これが既定であり、報告された場面である。
    await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    expect(roomViewOf(store, timers, code).session.rotation).toEqual([pidOf("Alice")]);
    broadcaster.sent.length = 0;

    // When: 作成者の Alice が「ルームから抜ける」を押す
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: pidOf("Alice"),
    });

    // Then: 成立し、Bob が繰り上がる。輪は空にならない
    expect(result.isOk()).toBe(true);
    expect(roomViewOf(store, timers, code).session.rotation).toEqual([pidOf("Bob")]);
    expect(lastError(HOST)?.code).toBe("LEFT_ROOM");
  });
```

- [ ] **Step 2: 落ちることを確かめる**

```bash
cd apps/tasuki-sync && corepack pnpm exec bun test test/solo-leave.test.ts
```

期待: 上の 2 件が FAIL（`result.isOk()` が false、`lastError` が `BelowMinMembers`）。
**他の件は PASS のままであること**（ソロ退出の破棄経路を壊していない対照）。

- [ ] **Step 3: 繰り上げを実装する**

`participant-remove.ts` の import に足す:

```ts
import { pickPromotionTarget } from "../pick-promotion-target.js";
```

183-199 行の `if (idx >= 0) { ... }` を次へ置き換える:

```ts
  if (idx >= 0) {
    // 数えるのは**席（`RotationEntry`）**であって名簿の人数ではない。守っているのは
    // 「evolve が currentIndex を決められる輪が残ること」なので、代理の席も 1 席と数える。
    //
    // **最後の 1 席でも拒まない**（#290・D1）。見学者を先に繰り上げてから外すので、
    // 輪は一瞬も空にならず、`evolveMemberRemoved` の `% 0`（NaN）に触れない。
    // 拒否を残すのは候補が居ないときの防御で、**名簿が空でない限りここへは来ない** ——
    // 退出者が唯一の席を持つなら、残る名簿の全員が見学だからである。
    let working = { session: timer.session, clock: timer.clock };
    if (timer.session.rotation.length <= 1) {
      const seatedIds = new Set(timer.session.rotation.map(rotationEntryId));
      const promoted = pickPromotionTarget(membership.participants, seatedIds, targetId);
      if (promoted === null) {
        sendError(connId, "BelowMinMembers", errorMessageFor("BelowMinMembers"));
        return err("BelowMinMembers");
      }
      const added = evolve(working, { type: "MemberAdded", participantId: promoted.id, now }, now);
      working = { session: added.session, clock: added.clock };
    }
    // **`idx` は繰り上げの後も有効である。** `MemberAdded` は席を末尾へ足すので、
    // 先にある退出者の位置は動かない（ここへ来る時点で `idx` は 0 である）。
    const agg = evolve(working, { type: "MemberRemoved", index: idx, now }, now);
    next = { ...next, timer: { ...next.timer, session: agg.session, clock: agg.clock } };
  }
```

- [ ] **Step 4: 通ることを確かめる**

```bash
cd apps/tasuki-sync && corepack pnpm exec bun test test/solo-leave.test.ts test/participant-remove.test.ts
```

期待: すべて PASS。とくに `participant-remove.test.ts:402` の
「④ 枠を外さないケースでは最後のドライバー保護が誤発火しない」が緑のままであること。

- [ ] **Step 5: 規範文書の退出の表を直す**

`docs/timer/ARCHITECTURE.md:343-350` の「退出が拒否されうる経路」の段落を、
**`member.remove`（列から外れる）の話に限定**して書き直す。`participant.remove`
（ルームから抜ける）は #290・D1 で繰り上げるようになったため、`BelowMinMembers` は
この経路からは出なくなったことを明記する。

- [ ] **Step 6: コミット**

```bash
git add apps/tasuki-sync/src/application/command-handlers/participant-remove.ts apps/tasuki-sync/test/solo-leave.test.ts docs/timer/ARCHITECTURE.md
git commit -m "fix: 最後のドライバーでもルームから抜けられるようにする（#290）"
```

---

## Task 3: 玄関が「不在 かつ 退出の告知あり」を作成画面にする

**Files:**
- Modify: `apps/landing/src/hub/hub-state.ts`
- Modify: `apps/landing/src/App.tsx:45-46, 88-92`
- Test: `apps/landing/tests/hub/hub-state.test.ts`

**Interfaces:**
- Produces: `screenFor({ code, joined, resuming, gone, departed })` —— `departed: boolean` が増える

**判定は画面から切り出す**（`docs/adr/0015` MUST 1）。`App.tsx` の JSX で分岐せず、
純粋関数 `screenFor` に決めさせる。

- [ ] **Step 1: 失敗するテストを書く**

`apps/landing/tests/hub/hub-state.test.ts` に足す:

```ts
  it('不在でも、退出の告知を持つ人は作成画面へ落とす', () => {
    // Given: たったいま自分が抜けて、その結果この部屋が消えた人
    // When
    const screen = screenFor({ code: 'room-a1b2', joined: false, resuming: false, gone: true, departed: true });

    // Then: 不在の知らせではなく作成画面（告知はそこで読まれる・#290 D4）
    expect(screen).toBe('create');
  });

  it('退出の告知を持たない人は、従来どおり不在の知らせへ落とす', () => {
    // Given: 死んだ招待 URL で来た人
    // When
    const screen = screenFor({ code: 'room-a1b2', joined: false, resuming: false, gone: true, departed: false });

    // Then
    expect(screen).toBe('gone');
  });
```

**既存のテストは `departed` を渡していないので型検査が落ちる。** 既存の呼び出しへ
`departed: false` を足して回ること（それが従来の挙動である）。

- [ ] **Step 2: 落ちることを確かめる**

```bash
cd apps/landing && corepack pnpm exec vitest run tests/hub/hub-state.test.ts
```

期待: 「作成画面へ落とす」が `'gone'` を受け取って FAIL。

- [ ] **Step 3: `screenFor` を直す**

`apps/landing/src/hub/hub-state.ts` の `HubScreenInput` に足す:

```ts
  /**
   * 退出の告知（`?left=`）を持って来たか（#290・D4）。
   *
   * **`gone` の意味を変える。** 死んだ招待 URL で来た人には不在が必要な報せだが、
   * この人は「たったいま自分が抜けて、その結果この部屋が消えた」人である。
   * 不在だけを告げると、自分で押した操作の結果なのに何かが壊れたように読める。
   */
  readonly departed: boolean;
```

`screenFor` の `gone` の行を置き換える:

```ts
  // **`?left=` を持つ人は作成画面へ。** 退出の告知がその不在の説明になっているので、
  // 「ルームが見つかりません／URL が正しくない可能性があります」を重ねない（#290・D4）。
  // 告知を持たない人（死んだ招待 URL）は従来どおり不在の知らせである（#274）。
  if (gone) return departed ? 'create' : 'gone';
```

`apps/landing/src/App.tsx:45-46` の呼び出しへ `departed` を渡す:

```tsx
    screenFor({
      code: hub.code,
      joined: hub.joined,
      resuming: hub.resuming,
      gone: hub.gone,
      departed: departure.notice !== null,
    })
```

`App.tsx:88-92` の `case 'gone'` のコメントを更新する（`?left=` を持つ人はここへ来ないこと、
および #274 の判断をどう狭めたかの理由を残す）。`:73-77`（`resuming` のコメント）にある
「その経路では告知が読まれないまま消える」という記述も**もう正しくない**ので直す。

- [ ] **Step 4: 通ることを確かめる**

```bash
cd apps/landing && corepack pnpm exec vitest run
```

期待: すべて PASS（既存の `room-gone.test.tsx` と `App.test.tsx` を含む）。

- [ ] **Step 5: コミット**

```bash
git add apps/landing/src/hub/hub-state.ts apps/landing/src/App.tsx apps/landing/tests/hub/hub-state.test.ts
git commit -m "fix: 退出した人には不在の知らせではなく退出の告知を見せる（#290）"
```

---

## Task 4: 退出の行き先を 1 本にする

**Files:**
- Modify: `apps/timer-web/src/ui/error-action.ts`
- Modify: `apps/timer-web/src/sync/use-timer-sync.ts:479-536`
- Modify: `packages/room-core/src/departure.ts:22`（docstring）
- Test: `apps/timer-web/test/ui/error-action.test.ts:15-23`（**旧挙動を固定している**）
- Test: `apps/timer-web/test/ui/App.solo-leave.test.tsx:135`（**旧挙動を固定している**）
- Test: `apps/timer-web/test/ui/App.sync-handlers.test.tsx:130`（**変わらない**。確認のみ）

⚠ **`apps/timer-web/test/ui/entry.test.ts:70-79` は直さないこと。**
`hubRoomPath(null, "self")` → `/?left=self` を見ているが、**この関数の振る舞いは変えない**
（変えるのは呼び出し側）。緑のままが正しい。

**Interfaces:**
- Produces: `ErrorAction` の `leave-room` が `{ kind: "leave-room"; reason: DepartureReason }` になる
  （`destination: "join" | "setup"` は無くなる）

- [ ] **Step 1: 既存テストを新しい期待へ書き換える**

`apps/timer-web/test/ui/error-action.test.ts:15-23` の 3 件を置き換える:

```ts
    expect(errorAction("LEFT_ROOM")).toEqual({ kind: "leave-room", reason: "self" });
    expect(errorAction("REMOVED_FROM_ROOM")).toEqual({ kind: "leave-room", reason: "removed" });
    expect(errorAction("REMOVED_BY_HOST")).toEqual({ kind: "leave-room", reason: "removed" });
```

`apps/timer-web/test/ui/App.solo-leave.test.tsx:135` の期待を置き換える。遷移は
`vi.mock("../../src/platform/location.js", ...)` で `redirectTo: vi.fn()` に差し替えてあり、
アサーションは `expect(redirectTo).toHaveBeenCalledWith(...)` の形である。

```tsx
    // **自分で抜けてもコードを運ぶ**（#290・D3）。ルームがまだ在るかは玄関が決める。
    expect(redirectTo).toHaveBeenCalledWith("/?room=ROOM01&left=self");
```

> 実際のルームコードはこのファイルの `connected()` が使うもの（`App.sync-handlers.test.tsx:130`
> では `ROOM01`）に合わせる。

`App.sync-handlers.test.tsx:130` の `"/?room=ROOM01&left=removed"` は**変わらない** ——
外された人の行き先は元から正しく、今回そちらへ揃えるからである。
同ファイル `:123` の `destination: "join"` を名指しするコメントだけ直す。

- [ ] **Step 2: 落ちることを確かめる**

```bash
cd apps/timer-web && corepack pnpm exec vitest run test/ui/error-action.test.ts test/ui/App.sync-handlers.test.tsx
```

期待: `reason` が無く `destination` が返るため FAIL。

- [ ] **Step 3: `ErrorAction` を畳み、行き先を 1 本にする**

`apps/timer-web/src/ui/error-action.ts`:

```ts
import type { DepartureReason } from "@tasuki/room-core";

/** 画面の次の動作。**行き先は分岐しない**（#290・D3）。運ぶのは理由だけである。 */
export type ErrorAction =
  | { kind: "session-lost" }
  | { kind: "leave-room"; reason: DepartureReason }
  | { kind: "retry-later" }
  | { kind: "transient" };
```

```ts
    case "LEFT_ROOM":
      return { kind: "leave-room", reason: "self" };
    case "REMOVED_FROM_ROOM":
    case "REMOVED_BY_HOST":
      return { kind: "leave-room", reason: "removed" };
```

`use-timer-sync.ts` の `leave-room` 分岐（527-535 行の `if/else`）を 1 行へ:

```ts
        setMode(null);
        // **行き先は離れ方で分けない**（#290・D3）。ルームがまだ在るかを知っているのは
        // 玄関（サーバーへ尋ねる・#274）であって、抜けた本人ではない。コードを運び、
        // 判断は玄関へ委ねる。**コードを失っている場合は `hubRoomPath` が `?room=` を
        // 落とす** —— 存在しないコードを載せると、退出の告知より不在が前に出る。
        redirectTo(hubRoomPath(removedFrom ?? null, action.reason));
```

520-525 行のコメント（`destination` の値をそのまま使う、という記述）も書き直す。

`packages/room-core/src/departure.ts:22` の
「退出の理由。`error-action.ts` の `destination` と 1 対 1 に対応する。」を実態へ直す。

- [ ] **Step 4: 通ることと、消した記号が残っていないことを確かめる**

```bash
cd apps/timer-web && corepack pnpm exec vitest run
grep -rn "destination" apps/timer-web/src apps/timer-web/test packages/room-core/src --include='*.ts' --include='*.tsx' | grep -v "ctx.destination"
```

期待: テストはすべて PASS。grep は `platform/sound.ts` と `test/platform/sound.test.ts`
（Web Audio の `ctx.destination`）以外に**何も出ないこと**。
`docs/plans/` 配下は対象外（当時の記録なので書き換えない）。

- [ ] **Step 5: 規範文書の退出の表を直す**

`docs/timer/ARCHITECTURE.md:329-341`。`?room=` を「落とす／運ぶ」で分けていた列を
**常に運ぶ**の 1 行にし、行き先を決めるのは玄関であることを明記する。

- [ ] **Step 6: コミット**

```bash
git add apps/timer-web/src apps/timer-web/test packages/room-core/src/departure.ts docs/timer/ARCHITECTURE.md
git commit -m "fix: ルームを離れる行き先を離れ方で分けない（#290）"
```

---

## Task 5: 終了後にルームから出さない

**Files:**
- Modify: `apps/timer-web/src/sync/use-timer-sync.ts:770-773`
- Test: `apps/timer-web/test/sync/use-timer-sync.test.tsx:681-698`（**旧挙動を固定している**）

- [ ] **Step 1: 既存テストを新しい期待へ書き換え、失った経路を足す**

`use-timer-sync.test.tsx:681` の
`it("新しいセッションを始めるとルームをロビーへ戻し、玄関へ送る", ...)` を置き換える。
既存のヘルパ（`connected()` / `deliver()` / `aValidSnapshot()` / `vi.spyOn(ws, "send")`）と、
`redirectTo` を `vi.fn()` に差し替える作法（同ファイル 16-23 行）をそのまま使う。

```tsx
  it("新しいセッションを始めるとルームをロビーへ戻し、玄関へは送らない", () => {
    // Given: ROOM01 に居て、その後で契約に合わないフレームを捨てている
    const { result, deliver, ws } = connected();
    deliver(aValidSnapshot());
    deliver(aFrameThatViolatesTheContract());
    expect(result.current.syncStale).toBe(true);
    const sendSpy = vi.spyOn(ws, "send");

    // When
    act(() => result.current.newSession());

    // Then: `celebration` のまま残さない（残すと timer だけ死んだルームになる）
    const sent = sendSpy.mock.calls.map(
      ([raw]) => JSON.parse(String(raw)) as Record<string, unknown>,
    );
    expect(sent).toContainEqual({ command: "phase.set", phase: "setup" });
    // **押した本人も他の全員と同じくロビーへ戻る**（#290・D5）。遷移すると、
    // 押した人だけがルームから出される。
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("ルームを失っているときは、新しいセッションで玄関へ送る", () => {
    // Given: ROOM01 が消えている（`ROOM_NOT_FOUND` を受けた）
    const { result, deliver } = connected();
    deliver(aValidSnapshot());
    act(() => deliverError("ROOM_NOT_FOUND"));
    expect(result.current.sessionLost).toBe(true);

    // When
    act(() => result.current.newSession());

    // Then: 宛先が無いので `phase.set` は送らず、玄関へ送る
    expect(redirectTo).toHaveBeenCalledWith("/");
  });
```

> `deliverError` は例示である。**このファイルに `ROOM_NOT_FOUND` を届ける既存の手段が
> あればそれを使う**（`handleError` を通す経路を `grep -n "ROOM_NOT_FOUND" ` で探す）。

- [ ] **Step 2: 落ちることを確かめる**

```bash
cd apps/timer-web && corepack pnpm exec vitest run test/sync/use-timer-sync.test.tsx
```

期待: 1 件目が `redirectTo` を呼んでいて FAIL。

- [ ] **Step 3: `redirectTo("/")` を落とす**

```ts
  const newSession = () => {
    // **ルームが生きているなら遷移しない**（#290・D5）。`phase.set` は在室者全員へ
    // 届くので、押した本人も他の全員と同じく snapshot でロビーへ戻る。
    // かつてここに `redirectTo("/")` があったのは、#249 以前の `newSession` が
    // 「まっさらな新しいルームを作る」操作で、旧 `Setup`（＝作成画面）へ戻していた
    // 名残である。押した本人だけがルームから出されていた。
    if (room && !sessionLost) {
      commands.setPhase("setup");
      return;
    }
    // ルームを失っているときは戻る先が無いので玄関へ（`SessionLost` と同じ）。
    redirectTo("/");
  };
```

- [ ] **Step 4: 通ることを確かめる**

```bash
cd apps/timer-web && corepack pnpm exec vitest run
```

期待: すべて PASS。

- [ ] **Step 5: コミット**

```bash
git add apps/timer-web/src/sync/use-timer-sync.ts apps/timer-web/test
git commit -m "fix: セッション終了後に押した本人だけがルームから出ないようにする（#290）"
```

---

## Task 6: E2E で退出の経路を通す

**Files:**
- Create: `e2e/specs/leave-room.spec.ts`

退出を通る E2E は現在 1 本も無い。#249 では「E2E を実物の入口へ移して初めて露出した」
欠陥があった。**新しいタグは足さない**（既存の作法に合わせる）。

- [ ] **Step 1: 既存 spec の作法を読む**

```bash
ls e2e/specs && sed -n '1,60p' e2e/specs/$(ls e2e/specs | head -1)
```

タイトルへのタグの埋め込み方（#274 の作法）と、2 人を開く既存のヘルパを確認する。

- [ ] **Step 2: シナリオを書く**

玄関 → ルーム作成（Alice）→ 招待 URL で 2 人目（Bob・見学のまま）→
**Alice がロビーで「ルームから抜ける」を押す** → Alice は `/?room=...&left=self` に着き、
**「ルームから抜けました。」が見える** → Bob の画面では輪に Bob が繰り上がっている。

- [ ] **Step 3: 走らせる**

```bash
cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/leave-room.spec.ts
```

（turbo を迂回するので環境変数がそのまま届く。`pnpm dev` と同時に走らせない）

- [ ] **Step 4: コミット**

```bash
git add e2e/specs/leave-room.spec.ts
git commit -m "test: ルームから抜ける経路の E2E を足す（#290）"
```

---

## Task 7: 変異検査を当て直す

**Files:**
- Modify: `scripts/mutations/`（既存パッチが当たらなくなっていれば直す・必要なら新設）

**製品コードを触ると既存の変異パッチが当たらなくなり、`mutation-check` はそこで止まって
以降が全部無検査になる**（#276 で 2 度踏んだ。`pnpm test` にも E2E にも出ない）。

- [ ] **Step 1: 作業ツリーが clean であることを見る**

```bash
git status --porcelain
```

期待: **何も出ないこと。** 汚れていると変異検査は実行できない。

- [ ] **Step 2: 既存パッチの当たり判定を先に見る**

```bash
node --test scripts/mutation-check.test.mjs
```

期待: `git apply --check` を全パッチへ流す検査（#249 で追加）が PASS。
落ちたパッチは、今回の変更に合わせて**パッチの中身まで**直す。

- [ ] **Step 3: 変異検査を走らせる**

```bash
node scripts/mutation-check.mjs
```

**`| head` を付けない**（SIGPIPE で中断しても `exit 0` に見える・#292）。
`変異数: N` と `検出: N / 未検出: 0` の行を読む。

- [ ] **Step 4: 新しい分岐に変異パッチを足す**

最低 2 つ。既存の最大 ID を確認してから採番する（衝突すると別の作業とぶつかる）。

- 繰り上げの在席優先を潰す（`presenceRank` を常に 0 にする）→ Task 1 の 1 件目が落ちること
- `screenFor` の `departed ? 'create' : 'gone'` を `'gone'` 固定にする → Task 3 が落ちること

- [ ] **Step 5: コミット**

```bash
git add scripts/mutations scripts/mutation-check.test.mjs
git commit -m "test: 繰り上げと玄関の分岐に変異検査を足す（#290）"
```

---

## Task 8: 設計正本の追補

**Files:**
- Modify: `docs/superpowers/specs/2026-09-22-leaving-a-room-design.md`

- [ ] **Step 1: 実測で覆った前提を追記する**

実装中に設計正本の前提が覆ったら、**末尾へ**「実施時の訂正」節を足す
（節を途中へ差し込むと直後の小節が親を変える）。覆らなければこの Task は「該当なし」と記す。

- [ ] **Step 2: コミット**

```bash
git add docs/superpowers/specs/2026-09-22-leaving-a-room-design.md
git commit -m "docs: #290 実施時の訂正を設計正本へ追記"
```

---

## Task 9: 検証と独立レビュー

- [ ] **Step 1: 全体を回す**

```bash
corepack pnpm test --force
corepack pnpm e2e
corepack pnpm audit
node scripts/check-links.mjs
node scripts/audit-plan-gate.mjs
node --test scripts/audit-structure.test.mjs
```

`pnpm test --force` は **`Cached: 0 cached` を確認する**（turbo は既定でキャッシュに当てて
1.5 秒で「緑」を出す）。**`scripts` の自己テストと `pnpm audit` は `pnpm test` に入っていない。**

- [ ] **Step 2: 指標を基準値と比べる**

合否の無い指標は「—」で出るので、後退しても CI は緑になる。
**main を別 worktree で流して並べる**。

```bash
node scripts/audit-structure.mjs
```

- [ ] **Step 3: 実画面で確かめる**

`pnpm dev` を起動し、**入口は <http://localhost:5175/> だけ**（:5173 / :5174 を直接開くと
再読み込みが止まらない）。**アサーションを書く前に 1 回「探索」を走らせる。**

確認する経路:
1. 玄関でルームを作る → 招待 URL で 2 人目 → **作成者がロビーで「ルームから抜ける」を押せる**
2. 抜けた作成者は `/?room=...&left=self` に着き、告知が見える。2 人目の画面で輪が繰り上がっている
3. 1 人だけのルームで抜ける → **作成画面＋「ルームから抜けました。」**（不在の知らせではない）
4. 死んだ招待 URL を素で開く → 従来どおり**不在の知らせ**
5. セッションを開始 → 終了 → 「新しいセッション」→ **全員がロビーへ戻る**（押した本人も）

**終わったら dev を落としてポートを解放する**（起動しっぱなしで利用者の `pnpm dev` を潰す）。

- [ ] **Step 4: 独立レビューを回す**

```
/code-review <PR 番号>
```

**巡の回数は独立性の代わりにならない。** worktree で作った PR なら**番号を明示する**
（カレントブランチを見るため、宛先を間違える）。
**採点が走っている間に直さない** —— 実在した指摘が「もう直っている」を理由に 0 点になる。

- [ ] **Step 5: PR を作る**

DoD 8 項目に沿う。該当しない項目は「該当なし」と明記する。
**本文に `closes #290` を地の文で書かない**（squash マージで意図せず閉じる）。

---

## 進める順序と依存

```
Task 1（純粋関数）──→ Task 2（サーバーの繰り上げ）
Task 3（玄関）──→ Task 4（tool の行き先）   ※ 3 を先にやる
Task 5（終了後）        ※ 独立
        ↓
Task 6（E2E）→ Task 7（変異検査）→ Task 8（設計正本）→ Task 9（検証）
```

**Task 3 を Task 4 より先に置く理由**: 逆にすると、tool が常に `?room=` を運ぶのに玄関が
まだ対応しておらず、**1 人で作って抜けた人が説明の無い「ルームが見つかりません」に着く**
窓がコミット間に開く。
