# #95 S4a 名簿統合 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ツールのコアから参加者エンティティを消し、`packages/room-core` の名簿を唯一の正本にする（`poker-core` は `Round` が集約ルート、`timer-core` のローテーションは `RotationEntry`）。

**Architecture:** メンバーシップ（名簿）・モブタイマー・見積もりの 3 文脈に割り、保管を `RoomStore`（名簿）/ `TimerStore` / `PokerStore` の 3 ポートへ分ける。**wire（`snapshot` と `room-state` の形）は変えない** —— スナップショットの DTO をアプリケーション層で組み直して同じ形で出すので、`apps/timer-web` と `apps/poker-web` は原則無改修になり、Web 側の既存テストが「振る舞いを変えていない」ことの証拠として残る。保管が 1 つになる帰結として、ルームの寿命規則を `destroy-room` / `room-reclaimer` に一本化し、入口ごとの門・レート制限・`MAX_ROOMS` を決め直す。

**Tech Stack:** TypeScript / Bun（`apps/tasuki-sync`）/ Vitest（`packages/*`・Web）/ Valibot（境界検証）/ neverthrow（`Result`）/ Playwright（E2E）

**Spec:** `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md`（決定 D1〜D22・EARS R1〜R17・段階 S0〜S6）
**Issue:** #245（親 epic は #95）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクを Red → Green で進める。DTO の同形性（Task 2）と越境の遮断（Task 5）は**先に赤を見てから**実装する |
| II. 技術選定は ADR を通す | 通過 | 新しい依存を足さない。`MAX_ROOMS` とレート制限の統合は ADR-0004 の改定として記録する（Task 0） |
| III. 揮発インメモリと単純運用 | 通過 | 保管は揮発のまま。ルームの寿命規則を `room-reclaimer` と `destroy-room` の 2 経路へ一本化し、増やさない |
| IV. 境界の型安全 | 通過 | wire の形を変えないので `RoomSchema`（Valibot）はそのまま効く。DTO が同スキーマを通ることをテストで固定する |
| V. 実画面検証 | 通過 | wire 不変のため画面の変化は無い見込みだが、`pnpm e2e` を全件通す（Task 7）。poker の寿命が変わるので E2E の前提を先に直す |
| VI. 依存は内向き | 通過 | `poker-core` は `room-core` を import せず構造的型で受ける。`audit-dependency-direction.mjs` が見張る |
| VII. 検査は壊して確かめる | 通過 | 死んだ検査の削除前に到達不能を確かめ（Task 2 Step 7）、変異検査と旧新比較を行う（Task 8） |
| VIII. 記録が正本 | 通過 | 設計正本・ADR-0004・ADR-0011 を**着手前に**直す（Task 0）。決定を書き、実施は未了と書く |
| IX. 小さく回す | 通過 | PR 1 本を main へ直接マージする（スライスの原則）。**デプロイは伴わない** |
| X. 抽象は実需で | 通過 | 新しい抽象（`tool-gate` / `RoundStore` / `TimerStore`）はいずれも利用者が 2 つ以上ある。先取りの抽出はしない |
| XI. 秘密と個人情報を持ち込まない | 通過 | パスフレーズの迂回を塞ぐ（Task 5）。平文が snapshot に混入しないことは既存テストが見張る |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

---

## Global Constraints

- **wire は変えない。** `snapshot`（timer）と `room-state`（poker）の形は現状維持。例外は `room.startedAt` の削除 1 件のみ（Task 3）。`config.members` は wire に残し、DTO 組み立てで解決した表示名を入れる
- **`packages/poker-core` は `@tasuki/room-core` に依存できない。** 許可表は `scripts/audit-dependency-direction.mjs:97` で `["@tasuki/protocol"]` のみ。名簿の断片は**構造的型を局所定義して**受ける（import しない）
- **`packages/timer-core → @tasuki/room-core` の一時依存は S4a では残す**（`display-name` の移設分。外すのは S4b）
- **公開記号は `index.ts` で明示列挙する。`export *` は使わない**（ADR-0016 決定 2）。検査は `scripts/audit-public-surface.mjs`
- **ドメインは `Result` を返し、境界は Valibot で検証する**（憲法 原則 IV）
- **ドメインに `Date.now` / `Math.random` を置かない**（`scripts/audit-domain-side-effects.mjs`）
- **DoD 8 項目**（`docs/guides/definition-of-done.md`）を満たす。該当しない項目は「該当なし」と明記する
- **コミットは Conventional Commits・日本語**（`docs/../.claude/rules/git-workflow.md`）。1 コミット = 1 つの論理的変更
- **テストコマンド**: `packages/*` は `corepack pnpm --filter <name> test`（Vitest）、`apps/tasuki-sync` は `bun test`（`corepack pnpm --filter @tasuki/sync test`）、全体は `corepack pnpm test`
- **作業場所**: `/workspaces/claym/local/Tasuki` でそのまま作業してよい（`--virtual-store-dir` 適用済み）。ブランチは `feature/245-unify-roster`
- **`main` は常にデプロイ可能に保つ。** 配備資材（`deploy/timer/env.example`・`NOTES.md`）の更新は Task 7 で同じ PR に入れる
- **数える前に実行する。** 件数・指標は `corepack pnpm test` と `node scripts/audit-structure.mjs` の出力から取る。過去の記録と比べない

---

## File Structure

**新規**

| ファイル | 責務 |
|---|---|
| `packages/room-core/src/room.ts` | メンバーシップのドメイン。`Room` / `Participant` と純粋な操作 |
| `packages/room-core/tests/room.test.ts` | 同上のテスト |
| `apps/tasuki-sync/src/ports/timer-store.ts` | timer 状態の保管ポート |
| `apps/tasuki-sync/src/adapters/in-memory-timer-store.ts` | 同上の揮発実装 |
| `apps/tasuki-sync/src/application/timer-snapshot-dto.ts` | 名簿＋timer 状態 → 現行 wire の `snapshot.room` を組む |
| `apps/tasuki-sync/src/application/tool-gate.ts` | 「その入口のツール状態があるルームにだけ入れる」門 |
| `apps/tasuki-sync/test/timer-snapshot-dto.test.ts` | DTO が現行 wire と同形であることの固定 |
| `apps/tasuki-sync/test/tool-gate.test.ts` | 越境の遮断（合言葉の迂回を塞ぐ回帰） |
| `apps/tasuki-sync/test/room-lifecycle.test.ts` | 寿命規則の一本化 |

**改造**

| ファイル | 変更 |
|---|---|
| `packages/room-core/src/index.ts` | `Room` / `Participant` と操作を明示列挙で公開 |
| `packages/timer-core/src/aggregate.ts` | `Participant` を削除、`SessionState.rotation` を `RotationEntry[]` へ、`SessionConfig.members` を削除、`Room` を `TimerState` へ、`startedAt` を削除 |
| `packages/timer-core/src/decide.ts` | rotation の長さ・重複判定をエントリ基準へ |
| `packages/timer-core/src/evolve.ts` | rotation 操作をエントリ基準へ |
| `packages/timer-core/src/records.ts` | `buildCompletionRecord` が表示名を引数で受ける |
| `packages/timer-core/src/schemas.ts` | `ParticipantSchema` を wire 用の `ParticipantViewSchema` へ改名、`startedAt` を削除 |
| `packages/poker-core/src/round.ts` | `Round` を集約ルートに。名簿の断片は構造的型で受ける |
| `packages/poker-core/src/room.ts` | 削除（名簿は room-core へ、トークンは token-store へ） |
| `packages/poker-core/src/snapshot.ts` | `Round` と名簿の断片から `room-state` を組む |
| `apps/tasuki-sync/src/ports/room-store.ts` | 保管する型を `@tasuki/room-core` の `Room` へ |
| `apps/tasuki-sync/src/poker/ports/room-store.ts` | 削除（`PokerStore` は `Round` を保管する新ポートへ） |
| `apps/tasuki-sync/src/application/handlers.ts` | 名簿・timer 状態・DTO の 3 者を合成する形へ |
| `apps/tasuki-sync/src/application/apply-room-level-event.ts` | 名簿の変更と timer 状態の変更を分ける |
| `apps/tasuki-sync/src/application/destroy-room.ts` | `PokerStore` の解放を後始末に足す |
| `apps/tasuki-sync/src/application/admin.ts` | 名簿＋timer 状態から要約を組む |
| `apps/tasuki-sync/src/poker/application/handlers.ts` | 即時破棄を撤去し、名簿は `RoomStore` を見る |
| `apps/tasuki-sync/src/config.ts` | `MAX_ROOMS` の既定を決め直す |
| `apps/tasuki-sync/src/create-sync-server.ts` | 3 ストアと限定器 1 本を組み立てる |
| `deploy/timer/env.example` / `deploy/timer/NOTES.md` | `MAX_ROOMS` の新しい値と切り替え手順 |
| `e2e/specs/poker.spec.ts` | 寿命規則への依存を外す |
| `docs/timer/ARCHITECTURE.md` ほか | 消した記号の名指しを直す |

---

### Task 0: 記録を先に直す（設計正本・ADR・Issue）

実装が始まると根拠が腐る。**着手前に**、敵対的検証で崩れた前提を記録側へ反映する。
**決定を書き、実施は未了と書く**（完了形を書かない → 過去に 1 つの PR で 3 回踏んだ）。

**Files:**
- Modify: `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md`（§3.12 の訂正ブロックの下・D15・§7 の S4a 行）
- Modify: `docs/adr/0004-sync-server-ports-and-adapters.md:91-94`（表の `MAX_ROOMS` 行とレート制限行）
- Modify: `docs/adr/0011-threat-model-and-data-classification.md`（脅威 S9 付近・合言葉の迂回）

**Interfaces:**
- Consumes: なし
- Produces: 以降のタスクが引用する訂正済みの根拠

- [ ] **Step 1: 設計正本に S4a 実施時の訂正節を足す**

`§3.12` の既存の訂正ブロック（`【S2（#243）実施時の訂正・2026-09-08】`）の**直後**に、
次を追記する。**節の末尾へ足すこと**（節の途中へ挟むと直後の小節が親を変える）。

```markdown
> **【S4a（#245）実施時の訂正・2026-09-10】上表の `MAX_ROOMS` 行とレート制限行は S4a で解消する。**
> 名簿の保管を 1 つにしたため、`MAX_ROOMS` はプロセス全体で 1 本になった。実効枠（50 × 2 = 100）を
> 保つ値へ決め直す。レート制限のバケツも 1 本にする（`create-sync-server` で 1 インスタンスを作り
> 両ハンドラへ注入する）。**S2 が据え置いた理由「timer 側は `room.join` と `ai.unlock` が同一
> インスタンスを共有することを構造で保証している」は、保証をテストへ移し替えることで対価を払う。**
>
> **あわせて §7 の S4a 行「変化なし」を訂正する。** 保管を 1 つにすると次の 2 つが利用者から見える。
>
> 1. **poker のルームの寿命が変わる。** 最後の接続が切れた瞬間の破棄をやめ、`room-reclaimer` の
>    TTL 回収に一本化する（R10・D8 の形）。全員が閉じても TTL の間はルームが残り、票も残る
> 2. **入口ごとに門を置く。** そのツールの状態があるルームにだけ入れる。門が無いと、パスフレーズ
>    保護された timer のルームへ poker の入口から入れてしまう（poker 側に合言葉の概念が無いため）。
>    この門は S5 で D8 の遅延生成に置き換わる
```

- [ ] **Step 2: 設計正本 D15 に完成記録の扱いを足す**

`### D15: config.members を廃止する` の節の**末尾**に追記する。

```markdown
> **【S4a 実施時の追記・2026-09-10】完成記録は DTO では作れない。**
> `buildCompletionRecord`（`packages/timer-core/src/records.ts`）は `config.members` を読み、
> 結果は `room.sessionRecords` に**保存される履歴**になる。表示名の解決を DTO 組み立てへ
> 移すだけでは記録が名前を失う。`buildCompletionRecord` の署名に解決済みの表示名を渡す。
```

- [ ] **Step 3: ADR-0004 の表を改定する**

`docs/adr/0004-sync-server-ports-and-adapters.md` の表（91-94 行付近）で、`MAX_ROOMS` 行と
レート制限行の「統合後」列を書き換え、**改定節**を節の末尾に足す。#258 で確定した作法に従い、
**当時の観測・引用・根拠は書き換えない**（決定を覆すのではなく、本文の現況を事実に合わせる）。

```markdown
### 改定（2026-09-10・#95 S4a）

上表の `MAX_ROOMS` 行とレート制限行は「名簿の統合は S4a」と書いていた。S4a（#245）で
名簿の保管を 1 つにし、両方ともプロセス全体で 1 本にする。値と根拠は
`deploy/timer/env.example` と `docs/superpowers/specs/2026-06-07-tasuki-vps-deployment-design.md` §8 が正本。
**決定（ポートとアダプタの構成）そのものは変えていない。**
```

- [ ] **Step 4: ADR-0011 に合言葉の迂回を記録する**

脅威 S9 の近くに、次を追記する（節の末尾へ）。

```markdown
> **【2026-09-10・#95 S4a】名簿の保管を 1 つにすると、入口ごとの門が無い限り
> パスフレーズ保護（R4-2）を迂回できる。** poker の入口には合言葉の概念が無いため、
> timer のルームコードを poker の URL に与えると名簿へ載れてしまう。
> **対策: その入口のツール状態があるルームにだけ入れる**（`application/tool-gate.ts`）。
> 存在しないコードと同じ応答を返すので、ルームコード列挙の手がかりにもならない。
> S5 で入口が 1 つになったときは、合言葉の検査がルーム参加の唯一の経路に集約される。
```

- [ ] **Step 5: リンク検査を通す**

```bash
git add docs/
node scripts/check-links.mjs
```
Expected: エラー 0 件（**`git add` してから実行する**。この検査は `git ls-files` を見るので、
未追跡のファイルは走査されない）

- [ ] **Step 6: コミット**

```bash
git add docs/
git commit -m "docs: S4a の前提を記録に反映する（#245）

- 設計正本 §3.12 に S4a 実施時の訂正（MAX_ROOMS とレート制限を 1 本にする）
- 設計正本 §7 の S4a 行を訂正（poker の寿命と入口の門は利用者から見える）
- 設計正本 D15 に完成記録の扱いを追記
- ADR-0004 の表を改定節つきで現況に合わせる
- ADR-0011 に合言葉の迂回と対策を記録"
```

---

### Task 1: room-core にメンバーシップのドメインを足す

純追加。まだ誰も使わないので、どのテストも壊れない。

**Files:**
- Create: `packages/room-core/src/room.ts`
- Create: `packages/room-core/tests/room.test.ts`
- Modify: `packages/room-core/src/index.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `type ParticipantId = string` / `type ConnId = string` / `type RoomCode = string`
  - `interface Participant { id: ParticipantId; displayName: string; connId: ConnId | null; presence: "online" | "idle" | "offline"; joinedAt: number }`
  - `interface Room { code: RoomCode; createdAt: number; participants: Participant[] }`
  - `findParticipant(room: Room, id: ParticipantId): Participant | undefined`
  - `addParticipant(room: Room, participant: Participant): Room`
  - `removeParticipant(room: Room, id: ParticipantId): Room`
  - `attachConnection(room: Room, id: ParticipantId, connId: ConnId): Room`
  - `detachConnection(room: Room, id: ParticipantId): Room`
  - `hasNoParticipants(room: Room): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`packages/room-core/tests/room.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addParticipant,
  attachConnection,
  detachConnection,
  findParticipant,
  hasNoParticipants,
  removeParticipant,
  type Participant,
  type Room,
} from "../src/room";

const alice: Participant = {
  id: "p_alice",
  displayName: "アリス",
  connId: "c1",
  presence: "online",
  joinedAt: 1000,
};

const room: Room = { code: "mob-a1b2c3d4", createdAt: 500, participants: [alice] };

describe("名簿の操作", () => {
  it("参加者を ID で引ける", () => {
    expect(findParticipant(room, "p_alice")).toEqual(alice);
  });

  it("居ない ID を引くと undefined を返す", () => {
    expect(findParticipant(room, "p_bob")).toBeUndefined();
  });

  it("参加者を足しても元の Room を書き換えない", () => {
    const bob: Participant = { ...alice, id: "p_bob", displayName: "ボブ", connId: "c2" };
    const next = addParticipant(room, bob);
    expect(next.participants.map((p) => p.id)).toEqual(["p_alice", "p_bob"]);
    expect(room.participants).toHaveLength(1);
  });

  it("参加者を外すと名簿から消える", () => {
    const next = removeParticipant(room, "p_alice");
    expect(next.participants).toEqual([]);
  });

  it("居ない ID を外しても何も起きない", () => {
    expect(removeParticipant(room, "p_bob").participants).toEqual([alice]);
  });

  it("接続を結ぶと online になり connId が入る", () => {
    const offline: Room = {
      ...room,
      participants: [{ ...alice, connId: null, presence: "offline" }],
    };
    const next = attachConnection(offline, "p_alice", "c9");
    expect(findParticipant(next, "p_alice")).toMatchObject({ connId: "c9", presence: "online" });
  });

  it("接続を切ると offline になり connId が null になる", () => {
    const next = detachConnection(room, "p_alice");
    expect(findParticipant(next, "p_alice")).toMatchObject({ connId: null, presence: "offline" });
  });

  it("名簿が空かどうかを判定できる", () => {
    expect(hasNoParticipants(room)).toBe(false);
    expect(hasNoParticipants({ ...room, participants: [] })).toBe(true);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

```bash
corepack pnpm --filter @tasuki/room-core test
```
Expected: FAIL（`../src/room` を解決できない）

- [ ] **Step 3: 実装する**

`packages/room-core/src/room.ts`:

```ts
/**
 * メンバーシップ文脈のドメイン（#95 D1・D4）。
 *
 * **ツールを知らない。** ここに timer / poker の語彙を持ち込むと、文脈を上流に立てた
 * 意味が消える。ツール固有の属性（お題の AI 鍵・ドライバー適格）は各ツールの状態が持つ。
 *
 * `presence` の値域に `"idle"` を残しているのは wire の契約（`RoomSchema`）に合わせるため。
 * 代入する経路は無い（S4a 時点で実測 0 件）。
 */

export type ParticipantId = string;
export type ConnId = string;
export type RoomCode = string;

/** 名簿の 1 人。**同一性と在席の模型は S4b（D12・D14）で作り直す。** */
export interface Participant {
  id: ParticipantId;
  displayName: string;
  /** 在席中の接続。S4b で `connections: ReadonlyMap<ConnId, ToolId | null>` になる */
  connId: ConnId | null;
  presence: "online" | "idle" | "offline";
  joinedAt: number;
}

export interface Room {
  code: RoomCode;
  createdAt: number;
  participants: Participant[];
}

export function findParticipant(room: Room, id: ParticipantId): Participant | undefined {
  return room.participants.find((p) => p.id === id);
}

export function addParticipant(room: Room, participant: Participant): Room {
  return { ...room, participants: [...room.participants, participant] };
}

export function removeParticipant(room: Room, id: ParticipantId): Room {
  return { ...room, participants: room.participants.filter((p) => p.id !== id) };
}

function updateParticipant(
  room: Room,
  id: ParticipantId,
  update: (p: Participant) => Participant,
): Room {
  return { ...room, participants: room.participants.map((p) => (p.id === id ? update(p) : p)) };
}

export function attachConnection(room: Room, id: ParticipantId, connId: ConnId): Room {
  return updateParticipant(room, id, (p) => ({ ...p, connId, presence: "online" }));
}

export function detachConnection(room: Room, id: ParticipantId): Room {
  return updateParticipant(room, id, (p) => ({ ...p, connId: null, presence: "offline" }));
}

export function hasNoParticipants(room: Room): boolean {
  return room.participants.length === 0;
}
```

- [ ] **Step 4: 公開契約に載せる**

`packages/room-core/src/index.ts` に**明示列挙で**足す（`export *` は使わない）。

```ts
// ./room
export {
  findParticipant,
  addParticipant,
  removeParticipant,
  attachConnection,
  detachConnection,
  hasNoParticipants,
} from "./room.js";
// Participant / Room: 上の関数の引数・戻り値型。ParticipantId ほかは署名から到達する
export type { Participant, Room, ParticipantId, ConnId, RoomCode } from "./room.js";
```

- [ ] **Step 5: テストと検査を通す**

```bash
corepack pnpm --filter @tasuki/room-core test
node scripts/audit-public-surface.mjs
node scripts/audit-domain-side-effects.mjs
```
Expected: すべて PASS（`room.ts` に `Date.now` / `Math.random` は無い）

- [ ] **Step 6: コミット**

```bash
git add packages/room-core
git commit -m "feat: room-core にメンバーシップのドメインを足す（#245）

- Room / Participant と名簿の純粋操作を新設
- まだ誰も使わない純追加。既存の振る舞いは変わらない"
```

---

### Task 2: timer から名簿を抜き、ローテーションをエントリにする

**このリポジトリで最も危険な内部移設**（設計正本 §7）。型の分離とアプリ層の追随は同じコミットに入る
——— 途中でコンパイルが通らない状態を通るのは想定内で、**タスクの境界で緑になれば良い**。

**名前について（重要）**: `timer-core` の `Room` / `Participant` は**wire の投影として残す**。
`apps/timer-web` の 18 ファイル（＋テスト 39 ファイル）がこの型名を参照しており、改名は
振る舞いと無関係な差分を 57 ファイルに撒く。**サーバー側の集約は `TimerState` という別名**にし、
`Room` / `Participant` は「クライアントへ送る形」だと docstring で明示する
（`poker-core` の `ParticipantView` と同じ整理）。

**Files:**
- Create: `packages/timer-core/src/wire.ts`（`Room` / `Participant` = wire の投影）
- Create: `apps/tasuki-sync/src/ports/timer-store.ts`
- Create: `apps/tasuki-sync/src/adapters/in-memory-timer-store.ts`
- Create: `apps/tasuki-sync/src/application/timer-snapshot-dto.ts`
- Create: `apps/tasuki-sync/test/timer-snapshot-dto.test.ts`
- Modify: `packages/timer-core/src/aggregate.ts`（`Participant` と `Room` を移動、`SessionState.rotation` をエントリ化、`SessionConfig.members` を削除）
- Modify: `packages/timer-core/src/{decide,evolve,records,schemas,index}.ts`
- Modify: `apps/tasuki-sync/src/ports/room-store.ts`（保管する型を `@tasuki/room-core` の `Room` へ）
- Modify: `apps/tasuki-sync/src/application/{handlers,apply-room-level-event,presence,problem-delegation,room-reclaimer}.ts`
- Modify: `apps/tasuki-sync/src/application/command-handlers/{room-create,room-join,participant-remove}.ts`
- Modify: `apps/tasuki-sync/src/create-sync-server.ts`
- Modify: `apps/timer-web/src/**`（`buildCompletionRecord` の呼び出し 1 箇所のみ）
- Modify: `apps/tasuki-sync/test/support/room-builder.ts`（`makeTestHandlers` が `timers` を受ける。Task 3 で `rounds` も足す）

**Interfaces:**
- Consumes: Task 1 の `@tasuki/room-core`（`Room` / `Participant` / 名簿操作）
- Produces:
  - `type RotationEntry = { kind: "member"; participantId: string; eligible: boolean } | { kind: "proxy"; id: string; label: string; eligible: boolean }`
  - `interface TimerState`（下の Step 3）
  - `interface TimerStore { get(code: string): TimerState | undefined; put(state: TimerState): void; remove(code: string): void; list(): TimerState[] }`
  - `buildTimerSnapshotRoom(membership: RoomCoreRoom, timer: TimerState): Room`（wire の `snapshot.room` を組む）
  - `buildCompletionRecord(agg, problem, config, memberNames: readonly string[], now, roomId?)`

- [ ] **Step 1: DTO の同形性を固定する失敗テストを書く**

**先にここを書く。** この 1 本が「wire を変えていない」ことの錨になる。
`apps/tasuki-sync/test/timer-snapshot-dto.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import { RoomSchema } from "@tasuki/timer-core";
import type { Room as MembershipRoom } from "@tasuki/room-core";
import { buildTimerSnapshotRoom } from "../src/application/timer-snapshot-dto";
import type { TimerState } from "@tasuki/timer-core";

const membership: MembershipRoom = {
  code: "mob-a1b2c3d4",
  createdAt: 500,
  participants: [
    { id: "p_alice", displayName: "アリス", connId: "c1", presence: "online", joinedAt: 1000 },
    { id: "p_bob", displayName: "ボブ", connId: null, presence: "offline", joinedAt: 1100 },
  ],
};

const timer: TimerState = {
  code: "mob-a1b2c3d4",
  createdAt: 500,
  config: { language: "TypeScript", difficulty: "easy", intervalMinutes: 5 },
  problem: null,
  session: {
    rotation: [
      { kind: "member", participantId: "p_alice", eligible: true },
      { kind: "proxy", id: "p_proxy1", label: "同席のカルロス", eligible: true },
    ],
    currentIndex: 0,
    isPaused: false,
    driverCounts: [0, 0],
    totalSwitches: 0,
  },
  clock: {
    running: false,
    intervalSeconds: 300,
    anchorServerTime: 0,
    secondsLeftAtAnchor: 300,
    accumulatedElapsedMs: 0,
    runningSince: null,
  },
  phase: "setup",
  sessionRecords: [],
  handoffNote: "",
  onBreak: false,
  aiKeyHolders: [],
};

describe("timer のスナップショット DTO（wire の同形性）", () => {
  it("組み立てた room が RoomSchema を通る", () => {
    const room = buildTimerSnapshotRoom(membership, timer);
    expect(v.safeParse(RoomSchema, room).success).toBe(true);
  });

  it("名簿の参加者が wire の participants に写る", () => {
    const room = buildTimerSnapshotRoom(membership, timer);
    expect(room.participants.map((p) => p.participantId)).toEqual(["p_alice", "p_bob", "p_proxy1"]);
    expect(room.participants[0]).toMatchObject({ displayName: "アリス", presence: "online", hasAiKey: false });
  });

  it("代理はローテーションから合成され、isPlaceholder が立つ", () => {
    const room = buildTimerSnapshotRoom(membership, timer);
    const proxy = room.participants.find((p) => p.participantId === "p_proxy1");
    expect(proxy).toMatchObject({
      displayName: "同席のカルロス",
      isPlaceholder: true,
      presence: "offline",
      connId: null,
      driverEligible: true,
    });
  });

  it("rotation は参加者 ID の配列として出る（代理は自分の ID）", () => {
    const room = buildTimerSnapshotRoom(membership, timer);
    expect(room.session.rotation).toEqual(["p_alice", "p_proxy1"]);
  });

  it("config.members はローテーションの表示名として解決される", () => {
    const room = buildTimerSnapshotRoom(membership, timer);
    expect(room.config.members).toEqual(["アリス", "同席のカルロス"]);
  });

  it("見送り中のエントリは driverEligible=false として出る", () => {
    const skipped: TimerState = {
      ...timer,
      session: {
        ...timer.session,
        rotation: [{ kind: "member", participantId: "p_alice", eligible: false }],
        driverCounts: [0],
      },
    };
    const room = buildTimerSnapshotRoom(membership, skipped);
    const alice = room.participants.find((p) => p.participantId === "p_alice");
    expect(alice?.driverEligible).toBe(false);
  });

  it("AI 鍵の持ち主は hasAiKey=true として出る", () => {
    const room = buildTimerSnapshotRoom(membership, { ...timer, aiKeyHolders: ["p_bob"] });
    expect(room.participants.find((p) => p.participantId === "p_bob")?.hasAiKey).toBe(true);
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

```bash
corepack pnpm --filter @tasuki/sync test -- timer-snapshot-dto
```
Expected: FAIL（`timer-snapshot-dto` も `TimerState` も無い）

- [ ] **Step 3: timer-core の型を割る**

`packages/timer-core/src/wire.ts` を新設し、**wire の投影**をここへ移す。

```ts
/**
 * wire の投影（クライアントへ送る形）。**ドメインの集約ではない。**
 *
 * #95 S4a で名簿は `@tasuki/room-core` が正本になった。ここにある `Participant` と
 * `Room` は、名簿と timer の状態をアプリケーション層で合成した結果の**形だけ**を表す
 * （`apps/tasuki-sync/src/application/timer-snapshot-dto.ts` が組む）。
 * サーバー側の timer の集約は `TimerState`（aggregate.ts）である。
 *
 * `poker-core` の `ParticipantView`（protocol.ts）と同じ整理で、名前を変えていないのは
 * `apps/timer-web` の 18 ファイルがこの型名で受けているためである（改名は振る舞いと
 * 無関係な差分を撒く）。
 */
import type { CompletionRecord, Problem, ProblemMode, RoomPhase, ServerClock, SessionConfig, SessionState } from "./aggregate.js";

export interface Participant {
  participantId: string;
  connId: string | null;
  displayName: string;
  presence: "online" | "idle" | "offline";
  hasAiKey: boolean;
  joinedAt: number;
  isPlaceholder?: boolean;
  driverEligible?: boolean;
}

export interface Room {
  code: string;
  createdAt: number;
  config: SessionConfig & { members: string[] };
  problem: Problem | null;
  session: { rotation: string[]; currentIndex: number; isPaused: boolean; driverCounts: number[]; totalSwitches: number };
  clock: ServerClock;
  phase: RoomPhase;
  participants: Participant[];
  sessionRecords: CompletionRecord[];
  handoffNote: string;
  onBreak: boolean;
  problemMode?: ProblemMode;
  passphraseProtected?: boolean;
  aiUnlocked?: boolean;
}
```

`packages/timer-core/src/aggregate.ts` を次のように変える。

1. `interface Participant` を**削除**（wire.ts へ移した）
2. `interface Room` を**削除**し、代わりに `TimerState` を置く
3. `SessionConfig` から `members: string[]` を**削除**
4. `SessionState.rotation` を `RotationEntry[]` へ
5. `startedAt` を**削除**（読み手 0 件・実測済み）

```ts
/** ローテーションの 1 席（D6）。代理は名簿の住人ではなく、輪の上のラベルである。 */
export type RotationEntry =
  | { kind: "member"; participantId: string; eligible: boolean }
  | { kind: "proxy"; id: string; label: string; eligible: boolean };

/** ローテーションの席の識別子。member は参加者ID、proxy は自分の ID。 */
export function rotationEntryId(entry: RotationEntry): string {
  return entry.kind === "member" ? entry.participantId : entry.id;
}

/** セッション状態（時間系を含まない） */
interface SessionState {
  rotation: RotationEntry[];
  currentIndex: number;
  isPaused: boolean;
  driverCounts: number[];
  totalSwitches: number;
}

/**
 * サーバー側の timer の状態。**名簿を持たない**（#95 S4a・D2）。
 * 名簿は `@tasuki/room-core` の `Room` が正本で、`code` で突き合わせる。
 */
export interface TimerState {
  code: string;
  createdAt: number;
  config: SessionConfig;
  problem: Problem | null;
  session: SessionState;
  clock: ServerClock;
  phase: RoomPhase;
  sessionRecords: CompletionRecord[];
  handoffNote: string;
  onBreak: boolean;
  problemMode?: ProblemMode;
  passphraseProtected?: boolean;
  aiUnlocked?: boolean;
  /** AI お題生成の鍵を持つ参加者。wire の `Participant.hasAiKey` の出所。 */
  aiKeyHolders: string[];
}
```

- [ ] **Step 4: 完成記録の署名を変える**

`packages/timer-core/src/records.ts` —— `config.members` は消えたので、解決済みの表示名を受け取る。

```ts
export function buildCompletionRecord(
  agg: Aggregate,
  problem: Problem,
  config: SessionConfig,
  /** ローテーション順の表示名。名簿は timer-core の外にあるので呼び出し側が解決して渡す（#95 D15） */
  memberNames: readonly string[],
  now: number,
  roomId?: string,
): CompletionRecord {
  // ...（既存のまま。members だけ差し替える）
  members: [...memberNames],
}
```

呼び出し側は 2 箇所。
- `apps/tasuki-sync/src/application/apply-room-level-event.ts` の `SessionCompleted`：`rotationDisplayNames(membership, timer)` の結果を渡す
- `apps/timer-web/src/**`：`room.config.members` を渡す（wire に残っているのでそのまま使える）

- [ ] **Step 5: rotation を触る箇所をエントリ基準へ直す**

`packages/timer-core/src/decide.ts`:
- `280` 付近の `agg.session.rotation.includes(trimmed)` →
  `agg.session.rotation.some((e) => e.kind === "member" && e.participantId === trimmed)`
- `384-388` の `partial.members` を見る分岐を**削除する**。`build-domain-command.ts:40` が境界で
  `members` を落としているため wire から到達不能な死んだ検査である。**削除前に、到達不能で
  あることを確かめる**（Step 7 の破壊検証）
- 長さを見る箇所（`139` / `284` / `256` / `296` / `306` / `319` / `337`）は `rotation.length` の
  ままで正しい

`packages/timer-core/src/evolve.ts`:
- `MemberAdded` は `{ kind: "member", participantId, eligible: true }` を積む
- `MemberRemoved` / `MemberMoved` / `MembersShuffled` は配列操作なので添字のまま
- `445` 付近の `members: []` を含む初期 config から `members` を落とす

- [ ] **Step 6: アプリ層を 3 者の合成へ直す**

`apps/tasuki-sync/src/application/timer-snapshot-dto.ts`（新規）:

```ts
/**
 * 名簿（room-core）＋ timer の状態（timer-core）→ wire の `snapshot.room` を組む（#95 D16）。
 *
 * **ドメインに互いを知らせないための場所である。** ここでしか 2 つの文脈は出会わない。
 * 出力の形は S4a で変えない（既存の Web とその テストが「変えていない」ことの証拠になる）。
 */
import type { Room as MembershipRoom } from "@tasuki/room-core";
import { rotationEntryId, type Participant, type Room, type RotationEntry, type TimerState } from "@tasuki/timer-core";

/** ローテーション順の表示名。member は名簿から、proxy はラベルから解決する。 */
export function rotationDisplayNames(membership: MembershipRoom, timer: TimerState): string[] {
  const names = new Map(membership.participants.map((p) => [p.id, p.displayName]));
  return timer.session.rotation.map((e) =>
    e.kind === "proxy" ? e.label : (names.get(e.participantId) ?? ""),
  );
}

function eligibleOf(rotation: readonly RotationEntry[], id: string): boolean | undefined {
  const entry = rotation.find((e) => rotationEntryId(e) === id);
  return entry?.eligible;
}

export function buildTimerSnapshotRoom(membership: MembershipRoom, timer: TimerState): Room {
  const aiKeys = new Set(timer.aiKeyHolders);
  const members: Participant[] = membership.participants.map((p) => ({
    participantId: p.id,
    connId: p.connId,
    displayName: p.displayName,
    presence: p.presence,
    hasAiKey: aiKeys.has(p.id),
    joinedAt: p.joinedAt,
    ...(eligibleOf(timer.session.rotation, p.id) === false ? { driverEligible: false } : {}),
  }));
  const proxies: Participant[] = timer.session.rotation
    .filter((e): e is Extract<RotationEntry, { kind: "proxy" }> => e.kind === "proxy")
    .map((e) => ({
      participantId: e.id,
      connId: null,
      displayName: e.label,
      presence: "offline" as const,
      hasAiKey: false,
      joinedAt: membership.createdAt,
      isPlaceholder: true,
      driverEligible: e.eligible,
    }));
  return {
    code: timer.code,
    createdAt: timer.createdAt,
    config: { ...timer.config, members: rotationDisplayNames(membership, timer) },
    problem: timer.problem,
    session: { ...timer.session, rotation: timer.session.rotation.map(rotationEntryId) },
    clock: timer.clock,
    phase: timer.phase,
    participants: [...members, ...proxies],
    sessionRecords: timer.sessionRecords,
    handoffNote: timer.handoffNote,
    onBreak: timer.onBreak,
    ...(timer.problemMode !== undefined ? { problemMode: timer.problemMode } : {}),
    ...(timer.passphraseProtected !== undefined ? { passphraseProtected: timer.passphraseProtected } : {}),
    ...(timer.aiUnlocked !== undefined ? { aiUnlocked: timer.aiUnlocked } : {}),
  };
}
```

`apps/tasuki-sync/src/application/handlers.ts` の 2 つの補助関数を置き換える。

```ts
/** ドライバー対象外の添字。適格はエントリが持ち、在席は名簿が持つ（D21 の在席判定は S4b）。 */
function computeIneligibleIndices(membership: MembershipRoom, timer: TimerState): Set<number> {
  const offline = new Set(
    membership.participants.filter((p) => p.presence === "offline").map((p) => p.id),
  );
  const set = new Set<number>();
  timer.session.rotation.forEach((entry, i) => {
    if (entry.eligible === false) {
      set.add(i);
      return;
    }
    // 代理は Web 非接続が常態で、対面で在席する実在の人を表す。offline では外さない。
    if (entry.kind === "member" && offline.has(entry.participantId)) set.add(i);
  });
  return set;
}
```

`rotationDisplayNames` は `timer-snapshot-dto.ts` の同名関数を import して使う（`handlers.ts:780`
の実装は削除）。`config.members` を同期していた `handlers.ts:576-580` と
`participant-remove.ts:156` の代入は**丸ごと削除する**（DTO が毎回解決するので不要）。

`apply-room-level-event.ts`:
- `ProxyMemberAdded` は名簿に足さず、`rotation` に `{ kind: "proxy", id: event.participantId, label: event.displayName, eligible: true }` を積む
- `ParticipantRenamed` は名簿側（room-core の `Room`）を更新する。**代理の改名はエントリの `label` を更新する**
- `DriverSkipped` / `DriverResumed` は該当エントリの `eligible` を書き換える
- `SessionCompleted` は `buildCompletionRecord(agg, problem, config, rotationDisplayNames(membership, timer), event.now, code)` を呼ぶ

`problem-delegation.ts:345` の候補抽出は名簿と `aiKeyHolders` の突き合わせに変える。

```ts
const holders = new Set(timer.aiKeyHolders);
membership.participants
  .filter((p) => p.presence === "online" && p.connId !== null && holders.has(p.id))
  .sort((a, b) => a.joinedAt - b.joinedAt)
```

- [ ] **Step 7: 破壊検証（削除した検査が本当に死んでいたか）**

`decide.ts` の `partial.members` 分岐を消す前に、**消さずに**次を確かめる。

```bash
git stash list   # 事前に作業ツリーの状態を把握する
git status --porcelain   # 空でないなら先にコミットする（過去 3 回、未コミットの実装を消した）
```

`apps/tasuki-sync/test` に 1 本だけ一時テストを置き、`config.set` に `members: ["A"]` を
含めて送っても `BelowMinMembers` が返らない（境界で落ちる）ことを確かめる。確認できたら
その一時テストは**消す**（性質が概念ごと消えたため。§6.5）。

- [ ] **Step 8: 層ごとにテストを通す**

```bash
corepack pnpm --filter @tasuki/timer-core test
corepack pnpm --filter @tasuki/sync test
corepack pnpm --filter @tasuki/timer-web test
corepack pnpm test
```
Expected: すべて PASS。**timer-web のテストは 1 行も書き換えずに通ること**が
「wire を変えていない」ことの証拠になる（`buildCompletionRecord` の呼び出し 1 箇所を除く）。
落ちたら DTO 側を疑う —— テストを直しにいかない。

- [ ] **Step 9: コミット**

```bash
git add -A
git commit -m "refactor!: timer から名簿を抜き、ローテーションをエントリにする（#245）

- timer-core の Room/Participant を wire の投影（wire.ts）へ移し、サーバー側の集約を TimerState にする
- SessionState.rotation を RotationEntry[] にし、代理を輪の上のラベルにする（D6）
- SessionConfig.members を廃止し、表示名の解決を DTO 組み立てへ移す（D15）
- buildCompletionRecord が解決済みの表示名を引数で受ける
- Room.startedAt を削除する（役割の廃止で読み手が 0 になっていた）
- 名簿は @tasuki/room-core の Room を RoomStore が保管する"
```

---

### Task 3: poker を `Round` 中心にし、名簿を room-core へ渡す

**Files:**
- Create: `packages/poker-core/src/name.ts`（`NAME_MAX_LENGTH` / `isValidName` / `RoomError` の引っ越し先）
- Create: `apps/tasuki-sync/src/poker/ports/round-store.ts`
- Create: `apps/tasuki-sync/src/poker/adapters/in-memory-round-store.ts`
- Delete: `packages/poker-core/src/room.ts` / `apps/tasuki-sync/src/poker/ports/room-store.ts` / `apps/tasuki-sync/src/poker/adapters/in-memory-room-store.ts`
- Modify: `packages/poker-core/src/{round,snapshot,index}.ts`
- Modify: `packages/poker-core/tests/{room,round,round.all-equal,snapshot}.test.ts`
- Modify: `apps/tasuki-sync/src/poker/application/{handlers,commit-room-action}.ts`
- Modify: `apps/tasuki-sync/src/application/token-store.ts`（poker の復帰トークンを受け入れる）

**Interfaces:**
- Consumes: Task 1 の `@tasuki/room-core`、Task 2 の `RoomStore`（名簿）
- Produces:
  - `interface VoterView { id: string; connected: boolean }`（poker-core が**局所定義**する構造的型）
  - `castVote(round: Round, voterId: string, card: Card): Result<Round, RoundError>`
  - `shouldAutoReveal(round: Round, voters: readonly VoterView[]): boolean`
  - `applyAutoReveal(round: Round, voters: readonly VoterView[]): Round`
  - `revealBy(round: Round, actorId: string): Result<Round, RoundError>`
  - `nextRound(round: Round, actorId: string): Result<Round, RoundError>`
  - `discardVote(round: Round, voterId: string): Round`
  - `createSnapshotBuilder(roomId: string, round: Round, participants: readonly ParticipantFragment[]): (viewerId: string) => RoomStateMessage`
  - `interface RoundStore { get(roomId): Round | undefined; put(roomId, round): void; remove(roomId): void }`

**なぜ import ではなく構造的型か**: `scripts/audit-dependency-direction.mjs:97` の許可表は
`packages/poker-core` に `["@tasuki/protocol"]` しか許していない。`@tasuki/room-core` から
型を import した瞬間に検査が赤になる（D2「ツールのコアは room-core に依存しない」）。

- [ ] **Step 1: 失敗するテストを書く**

`packages/poker-core/tests/round.test.ts` に足す（既存の `Room` を使うテストは Step 4 で移す）。

```ts
import { describe, expect, it } from "vitest";
import { applyAutoReveal, castVote, discardVote, shouldAutoReveal, type Round } from "../src/round";

const voting = (): Round => ({ status: "voting", votes: new Map() });

describe("Round が集約ルート（#95 S4a）", () => {
  it("投票は Round だけで完結する", () => {
    const result = castVote(voting(), "p1", { kind: "number", value: 3 });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().votes.get("p1")).toEqual({ kind: "number", value: 3 });
  });

  it("在室者が全員投票したら自動公開の条件が立つ", () => {
    const round = castVote(voting(), "p1", { kind: "number", value: 3 })._unsafeUnwrap();
    const voters = [{ id: "p1", connected: true }, { id: "p2", connected: false }];
    expect(shouldAutoReveal(round, voters)).toBe(true);
  });

  it("接続中の未投票が 1 人でも居れば自動公開しない", () => {
    const round = castVote(voting(), "p1", { kind: "number", value: 3 })._unsafeUnwrap();
    const voters = [{ id: "p1", connected: true }, { id: "p2", connected: true }];
    expect(shouldAutoReveal(round, voters)).toBe(false);
    expect(applyAutoReveal(round, voters).status).toBe("voting");
  });

  it("在室者が 0 人なら自動公開しない（空集合で恒真化しないこと）", () => {
    const round = castVote(voting(), "p1", { kind: "number", value: 3 })._unsafeUnwrap();
    expect(shouldAutoReveal(round, [])).toBe(false);
  });

  it("退出した人の票は捨てる（R8）", () => {
    const round = castVote(voting(), "p1", { kind: "number", value: 3 })._unsafeUnwrap();
    expect(discardVote(round, "p1").votes.has("p1")).toBe(false);
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

```bash
corepack pnpm --filter @tasuki/poker-core test
```
Expected: FAIL（`discardVote` が無い・`shouldAutoReveal` の引数が合わない）

- [ ] **Step 3: `round.ts` を書き換える**

```ts
/** 名簿の断片。**room-core を import しない**（依存方向の許可表・D2）。構造的部分型で受ける。 */
export interface VoterView {
  id: string;
  connected: boolean;
}

export function castVote(round: Round, voterId: string, card: Card): Result<Round, RoundError> {
  if (round.status !== "voting") return err({ code: "not-voting", op: "vote" });
  const votes = new Map(round.votes);
  votes.set(voterId, card);
  return ok({ ...round, votes });
}

/** 自動公開の判定（FR-008）。**接続中が 0 人なら立たない**（空集合での恒真化を防ぐ）。 */
export function shouldAutoReveal(round: Round, voters: readonly VoterView[]): boolean {
  if (round.status !== "voting") return false;
  const connected = voters.filter((v) => v.connected);
  return connected.length > 0 && connected.every((v) => round.votes.has(v.id));
}

export function applyAutoReveal(round: Round, voters: readonly VoterView[]): Round {
  if (!shouldAutoReveal(round, voters)) return round;
  return { ...round, status: "revealed" };
}

/**
 * 手動公開（FR-009）。#95 S3 で役割が消え、在室者なら誰でも実行できる。
 * **在室確認はしない** —— 在室性は接続の束縛が担保する既存設計であり、
 * 在席（D14・D21）で見直すのは S4b（#246）である（S4a では振る舞いを変えない）。
 */
export function revealBy(round: Round, _actorId: string): Result<Round, RoundError> {
  if (round.status !== "voting") return err({ code: "not-voting", op: "reveal" });
  return ok({ ...round, status: "revealed" as const });
}

/** 再投票・次ラウンド（FR-011）。在室確認をしない理由は `revealBy` と同じ。 */
export function nextRound(round: Round, _actorId: string): Result<Round, RoundError> {
  if (round.status !== "revealed") return err({ code: "not-revealed", op: "next-round" });
  return ok({ status: "voting" as const, votes: new Map() });
}

/** 退出した参加者の票を捨てる（R8）。名簿からの除去とセットでアプリ層が呼ぶ。 */
export function discardVote(round: Round, voterId: string): Round {
  if (!round.votes.has(voterId)) return round;
  const votes = new Map(round.votes);
  votes.delete(voterId);
  return { ...round, votes };
}
```

- [ ] **Step 4: `room.ts` を解体する**

- `NAME_MAX_LENGTH` / `isValidName` / `RoomError` → `packages/poker-core/src/name.ts` へ**そのまま移す**
  （**値も規則も変えない**。poker の名前上限 24 は境界の規則としてこのまま残る。
  `room-core` の `MAX_DISPLAY_NAME = 40` と食い違うが、**S4a で寄せない** —— 寄せると
  poker の入力規則が変わり「振る舞いを変えていない」証拠が崩れる。統合は入口が 1 つになる S5）
- `Participant` / `Room` / `createRoom` / `joinRoom` / `markConnected` / `markDisconnected` /
  `findParticipantByToken` / `ParticipantIds` / `RoomUpdate` → **削除**。名簿は room-core、
  トークンは `token-store` が担う
- `packages/poker-core/tests/room.test.ts` の各テストは 1 本ずつ判断する（§6.5）。
  名前規則のテストは `tests/name.test.ts` へ**移す**。名簿操作のテストは
  `packages/room-core/tests/room.test.ts` が引き取っているので**消す**。
  **PR 本文に「消した／移した」を 1 本ずつ根拠つきで書く**

- [ ] **Step 5: `snapshot.ts` を Round と名簿の断片から組む形にする**

```ts
export interface ParticipantFragment {
  id: string;
  name: string;
  connected: boolean;
}

export function createSnapshotBuilder(
  roomId: string,
  round: Round,
  participants: readonly ParticipantFragment[],
): (viewerId: string) => RoomStateMessage {
  const views = participants.map((p) => ({
    id: p.id,
    name: p.name,
    connected: p.connected,
    hasVoted: round.votes.has(p.id),
  }));
  // 以降は既存のまま（voting 中は他者の票をいかなるフィールドにも含めない・SC-004）
}
```

- [ ] **Step 6: poker のアプリ層を付け替える**

- `store`（poker の `RoomStore`）→ **名簿は Task 2 の `RoomStore`、ラウンドは新しい `RoundStore`**
- `createRoom` / `joinRoom` の呼び出しは、`room-core` の `addParticipant` と
  `idGen.participantId()` の組み合わせに置き換える。**ID 生成器は 2 つのまま**にする
  （コード空間は構造的に衝突しない: timer は必ず `-` を含むか 6 文字大文字、poker は 8 文字小文字）
- `findParticipantByToken` → `tokenStore.getResume(token)` に置き換える。**`roomCode` が
  要求されたルームと一致することを必ず確かめる**（一致しなければ新規参加として扱う）
- `markDisconnected` / `markConnected` → `detachConnection` / `attachConnection`

- [ ] **Step 7: テストを通す**

```bash
corepack pnpm --filter @tasuki/poker-core test
corepack pnpm --filter @tasuki/sync test
corepack pnpm --filter @tasuki/poker-web test
node scripts/audit-dependency-direction.mjs
node scripts/audit-public-surface.mjs
```
Expected: すべて PASS。**`audit-dependency-direction.mjs` が緑であること**が
「poker-core が room-core を import していない」ことの証拠になる

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "refactor!: poker-core の Round を集約ルートにする（#245）

- Room/Participant を poker-core から削除し、名簿は room-core を使う
- 自動公開・投票・公開・次ラウンドは Round と名簿の断片で完結する
- 退出時に票を捨てる discardVote を足す（R8）
- 復帰トークンの照合を token-store へ寄せる
- 名前規則（上限 24）は境界の規則として name.ts にそのまま残す"
```

---

### Task 4: ルームの寿命を一本化する

保管が 1 つになったので、寿命規則も 1 つにする。**poker の即時破棄を撤去**し、
`destroy-room` と `room-reclaimer` を唯一の経路にする（R10・D8）。

**Files:**
- Create: `apps/tasuki-sync/test/room-lifecycle.test.ts`
- Modify: `apps/tasuki-sync/src/poker/application/handlers.ts:143-145`（`countIn === 0 → store.remove` の撤去）
- Modify: `apps/tasuki-sync/src/application/destroy-room.ts`（`RoundStore` の解放を足す）
- Modify: `apps/tasuki-sync/src/application/command-handlers/participant-remove.ts:120-128`
- Modify: `apps/tasuki-sync/src/create-sync-server.ts`（`destroyRoom` に `RoundStore` を配線）

**Interfaces:**
- Consumes: Task 2 の `TimerStore`、Task 3 の `RoundStore`
- Produces: `destroyRoom(roomCode)` が名簿・timer 状態・ラウンド・トークン・タイマー予約を一括解放する

- [ ] **Step 1: 失敗するテストを書く**

`apps/tasuki-sync/test/room-lifecycle.test.ts`:

```ts
/**
 * ルームの寿命は 1 つの規則で決まる（#95 S4a・R10・D8）。
 *
 * 組み立ては `test/support/room-builder.ts` の `makeTestHandlers` に揃える
 * （`passphrase.test.ts` と同じ形）。TTL の観測は `room-reclaimer.test.ts` の
 * `sweep(now)` を直に呼ぶ形を踏襲する（時計を進めずに済む）。
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { InMemoryRoundStore } from "../src/poker/adapters/in-memory-round-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { RoomReclaimer } from "../src/application/room-reclaimer.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const TTL = 1_800_000;

let store: InMemoryRoomStore;
let timers: InMemoryTimerStore;
let rounds: InMemoryRoundStore;
let broadcaster: SpyBroadcaster;
let handlers: ReturnType<typeof makeTestHandlers>;
let code: string;

beforeEach(async () => {
  store = new InMemoryRoomStore();
  timers = new InMemoryTimerStore();
  rounds = new InMemoryRoundStore();
  broadcaster = new SpyBroadcaster();
  handlers = makeTestHandlers({
    store,
    timers,
    rounds,
    clock: new FakeClock(1_000_000),
    broadcaster,
    codeGen: new FakeCodeGen(),
  });
  await handlers.handleCommand("c1", { command: "room.create", displayName: "アリス" });
  code = broadcaster.createdFor("c1").code;
});

describe("ルームの寿命", () => {
  it("接続が全部切れても、名簿とツールの状態は残る（即時破棄をやめた）", () => {
    handlers.handleDisconnect("c1");
    expect(store.get(code)).toBeDefined();
    expect(timers.get(code)).toBeDefined();
  });

  it("全員 offline のまま TTL を超えると、名簿・timer 状態・ラウンドが揃って消える", () => {
    rounds.put(code, { status: "voting", votes: new Map() });
    handlers.handleDisconnect("c1");
    const reclaimer = new RoomReclaimer({
      store,
      idleTtlMs: TTL,
      onReclaim: (c) => handlers.destroyRoom(c),
    });
    reclaimer.sweep(2_000_000);
    reclaimer.sweep(2_000_000 + TTL);
    expect(store.get(code)).toBeUndefined();
    expect(timers.get(code)).toBeUndefined();
    expect(rounds.get(code)).toBeUndefined();
  });

  it("TTL に満たない間は消えない（対照実行）", () => {
    handlers.handleDisconnect("c1");
    const reclaimer = new RoomReclaimer({
      store,
      idleTtlMs: TTL,
      onReclaim: (c) => handlers.destroyRoom(c),
    });
    reclaimer.sweep(2_000_000);
    reclaimer.sweep(2_000_000 + TTL - 1);
    expect(store.get(code)).toBeDefined();
  });

  it("最後の 1 人が明示的に退出すると即時に破棄される（既存の振る舞い）", async () => {
    const self = store.get(code)!.participants[0]!.id;
    await handlers.handleCommand("c1", { command: "participant.remove", participantId: self });
    expect(store.get(code)).toBeUndefined();
    expect(timers.get(code)).toBeUndefined();
  });

  it("代理が輪に残っていても、名簿が空になれば破棄される（S3 が残した宿題）", async () => {
    await handlers.handleCommand("c1", {
      command: "participant.addProxy",
      displayName: "同席のカルロス",
    });
    expect(timers.get(code)!.session.rotation.some((e) => e.kind === "proxy")).toBe(true);

    const self = store.get(code)!.participants[0]!.id;
    await handlers.handleCommand("c1", { command: "participant.remove", participantId: self });

    expect(store.get(code)).toBeUndefined();
    expect(timers.get(code)).toBeUndefined();
  });
});
```

**poker 側の 2 本は実 WS で書く**（`test/poker/helpers.ts` の `startServer` / `WsClient`）。

```ts
it("poker で全員が閉じてもルームは残り、戻ると票が残っている（D8）", async () => {
  // create-room → vote → 切断 → 同じ token で join-room → room-state の yourVote が残っている
  // 判定は yourVote の値そのもので行う（「room-state が来た」だけでは通ってしまう）
});
```

この 1 本だけは**書き方の指定**にとどめる —— `helpers.ts` の `WsClient` は
`nextMatching(isType(...))` で受けるので、上の 4 本とは組み立てが違う。
`rejoin.test.ts` の token 復帰の手順をそのまま流用すること。

- [ ] **Step 2: 落ちることを確かめる**

```bash
corepack pnpm --filter @tasuki/sync test -- room-lifecycle
```
Expected: 1・2・3・5 が FAIL、4 が PASS

- [ ] **Step 3: 即時破棄を撤去する**

`apps/tasuki-sync/src/poker/application/handlers.ts` の `detachFromCurrentRoom` から次を消す。

```ts
    if (broadcaster.countIn(roomId) === 0) {
      store.remove(roomId);
      return;
    }
```

**代わりに常に `detachConnection` を通す。** 撤去の理由をその場に残す。

```ts
    // #95 S4a: 最後の接続が切れた瞬間の破棄をやめた。ルームの寿命は room-reclaimer の
    // TTL と participant.remove の在室者 0 判定に一本化されている（R10・D8）。
    // 保管が 1 つになったため、ここで消すと越境した timer のルームまで巻き添えになる。
```

- [ ] **Step 4: 後始末に `RoundStore` を足す**

`destroy-room.ts` の後始末は「発火しうるものを先に止め、最後に実体を消す」順序を守る。
`RoundStore` と `TimerStore` の解放は**実体の削除と同じ最後の段**に置く。

- [ ] **Step 5: 在室者の数え方から代理を外す**

`participant-remove.ts:120-128` のコメントは「在室者の数え方は代理(`isPlaceholder`)も
『残る人』に数える」と、**S4a で消した記号を名指ししている**。代理は名簿の住人ではなく
なったので、この注釈と数え方を書き換える。

```ts
  // 在室者は名簿の人だけを数える。代理はローテーション上のラベルであり、名簿には居ない（D6）。
  // 名簿が空になれば、輪に代理が残っていてもルームごと破棄する
  // （S3 が残した「代理だけが残る部屋」はこの変更で作れなくなる）。
  const remainingResidents = membership.participants.filter((p) => p.id !== targetId);
```

同じ節の「rotation が空の部屋に人が取り残される破綻を作らない」判定も、
`rotation.length <= 1` をエントリ基準で読み直す。

- [ ] **Step 6: テストを通す**

```bash
corepack pnpm --filter @tasuki/sync test
corepack pnpm test
```
Expected: PASS。**`apps/tasuki-sync/test/poker/` で即時破棄を前提にしていたテストは
書き換えになる**（規則が変わった＝§6.5 の「移す」側。消してはならない）

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "refactor!: ルームの寿命を TTL 回収に一本化する（#245）

- poker の「最後の接続が切れたら即破棄」を撤去する
- destroy-room が名簿・timer 状態・ラウンド・トークンを一括で解放する
- 在室者の数え方から代理を外し、代理だけが残る部屋を作れなくする
- poker は全員が閉じても TTL の間ルームが残り、戻れば票も残る（D8・R10）"
```

---

### Task 5: 入口の門・レート制限・`MAX_ROOMS`

保管を 1 つにした帰結の 3 つを、**同じ PR の中で**決着させる。

**Files:**
- Create: `apps/tasuki-sync/src/application/tool-gate.ts`
- Create: `apps/tasuki-sync/test/tool-gate.test.ts`
- Modify: `apps/tasuki-sync/src/application/command-handlers/room-join.ts`（門を通す）
- Modify: `apps/tasuki-sync/src/poker/application/handlers.ts`（門を通す）
- Modify: `apps/tasuki-sync/src/create-sync-server.ts`（`RateLimiter` を 1 つ作って両方へ注入）
- Modify: `apps/tasuki-sync/src/config.ts:165`（`MAX_ROOMS` の既定）
- Modify: `deploy/timer/env.example:28` / `deploy/timer/NOTES.md`

**Interfaces:**
- Consumes: Task 2 の `TimerStore`、Task 3 の `RoundStore`
- Produces: `canEnterVia(tool: "timer" | "poker", code: string): boolean`

- [ ] **Step 1: 合言葉の迂回を再現する失敗テストを書く**

`apps/tasuki-sync/test/tool-gate.test.ts`:

```ts
/**
 * 入口ごとの門（#95 S4a）。名簿の保管を 1 つにしたことで生まれた越境を塞ぐ。
 *
 * **1 つのサーバーに両方の入口があるので、実 WS で両方を叩く。**
 * timer は `ws://.../`、poker は `ws://.../poker/ws`（`ws-adapter.ts` の POKER_WS_PATH）。
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createRoom,
  startLiveSyncServer,
  type LiveSyncServer,
} from "./support/live-sync-server.js";

let server: LiveSyncServer;

/** poker の入口へ生の WS で繋ぎ、最初の応答を 1 つ受け取る。 */
async function pokerJoin(port: number, roomId: string, name: string): Promise<{ type: string }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/poker/ws`);
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  const received = new Promise<{ type: string }>((resolve) => {
    ws.addEventListener("message", (e) => resolve(JSON.parse(String(e.data))), { once: true });
  });
  ws.send(JSON.stringify({ type: "join-room", roomId, name }));
  const msg = await received;
  ws.close();
  return msg;
}

beforeEach(() => {
  server = startLiveSyncServer();
});
afterEach(async () => {
  await server.close();
});

describe("入口の門（越境の遮断・#95 S4a）", () => {
  it("パスフレーズ保護された timer のルームへ poker の入口から入れない", async () => {
    // Given: 合言葉つきの timer ルーム
    const owner = await server.connect("owner");
    const created = await createRoom(owner, "アリス");
    owner.send({ command: "room.passphrase.set", passphrase: "secret" });
    await owner.until((m) => m.type === "snapshot" && m.room.passphraseProtected === true);

    // When: そのコードを poker の入口へ与える
    const msg = await pokerJoin(server.port, created.code, "侵入者");

    // Then: 合言葉を聞かれることもなく、存在しないルームとして拒まれる
    expect(msg).toMatchObject({ type: "error", code: "room-not-found" });
  });

  it("実在する timer のコードと、実在しないコードの応答が同一になる（列挙の手がかりを与えない）", async () => {
    const owner = await server.connect("owner");
    const created = await createRoom(owner, "アリス");

    const real = await pokerJoin(server.port, created.code, "だれか");
    const fake = await pokerJoin(server.port, "zzzzzzzz", "だれか");

    expect(real).toEqual(fake);
  });

  it("poker のルームへ timer の入口から入れない", async () => {
    // Given: poker のルーム（poker の入口で作る）
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/poker/ws`);
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));
    const joined = new Promise<{ roomId: string }>((resolve) => {
      ws.addEventListener("message", (e) => {
        const m = JSON.parse(String(e.data));
        if (m.type === "joined") resolve(m);
      });
    });
    ws.send(JSON.stringify({ type: "create-room", name: "ボブ" }));
    const { roomId } = await joined;

    // When / Then: timer の入口からは入れない
    const intruder = await server.connect("intruder");
    intruder.send({ command: "room.join", code: roomId, displayName: "侵入者", hasAiKey: false });
    const msg = await intruder.takeMatching((m) => m.type === "error", "error");
    expect(msg).toMatchObject({ code: "ROOM_NOT_FOUND" });
    ws.close();
  });

  it("自分のツールのルームへは今までどおり入れる（対照実行）", async () => {
    // 門が全部を塞いでいないことを確かめる。これが無いと「常に拒否」でも上の 3 本が緑になる
    const owner = await server.connect("owner");
    const created = await createRoom(owner, "アリス");
    const guest = await server.connect("guest");
    guest.send({ command: "room.join", code: created.code, displayName: "ボブ", hasAiKey: false });
    const msg = await guest.takeMatching(
      (m) => m.type === "room.joined" || m.type === "error",
      "room.joined",
    );
    expect(msg.type).toBe("room.joined");
  });
});
```

**先に「塞がない状態で赤になる」ことを見る。** 実装前にこの 4 本を流し、1〜3 が
**実際に入れてしまって**落ちることを目で確かめる（対策を書いてから書いたテストは、
対策の形をなぞるだけで穴を見つけない）。

- [ ] **Step 2: 落ちることを確かめる**

```bash
corepack pnpm --filter @tasuki/sync test -- tool-gate
```
Expected: 1・2・3 が FAIL（今は入れてしまう）、4 が PASS

- [ ] **Step 3: 門を実装する**

```ts
/**
 * 入口ごとの門（#95 S4a）。**そのツールの状態があるルームにだけ入れる。**
 *
 * 名簿の保管を 1 つにした結果、ルームコードの空間が両ツールで共有された。門が無いと
 * パスフレーズ保護された timer のルームへ poker の入口から入れてしまう（poker 側に
 * 合言葉の概念が無い）。応答は「存在しないルーム」と同一にする —— 区別できると
 * ルームコード列挙の手がかりになる（ADR-0011）。
 *
 * **S5 で入口が 1 つになると、この門は D8 のツール状態の遅延生成に置き換わる。**
 * 一時的な印（`origin` のようなフィールド）を名簿に持たせないのはそのためである。
 */
export interface ToolGateDeps {
  hasTimerState: (code: string) => boolean;
  hasRound: (code: string) => boolean;
}

export function createToolGate(deps: ToolGateDeps) {
  return {
    canEnterVia(tool: "timer" | "poker", code: string): boolean {
      return tool === "timer" ? deps.hasTimerState(code) : deps.hasRound(code);
    },
  };
}
```

`room-join.ts` では**名簿を引く前**に門を通し、拒否は既存の `ROOM_NOT_FOUND` と
**同じコード・同じ文言・同じレート制限の積算**で返す。poker 側も同様に `room-not-found` を返す。

- [ ] **Step 4: レート制限のバケツを 1 本にする**

`create-sync-server.ts` で `RateLimiter` を 1 つだけ作り、timer の `makeHandlers` と
poker のハンドラ組み立ての**両方へ注入する**。

**S2 が据え置いた理由を潰す。** timer 側は「`room.join` と `ai.unlock` が同一インスタンスを
共有する」ことを**構造で**保証していた（`makeHandlers` の内側で生成していた）。注入に変えると
その保証が構造から消えるので、**テストで置き換える**。

```ts
// apps/tasuki-sync/test/rate-limit-gate.test.ts に足す
it("room.join と ai.unlock と poker の join が同じバケツを消費する（1 IP 1 バケツ）", async () => {
  // 同一 rateKey で 3 経路を混ぜて叩き、合計が 1 つの上限で拒否されることを確かめる
});
```

- [ ] **Step 5: `MAX_ROOMS` を決め直す**

**値の正本は `docs/superpowers/specs/2026-06-07-tasuki-vps-deployment-design.md` §8（M-2）**
であり、この計画には転記しない。決め方だけ書く。

- 統合前の実効枠は **50 × 2 プロセス = 100**（`config.ts:165` の既定 50 を両文脈が別々に数えていた）
- 統合後は 1 本で数えるので、**実効枠を保つには 100**
- ただし Task 4 で poker のルームが即時解放から **TTL（既定 30 分）保持**に変わるため、
  同時に占有される数は増える。**`ROOM_IDLE_TTL_MS` は変えない**（変えると timer の
  復帰体験まで巻き添えになる）
- したがって `config.ts` の既定と `deploy/timer/env.example` の両方を **100** にする

```bash
# 実効枠の確認（起動ログが唯一の証拠。S2 の maxConn と同じ読み方）
corepack pnpm --filter @tasuki/sync dev  # listening-log の maxRooms を目視で確認する
```

- [ ] **Step 6: 配備資材と切り替え手順を書く**

`deploy/timer/env.example:28` を `MAX_ROOMS=100` にし、`deploy/timer/NOTES.md` の
切り替え手順へ**次の 1 手順を足す**。

```markdown
### #95 S4a を配布するときに 1 度だけ行うこと

**本番の `app.env` の `MAX_ROOMS` を 100 に書き換える。** `deploy/setup.sh` は既存 env を
**上書きしない**ので、`env.example` を直しただけでは本番に届かない。飛ばすと名簿の統合で
実効枠が 100 → 50 へ**半減する**（S2 の `MAX_CONNECTIONS` と同型の罠）。
確認は `journalctl` の起動ログに出る `maxRooms` の値で行う（唯一の証拠）。
```

- [ ] **Step 7: テストと検査を通す**

```bash
corepack pnpm --filter @tasuki/sync test
node scripts/audit-assembly-wiring.mjs
corepack pnpm test
```

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "feat!: 入口の門とレート制限・ルーム上限を統合に合わせる（#245）

- そのツールの状態があるルームにだけ入れる門を足す（合言葉の迂回を塞ぐ）
- 拒否は存在しないルームと同じ応答にし、コード列挙の手がかりを与えない
- レート制限のバケツを 1 IP 1 本にする（ADR-0004 の表どおり）
- MAX_ROOMS の既定と env.example を 100 にし、切り替え手順を NOTES.md へ書く"
```

---

### Task 6: 管理エンドポイントを名簿と timer 状態から組む

**Files:**
- Modify: `apps/tasuki-sync/src/application/admin.ts:31-46`
- Modify: `apps/tasuki-sync/test/admin.test.ts` / `config.admin.test.ts`

**Interfaces:**
- Consumes: Task 2 の `TimerStore`、Task 1 の名簿
- Produces: `buildAdminReport(rooms: MembershipRoom[], timerStates: Map<string, TimerState>, reclaimedCount, aiGeneration?)`

- [ ] **Step 1: 失敗するテストを書く**

```ts
it("poker のルームも数える（S2 の申し送りの解消）", () => {
  // 名簿に timer 由来 1 件・poker 由来 1 件 → activeRooms が 2
});

it("timer 状態が無いルームは hasDriver=false で出る", () => {
  // poker だけのルーム → hasDriver:false, participants/online は名簿から出る
});
```

- [ ] **Step 2: 落ちることを確かめる**

```bash
corepack pnpm --filter @tasuki/sync test -- admin
```
Expected: FAIL（`r.session` を読んでいてコンパイルが通らない）

- [ ] **Step 3: 実装する**

`hasDriver` は timer 状態を引けたときだけ `rotation.length > 0` で決め、引けなければ `false`。
`participants` / `online` / `code` / `createdAt` は名簿から取る。

- [ ] **Step 4: 通す・コミット**

```bash
corepack pnpm --filter @tasuki/sync test
git add -A
git commit -m "feat: 管理エンドポイントが poker のルームも数える（#245）

- buildAdminReport を名簿と timer 状態の合成に変える
- timer 状態を持たないルームは hasDriver=false で出る
- S2 の申し送り「/status・/admin/rooms は timer のルームしか数えない」を解消する"
```

---

### Task 7: E2E から寿命規則への依存を外す

**Files:**
- Modify: `e2e/specs/poker.spec.ts:185-210`

**なぜ必要か**: この spec は「ルームは最後の参加者の接続が切れた瞬間に消える」ことを
**前提として使っている**。Task 4 で TTL 30 分になるため、書き換えないと**赤になる**
（30 分は待てない）。守っている性質「消えたルームの招待リンクを開いた人は、戻る道つきで
知らされる」は保てる。

- [ ] **Step 1: 現状で赤になることを確かめる**

```bash
corepack pnpm e2e -- poker
```
Expected: 該当の 1 本が FAIL（ルームが消えないため）

- [ ] **Step 2: 実在しないルームを開く形へ書き換える**

`ルームを作って全員が離れる` 手順を、**実在しない ID の招待リンクを直接開く**手順へ置き換える。
コメントの `rooms.ts の dropIfEmpty` という**もう存在しない実装への参照**も併せて直す。

**既存タグの語彙は増やさない**（設計正本 §6.6）。判定は文字列一致・`toContain`・
否定の空振りを避ける（過去に「通っていないのに緑」が実際に出ている）。

- [ ] **Step 3: 緑になることを確かめる**

```bash
corepack pnpm e2e
```
Expected: 全件 PASS

- [ ] **Step 4: コミット**

```bash
git add e2e
git commit -m "test: poker の E2E から寿命規則への依存を外す（#245）

- 「全員が離れると消える」前提をやめ、実在しないルームの招待リンクを開く形にする
- 守っている性質（戻る道つきで知らされる）は変えない
- 存在しない実装（rooms.ts の dropIfEmpty）への参照を直す"
```

---

### Task 8: 検査・規範文書・変異検査・旧新比較

**Files:**
- Modify: `scripts/audit-*.mjs` の対象宣言（実行して赤くなったものだけ）
- Modify: `docs/timer/ARCHITECTURE.md` ほか、消した記号を名指しする文書
- Modify: `scripts/mutations/` と `scripts/mutation-check.mjs`（必要なら変異を足す）

- [ ] **Step 1: 消した記号を名指しする側を洗う**

**使う側の grep が 0 件でも、検査の対象宣言・例外表・日本語の散文が名指ししている。**
#95 S3 ではここから CI の赤 2 件と、11 巡すり抜けたコメント 9 件が出た。

```bash
git grep -n 'startedAt' -- docs scripts .github
git grep -n 'joinOrder' -- docs scripts .github
git grep -n 'config\.members\|isPlaceholder\|driverEligible\|hasAiKey' -- docs scripts .github
git grep -n 'findParticipantByToken\|markDisconnected\|markConnected' -- docs scripts .github
```

出た箇所を 1 つずつ直す。**既知の宛先**: `docs/timer/ARCHITECTURE.md`（`config.members`・`startedAt`）、
`docs/poker/specs/001-planning-poker-mvp/{data-model,contracts/ws-protocol}.md`（`joinOrder`）。
**休眠文書（`docs/plans/` 配下の完了済み記録）は直さない** —— 記録は当時の事実である。

- [ ] **Step 2: 検査を実行して、赤くなったものだけ直す**

```bash
for s in audit-structure audit-public-surface audit-dependency-direction audit-domain-side-effects \
         audit-log-hygiene audit-web-sync-boundary audit-assembly-wiring audit-domain-error-shape; do
  echo "=== $s"; node scripts/$s.mjs || echo "^^^ 赤"
done
node scripts/check-links.mjs
```

**落ちたら対象表を更新するのが正しい対応であり、検査を緩めてはならない**（設計正本 §7 地雷 8）。

- [ ] **Step 3: 変異検査**

```bash
git status --porcelain   # 空であること（空でないと走らない。過去に未コミットの実装を消した事故が 3 回）
node scripts/mutation-check.mjs
```

**§6.4 が名指しする最大の危険は `shouldAutoReveal` である。** 名簿を引数で受ける形にしたので、
**空集合しか渡さないテストは常に緑になる**。Task 3 Step 1 の「在室者が 0 人なら自動公開しない」が
その恒真化を殺す 1 本だが、**変異検査で確かめるまで信じない**。

- [ ] **Step 4: 旧新比較（危険な移設なので必ずやる）**

設計正本 §7 の指定に従い、**旧実装を復元して突き合わせる**。

```bash
git worktree add /tmp/tasuki-old 7c664e2   # S4a 着手前の main
```

同じ操作列（作成 → 参加 → 代理追加 → 見送り → 交代 → 完成 → 退出）を新旧へ流し、
`snapshot` の JSON を突き合わせる。**「正しい入力」しか送らないと穴を見逃す**
（S2 では綴りの揺れを送っておらず、レビューまで欠陥が残った）。
**送る**: 未知のコード・他ツールのコード・大小の揺れ・空の表示名・上限超えの表示名。

- [ ] **Step 5: 指標を数え直す**

```bash
node scripts/audit-structure.mjs
corepack pnpm test          # 件数はここの出力から取る。過去の記録と比べない
```

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "chore: S4a の検査と規範文書を実体に追随させる（#245）

- 消した記号を名指ししていた文書と対象宣言を直す
- 構造監査の指標を数え直す"
```

---

## 仕上げ

- [ ] **PR を作る**

```bash
git push -u origin feature/245-unify-roster
```

PR 本文には次を必ず含める。

1. **消したテスト／移したテストの一覧**（1 本ずつ根拠つき・設計正本 §6.5）
2. **利用者から見える変化 3 件**: poker のルームが TTL まで残り票も残る／入口ごとの門／
   管理エンドポイントが poker のルームも数える
3. **配備で 1 度だけ必要な手順**（本番 env の `MAX_ROOMS` を 100 へ）
4. **`Closes #245`** を**バッククォートで囲まずに**書く。逆に、説明のつもりで
   他の Issue 番号を地の文へ書かない（squash マージで勝手に閉じる）

- [ ] **`/code-review` を掛ける**

**文脈を共有しないレビューでなければ意味がない。** S3 では自前の 11 巡が全部見落とした欠陥を
`/code-review` が拾った。**worktree で作った PR は番号を明示する**（カレントブランチを見るため）。

- [ ] **デプロイはしない。** #95 の全段が終わるまで本番へは出さない。出すときは利用者の承認を取る

---

## 自己レビュー

**1. 設計正本の網羅**

| 設計正本の要求 | 実装するタスク |
|---|---|
| `room-core` に `Room` / `Participant` | Task 1 |
| timer から `participants` を消す・`RotationEntry`（D6） | Task 2 |
| `config.members` の廃止（D15） | Task 2 |
| `Round` を集約ルートに | Task 3 |
| DTO をアプリ層で組む（D16） | Task 2（timer）/ Task 3（poker） |
| R8（退出でローテーションから外し票を捨てる） | Task 3（`discardVote`）/ Task 4（`participant-remove`） |
| R10（全員切断＋猶予で破棄） | Task 4 |
| `MAX_ROOMS` とレート制限の統合（ADR-0004） | Task 5 |
| 変異検査（§6.4） | Task 8 |
| 旧新比較（§7） | Task 8 |
| S3 が残した宿題 3 件 | Task 2（`startedAt`）/ Task 3（在室確認をしない理由の記録）/ Task 4（代理だけの部屋） |

**2. S4a でやらないこと（S4b 以降）**

- 同一性の `localStorage` 化（D12）・多接続模型（D14）・在席によるドライバー適格判定（D21）
- `timer-core → room-core` の一時依存の除去（S4b）
- poker の名前規則（上限 24）と `room-core` の `MAX_DISPLAY_NAME`（40）の統合（S5）
- `presence` の値域から `"idle"` を落とすこと（wire の変更になる）
- ID 生成器の一本化（S5）

**3. 型の一貫性**

`RotationEntry` / `TimerState` / `VoterView` / `ParticipantFragment` / `RoundStore` /
`buildTimerSnapshotRoom` / `rotationDisplayNames` / `createToolGate` は、
定義したタスクと使うタスクで同じ名前・同じ署名を使っている（Task 2 → 3 → 4 → 5 → 6）。
