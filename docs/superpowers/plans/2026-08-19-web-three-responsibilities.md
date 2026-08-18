# web 層 3 責務再編（#72 E4 / #167）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/timer-web/src/App.tsx`（849 行）から WS 配線とルーム由来の状態を同期フック 1 本へ集約し、判断を純粋関数へ出して、画面を表示に徹させる（`docs/adr/0015` の MUST 2・MUST 3 を適用）。**振る舞いは 1 つも変えない。**

**Architecture:** `SyncClient` のコールバック 6 本と状態 11 個を `src/sync/use-timer-sync.ts` へ移す。`handleRoom` の 7 分岐は純粋関数 `decideSnapshotIntents()` が返す**意図リスト**にし、フックはそれを順に適用するだけにする。送信 27 箇所は純粋ファクトリ `createCommands(send)` へ、バナーは `ui/use-banner.ts` へ出す。MUST 2 は無状態の許可リスト検査 `scripts/audit-web-sync-boundary.mjs` が守る。

**Tech Stack:** TypeScript 6 / React 19 / Vite 8 / Vitest 4 / jsdom 30。検査スクリプトは Node 標準のみ（追加依存は禁止）。

**Spec:** `docs/superpowers/specs/2026-08-19-web-three-responsibilities-design.md`

## Global Constraints

- **利用者から見える振る舞い・公開 URL・WS プロトコルは 1 文字も変えない。** 送る JSON のキーと値、画面の文言、遷移のタイミングをすべて保つ
- **既存の App テスト 5 本を書き換えない** — `test/ui/App.sync-handlers.test.tsx` / `App.state-ref.test.tsx` / `App.resume-on-load.test.tsx` / `App.session-lost.test.tsx` / `App.solo-leave.test.tsx`。これが振る舞い不変の証拠である。**書き換えが必要になったら、それは振る舞いが変わった兆候なので手を止める**
- **`src/records/indexeddb.js` と `src/ai/no-ai.js` のパスを動かさない**（上記 5 本が `vi.mock` でパス指定している）
- **作業ディレクトリは `/home/vscode/tasuki-work`**（overlay）。`/workspaces/claym/local/Tasuki` では作業しない（9p マウントで約 48 倍遅い）
- **ブランチは `refactor/167-web-three-responsibilities`。** `main` へ直接コミットしない
- **コミットメッセージは Conventional Commits ＋ 日本語本文**（`docs/.claude/rules/git-workflow.md`）。末尾に `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **テストの件数を文書へ書かない。** 数えるときは実行する
- **検査スクリプトに依存を足さない。** `node:fs` / `node:path` のみ
- **PR は 1 本**（`docs/guides/pr-granularity.md` の既定）
- **AI 経路は戻さない。** `hasAiKey: false` の 3 箇所（`App.tsx:361` `:448` `:579`）は振る舞いなので変えない

### よく使うコマンド

```bash
cd /home/vscode/tasuki-work

# timer-web の 1 ファイルだけ流す（約 1 秒。turbo を迂回する）
cd apps/timer-web && corepack pnpm exec vitest run test/ui/App.commands.test.tsx

# timer-web 全部
cd apps/timer-web && corepack pnpm exec vitest run

# 全パッケージ（キャッシュを信用しない。Cached: 0 を確認すること）
corepack pnpm test --force

# 検査
node scripts/audit-web-sync-boundary.mjs
node --test scripts/audit-web-sync-boundary.test.mjs
node scripts/check-links.mjs
node scripts/mutation-check.mjs      # 作業ツリーが clean でないと動かない
```

## File Structure

| ファイル | 責務 | 状態 |
|---|---|---|
| `apps/timer-web/src/App.tsx` | 画面の組み立てのみ。同期フックから state と操作を受け取る | 849 行 → 表示のみ |
| `apps/timer-web/src/sync/use-timer-sync.ts` | 唯一の同期フック。`SyncClient` の生成・接続状態・メッセージ配線・ルーム由来 state | 新設 |
| `apps/timer-web/src/sync/snapshot-intents.ts` | 純粋。snapshot 受信時に「何をするか」を意図の配列で返す | 新設 |
| `apps/timer-web/src/sync/commands.ts` | 純粋。`send` を受け取り、送信操作 21 種を返す | 新設 |
| `apps/timer-web/src/ui/use-banner.ts` | バナーの文言と自動消去タイマー（WS 配線ではない） | 新設 |
| `apps/timer-web/test/ui/App.commands.test.tsx` | **再編前に足す**特性テスト。App→prop→WS フレームの対応を全数固定 | 新設 |
| `apps/timer-web/test/ui/App.connection.test.tsx` | **再編前に足す**特性テスト。切断時の接続状態表示 | 新設 |
| `apps/timer-web/test/sync/commands.test.ts` | `createCommands` の全数 | 新設 |
| `apps/timer-web/test/sync/snapshot-intents.test.ts` | 意図の内容と順序 | 新設 |
| `apps/timer-web/test/sync/use-timer-sync.test.tsx` | フックの接続・切断・再接続・dispose | 新設 |
| `apps/timer-web/test/ui/use-banner.test.tsx` | 自動消去する経路としない経路 | 新設 |
| `scripts/audit-web-sync-boundary.mjs` | MUST 2 の機械検査（許可リスト方式） | 新設 |
| `scripts/audit-web-sync-boundary.test.mjs` | 上の自己テスト（CI が `scripts/*.test.mjs` を git から導出して走らせる） | 新設 |
| `.github/workflows/ci.yml` | `quality` ジョブへ検査を 1 行追加 | 変更 |
| `docs/timer/adr/0003-server-authoritative-clock.md` | 影響節へ実測値を追記 | 変更 |
| `docs/adr/0015-web-layer-structure.md` | 影響節へ「検査は E4 が置いた」を追記 | 変更 |
| `docs/guides/architecture.md` | 「再編は E4 で行います」を実態へ | 変更 |

---

## Task 1: 送信配線の特性テストを再編**前**に足す

**なぜ最初か**: 既存 App テスト 5 本が観測している送信コマンドは `problem.request` の 1 種だけで、
残りの配線を誰も守っていない（設計書「重大 1」）。**現行の実装に対して緑を見てから**再編を始める。
再編後に書くと「新しい実装に合わせたテスト」になり退行を検出できない。

**Files:**
- Create: `apps/timer-web/test/ui/App.commands.test.tsx`

**Interfaces:**
- Consumes: `apps/timer-web/test/support/fakes.ts` の `FakeWS`、`apps/timer-web/test/support/room-view.ts` の `aRoomView`
- Produces: なし（テストのみ）。以降のすべての Task がこのテストの緑を維持する

- [ ] **Step 1: テストファイルを書く**

`Lobby` と `Session` を「props をボタンに変えるだけの器」に差し替え、
各コールバックを押したときに WS へ流れるフレームを固定する。
**App がどのラッパーをどの prop へ渡すか**を守るのが狙いで、子の見た目には触れない。

```tsx
/**
 * App が子画面へ渡すコールバックと、実際に WS へ流れるコマンドの対応を固定する
 * characterization test（#167 E4 の安全網）。
 *
 * 既存の App テスト 5 本が観測している送信コマンドは problem.request の 1 種だけで、
 * 残りの配線は誰も守っていない。子コンポーネントのテスト（Session.roster.test.tsx 等）は
 * props のスパイを見ているため、**App がどのラッパーをどの prop へ渡すか**は射程外である。
 * driver.skip と driver.resume を取り違えても 1 件も落ちない状態だった。
 *
 * このファイルは E4 の再編に着手する**前**に、現行の App.tsx に対して書いて緑を確認する。
 * 再編後に書くと「新しい実装に合わせて書いたテスト」になり、退行を検出できない。
 *
 * @requirements #167（#72 E4）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

/** props のうち on〜 をボタンへ変えるだけの器。押すと ARGS の引数でコールバックを呼ぶ。 */
function propHarness(prefix: string) {
  return (props: Record<string, unknown>) => (
    <div>
      {Object.keys(props)
        .filter((k) => k.startsWith("on"))
        .map((k) => (
          <button
            key={k}
            data-testid={`${prefix}:${k}`}
            onClick={() => (props[k] as (...a: unknown[]) => void)(...(ARGS[k] ?? []))}
          >
            {k}
          </button>
        ))}
    </div>
  );
}

/** 各コールバックへ渡す引数。ここに無いものは引数なしで呼ばれる。 */
const ARGS: Record<string, unknown[]> = {
  onEditProblem: [{ title: "新タイトル" }],
  onConfigSet: [{ difficulty: "hard" }],
  onJoinRotation: ["p-2"],
  onLeaveRotation: ["p-2"],
  onRemoveParticipant: ["p-2"],
  onRoleSet: ["p-2", "editor"],
  onSelfRoleChange: ["editor"],
  onTransferHost: ["p-2"],
  onMoveRotation: [0, 1],
  onSetPassphrase: ["ひみつ"],
  onAiUnlock: ["あいことば"],
  onProblemModeSet: ["ai"],
  onHandoffNoteSet: ["引き継ぎメモ"],
  onRenameParticipant: ["p-2", "新しい名前"],
  onDriverSkip: ["p-2"],
  onDriverResume: ["p-2"],
  onDriverAssign: ["p-2"],
  onAddProxy: ["代理さん"],
};

vi.mock("../../src/ui/Lobby.js", () => ({ Lobby: propHarness("lobby") }));
vi.mock("../../src/ui/Session.js", () => ({ Session: propHarness("session") }));

const HOST_ID = "host-1";
const OTHER_ID = "p-2";

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
  clearPreferences();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  clearPreferences();
  window.history.replaceState(null, "", "/");
});

/** ルームを作り、指定 phase の snapshot まで進めて FakeWS を返す。 */
function enterRoom(phase: "ready" | "session"): FakeWS {
  render(<App />);
  fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "Host" } });
  fireEvent.click(screen.getByRole("button", { name: /ルームを作る/ }));
  const ws = openLatestSocket();
  sendServer(ws, {
    type: "room.created",
    code: "ROOM01",
    hostToken: "ht",
    resumeToken: "rt",
    participantId: HOST_ID,
  });
  sendServer(ws, {
    type: "snapshot",
    room: aRoomView({
      code: "ROOM01",
      phase,
      hostParticipantId: HOST_ID,
      participants: [participant(HOST_ID, "Host"), participant(OTHER_ID, "Other", "editor")],
      session: { rotation: [HOST_ID, OTHER_ID], currentIndex: 0 },
      problem: {
        title: "お題",
        description: "説明",
        requirements: [],
        exampleTest: "",
        hints: [],
        source: "fallback",
      },
    }),
  });
  return ws;
}

/** 直近の send 呼び出しから command 名だけを取り出す。 */
function sentCommands(sendSpy: ReturnType<typeof vi.spyOn>): string[] {
  return sendSpy.mock.calls.map((c) => JSON.parse(String(c[0])).command as string);
}

const LOBBY_CASES: Array<[string, string]> = [
  ["onEditProblem", "problem.edit"],
  ["onRegenerateProblem", "problem.request"],
  ["onConfigSet", "config.set"],
  ["onJoinRotation", "member.add"],
  ["onLeaveRotation", "member.remove"],
  ["onRemoveParticipant", "participant.remove"],
  ["onRoleSet", "role.set"],
  ["onTransferHost", "host.transfer"],
  ["onMoveRotation", "member.move"],
  ["onShuffle", "member.shuffle"],
  ["onSetPassphrase", "room.passphrase.set"],
  ["onAiUnlock", "ai.unlock"],
  ["onProblemModeSet", "problem.mode.set"],
];

const SESSION_CASES: Array<[string, string]> = [
  ["onSkip", "session.act"],
  ["onPause", "session.act"],
  ["onResume", "session.act"],
  ["onRestartTimer", "session.act"],
  ["onComplete", "session.complete"],
  ["onAbort", "session.abort"],
  ["onReset", "session.reset"],
  ["onHandoffNoteSet", "handoff.note.set"],
  ["onJoinRotation", "member.add"],
  ["onLeaveRotation", "member.remove"],
  ["onRenameParticipant", "participant.rename"],
  ["onDriverSkip", "driver.skip"],
  ["onDriverResume", "driver.resume"],
  ["onDriverAssign", "driver.assign"],
  ["onAddProxy", "participant.addProxy"],
  ["onRemoveParticipant", "participant.remove"],
  ["onSelfRoleChange", "role.set"],
  ["onTransferHost", "host.transfer"],
  ["onMoveRotation", "member.move"],
  ["onShuffle", "member.shuffle"],
  ["onEditProblem", "problem.edit"],
  ["onRegenerateProblem", "problem.request"],
  ["onSetPassphrase", "room.passphrase.set"],
];

describe("App が子画面へ渡すコールバックと WS コマンドの対応（ロビー）", () => {
  it.each(LOBBY_CASES)("%s は %s を送る", (prop, command) => {
    const ws = enterRoom("ready");
    const sendSpy = vi.spyOn(ws, "send");
    fireEvent.click(screen.getByTestId(`lobby:${prop}`));
    expect(sentCommands(sendSpy)).toContain(command);
  });

  it("onStartSession は problem.request を送らず phase.set と session.act START を送る（お題あり）", () => {
    const ws = enterRoom("ready");
    const sendSpy = vi.spyOn(ws, "send");
    fireEvent.click(screen.getByTestId("lobby:onStartSession"));
    const sent = sendSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(sent.map((m) => m.command)).toEqual(["phase.set", "session.act"]);
    expect(sent[0].phase).toBe("session");
    expect(sent[1].action).toBe("START");
  });
});

describe("App が子画面へ渡すコールバックと WS コマンドの対応（セッション）", () => {
  it.each(SESSION_CASES)("%s は %s を送る", (prop, command) => {
    const ws = enterRoom("session");
    const sendSpy = vi.spyOn(ws, "send");
    fireEvent.click(screen.getByTestId(`session:${prop}`));
    expect(sentCommands(sendSpy)).toContain(command);
  });

  it("session.act の action は押した操作ごとに違う", () => {
    const ws = enterRoom("session");
    const sendSpy = vi.spyOn(ws, "send");
    for (const prop of ["onSkip", "onPause", "onResume", "onRestartTimer"]) {
      fireEvent.click(screen.getByTestId(`session:${prop}`));
    }
    const actions = sendSpy.mock.calls
      .map((c) => JSON.parse(String(c[0])))
      .filter((m) => m.command === "session.act")
      .map((m) => m.action);
    expect(actions).toEqual(["SWITCH", "PAUSE", "RESUME", "RESTART"]);
  });

  it("driver.skip と driver.resume は取り違えていない", () => {
    const ws = enterRoom("session");
    const sendSpy = vi.spyOn(ws, "send");
    fireEvent.click(screen.getByTestId("session:onDriverSkip"));
    fireEvent.click(screen.getByTestId("session:onDriverResume"));
    const sent = sendSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(sent.map((m) => m.command)).toEqual(["driver.skip", "driver.resume"]);
    expect(sent.every((m) => m.participantId === OTHER_ID)).toBe(true);
  });
});
```

- [ ] **Step 2: 実行して緑を確認する**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run test/ui/App.commands.test.tsx
```

期待: **全件 PASS**。

**赤が出たらここで止まる。** 再編前の実装に対する特性テストなので、赤は次のいずれかを意味する。

1. テストの Given が足りない（例: `role` が `host` でないと押せない prop がある）→ テストを直す
2. **本当に配線が間違っている** → それは E4 と別の不具合なので、**別 Issue として起票してから**進む

どちらかを切り分けてから次へ進むこと。**赤のまま「あとで直す」としない。**

- [ ] **Step 3: 期待値が実装の写しになっていないか確かめる（対照実行）**

テストが本当に配線を見ているかを、**壊して赤を見る**ことで確かめる。

```bash
cd /home/vscode/tasuki-work
# driver.skip と driver.resume を入れ替える
grep -cF 'command: "driver.skip"' apps/timer-web/src/App.tsx     # 1 であることを確認
sed -i 's/command: "driver.skip"/command: "driver.resume"/' apps/timer-web/src/App.tsx
grep -cF 'command: "driver.skip"' apps/timer-web/src/App.tsx     # 0 になったことを確認
cd apps/timer-web && corepack pnpm exec vitest run test/ui/App.commands.test.tsx
```

期待: **FAIL**（`driver.skip と driver.resume は取り違えていない` が落ちる）。

```bash
cd /home/vscode/tasuki-work && git checkout apps/timer-web/src/App.tsx
cd apps/timer-web && corepack pnpm exec vitest run test/ui/App.commands.test.tsx   # 緑に戻る
```

**壊した状態はコミットしない。**

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-web/test/ui/App.commands.test.tsx
git commit -m "$(cat <<'EOF'
test: App が子画面へ渡す送信配線を再編前に固定する（#167）

- Lobby / Session を props をボタンへ変える器に差し替え、押したときに
  WS へ流れる command を全数固定する
- 既存の App テストが観測していたのは problem.request の 1 種だけで、
  driver.skip と driver.resume を取り違えても落ちない状態だった
- 対照実行: 実際に取り違えを入れて赤を確認してから戻した

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 接続状態表示の特性テストを再編**前**に足す

**なぜ必要か**: EARS 2（接続が切れている間の表示）は、`deriveConnectionStatus` の単体テストと
`StatusStrip` の表示テストはあるが、**App を通した経路のテストが無い**（設計書「重大 2」）。
部品が緑でも配線が切れていれば誰も気づかない。

**Files:**
- Create: `apps/timer-web/test/ui/App.connection.test.tsx`

**Interfaces:**
- Consumes: `FakeWS`・`aRoomView`（Task 1 と同じ）
- Produces: なし（テストのみ）

- [ ] **Step 1: テストファイルを書く**

```tsx
/**
 * 切断・再接続のときに、App が接続状態をどう見せるかを固定する characterization test
 * （#167 E4 の安全網・EARS 2）。
 *
 * deriveConnectionStatus の単体テストと StatusStrip の表示テストは既にあるが、
 * **App を通して「WS が切れたら再接続中が出る」経路のテストが無かった。**
 * 純粋関数と表示部品が緑でも、その間の配線が切れていれば誰も気づかない。
 *
 * このファイルは E4 の再編に着手する**前**に、現行の App.tsx に対して書いて緑を確認する。
 *
 * @requirements #167（#72 E4）EARS 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const HOST_ID = "host-1";

function participant(participantId: string, displayName: string) {
  return {
    participantId,
    connId: `c-${participantId}`,
    displayName,
    role: "host" as const,
    presence: "online" as const,
    hasAiKey: false,
    joinedAt: 0,
  };
}

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

function enterLobby(): FakeWS {
  render(<App />);
  fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "Host" } });
  fireEvent.click(screen.getByRole("button", { name: /ルームを作る/ }));
  const ws = openLatestSocket();
  sendServer(ws, {
    type: "room.created",
    code: "ROOM01",
    hostToken: "ht",
    resumeToken: "rt",
    participantId: HOST_ID,
  });
  sendServer(ws, {
    type: "snapshot",
    room: aRoomView({
      code: "ROOM01",
      phase: "ready",
      hostParticipantId: HOST_ID,
      participants: [participant(HOST_ID, "Host")],
    }),
  });
  return ws;
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
  clearPreferences();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  clearPreferences();
  window.history.replaceState(null, "", "/");
});

describe("接続状態の表示（EARS 2）", () => {
  it("接続中は再接続中を出さない", () => {
    enterLobby();
    expect(screen.queryByText(/再接続中/)).toBeNull();
  });

  it("WS が切れたら StatusStrip が再接続中になる", () => {
    const ws = enterLobby();

    // When: サーバー側の都合で接続が切れた（dispose 経由ではない）
    act(() => {
      ws.onclose?.();
    });

    // Then: 恒久表示の StatusStrip が再接続中を示す
    expect(screen.getByText(/再接続中/)).toBeInTheDocument();
  });

  it("WS が切れたらバナーで再接続中を知らせる", () => {
    const ws = enterLobby();
    act(() => {
      ws.onclose?.();
    });
    expect(screen.getByText("接続が切れました。再接続しています...")).toBeInTheDocument();
  });

  it("再接続が確立するとバナーが消え、再接続中の表示も消える", () => {
    const ws = enterLobby();
    act(() => {
      ws.onclose?.();
    });
    expect(screen.getByText(/再接続中/)).toBeInTheDocument();

    // When: 同じソケットが開き直った（SyncClient は onopen で online へ戻す）
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });

    // Then: バナーも再接続中の表示も消える
    expect(screen.queryByText("接続が切れました。再接続しています...")).toBeNull();
    expect(screen.queryByText(/再接続中/)).toBeNull();
  });
});
```

- [ ] **Step 2: 実行して緑を確認する**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run test/ui/App.connection.test.tsx
```

期待: **全件 PASS**。

**赤が出たら Task 1 Step 2 と同じ切り分けをする。** 特に注意する点:

- `ws.onclose?.()` の後に `SyncClient` が `scheduleReconnect()` でタイマーを張る。
  テストは同期に判定するので待つ必要は無いが、**`FakeWS.instances` に新しい socket が
  増えることがある**。socket を掴み直すときは常に「最後の 1 本」を使う
- ロビー画面でないと `StatusStrip` は出ない（`mode` が `setup` / `join` / `history` のときは非表示）

- [ ] **Step 3: 対照実行（配線を切って赤を見る）**

```bash
cd /home/vscode/tasuki-work
grep -cF 'onConnectionChange: (s) => setConnState(s)' apps/timer-web/src/App.tsx   # 1 を確認
sed -i 's/onConnectionChange: (s) => setConnState(s),/onConnectionChange: () => {},/' apps/timer-web/src/App.tsx
grep -cF 'onConnectionChange: (s) => setConnState(s)' apps/timer-web/src/App.tsx   # 0 を確認
cd apps/timer-web && corepack pnpm exec vitest run test/ui/App.connection.test.tsx
```

期待: **FAIL**（「WS が切れたら StatusStrip が再接続中になる」が落ちる）。
**バナーのテストは落ちない**（バナーは `onDisconnected` から出るため）。
この非対称が「2 本の経路を別々に見ている」ことの証拠になる。

```bash
cd /home/vscode/tasuki-work && git checkout apps/timer-web/src/App.tsx
cd apps/timer-web && corepack pnpm exec vitest run test/ui/App.connection.test.tsx   # 緑に戻る
```

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-web/test/ui/App.connection.test.tsx
git commit -m "$(cat <<'EOF'
test: 切断時の接続状態表示を再編前に固定する（#167）

- App を通した「WS が切れたら再接続中が出る」経路のテストが無かった
- deriveConnectionStatus と StatusStrip の単体テストはあるが、
  その間の配線は誰も見ていない状態だった
- 対照実行: onConnectionChange の配線を切って赤を確認してから戻した
  （バナーは onDisconnected 経由なので落ちず、2 経路の別を確かめられる）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
## Task 3: 送信ラッパーを `createCommands(send, getRoom)` へ切り出す

**Files:**
- Create: `apps/timer-web/src/sync/commands.ts`
- Create: `apps/timer-web/test/sync/commands.test.ts`
- Modify: `apps/timer-web/src/App.tsx`（21 本の 1 行関数と JSX インライン 6 箇所を差し替える）

**Interfaces:**
- Consumes: `@tasuki/timer-core` の `Room` / `SessionConfig` / `Problem`
- Produces:
  ```ts
  export type SendFn = (cmd: Record<string, unknown>) => void;
  export function createCommands(send: SendFn, getRoom: () => Room | null): TimerCommands;
  ```
  `TimerCommands` の全メソッドは下記のとおり。**Task 6 の同期フックがこの型をそのまま公開する。**

- [ ] **Step 1: 失敗するテストを書く**

```ts
/**
 * createCommands の全数テスト（#167 E4）。
 *
 * App.tsx に散っていた 1 行の送信ラッパーを純粋ファクトリへ集約したもの。
 * 「どの操作がどの command を送るか」をここで固定する。React に依存しない。
 *
 * @requirements #167（#72 E4）
 */
import { describe, it, expect, vi } from "vitest";
import { createCommands, type SendFn } from "../../src/sync/commands.js";
import { aRoomView } from "../support/room-view.js";
import type { Room } from "@tasuki/timer-core";

function setup(room: Room | null = null) {
  const send = vi.fn() as SendFn & ReturnType<typeof vi.fn>;
  const commands = createCommands(send, () => room);
  return { send, commands };
}

/** 送られた 1 通目のフレーム。 */
function firstFrame(send: ReturnType<typeof vi.fn>): Record<string, unknown> {
  expect(send).toHaveBeenCalledTimes(1);
  return send.mock.calls[0]![0] as Record<string, unknown>;
}

describe("createCommands: 引数をそのまま載せる操作", () => {
  const cases: Array<[string, (c: ReturnType<typeof setup>["commands"]) => void, Record<string, unknown>]> = [
    ["addMember", (c) => c.addMember("p-2"), { command: "member.add", participantId: "p-2" }],
    ["removeParticipant", (c) => c.removeParticipant("p-2"), { command: "participant.remove", participantId: "p-2" }],
    ["setRole", (c) => c.setRole("p-2", "editor"), { command: "role.set", participantId: "p-2", role: "editor" }],
    ["transferHost", (c) => c.transferHost("p-2"), { command: "host.transfer", participantId: "p-2" }],
    ["setPassphrase", (c) => c.setPassphrase("ひみつ"), { command: "room.passphrase.set", passphrase: "ひみつ" }],
    ["aiUnlock", (c) => c.aiUnlock("あいことば"), { command: "ai.unlock", key: "あいことば" }],
    ["setProblemMode", (c) => c.setProblemMode("ai"), { command: "problem.mode.set", mode: "ai" }],
    ["moveMember", (c) => c.moveMember(0, 2), { command: "member.move", fromIndex: 0, toIndex: 2 }],
    ["shuffleMembers", (c) => c.shuffleMembers(), { command: "member.shuffle" }],
    ["completeSession", (c) => c.completeSession(), { command: "session.complete" }],
    ["abortSession", (c) => c.abortSession(), { command: "session.abort" }],
    ["actSession", (c) => c.actSession("SWITCH"), { command: "session.act", action: "SWITCH" }],
    ["renameParticipant", (c) => c.renameParticipant("p-2", "新名"), { command: "participant.rename", participantId: "p-2", displayName: "新名" }],
    ["driverSkip", (c) => c.driverSkip("p-2"), { command: "driver.skip", participantId: "p-2" }],
    ["driverResume", (c) => c.driverResume("p-2"), { command: "driver.resume", participantId: "p-2" }],
    ["driverAssign", (c) => c.driverAssign("p-2"), { command: "driver.assign", participantId: "p-2" }],
    ["addProxy", (c) => c.addProxy("proxy-x", "代理"), { command: "participant.addProxy", participantId: "proxy-x", displayName: "代理" }],
    ["editProblem", (c) => c.editProblem({ title: "T" }), { command: "problem.edit", patch: { title: "T" } }],
    ["requestProblem", (c) => c.requestProblem("req-1"), { command: "problem.request", requestId: "req-1" }],
    ["setPhase", (c) => c.setPhase("session"), { command: "phase.set", phase: "session" }],
    ["setConfig", (c) => c.setConfig({ difficulty: "hard" }), { command: "config.set", config: { difficulty: "hard" } }],
    ["resetSession", (c) => c.resetSession(), { command: "session.reset" }],
    ["setHandoffNote", (c) => c.setHandoffNote("メモ"), { command: "handoff.note.set", text: "メモ" }],
  ];

  it.each(cases)("%s", (_name, call, expected) => {
    const { send, commands } = setup();
    call(commands);
    expect(firstFrame(send as ReturnType<typeof vi.fn>)).toEqual(expected);
  });
});

describe("createCommands: removeMember は送信時の snapshot から index を解決する", () => {
  it("輪に居るなら現在の index で member.remove を送る", () => {
    const room = aRoomView({ session: { rotation: ["a", "b", "c"], currentIndex: 0 } });
    const { send, commands } = setup(room);
    commands.removeMember("c");
    expect(firstFrame(send as ReturnType<typeof vi.fn>)).toEqual({ command: "member.remove", index: 2 });
  });

  it("輪に居ないなら何も送らない", () => {
    const room = aRoomView({ session: { rotation: ["a", "b"], currentIndex: 0 } });
    const { send, commands } = setup(room);
    commands.removeMember("z");
    expect(send).not.toHaveBeenCalled();
  });

  it("room が無いなら何も送らない", () => {
    const { send, commands } = setup(null);
    commands.removeMember("a");
    expect(send).not.toHaveBeenCalled();
  });

  it("index は生成時ではなく呼び出し時の snapshot から引く", () => {
    // 生成時は ["a"]、呼び出し時は ["x","a"] という順に変わる。
    // 生成時に固定していれば 0 が送られ、呼び出し時に引けば 1 が送られる。
    let room = aRoomView({ session: { rotation: ["a"], currentIndex: 0 } });
    const send = vi.fn();
    const commands = createCommands(send, () => room);
    room = aRoomView({ session: { rotation: ["x", "a"], currentIndex: 0 } });
    commands.removeMember("a");
    expect(firstFrame(send)).toEqual({ command: "member.remove", index: 1 });
  });
});
```

- [ ] **Step 2: 実行して落ちることを確認する**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run test/sync/commands.test.ts
```

期待: **FAIL**（`Failed to resolve import "../../src/sync/commands.js"`）。

- [ ] **Step 3: `commands.ts` を実装する**

```ts
/**
 * WS コマンドの送信操作（#167 E4）。
 *
 * かつては App.tsx に 1 行の送信ラッパーが 21 本と、JSX の中に直書きが 6 箇所あった。
 * どれも「引数を command の形に載せて送る」だけで、React にも state にも依存しない。
 * ここへ集約することで、画面は「何を送るか」を知らずに「操作」だけを呼べる。
 *
 * **この module は純粋である。** `send` と `getRoom` を外から受け取り、
 * 自分では WebSocket も React も触らない。乱数・現在時刻を必要とする値
 * （代理参加者の ID・requestId）は呼び出し側が作って引数で渡す
 * （`docs/adr/0016` の「環境から直接値を読まない」と同じ向き）。
 */

import type { Problem, Room, SessionConfig } from "@tasuki/timer-core";

/** WS へ 1 フレーム送る関数。`SyncClient.send` をそのまま渡せる形にしてある。 */
export type SendFn = (cmd: Record<string, unknown>) => void;

export interface TimerCommands {
  /** 参加者IDでローテーションへ加える（冪等はサーバー側の重複ガードに委ねる・D6b）。 */
  addMember(participantId: string): void;
  /** ローテーションから外す。index は**呼び出し時**の snapshot から解決する。 */
  removeMember(participantId: string): void;
  removeParticipant(participantId: string): void;
  setRole(participantId: string, role: "editor" | "viewer"): void;
  transferHost(participantId: string): void;
  /** 空文字で解除。 */
  setPassphrase(passphrase: string): void;
  aiUnlock(key: string): void;
  setProblemMode(mode: "ai" | "fallback"): void;
  moveMember(fromIndex: number, toIndex: number): void;
  /** 順列はサーバーが生成するため wire は command のみ。 */
  shuffleMembers(): void;
  completeSession(): void;
  abortSession(): void;
  actSession(action: "SWITCH" | "PAUSE" | "RESUME" | "RESTART"): void;
  renameParticipant(participantId: string, displayName: string): void;
  driverSkip(participantId: string): void;
  driverResume(participantId: string): void;
  driverAssign(participantId: string): void;
  /** participantId は呼び出し側が生成する（乱数をこの module に持ち込まない）。 */
  addProxy(participantId: string, displayName: string): void;
  editProblem(patch: Partial<Omit<Problem, "source" | "edited">>): void;
  /** requestId は呼び出し側が組み立てる（現在時刻をこの module に持ち込まない）。 */
  requestProblem(requestId: string): void;
  setPhase(phase: Room["phase"]): void;
  setConfig(config: Partial<SessionConfig>): void;
  resetSession(): void;
  setHandoffNote(text: string): void;
}

export function createCommands(send: SendFn, getRoom: () => Room | null): TimerCommands {
  return {
    addMember: (participantId) => send({ command: "member.add", participantId }),
    removeMember: (participantId) => {
      // 描画時ではなく送信時の最新 snapshot から解決する。同時編集による index ずれで
      // 別人を外す事故を防ぐ（照合は参加者ID なので、同名の別人の枠は外れない）。
      const idx = getRoom()?.session.rotation.indexOf(participantId) ?? -1;
      if (idx >= 0) send({ command: "member.remove", index: idx });
    },
    removeParticipant: (participantId) => send({ command: "participant.remove", participantId }),
    setRole: (participantId, role) => send({ command: "role.set", participantId, role }),
    transferHost: (participantId) => send({ command: "host.transfer", participantId }),
    setPassphrase: (passphrase) => send({ command: "room.passphrase.set", passphrase }),
    aiUnlock: (key) => send({ command: "ai.unlock", key }),
    setProblemMode: (mode) => send({ command: "problem.mode.set", mode }),
    moveMember: (fromIndex, toIndex) => send({ command: "member.move", fromIndex, toIndex }),
    shuffleMembers: () => send({ command: "member.shuffle" }),
    completeSession: () => send({ command: "session.complete" }),
    abortSession: () => send({ command: "session.abort" }),
    actSession: (action) => send({ command: "session.act", action }),
    renameParticipant: (participantId, displayName) =>
      send({ command: "participant.rename", participantId, displayName }),
    driverSkip: (participantId) => send({ command: "driver.skip", participantId }),
    driverResume: (participantId) => send({ command: "driver.resume", participantId }),
    driverAssign: (participantId) => send({ command: "driver.assign", participantId }),
    addProxy: (participantId, displayName) =>
      send({ command: "participant.addProxy", participantId, displayName }),
    editProblem: (patch) => send({ command: "problem.edit", patch }),
    requestProblem: (requestId) => send({ command: "problem.request", requestId }),
    setPhase: (phase) => send({ command: "phase.set", phase }),
    setConfig: (config) => send({ command: "config.set", config }),
    resetSession: () => send({ command: "session.reset" }),
    setHandoffNote: (text) => send({ command: "handoff.note.set", text }),
  };
}
```

- [ ] **Step 4: 実行して緑を確認する**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run test/sync/commands.test.ts
```

期待: **全件 PASS**。

- [ ] **Step 5: `App.tsx` を `createCommands` 経由へ差し替える**

`App.tsx` の中で、`client` から `commands` を作る。**この時点ではまだ同期フックを作らない。**
差し替えは 1 対 1 で、送るフレームを変えない。

```tsx
// import に追加
import { createCommands } from "./sync/commands.js";

// state 宣言のあと、ハンドラ群より前に置く
// client は state なので毎レンダー作り直されるが、送信は都度呼ぶだけなのでメモ化しない
// （現行の 1 行ラッパーも毎レンダー作り直されており、同じ性質を保つ）。
const roomRef = useLatestRef(room);
const commands = createCommands(
  (cmd) => client?.send(cmd),
  () => roomRef.current,
);
```

差し替えの対応表（**すべて 1 対 1。送るフレームは変えない**）:

| 消す関数（`App.tsx`） | 置き換え |
|---|---|
| `joinRotation` | `commands.addMember` |
| `leaveRotation` | `commands.removeMember` |
| `removeParticipant` | `commands.removeParticipant` |
| `changeParticipantRole` | `commands.setRole` |
| `changeOwnRole` | `(role) => { if (!participantId) return; commands.setRole(participantId, role); }` を残す（**participantId のガードは state 依存なので消さない**） |
| `handleTransferHost` | `commands.transferHost` |
| `handleSetPassphrase` | `commands.setPassphrase` |
| `handleAiUnlock` | `commands.aiUnlock` |
| `handleProblemModeSet` | `commands.setProblemMode` |
| `moveRotation` | `commands.moveMember` |
| `handleShuffle` | `commands.shuffleMembers` |
| `handleComplete` | `() => { setEndType("complete"); commands.completeSession(); }` を残す |
| `handleAbort` | `() => { setEndType("abort"); setRecord(null); commands.abortSession(); }` を残す |
| `act` | `commands.actSession` |
| `rosterRename` | `commands.renameParticipant` |
| `rosterSkip` | `commands.driverSkip` |
| `rosterResume` | `commands.driverResume` |
| `rosterAssign` | `commands.driverAssign` |
| `rosterAddProxy` | `(displayName) => commands.addProxy(makeProxyId(), displayName)` を残す（**乱数は App 側**） |
| `editProblem` | `commands.editProblem` |
| `regenerateProblem` | `beginGenerating()` ＋ `commands.requestProblem(...)` を残す |
| JSX `onStartSession` | `commands.requestProblem` / `commands.setPhase` / `commands.actSession` |
| JSX `onConfigSet` | `commands.setConfig` |
| JSX `onReset` | `commands.resetSession` |
| JSX `onHandoffNoteSet` | `commands.setHandoffNote` |

**`syncClient.send` の 5 箇所と `c.send` の 3 箇所は触らない**（ハンドラ・接続経路の中にあり、
Task 6 で同期フックへ移る）。

- [ ] **Step 6: 全テストを流して緑を確認する**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run
```

期待: **全件 PASS**。特に **Task 1 の `App.commands.test.tsx` と既存 App テスト 5 本が無改造で緑**であること。
1 件でも赤なら差し替えが 1 対 1 になっていない。**テストを直さず、差し替えを直す。**

- [ ] **Step 7: 型検査**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec tsc --noEmit
```

期待: エラー 0。

- [ ] **Step 8: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-web/src/sync/commands.ts apps/timer-web/test/sync/commands.test.ts apps/timer-web/src/App.tsx
git commit -m "$(cat <<'EOF'
refactor: 送信ラッパーを純粋ファクトリ createCommands へ集約する（#167）

- App.tsx の 1 行ラッパー 21 本と JSX 直書き 6 箇所を sync/commands.ts へ
- 乱数（代理参加者ID）と現在時刻（requestId）は呼び出し側が作って渡す
  形にし、この module から環境依存を排する（ADR-0016 と同じ向き）
- removeMember は呼び出し時の snapshot から index を解決する性質を保つ
- 送るフレームは 1 文字も変えていない

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: バナーを `ui/use-banner.ts` へ切り出す

**Files:**
- Create: `apps/timer-web/src/ui/use-banner.ts`
- Create: `apps/timer-web/test/ui/use-banner.test.tsx`
- Modify: `apps/timer-web/src/App.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface Banner { text: string; kind: "warn" | "error" }
  export interface BannerController {
    banner: Banner | null;
    /** autoDismiss を省略すると 4 秒で自動消去する。false で消えないバナーになる。 */
    show(text: string, kind: Banner["kind"], options?: { autoDismiss?: boolean }): void;
    clear(): void;
  }
  export function useBanner(): BannerController;
  ```

**なぜ切り出すか**: バナーは 6 箇所から設定され、そのたびに `bannerTimerRef` の解除と
張り直しが手書きされている。退出バナーだけは**自動消去しない**という例外があり、
現行はそれを「タイマーを張らずに `bannerTimerRef.current = null` を代入する」形で表している。
1 箇所にまとめないと、Task 6 で配線を移すときに片方だけ落ちる。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
/**
 * useBanner（#167 E4）。
 *
 * バナーの文言と自動消去タイマーを 1 箇所へまとめたもの。App.tsx では
 * 6 箇所が bannerTimerRef の解除と張り直しを手書きしており、退出バナーだけが
 * 「自動消去しない」という例外を持っていた（Issue #32 の狙い＝退出が分からない
 * 問題の再発防止）。その例外をここで型として表す。
 *
 * @requirements #167（#72 E4）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBanner } from "../../src/ui/use-banner.js";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useBanner", () => {
  it("初期状態は null", () => {
    const { result } = renderHook(() => useBanner());
    expect(result.current.banner).toBeNull();
  });

  it("show した文言と種別を保持する", () => {
    const { result } = renderHook(() => useBanner());
    act(() => result.current.show("こんにちは", "warn"));
    expect(result.current.banner).toEqual({ text: "こんにちは", kind: "warn" });
  });

  it("既定では 4 秒で自動消去する", () => {
    const { result } = renderHook(() => useBanner());
    act(() => result.current.show("一時エラー", "warn"));
    act(() => void vi.advanceTimersByTime(3999));
    expect(result.current.banner).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.banner).toBeNull();
  });

  it("autoDismiss: false なら時間が経っても消えない", () => {
    const { result } = renderHook(() => useBanner());
    act(() => result.current.show("ルームから退出しました", "warn", { autoDismiss: false }));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(result.current.banner).toEqual({ text: "ルームから退出しました", kind: "warn" });
  });

  it("消えないバナーを出したら、直前の自動消去タイマーは解除される", () => {
    // 現行 App.tsx の handleError（leave-room）が明示的に解除している性質。
    // これが無いと、直前の一時エラーの 4 秒タイマーが退出バナーを消してしまう。
    const { result } = renderHook(() => useBanner());
    act(() => result.current.show("一時エラー", "warn"));
    act(() => void vi.advanceTimersByTime(2000));
    act(() => result.current.show("ルームから退出しました", "warn", { autoDismiss: false }));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(result.current.banner?.text).toBe("ルームから退出しました");
  });

  it("clear で即座に消える", () => {
    const { result } = renderHook(() => useBanner());
    act(() => result.current.show("接続が切れました", "warn"));
    act(() => result.current.clear());
    expect(result.current.banner).toBeNull();
  });

  it("unmount でタイマーを掃除する（setState-on-unmounted を出さない）", () => {
    const { result, unmount } = renderHook(() => useBanner());
    act(() => result.current.show("一時エラー", "warn"));
    unmount();
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
  });
});
```

- [ ] **Step 2: 実行して落ちることを確認する**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run test/ui/use-banner.test.tsx
```

期待: **FAIL**（import 解決に失敗）。

- [ ] **Step 3: 実装する**

```ts
/**
 * バナーの文言と自動消去タイマー（#167 E4）。
 *
 * **これは WebSocket の配線ではない。** `docs/adr/0015` の MUST 2 が
 * 「1 本に集約する」と言っているのは接続状態とメッセージ配線であって、
 * バナーの表示制御ではない。同期フックから分けても MUST 2 に反しない。
 *
 * 自動消去しないバナー（退出の通知）は Issue #32 の成果で、入口画面へ戻った後も
 * 「抜けたこと」を利用者が確認できるまで残す必要がある。
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Banner {
  text: string;
  kind: "warn" | "error";
}

export interface BannerController {
  banner: Banner | null;
  /** autoDismiss を省略すると既定で 4 秒後に消える。false で消えないバナーになる。 */
  show(text: string, kind: Banner["kind"], options?: { autoDismiss?: boolean }): void;
  clear(): void;
}

/** 一時的な操作エラーを自動消去するまでの時間。 */
const AUTO_DISMISS_MS = 4000;

export function useBanner(): BannerController {
  const [banner, setBanner] = useState<Banner | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const show = useCallback<BannerController["show"]>(
    (text, kind, options) => {
      // 新しいバナーを出すときは、必ず直前のタイマーを解除する。
      // 解除しないと、直前の一時エラーの 4 秒タイマーが新しいバナーを消してしまう。
      clearTimer();
      setBanner({ text, kind });
      if (options?.autoDismiss !== false) {
        timerRef.current = setTimeout(() => {
          setBanner(null);
          timerRef.current = null;
        }, AUTO_DISMISS_MS);
      }
    },
    [clearTimer],
  );

  const clear = useCallback(() => {
    clearTimer();
    setBanner(null);
  }, [clearTimer]);

  // unmount 時にタイマーを掃除する（setState-on-unmounted を防ぐ）。
  useEffect(() => clearTimer, [clearTimer]);

  return { banner, show, clear };
}
```

- [ ] **Step 4: 実行して緑を確認する**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run test/ui/use-banner.test.tsx
```

期待: **全件 PASS**。

- [ ] **Step 5: `App.tsx` を `useBanner` 経由へ差し替える**

`const [banner, setBanner] = useState(...)` と `bannerTimerRef` を消し、
`const { banner, show: showBanner, clear: clearBanner } = useBanner();` にする。
6 箇所の差し替えは次のとおり（**文言・種別・自動消去の有無を変えない**）。

| 現行（`App.tsx`） | 置き換え |
|---|---|
| `onConnected: () => setBanner(null)` | `clearBanner()` |
| `onDisconnected: () => setBanner({ text: "接続が切れました。再接続しています...", kind: "warn" })` | `showBanner("接続が切れました。再接続しています...", "warn")` **※ 現行は自動消去タイマーを張っていないので `{ autoDismiss: false }` を付ける** |
| `handleError` / `session-lost` の `setBanner(null)` | `clearBanner()` |
| `handleError` / `leave-room` の退出バナー（タイマー解除＋張らない） | `showBanner(friendlyError(code), "warn", { autoDismiss: false })` |
| `handleError` / `transient`（4 秒で消す） | `showBanner(friendlyError(code), "warn")` |
| `handleNotice`（4 秒で消す） | `showBanner(text, "warn")` |
| ホスト交代の effect（4 秒で消す） | `showBanner(msg, "warn")` |
| `Summary` の `onSaveRecord` 失敗（タイマーを張らない） | `showBanner("記録の保存に失敗しました。", "error", { autoDismiss: false })` |

**注意**: 現行で `setBanner(...)` の直後に `setTimeout` を張っていないものは
`{ autoDismiss: false }` を付ける。**付け忘れると「消えなかったバナーが消える」振る舞いの変化になる。**
差し替え前に、対象 6 箇所それぞれについて直後にタイマーを張っているかを目視で確かめること。

- [ ] **Step 6: 全テストと型検査**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run && corepack pnpm exec tsc --noEmit
```

期待: **全件 PASS ＋ 型エラー 0**。既存 App テスト 5 本と Task 1・2 のテストが無改造で緑であること。

- [ ] **Step 7: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-web/src/ui/use-banner.ts apps/timer-web/test/ui/use-banner.test.tsx apps/timer-web/src/App.tsx
git commit -m "$(cat <<'EOF'
refactor: バナーの文言と自動消去を useBanner へまとめる（#167）

- 6 箇所に散っていた bannerTimerRef の解除と張り直しを 1 箇所へ
- 自動消去しないバナー（退出・保存失敗・切断）を autoDismiss: false で表す
- WS 配線ではないので、同期フックとは別のフックにする（ADR-0015 MUST 2 の
  対象は接続状態とメッセージ配線であってバナーではない）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
## Task 5: snapshot 受信時の判断を `decideSnapshotIntents` へ切り出す

**Files:**
- Create: `apps/timer-web/src/sync/snapshot-intents.ts`
- Create: `apps/timer-web/test/sync/snapshot-intents.test.ts`
- Modify: `apps/timer-web/src/App.tsx`（`handleRoom` の中身を意図の適用へ）

**Interfaces:**
- Consumes: `ui/screen.js` の `screenForPhase` / `Screen`、`ui/problem-generation.js` の
  `shouldClearGenerating` / `shouldAutoRequestProblem`、`ui/join-driver-intent.js` の
  `shouldAutoJoinRotation`、`sync/resume-identity.js` の `ResumeIdentity`、
  `@tasuki/timer-core` の `buildCompletionRecord` / `Room` / `CompletionRecord`
- Produces:
  ```ts
  export type SnapshotIntent = ...   // 下記 8 種
  export interface SnapshotContext { ... }
  export function decideSnapshotIntents(prev: Room | null, next: Room, ctx: SnapshotContext): SnapshotIntent[];
  ```

**重要**: `handleRoom` の**実行順を配列の順で保存する**。順序を変えると、同じ snapshot に対して
送信の並びが変わる＝振る舞いの変化になる。現行の順は
resume 保存 → 参加時ドライバー宣言 → 生成中の解除 → 画面遷移 → お題の自動依頼 →
設定変更での作り直し → 完成記録 である（`App.tsx:148〜235`）。

- [ ] **Step 1: 失敗するテストを書く**

```ts
/**
 * decideSnapshotIntents の意図と順序を固定する（#167 E4）。
 *
 * App.tsx の handleRoom（88 行・分岐 7 個）から判断だけを抜き出した純粋関数。
 * 副作用（sessionStorage・WS 送信・IndexedDB）は同期フックが意図を見て起こす。
 *
 * **順序が振る舞いである。** 同じ snapshot に対する送信の並びが変わると、
 * サーバー側の処理順も変わりうる。配列の順をそのまま固定する。
 *
 * @requirements #167（#72 E4）EARS 1・EARS 3
 */
import { describe, it, expect } from "vitest";
import { decideSnapshotIntents, type SnapshotContext } from "../../src/sync/snapshot-intents.js";
import { aRoomView } from "../support/room-view.js";
import type { Room } from "@tasuki/timer-core";

const SELF = "host-p";

function baseCtx(overrides: Partial<SnapshotContext> = {}): SnapshotContext {
  return {
    participantId: SELF,
    pendingResume: null,
    resumeDisplayName: "",
    pendingDriverJoin: false,
    isCreator: false,
    problemRequested: false,
    recordSaved: false,
    generatingProblem: false,
    endType: "complete",
    now: 1_000,
    ...overrides,
  };
}

const problem = {
  title: "お題",
  description: "説明",
  requirements: [],
  exampleTest: "",
  hints: [],
  source: "fallback" as const,
};

function kinds(room: Room, ctx: SnapshotContext, prev: Room | null = null): string[] {
  return decideSnapshotIntents(prev, room, ctx).map((i) => i.kind);
}

describe("decideSnapshotIntents: 画面遷移（EARS 1）", () => {
  it.each([
    ["setup", "lobby"],
    ["ready", "lobby"],
    ["session", "session"],
    ["celebration", "celebration"],
  ])("phase=%s なら screen=%s へ遷移する", (phase, screen) => {
    const room = aRoomView({ phase: phase as Room["phase"] });
    const intents = decideSnapshotIntents(null, room, baseCtx());
    expect(intents).toContainEqual({ kind: "set-screen", screen });
  });

  it("どの snapshot でも set-screen は必ず 1 度出る", () => {
    const room = aRoomView({ phase: "ready" });
    const setScreens = decideSnapshotIntents(null, room, baseCtx()).filter(
      (i) => i.kind === "set-screen",
    );
    expect(setScreens).toHaveLength(1);
  });
});

describe("decideSnapshotIntents: 復帰情報の保存", () => {
  it("保留中の resumeToken があれば、今来た snapshot の code と組んで保存する", () => {
    const room = aRoomView({ code: "ROOM01" });
    const ctx = baseCtx({
      pendingResume: { participantId: SELF, resumeToken: "rt" },
      resumeDisplayName: "Host",
    });
    expect(decideSnapshotIntents(null, room, ctx)).toContainEqual({
      kind: "save-resume",
      identity: { code: "ROOM01", participantId: SELF, resumeToken: "rt", displayName: "Host" },
    });
  });

  it("保留が無ければ保存しない（毎 snapshot で書き込まない）", () => {
    const room = aRoomView({ code: "ROOM01" });
    expect(kinds(room, baseCtx())).not.toContain("save-resume");
  });
});

describe("decideSnapshotIntents: 参加時ドライバー宣言", () => {
  it("自分が参加者に現れたら宣言を降ろし、輪に居なければ加入する", () => {
    const room = aRoomView({ session: { rotation: ["other"], currentIndex: 0 } });
    const intents = decideSnapshotIntents(null, room, baseCtx({ pendingDriverJoin: true }));
    expect(intents.map((i) => i.kind)).toEqual(
      expect.arrayContaining(["consume-driver-join", "join-rotation"]),
    );
  });

  it("既に輪に居るなら宣言だけ降ろして加入は送らない", () => {
    const room = aRoomView({ session: { rotation: [SELF], currentIndex: 0 } });
    const k = kinds(room, baseCtx({ pendingDriverJoin: true }));
    expect(k).toContain("consume-driver-join");
    expect(k).not.toContain("join-rotation");
  });

  it("自分がまだ参加者に現れていないなら宣言を降ろさない", () => {
    const room = aRoomView({ participants: [] });
    expect(kinds(room, baseCtx({ pendingDriverJoin: true }))).not.toContain("consume-driver-join");
  });
});

describe("decideSnapshotIntents: お題", () => {
  it("作成者はロビーでお題が無ければ一度だけ依頼する", () => {
    const room = aRoomView({ code: "ROOM01", phase: "ready", problem: undefined });
    const intents = decideSnapshotIntents(null, room, baseCtx({ isCreator: true }));
    expect(intents).toContainEqual({ kind: "request-problem", requestId: "req-ROOM01-lobby" });
  });

  it("既に依頼済みなら送らない", () => {
    const room = aRoomView({ code: "ROOM01", phase: "ready", problem: undefined });
    const ctx = baseCtx({ isCreator: true, problemRequested: true });
    expect(kinds(room, ctx)).not.toContain("request-problem");
  });

  it("難易度が変わったら作成者が作り直しを依頼する（requestId に now が入る）", () => {
    const prev = aRoomView({ code: "ROOM01", phase: "ready", problem, config: { difficulty: "easy" } });
    const next = aRoomView({ code: "ROOM01", phase: "ready", problem, config: { difficulty: "hard" } });
    const intents = decideSnapshotIntents(prev, next, baseCtx({ isCreator: true, now: 42 }));
    expect(intents).toContainEqual({ kind: "regenerate-problem", requestId: "req-ROOM01-cfg-42" });
  });

  it("別のルームの snapshot なら設定変更とみなさない", () => {
    const prev = aRoomView({ code: "OTHER", phase: "ready", problem, config: { difficulty: "easy" } });
    const next = aRoomView({ code: "ROOM01", phase: "ready", problem, config: { difficulty: "hard" } });
    expect(kinds(next, baseCtx({ isCreator: true }), prev)).not.toContain("regenerate-problem");
  });

  it("生成中にお題の内容が変わったら生成中を解除する", () => {
    const prev = aRoomView({ problem: undefined });
    const next = aRoomView({ problem });
    expect(kinds(next, baseCtx({ generatingProblem: true }), prev)).toContain("clear-generating");
  });
});

describe("decideSnapshotIntents: 完成記録", () => {
  it("完成フェーズなら記録を作る", () => {
    const room = aRoomView({ code: "ROOM01", phase: "celebration", problem });
    const intents = decideSnapshotIntents(null, room, baseCtx());
    const persist = intents.find((i) => i.kind === "persist-completion");
    expect(persist).toBeDefined();
  });

  it("中断なら記録を作らない", () => {
    const room = aRoomView({ phase: "celebration", problem });
    expect(kinds(room, baseCtx({ endType: "abort" }))).not.toContain("persist-completion");
  });

  it("保存済みなら二度作らない", () => {
    const room = aRoomView({ phase: "celebration", problem });
    expect(kinds(room, baseCtx({ recordSaved: true }))).not.toContain("persist-completion");
  });

  it("お題が無ければ作らない", () => {
    const room = aRoomView({ phase: "celebration", problem: undefined });
    expect(kinds(room, baseCtx())).not.toContain("persist-completion");
  });
});

describe("decideSnapshotIntents: 順序（振る舞いそのもの）", () => {
  it("すべての意図が同時に立つとき、現行 handleRoom と同じ順で並ぶ", () => {
    const prev = aRoomView({
      code: "ROOM01",
      phase: "ready",
      problem,
      config: { difficulty: "easy" },
    });
    const next = aRoomView({
      code: "ROOM01",
      phase: "celebration",
      problem: { ...problem, title: "新しいお題" },
      config: { difficulty: "hard" },
      session: { rotation: ["other"], currentIndex: 0 },
    });
    const ctx = baseCtx({
      pendingResume: { participantId: SELF, resumeToken: "rt" },
      resumeDisplayName: "Host",
      pendingDriverJoin: true,
      isCreator: true,
      generatingProblem: true,
    });
    expect(decideSnapshotIntents(prev, next, ctx).map((i) => i.kind)).toEqual([
      "save-resume",
      "consume-driver-join",
      "join-rotation",
      "clear-generating",
      "set-screen",
      "persist-completion",
    ]);
    // 注: celebration では request-problem / regenerate-problem は立たない
    // （どちらも phase が setup/ready のときだけ）。
  });
});
```

- [ ] **Step 2: 実行して落ちることを確認する**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run test/sync/snapshot-intents.test.ts
```

期待: **FAIL**（import 解決に失敗）。

- [ ] **Step 3: 実装する**

**現行 `App.tsx:148〜235` の分岐を、順序を保ったまま写す。条件式を「整理」しない。**

```ts
/**
 * snapshot 受信時に「何をするか」を決める純粋関数（#167 E4）。
 *
 * かつては App.tsx の handleRoom（88 行）に、7 つの分岐と 3 種の副作用
 * （sessionStorage・WS 送信・IndexedDB）が混ざっていた。判断だけをここへ出し、
 * 副作用は同期フックが意図を見て起こす。
 *
 * **配列の順が振る舞いである。** 現行 handleRoom の実行順をそのまま保つ:
 * resume 保存 → 参加時ドライバー宣言 → 生成中の解除 → 画面遷移 →
 * お題の自動依頼 → 設定変更での作り直し → 完成記録。
 *
 * **現在時刻は ctx.now で注入する。** この module から `Date.now()` を呼ばない
 * （`docs/adr/0016`。#166 が timer-core の pickFallback に対して採った作法と同じ）。
 */

import { buildCompletionRecord, type CompletionRecord, type Room } from "@tasuki/timer-core";
import { screenForPhase, type Screen } from "../ui/screen.js";
import { shouldAutoJoinRotation } from "../ui/join-driver-intent.js";
import { shouldAutoRequestProblem, shouldClearGenerating } from "../ui/problem-generation.js";
import type { ResumeIdentity } from "./resume-identity.js";

export type SnapshotIntent =
  /** 復帰情報を保存する（room.code が分かるのは snapshot の時点だけ）。 */
  | { kind: "save-resume"; identity: ResumeIdentity }
  /** 参加時ドライバー宣言を降ろす（輪に入れたかに関わらず一度きり）。 */
  | { kind: "consume-driver-join" }
  /** 自分をローテーションへ加える。 */
  | { kind: "join-rotation"; participantId: string }
  /** お題生成中の表示を解除する。 */
  | { kind: "clear-generating" }
  /** サーバー権威の phase に画面を追従させる。 */
  | { kind: "set-screen"; screen: Screen }
  /** ロビーでの代表お題生成を依頼する。 */
  | { kind: "request-problem"; requestId: string }
  /** 難易度・言語の変更でお題を作り直す（生成中の表示も立てる）。 */
  | { kind: "regenerate-problem"; requestId: string }
  /** 完成記録を作って保存する。 */
  | { kind: "persist-completion"; record: CompletionRecord };

export interface SnapshotContext {
  /** 自分の参加者ID。identity 未受信なら空文字。 */
  participantId: string;
  /** room.created / room.joined で受け取り、まだ保存していない復帰情報。 */
  pendingResume: { participantId: string; resumeToken: string } | null;
  /** 参加/作成時に指定した表示名（resumeToken 再送の room.join に必要）。 */
  resumeDisplayName: string;
  /** 参加時に "driver" を宣言したか。 */
  pendingDriverJoin: boolean;
  /** このクライアントがルーム作成者（＝当初ホスト）か。 */
  isCreator: boolean;
  /** ロビーでのお題自動生成を既に依頼したか。 */
  problemRequested: boolean;
  /** 完成記録を既に保存したか。 */
  recordSaved: boolean;
  /** お題生成中の表示が出ているか。 */
  generatingProblem: boolean;
  /** 終了種別。中断のときは完成記録を作らない。 */
  endType: "complete" | "abort";
  /** 現在時刻。requestId と完成記録に使う。 */
  now: number;
}

export function decideSnapshotIntents(
  prev: Room | null,
  next: Room,
  ctx: SnapshotContext,
): SnapshotIntent[] {
  const intents: SnapshotIntent[] = [];

  // 1. 直前の room.created/room.joined で受け取った resumeToken を、今来た snapshot の
  //    room.code と組み合わせて保存する（Issue #24・FR-001）。一度保存すれば
  //    code/participantId/resumeToken は変わらないので、以降の snapshot では再保存しない。
  if (ctx.pendingResume) {
    intents.push({
      kind: "save-resume",
      identity: {
        code: next.code,
        participantId: ctx.pendingResume.participantId,
        resumeToken: ctx.pendingResume.resumeToken,
        displayName: ctx.resumeDisplayName,
      },
    });
  }

  // 2. 参加時ドライバー宣言: 自分が参加者に現れたら一度だけ rotation に加入する。
  //    宣言は「参加時の一度きり」で、輪に入れたかに関わらずここで降ろす。降ろさないと、
  //    後で自分が輪を抜けた瞬間に再追加が走り、意図しない再加入になる。
  if (
    ctx.pendingDriverJoin &&
    ctx.participantId &&
    next.participants.some((p) => p.participantId === ctx.participantId)
  ) {
    intents.push({ kind: "consume-driver-join" });
    if (shouldAutoJoinRotation({ participantId: ctx.participantId, rotation: next.session.rotation })) {
      intents.push({ kind: "join-rotation", participantId: ctx.participantId });
    }
  }

  // 3. 生成中で、お題の内容が前回から変化したら生成中を解除
  //    （AI 成功・定型縮退・タイムアウト確定の全経路）。
  if (shouldClearGenerating(ctx.generatingProblem, prev?.problem ?? null, next.problem ?? null)) {
    intents.push({ kind: "clear-generating" });
  }

  // 4. サーバー権威の phase に全参加者が追従する（ホストの開始/完成が全員に反映）。
  intents.push({ kind: "set-screen", screen: screenForPhase(next.phase) });

  // 5. ロビー（開始前）でお題が未確定かつ problemEnabled=true なら、
  //    作成者が一度だけ代表生成を依頼する（US3）。
  if (
    shouldAutoRequestProblem({
      phase: next.phase,
      hasProblem: !!next.problem,
      isCreator: ctx.isCreator,
      alreadyRequested: ctx.problemRequested,
      problemEnabled: next.config.problemEnabled !== false,
    })
  ) {
    intents.push({ kind: "request-problem", requestId: `req-${next.code}-lobby` });
  }

  // 6. 難易度・言語をロビーで変えたら、お題を作り直して選択と中身を一致させる。
  //    代表（作成者）のみが依頼し、変化時だけ発火するのでループしない。
  const cfgChanged =
    prev?.code === next.code &&
    (prev.config.difficulty !== next.config.difficulty ||
      prev.config.language !== next.config.language);
  if (
    cfgChanged &&
    ctx.isCreator &&
    (next.phase === "setup" || next.phase === "ready") &&
    !!next.problem &&
    next.config.problemEnabled !== false
  ) {
    intents.push({ kind: "regenerate-problem", requestId: `req-${next.code}-cfg-${ctx.now}` });
  }

  // 7. 完成フェーズかつ「完成（中断でない）」のとき、各端末でローカル記録を生成する
  //    （FR-020/028/059）。中断（abort）では記録を作らない。
  if (next.phase === "celebration" && next.problem && ctx.endType !== "abort" && !ctx.recordSaved) {
    intents.push({
      kind: "persist-completion",
      record: buildCompletionRecord(
        { session: next.session, clock: next.clock },
        next.problem,
        next.config,
        ctx.now,
        next.code,
      ),
    });
  }

  return intents;
}
```

- [ ] **Step 4: 実行して緑を確認する**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run test/sync/snapshot-intents.test.ts
```

期待: **全件 PASS**。

- [ ] **Step 5: `App.tsx` の `handleRoom` を意図の適用へ書き換える**

`handleRoom` の中身を次の形にする。**`setRoom(r)` の位置と `prevRoom` の取り方は変えない。**

```tsx
const handleRoom = (syncClient: SyncClient, r: Room) => {
  // `room` はこのハンドラを作ったレンダーの const なので、下で `setRoom(r)` しても
  // このスコープ内では変わらない。値は「直前のレンダー時点の snapshot」である。
  const prevRoom = room;
  setRoom(r);

  const intents = decideSnapshotIntents(prevRoom, r, {
    participantId,
    pendingResume: pendingResumeRef.current,
    resumeDisplayName: resumeDisplayNameRef.current,
    pendingDriverJoin: pendingDriverJoinRef.current,
    isCreator: isCreatorRef.current,
    problemRequested: problemRequestedRef.current,
    recordSaved: recordSavedRef.current,
    generatingProblem,
    endType,
    now: Date.now(),
  });

  for (const intent of intents) {
    switch (intent.kind) {
      case "save-resume":
        saveResumeIdentity(intent.identity);
        pendingResumeRef.current = null;
        break;
      case "consume-driver-join":
        pendingDriverJoinRef.current = false;
        break;
      case "join-rotation":
        syncClient.send({ command: "member.add", participantId: intent.participantId });
        break;
      case "clear-generating":
        endGenerating();
        break;
      case "set-screen":
        setMode(intent.screen);
        break;
      case "request-problem":
        problemRequestedRef.current = true;
        syncClient.send({ command: "problem.request", requestId: intent.requestId });
        break;
      case "regenerate-problem":
        syncClient.send({ command: "problem.request", requestId: intent.requestId });
        beginGenerating();
        break;
      case "persist-completion":
        recordSavedRef.current = true;
        setRecord((prev) => prev ?? intent.record);
        // 完成記録を端末ローカルに自動保存（押し忘れ防止・FR-020「達成を記録」）。
        persistRecordIfComplete("complete", intent.record, saveRecord).catch((e) =>
          console.error("完成記録の保存に失敗しました:", e),
        );
        break;
      default: {
        // 網羅チェック: 新しい意図が増えたらここで型検査が落ちる（DbC）。
        const exhaustive: never = intent;
        return exhaustive;
      }
    }
  }
};
```

**注意 3 点。**

1. **`regenerate-problem` は「送信 → `beginGenerating()`」の順**を保つ（現行と同じ）
2. **`request-problem` は「フラグを立てる → 送信」の順**を保つ（現行と同じ）
3. `endGenerating` / `beginGenerating` はまだ `App.tsx` にある。Task 6 でフックへ移る

- [ ] **Step 6: 全テストと型検査**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run && corepack pnpm exec tsc --noEmit
```

期待: **全件 PASS ＋ 型エラー 0**。**既存 App テスト 5 本が無改造で緑**であること
（`App.sync-handlers.test.tsx` はこの経路を最も濃く見ている）。

- [ ] **Step 7: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-web/src/sync/snapshot-intents.ts apps/timer-web/test/sync/snapshot-intents.test.ts apps/timer-web/src/App.tsx
git commit -m "$(cat <<'EOF'
refactor: snapshot 受信時の判断を純粋関数の意図リストへ出す（#167）

- handleRoom（88 行・分岐 7 個）から判断だけを decideSnapshotIntents へ
- 現在時刻は ctx.now で注入し、この module から Date.now() を呼ばない
- 意図の順序を現行 handleRoom の実行順のまま保つ（順序は振る舞いである）
- 副作用（sessionStorage・WS 送信・IndexedDB）は呼び出し側が起こす

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
## Task 6: 同期フック `useTimerSync` を新設し、配線と状態を移す

**この Task が E4 の本体である。危険度が最も高い。**

**Files:**
- Create: `apps/timer-web/src/sync/use-timer-sync.ts`
- Create: `apps/timer-web/src/ui/problem-text.ts`（`formatProblemText` の切り出し・MUST 1）
- Create: `apps/timer-web/test/ui/problem-text.test.ts`
- Modify: `apps/timer-web/src/App.tsx`（表示のみになる。`sync/client.js` の import が消える）

**Interfaces:**
- Consumes: Task 3 の `createCommands` / `TimerCommands`、Task 4 の `useBanner` / `BannerController`、
  Task 5 の `decideSnapshotIntents`
- Produces:
  ```ts
  export type AppMode = "setup" | "join" | "lobby" | "session" | "celebration" | "history";
  export interface TimerSync { ... }   // 下記
  export function useTimerSync(banner: BannerController): TimerSync;
  ```

- [ ] **Step 1: `formatProblemText` を純粋関数として切り出す（テストから書く）**

`App.tsx` の private 関数のままではテストから触れない。`docs/adr/0015` の MUST 1 に当たる。

```ts
// apps/timer-web/test/ui/problem-text.test.ts
import { describe, it, expect } from "vitest";
import { formatProblemText } from "../../src/ui/problem-text.js";

const base = {
  title: "FizzBuzz",
  description: "3 の倍数で Fizz",
  requirements: [] as string[],
  exampleTest: "",
  hints: [] as string[],
  source: "fallback" as const,
};

describe("formatProblemText", () => {
  it("タイトルと説明だけなら空行 1 つで挟んで返す", () => {
    expect(formatProblemText(base)).toBe("FizzBuzz\n\n3 の倍数で Fizz");
  });

  it("要件があれば見出しつきの箇条書きにする", () => {
    expect(formatProblemText({ ...base, requirements: ["A", "B"] })).toBe(
      "FizzBuzz\n\n3 の倍数で Fizz\n\n要件:\n- A\n- B",
    );
  });

  it("例示テストがあれば見出しつきで載せる", () => {
    expect(formatProblemText({ ...base, exampleTest: "expect(f(3)).toBe('Fizz')" })).toBe(
      "FizzBuzz\n\n3 の倍数で Fizz\n\n例示テスト:\nexpect(f(3)).toBe('Fizz')",
    );
  });

  it("ヒントがあれば見出しつきの箇条書きにする", () => {
    expect(formatProblemText({ ...base, hints: ["剰余"] })).toBe(
      "FizzBuzz\n\n3 の倍数で Fizz\n\nヒント:\n- 剰余",
    );
  });

  it("末尾の余分な空白は落とす", () => {
    expect(formatProblemText(base).endsWith("\n")).toBe(false);
  });
});
```

実装は `App.tsx` の当該関数を**そのまま**移し、`export` を付けるだけ。

```ts
/**
 * お題を可搬なプレーンテキストへ整形する（FR-013 コピー用）。
 *
 * App.tsx の private 関数だったためテストから触れなかった（#167 E4 で切り出し）。
 */
import type { Problem } from "@tasuki/timer-core";

export function formatProblemText(p: Problem): string {
  const lines: string[] = [p.title, "", p.description, ""];
  if (p.requirements.length > 0) {
    lines.push("要件:", ...p.requirements.map((r) => `- ${r}`), "");
  }
  if (p.exampleTest) lines.push("例示テスト:", p.exampleTest, "");
  if (p.hints.length > 0) lines.push("ヒント:", ...p.hints.map((h) => `- ${h}`));
  return lines.join("\n").trim();
}
```

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run test/ui/problem-text.test.ts
```

期待: **全件 PASS**。**期待値が実装と食い違ったら、テストではなく期待値を実装に合わせる**
（振る舞いを変えないのが本 Issue の前提。整形の仕様を「良くしない」）。

- [ ] **Step 2: コミット（ここまでで 1 つの論理的変更）**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-web/src/ui/problem-text.ts apps/timer-web/test/ui/problem-text.test.ts apps/timer-web/src/App.tsx
git commit -m "$(cat <<'EOF'
refactor: お題のテキスト整形を純粋関数として切り出す（#167）

App.tsx の private 関数でテストから触れなかった（ADR-0015 MUST 1）。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: `use-timer-sync.ts` の骨格を書く**

**移すのは置き場所だけである。ハンドラの本体・条件式・実行順を書き換えない。**

```ts
/**
 * timer-web の唯一の同期フック（#167 E4・`docs/adr/0015` MUST 2）。
 *
 * WebSocket の接続状態とメッセージ配線をここに集約する。画面コンポーネント
 * （App.tsx を含む）は `sync/client.js` を直接 import しない。これは
 * `scripts/audit-web-sync-boundary.mjs` が機械で見ている。
 *
 * ## handlersRef の作法（Issue #41 → #46 で 2 度の試行を経て選ばれた形）
 *
 * `SyncClient` のコールバックは生成時の値で固定される closure である。かつては
 * 「最新の state を読むために、同じ値を state と ref の両方で持つ」ことで回避していたが、
 * その並行保持が二重管理の温床だった（Issue #41）。
 *
 * 代わりに、ハンドラ本体をこのフックの本体スコープに置き、`handlersRef` へ毎レンダー
 * 同期する。`SyncClient` へ渡すのは `handlersRef.current` の同名関数を呼ぶだけの
 * 転送関数なので、固定されるのは転送だけで、実際に走るのは常に最新レンダーのハンドラになる。
 *
 * **同期は render 本体で行う。** `useEffect` を挟むと差し替えが 1 レンダー遅れ、
 * その隙間に届いた WS メッセージを古いハンドラが処理する（Issue #46 REQ-3）。
 *
 * ## バナーを引数で受け取る理由
 *
 * バナーは WS 配線ではない（`docs/adr/0015` MUST 2 の対象外）。画面側にも
 * 「記録の保存に失敗しました」を出す経路があるため、コントローラを外から渡して共有する。
 */

import { useEffect, useRef, useState } from "react";
import { SyncClient, type Identity } from "./client.js";
import { createCommands, type TimerCommands } from "./commands.js";
import { decideSnapshotIntents } from "./snapshot-intents.js";
import { buildNoticeMessage, type NoticeSignal } from "./notice-message.js";
import { buildSyncUrl } from "./sync-url.js";
import {
  saveResumeIdentity,
  loadResumeIdentity,
  clearResumeIdentity,
  shouldResumeOnLoad,
} from "./resume-identity.js";
import { NoAiProvider } from "../ai/no-ai.js";
import type { ProblemProvider } from "../ai/provider.js";
import { errorAction } from "../ui/error-action.js";
import { stripRoomParam } from "../ui/room-param.js";
import { hostChangeMessage } from "../ui/host-change.js";
import { useLatestRef } from "../ui/use-latest-ref.js";
import type { BannerController } from "../ui/use-banner.js";
import type { ClientConnState } from "../ui/connection-status.js";
import type { EndType } from "../ui/Summary.js";
import { saveRecord } from "../records/indexeddb.js";
import { persistRecordIfComplete } from "../records/persist.js";
import { displayMessageFor } from "@tasuki/timer-core";
import type { CompletionRecord, Room, SessionConfig } from "@tasuki/timer-core";

export type AppMode = "setup" | "join" | "lobby" | "session" | "celebration" | "history";

export interface TimerSync {
  /** 表示すべき画面。 */
  mode: AppMode;
  /** ?room= で来たときに参加画面へ渡すルームコード。 */
  joinCode: string | null;
  room: Room | null;
  participantId: string;
  record: CompletionRecord | null;
  endType: EndType;
  /** セッション喪失（room-not-found）。再接続では消えない。 */
  sessionLost: boolean;
  connState: ClientConnState;
  generatingProblem: boolean;
  /** サーバー時刻との差。Session の残り時間導出に渡す。 */
  clockOffset: number;

  /** 引数をそのまま載せて送るだけの操作（Task 3）。 */
  commands: TimerCommands;

  createRoom(displayName: string, roomName?: string): void;
  joinRoom(
    code: string,
    displayName?: string,
    passphrase?: string,
    joinMode?: "driver" | "spectator",
  ): void;
  /** ロビーの「開始」。お題が無ければ依頼してから phase.set と START を送る。 */
  startSession(): void;
  complete(): void;
  abort(): void;
  /** 「別のお題にする」。生成中を立ててから依頼する。 */
  regenerateProblem(): void;
  /** 代理参加者を加える（participantId はここで生成する）。 */
  addProxy(displayName: string): void;
  /** 自分の役割を自分で切り替える（participantId 未確定なら何もしない）。 */
  changeOwnRole(role: "editor" | "viewer"): void;
  newSession(): void;
  showHistory(): void;
  backToSetup(): void;
  /** Summary の明示保存。失敗時はバナーを出す。 */
  saveRecordManually(record: CompletionRecord): void;
}

/** 常に定型バンク（NoAiProvider）を返す。client 側で AI を直接呼ぶ経路（BYOK）は
 *  #28 T010 で撤去済み。サーバー常駐の AI 生成（docs/timer/adr/0008）は残っており、
 *  その解錠とモード切替は commands.aiUnlock / commands.setProblemMode が担う。 */
function resolveProvider(): ProblemProvider {
  return new NoAiProvider();
}

/** ドメインエラーコードを利用者向けの日本語文へ変換する（判定規則は core にある）。 */
const friendlyError = displayMessageFor;

export function useTimerSync(banner: BannerController): TimerSync {
  // ── ここへ App.tsx の state 11 個と ref 10 個をそのまま移す ──
  // （banner と bannerTimerRef は Task 4 で useBanner へ出したので移らない）
  // ── ここへ App.tsx のハンドラ 6 本と makeClient をそのまま移す ──
  // ── ここへ App.tsx の effect 4 本（unmount 掃除・?room= 復帰・client dispose・
  //    ホスト交代検知）をそのまま移す。mode 依存の scrollTo は画面の関心なので App に残す ──
  // ── 最後に TimerSync を組み立てて返す ──
}
```

- [ ] **Step 4: `App.tsx` から機械的に移す**

移動元は `apps/timer-web/src/App.tsx`。**本体を書き換えず、そのまま切り貼りする。**

| 移すもの | 現在の位置（Task 3〜5 適用後は行がずれる。名前で探すこと） |
|---|---|
| `AppMode` 型 | `type AppMode = ...` |
| `resolveProvider` / `friendlyError` | ファイル冒頭の 2 つ |
| state 10 個（`banner` を除く） | `mode` `joinCode` `room` `participantId` `record` `client` `endType` `sessionLost` `connState` `generatingProblem` |
| ref 10 個（`bannerTimerRef` を除く） | `isCreatorRef` `pendingDriverJoinRef` `problemRequestedRef` `recordSavedRef` `prevHostRef` `generatingTimerRef` `pendingResumeRef` `resumeDisplayNameRef` `joinedFromUrlRef` ＋ **Task 3 で足した `roomRef`**（`createCommands` の `getRoom` に要る） |
| `makeProxyId` `beginGenerating` `endGenerating` | そのまま |
| ハンドラ 6 本 | `handleRoom` `handleIdentity` `handleNeedProblem` `handleError` `handleReconnected` `handleNotice` |
| `handlersRef` / `makeClient` / `makeClientRef` | そのまま |
| `handleCreateRoom` → `createRoom` / `handleJoinRoom` → `joinRoom` | 名前だけ変える |
| `handleNewSession` → `newSession` | 名前だけ変える |
| effect 4 本 | unmount のタイマー掃除 / `?room=` 復帰 / `client?.dispose()` / ホスト交代検知 |

**App に残すもの**（画面の関心）:

- `mode` 変化時の `window.scrollTo({ top: 0 })`
- `renderBody()` と `Stage` / `StatusStrip` / バナーの描画
- `selfName` / `selfRole` / `connectionStatus` の導出（`deriveConnectionStatus` の呼び出し）
- `copyProblem` / `pasteProblem`（`navigator.clipboard` の I/O。WS 配線ではない）

**新しく作る操作**（現行の JSX インラインをフックの関数にする）:

```ts
const startSession = () => {
  const r = roomRef.current;
  if (!r) return;
  const problemEnabled = r.config.problemEnabled !== false;
  if (problemEnabled && !r.problem) {
    commands.requestProblem(`req-${r.code}`);
  }
  commands.setPhase("session");
  commands.actSession("START");
  setMode("session");
};
```

**現行の `onStartSession` は `room` を closure から読んでいる。** ここでは
`roomRef.current` を使う（送信時の最新から解決する。`removeMember` と同じ理由）。
**送るフレームの順序（`problem.request` → `phase.set` → `session.act`）は変えない。**

- [ ] **Step 5: `App.tsx` を書き直す**

```tsx
/**
 * メインアプリコンポーネント。
 *
 * **表示に徹する**（`docs/adr/0015` MUST 3）。WS の接続状態とメッセージ配線は
 * `sync/use-timer-sync.ts` が持ち、このファイルは `sync/client.js` を import しない
 * （`scripts/audit-web-sync-boundary.mjs` が機械で見ている）。
 */

import React, { useEffect } from "react";
import { Setup } from "./ui/Setup.js";
// … 画面コンポーネントの import はそのまま …
import { deriveConnectionStatus } from "./ui/connection-status.js";
import { useBanner } from "./ui/use-banner.js";
import { useTimerSync } from "./sync/use-timer-sync.js";
import { formatProblemText } from "./ui/problem-text.js";
import { saveRecord } from "./records/indexeddb.js";
import { Stage } from "./ui/primitives.js";

export default function App() {
  const banner = useBanner();
  const sync = useTimerSync(banner);

  // 画面遷移時は先頭へスクロールする（ロビー→セッションでタイマーが最上部に来るように）。
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [sync.mode]);

  // お題のコピー/貼り付けはクリップボードの I/O であって WS 配線ではないので、
  // 同期フックへは入れない（ADR-0015 MUST 2 の対象は接続状態とメッセージ配線）。
  const copyProblem = () => {
    const p = sync.room?.problem;
    if (!p || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(formatProblemText(p)).catch(() => {
      /* 権限拒否等は無視 */
    });
  };

  const pasteProblem = () => {
    if (!navigator.clipboard?.readText) return;
    navigator.clipboard
      .readText()
      .then((text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const [first = "", ...rest] = trimmed.split("\n");
        sync.commands.editProblem({ title: first.trim(), description: rest.join("\n").trim() });
      })
      .catch(() => {
        /* 権限拒否等は無視 */
      });
  };

  // … renderBody() は現行のまま。値の出どころを sync.* へ、操作を sync.commands.* へ差し替える …
}
```

**`renderBody()` の中身は現行の JSX をそのまま使い、参照先だけを差し替える。**
props の名前・並び・値を変えない。

- [ ] **Step 6: 全テストと型検査**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run && corepack pnpm exec tsc --noEmit
```

期待: **全件 PASS ＋ 型エラー 0**。

**ここで落ちたテストが、移し方の誤りを名指しする。**

| 落ちたテスト | 疑う場所 |
|---|---|
| `App.sync-handlers.test.tsx` | ハンドラの本体または `handlersRef` の同期タイミング |
| `App.state-ref.test.tsx` | 同上（最新 state を読めているか） |
| `App.resume-on-load.test.tsx` | `?room=` の effect と `makeClientRef` |
| `App.session-lost.test.tsx` | `handleError` の `session-lost` 分岐 |
| `App.solo-leave.test.tsx` | `handleError` の `leave-room` 分岐の後始末 |
| `App.commands.test.tsx`（Task 1） | props への配線の取り違え |
| `App.connection.test.tsx`（Task 2） | `onConnectionChange` / `onDisconnected` の配線 |

**どの場合もテストを直さない。移し方を直す。**

- [ ] **Step 7: `App.tsx` が `sync/client` を import していないことを確認する**

```bash
cd /home/vscode/tasuki-work
grep -n "sync/client" apps/timer-web/src/App.tsx        # 何も出ないこと（完了条件 1）
grep -rln "sync/client" apps/timer-web/src/             # use-timer-sync.ts だけが出ること
```

- [ ] **Step 8: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-web/src/sync/use-timer-sync.ts apps/timer-web/src/App.tsx
git commit -m "$(cat <<'EOF'
refactor: WS の配線と状態を同期フック useTimerSync へ集約する（#167）

- SyncClient のコールバック 6 本・state 10 個・ref 9 個・effect 4 本を移設
- handlersRef の作法（render 本体で毎レンダー同期）は維持する。useEffect を
  挟むと差し替えが 1 レンダー遅れ、その隙間のメッセージを古いハンドラが処理する
- App.tsx から sync/client の import が消え、表示に徹する形になった
  （ADR-0015 MUST 2・MUST 3）
- ハンドラの本体・条件式・実行順は書き換えていない

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 同期フックの単体テストを足す

`docs/adr/0007` の追記は「抽象を導入する PR が、差し替えるテストを**同じ PR で**追加すること」を
条件にしている。`useTimerSync` はその抽象に当たる。

**Files:**
- Create: `apps/timer-web/test/sync/use-timer-sync.test.tsx`

**Interfaces:**
- Consumes: Task 6 の `useTimerSync` / `TimerSync`、Task 4 の `BannerController`

- [ ] **Step 1: テストを書く**

```tsx
/**
 * useTimerSync の単体テスト（#167 E4）。
 *
 * `docs/adr/0007` の追記は、抽象を導入する PR が差し替えるテストを同じ PR で
 * 追加することを条件にしている。App 経由の characterization test では
 * 「接続の生死」そのものを直接は見られないので、ここでフックだけを回す。
 *
 * @requirements #167（#72 E4）EARS 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimerSync } from "../../src/sync/use-timer-sync.js";
import type { BannerController } from "../../src/ui/use-banner.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

/** バナーの呼ばれ方だけを記録する差し替え。 */
function fakeBanner(): BannerController & { calls: string[] } {
  const calls: string[] = [];
  return {
    banner: null,
    show: (text) => void calls.push(`show:${text}`),
    clear: () => void calls.push("clear"),
    calls,
  };
}

function latestSocket(): FakeWS {
  return FakeWS.instances[FakeWS.instances.length - 1]!;
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("useTimerSync: 接続の状態", () => {
  it("初期状態は online で、ルームは無い", () => {
    const { result } = renderHook(() => useTimerSync(fakeBanner()));
    expect(result.current.connState).toBe("online");
    expect(result.current.room).toBeNull();
    expect(result.current.mode).toBe("setup");
  });

  it("ルームを作ると WebSocket を 1 本だけ開く", () => {
    const { result } = renderHook(() => useTimerSync(fakeBanner()));
    act(() => result.current.createRoom("Host"));
    expect(FakeWS.instances).toHaveLength(1);
  });

  it("接続が切れると connState が reconnecting になる（EARS 2）", () => {
    const { result } = renderHook(() => useTimerSync(fakeBanner()));
    act(() => result.current.createRoom("Host"));
    const ws = latestSocket();
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });
    expect(result.current.connState).toBe("online");

    act(() => void ws.onclose?.());
    expect(result.current.connState).toBe("reconnecting");
  });

  it("切断でバナーを出し、再確立で消す", () => {
    const banner = fakeBanner();
    const { result } = renderHook(() => useTimerSync(banner));
    act(() => result.current.createRoom("Host"));
    const ws = latestSocket();
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });
    act(() => void ws.onclose?.());
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });
    expect(banner.calls).toContain("show:接続が切れました。再接続しています...");
    expect(banner.calls[banner.calls.length - 1]).toBe("clear");
  });
});

describe("useTimerSync: メッセージの配線", () => {
  function connected() {
    const banner = fakeBanner();
    const hook = renderHook(() => useTimerSync(banner));
    act(() => hook.result.current.createRoom("Host"));
    const ws = latestSocket();
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });
    const deliver = (msg: Record<string, unknown>) =>
      act(() => void ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent));
    return { ...hook, ws, banner, deliver };
  }

  it("snapshot を受け取ると room と画面が更新される（EARS 1）", () => {
    const { result, deliver } = connected();
    deliver({ type: "snapshot", room: aRoomView({ code: "ROOM01", phase: "session" }) });
    expect(result.current.room?.code).toBe("ROOM01");
    expect(result.current.mode).toBe("session");
  });

  it("identity を受け取ると participantId が入る", () => {
    const { result, deliver } = connected();
    deliver({ type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: "me" });
    expect(result.current.participantId).toBe("me");
  });

  it("room-not-found でセッション喪失になり、再接続しても戻らない（EARS 4）", () => {
    const { result, ws, deliver } = connected();
    deliver({ type: "error", code: "ROOM_NOT_FOUND", message: "no room" });
    expect(result.current.sessionLost).toBe(true);
    act(() => void ws.onclose?.());
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });
    expect(result.current.sessionLost).toBe(true);
  });

  it("notice を受け取るとバナーを出す（EARS 3）", () => {
    const { banner, deliver } = connected();
    deliver({
      type: "signal",
      signal: "notice",
      action: "driver.skip",
      actorName: "Host",
      actorParticipantId: "host-p",
      targetName: "Other",
      targetParticipantId: "p-2",
    });
    expect(banner.calls.some((c) => c.startsWith("show:"))).toBe(true);
  });
});

describe("useTimerSync: 後始末", () => {
  it("unmount で WebSocket を閉じる", () => {
    const { result, unmount } = renderHook(() => useTimerSync(fakeBanner()));
    act(() => result.current.createRoom("Host"));
    const ws = latestSocket();
    const closeSpy = vi.spyOn(ws, "close");
    unmount();
    expect(closeSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 実行して緑を確認する**

```bash
cd /home/vscode/tasuki-work/apps/timer-web && corepack pnpm exec vitest run test/sync/use-timer-sync.test.tsx
```

期待: **全件 PASS**。

**赤が出たら、まず期待値のエラーコード名を確かめる**（`ROOM_NOT_FOUND` の綴りは
`apps/timer-web/src/ui/error-action.ts` が正本。違っていたらテスト側を実装に合わせる）。

- [ ] **Step 3: 対照実行（フックの検査が本当に効いているか）**

```bash
cd /home/vscode/tasuki-work
grep -cF 'onConnectionChange' apps/timer-web/src/sync/use-timer-sync.ts   # 1 以上を確認
sed -i 's/onConnectionChange: (s) => setConnState(s),/onConnectionChange: () => {},/' apps/timer-web/src/sync/use-timer-sync.ts
cd apps/timer-web && corepack pnpm exec vitest run test/sync/use-timer-sync.test.tsx
```

期待: **FAIL**（「接続が切れると connState が reconnecting になる」）。

```bash
cd /home/vscode/tasuki-work && git checkout apps/timer-web/src/sync/use-timer-sync.ts
```

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-web/test/sync/use-timer-sync.test.tsx
git commit -m "$(cat <<'EOF'
test: 同期フックの単体テストを足す（#167）

ADR-0007 の追記が、抽象を導入する PR に同じ PR でのテスト追加を課している。
接続の生死・メッセージの配線・unmount の後始末をフック単体で回す。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
## Task 8: 機械検査 `audit-web-sync-boundary.mjs` を新設し CI へ登録する

**Files:**
- Create: `scripts/audit-web-sync-boundary.mjs`
- Create: `scripts/audit-web-sync-boundary.test.mjs`
- Modify: `.github/workflows/ci.yml`（`quality` ジョブへ 1 ステップ追加）

**Interfaces:**
- Produces（自己テストが使う純粋関数）:
  ```js
  export const WEB_APPS;
  export function findDisallowedImporters(files, app);   // files: [{path, lines}]
  export function findDisallowedWsHolders(files, app);
  export function declaredPathsOf(app);                  // 実在確認は共有関数 findMissingPaths へ渡す
  ```

**設計の要点**（設計正本 D6・D7）:
- **無状態・行単位・許可リスト**。手書きの字句解析は採らない
- **コメント行も読む**。「無いこと」を求める検査なので、読み飛ばすと緑に倒れる
- **timer と poker の両方を宣言する**。poker には `sync/client` 相当が無いので、
  検査 1 だけだと片側検査になる。検査 2（`new WebSocket(` の保持先）が両方に効く
- **走査対象の実在確認と 0 件ガードは `scripts/lib/scan-targets.mjs` の共有関数を使う。**
  自前で `fs.existsSync` を書くと、`scan-target-wiring.test.mjs` が見ている配線から外れる
  （#158 の「テストが検査と同じ判定を再実装していて配線が消えても緑」と同型）
- **走査量を `走査対象: ` という字面で必ず出力する。** `scan-target-wiring.test.mjs` の
  「すべての `audit-*.mjs` が名乗る」テストが `git ls-files 'scripts/audit-*.mjs'` から
  **導出**して全スクリプトに課している（`ADR-0014` 決定 6）。**出力しないと新設した瞬間に赤になる**
- **ファイル収集は `git ls-files` 由来にする。** 手書きのディレクトリ走査より穴が少なく、
  `src/dist` も追跡下なら拾える（#166 が記録した穴が、この収集では開かない）

- [ ] **Step 1: 自己テストを書く**

```js
/**
 * audit-web-sync-boundary の自己テスト。
 *
 * 判定は純粋関数に切り出してあるので、実ファイルを置かずに検査できる。
 * CI は scripts/*.test.mjs を git から導出して走らせる（列挙をハードコードしない）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  WEB_APPS,
  findDisallowedImporters,
  findDisallowedWsHolders,
  declaredPathsOf,
} from "./audit-web-sync-boundary.mjs";

const timerApp = {
  app: "apps/timer-web",
  syncModules: ["src/sync/client.ts"],
  allowedImporters: ["src/sync/use-timer-sync.ts"],
  wsHolders: ["src/sync/client.ts"],
};

test("許可されたファイルの import は違反にならない", () => {
  const files = [
    { path: "src/sync/use-timer-sync.ts", lines: ['import { SyncClient } from "./client.js";'] },
  ];
  assert.deepEqual(findDisallowedImporters(files, timerApp), []);
});

test("許可されていないファイルの import は違反になる", () => {
  const files = [{ path: "src/App.tsx", lines: ['import { SyncClient } from "./sync/client.js";'] }];
  const found = findDisallowedImporters(files, timerApp);
  assert.equal(found.length, 1);
  assert.equal(found[0].path, "src/App.tsx");
});

test("コメント行に書かれた import も違反として拾う（緑へ倒さない）", () => {
  const files = [{ path: "src/App.tsx", lines: ['// かつては ./sync/client.js を import していた'] }];
  assert.equal(findDisallowedImporters(files, timerApp).length, 1);
});

test("拡張子を省いた import 指定でも当たる", () => {
  const files = [{ path: "src/App.tsx", lines: ['import x from "./sync/client";'] }];
  assert.equal(findDisallowedImporters(files, timerApp).length, 1);
});

test("無関係な行は違反にならない", () => {
  const files = [{ path: "src/App.tsx", lines: ["const client = useTimerSync(banner);"] }];
  assert.deepEqual(findDisallowedImporters(files, timerApp), []);
});

test("許可されていないファイルの new WebSocket は違反になる", () => {
  const files = [{ path: "src/ui/Session.tsx", lines: ["const ws = new WebSocket(url);"] }];
  const found = findDisallowedWsHolders(files, timerApp);
  assert.equal(found.length, 1);
  assert.equal(found[0].path, "src/ui/Session.tsx");
});

test("宣言した保持先の new WebSocket は違反にならない", () => {
  const files = [{ path: "src/sync/client.ts", lines: ["this.ws = new WebSocket(this.options.url);"] }];
  assert.deepEqual(findDisallowedWsHolders(files, timerApp), []);
});

test("宣言から導出するパスは、アプリ本体と 3 種の宣言を repo 相対で並べる", () => {
  assert.deepEqual(declaredPathsOf(timerApp), [
    "apps/timer-web",
    "apps/timer-web/src/sync/client.ts",
    "apps/timer-web/src/sync/use-timer-sync.ts",
    "apps/timer-web/src/sync/client.ts",
  ]);
});

test("実在確認は共有関数 findMissingPaths に渡す形になっている", () => {
  // 実在確認そのものは scripts/lib/scan-targets.mjs の責務なので、ここでは
  // 「渡す入力が正しいか」だけを見る。自前で existsSync を書くと、
  // scan-target-wiring.test.mjs が見ている配線から外れる（#158 と同型）。
  const paths = WEB_APPS.flatMap(declaredPathsOf);
  assert.ok(paths.includes("apps/poker-web/src/hooks/useSync.ts"));
  assert.ok(paths.includes("apps/timer-web/src/sync/use-timer-sync.ts"));
});

test("WEB_APPS は timer と poker の両方を宣言している（片側検査を避ける）", () => {
  const apps = WEB_APPS.map((a) => a.app).sort();
  assert.deepEqual(apps, ["apps/poker-web", "apps/timer-web"]);
});

test("すべてのアプリが WebSocket の保持先を 1 つ以上宣言している", () => {
  for (const app of WEB_APPS) {
    assert.ok(app.wsHolders.length > 0, `${app.app} が wsHolders を宣言していない`);
  }
});
```

- [ ] **Step 2: 実行して落ちることを確認する**

```bash
cd /home/vscode/tasuki-work && node --test scripts/audit-web-sync-boundary.test.mjs
```

期待: **FAIL**（`Cannot find module`）。

- [ ] **Step 3: 検査本体を実装する**

```js
#!/usr/bin/env node
/**
 * web 層の同期境界を見る検査（`docs/adr/0015` MUST 2 が #72 E4 へ割り当てた機械検査）。
 *
 * ## 何を見るか（3 つ）
 *
 * 宣言した web アプリ（{@link WEB_APPS}）ごとに、`src` 配下の `.ts` / `.tsx` について
 * 次を見る。
 *
 *   1. **許可リスト**: 同期クライアント（`syncModules`）を import してよいのは
 *      `allowedImporters` に挙げたファイルだけである
 *   2. **WS の保持先**: `new WebSocket(` を書いてよいのは `wsHolders` に挙げた
 *      ファイルだけである
 *   3. **宣言の実在**: `WEB_APPS` に書いたすべてのパスが実在する（`docs/adr/0014` 決定 7）
 *
 * **timer と poker の両方を宣言する。** poker-web には `sync/client` に相当する
 * モジュールが無く、`hooks/useSync.ts` が `new WebSocket` を直接持つ。検査 1 だけだと
 * poker 側は宣言が空でも通ってしまう（片側検査）。検査 2 が両アプリに効く形なので、
 * これで poker 側も縛られる。
 *
 * ## ファイル収集は git 由来にする
 *
 * `listRepoFiles` は `git ls-files` の追跡分と未追跡分（`--exclude-standard`）を合わせる。
 * 手書きのディレクトリ走査より穴が少なく、**`src/dist/*.ts` も追跡下なら拾える**
 * （#166 が `audit-domain-side-effects` の実在する穴として記録した経路が、ここでは開かない）。
 *
 * **pathspec に `**` を使ってはならない。** git の `ls-files` は既定で `FNM_PATHNAME` を
 * 使わないため `src/*.ts` が入れ子のファイルにも当たる。一方 `src/**\/*.ts` は
 * **ディレクトリを 1 段以上要求する**ので、`src` 直下のファイルを落とす
 * （2026-08-19 実測: `apps/timer-web` で `src/*.ts` が 41 件、`src/**\/*.ts` が 39 件）。
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **re-export はすり抜ける。** `src/sync/index.ts` が `client.ts` を re-export し、
 *   別のファイルがそこから import すると検査 1 は当たらない。**これは実在する穴**で、
 *   「まだ見ていないだけ」ではない。re-export を作ったら `syncModules` へ足す運用に依存する
 * - **動的 import**（`await import("./client.js")`）は行単位の許可リストに当たらない形にできる
 * - **`.mts` / `.cts` は収集の対象外**（`listRepoFiles` へ渡す pathspec の作りから決まる）
 * - **`test` 配下は対象外**（`docs/adr/0015` 影響節）。`client.connection` / `client.dispose` /
 *   `client.reconnect` の 3 本が `SyncClient` を直接 import しているためである
 * - **無力化の最短経路は `allowedImporters` に 1 行足すこと。** 実在検査も 0 件ガードも
 *   自己テストも素通りする（`audit-domain-side-effects` の `EXCLUDED_PACKAGES` と同型）。
 *   この構えは人手のレビューに依存している
 *
 * ## コメント行の扱い — **読み飛ばさない**
 *
 * 検査 1・2 はどちらも「**無いこと**」を求めるので、読み飛ばすと緑に倒れる。
 * `audit-domain-side-effects.mjs` と同じ向きである。代償として、許可されていない
 * ファイルのコメントに `sync/client` や `new WebSocket(` と書けない（言い換える）。
 *
 * 設計方針: 判定は純粋関数にし、実ファイル I/O と `process.exit` は `main()` の
 * 薄い配線だけに置く。追加依存は禁止のため Node 標準と `scripts/lib/scan-targets.mjs` のみを使う。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findMissingPaths, findEmptyScanDimensions, listRepoFiles } from "./lib/scan-targets.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 検査対象の宣言。
 *
 * - `syncModules`: 同期クライアントの実体（`app` からの相対パス）
 * - `allowedImporters`: それを import してよいファイル（＝同期フック）
 * - `wsHolders`: `new WebSocket(` を書いてよいファイル
 */
export const WEB_APPS = [
  {
    app: "apps/timer-web",
    syncModules: ["src/sync/client.ts"],
    allowedImporters: ["src/sync/use-timer-sync.ts"],
    wsHolders: ["src/sync/client.ts"],
  },
  {
    app: "apps/poker-web",
    // poker-web に sync/client 相当のモジュールは無い（フックが WS を直接持つ）。
    syncModules: [],
    allowedImporters: [],
    wsHolders: ["src/hooks/useSync.ts"],
  },
];

/** `new WebSocket(` の字面。空白の揺れを吸収するため正規表現で見る。 */
const WS_CONSTRUCTION = /new\s+WebSocket\s*\(/;

/**
 * import 指定子が同期クライアントを指しているとみなす字面を作る。
 * `./client.js` `./sync/client.js` `../sync/client` のいずれにも当たるよう、
 * 拡張子を落とした末尾（`sync/client` と `client`）で見る。
 */
function importNeedles(syncModule) {
  const withoutExt = syncModule.replace(/\.tsx?$/, ""); // src/sync/client
  const base = withoutExt.split("/").slice(1).join("/"); // sync/client
  return [base, withoutExt.split("/").pop()].filter(Boolean);
}

/** 行が import 文で、指定子に needle を含むか。行をまたぐ状態は持たない。 */
function lineImports(line, needles) {
  if (!/\b(import|from|require)\b/.test(line)) return false;
  return needles.some(
    (n) =>
      line.includes(`${n}"`) ||
      line.includes(`${n}'`) ||
      line.includes(`${n}.js"`) ||
      line.includes(`${n}.js'`),
  );
}

/**
 * 許可されていないファイルからの同期クライアント import を返す。
 * @param {{path: string, lines: string[]}[]} files `app` からの相対パスと行の配列
 */
export function findDisallowedImporters(files, app) {
  const allowed = new Set(app.allowedImporters);
  const needles = app.syncModules.flatMap(importNeedles);
  if (needles.length === 0) return [];
  const found = [];
  for (const file of files) {
    if (allowed.has(file.path)) continue;
    if (app.syncModules.includes(file.path)) continue; // 実体そのものは対象外
    file.lines.forEach((line, i) => {
      if (lineImports(line, needles)) found.push({ path: file.path, line: i + 1, text: line.trim() });
    });
  }
  return found;
}

/** 許可されていないファイルでの `new WebSocket(` を返す。 */
export function findDisallowedWsHolders(files, app) {
  const allowed = new Set(app.wsHolders);
  const found = [];
  for (const file of files) {
    if (allowed.has(file.path)) continue;
    file.lines.forEach((line, i) => {
      if (WS_CONSTRUCTION.test(line)) found.push({ path: file.path, line: i + 1, text: line.trim() });
    });
  }
  return found;
}

/** 宣言から導出したリポジトリ相対パスの一覧（実在確認の入力）。 */
export function declaredPathsOf(app) {
  return [
    app.app,
    ...[...app.syncModules, ...app.allowedImporters, ...app.wsHolders].map(
      (rel) => `${app.app}/${rel}`,
    ),
  ];
}

/** `src` 配下の `.ts` / `.tsx` を git 由来で集め、`app` からの相対パスに直す。 */
function readAppFiles(app) {
  // `**` は使わない（docstring 参照。`src` 直下を落とす）。
  const rels = listRepoFiles(REPO_ROOT, [`${app.app}/src/*.ts`, `${app.app}/src/*.tsx`]);
  return rels.map((rel) => ({
    path: rel.slice(app.app.length + 1),
    lines: fs.readFileSync(path.join(REPO_ROOT, rel), "utf8").split("\n"),
  }));
}

function main() {
  const problems = [];
  const volume = [{ label: "web アプリ", count: WEB_APPS.length }];

  // 宣言の実在（`docs/adr/0014` 決定 7）。共有関数を使う（自前の existsSync を書かない）。
  const missing = findMissingPaths(REPO_ROOT, WEB_APPS.flatMap(declaredPathsOf));
  for (const m of missing) {
    problems.push(`[宣言の実在] 宣言したパスが見つかりません: ${m}    ← 移設したなら宣言を直す`);
  }

  for (const app of WEB_APPS) {
    const files = readAppFiles(app);
    volume.push({ label: `${app.app} の src`, count: files.length });

    for (const hit of findDisallowedImporters(files, app)) {
      problems.push(
        `[許可リスト] ${app.app}/${hit.path}:${hit.line} は同期クライアントを import しています。` +
          `許可されているのは ${app.allowedImporters.join(" / ") || "（なし）"} だけです → ${hit.text}`,
      );
    }
    for (const hit of findDisallowedWsHolders(files, app)) {
      problems.push(
        `[WS の保持先] ${app.app}/${hit.path}:${hit.line} が WebSocket を直接生成しています。` +
          `許可されているのは ${app.wsHolders.join(" / ")} だけです → ${hit.text}`,
      );
    }
  }

  // 走査量は成否によらず必ず名乗る（`docs/adr/0014` 決定 6）。
  // `scan-target-wiring.test.mjs` が `git ls-files 'scripts/audit-*.mjs'` から導出して
  // すべての検査に課しているので、この行を消すとその導出テストが赤になる。
  console.log(
    `[audit-web-sync-boundary] 走査対象: ${volume.map((v) => `${v.label} ${v.count} 件`).join(" / ")}`,
  );

  // 走査量のどの内訳も 0 件でないことを見る（`docs/adr/0014` 決定 8）。
  const empty = findEmptyScanDimensions(volume);
  if (empty.length > 0) {
    problems.push(`[走査対象] 走査対象が 0 件です（${empty.join(" / ")}）。検査が空振りしています`);
  }

  if (problems.length > 0) {
    console.error("[audit-web-sync-boundary] NG");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("[audit-web-sync-boundary] OK（違反 0 件）");
}

// 自己テストから import されたときは main() を走らせない。
if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 4: 自己テストと本体を実行する**

```bash
cd /home/vscode/tasuki-work
node --test scripts/audit-web-sync-boundary.test.mjs
node scripts/audit-web-sync-boundary.mjs
```

期待: 自己テスト**全件 PASS**、本体は **OK**（Task 6 で `App.tsx` の import を外してあるため）。

**本体の出力に `走査対象: ` の行が出ていることを目で確かめる。** この字面が無いと、
次の Step で走らせる `scan-target-wiring.test.mjs` の導出テスト
（`git ls-files 'scripts/audit-*.mjs'` から全検査に課している）が赤になる。

**本体が NG になる場合の確認順**:
1. `use-timer-sync.ts` が実在するか（検査 3）
2. `App.tsx` に `sync/client` が残っていないか（検査 1）
3. **`use-timer-sync.ts` 自身が `wsHolders` ではないことに注意** — WS を生成するのは
   `client.ts` であり、フックは `SyncClient` を `new` するだけである

- [ ] **Step 5: 0 件ガードの配線テストを `scan-target-wiring.test.mjs` へ足す**

純粋関数の単体テストだけでは、`main()` からガードを丸ごと削除しても緑のままになる
（`audit-structure.mjs` で実際にその状態が存在した）。**配線が消えたら落ちる**テストを置く。

既存の `describe("0 件ガードの配線: scripts/audit-domain-error-shape.mjs", ...)` の並びに合わせ、
同じファイルへ追加する。

```js
describe("0 件ガードの配線: scripts/audit-web-sync-boundary.mjs", () => {
  test("素のままなら成功し、走査量を名乗る", () => {
    const r = runScriptCopy("audit-web-sync-boundary.mjs", (s) => s);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[audit-web-sync-boundary\] 走査対象: /);
  });

  test("宣言を空にすると 0 件ガードで落ちる", () => {
    const mutate = (s) => s.replace(/export const WEB_APPS = \[/, "export const WEB_APPS = []; const UNUSED = [");
    const r = runScriptCopy("audit-web-sync-boundary.mjs", mutate);
    assert.notEqual(r.status, 0, "宣言が空でも通ってしまう");
    assert.match(r.stderr, /走査対象が 0 件/);
  });

  test("走査するディレクトリ名を潰すと 0 件ガードで落ちる（行数ではなく中身を見ている）", () => {
    // 宣言の配列長は変わらないので、行数を見るガードではこの変異を検出できない。
    const mutate = (s) => s.replace(/\/src\/\*\.ts/g, "/does-not-exist/*.ts");
    const r = runScriptCopy("audit-web-sync-boundary.mjs", mutate);
    assert.notEqual(r.status, 0, "走査先を失っても通ってしまう");
  });
});
```

```bash
cd /home/vscode/tasuki-work && node --test scripts/scan-target-wiring.test.mjs
```

期待: **全件 PASS**（既存の describe も含む）。

**`runScriptCopy` の第 2 引数は複製へ施す変換である。** 変換が何にも当たらないと
「壊していないのに赤を期待する」テストになるので、**置換が実際に起きたことを
確かめてから**アサートすること（既存の describe が `countOf` で同じ用心をしている）。

- [ ] **Step 6: CI へ登録する**

`.github/workflows/ci.yml` の `quality` ジョブ、`audit-domain-side-effects.mjs` の次に置く。

```yaml
      # web 層の同期境界。画面が同期クライアントを直接 import しないことを見る
      # （ADR 0015 MUST 2 が #72 E4 へ割り当てた機械検査・#167）。
      - run: node scripts/audit-web-sync-boundary.mjs
        if: steps.scope.outputs.code == 'true'
```

自己テストは `scripts/` 配下の `*.test.mjs` を git から導出するステップが拾うので、
**個別の登録は要らない**（列挙をハードコードすると新しいテストが黙って走らなくなる）。

- [ ] **Step 7: コミット**

```bash
cd /home/vscode/tasuki-work
git add scripts/audit-web-sync-boundary.mjs scripts/audit-web-sync-boundary.test.mjs scripts/scan-target-wiring.test.mjs .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
test: web 層の同期境界を見る検査を新設し CI へ登録する（#167）

- 無状態の許可リスト方式。画面が同期クライアントを import しないことを見る
- timer と poker の両方を宣言する（poker は WS の保持先で縛る。片側検査を避ける）
- 宣言の実在確認と 0 件ガードを置く（ADR-0014 決定 7・決定 8）
- コメント行も読む（「無いこと」を求める向きなので緑へ倒さない）
- 走査対象の実在確認と 0 件ガードは scripts/lib/scan-targets.mjs の共有関数を使い、
  配線が消えたら落ちるテストを scan-target-wiring.test.mjs へ足した
- 走査量を「走査対象: 」の字面で名乗る（全 audit へ導出で課されている）
- 見ていないもの（re-export・動的 import・.mts・無力化の最短経路）は docstring に明記した

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 破壊検証

**検査が本当に赤くなるかを確かめる。** 過去 4 件の Issue で「壊したつもりで壊れていなかった」
事故が起きている。**`grep -cF` で壊す前と後の両方を数える**（BRE の `grep -c` は
実在する行に 0 を返すことがあるので `-F` を使う）。

**Files:** なし（検証のみ。壊した状態はコミットしない）

- [ ] **Step 1: 検査 1（許可リスト）を壊して赤を見る**

```bash
cd /home/vscode/tasuki-work
git status --short                                    # clean であることを確認
grep -cF 'from "./sync/client.js"' apps/timer-web/src/App.tsx   # 0 のはず（再編済み）

# App.tsx の先頭へ import を戻す
sed -i '5i import { SyncClient } from "./sync/client.js";' apps/timer-web/src/App.tsx
grep -cF 'from "./sync/client.js"' apps/timer-web/src/App.tsx   # 1 になったことを確認

node scripts/audit-web-sync-boundary.mjs              # 期待: NG（許可リスト違反）
git checkout apps/timer-web/src/App.tsx
node scripts/audit-web-sync-boundary.mjs              # 期待: OK に戻る
```

- [ ] **Step 2: 検査 2（WS の保持先）を壊して赤を見る**

**陽性対照のファイルを置く。コミットしない。**

```bash
cd /home/vscode/tasuki-work
cat > apps/timer-web/src/ui/evil.tsx <<'EOF'
export function evil() {
  return new WebSocket("ws://example.invalid");
}
EOF
grep -cF 'new WebSocket(' apps/timer-web/src/ui/evil.tsx   # 1 を確認

node scripts/audit-web-sync-boundary.mjs              # 期待: NG（WS の保持先違反）
rm apps/timer-web/src/ui/evil.tsx
node scripts/audit-web-sync-boundary.mjs              # 期待: OK に戻る
git status --short                                    # 何も残っていないことを確認
```

- [ ] **Step 3: 検査 2 が poker 側にも効くことを確かめる（片側検査でないことの証拠）**

```bash
cd /home/vscode/tasuki-work
cat > apps/poker-web/src/evil.ts <<'EOF'
export const evil = () => new WebSocket("ws://example.invalid");
EOF
node scripts/audit-web-sync-boundary.mjs              # 期待: NG（apps/poker-web が名指しされる）
rm apps/poker-web/src/evil.ts
node scripts/audit-web-sync-boundary.mjs              # 期待: OK
```

**NG のメッセージに `apps/poker-web` が出ることを目で確かめる。** timer 側だけが
出るなら poker の走査根が効いていない。

- [ ] **Step 4: 検査 3（宣言の実在）と 0 件ガードを壊して赤を見る**

```bash
cd /home/vscode/tasuki-work
grep -cF 'src/sync/use-timer-sync.ts' scripts/audit-web-sync-boundary.mjs   # 1 を確認
sed -i 's|"src/sync/use-timer-sync.ts"|"src/sync/does-not-exist.ts"|' scripts/audit-web-sync-boundary.mjs
grep -cF 'src/sync/does-not-exist.ts' scripts/audit-web-sync-boundary.mjs   # 1 を確認
node scripts/audit-web-sync-boundary.mjs              # 期待: NG（宣言の実在）
git checkout scripts/audit-web-sync-boundary.mjs

# 0 件ガード: 宣言を空にする
sed -i 's|^export const WEB_APPS = \[|export const WEB_APPS = []; export const UNUSED = [|' scripts/audit-web-sync-boundary.mjs
node scripts/audit-web-sync-boundary.mjs              # 期待: NG（走査対象が 0 件）
git checkout scripts/audit-web-sync-boundary.mjs
node scripts/audit-web-sync-boundary.mjs              # 期待: OK
```

- [ ] **Step 5: 無力化の最短経路を実測して記録する**

```bash
cd /home/vscode/tasuki-work
# App.tsx を許可リストへ足すと、違反があっても通ってしまうことを確かめる
sed -i '5i import { SyncClient } from "./sync/client.js";' apps/timer-web/src/App.tsx
sed -i 's|allowedImporters: \["src/sync/use-timer-sync.ts"\]|allowedImporters: ["src/sync/use-timer-sync.ts", "src/App.tsx"]|' scripts/audit-web-sync-boundary.mjs
node scripts/audit-web-sync-boundary.mjs              # 期待: OK（＝素通りする）
node --test scripts/audit-web-sync-boundary.test.mjs  # 期待: PASS（自己テストも素通り）
git checkout apps/timer-web/src/App.tsx scripts/audit-web-sync-boundary.mjs
```

**この結果を Task 10 の PR 本文と振り返りへ書く。** 検査の docstring には既に
「無力化の最短経路は `allowedImporters` に 1 行足すこと」と書いてあるが、
**実際に素通りすることを確かめた**という事実を残す。

- [ ] **Step 6: 変異検査を回す**

```bash
cd /home/vscode/tasuki-work
git status --short                                    # clean であること（汚れていると走らない）
node scripts/mutation-check.mjs
```

期待: **すべて検出**。

**`scripts/` は変異対象にできない**（#174）ので、この検査が守るのは `apps/` `packages/` 側
だけである。新設した検査自身の恒真化は Step 1〜5 の破壊検証だけが守っている。

---

## Task 10: 文書を実態へ合わせる

**Files:**
- Modify: `docs/timer/adr/0003-server-authoritative-clock.md`
- Modify: `docs/adr/0015-web-layer-structure.md`
- Modify: `docs/guides/architecture.md`

- [ ] **Step 1: `docs/timer/adr/0003` の影響節へ追記する**

ADR は追記のみで直す（決定は書き換えない）。影響節の末尾へ:

```markdown
> **追記（2026-08-19・#167 / #72 E4）**: 上の「本実装では 250ms ごとの再レンダリング」は
> 実測と食い違っていた。実装は `apps/timer-web/src/ui/use-now-tick.ts` の `TICK_MS = 200` で、
> `git log -S` で追うとこのファイルは初出から 200 であり、250 だった時期は無い。
> **決定そのもの（時刻系を `ServerClock` に一本化し、残り時間・経過時間は状態から導出する。
> クライアントはローカル時計で進めない）は実装と一致している** — `apps/timer-web/src` の
> `Date.now()` を全量で見ても、残り時間・経過時間を進めるものは無い
> （再描画のトリガ・`requestId`・完成記録の生成時刻・お題選択の 4 用途のみ）。
```

- [ ] **Step 2: `docs/adr/0015` の影響節へ追記する**

```markdown
> **追記（2026-08-19・#167 / #72 E4）**: MUST 2 の機械検査を
> `scripts/audit-web-sync-boundary.mjs` として置いた（CI の `quality` ジョブ）。
> 許可リスト方式で、`apps/timer-web` は同期クライアントの import 元を
> `src/sync/use-timer-sync.ts` の 1 本に、`apps/poker-web` は `new WebSocket(` の
> 保持先を `src/hooks/useSync.ts` の 1 本に縛る。**検査が見ていないもの**
> （re-export・動的 import・`.mts`・`src/dist`・`allowedImporters` への追記による無力化）は
> 検査の docstring に列挙してある。
```

- [ ] **Step 3: `docs/guides/architecture.md` の記述を実態へ**

34〜35 行目の「`apps/timer-web` の再編は #72 の E4 で行います（`App.tsx` に WS 配線が
直書きされているため…）」を、再編済みの実態へ書き換える。

```markdown
`apps/poker-web` は `hooks/useSync.ts` へ、`apps/timer-web` は `sync/use-timer-sync.ts` へ、
それぞれ WS の配線を集約しています（timer-web の再編は
[#167](https://github.com/tomohiroJin/tasuki-tools/issues/167) で完了）。
この境界は `scripts/audit-web-sync-boundary.mjs` が機械で見ています。
```

**置き場の表（24〜29 行目）は変えない。** 既に「同期フックと純粋判断のみ
（同期クライアントを直接 import しない）」と書いてあり、実態が追いついた形である。

- [ ] **Step 4: リンク検査**

```bash
cd /home/vscode/tasuki-work && git add -A && node scripts/check-links.mjs
```

期待: **OK**。

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git commit -m "$(cat <<'EOF'
docs: 時刻系と web 層の記述を実態へ合わせる（#167）

- timer ADR-0003: 決定は一致。影響節の「250ms」は実測 200ms で、初出から
  250 だった時期は無いことを追記（ADR は追記のみで直す）
- ADR-0015: MUST 2 の機械検査を E4 が置いたことと、その検査が見ていないものを追記
- architecture.md: 「再編は E4 で行います」を再編済みの実態へ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
## Task 11: 全検査を通し、振り返りを書き、PR を出す

**Files:**
- Create: `docs/retrospectives/2026-08-19-issue-167-web-three-responsibilities.md`
  （既存の並びは `YYYY-MM-DD-issue-NNN-<topic>.md`。実際のファイル一覧で確認してから作る）
  （置き場と書式の正本は [`docs/guides/retrospective.md`](../../guides/retrospective.md)。
  **`docs/superpowers/` ではない**）

- [ ] **Step 1: 全パッケージのテストを冷キャッシュで流す**

```bash
cd /home/vscode/tasuki-work
corepack pnpm test --force 2>&1 | tail -20
```

期待: **全タスク成功**。出力の `Cached: 0 cached` を目で確認する。
**`--force` を付けないと turbo がキャッシュに当てて 1.5 秒で「緑」を出す。**

- [ ] **Step 2: 型検査と lint**

```bash
cd /home/vscode/tasuki-work
corepack pnpm -r typecheck
corepack pnpm -r lint
```

期待: どちらもエラー 0。

- [ ] **Step 3: e2e を流す（完了条件 3）**

```bash
cd /home/vscode/tasuki-work
ss -tlnp | grep -E ':(8787|3311|517[3-5])'    # 何も出ないこと（dev が動いていると衝突する）
corepack pnpm e2e 2>&1 | tail -20
```

期待: **全シナリオ PASS**。特に `e2e/specs/timer.spec.ts` と `timer-a11y.spec.ts`。

**`pnpm dev` と同時に走らせられない**（8787 / 3311 を共有する）。動いていたら先に止める。

- [ ] **Step 4: 検査一式**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs
node scripts/audit-log-hygiene.mjs
node scripts/audit-assembly-wiring.mjs
node scripts/audit-domain-error-shape.mjs
node scripts/audit-domain-side-effects.mjs
node scripts/audit-web-sync-boundary.mjs
node scripts/check-links.mjs
for f in scripts/*.test.mjs; do node --test "$f" || echo "FAILED: $f"; done
```

期待: すべて OK / PASS。

- [ ] **Step 5: 完了条件を 1 つずつ確かめる**

| # | Issue #167 の完了条件 | 確かめ方 | 結果 |
|---|---|---|---|
| 1 | `App.tsx` が `sync/client` を直接 import していない | `grep -n "sync/client" apps/timer-web/src/App.tsx` が空 | |
| 2 | WS の接続状態とメッセージ配線が同期フック 1 本に集約 | `node scripts/audit-web-sync-boundary.mjs` が OK | |
| 3 | `timer.spec.ts` と `timer-a11y.spec.ts` が全緑 | Step 3 | |
| 4 | 変異検査で既存テストが恒真化していない | Task 9 Step 6 | |

**空欄を埋めてから次へ進む。** 埋まらない行があれば、そこで止まって切り分ける。

- [ ] **Step 6: 振り返りを書く**

`docs/guides/retrospective.md` の形式に従う。**最低限、次を書く。**

- Task 9 Step 5 で実測した**無力化の最短経路**（`allowedImporters` に 1 行足すと素通りする）
- 設計の敵対的検証で見つけた**重大 2 件**（既存テストが送信配線を守っていなかった／
  EARS 2 が部品だけ緑で配線が死んでいた）が、**再編前に特性テストを足す**という
  手順の変更につながったこと
- 実装中に新しく見つかったこと（あれば）

- [ ] **Step 7: #167 へ申し送りの訂正をコメントする**

#166 の申し送り「E4 で AI 経路が戻ると `ai/no-ai.ts` が生きた経路になる」は**前提が誤り**である。
E4 は振る舞い不変のリファクタなので AI 経路は戻らず、`hasAiKey: false` の 3 箇所は
そのままである。**#167 へコメントで訂正を残す**（宛先を失わせない）。

```bash
gh issue comment 167 --body "$(cat <<'EOF'
#166 からの申し送り「E4 で AI 経路が戻ると `apps/timer-web/src/ai/no-ai.ts` が
再び生きた経路になり、そこだけテストが 0 件になる」は前提が誤っていました。

E4 は振る舞い不変のリファクタであり、`hasAiKey: false` のハードコード（`App.tsx` の 3 箇所）は
**振る舞い**なので変更していません。したがって `ai/no-ai.ts` は E4 の後も到達不能のままです。

AI 経路を戻す作業は提案 #91 の領分であり、そのときに `no-ai.ts` のテストが必要になります。
EOF
)"
```

- [ ] **Step 8: push して PR を出す**

```bash
cd /home/vscode/tasuki-work
git push -u origin refactor/167-web-three-responsibilities
gh pr create --title "refactor: web 層を「純粋関数・同期フック・画面」の 3 責務へ再編する（#167）" --body "$(cat <<'EOF'
## 概要

`docs/adr/0015` の MUST 2（WS の接続状態とメッセージ配線を同期フック 1 本に集約）と
MUST 3（画面は表示に徹する）を `apps/timer-web` へ適用しました。**振る舞いは変えていません。**
あわせて MUST 2 の機械検査を新設し、`docs/timer/adr/0003`（時刻系）の実態一致を検証しました。

Closes #167

## 変更内容

- `App.tsx` の WS 配線・状態・ハンドラを `src/sync/use-timer-sync.ts` へ集約
- snapshot 受信時の判断を純粋関数 `decideSnapshotIntents` の意図リストへ（現在時刻は注入）
- 送信ラッパー 27 箇所を純粋ファクトリ `createCommands` へ
- バナーの文言と自動消去を `ui/use-banner.ts` へ
- お題のテキスト整形を `ui/problem-text.ts` へ（private でテストから触れなかった）
- 機械検査 `scripts/audit-web-sync-boundary.mjs` を新設し CI へ登録
- timer ADR-0003 / ADR-0015 / architecture.md を実態へ

## 振る舞い不変の示し方

- **既存の App テスト 5 本を 1 行も書き換えていません。** `FakeWS` で本物の `SyncClient` を
  WS 境界越しに動かし、送るフレームと見える画面を見るテストです
- **再編に着手する前に特性テストを 2 本足しました**（`App.commands.test.tsx` /
  `App.connection.test.tsx`）。既存テストが観測していた送信コマンドは `problem.request` の
  1 種だけで、EARS 2（接続状態の表示）は部品だけが緑で配線のテストが無かったためです

## 検査が見ていないもの

`scripts/audit-web-sync-boundary.mjs` は re-export・動的 import・`.mts`・`src/dist` を
すり抜けます。**無力化の最短経路は `allowedImporters` に 1 行足すこと**で、実測で
素通りすることを確かめました（自己テストも 0 件ガードも当たりません）。
この構えは人手のレビューに依存しています。

## テスト方法

- [ ] `corepack pnpm test --force`（`Cached: 0` を確認）
- [ ] `corepack pnpm -r typecheck` / `corepack pnpm -r lint`
- [ ] `corepack pnpm e2e`（`timer.spec.ts` / `timer-a11y.spec.ts` を含む）
- [ ] `node scripts/audit-web-sync-boundary.mjs` と自己テスト
- [ ] `node scripts/mutation-check.mjs`
- [ ] 破壊検証（許可リスト・WS 保持先・宣言の実在・0 件ガードの 4 経路で赤を確認）
- [ ] 本番で従来どおり動く（**#66 の全段が終わるまで実施しない**）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**最後のチェックボックス（本番確認）は意図的に未チェックのまま出す。**
デプロイは `#66` の領分で、`#72` の全段が終わってからである。

---

## 付録: 迷ったときの原則

- **テストが赤になったらテストを直さない。** 実装の移し方を直す。既存 App テスト 5 本は
  E4 の証拠そのものであり、書き換えた瞬間に証拠が消える
- **「ついでに良くする」をしない。** 条件式の整理・命名の改善・お題整形の仕様変更は
  すべて振る舞いの変化になりうる。気づいたことは Issue に書いて次へ渡す
- **数えるときは実行する。** `grep` の件数は測り方ごと間違う（本 Issue の設計でも
  `c.send` を拾えず 32 と数えていた）
- **壊す検証は、壊れたことを先に確かめる。** `grep -cF` で前と後の両方を数える
- **緑は測り方から疑う。** turbo は既定でキャッシュに当てる。`--force` を付けて
  `Cached: 0` を見る
