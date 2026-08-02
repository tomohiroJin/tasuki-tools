# plan: SyncClient のコールバックを最新ハンドラ束へ転送する（Issue #46）

> **エージェント実行者へ:** 本計画は `superpowers:subagent-driven-development` または
> `superpowers:executing-plans` でタスク単位に実行する。手順は `- [ ]` チェックボックス形式。

**ゴール:** `App.tsx` から state の写しを保持する ref（`latestRef`）を撤廃し、
`SyncClient` のコールバックが常に最新レンダーのハンドラを呼ぶようにする。

**アーキテクチャ:** ハンドラ本体を render 本体のスコープに置き、`useLatestRef` で
1本の ref（`handlersRef`）へ同期する。`SyncClient` へ渡すのは
`handlersRef.current` の同名関数へ転送するだけの関数。`SyncClient` は無改造。
client インスタンスは転送関数の closure から第1引数で渡す。

**技術スタック:** React 18 / TypeScript 5.7 / Vitest + Testing Library / pnpm 9.15 + turbo

**仕様の正本:** `docs/plans/issue-46-sync-handlers-ref/spec.md`（REQ-1〜REQ-8）

---

## Global Constraints

すべてのタスクに暗黙に適用される制約。

- **作業ディレクトリ:** `tdd-mob-pro-timer/`（リポジトリルートは `Tasuki/`）。
- **pnpm は PATH に無い。`corepack pnpm` で起動する。**
- **対象テストの実行（速い・実装中はこちらを使う）:**
  `corepack pnpm --filter @tdd-mob/web exec vitest run test/ui/<file>`
  （`@tdd-mob/core` は vitest.config.ts でソースへ alias されているためビルド不要）
- **全件テスト（約660秒かかる。節目でのみ回す）:**
  `corepack pnpm --filter @tdd-mob/web test`
- **ベースライン: 82ファイル / 571件 すべて pass**（2026-08-03 実測）。下回らせない。
- **挙動を変えない（REQ-5）。** 画面遷移・文言・タイミング・表示条件のいずれも変更しない。
- **10個のガード用 ref は触らない（REQ-4）:** `isCreatorRef` / `pendingDriverJoinRef` /
  `problemRequestedRef` / `recordSavedRef` / `bannerTimerRef` / `prevHostRef` /
  `generatingTimerRef` / `pendingResumeRef` / `resumeDisplayNameRef` / `joinedFromUrlRef`。
- **`apps/web/src/sync/client.ts` に差分を出さない。**
- **ref への同期は render 本体内で行う（REQ-3）。`useEffect` を挟まない。**
- コメント・docstring は日本語。コミットメッセージは Conventional Commits（日本語本文）。
- ブランチ: `refactor/issue-46-sync-handlers-ref`（作成済み）。`main` へ直接コミットしない。

---

## ファイル構成

| ファイル | 役割 | 変更 |
|---|---|---|
| `apps/web/test/ui/App.sync-handlers.test.tsx` | 本 Issue の characterization test（未カバー経路） | **新規** |
| `apps/web/src/App.tsx` | ハンドラ束の導入・`latestRef` 撤去・`getConfig` 撤去 | 変更 |
| `apps/web/src/ui/use-latest-ref.ts` | doc コメントを「ハンドラ束も保持する」実態へ更新 | コメントのみ |
| `apps/web/test/ui/App.state-ref.test.tsx` | #41 の成果物。**内容は変えない**（ヘッダコメントのみ追記） | コメントのみ |
| `docs/plans/codebase-refactoring/baseline.md` | §17 として本 Issue の実測値を追記 | 追記 |

`App.state-ref.test.tsx` を書き換えず新規ファイルを足すのは、#41 の安全網を
リファクタと同時にいじると「テストを直したから緑になった」のか
「実装が正しいから緑なのか」が切り分けられなくなるため。

---

### Task 1: characterization test を補強する（REQ-6）

既存 `App.state-ref.test.tsx` は `onRoom`（お題再生成・生成中解除・完成記録）と
`onNotice` を覆っているが、以下4経路が未カバー。**リファクタ前に**追加し、
「変更前も変更後も緑」を確認できる状態にする。

**Files:**
- Create: `apps/web/test/ui/App.sync-handlers.test.tsx`

**Interfaces:**
- Consumes: `FakeWS`（`test/support/fakes.js`）、`aRoomView`（`test/support/room-view.js`）
- Produces: なし（テストのみ）

覆う経路と、それが読む state:

| ケース | コールバック | 読む state |
|---|---|---|
| 退出時に直前ルームコードが参加画面へ引き継がれる | `onError` / `leave-room` | `room` |
| snapshot に自分が現れたら `member.add` を1回だけ送る | `onRoom` | `participantId` |
| `room.created` → snapshot で `saveResumeIdentity` が呼ばれる | `onRoom` | （`pendingResumeRef`・回帰防止） |
| `need-problem` でロビーの言語/難易度が生成に渡る | `onNeedProblem` | `room` |

- [ ] **Step 1: テストファイルを作成する（失敗させる前の準備）**

`apps/web/test/ui/App.sync-handlers.test.tsx` を新規作成:

```tsx
/**
 * App.tsx の SyncClient コールバックが「最新の state」を読む経路の characterization test
 * （Issue #46）。
 *
 * `makeClient` のコールバックは生成時の値で固定される（closure）ため、最新の state を
 * 読むには特別な作法が要る。Issue #46 はその作法を「state の写し ref（latestRef）」から
 * 「最新ハンドラ束への転送」へ入れ替えるリファクタで、読み取る値も同期タイミングも変えない。
 *
 * 既存の `App.state-ref.test.tsx`（Issue #41 の安全網）が覆っていない経路を、
 * リファクタ着手前にここで固定する。`App.state-ref.test.tsx` は #41 の成果物として
 * 内容を変えず、本ファイルを足す形にしている（テストを書き換えると「実装が正しいから
 * 緑」なのか「テストを直したから緑」なのかが切り分けられなくなるため）。
 *
 * @requirements Issue #46 REQ-6
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import { loadResumeIdentity } from "../../src/sync/resume-identity.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

// お題生成に渡る言語・難易度は、生成結果（pickFallback）からは観測できない
// （時刻ベースの疑似ランダム選択で、言語が一致しなければ全件から選ぶため）。
// プロバイダの境界だけを差し替えて「何が渡されたか」を直接観測する。
const generateSpy = vi.fn().mockResolvedValue({
  problem: {
    title: "定型",
    description: "定型のお題",
    requirements: [],
    exampleTest: "",
    hints: [],
    source: "fallback",
  },
  source: "fallback",
});
vi.mock("../../src/ai/no-ai.js", () => ({
  NoAiProvider: class {
    generate(language: string, difficulty: string) {
      return generateSpy(language, difficulty);
    }
  },
}));

const HOST_ID = "host-1";
const OTHER_ID = "other-1";

function participant(participantId: string, displayName: string, role: "host" | "editor" = "host") {
  return {
    participantId,
    connId: `c-${participantId}`,
    displayName,
    role,
    presence: "online" as const,
    hasAiKey: false,
    joinedAt: 0,
  };
}

/** テスト用に FakeWS を OPEN 状態にし、connect() のキュー送信をフラッシュする。 */
function openLatestSocket(): FakeWS {
  const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
  ws.readyState = FakeWS.OPEN;
  ws.onopen?.();
  return ws;
}

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
  // Join/Setup は前回の名前を localStorage から復元する。テスト間で漏らさない。
  clearPreferences();
  generateSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  clearPreferences();
  // ?room= を次のテストへ持ち越さない（App は初回 useEffect で URL を読む）。
  window.history.replaceState(null, "", "/");
});

/** Setup 画面から「ルームを作る」まで進め、接続済み FakeWS を返す。 */
function createRoomAndConnect(): FakeWS {
  render(<App />);
  fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "Host" } });
  fireEvent.click(screen.getByRole("button", { name: /ルームを作る/ }));
  return openLatestSocket();
}

describe("SyncClient コールバックが最新の state を読む経路（Issue #46）", () => {
  it("onError/leave-room: 退出させられたとき直前のルームコードが参加画面へ引き継がれる", () => {
    // Given: ROOM01 のロビーに居る
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: HOST_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({ code: "ROOM01", hostParticipantId: HOST_ID, participants: [participant(HOST_ID, "Host")] }),
    });

    // When: ホストに退出させられた（destination: "join"）
    sendServer(ws, { type: "error", code: "REMOVED_BY_HOST", message: "removed" });

    // Then: 参加画面へ移り、直前のルームコード（room?.code から解決）が引き継がれている
    // （Join.tsx はコードを見出しではなく本文の span に出す）
    expect(screen.getByRole("heading", { name: "モブに参加" })).toBeInTheDocument();
    expect(screen.getByText(/ROOM01/)).toBeInTheDocument();
  });

  it("onRoom: snapshot に自分が現れたら member.add を1回だけ送る（driver 宣言）", () => {
    // Given: ?room= からドライバーとして参加する
    window.history.replaceState(null, "", "/?room=ROOM01");
    render(<App />);
    fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "Guest" } });
    fireEvent.click(screen.getByRole("radio", { name: "ドライバーとして参加" }));
    fireEvent.click(screen.getByRole("button", { name: /参加/ }));
    const ws = openLatestSocket();
    sendServer(ws, { type: "room.joined", code: "ROOM01", resumeToken: "rt", participantId: OTHER_ID });

    // When: 自分を含む snapshot が届く（rotation には未加入）
    const sendSpy = vi.spyOn(ws, "send");
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        hostParticipantId: HOST_ID,
        participants: [participant(HOST_ID, "Host"), participant(OTHER_ID, "Guest", "editor")],
        session: { rotation: [HOST_ID], driverCounts: [0] },
      }),
    });

    // Then: 自分の participantId（onIdentity で確定した最新値）で member.add が飛ぶ
    const added = sendSpy.mock.calls
      .map(([raw]) => JSON.parse(raw as unknown as string))
      .filter((c) => c.command === "member.add");
    expect(added).toEqual([{ command: "member.add", participantId: OTHER_ID }]);
  });

  it("onRoom: room.created の resumeToken が snapshot の room.code と組で保存される", () => {
    // Given/When: ルームを作り、識別情報と snapshot を受け取る
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt-1", participantId: HOST_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({ code: "ROOM01", hostParticipantId: HOST_ID, participants: [participant(HOST_ID, "Host")] }),
    });

    // Then: onIdentity で預けた token が、onRoom の room.code と結合して保存される
    expect(loadResumeIdentity()).toEqual({
      code: "ROOM01",
      participantId: HOST_ID,
      resumeToken: "rt-1",
      displayName: "Host",
    });
  });

  it("onNeedProblem: 生成にはロビーで設定された最新の言語・難易度が渡る", async () => {
    // Given: ロビーの設定が Python / hard に変わっている
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: HOST_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        hostParticipantId: HOST_ID,
        participants: [participant(HOST_ID, "Host")],
        config: { language: "Python", difficulty: "hard" },
        problem: {
          title: "既存",
          description: "既存のお題",
          requirements: [],
          exampleTest: "",
          hints: [],
          source: "fallback",
        },
      }),
    });

    // When: 代表に選ばれる（need-problem）
    sendServer(ws, { type: "signal", signal: "need-problem", requestId: "req-1", deadlineMs: 60000 });

    // Then: 生成時の引数が room.config の最新値になっている
    await waitFor(() => expect(generateSpy).toHaveBeenCalledWith("Python", "hard"));
  });
});
```

- [ ] **Step 2: テストを実行して緑になることを確認する**

Run:
```bash
cd tdd-mob-pro-timer
corepack pnpm --filter @tdd-mob/web exec vitest run test/ui/App.sync-handlers.test.tsx
```
Expected: **4件すべて PASS**。

★ここは TDD の「まず赤」ではない。**characterization test（現状の挙動を写し取るテスト）**
なので、リファクタ前の実装に対して緑であることが正しい。もし赤になったら、
テストの前提（UI のラベル名・ワイヤ形式）が実装と食い違っている。実装を変えるのではなく、
**テスト側を実装の実際の挙動に合わせて直す**こと。

確認済みの前提（計画作成時に実物と突き合わせた）:
- `Join.tsx` の見出しは「モブに参加」、ルームコードは本文の `<span>` に出る。
- 参加モードは `role="radio"` で `aria-label="ドライバーとして参加"` /「見学で参加」。
- 参加ボタンは `getByRole("button", { name: /参加/ })` で引ける（既存 `Join.test.tsx` と同じ）。
- `shouldAutoJoinRotation` は「participantId があり、rotation に含まれない」なら true
  （`apps/web/src/ui/join-driver-intent.ts`）。テストの rotation は `[HOST_ID]` のみなので条件を満たす。

それでも赤になった場合は、実装ではなく**テスト側**を実際の挙動に合わせて直すこと。

- [ ] **Step 3: コミットする**

```bash
git add apps/web/test/ui/App.sync-handlers.test.tsx
git commit -m "$(cat <<'EOF'
test: Issue #46 の characterization test を追加

リファクタ前の挙動を固定する安全網。既存の App.state-ref.test.tsx（#41）が
覆っていない4経路を追加した。

- onError/leave-room: 退出時に直前ルームコードが参加画面へ引き継がれる（room 読み）
- onRoom: snapshot に自分が現れたら member.add を1回だけ送る（participantId 読み）
- onRoom: room.created の resumeToken が snapshot の room.code と組で保存される
- onNeedProblem: 生成にロビーの最新の言語・難易度が渡る（room 読み）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: UI から呼ばれる4関数を素の state 読みへ変える

`latestRef` の参照のうち、WS コールバックではなく UI から呼ばれる経路を先に外す。
小さく独立しており、ここだけでレビューできる。`latestRef` 自体はまだ残す。

**Files:**
- Modify: `apps/web/src/App.tsx`（`leaveRotation` / `changeOwnRole` / `copyProblem` / `regenerateProblem`）

**Interfaces:**
- Consumes: Task 1 のテスト（安全網）
- Produces: なし（`latestRef` はまだ存在する）

- [ ] **Step 1: `leaveRotation` を書き換える**

現在:
```tsx
  /** 自分をローテーションから外す。index は描画時ではなく送信時の最新 snapshot
   *  （latestRef.current.room）から解決し、同時編集による index ずれで別人を外す事故を防ぐ（レビュー #1）。
   *  照合は参加者ID（D6b）なので、同名の別人の枠を外すことはない。 */
  const leaveRotation = (participantId: string) => {
    const idx = latestRef.current.room?.session.rotation.indexOf(participantId) ?? -1;
    if (idx >= 0) client?.send({ command: "member.remove", index: idx });
  };
```

変更後（REQ-8 のコメント更新もここで行う）:
```tsx
  /** 自分をローテーションから外す。index は描画時ではなく送信時の最新 snapshot から
   *  解決し、同時編集による index ずれで別人を外す事故を防ぐ（レビュー #1）。
   *  この関数は毎レンダー作り直されて子へ渡り（メモ化していない）、`room` は
   *  直前にコミットされた snapshot なので、押した瞬間の最新から解決できる。
   *  照合は参加者ID（D6b）なので、同名の別人の枠を外すことはない。 */
  const leaveRotation = (participantId: string) => {
    const idx = room?.session.rotation.indexOf(participantId) ?? -1;
    if (idx >= 0) client?.send({ command: "member.remove", index: idx });
  };
```

- [ ] **Step 2: `changeOwnRole` を書き換える**

現在:
```tsx
  const changeOwnRole = (role: "editor" | "viewer") => {
    if (!latestRef.current.participantId) return;
    client?.send({ command: "role.set", participantId: latestRef.current.participantId, role });
  };
```

変更後:
```tsx
  const changeOwnRole = (role: "editor" | "viewer") => {
    if (!participantId) return;
    client?.send({ command: "role.set", participantId, role });
  };
```

- [ ] **Step 3: `copyProblem` を書き換える**

現在:
```tsx
  const copyProblem = () => {
    const p = latestRef.current.room?.problem;
```

変更後:
```tsx
  const copyProblem = () => {
    const p = room?.problem;
```

- [ ] **Step 4: `regenerateProblem` を書き換える**

現在:
```tsx
  const regenerateProblem = () => {
    const code = latestRef.current.room?.code;
```

変更後:
```tsx
  const regenerateProblem = () => {
    const code = room?.code;
```

- [ ] **Step 5: テストを実行して緑を維持していることを確認する**

Run:
```bash
cd tdd-mob-pro-timer
corepack pnpm --filter @tdd-mob/web exec vitest run test/ui/App.sync-handlers.test.tsx test/ui/App.state-ref.test.tsx test/ui/Lobby.rotation.test.tsx test/ui/SelfDriverToggle.test.tsx test/ui/Session.rotation.test.tsx
```
Expected: すべて PASS。

- [ ] **Step 6: コミットする**

```bash
git add apps/web/src/App.tsx
git commit -m "$(cat <<'EOF'
refactor: UI から呼ばれる4関数の latestRef 読みを素の state 読みへ

leaveRotation / changeOwnRole / copyProblem / regenerateProblem は WS コールバックでは
なく UI から呼ばれる。これらは毎レンダー作り直されて子へ渡るため（メモ化していない）、
latestRef を介さず closure の state を読んでも読み取り時点は同じである。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `makeClient(getConfig)` の引数を撤去する

`getConfig` は create/join の2経路から渡されるが、fallback 値が両者とも
`"TypeScript"` / `"easy"` で同値（spec「付随する簡素化」節）。撤去して
`onNeedProblem` 内で直接読む。この時点ではまだ `latestRef` 経由で読む。

**Files:**
- Modify: `apps/web/src/App.tsx`（`makeClient` の宣言・`onNeedProblem`・`handleCreateRoom`・`handleJoinRoom`）

**Interfaces:**
- Consumes: Task 2 の結果
- Produces: `makeClient(): SyncClient`（引数なし）

- [ ] **Step 1: `makeClient` の宣言から引数を外す**

現在:
```tsx
  // SyncClient の配線を create/join で共有する。
  // getConfig は onNeedProblem 用に「お題生成に使う言語・難易度」を返す。
  const makeClient = (
    getConfig: () => { language: string; difficulty: string },
  ): SyncClient => {
```

変更後:
```tsx
  // SyncClient の配線を create/join で共有する。
  const makeClient = (): SyncClient => {
```

- [ ] **Step 2: `onNeedProblem` を書き換える**

現在:
```tsx
      onNeedProblem: async (requestId) => {
        // 代表に選ばれたらお題を生成して投入する（FR-025）。失敗時もプロバイダが定型へ縮退。
        try {
          const cfg = getConfig();
          const provider = resolveProvider();
          const { problem, source } = await provider.generate(cfg.language, cfg.difficulty);
```

変更後:
```tsx
      onNeedProblem: async (requestId) => {
        // 代表に選ばれたらお題を生成して投入する（FR-025）。失敗時もプロバイダが定型へ縮退。
        try {
          // 言語・難易度は最新のルーム設定（ロビーでの編集を反映）から引く。
          // ★await より前に読む: 生成待ちの間に届いた snapshot の値を使わないため（Issue #46 REQ-7）。
          const language = latestRef.current.room?.config.language ?? "TypeScript";
          const difficulty = latestRef.current.room?.config.difficulty ?? "easy";
          const provider = resolveProvider();
          const { problem, source } = await provider.generate(language, difficulty);
```

- [ ] **Step 3: `handleCreateRoom` の呼び出しを書き換える**

現在:
```tsx
    // お題生成は最新のルーム設定（ロビーでの編集を反映）を参照する。
    const c = makeClient(() => ({
      language: latestRef.current.room?.config.language ?? config.language,
      difficulty: latestRef.current.room?.config.difficulty ?? config.difficulty,
    }));
```

変更後:
```tsx
    const c = makeClient();
```

- [ ] **Step 4: `handleJoinRoom` の呼び出しを書き換える**

現在:
```tsx
    const c = makeClient(() => ({
      language: latestRef.current.room?.config.language ?? "TypeScript",
      difficulty: latestRef.current.room?.config.difficulty ?? "easy",
    }));
```

変更後:
```tsx
    const c = makeClient();
```

- [ ] **Step 5: `handleCreateRoom` の `config` が未使用にならないことを確認する**

`config` は `c.send({ command: "room.create", displayName, config, ... })` で
まだ使われている。未使用にはならない。`lint` で確認する:

```bash
cd tdd-mob-pro-timer && corepack pnpm --filter @tdd-mob/web lint
```
Expected: エラーなし。

- [ ] **Step 6: テストを実行して緑を維持していることを確認する**

Run:
```bash
cd tdd-mob-pro-timer
corepack pnpm --filter @tdd-mob/web exec vitest run test/ui/App.sync-handlers.test.tsx test/ui/App.state-ref.test.tsx
```
Expected: すべて PASS（特に `onNeedProblem` のケースが `("Python", "hard")` で緑）。

- [ ] **Step 7: コミットする**

```bash
git add apps/web/src/App.tsx
git commit -m "$(cat <<'EOF'
refactor: makeClient の getConfig 引数を撤去する

getConfig は create/join の2経路から渡されていたが、fallback 値が両者とも
"TypeScript" / "easy" で同値だったため、onNeedProblem 内で直接読めば足りる。
読み取りは await より前に置き、生成待ちの間に届いた snapshot の値を使わない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: ハンドラ束を導入し、6コールバックを転送化して `latestRef` を撤去する

本 Issue の中核。ハンドラ本体を render 本体のスコープへ移し、
`useLatestRef` で `handlersRef` に同期し、`SyncClient` へは転送関数だけを渡す。

**Files:**
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: Task 3 の結果（`makeClient(): SyncClient`）
- Produces:
  - `handleRoom(syncClient: SyncClient, r: Room): void`
  - `handleIdentity(identity: Identity): void`
  - `handleNeedProblem(syncClient: SyncClient, requestId: string): Promise<void>`
  - `handleError(syncClient: SyncClient, code: string): void`
  - `handleReconnected(syncClient: SyncClient): void`
  - `handleNotice(notice: NoticeSignal): void`
  - `handlersRef`: 上記6関数を持つオブジェクトの `MutableRefObject`

**設計上の注意（実装者向け）:**
- 引数名は `syncClient` にする。`client` にすると同名の state を shadow して紛らわしい。
- ハンドラは `handlersRef` の**前**に定義する（オブジェクトリテラルの評価時に値が要るため）。
- ハンドラ本体が呼ぶ `beginGenerating` / `endGenerating` は、可読性のため
  ハンドラ群の直前へ移動する（純粋な移動。中身は変えない）。
- `handleRoom` 冒頭の `const prevRoom = room;` が、現行の
  `const prevRoom = latestRef.current.room;` と同じ意味を持つ（どちらも直前レンダー値）。

- [ ] **Step 1: 型のインポートを追加する**

`App.tsx` の import 部を変更する。

現在:
```tsx
import { SyncClient } from "./sync/client.js";
```
変更後:
```tsx
import { SyncClient, type Identity } from "./sync/client.js";
```

現在:
```tsx
import { buildNoticeMessage } from "./sync/notice-message.js";
```
変更後:
```tsx
import { buildNoticeMessage, type NoticeSignal } from "./sync/notice-message.js";
```

- [ ] **Step 2: `beginGenerating` / `endGenerating` をハンドラ群の直前へ移動する**

現在 `App.tsx` の下部（`regenerateProblem` の手前）にある以下のブロックを**丸ごと切り取り**、
`makeProxyId` の定義の直後へ貼り付ける。中身は一切変えない。

```tsx
  // 生成中フラグを立て、65 秒の安全弁を張る（サーバ 60 秒タイムアウト＋余裕）。
  const beginGenerating = () => {
    setGeneratingProblem(true);
    if (generatingTimerRef.current) clearTimeout(generatingTimerRef.current);
    generatingTimerRef.current = setTimeout(() => {
      setGeneratingProblem(false);
      generatingTimerRef.current = null;
    }, 65_000);
  };
  const endGenerating = () => {
    setGeneratingProblem(false);
    if (generatingTimerRef.current) {
      clearTimeout(generatingTimerRef.current);
      generatingTimerRef.current = null;
    }
  };
```

- [ ] **Step 3: `latestRef` の宣言をハンドラ束の宣言へ置き換える準備として、宣言部を削除する**

現在（`App.tsx` 84-93 行付近）の以下を**削除**する:

```tsx
  // makeClient のコールバック（onRoom/onIdentity/onNotice 等）は生成時の値で固定される
  // closure である。そのためコールバック内から「最新の state」を読みたい room/endType/
  // participantId/generatingProblem の4つは、同じ値を state（描画用）と ref（closure 用）
  // の両方で持つ並行保持そのものは避けられない（Issue #28・T069/T070・FR-120）。
  // 避けられるのは「render のたびに ref.current を最新値へ同期する」処理が state ごとに
  // 手書きで散っていること。useLatestRef はこの同期を1箇所に集約し、Issue #41 では
  // その集約先そのものを4本の ref から1本のオブジェクト ref へさらにまとめる
  // （render 本体内で毎回新しいオブジェクトを渡すだけなので、4本のときと同期タイミングは
  // 変わらない＝挙動は変えない）。
  const latestRef = useLatestRef({ room, endType, participantId, generatingProblem });
```

- [ ] **Step 4: ハンドラ群と `handlersRef` を追加し、`makeClient` を転送のみに置き換える**

`makeClient` の定義（現行 117-354 行）を、以下で**丸ごと置き換える**
（Step 2 で移動した `beginGenerating` / `endGenerating` の直後に来る）:

```tsx
  // ─── SyncClient のコールバック本体 ─────────────────────────────────────────
  //
  // `SyncClient` のコールバックは生成時の値で固定される closure である（Issue #28）。
  // かつては「最新の state を読むために、同じ値を state と ref の両方で持つ」ことで
  // これを回避していたが、その並行保持そのものが二重管理の温床だった（Issue #41）。
  //
  // 代わりに、ハンドラ本体を render 本体のスコープに置き、`handlersRef` へ毎レンダー
  // 同期する。`SyncClient` へ渡すのは `handlersRef.current` の同名関数を呼ぶだけの
  // 転送関数なので、固定されるのは転送だけで、実際に走るのは常に最新レンダーの
  // ハンドラになる。結果、これらのハンドラは `room` / `endType` / `participantId` /
  // `generatingProblem` を **素の state としてそのまま読める**（Issue #46）。
  //
  // client インスタンスだけは第1引数で受け取る。`client` state は `makeClient` 直後の
  // メッセージ処理時点ではまだ `null` のため、ここから読んではいけない。

  const handleRoom = (syncClient: SyncClient, r: Room) => {
    // このコールバックの実行中に再レンダーは起きない（React 18 の自動バッチング）。
    // よって `room` は直前のレンダー時点の値＝1つ前の snapshot であり、
    // 下で `setRoom(r)` してもこのスコープ内では変わらない。
    const prevRoom = room;
    setRoom(r);
    // 直前の room.created/room.joined で受け取った resumeToken を、今来た snapshot の
    // room.code と組み合わせて保存する（Issue #24・FR-001）。一度保存すれば
    // このクライアントの生存期間中 code/participantId/resumeToken は変わらないため、
    // 以降の snapshot では再保存しない（sessionStorage への書き込みを1回に抑える）。
    if (pendingResumeRef.current) {
      saveResumeIdentity({
        code: r.code,
        participantId: pendingResumeRef.current.participantId,
        resumeToken: pendingResumeRef.current.resumeToken,
        displayName: resumeDisplayNameRef.current,
      });
      pendingResumeRef.current = null;
    }
    // 参加時ドライバー宣言: 自分が参加者に現れたら一度だけ rotation に加入する。
    if (
      pendingDriverJoinRef.current &&
      participantId &&
      r.participants.some((p) => p.participantId === participantId)
    ) {
      // 宣言は「参加時の一度きり」。輪に入れたかに関わらずここで降ろす。
      // 降ろさないと、後で自分が輪を抜けた瞬間に再追加が走り、意図しない再加入になる
      // （サーバー側の枠の消え方の誤りを覆い隠してもいた）。
      pendingDriverJoinRef.current = false;
      if (shouldAutoJoinRotation({ participantId, rotation: r.session.rotation })) {
        syncClient.send({ command: "member.add", participantId });
      }
    }
    // 生成中で、お題の内容が前回から変化したら生成中を解除（AI 成功・定型縮退・タイムアウト確定の全経路）。
    if (shouldClearGenerating(generatingProblem, prevRoom?.problem ?? null, r.problem ?? null)) {
      endGenerating();
    }
    // サーバー権威の phase に全参加者が追従する（ホストの開始/完成が全員に反映）
    setMode(screenForPhase(r.phase));
    // ロビー（開始前）でお題が未確定かつ problemEnabled=true なら、作成者が一度だけ代表生成を依頼する（US3）。
    // これがないと誰も problem.request を送らず「お題を準備中」のまま開始できない。
    if (
      shouldAutoRequestProblem({
        phase: r.phase,
        hasProblem: !!r.problem,
        isCreator: isCreatorRef.current,
        alreadyRequested: problemRequestedRef.current,
        problemEnabled: r.config.problemEnabled !== false,
      })
    ) {
      problemRequestedRef.current = true;
      syncClient.send({ command: "problem.request", requestId: `req-${r.code}-lobby` });
    }
    // 難易度・言語をロビーで変えたら、お題を作り直して選択と中身を一致させる（①）。
    // 代表（作成者）のみが依頼し、変化時だけ発火するのでループしない。
    const cfgChanged =
      prevRoom?.code === r.code &&
      (prevRoom.config.difficulty !== r.config.difficulty ||
        prevRoom.config.language !== r.config.language);
    if (
      cfgChanged &&
      isCreatorRef.current &&
      (r.phase === "setup" || r.phase === "ready") &&
      !!r.problem &&
      r.config.problemEnabled !== false
    ) {
      syncClient.send({ command: "problem.request", requestId: `req-${r.code}-cfg-${Date.now()}` });
      beginGenerating();
    }
    // 完成フェーズかつ「完成（中断でない）」のとき、各端末でローカル記録を生成し
    // IndexedDB へ永続化する（FR-020/028/059）。中断（abort）では記録を作らない。
    // 二重保存は recordSavedRef でガードする（celebration の snapshot が複数回来ても1回）。
    if (r.phase === "celebration" && r.problem && endType !== "abort" && !recordSavedRef.current) {
      recordSavedRef.current = true;
      const built = buildCompletionRecord(
        { session: r.session, clock: r.clock },
        r.problem,
        r.config,
        Date.now(),
        r.code,
      );
      setRecord((prev) => prev ?? built);
      // 完成記録を端末ローカルに自動保存（押し忘れ防止・FR-020「達成を記録」）。
      persistRecordIfComplete("complete", built, saveRecord).catch((e) =>
        console.error("完成記録の保存に失敗しました:", e),
      );
    }
  };

  const handleIdentity = ({ participantId: pid, resumeToken }: Identity) => {
    setParticipantId(pid);
    // room.code はこの時点でまだ分からないため、次の snapshot（handleRoom）で保存する。
    pendingResumeRef.current = { participantId: pid, resumeToken };
  };

  const handleNeedProblem = async (syncClient: SyncClient, requestId: string) => {
    // 代表に選ばれたらお題を生成して投入する（FR-025）。失敗時もプロバイダが定型へ縮退。
    try {
      // 言語・難易度は最新のルーム設定（ロビーでの編集を反映）から引く。
      // ★await より前に読む: 生成待ちの間に届いた snapshot の値を使わないため（Issue #46 REQ-7）。
      const language = room?.config.language ?? "TypeScript";
      const difficulty = room?.config.difficulty ?? "easy";
      const provider = resolveProvider();
      const { problem, source } = await provider.generate(language, difficulty);
      syncClient.send({
        command: "problem.submit",
        requestId,
        problem,
        usedFallback: source === "fallback",
      });
    } catch (e) {
      console.error("お題生成に失敗しました（deadline で再委譲されます）:", e);
    }
  };

  const handleError = (syncClient: SyncClient, code: string) => {
    console.error("WS error:", code);
    // 画面が次に何をするかは errorAction() の判定に委ねる（Issue #32・FR-127/129）。
    // 分岐は kind の判別可能合併を網羅する（未処理の kind があれば型検査で気づける）。
    const action = errorAction(code);
    switch (action.kind) {
      case "session-lost": {
        // ルーム喪失（揮発サーバー再起動等）は明示的に「セッション喪失」を表示し、継続する（FR-007/059）。
        // ローカル記録は保持され、再接続では消えないよう sessionLost を立てる。
        setSessionLost(true);
        setBanner({ text: "セッションが見つかりません。ローカルの記録は保持されています。", kind: "error" });
        // ルームごと消失した以上、保存済みの resumeToken はもう使えない（Issue #24・FR-005）。
        clearResumeIdentity();
        return;
      }
      case "leave-room": {
        // 退出が成立した本人を取り残さない（自己退出＝LEFT_ROOM／他者に退出させられた＝
        // REMOVED_FROM_ROOM・REMOVED_BY_HOST）。後始末は行き先によらず共通で、
        // 違うのはバナー文言（friendlyError(code) から引く）と行き先だけ（Issue #32・FR-127/128）。
        const removedFrom = room?.code ?? null;
        syncClient.dispose();
        setRoom(null);
        setClient(null);
        setParticipantId("");
        isCreatorRef.current = false;
        problemRequestedRef.current = false;
        recordSavedRef.current = false;
        setSessionLost(false);
        setRecord(null);
        // 明示的に退出が成立した以上、この参加者としてのリジュームはもう意味を持たない
        // （次に別ルームへ入ったときに誤って古いルームへ復帰しようとしないため・Issue #24・FR-004）。
        clearResumeIdentity();
        // ルーム由来の画面状態は退出成立時に破棄する（FR-128）。
        // お題生成中フラグ・安全弁タイマーもルーム固有の途中状態なので、
        // 持ち越すと次に入った別ルームで「何も頼んでいないのに生成中」の
        // 表示が最大65秒残ってしまう。beginGenerating と対になる endGenerating を
        // ここでも再利用し、後始末を二重に書かない（DRY）。
        endGenerating();
        // バナー自動消去タイマーが生きていると、退出バナー表示後にそのタイマーが
        // 発火して退出バナーを消してしまう（例: ロビーの一時エラーで4秒タイマーが
        // 仕掛かった直後に自己退出した場合）。ここで確実に解除する。
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        // 退出バナーは自動消去しない。入口画面へ遷移した後も「抜けたこと」を
        // 利用者が確認できるまで残し続けるべきで、新しいタイマーは張らない
        // （Issue #32 の狙い＝退出が分からない問題の再発防止）。
        bannerTimerRef.current = null;
        setBanner({ text: friendlyError(code), kind: "warn" });
        if (action.destination === "join") {
          // 直前のルームコードがあれば参加画面へ引き継ぐ（無ければ入口へ・現状の挙動を維持）。
          if (removedFrom) {
            setJoinCode(removedFrom);
            setMode("join");
          } else {
            setMode("setup");
          }
        } else {
          // destination === "setup": 入口画面へ戻すときは直前ルームへの手がかりを
          // 保持しない（FR-127 / US2-2）。joinCode に値が残っている可能性があるので
          // 明示的にクリアする。
          setJoinCode(null);
          // 画面上の state をクリアしただけでは不十分。アドレスバーの URL に
          // ?room=... が残っていると、それ自体が「直前のルームへ復帰するための
          // 手がかり」になり、リロード一発で抜けたはずのルームの参加画面へ
          // 戻ってしまう。pushState ではなく replaceState を使い、戻るボタンの
          // 履歴に退出前の URL を積まないようにする。
          window.history.replaceState(null, "", stripRoomParam(window.location.href));
          setMode("setup");
        }
        return;
      }
      case "transient": {
        // それ以外は「一時的な操作エラー」。分かりやすい日本語にし、数秒で自動消去する
        // （生のコードを残し続けない・画面遷移後も居座らせない）。
        setBanner({ text: friendlyError(code), kind: "warn" });
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => setBanner(null), 4000);
        return;
      }
      default: {
        // 網羅チェック: action.kind に新しい種類が増えたらここで型検査が落ちる（T018・DbC）。
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  };

  // WS が切断後に自動再接続したとき、保存済みの resumeToken で room.join を
  // 利用者の操作なしに再送する（Issue #24・FR-002/FR-003）。初回 connect() では
  // 呼ばれないため、ここでの二重送信は起きない。
  const handleReconnected = (syncClient: SyncClient) => {
    const saved = loadResumeIdentity();
    if (!saved) return;
    syncClient.send({
      command: "room.join",
      code: saved.code,
      displayName: saved.displayName,
      hasAiKey: false,
      resumeToken: saved.resumeToken,
    });
  };

  // 破壊的操作の実行者を全員へ伝える（Issue #22・FR-077）。
  // banner は aria-live 付きのライブリージョンなので、そのまま読み上げにも乗る。
  const handleNotice = (notice: NoticeSignal) => {
    const text = buildNoticeMessage(notice, {
      selfParticipantId: participantId,
      participants: room?.participants ?? [],
    });
    setBanner({ text, kind: "warn" });
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => setBanner(null), 4000);
  };

  // 上のハンドラ群を1本の ref へ毎レンダー同期する。同期は render 本体で行う
  // （useEffect を挟むと差し替えが1レンダー遅れ、その隙間に届いた WS メッセージを
  // 古いハンドラが処理してしまう・Issue #46 REQ-3）。
  const handlersRef = useLatestRef({
    handleRoom,
    handleIdentity,
    handleNeedProblem,
    handleError,
    handleReconnected,
    handleNotice,
  });

  // SyncClient の配線を create/join で共有する。
  // 各コールバックは handlersRef.current の同名ハンドラへ転送するだけで、
  // 生成時に固定されても実際に走るのは常に最新レンダーのハンドラになる。
  // onConnected / onDisconnected / onConnectionChange は setter 呼び出し1行で、
  // setter の同一性は React が保証しているため closure 固定の害がなく、転送を挟まない。
  const makeClient = (): SyncClient => {
    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
    const newClient = new SyncClient({
      url: wsUrl,
      onRoom: (r) => handlersRef.current.handleRoom(newClient, r),
      onIdentity: (identity) => handlersRef.current.handleIdentity(identity),
      onNeedProblem: (requestId) => handlersRef.current.handleNeedProblem(newClient, requestId),
      onError: (code) => handlersRef.current.handleError(newClient, code),
      onConnected: () => setBanner(null),
      onDisconnected: () =>
        setBanner({ text: "接続が切れました。再接続しています...", kind: "warn" }),
      onConnectionChange: (s) => setConnState(s),
      onReconnected: () => handlersRef.current.handleReconnected(newClient),
      onNotice: (notice) => handlersRef.current.handleNotice(notice),
    });
    newClient.connect();
    setClient(newClient);
    return newClient;
  };
```

- [ ] **Step 5: `latestRef` の残存参照が無いことを確認する**

```bash
cd tdd-mob-pro-timer && grep -n "latestRef" apps/web/src/App.tsx
```
Expected: **何も出力されない**。出た場合はその箇所を素の state 読みへ置き換える。

- [ ] **Step 6: 型検査を通す**

```bash
cd tdd-mob-pro-timer && corepack pnpm --filter @tdd-mob/web typecheck
```
Expected: エラーなし。

想定される失敗と対処:
- `Cannot find name 'Identity'` / `'NoticeSignal'` → Step 1 の import を入れ忘れている。
- `Block-scoped variable 'beginGenerating' used before its declaration` →
  TypeScript は「ブロックスコープ変数の宣言前の使用」を、関数本体の中からの参照では
  エラーにしない。もし出た場合は Step 2 の移動が漏れている。

- [ ] **Step 7: lint を通す**

```bash
cd tdd-mob-pro-timer && corepack pnpm --filter @tdd-mob/web lint
```
Expected: エラーなし。

- [ ] **Step 8: App 関連のテストを実行する**

```bash
cd tdd-mob-pro-timer
corepack pnpm --filter @tdd-mob/web exec vitest run test/ui/App.sync-handlers.test.tsx test/ui/App.state-ref.test.tsx test/ui/use-latest-ref.test.tsx
```
Expected: すべて PASS。

- [ ] **Step 9: web パッケージのテストを全件実行する**

```bash
cd tdd-mob-pro-timer && corepack pnpm --filter @tdd-mob/web exec vitest run
```
Expected: **82ファイル / 575件（571 + Task 1 の4件）すべて PASS**。

★1件でも赤なら、そのテストを直すのではなく `App.tsx` の差分を疑う。
このリファクタは挙動を変えない前提なので、赤は「変えてしまった」の証拠である。

- [ ] **Step 10: コミットする**

```bash
git add apps/web/src/App.tsx
git commit -m "$(cat <<'EOF'
refactor: SyncClient のコールバックを最新ハンドラ束への転送にする

state の写しを保持する ref（latestRef）を撤廃し、room / endType / participantId /
generatingProblem を useState 単独保持にした。

- ハンドラ本体を render 本体のスコープへ移し、素の state を直接読むようにした
- SyncClient へ渡すコールバックは handlersRef.current の同名ハンドラへの転送のみ
- client インスタンスは転送関数の closure から第1引数で渡す
  （client state は makeClient 直後のメッセージ処理時点ではまだ null のため）
- ハンドラ束の ref 同期は useLatestRef（render 本体内）で行う。useEffect を挟むと
  差し替えが1レンダー遅れ、その隙間に届いた WS メッセージを古いハンドラが処理する
- setter 1行の onConnected / onDisconnected / onConnectionChange は転送を挟まない

SyncClient は無改造。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 事実と食い違うコメントを更新する（REQ-8）

**Files:**
- Modify: `apps/web/src/ui/use-latest-ref.ts`
- Modify: `apps/web/test/ui/App.state-ref.test.tsx`（ヘッダコメントに追記のみ）

- [ ] **Step 1: `use-latest-ref.ts` の doc コメントを書き換える**

`apps/web/src/ui/use-latest-ref.ts` の冒頭コメント全体を、以下で置き換える
（`export function useLatestRef` 以降の実装とコメントは変えない）:

```ts
/**
 * 値を ref に同期し続け、クロージャから常に最新値を読めるようにする。
 *
 * **用途は「SyncClient のコールバックへ渡すハンドラ束の同期」である**（Issue #46）。
 * `App.tsx` の `makeClient` が生成する各種コールバック（onRoom/onIdentity/onError 等）は
 * 生成時点の値で固定される（closure）。そこで、コールバック本体を render 本体の
 * スコープに置き、それらをまとめたオブジェクトをこのフックで ref へ同期する。
 * `SyncClient` へ渡すのは `ref.current` の同名関数を呼ぶだけの転送関数なので、
 * 固定されるのは転送だけで、実際に走るのは常に最新レンダーのハンドラになる。
 *
 * かつては同じ仕組みで「state の写し」（room/participantId/endType/generatingProblem）を
 * 保持していたが、それは state と ref の並行保持そのものだった。Issue #46 で
 * 保持する中身をハンドラ束へ入れ替え、state の写しは無くなっている。
 *
 * 同期は render 本体の中で行う（`useEffect` を挟まない）。挟むと、passive effect が
 * commit と非同期に flush される都合で、差し替え前に届いた WS メッセージを
 * 1レンダー古いハンドラが処理してしまう。
 */
```

- [ ] **Step 2: `App.state-ref.test.tsx` のヘッダコメントに追記する**

`@requirements Issue #41（#28 D-2）` の行の**直前**に、以下を挿入する:

```
 * なお Issue #46 で `latestRef`（state の写し）は撤廃され、コールバックは
 * ハンドラ束の ref 経由で最新の state を読むようになった。このファイルが検証する
 * 「4組の値が実際に使われるフロー」の期待値は、その前後で変わらない。
 *
```

- [ ] **Step 3: テストを実行して緑を維持していることを確認する**

```bash
cd tdd-mob-pro-timer
corepack pnpm --filter @tdd-mob/web exec vitest run test/ui/use-latest-ref.test.tsx test/ui/App.state-ref.test.tsx
```
Expected: すべて PASS。

- [ ] **Step 4: コミットする**

```bash
git add apps/web/src/ui/use-latest-ref.ts apps/web/test/ui/App.state-ref.test.tsx
git commit -m "$(cat <<'EOF'
docs: latestRef 撤廃に伴い実態と食い違うコメントを更新

- use-latest-ref.ts: 用途を「state の写し」から「ハンドラ束の同期」へ書き換え
- App.state-ref.test.tsx: Issue #46 後も期待値が変わらない旨を追記

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 全体検証と実測値の記録

**Files:**
- Modify: `docs/plans/codebase-refactoring/baseline.md`（リポジトリルート配下）

- [ ] **Step 1: 全パッケージの test / typecheck / lint を実行する**

```bash
cd tdd-mob-pro-timer
corepack pnpm test && corepack pnpm typecheck && corepack pnpm lint
```
Expected: すべて成功。web は 82ファイル / 575件 PASS。

- [ ] **Step 2: `client.ts` に差分が無いことを確認する**

```bash
cd /workspaces/claym/local/Tasuki
git diff main --stat -- tdd-mob-pro-timer/apps/web/src/sync/client.ts
```
Expected: **何も出力されない**（差分なし）。

- [ ] **Step 3: 変更後の実測値を取る**

```bash
cd tdd-mob-pro-timer/apps/web/src
echo "行数: $(wc -l < App.tsx)"
echo "useState宣言: $(grep -cE '= useState' App.tsx)"
grep -nE 'const \w+Ref = useRef|= useLatestRef' App.tsx
```

- [ ] **Step 4: `baseline.md` に §17 を追記する**

`docs/plans/codebase-refactoring/baseline.md` の末尾に、以下を追記する
（`<...>` は Step 3 の実測値で置き換える）:

```markdown
## 17. Issue #46（SyncClient コールバックの転送化・#41 の残作業）実測値

**対象:** `apps/web/src/App.tsx`

| 指標 | Issue #41 完了時（2026-08-01） | **本 PR 後**（2026-08-03） |
|---|---:|---:|
| 行数 | 764 | <実測> |
| `useState` 数 | 11 | <実測> |
| ref 宣言数（`useRef` + `useLatestRef`） | 11 | <実測> |
| うち state の写しを保持する ref | **1**（`latestRef`） | **0** |
| うちハンドラ束を保持する ref | 0 | **1**（`handlersRef`） |
| うち素の `useRef`（純粋なガード用・対象外） | 10 | 10（変更なし） |

### 何が解消され、何が残ったか

`SyncClient` のコールバックを「`handlersRef.current` の同名ハンドラへ転送するだけ」に
変え、ハンドラ本体を render 本体のスコープへ移した。これにより
`room` / `endType` / `participantId` / `generatingProblem` は **`useState` 単独保持**に
なり、Issue #28 D-2 / #41 が問題としていた「同じ値を state と ref の両方で持つ」構造は
消えた。

★**ref 宣言数は変わらない**（`latestRef` が `handlersRef` に置き換わったため）。
本 PR が消したのは「ref に state を複製すること」であって「ref 経由の間接呼び出し」
ではない。`SyncClient` のコールバック登録そのものは生成時固定のままである。
WS という React の外側のイベント源から最新のレンダー結果へ橋を架ける以上、
可変な参照を1つ挟むことは構造上避けられない（React 自身も `useEffectEvent`
（実験的 API）で同型の解を用意しようとしている領域）。判断の根拠は
`docs/plans/issue-46-sync-handlers-ref/spec.md`「この設計で『解消するもの』と
『残るもの』」節を参照。

`useEffect` での再登録（Issue #46 本文が挙げていた案）は採らなかった。passive effect は
commit と同期に flush されないため、その隙間に届いた WS メッセージを古いハンドラが
処理する窓が実在し、#41 spec REQ-2 が禁じた「1レンダー遅れ」を値側からハンドラ側へ
移すだけになるため。
```

- [ ] **Step 5: コミットする**

```bash
cd /workspaces/claym/local/Tasuki
git add docs/plans/codebase-refactoring/baseline.md
git commit -m "$(cat <<'EOF'
docs: baseline.md に Issue #46 の実測値を追記

ref 宣言数は 11 のまま変わらず、消えたのは「ref に state を複製すること」である旨を
明記した（#41 と同じ「本当に解消したのか」の問いに先回りする）。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 実画面での確認

★型が変わらない意味変更は静的検査もテストも検出できない。Issue #22 では
1,412テスト緑・typecheck 通過の状態から実機検証が退行2件を検出した。

**Files:** なし（確認のみ）

- [ ] **Step 1: 開発サーバーを起動する**

```bash
cd tdd-mob-pro-timer && corepack pnpm dev
```
sync サーバー（`127.0.0.1:8787`）と vite（`0.0.0.0:5173`）が両方立つ。

- [ ] **Step 2: 以下のフローを2つのブラウザタブで確認する**

タブA（ホスト）:
1. `http://localhost:5173/` を開き、名前を入れて「ルームを作る」→ ロビーが出る
2. ロビーでお題が自動生成される（「お題を準備中」のまま止まらない）
3. 「お題」タブ →「別のお題にする」→ 生成中表示が出て、新しいお題に切り替わる
4. 言語または難易度を変更 → お題が作り直される
5. 招待 URL をコピーする

タブB（参加者）:
6. 招待 URL を開き、名前を入れて**ドライバー**として「モブに参加」
7. タブAのロビーに参加者として現れ、ドライバーの輪に入っている

タブA:
8. 「セッション開始」→ タイマーが動く。上部へスクロールされている
9. 在席一覧からタブBの参加者を「退出させる」

タブB:
10. 参加画面へ戻り、**ルームコードが引き継がれている**。退出バナーが表示され、消えない

タブA:
11. 「完成」→ Summary に完成記録が出る
12. 「新しいセッション」→ 入口画面に戻る
13. もう一度ルームを作り、セッション開始 →「途中で終える」→ 記録なしの Summary が出る

- [ ] **Step 3: 結果を記録する**

確認できた項目・できなかった項目を、次のタスクの PR 本文へ書けるようにメモする。
退行が見つかった場合は Task 4 の差分を疑い、該当箇所を修正して Task 4 Step 8-9 から
やり直す。

---

### Task 8: PR を作成する

**Files:** なし

- [ ] **Step 1: 差分の全体を確認する**

```bash
cd /workspaces/claym/local/Tasuki
git diff main --stat
git log main..HEAD --oneline
```

- [ ] **Step 2: プッシュして PR を作る**

```bash
cd /workspaces/claym/local/Tasuki
git push -u origin refactor/issue-46-sync-handlers-ref
gh pr create --base main --title "refactor: SyncClient のコールバックを最新ハンドラ束への転送にし、state の写し ref を撤廃する" --body "$(cat <<'EOF'
## 概要

`App.tsx` の `SyncClient` コールバックが生成時 closure で固定される問題に対し、
コールバックを「最新ハンドラ束への転送」に変えることで、`room` / `endType` /
`participantId` / `generatingProblem` を `useState` 単独保持にした。
Issue #41（#28 D-2）が残していた根本原因への対応であり、両 Issue をクローズする。

## 変更内容

- ハンドラ本体を render 本体のスコープへ移し、素の state を直接読むようにした
- `SyncClient` へ渡すコールバックは `handlersRef.current` の同名ハンドラへの転送のみ
  （`onConnected` / `onDisconnected` / `onConnectionChange` は setter 1行なので除く）
- `latestRef`（state の写し）を撤廃
- `makeClient(getConfig)` の引数を撤去（create/join の fallback が同値のため）
- characterization test を4件追加（`App.sync-handlers.test.tsx`）
- 実態と食い違うコメントを更新

`apps/web/src/sync/client.ts` は無改造。

## 何が解消され、何が残ったか

★**ref 宣言数は 11 のまま変わらない**（`latestRef` → `handlersRef`）。
消えたのは「ref に state を複製すること」であって「ref 経由の間接呼び出し」ではない。
`SyncClient` のコールバック登録自体は生成時固定のままである。
判断の根拠は `docs/plans/issue-46-sync-handlers-ref/spec.md` の
「この設計で『解消するもの』と『残るもの』」節を参照。

`useEffect` での再登録案を採らなかったのは、passive effect が commit と同期に
flush されないため、その隙間に届いた WS メッセージを古いハンドラが処理する窓が
実在するため（#41 spec REQ-2 が禁じた「1レンダー遅れ」をハンドラ側へ移すだけになる）。

## テスト方法

- [ ] `corepack pnpm test`（82ファイル / 575件 PASS）
- [ ] `corepack pnpm typecheck`
- [ ] `corepack pnpm lint`
- [ ] 実画面確認: ルーム作成 → ロビーお題自動生成 → 別のお題にする → 設定変更で再生成
      → ドライバー参加 → セッション開始 → 退出させる（コード引き継ぎ）→ 完成 → 中断

Closes #46
Closes #41

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: `code-review:code-review` で PR を敵対的に検証する**

指摘があれば対応し、対応内容を PR にコメントする。

---

## 自己レビュー（計画作成者による確認記録）

**1. spec の網羅性**

| spec の要件 | 対応タスク |
|---|---|
| REQ-1（最新レンダーのハンドラを呼ぶ） | Task 4 |
| REQ-2（state の写し ref を持たない） | Task 4 Step 3・Step 5 |
| REQ-3（同期は render 本体内） | Task 4 Step 4（`useLatestRef` を使用） |
| REQ-4（ガード用 ref 10個は不変） | Global Constraints・Task 6 Step 3 |
| REQ-5（挙動不変） | Task 1（安全網）・Task 4 Step 9・Task 7 |
| REQ-6（4コールバックの characterization test） | Task 1 |
| REQ-7（`room` の読みは await より前） | Task 3 Step 2・Task 4 Step 4 |
| REQ-8（コメント更新） | Task 2 Step 1・Task 5 |
| 受け入れ基準「`client.ts` に差分なし」 | Task 6 Step 2 |
| 受け入れ基準「実画面確認」 | Task 7 |
| 参考「baseline.md §17 に追記」 | Task 6 Step 4 |

**2. プレースホルダ走査**

`baseline.md` の `<実測>` のみ。これは Task 6 Step 3 で取得する値を埋める指示付きで
意図的に残している（計画時点では確定できない値のため）。それ以外に TBD / TODO はない。

**3. 型・名前の整合**

- `handleRoom` / `handleIdentity` / `handleNeedProblem` / `handleError` /
  `handleReconnected` / `handleNotice` の6名は Task 4 の Interfaces・実装コード・
  `handlersRef` のリテラル・`makeClient` の転送先で一致している。
- client 引数名は全ハンドラで `syncClient` に統一（state の `client` を shadow しない）。
- `Identity` は `sync/client.js`、`NoticeSignal` は `sync/notice-message.js` から
  import する（Task 4 Step 1）。いずれも既存の export であることを確認済み。
- `makeClient(): SyncClient` の引数なし化は Task 3 で行い、Task 4 の置換コードも
  引数なしで書かれている。
