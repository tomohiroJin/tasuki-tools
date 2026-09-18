# 交代の輪の席と在席の扱いを揃える（#276）実装計画

> **作業者へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）か
> `superpowers:executing-plans` を使って、タスク単位で実装すること。
> 手順のチェックボックス（`- [ ]`）は進捗の記録に使う。

**ゴール:** サーバーが持っている「席ごとになぜ番が飛ぶか」と「次に実際に誰が運転するか」を
wire に載せ、timer の画面がそれを表示に使うようにする。

**方式:** `snapshot.room.session` に `seats`（席ごとの表示名と理由）と `nextIndex` を足す。
サーバー側は適格判定の実装を 1 本（`seatSkipReason`）に統合し、交代の判定
（`computeIneligibleIndices`）と表示の理由が定義上ずれない形にする。画面側は自前の
「次は誰か」計算 3 箇所を捨て、`nextIndex` を使う。

**技術スタック:** TypeScript / valibot（wire 検証）/ React 19 /
テストランナーは層ごとに違う —— `packages/*` と `apps/timer-web` は **vitest**、
`apps/tasuki-sync` は **bun test**。

**設計正本:** [`docs/superpowers/specs/2026-09-18-rotation-seat-and-presence-design.md`](../specs/2026-09-18-rotation-seat-and-presence-design.md)
（この計画は設計に従う。食い違ったら設計が正しい。設計の前提が実測で崩れたら**手を止めて設計へ戻る**）

## 全体の制約

- **ブランチは `fix/276-rotation-seat-and-presence`**（既にある。設計文書のコミット `14d6851` が入っている）
- **作業場所は `/workspaces/claym/local/Tasuki`**。worktree は切らない（切ると依存の入れ直しが要る）
- **UI 文言は書体の base 層に収まる字だけを使う。** 本計画が使う文言は実測済み
  （設計 §3.6）。**新しい文言を足すなら `packages/ui/src/tokens/fonts.css` の
  `-base` の `unicode-range` で実測してから決めること**。「見送り」は使えない（「送」が base 層に無い）
- **E2E のテストタグを新設しない**（既存タグの範囲で見る）
- **理由の優先順位は `stood-down` > `disconnected` / `away`**（設計 D3）
- **`Seat` と `SeatSkipReason` は `@tasuki/timer-core` から取り込む。** Task 2 で公開契約へ
  載るので、`apps/timer-web` も `apps/tasuki-sync` も型を自前で書き直さないこと
  （`packages/timer-core/src/index.ts` の export に足す必要がある。
  **足したら `node scripts/audit-public-surface.mjs` が動く** → Task 10 Step 2）
- **`config.members` と `session.rotation` は残す**（設計 D8）
- コミットは Conventional Commits・日本語。末尾に
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **各タスクの終わりで push する**（保留しない）

## Constitution Check（規約チェック）

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクで TDD（Red → Green）。判定は純粋関数に寄せた（`seatSkipReason` / `computeRotationStatus` / `rotationMembers`） |
| II. 技術選定は ADR を通す | 該当なし | 新しいライブラリを 1 つも足していない |
| III. 揮発インメモリと単純運用 | 該当なし | サーバーの状態管理の方式（揮発インメモリという性質そのもの）には触れていない |
| IV. 境界の型安全 | 通過 | valibot の `RoomSchema` を広げ、`session.seats` / `session.nextIndex` を必須にした。欠けたら落ちること・揃えば通ることの両方をテストで固定した（対照実行） |
| V. 実画面検証 | 通過 | 交代の帯に理由が 3 種類出る／「次は誰か」がサーバーの決定になる／「あと N 人・約 M 分後」が飛ばされる席を数えなくなる、と利用者に見えるものが変わる。**実画面での確認は Task 10 Step 4 で行う。本節を書いた時点ではまだ実施していない**（制御側が利用者に諮ってから実施する） |
| VI. 依存は内向き | 通過 | ドメイン（`packages/timer-core`）には型を足しただけ。判定ロジックはアプリケーション層（`apps/tasuki-sync/src/application/`）に置いた |
| VII. 検査は壊して確かめる | 通過 | 変異検査に m41 / m42 を追加し、全 42 件の検出を実測した。実装中も素朴な式へ変異させて赤くなることを各所で確認した |
| VIII. 記録が正本 | 通過 | 設計正本は [`docs/superpowers/specs/2026-09-18-rotation-seat-and-presence-design.md`](../specs/2026-09-18-rotation-seat-and-presence-design.md) |
| IX. 小さく回す | 通過 | PR 1 本。デプロイは伴わない（配布の制約は設計 §7 と `deploy/timer/NOTES.md` に記録済み） |
| X. 抽象は実需で | 通過 | 新しい抽象は `skip-reason-text.ts`（文言表）1 つだけ。2 つのコンポーネントが同じ語を使うために切り出した |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密・個人情報を扱っていない。wire に載せた `displayName` は既存の `config.members` と同じ情報で、新しい種類の情報は増えていない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。
ただし V の根拠欄に記したとおり、実画面での確認は Task 10 Step 4 で行う予定であり、
**本節を書いた時点ではまだ実施していない**（「実施済み」ではない点に注意）。

## 用語

| 語 | 意味 |
|---|---|
| 席（seat） | 交代の輪 `rotation` の 1 要素。名簿の人（member）か代理（proxy） |
| 在席 | その人が timer の画面を開いていること（`isPresentIn(p, TOOL_TIMER)`） |
| 離席（away） | 接続はあるが timer に居ない（選択画面や poker に居る） |
| 切断（disconnected） | 接続が 1 本も無い |
| 一時離脱（stood-down） | 本人が操作して番を飛ばしている（`entry.eligible === false`） |

---

### Task 1: 設計 D7 の前提を実測する

設計 D7 は「`seats` を欠いた snapshot は検証に落ち、`indicatesStaleRoom` が真になって
『画面が古い』側へ倒れる」という前提で必須化を選んでいる。**この前提は未実測である。**
崩れたら D7 を作り直すので、**最初に確かめる**。

**Files:**
- Test: `apps/timer-web/test/sync/stale-frame.test.ts`（追記）

**Interfaces:**
- Consumes: `indicatesStaleRoom(paths: readonly string[]): boolean`
  （`apps/timer-web/src/sync/stale-frame.ts`）
- Produces: なし（この課題の成果は**判断**であって、コードではない）

- [ ] **Step 1: `room.session.seats` が古い側へ倒れることを確かめるテストを書く**

`apps/timer-web/test/sync/stale-frame.test.ts` の末尾に足す。

```ts
  it("session の項目が落ちた経路は、画面が古い側へ倒れる（#276 D7）", () => {
    // `seats` を必須にすると、旧サーバーの snapshot はこの経路で落ちる。
    expect(indicatesStaleRoom(["room.session.seats"])).toBe(true);
    expect(indicatesStaleRoom(["room.session.nextIndex"])).toBe(true);
  });
```

- [ ] **Step 2: テストを走らせる**

Run: `cd /workspaces/claym/local/Tasuki/apps/timer-web && pnpm vitest run test/sync/stale-frame.test.ts`

期待: **PASS**。`indicatesStaleRoom` は `room.` で始まる経路を真にするため。

⚠ **ここが FAIL なら設計 D7 の前提が崩れている。** 手を止めて、設計文書の D7 を
書き直すところからやり直すこと（省略可にしてフォールバックを置く案へ倒れる）。

- [ ] **Step 3: 検証器が実際にその経路を出すことを確かめる**

`indicatesStaleRoom` が真を返すのは「経路がそうであれば」の話で、
**valibot が本当にその経路を出すか**は別の事実である（[[verify-the-live-path]]）。
`apps/timer-web/test/sync/dispatch.test.ts` の末尾に足す。

同ファイルには既に `base`（妥当な wire ルーム）と `onInvalidFrame` を使うテストがある
（`:191-197` 付近）。それに倣う。

```ts
  it("session.seats を欠いた snapshot は room.session.seats の経路で落ちる（#276 D7）", () => {
    // Task 2 で seats を必須にした後に緑になる。いまは赤でよい（Step 4 参照）。
    const session = { ...base.session };
    delete (session as Record<string, unknown>).seats;
    const paths: string[] = [];
    dispatchServerMessage(
      JSON.stringify({ type: "snapshot", room: { ...base, session } }),
      { onInvalidFrame: (p: readonly string[]) => paths.push(...p) },
    );
    expect(paths).toContain("room.session.seats");
  });
```

⚠ `base` の実際の綴りと `onInvalidFrame` の引数の形は**実物を読んで合わせること**。
Task 2 で `aRoomView` 相当の造作へ `seats` を足すまで、`base.session` に `seats` は無い
（`delete` は無害に空振りする）。

- [ ] **Step 4: 走らせて、いまは落ちることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/apps/timer-web && pnpm vitest run test/sync/dispatch.test.ts`

期待: **FAIL**（`seats` はまだ必須ではないので、欠けていても検証は通る）。
これは Task 2 の受け入れ条件になる。**この時点ではコミットしない**（赤いテストを
main 系のブランチへ置かない）。テストは手元に残したまま Task 2 へ進む。

- [ ] **Step 5: Step 1 のテストだけをコミットする**

```bash
cd /workspaces/claym/local/Tasuki
git add apps/timer-web/test/sync/stale-frame.test.ts
git commit -m "$(cat <<'EOF'
test: 欠けた session 項目が画面を古い側へ倒すことを固定する（#276）

- 設計 D7（seats / nextIndex の必須化）が依存する前提の実測
- room. で始まる経路は indicatesStaleRoom が真を返す

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin fix/276-rotation-seat-and-presence
```

---

### Task 2: wire の契約を広げる（型とスキーマ）

**Files:**
- Modify: `packages/timer-core/src/wire.ts`（`Room.session` に 2 項目）
- Modify: `packages/timer-core/src/schemas.ts:337-343`（`SessionStateSchema`）
- Modify: `apps/timer-web/test/support/room-view.ts`（`aRoomView` が席を輪から導くようにする）
- Test: `packages/timer-core/test/schemas.test.ts`（無ければ新規作成）
- Test: `apps/timer-web/test/sync/dispatch.test.ts`（Task 1 Step 3 のテストが緑になる）

**Interfaces:**
- Produces:
  ```ts
  // packages/timer-core/src/wire.ts
  export type SeatSkipReason = "stood-down" | "away" | "disconnected";

  export interface Seat {
    id: string;
    displayName: string;
    isProxy: boolean;
    skipReason: SeatSkipReason | null;
  }

  // Room["session"] に追加
  seats: Seat[];
  nextIndex: number | null;
  ```
  以降のタスクはこの名前と形に依存する。

- [ ] **Step 1: 落ちることと通ることの両方を固定するテストを書く**

`packages/timer-core/test/schemas.test.ts` に足す（無ければ作る）。
**対照実行を必ず置く** —— 「欠けたら落ちる」だけだと、スキーマ全体が常に落ちていても緑になる。

```ts
import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { RoomSchema } from "../src/schemas.js";

/** 最小の妥当な wire ルーム。seats / nextIndex を持つ。 */
function validRoom() {
  return {
    code: "mob-a1b2c3d4",
    createdAt: 0,
    config: { language: "TypeScript", difficulty: "easy", intervalMinutes: 5, members: ["アリス"] },
    problem: null,
    session: {
      rotation: ["p_alice"],
      currentIndex: 0,
      isPaused: false,
      driverCounts: [0],
      totalSwitches: 0,
      seats: [{ id: "p_alice", displayName: "アリス", isProxy: false, skipReason: null }],
      nextIndex: 0,
    },
    clock: {
      running: false,
      intervalSeconds: 300,
      anchorServerTime: 0,
      secondsLeftAtAnchor: 300,
      accumulatedElapsedMs: 0,
      runningSince: null,
    },
    phase: "ready",
    participants: [],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };
}

describe("RoomSchema の seats / nextIndex（#276 D7）", () => {
  it("揃っていれば通る（対照実行）", () => {
    expect(v.safeParse(RoomSchema, validRoom()).success).toBe(true);
  });

  it("seats が欠けたら落ちる", () => {
    const room = validRoom();
    delete (room.session as Record<string, unknown>).seats;
    expect(v.safeParse(RoomSchema, room).success).toBe(false);
  });

  it("nextIndex が欠けたら落ちる", () => {
    const room = validRoom();
    delete (room.session as Record<string, unknown>).nextIndex;
    expect(v.safeParse(RoomSchema, room).success).toBe(false);
  });

  it("nextIndex は null を取れる（全席が不適格・D6）", () => {
    const room = validRoom();
    room.session.nextIndex = null;
    expect(v.safeParse(RoomSchema, room).success).toBe(true);
  });

  it("skipReason は 3 語と null だけを受ける", () => {
    const room = validRoom();
    room.session.seats[0]!.skipReason = "見送り" as never;
    expect(v.safeParse(RoomSchema, room).success).toBe(false);
  });
});
```

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/packages/timer-core && pnpm vitest run test/schemas.test.ts`

期待: 「揃っていれば通る」以外が **FAIL**（`seats` / `nextIndex` はまだスキーマに無い）。

- [ ] **Step 3: 型を足す**

`packages/timer-core/src/wire.ts` の `Participant` 定義の直後、`Room` の直前に置く。

```ts
/** 席が飛ばされる理由。null は「番が回る」。優先順位は stood-down が先（#276 D3）。 */
export type SeatSkipReason = "stood-down" | "away" | "disconnected";

/**
 * 交代の輪の席 1 つ（#276 D2）。
 *
 * `rotation` と**同じ順・同じ長さ**で、同じ場所（`buildTimerSnapshotRoom`）が両方を組む。
 * `id` を自分で持つので、画面は添字ではなく識別子で照合できる ——
 * `config.members` の「長さが一致するときだけ添字で引く」という応急処置（S5c）は
 * 輪の表示から外れる。
 *
 * `displayName` は**絞っていない名簿**から引く。`participants` は timer の在席者に
 * 絞られているため（R5 / R6）、離席した人の名前はそこからは引けない。
 */
export interface Seat {
  id: string;
  displayName: string;
  /** Web 非接続の代理か（`Participant.isPlaceholder` と同じ意味） */
  isProxy: boolean;
  skipReason: SeatSkipReason | null;
}
```

`Room["session"]` の `totalSwitches: number;` の後に足す。

```ts
    /** 席ごとの表示名と「番が回らない理由」（#276 D2）。rotation と同じ順・同じ長さ。 */
    seats: Seat[];
    /**
     * 次の交代で**実際に**ドライバーになる席の添字（#276 D6）。
     *
     * 輪が空、または全席が不適格なら `null`（サーバーは現状維持へ縮退する・R15）。
     * 画面はこれを使うこと。`(currentIndex + 1) % len` は飛ばされる席を数に入れるので
     * サーバーの決定と食い違う。
     */
    nextIndex: number | null;
```

- [ ] **Step 4: スキーマを足す**

`packages/timer-core/src/schemas.ts` の `SessionStateSchema` を書き換える。

```ts
const SeatSchema = v.object({
  id: nonEmptyString,
  displayName: v.string(),
  isProxy: v.boolean(),
  skipReason: v.nullable(v.picklist(["stood-down", "away", "disconnected"])),
});

// T057: 自ファイル内でのみ使われるため export を外した（FR-119③・SC-039）。
const SessionStateSchema = v.object({
  rotation: v.array(v.string()),
  currentIndex: v.pipe(v.number(), v.integer(), v.minValue(0)),
  isPaused: v.boolean(),
  driverCounts: v.array(v.pipe(v.number(), v.integer(), v.minValue(0))),
  totalSwitches: v.pipe(v.number(), v.integer(), v.minValue(0)),
  // #276 D7: 任意にしない。省略可にすると画面側にフォールバック経路が残り、
  // 「サーバーが送る席」と「config.members から補う席」の 2 経路が戻る。
  // 旧サーバーの snapshot は `room.session.seats` の経路で落ち、画面は
  // 「最新ではありません」側へ倒れる（`sync/stale-frame.ts`）。配布時の窓と
  // その影響は `deploy/timer/NOTES.md` の順序表と設計文書 §7 を参照する
  // （`deploy.sh timer` は画面とサーバーを同じ 1 コマンドで配るため、
  // 順序は選べない。「同期サーバーが先」ではない）。
  seats: v.array(SeatSchema),
  nextIndex: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
});
```

⚠ `displayName` に `nonEmptyString` を使わないこと。名簿から引けない席は空文字になりうる
（設計 §3.3 の縮退）。ここで弾くと**名前が引けない席があるだけで snapshot 全体が落ちる**。

- [ ] **Step 5: 走らせて通ることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/packages/timer-core && pnpm vitest run test/schemas.test.ts`

期待: **全部 PASS**。

- [ ] **Step 6: Task 1 Step 3 のテストが緑になることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/apps/timer-web && pnpm vitest run test/sync/dispatch.test.ts`

期待: **PASS**（`seats` を欠いた snapshot が `room.session.seats` の経路で落ちる）。

- [ ] **Step 7: テストの共通造作に席を持たせる**

`apps/timer-web/test/support/room-view.ts` の `aRoomView` が `Room` を組んでいる。
**ここに `seats` / `nextIndex` の既定値を足さないと、timer-web のテストが軒並み型で落ちる。**

**固定値を置いてはならない。** 既定の `seats` を「作成者 1 人」に固定すると、
`session: { rotation: ["aya-p", "yuu-p"] }` と上書きしたテストで**席と輪の長さが食い違う**
造作ができ、しかも型検査はそれを拾わない（→ [[typecheck-misses-test-fixtures]]）。
**輪から導く。**

```ts
/**
 * 席と「次の番」は輪から導く（#276）。
 *
 * 固定値を置くと、`session: { rotation: [...] }` だけを上書きしたテストで
 * 席と輪の長さが食い違う造作ができる。型検査はそれを拾わないので、
 * **黙って嘘の前提を持つテスト**になる。サーバーは常に輪と同じ順・同じ長さで
 * 送るので、造作もそう振る舞わせる。
 *
 * 表示名は `config.members`（輪と同じ順の表示名）から引く。理由を持つ席を作りたい
 * テストは `session.seats` を丸ごと渡して上書きすること。
 */
function seatsFrom(rotation: readonly string[], memberNames: readonly string[]): Seat[] {
  return rotation.map((id, i) => ({
    id,
    displayName: memberNames[i] ?? "",
    isProxy: false,
    skipReason: null,
  }));
}
```

`aRoomView` の中で、`config` と `session` をマージした後に組む。

```ts
  const session = { ...defaultSession(), ...(overrides.session ?? {}) };
  // 席と次の番は、上書き後の輪から導く（明示的に渡されていれば、それを尊重する）。
  const seats = overrides.session?.seats ?? seatsFrom(session.rotation, config.members);
  const nextIndex =
    overrides.session?.nextIndex !== undefined
      ? overrides.session.nextIndex
      : session.rotation.length > 0
        ? (session.currentIndex + 1) % session.rotation.length
        : null;
  const merged = { ...session, seats, nextIndex };
```

`defaultSession()` の戻り値にも `seats: [{ id: CREATOR_ID, displayName: "Creator", isProxy: false, skipReason: null }]` と
`nextIndex: 0` を置き、`base` の `session` には `merged` を渡す。

⚠ **`aRoomView` の既定の `nextIndex` が `(currentIndex + 1) % len` なのは造作の都合であって、
製品の規則ではない。** 製品側でこの式を使ってよい場所は 1 つも無い（それが #276 の主題である）。
その旨をコメントに書くこと。

- [ ] **Step 8: 型検査を走らせ、赤くなった箇所を数える**

Run: `cd /workspaces/claym/local/Tasuki && pnpm -r typecheck 2>&1 | tail -40`

期待: **`seats` / `nextIndex` を組んでいない箇所が赤くなる。** これが Task 3 以降の
作業一覧になる。赤の件数と場所を控えること（テストの造作も赤くなるが、
**型検査はテスト造作の一部を拾わない** → [[typecheck-misses-test-fixtures]]。
`grep -rn "totalSwitches" apps packages --include='*.ts' --include='*.tsx'` で
`session` を手で組んでいる場所を併せて数えること）。

- [ ] **Step 9: コミットする**

```bash
cd /workspaces/claym/local/Tasuki
git add packages/timer-core/src/wire.ts packages/timer-core/src/schemas.ts \
        packages/timer-core/test/schemas.test.ts apps/timer-web/test/sync/dispatch.test.ts \
        apps/timer-web/test/support/room-view.ts
git commit -m "$(cat <<'EOF'
feat: wire に席ごとの理由と次の番を載せる契約を足す（#276）

- session.seats（id・表示名・代理か・番が回らない理由）と session.nextIndex を追加
- RoomSchema では必須にする（省略可にすると画面側に 2 経路目が戻るため）
- displayName は空文字を許す（名簿から引けない席の縮退を snapshot ごと落とさない）
- テストの共通造作 aRoomView は席を輪から導く（固定値だと輪と長さが食い違う）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 3: サーバーの適格判定を 1 本にする

設計 D5。**このタスクを飛ばすと、サーバー内に 2 つ目の適格判定ができる** ——
本 Issue が直そうとしている欠陥と同じ形になる。

**Files:**
- Modify: `apps/tasuki-sync/src/application/timer-snapshot-dto.ts`（`seatSkipReason` の新設、`computeIneligibleIndices` の移設）
- Modify: `apps/tasuki-sync/src/application/handlers.ts:49`（import に追加）、`:923-936`（関数を削除）
- Test: `apps/tasuki-sync/test/timer-snapshot-dto.test.ts`（追記）

**Interfaces:**
- Consumes: `Seat`, `SeatSkipReason`（Task 2）
- Produces:
  ```ts
  // apps/tasuki-sync/src/application/timer-snapshot-dto.ts
  export function computeIneligibleIndices(
    membership: MembershipRoom,
    timer: TimerState,
  ): Set<number>;
  ```
  `handlers.ts` が `:355` / `:630` / `:660` で呼ぶ。**呼び出しの書き方は変えない。**

- [ ] **Step 1: 理由の 4 分岐と優先順位を固定するテストを書く**

`apps/tasuki-sync/test/timer-snapshot-dto.test.ts` の末尾に足す。
既存の `membership` / `timer` の造作を土台に、必要な分だけ差し替えて使う。

```ts
describe("seats の skipReason（#276 D3 / D4）", () => {
  /** 名簿と timer を組み、seats を返す。 */
  function seatsOf(args: {
    connections: Map<string, string>;   // アリスの接続（ツール名は TOOL_TIMER / TOOL_HUB）
    eligible?: boolean;                  // アリスの席の eligible
  }) {
    const m: MembershipRoom = {
      ...membership,
      participants: [{ ...membership.participants[0]!, connections: args.connections }],
    };
    const t: TimerState = {
      ...timer,
      session: {
        ...timer.session,
        rotation: [
          { kind: "member", participantId: "p_alice", eligible: args.eligible ?? true },
        ],
        driverCounts: [0],
      },
    };
    return buildTimerSnapshotRoom(m, t).session.seats;
  }

  it("timer に在席していれば番が回る", () => {
    expect(seatsOf({ connections: new Map([["c1", TOOL_TIMER]]) })[0]!.skipReason).toBe(null);
  });

  it("接続が 1 本も無ければ disconnected", () => {
    expect(seatsOf({ connections: new Map() })[0]!.skipReason).toBe("disconnected");
  });

  it("接続はあるが timer に居なければ away", () => {
    expect(seatsOf({ connections: new Map([["c1", TOOL_HUB]]) })[0]!.skipReason).toBe("away");
  });

  it("一時離脱は在席より優先される（D3）", () => {
    // timer に在席していても、本人が一時離脱していれば stood-down と言う。
    expect(
      seatsOf({ connections: new Map([["c1", TOOL_TIMER]]), eligible: false })[0]!.skipReason,
    ).toBe("stood-down");
  });

  it("切断していても一時離脱が優先される（D3）", () => {
    expect(seatsOf({ connections: new Map(), eligible: false })[0]!.skipReason).toBe("stood-down");
  });

  it("代理は在席の概念を持たないので番が回る（D4）", () => {
    const seats = buildTimerSnapshotRoom(membership, timer).session.seats;
    const proxy = seats.find((s) => s.isProxy);
    expect(proxy?.skipReason).toBe(null);
  });
});
```

`TOOL_HUB` の実際の綴りは `apps/tasuki-sync/src/application/tool-id.ts` を読んで合わせること。

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/apps/tasuki-sync && bun test test/timer-snapshot-dto.test.ts`

期待: **FAIL**（`seats` をまだ組んでいない）。

- [ ] **Step 3: `seatSkipReason` を新設し、`computeIneligibleIndices` をその上に組み直す**

`apps/tasuki-sync/src/application/timer-snapshot-dto.ts` の `showsInTimer` の直後に置く。

```ts
/**
 * その席の番が飛ぶ理由（#276 D3 / D4）。`null` なら次の交代で番が回る。
 *
 * **この関数が適格判定の正本である。** {@link computeIneligibleIndices}（交代先の決定）と
 * wire の `seats[].skipReason`（画面が出す理由）の両方がここから出る。2 つに分けると、
 * 「番は飛ぶのに画面は理由を知らない」「画面が言う理由とサーバーの判断が違う」という
 * #276 そのものの欠陥が再発する。
 *
 * **一時離脱は在席より先に見る**（D3）。在席していても本人が降りているなら、
 * 利用者にとっての理由は「一時離脱中」である。
 *
 * **代理は在席の概念を持たない。** Web 非接続が常態で、対面に居る実在の人を表すため、
 * 外すとタイマー自動交代で永久に飛ばされる。
 */
function seatSkipReason(
  entry: RotationEntry,
  watchingTimer: ReadonlySet<string>,
  byId: ReadonlyMap<string, MembershipParticipant>,
): SeatSkipReason | null {
  if (entry.eligible === false) return "stood-down";
  if (entry.kind === "proxy") return null;
  if (watchingTimer.has(entry.participantId)) return null;
  // 名簿に居ない席は「どこに居るか分からない」。接続数を問えないので切断として扱う。
  const participant = byId.get(entry.participantId);
  return participant && participant.connections.size > 0 ? "away" : "disconnected";
}

/** timer に在席している参加者の識別子。 */
function watchingTimerIds(membership: MembershipRoom): Set<string> {
  return new Set(
    membership.participants.filter((p) => isPresentIn(p, TOOL_TIMER)).map((p) => p.id),
  );
}

/**
 * ドライバー対象外の rotation インデックス集合（#95 S4a、判定は S4b で在席へ）。
 *
 * **判定そのものは {@link seatSkipReason} が持つ。** ここはその結果を添字の集合へ
 * 畳むだけである（#276 D5。`handlers.ts` から移設した）。
 *
 * 対象者が 0 名になった場合は呼び出し側（`advanceDriver` / `decide`）が現状維持に
 * 縮退する（R15）。ここでは「全員が対象外」という集合をそのまま返す。
 */
export function computeIneligibleIndices(
  membership: MembershipRoom,
  timer: TimerState,
): Set<number> {
  const watching = watchingTimerIds(membership);
  const byId = new Map(membership.participants.map((p) => [p.id, p]));
  const set = new Set<number>();
  timer.session.rotation.forEach((entry, i) => {
    if (seatSkipReason(entry, watching, byId) !== null) set.add(i);
  });
  return set;
}
```

`handlers.ts` から旧 `computeIneligibleIndices`（`:923-936` とその docstring）を削除し、
`:49` の import に `computeIneligibleIndices` を足す。**旧 docstring の中身
（D21 の経緯・presence で判定しない理由・代理の扱い）は移設先へ持っていくこと** ——
消すと「なぜ在席で判定するのか」の記録が失われる。

- [ ] **Step 4: `seats` と `nextIndex` を snapshot に載せる**

`buildTimerSnapshotRoom` の中で組む。`session` の明示列挙へ 2 行足す。

```ts
  const watching = watchingTimerIds(membership);
  const byId = new Map(membership.participants.map((p) => [p.id, p]));
  const names = new Map(membership.participants.map((p) => [p.id, p.displayName]));
  const seats: Seat[] = timer.session.rotation.map((e) => ({
    id: rotationEntryId(e),
    displayName: e.kind === "proxy" ? e.label : (names.get(e.participantId) ?? ""),
    isProxy: e.kind === "proxy",
    skipReason: seatSkipReason(e, watching, byId),
  }));
  const ineligibleCount = seats.filter((s) => s.skipReason !== null).length;
  // 全席が不適格ならサーバーは現状維持へ縮退する（R15）。`nextEligibleIndex` は
  // その場合 currentIndex を返すので、「次は現ドライバー」と区別が付かない。
  // 画面に人名を出させないため、ここで null へ倒す（D6）。
  const nextIndex =
    seats.length === 0 || ineligibleCount === seats.length
      ? null
      : nextEligibleIndex(timer.session, timer.session.currentIndex, computeIneligibleIndices(membership, timer));
```

`session` の列挙へ:

```ts
      totalSwitches: timer.session.totalSwitches,
      seats,
      nextIndex,
```

`rotationDisplayNames` は `config.members` のために残す（設計 D8）。
**`seats[].displayName` と同じ規則で名前を引いていることに注意** —— 将来どちらかを
変えるならもう片方も見ること。

- [ ] **Step 5: 走らせて通ることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/apps/tasuki-sync && bun test test/timer-snapshot-dto.test.ts`

期待: **全部 PASS**。

- [ ] **Step 6: 交代が実際に飛ばすことを確かめる（恒真を避ける）**

`computeIneligibleIndices` と `seats[].skipReason` は同じ関数から出るので、
**「両者が一致する」テストは恒真になる**（#274 で 3 件作って 3 件とも直した型）。
一致は書かず、**交代を起こして結果を見る**。

`apps/tasuki-sync/test/driver-absence.test.ts` が持っている `CONNS`（参加者 ID → 接続 ID の対応）の
組み方と、`driver-switch-manual-vs-auto.test.ts` の
`handleCommand("conn-a", { command: "session.act", action: "SWITCH" })` を組み合わせる。
**接続を持たせない参加者が「切断」である**（`CONNS` に載せない）。

`apps/tasuki-sync/test/handlers.driver-advance.test.ts` の末尾に足す。

```ts
  it("切断した席は交代で飛ばされ、nextIndex がその先を指す（#276 E1 / E2）", async () => {
    // 輪: アリス(現・在席) → ボブ(切断) → カルロス(在席)
    const room = roomViewOf(store, timers, code);
    putRoomView(
      store,
      timers,
      {
        ...room,
        session: { ...room.session, rotation: ["pid-a", "pid-b", "pid-c"], currentIndex: 0,
                   driverCounts: [0, 0, 0] },
        participants: [
          { ...room.participants[0]!, participantId: "pid-a", displayName: "アリス" },
          { ...room.participants[0]!, participantId: "pid-b", displayName: "ボブ" },
          { ...room.participants[0]!, participantId: "pid-c", displayName: "カルロス" },
        ],
        clock: { ...room.clock, running: true },
      },
      // ボブを載せない ＝ 接続 0 本 ＝ 切断
      { "pid-a": ["conn-a"], "pid-c": ["conn-c"] },
    );

    // 交代を実際に起こす（判定を直接呼ばない）。
    await handlers.handleCommand("conn-a", { command: "session.act", action: "SWITCH" });

    const after = roomViewOf(store, timers, code);
    expect(after.session.currentIndex).toBe(2);               // ボブを飛ばした
    expect(after.session.seats[1]!.skipReason).toBe("disconnected"); // 理由が載っている
    expect(after.session.nextIndex).toBe(0);                  // 次はアリスへ戻る
  });
```

⚠ **変数名（`store` / `timers` / `code` / `handlers`）は同ファイルの `beforeEach` が
用意しているものに合わせること。** 上のコードは形を示すもので、綴りは実物が正しい。

**この課題は「実際に交代を起こす」形になっていなければ意味がない。**
造作だけ作って `computeIneligibleIndices` を直接呼ぶ形にすると、Step 3 の実装を
呼び直すだけの恒真テストになる（#274 で 3 件作った型）。

- [ ] **Step 7: sync のテストを全部走らせる**

Run: `cd /workspaces/claym/local/Tasuki/apps/tasuki-sync && bun test`

期待: **全部 PASS**。落ちたものがあれば、`session` を手で組んでいる造作に
`seats` / `nextIndex` が無いためのはず。造作を直す。

- [ ] **Step 8: コミットして push する**

```bash
cd /workspaces/claym/local/Tasuki
git add apps/tasuki-sync/src/application/timer-snapshot-dto.ts \
        apps/tasuki-sync/src/application/handlers.ts apps/tasuki-sync/test/
git commit -m "$(cat <<'EOF'
feat: 席ごとの理由と次の番をサーバーが送る（#276）

- seatSkipReason を適格判定の正本にし、computeIneligibleIndices をその上に組み直す
- computeIneligibleIndices を handlers.ts から timer-snapshot-dto.ts へ移設
- 交代の判定と画面が出す理由が同じ関数から出るようにする

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 4: 画面が席から呼び名を組むようにする

**Files:**
- Modify: `apps/timer-web/src/ui/rotation-names.ts`
- Test: `apps/timer-web/test/ui/rotation-names.test.ts`

**Interfaces:**
- Consumes: `Seat`, `SeatSkipReason`（Task 2）
- Produces:
  ```ts
  export interface RotationMember {
    participantId: string;
    displayName: string;
    label: string;
    skipReason: SeatSkipReason | null;   // isAway から改名（D10）
  }
  export function rotationMembers(
    seats: readonly Seat[],
    participants: readonly LabelParticipant[],
  ): RotationMember[];
  ```
  Task 5・6・7 がこの形に依存する。

- [ ] **Step 1: 呼び名のテストを書く（退行防止を含む）**

`apps/timer-web/test/ui/rotation-names.test.ts` に足す。**既存のテストは引数の形が
変わるので書き換えが要る。** 既存の意図（識別子で同定する・名前は表示だけ）は保つこと。

```ts
const seat = (id: string, displayName: string, skipReason: SeatSkipReason | null = null) => ({
  id, displayName, isProxy: false, skipReason,
});

describe("呼び名（#276 D9）", () => {
  it("離席者どうしが同名なら、どちらにも識別子が付く", () => {
    const members = rotationMembers(
      [seat("a-1111", "Bob", "away"), seat("b-2222", "Bob", "away")],
      [],
    );
    expect(members[0]!.label).toBe("Bob（ID: 1111）");
    expect(members[1]!.label).toBe("Bob（ID: 2222）");
  });

  it("片方だけ在席でも、どちらにも識別子が付く", () => {
    const members = rotationMembers(
      [seat("a-1111", "Bob"), seat("b-2222", "Bob", "away")],
      [{ participantId: "a-1111", displayName: "Bob" }],
    );
    expect(members[0]!.label).toBe("Bob（ID: 1111）");
    expect(members[1]!.label).toBe("Bob（ID: 2222）");
  });

  it("輪の外の見学者と同名でも識別子が付く（退行防止・§3.4）", () => {
    // 見学者は seats に居ない。participants を見ないと取りこぼす。
    const members = rotationMembers(
      [seat("a-1111", "Bob")],
      [
        { participantId: "a-1111", displayName: "Bob" },
        { participantId: "z-9999", displayName: "Bob" },
      ],
    );
    expect(members[0]!.label).toBe("Bob（ID: 1111）");
  });

  it("同名が居なければ識別子を付けない", () => {
    const members = rotationMembers([seat("a-1111", "アリス")], []);
    expect(members[0]!.label).toBe("アリス");
  });

  it("理由をそのまま持つ", () => {
    const members = rotationMembers([seat("a-1111", "Bob", "disconnected")], []);
    expect(members[0]!.skipReason).toBe("disconnected");
  });
});
```

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/apps/timer-web && pnpm vitest run test/ui/rotation-names.test.ts`

期待: **FAIL**。

- [ ] **Step 3: `rotationMembers` を席から組む形へ書き換える**

```ts
export function rotationMembers(
  seats: readonly Seat[],
  participants: readonly LabelParticipant[],
): RotationMember[] {
  // 呼び名の判定対象は「同じ画面に並ぶ人」全員（#276 D9）。
  // seats だけだと輪の外の見学者との同名を取りこぼし、participants だけだと
  // 離席者どうしの同名を取りこぼす（S5a で participants が在席で絞られたため）。
  const byId = new Map<string, LabelParticipant>();
  for (const s of seats) byId.set(s.id, { participantId: s.id, displayName: s.displayName });
  for (const p of participants) if (!byId.has(p.participantId)) byId.set(p.participantId, p);
  const pool = [...byId.values()];

  return seats.map((s) => ({
    participantId: s.id,
    displayName: s.displayName,
    label: participantLabel(s.displayName, s.id, pool),
    skipReason: s.skipReason,
  }));
}
```

docstring は全面的に書き直す。**「名前の引き先が 2 つある理由（#95 S5a・S5c）」の節は
削除する** —— `config.members` から補う経路がここから消えたためである。代わりに
「席はサーバーが組む」「呼び名の判定対象が和集合である理由」を書く。
`memberNames` 引数も消す。

- [ ] **Step 4: 走らせて通ることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/apps/timer-web && pnpm vitest run test/ui/rotation-names.test.ts`

期待: **全部 PASS**。

- [ ] **Step 5: `isAway` の残党を数える**

Run: `cd /workspaces/claym/local/Tasuki && grep -rn "isAway" apps packages --include='*.ts' --include='*.tsx' | grep -v /dist/`

**型検査に出ない読み手（コメント・日本語の散文・テストの造作）が残る**
（→ [[deleted-symbols-live-on-in-declarations]]）。Task 5・6・7 で全部消すので、
ここでは**件数と場所を控えるだけ**にする。

- [ ] **Step 6: コミットして push する**

```bash
cd /workspaces/claym/local/Tasuki
git add apps/timer-web/src/ui/rotation-names.ts apps/timer-web/test/ui/rotation-names.test.ts
git commit -m "$(cat <<'EOF'
refactor: 輪の呼び名をサーバーが送る席から組む（#276）

- rotationMembers の入力を seats にし、config.members の添字対応を畳む
- 呼び名の判定対象を seats と participants の和集合にする
  （離席者どうしの同名と、輪の外の見学者との同名を両方守る）
- RotationMember.isAway を skipReason へ改名（意味が「番が回らない」へ変わるため）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 5: 順番の数字が飛ばされる席を数えないようにする

**Files:**
- Modify: `apps/timer-web/src/ui/rotation-status.ts`
- Test: `apps/timer-web/test/ui/rotation-status.test.ts`

**Interfaces:**
- Consumes: `RotationMember`（Task 4）
- Produces:
  ```ts
  export interface MemberTurn {
    participantId: string;
    name: string;
    order: number;
    turnsAway: number | null;    // 飛ばされる席は null（D13）
    isCurrent: boolean;
    isNext: boolean;
    isSelf: boolean;
    minutesAway: number | null;
    skipReason: SeatSkipReason | null;
  }
  export function computeRotationStatus(args: {
    rotation: RotationMember[];
    currentIndex: number;
    nextIndex: number | null;    // 追加（D13）
    intervalSeconds: number;
    selfIndex: number;
    isPaused: boolean;
  }): RotationStatus;
  ```

- [ ] **Step 1: 数え方のテストを書く**

```ts
describe("飛ばされる席を数えない（#276 E3 / D13）", () => {
  // 輪: [アリス(現), ボブ(切断), カルロス, ダイア]
  const rotation = [
    { participantId: "a", displayName: "アリス", label: "アリス", skipReason: null },
    { participantId: "b", displayName: "ボブ", label: "ボブ", skipReason: "disconnected" as const },
    { participantId: "c", displayName: "カルロス", label: "カルロス", skipReason: null },
    { participantId: "d", displayName: "ダイア", label: "ダイア", skipReason: null },
  ];
  const status = () =>
    computeRotationStatus({
      rotation, currentIndex: 0, nextIndex: 2, intervalSeconds: 300, selfIndex: 3, isPaused: false,
    });

  it("飛ばされる席は turnsAway を持たない", () => {
    expect(status().members[1]!.turnsAway).toBe(null);
    expect(status().members[1]!.minutesAway).toBe(null);
  });

  it("飛ばされる席を挟んだ先は、その席を数に入れない", () => {
    // カルロスは「次」。素朴な計算なら 2 になるところ。
    expect(status().members[2]!.turnsAway).toBe(1);
    expect(status().members[3]!.turnsAway).toBe(2);
  });

  it("minutesAway も詰まった数から出す", () => {
    expect(status().members[3]!.minutesAway).toBe(10); // 2 順 × 5 分
  });

  it("isNext はサーバーの nextIndex と一致する席だけ", () => {
    expect(status().members.map((m) => m.isNext)).toEqual([false, false, true, false]);
  });

  it("現ドライバーは飛ばされる状態でも turnsAway が 0", () => {
    const r = [{ ...rotation[0]!, skipReason: "away" as const }, ...rotation.slice(1)];
    const s = computeRotationStatus({
      rotation: r, currentIndex: 0, nextIndex: 2, intervalSeconds: 300, selfIndex: 0, isPaused: false,
    });
    expect(s.members[0]!.turnsAway).toBe(0);
    expect(s.members[0]!.isCurrent).toBe(true);
  });

  it("nextIndex が null なら isNext はどこにも立たない", () => {
    const s = computeRotationStatus({
      rotation, currentIndex: 0, nextIndex: null, intervalSeconds: 300, selfIndex: 3, isPaused: false,
    });
    expect(s.members.some((m) => m.isNext)).toBe(false);
  });
});
```

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/apps/timer-web && pnpm vitest run test/ui/rotation-status.test.ts`

期待: **FAIL**。

- [ ] **Step 3: 数え方を書き換える**

```ts
  // 現在地から交代の向きへ歩き、飛ばされる席を数えずに順番を振る（#276 D13）。
  // サーバーは不適格な席を飛ばして繰り上げるので、素朴な循環距離
  // （(i - currentIndex + len) % len）は実際の交代と食い違う。
  const turns = new Map<number, number>();
  let n = 0;
  for (let step = 1; step <= len; step++) {
    const idx = (currentIndex + step) % len;
    if (idx === currentIndex) break;
    if (rotation[idx]!.skipReason !== null) continue;
    turns.set(idx, ++n);
  }

  const members: MemberTurn[] = rotation.map((member, i) => {
    const isCurrent = i === currentIndex;
    // 現ドライバーは飛ばされる状態でも 0（運転中である）。
    const turnsAway = isCurrent ? 0 : (turns.get(i) ?? null);
    const minutesAway =
      isPaused || turnsAway === null ? null : Math.round((turnsAway * intervalSeconds) / 60);
    return {
      participantId: member.participantId,
      name: member.label,
      order: i + 1,
      turnsAway,
      isCurrent,
      isNext: nextIndex !== null && i === nextIndex,
      isSelf: i === selfIndex,
      minutesAway,
      skipReason: member.skipReason,
    };
  });
```

- [ ] **Step 4: 走らせて通ることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/apps/timer-web && pnpm vitest run test/ui/rotation-status.test.ts`

期待: **全部 PASS**。

- [ ] **Step 5: コミットして push する**

```bash
cd /workspaces/claym/local/Tasuki
git add apps/timer-web/src/ui/rotation-status.ts apps/timer-web/test/ui/rotation-status.test.ts
git commit -m "$(cat <<'EOF'
fix: 「あと何人・何分後」が飛ばされる席を数に入れないようにする（#276）

- turnsAway を、交代の向きへ歩いて不適格な席を飛ばして数える形にする
- 飛ばされる席自身は turnsAway / minutesAway を持たない
- isNext の自前計算をやめ、サーバーの nextIndex と突き合わせる

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 6: 帯に 3 つの理由を出す

**Files:**
- Modify: `apps/timer-web/src/ui/components/RotationLineup.tsx`
- Test: `apps/timer-web/test/ui/RotationLineup.test.tsx`

**Interfaces:**
- Consumes: `MemberTurn`（Task 5）、`RotationMember`（Task 4）
- Produces: `RotationLineupProps` に `nextIndex: number | null` が増える（Task 7 が渡す）

- [ ] **Step 1: 3 種の印と特例のテストを書く**

同ファイルの既存の造作は `mk(id, name, label = name, isAway = false)` である。
**`isAway` を `skipReason` へ変える**（既定は `null`）。既存テストの `mk(...)` 呼び出しは
第 4 引数を使っていないので、ほとんどが無修正で通るはずである。

```ts
  const mk = (
    id: string, name: string, label = name,
    skipReason: SeatSkipReason | null = null,
  ) => ({ participantId: id, displayName: name, label, skipReason });
```

`props` には `nextIndex` を足す（既存の既定は「輪の 2 人目が次」なので `nextIndex: 1`）。

```ts
describe("番が回らない理由（#276 E1 / D11）", () => {
  it("一時離脱・別の画面・未接続をそれぞれ文字で示す", () => {
    render(
      <RotationLineup
        rotation={[
          mk("p1", "Alice"),
          mk("p2", "Bob", "Bob", "stood-down"),
          mk("p3", "Carol", "Carol", "away"),
          mk("p4", "Dave", "Dave", "disconnected"),
        ]}
        currentIndex={0} nextIndex={0} intervalSeconds={300} isPaused={false} selfIndex={0}
      />,
    );
    expect(screen.getByText("離脱中")).toBeTruthy();
    expect(screen.getByText("別の画面")).toBeTruthy();
    expect(screen.getByText("未接続")).toBeTruthy();
  });

  it("現ドライバーには「順番は回りません」と言わない（運転中のため）", () => {
    render(
      <RotationLineup
        rotation={[mk("p1", "Alice", "Alice", "disconnected"), mk("p2", "Bob")]}
        currentIndex={0} nextIndex={1} intervalSeconds={300} isPaused={false} selfIndex={1}
      />,
    );
    expect(screen.getByTitle("接続が切れています")).toBeTruthy();
    expect(screen.queryByTitle(/順番は回りません/)).toBeNull();
  });

  it("自分の席が飛ばされるときは「あとnull人」を出さない", () => {
    render(
      <RotationLineup
        rotation={[mk("p1", "Alice"), mk("p2", "Bob", "Bob", "disconnected")]}
        currentIndex={0} nextIndex={0} intervalSeconds={300} isPaused={false} selfIndex={1}
      />,
    );
    expect(screen.getByText("あなた: 番が回りません（未接続）")).toBeTruthy();
    expect(screen.queryByText(/あとnull人/)).toBeNull();
  });
});
```

⚠ 判定は `toBeTruthy()` / `toBeNull()` で書く（同ファイルの既存の流儀）。
`getByText` は見つからなければ自分で投げるので、**否定の判定は `queryBy*` を使うこと** ——
`getBy*` を否定側に使うと空振りする（→ [[playwright-assertion-traps]] と同じ型）。

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/apps/timer-web && pnpm vitest run test/ui/RotationLineup.test.tsx`

期待: **FAIL**。

- [ ] **Step 3: 印の表を作り、特例を実装する**

`AWAY_LABEL` / `AWAY_REASON` を置き換える。

```ts
/**
 * 席の番が回らない理由の見せ方（#276 D11）。
 *
 * **色ではなく文字で示す**（WCAG 1.4.1）。文言は自己ホスト書体の base 層に収まる字だけで
 * 書くこと —— 外れた字が 1 つあるだけで ext 層（約 210KB）を引く（`packages/ui/README.md`）。
 * **「見送り」は使えない**（「送」が base 層に無い。#276 で実測）。既存語彙の「離脱中」
 * （`RosterPanel`）と「接続中 / 再接続中…」（`StatusStrip`）の系列に揃えてある。
 *
 * `reason` は輪の他の席向け、`current` は**その人がいま運転しているとき**の言い方。
 * 現ドライバーに「順番は回りません」と言うと嘘になる。
 */
const SKIP_TEXT = {
  "stood-down": {
    label: "離脱中",
    reason: "一時離脱中のため、ドライバーの順番は回りません",
    current: "一時離脱中です",
  },
  away: {
    label: "別の画面",
    reason: "別の画面を見ているため、ドライバーの順番は回りません",
    current: "別の画面を見ています",
  },
  disconnected: {
    label: "未接続",
    reason: "接続が切れているため、ドライバーの順番は回りません",
    current: "接続が切れています",
  },
} as const;
```

`buildSelfSummary` は `turnsAway === null` の分岐を先に置く。

```ts
function buildSelfSummary(self: MemberTurn): string {
  if (self.isCurrent) return "あなたの番です";
  // 飛ばされる席は順番を持たない（#276 D11）。「あとnull人」を出さない。
  if (self.skipReason !== null) return `あなた: 番が回りません（${SKIP_TEXT[self.skipReason].label}）`;
  const turns = self.isNext ? "次です" : `あと${self.turnsAway}人`;
  const mins = self.minutesAway !== null && !self.isNext ? `・約${self.minutesAway}分後` : "";
  return `あなた: ${turns}${mins}`;
}
```

`whenLabel` は `isCurrent` を先に見る形のままでよい（現ドライバーは「▶ 今」）。
飛ばされる席は `あと${turnsAway}人` へ落ちないよう、`skipReason !== null` の分岐を足す。

- [ ] **Step 4: 走らせて通ることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/apps/timer-web && pnpm vitest run test/ui/RotationLineup.test.tsx`

期待: **全部 PASS**。

- [ ] **Step 5: 新しい文言が書体の base 層に収まることを確かめる**

Run:
```bash
cd /workspaces/claym/local/Tasuki && node -e '
const css = require("fs").readFileSync("packages/ui/src/tokens/fonts.css", "utf8");
const ranges = [];
for (const f of css.split("@font-face").slice(1)) {
  if (!/-base/.test(f)) continue;
  const ur = f.match(/unicode-range:\s*([^;]+);/); if (!ur) continue;
  for (const t of ur[1].split(",")) {
    const m = t.trim().match(/^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/);
    if (m) ranges.push([parseInt(m[1],16), parseInt(m[2]??m[1],16)]);
  }
}
const inBase = (c) => ranges.some(([a,b]) => c>=a && c<=b);
const texts = process.argv.slice(1);
for (const t of texts) {
  const bad = [...t].filter((c) => !inBase(c.codePointAt(0)));
  console.log((bad.length ? "NG " : "OK ") + t + (bad.length ? " → base 外: " + bad.join(" ") : ""));
}
' "離脱中" "別の画面" "未接続" "一時離脱中のため、ドライバーの順番は回りません" "接続が切れているため、ドライバーの順番は回りません" "別の画面を見ています" "一時離脱中です" "接続が切れています" "あなた: 番が回りません"
```

期待: **全部 OK**。NG が出たら言い換える（設計 §3.6 に実測済みの言い換え候補がある）。

- [ ] **Step 6: コミットして push する**

```bash
cd /workspaces/claym/local/Tasuki
git add apps/timer-web/src/ui/components/RotationLineup.tsx apps/timer-web/test/ui/RotationLineup.test.tsx
git commit -m "$(cat <<'EOF'
feat: 交代の帯に「番が回らない理由」を 3 種類出す（#276）

- 一時離脱中・別の画面・未接続をそれぞれ文字で示す（色に頼らない）
- 現ドライバーには「順番は回りません」と言わず状態だけを示す
- 自分の席が飛ばされるときに「あとnull人」を出さない

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 7: 画面が「次は誰か」をサーバーから取る

**Files:**
- Modify: `apps/timer-web/src/ui/Session.tsx:156-175`（計算）、`:315-318`（「次:」の欄）、帯と周回図への受け渡し
- Modify: `apps/timer-web/src/ui/components/TeamOrbit.tsx`
- Test: `apps/timer-web/test/ui/Session.rotation.test.tsx`、`Session.away-member.test.tsx`

**Interfaces:**
- Consumes: `rotationMembers`（Task 4）、`computeRotationStatus`（Task 5）、`RotationLineupProps`（Task 6）
- Produces: `TeamOrbitProps` に `nextIndex: number | null` が増える

- [ ] **Step 1: 「次」がサーバーの決定と一致することのテストを書く**

`Session.away-member.test.tsx` は #249 が置いたテストである。**そこが何を固定していたかを
先に読むこと**（「次の席が離席なら理由を添える」）。D12 でその表示は消えるので、
テストは**書き換える**（消すのではない）。

`Session.away-member.test.tsx` は `aRoomView`（`test/support/room-view.ts`）と
`p(participantId, displayName)` を使っている。その造作を流用する。

```ts
const seat = (id: string, name: string, skipReason: SeatSkipReason | null = null) => ({
  id, displayName: name, isProxy: false, skipReason,
});

it("「次」はサーバーの nextIndex が指す人を出す（#276 E2）", () => {
  // 輪: [あや(現), ゆう(離席), かい]。素朴な計算なら「次: ゆう」になるところ。
  const room = aRoomView({
    code: "AA0001",
    config: { members: ["あや", "ゆう", "かい"] },
    session: {
      rotation: ["aya-p", "yuu-p", "kai-p"],
      currentIndex: 0,
      driverCounts: [0, 0, 0],
      seats: [seat("aya-p", "あや"), seat("yuu-p", "ゆう", "away"), seat("kai-p", "かい")],
      nextIndex: 2,
    },
    clock: { running: true, runningSince: 0 },
    phase: "session",
    participants: [p("aya-p", "あや"), p("kai-p", "かい")],
  });

  render(<Session room={room} participantId="aya-p" inviteUrl={INVITE_URL_FOR_TEST} {...handlers} />);

  expect(screen.getByText("かい")).toBeTruthy();
  // #249 が置いた「（別の画面）」は出ない。次の席は定義上必ず適格である（D12）。
  expect(screen.queryByText("（別の画面）")).toBeNull();
});

it("全席が不適格なら人名を出さない（#276 E5）", () => {
  const room = aRoomView({
    code: "AA0001",
    config: { members: ["あや", "ゆう"] },
    session: {
      rotation: ["aya-p", "yuu-p"],
      currentIndex: 0,
      driverCounts: [0, 0],
      seats: [seat("aya-p", "あや", "away"), seat("yuu-p", "ゆう", "disconnected")],
      nextIndex: null,
    },
    clock: { running: true, runningSince: 0 },
    phase: "session",
    participants: [p("yuu-p", "ゆう")],
  });

  render(<Session room={room} participantId="yuu-p" inviteUrl={INVITE_URL_FOR_TEST} {...handlers} />);

  expect(screen.getByText("（交代できる人がいません）")).toBeTruthy();
});
```

⚠ `Session` へ渡す props の綴り（`room` / `participantId` / `inviteUrl` と `handlers` の展開）は
**同ファイルの既存の `render` 呼び出しを読んで合わせること**。

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/apps/timer-web && pnpm vitest run test/ui/Session.away-member.test.tsx test/ui/Session.rotation.test.tsx`

期待: **FAIL**。

- [ ] **Step 3: `Session.tsx` を書き換える**

`:156-175` を次の形にする。

```tsx
  const rotationLen = room.session.rotation.length;
  // 「次は誰か」はサーバーが決める（#276 D1 / D6）。かつてここには
  // `(currentIndex + 1) % rotationLen` があったが、サーバーは不適格な席を飛ばして
  // 繰り上げるので食い違った（画面は「次: いずみ」、実際の交代は別の人）。
  const nextIndex = room.session.nextIndex;
  // 席はサーバーが組む（識別子・表示名・番が回らない理由）。`participants` も渡すのは
  // 呼び名の判定のためで、輪の外の見学者との同名を取りこぼさないようにする（D9）。
  const rotation = rotationMembers(room.session.seats, room.participants);
  const rotationNames = rotation.map((m) => m.label);
  const currentDriverId = room.session.rotation[room.session.currentIndex] ?? "";
  const currentDriverName = rotationNames[room.session.currentIndex] ?? "—";
  const nextDriverName = nextIndex !== null ? (rotationNames[nextIndex] ?? "—") : "—";
```

`isNextAway` は**削除する**（D12）。`:315-318` の markup:

```tsx
            次: <span className="text-[var(--bone)] font-bold text-lg">{nextDriverName}</span>
            {nextIndex === null && (
              <span className="text-[var(--bone-subtle)]">（交代できる人がいません）</span>
            )}
```

`prevIndex`（ナビ）は**そのままでよい** —— ナビは「直前に運転していた人」であって
適格性とは無関係である。変えると別の振る舞いを足すことになる。

`TeamOrbit` と `RotationLineup` へ `nextIndex` を渡す。

- [ ] **Step 4: `TeamOrbit.tsx` の自前計算を消す**

`nextIndex: number | null` を props に足し、`const nextIdx = ...` の行を削除して
`const isNext = nextIndex !== null && i === nextIndex;` にする。
`isAway` を使っていた箇所（`:53` の opacity、`:70` の title）を `skipReason` へ移す。
title は `RotationLineup` と**同じ語**にすること —— 同じ席が周回図と帯で違う呼ばれ方を
すると、どちらの話をしているのか辿れなくなる（`participant-label.ts` の docstring と同じ理由）。

`SKIP_TEXT` を `RotationLineup.tsx` から `rotation-names.ts` へ移して両方が引く形にするか、
`RotationLineup.tsx` から export して `TeamOrbit.tsx` が取り込むか、どちらでもよい。
**2 箇所に別々の表を書かないこと。**

- [ ] **Step 5: 走らせて通ることを確認する**

Run: `cd /workspaces/claym/local/Tasuki/apps/timer-web && pnpm vitest run`

期待: **全部 PASS**。落ちるものは snapshot の造作に `seats` / `nextIndex` が
無いためのはず。造作を直す。

- [ ] **Step 6: `isAway` が 1 件も残っていないことを確認する**

Run: `cd /workspaces/claym/local/Tasuki && grep -rn "isAway" apps packages --include='*.ts' --include='*.tsx' | grep -v /dist/`

期待: **0 件**。コメントや日本語の散文に残っていたら消すか書き換える
（→ [[deleted-symbols-live-on-in-declarations]]）。

- [ ] **Step 7: コミットして push する**

```bash
cd /workspaces/claym/local/Tasuki
git add apps/timer-web/src apps/timer-web/test
git commit -m "$(cat <<'EOF'
fix: 「次は誰か」をサーバーの決定から出す（#276）

- Session / TeamOrbit の (currentIndex + 1) % len を捨て、session.nextIndex を使う
- 次の席は定義上必ず適格になるため、#249 が置いた「（別の画面）」の但し書きを畳む
- 全席が不適格なときは人名を出さず「交代できる人がいません」と示す

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 8: 変異検査を足す

**Files:**
- Create: `scripts/mutations/m41-seat-skip-reason-ignores-standdown.patch`
- Create: `scripts/mutations/m42-next-index-naive.patch`
- Modify: `scripts/mutation-check.mjs`（`MUTATIONS` へ 2 件）

**Interfaces:**
- Consumes: `seatSkipReason`（Task 3）、`buildTimerSnapshotRoom` の `nextIndex`（Task 3）

- [ ] **Step 1: 作業ツリーが clean であることを確認する**

Run: `cd /workspaces/claym/local/Tasuki && git status --porcelain`

期待: **何も出ない。** 変異パッチを作る手順は `git checkout --` を使うので、
未コミットの実装があると消える（→ [[verify-the-break-itself]]。4 度踏んでいる）。

- [ ] **Step 2: 変異 41 を作る（一時離脱の優先を落とす）**

`seatSkipReason` の `if (entry.eligible === false) return "stood-down";` を削る変異。
D3 の優先順位を守っているテストが殺せるはず。

```bash
cd /workspaces/claym/local/Tasuki
# 手で書き換えて diff を取る
git diff > /tmp/m41.diff   # 確認後に scripts/mutations/ へ整形して置く
git checkout -- apps/tasuki-sync/src/application/timer-snapshot-dto.ts
```

パッチの頭に既存パッチと同じ書式のコメント（検出を期待するテスト・適用/復元の手順）を付ける。

- [ ] **Step 3: 変異 42 を作る（nextIndex を素朴な計算へ戻す）**

`buildTimerSnapshotRoom` の `nextIndex` を `(currentIndex + 1) % len` へ戻す変異。
これは **#276 が直した欠陥そのもの**なので、殺せなければ直したことの証拠が無い。

- [ ] **Step 4: `MUTATIONS` へ登録する**

```js
  {
    id: 41,
    label: "seatSkipReason から一時離脱の優先を削る",
    patch: "m41-seat-skip-reason-ignores-standdown.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/timer-snapshot-dto.test.ts"],
    note:
      "#276 D3。一時離脱（entry.eligible === false）は在席より先に見る。" +
      "削ると、timer に在席したまま一時離脱している人の理由が null（番が回る）に" +
      "化けるか、away/disconnected という別の理由に化ける。" +
      "**画面が言う理由とサーバーの判断がずれる**という #276 そのものの欠陥。",
  },
  {
    id: 42,
    label: "snapshot の nextIndex を (currentIndex + 1) % len へ戻す",
    patch: "m42-next-index-naive.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/timer-snapshot-dto.test.ts", "test/handlers.driver-advance.test.ts"],
    note:
      "#276 が直した欠陥そのもの。飛ばされる席を数に入れるため、画面が出す「次」と" +
      "実際の交代先が食い違う。殺せないなら、直したことの証拠が無い。",
  },
```

- [ ] **Step 5: 変異検査を走らせる**

Run: `cd /workspaces/claym/local/Tasuki && node scripts/mutation-check.mjs 2>&1 | tail -30`

期待: **41 と 42 の両方が「検出された」側に出る。** 検出されないなら
テストが足りない（Task 3 / Task 6 へ戻ってテストを足す）。

- [ ] **Step 6: 変異検査スクリプト自身の自己テストを走らせる**

Run: `cd /workspaces/claym/local/Tasuki && node --test scripts/mutation-check.test.mjs`

期待: **PASS**。`pnpm test` には scripts の自己テストが入っていない
（→ [[local-green-is-not-ci-green]]）。

- [ ] **Step 7: コミットして push する**

```bash
cd /workspaces/claym/local/Tasuki
git add scripts/mutations/m41-*.patch scripts/mutations/m42-*.patch scripts/mutation-check.mjs
git commit -m "$(cat <<'EOF'
test: 席の理由と次の番に変異検査を足す（#276）

- m41: seatSkipReason から一時離脱の優先を削る（D3 が守る性質）
- m42: nextIndex を素朴な計算へ戻す（#276 が直した欠陥そのもの）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 9: 配布の順序表を更新する

**Files:**
- Modify: `deploy/timer/NOTES.md`

- [ ] **Step 1: いまの順序表を読む**

Run: `cd /workspaces/claym/local/Tasuki && sed -n 1,80p deploy/timer/NOTES.md`

**#274 は「玄関」と「同期サーバー」を別コマンドで配れる前提だったので「同期サーバーが先」と
書いているが、`deploy.sh timer` は画面とサーバーを同じ 1 コマンドの内側で配るため、この前提が
そのまま当てはまるとは限らない。** `deploy/deploy.sh` を読み、`timer` 内部の転送順序
（web dist → server.js → 再起動、画面が先）を確かめてから節を書くこと。

⚠ **節を追記すると直後の小節が親を変える**（→ [[appending-a-section-reparents-the-next-one]]）。
**追記は末尾へ**、または既存節の中へ入れること。

- [ ] **Step 2: 制約を書く**

```markdown
- **#276 で `snapshot.room.session` に `seats` / `nextIndex` が増えた。**
  `RoomSchema` で必須にしてあるため、`deploy.sh timer` 内部の転送順序
  （web dist 転送 → server.js 転送 → 再起動）の、転送後・再起動前の窓で新規に
  読み込んだ画面は旧サーバーの snapshot を検証に落とし「最新ではありません」を見る。
  窓は再起動で閉じ、再起動自体がインメモリのルームを全消滅させるため、影響は
  配布中の数十秒に留まる。**この内部順序（画面→サーバー）は変更しない** ——
  #274 の「玄関」と「同期サーバー」とは違い、`timer` は画面とサーバーが同じ
  1 コマンドの内側にあり、順序を選べない。詳細は設計文書 §7 を参照する。
```

- [ ] **Step 3: リンク検査を走らせる**

Run: `cd /workspaces/claym/local/Tasuki && node scripts/check-links.mjs`

期待: **OK**。

- [ ] **Step 4: コミットして push する**

```bash
cd /workspaces/claym/local/Tasuki
git add deploy/timer/NOTES.md
git commit -m "$(cat <<'EOF'
docs: seats の必須化で同期サーバー先行が要ることを順序表へ書く（#276）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 10: 全体の門を通し、実画面で確かめる

- [ ] **Step 1: 全テストと型検査・lint を走らせる**

```bash
cd /workspaces/claym/local/Tasuki
pnpm -r typecheck && pnpm -r lint && pnpm test
```

期待: **全部緑**。

- [ ] **Step 2: 手元の緑が CI の緑でないことを踏まえ、scripts の自己テストと監査を走らせる**

```bash
cd /workspaces/claym/local/Tasuki
node --test scripts/*.test.mjs
node scripts/audit-structure.mjs
node scripts/audit-public-surface.mjs
```

期待: 全部緑。**公開契約（SC-039）が動くかもしれない** —— `wire.ts` に `Seat` /
`SeatSkipReason` を足したためである。指標が動いたら、それが規範どおりか確かめる
（→ [[metric-and-norm-can-disagree]]）。基準値は main を別の作業ツリーで流して比べる
（→ [[metrics-without-a-verdict-need-a-baseline]]）。

- [ ] **Step 3: E2E を走らせる**

Run: `cd /workspaces/claym/local/Tasuki && pnpm e2e 2>&1 | tail -30`

期待: 緑。**新しいタグは足さない。**

- [ ] **Step 4: 実画面で見る（アサーションより先に「探索」を 1 回）**

`pnpm dev` を上げ、2 つのブラウザ文脈で同じルームへ入り、片方を選択画面へ戻す。
**先に見る** —— 何が起きるかを確かめてから、何を固定するかを決める
（→ [[verify-artifacts-adversarially]]）。

見る項目:
1. 帯に「別の画面」が出るか
2. 片方のタブを**閉じて**「未接続」が出るか（切断の経路。#276 の主題）
3. 「次:」が飛ばされる人を指していないか
4. 「あと N 人・約 M 分後」が詰まった数になっているか
5. 一時離脱を押した人の席に「離脱中」が出るか

⚠ **終わったら dev のポートを解放する**（→ [[free-dev-ports-when-done]]）。
**入口は <http://localhost:5175/> だけ**（:5173 / :5174 を直接開くと再読み込みが止まらない）。

- [ ] **Step 5: 旧実装と新実装を並べて比べる**

`git stash` ではなく、**main を別の作業ツリーで動かして**同じ操作をし、
数字と文言の違いを並べる（→ [[old-vs-new-comparison-finds-what-tests-cannot]]）。
特に「あと N 人」の数が**意図どおりに**変わっているか（意図せず変わっていないか）を見る。

- [ ] **Step 6: PR を作る**

```bash
cd /workspaces/claym/local/Tasuki
gh pr create --title "fix: 交代の輪の席と在席の扱いを揃える（#276）" --body "$(cat <<'EOF'
## 概要

交代の輪の席について、サーバーが既に知っている事実（なぜ番が飛ぶか・次に誰が運転するか）を
wire に載せ、timer の画面がそれを使うようにする。Issue 本文の 3 件に加え、実測で見つかった
2 件（順番の数字のずれ・一時離脱が帯に出ない）を同時に閉じる。

設計正本: `docs/superpowers/specs/2026-09-18-rotation-seat-and-presence-design.md`

## 変更内容

- `snapshot.room.session` に `seats`（席ごとの表示名と理由）と `nextIndex` を追加
- 適格判定を `seatSkipReason` 1 本に統合し、交代の決定と画面が出す理由が同じ関数から出るようにした
- 帯に「離脱中 / 別の画面 / 未接続」の 3 種を出す（現ドライバーと自分には特例）
- 「次は誰か」の自前計算 3 箇所を捨て、サーバーの `nextIndex` を使う
- 「あと N 人・約 M 分後」が飛ばされる席を数に入れないようにした
- 呼び名の判定対象を席と参加者の和集合にし、離席者どうしの同名を呼び分けられるようにした

## ⚠ 配布の順序

`deploy.sh timer` は web dist の転送 → `server.js` の転送 → 再起動の順に進む
（画面が先。画面とサーバーが同じ 1 コマンドの内側にあるため、この順序は選べない）。
`seats` / `nextIndex` を `RoomSchema` で必須にしたため、転送後・再起動前の窓で
新規に読み込んだ画面は旧サーバーの snapshot を検証に落とし「最新ではありません」を見る。
窓は再起動で閉じ、再起動自体がインメモリのルームを全消滅させるため、影響は配布中の
数十秒に留まる（既に開いている画面は旧バンドルのままなので影響を受けない）。
詳細は設計文書 §7 を参照。

## テスト方法

- [ ] `pnpm -r typecheck && pnpm -r lint && pnpm test`
- [ ] `node scripts/mutation-check.mjs`（m41 / m42 が検出される）
- [ ] `pnpm e2e`
- [ ] 実画面: 2 タブで同じルームへ入り、片方を選択画面へ戻す／タブを閉じる／一時離脱を押す

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: 申し送りに宛先を持たせる**

設計 §8 の 2 件は、PR を閉じると宛先を失う（→ [[dated-obligations-need-their-own-home]]）。

1. **`config.members` の畳み込み** —— 新しい Issue を起票する。
   残る読み手は `App.tsx`（自分の名前の縮退）と `snapshot-intents.ts`（ローカル記録）の 2 つで、
   **どちらも「輪の順の表示名」を別の用途に流用している**という点が本題である
2. **現ドライバー切断の 30 秒猶予と帯の印の関係** —— **#250（S6）へコメントで積む**。
   新しい Issue を作らない（S6 は振り返りで、材料はそこに集める決まりである）

⚠ **PR 本文の地の文に `closes #276` と書かない**（squash マージで意図せず閉じる）。
閉じるつもりの Issue だけを、閉鎖キーワードで正しく指すこと
（→ [[closes-keyword-must-not-be-in-backticks]]）。

- [ ] **Step 8: 独立したレビューを回す**

`/code-review` を PR 番号を明示して回す（→ [[code-review-targets-the-current-branch]]）。
**巡の回数は独立性の代わりにならない**（→ [[verify-artifacts-adversarially]]）。
**採点が走っている間に直さない**（→ [[dont-fix-while-scoring-runs]]）。

見てもらいたい点を明示する:
- `seatSkipReason` と `computeIneligibleIndices` の関係が恒真なテストで守られていないか
- `seats` の必須化で、旧サーバーとの組み合わせに他の壊れ方が無いか
- 呼び名の和集合が、いままで識別子が付いていた場面を壊していないか
