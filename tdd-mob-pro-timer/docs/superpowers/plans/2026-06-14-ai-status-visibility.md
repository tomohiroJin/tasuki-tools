# AI お題生成の状態可視化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI お題生成の「生成中」と「出題元（AI 生成/定型/持ち込み）」を画面に可視化し、実機フィードバック 4 点を解消する。

**Architecture:** web 表示層のみ変更（サーバ・core・WS プロトコル不変）。`App.tsx` に楽観的な `generatingProblem` state を持ち、「別のお題にする」で立て、snapshot で `room.problem` の内容が変化したら下ろす（純関数 `shouldClearGenerating`）。`ProblemEditor` に `generating` prop を足しスピナー＋減光、`Badges` を出題元の明示ラベルに。生成中文言は AI 解錠ルームか否かで分岐。

**Tech Stack:** React + Vite / Vitest + @testing-library/react / lucide-react（`Loader2`/`Sparkles`）

**正本スペック:** `docs/superpowers/specs/2026-06-14-ai-status-visibility-design.md`

**作業環境メモ:**
- リポジトリ: `/workspaces/claym/local/Tasuki`（独立 git リポジトリ）。ブランチ `feature/ai-status-visibility` チェックアウト済み
- pnpm は `~/.local/bin/pnpm`。web テストは `cd apps/web && npx vitest run <file>`、全体は ルート `tdd-mob-pro-timer/` で `PATH="$HOME/.local/bin:$PATH" pnpm typecheck`
- 規約: コメント日本語・関数コンポーネント・Props 型必須・`any` 禁止
- 注意: `package.json` に `workspaces` が混入する bun の副作用（コミット前 `git status` 確認・指定ファイルのみ add）
- **実機確認の前に必ず旧プロセス掃除**: `for p in $(lsof -ti tcp:5173 tcp:5174 tcp:8787); do kill -9 $p; done`

**現状の既知の事実（調査済み）:**
- 定型お題の `source` は経路により `"fallback"` または undefined（`problem-delegation.ts` の finalize 経路差）。→ ラベルは「`ai`/`custom` 以外はすべて定型」で判定
- `Lobby.tsx` 299 行付近に既に「AI がお題を作成中です…（最大 1 分）」/「お題を準備中です…」の分岐あり（お題 null 時）
- `Session.tsx` 209 行付近に「お題を生成中…」表示あり（`awaitingProblem` 時・分岐なし）
- `App.tsx` の `onRoom`（101 行〜）は冒頭で `prevRoom = roomRef.current` を取得済み。`regenerateProblem`（421 行）は `problem.request` を送るだけ

---

## File Structure

| ファイル | 役割 | 操作 |
|---|---|---|
| `apps/web/src/ui/problem-generation.ts` | 生成中フラグを下ろす判定の純関数 | 新規作成 |
| `apps/web/src/ui/components/ProblemEditor.tsx` | 出題元ラベル＋生成中表示（スピナー・減光） | 修正 |
| `apps/web/src/App.tsx` | `generatingProblem` state・配線・安全弁 | 修正 |
| `apps/web/src/ui/Lobby.tsx` | `generating` 中継 | 修正 |
| `apps/web/src/ui/Session.tsx` | `generating` 中継＋生成中文言の AI/定型分岐 | 修正 |

---

### Task 1: 生成完了判定の純関数 `shouldClearGenerating`

**Files:**
- Create: `apps/web/src/ui/problem-generation.ts`
- Test: `apps/web/test/ui/problem-generation.test.ts`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`apps/web/test/ui/problem-generation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { shouldClearGenerating } from "../../src/ui/problem-generation.js";
import type { Problem } from "@tdd-mob/core";

const mk = (title: string, source?: Problem["source"]): Problem => ({
  title,
  description: "d",
  requirements: ["a", "b", "c"],
  exampleTest: "t",
  hints: ["h"],
  ...(source ? { source } : {}),
});

describe("shouldClearGenerating", () => {
  it("生成中で title が変化したら true", () => {
    expect(shouldClearGenerating(true, mk("旧"), mk("新"))).toBe(true);
  });
  it("生成中で source が変化したら true（title 同じでも）", () => {
    expect(shouldClearGenerating(true, mk("同", "fallback"), mk("同", "ai"))).toBe(true);
  });
  it("生成中で null→problem（初回確定）は true", () => {
    expect(shouldClearGenerating(true, null, mk("初"))).toBe(true);
  });
  it("生成中だが title も source も不変なら false（無関係 snapshot）", () => {
    expect(shouldClearGenerating(true, mk("同", "ai"), mk("同", "ai"))).toBe(false);
  });
  it("非生成中なら常に false", () => {
    expect(shouldClearGenerating(false, mk("旧"), mk("新"))).toBe(false);
  });
  it("生成中で problem が両方 null なら false", () => {
    expect(shouldClearGenerating(true, null, null)).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/web && npx vitest run test/ui/problem-generation.test.ts`
Expected: FAIL（モジュール不在）

- [ ] **Step 3: 実装する**

`apps/web/src/ui/problem-generation.ts`:

```typescript
/**
 * AI お題生成の「生成中」フラグを下ろすべきか判定する純関数。
 * 生成中で、かつ snapshot のお題が前回から内容変化（title または source）したら true。
 * 参照比較は使わない（presence 更新などお題に無関係な snapshot で room が
 * 新規オブジェクトになっても誤解除しないため）。null→problem の初回確定も変化とみなす。
 */
import type { Problem } from "@tdd-mob/core";

export function shouldClearGenerating(
  generating: boolean,
  prevProblem: Problem | null,
  nextProblem: Problem | null,
): boolean {
  if (!generating) return false;
  if (prevProblem === null && nextProblem === null) return false;
  if (prevProblem === null || nextProblem === null) return true; // 片方だけ null＝確定/消失
  return prevProblem.title !== nextProblem.title || prevProblem.source !== nextProblem.source;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/web && npx vitest run test/ui/problem-generation.test.ts`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web/src/ui/problem-generation.ts tdd-mob-pro-timer/apps/web/test/ui/problem-generation.test.ts
git commit -m "feat(web): 生成完了判定 shouldClearGenerating を追加"
```

---

### Task 2: ProblemEditor の出題元ラベルと生成中表示

**Files:**
- Modify: `apps/web/src/ui/components/ProblemEditor.tsx`
- Test: `apps/web/test/ui/ProblemEditor.test.tsx`（既存に追補、無ければ新規）

- [ ] **Step 1: 失敗するテストを書く**

`apps/web/test/ui/ProblemEditor.test.tsx` に以下の describe を追加（既存ファイルが無ければ、先頭に import を付けて新規作成）:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProblemEditor } from "../../src/ui/components/ProblemEditor.js";
import type { Problem } from "@tdd-mob/core";

const mkProblem = (over: Partial<Problem> = {}): Problem => ({
  title: "テストお題",
  description: "説明",
  requirements: ["r1", "r2", "r3"],
  exampleTest: "test('x', () => {})",
  hints: ["h1"],
  ...over,
});

const baseProps = {
  canEdit: true,
  difficulty: "easy",
  language: "TypeScript",
  onEdit: vi.fn(),
  onCopy: vi.fn(),
  onRegenerate: vi.fn(),
  onPaste: vi.fn(),
};

describe("ProblemEditor 出題元ラベル", () => {
  it("source=ai は「AI 生成」ラベルを出す", () => {
    render(<ProblemEditor {...baseProps} problem={mkProblem({ source: "ai" })} />);
    expect(screen.getByText("AI 生成")).toBeTruthy();
  });
  it("source=fallback は「定型」ラベルを出す", () => {
    render(<ProblemEditor {...baseProps} problem={mkProblem({ source: "fallback" })} />);
    expect(screen.getByText("定型")).toBeTruthy();
  });
  it("source 無し（undefined）も「定型」ラベルを出す", () => {
    render(<ProblemEditor {...baseProps} problem={mkProblem()} />);
    expect(screen.getByText("定型")).toBeTruthy();
  });
  it("source=custom は「持ち込み」ラベルを出す", () => {
    render(<ProblemEditor {...baseProps} problem={mkProblem({ source: "custom" })} />);
    expect(screen.getByText("持ち込み")).toBeTruthy();
  });
});

describe("ProblemEditor 生成中表示", () => {
  it("generating 時はボタンが「生成中…」で disabled・カードが aria-busy", () => {
    render(<ProblemEditor {...baseProps} problem={mkProblem({ source: "ai" })} generating />);
    const btn = screen.getByRole("button", { name: /生成中/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("group", { name: "お題" }).getAttribute("aria-busy")).toBe("true");
  });
  it("generating でない時は「別のお題にする」ボタン（有効）", () => {
    render(<ProblemEditor {...baseProps} problem={mkProblem({ source: "ai" })} />);
    const btn = screen.getByRole("button", { name: "別のお題にする" });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
```

注: `getByRole("group", { name: "お題" })` は Step 3 でカード本体に `role="group" aria-label="お題"` を付けるため。既存の ProblemEditor のルート要素にこれを付与する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/web && npx vitest run test/ui/ProblemEditor.test.tsx`
Expected: FAIL（「定型」「生成中」ラベル・generating prop・role=group 不在）

- [ ] **Step 3: 実装する**

`apps/web/src/ui/components/ProblemEditor.tsx`:

1. import に `Loader2` を追加（既存の lucide import 行に）。`Sparkles` も無ければ追加:

```tsx
import { ChevronDown, Dices, Loader2, Sparkles } from "lucide-react";
```
（既存 import の実際の構成に合わせる。既にあるものは重複させない）

2. `Badges` を出題元の明示ラベルに変更。現在の `source === "ai"` ブロックと、その付近を以下に置き換える（`custom`/`edited` は維持しつつ、`ai`→「AI 生成」、それ以外（非 custom）→「定型」を追加）:

```tsx
      {/* 出題元を必ず明示する（AI 生成 / 定型 / 持ち込み）。無印を作らない。 */}
      {source === "ai" ? (
        <span className="inline-flex items-center gap-1 rounded-sm bg-[rgba(255,74,46,0.14)] px-2 py-0.5 text-[var(--signal)] border border-[rgba(255,74,46,0.3)]">
          <Sparkles className="w-3 h-3" aria-hidden="true" /> AI 生成
        </span>
      ) : source === "custom" ? (
        <span className="rounded-sm bg-[rgba(63,178,127,0.15)] px-2 py-0.5 text-[var(--ok)] border border-[rgba(63,178,127,0.3)]">持ち込み</span>
      ) : (
        <span className="rounded-sm bg-[var(--panel-2)] px-2 py-0.5 text-[var(--bone-muted)] border border-[var(--hairline)]">定型</span>
      )}
      {edited && (
        <span className="rounded-sm bg-[rgba(255,74,46,0.14)] px-2 py-0.5 text-[var(--signal)] border border-[rgba(255,74,46,0.3)]">編集済</span>
      )}
```

（注: 元の `source === "custom"` バッジと `source === "ai"` バッジを上記の三項に統合する。`edited` バッジはそのまま残す）

3. `ProblemEditorProps` に `generating` を追加（型定義の interface に）:

```tsx
  /** AI/定型のお題を生成中（「別のお題にする」押下〜確定まで）。スピナー＋減光に使う。 */
  generating?: boolean;
```

4. 関数引数の分割代入に `generating = false,` を追加（`onPaste,` の近く）。

5. ルートの `return (`（122 行付近、`<div className="flex flex-col gap-3">`）を、生成中の減光＋aria-busy を持つ形に変更:

```tsx
  return (
    <div
      role="group"
      aria-label="お題"
      aria-busy={generating}
      className={`flex flex-col gap-3 ${generating ? "opacity-50 pointer-events-none" : ""}`}
    >
```

6. 「別のお題にする」ボタン（132 行付近の `GhostButton`）を generating で差し替える:

```tsx
          {canEdit && (
            <GhostButton onClick={onRegenerate} disabled={generating} aria-label={generating ? "生成中" : "別のお題にする"} className="text-sm">
              {generating ? (
                <span className="flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> 生成中…</span>
              ) : (
                <span className="flex items-center gap-1.5"><Dices className="w-4 h-4" aria-hidden="true" /> 別のお題にする</span>
              )}
            </GhostButton>
          )}
```

注: `GhostButton`（primitives）が `disabled` を受け付けるか確認する。受けない場合は `disabled` を渡せるよう primitives 側に最小追加するか、`onClick` を `generating ? undefined : onRegenerate` にして見た目で無効化する。**既存 primitives の GhostButton 定義を必ず読んでから決める**。

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/web && npx vitest run test/ui/ProblemEditor.test.tsx`
Expected: 全 PASS

- [ ] **Step 5: 既存テストの回帰確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/web && npx vitest run`
Expected: 全 PASS（既存の ProblemEditor 関連テストが「AI」→「AI 生成」等の文言変更で落ちたら、テスト側を新文言に追従。実コードの意図は変えない）

- [ ] **Step 6: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web/src/ui/components/ProblemEditor.tsx tdd-mob-pro-timer/apps/web/test/ui/ProblemEditor.test.tsx
git commit -m "feat(web): お題に出題元ラベル（AI 生成/定型/持ち込み）と生成中表示を追加"
```

---

### Task 3: App に generatingProblem state を配線

**Files:**
- Modify: `apps/web/src/App.tsx`

**このタスクは UI 統合配線でユニットテストを足しにくい。Task 1 の純関数で判定ロジックは保護済み。配線の正しさは Task 6 の実機 E2E で確認する。**

- [ ] **Step 1: state と安全弁タイマー ref を追加**

`App.tsx` の他の `useState`/`useRef` 宣言の近く（`prevHostRef` 付近）に追加:

```tsx
  // AI/定型のお題生成中（「別のお題にする」押下〜新お題確定まで）。スピナー＋減光に使う。
  const [generatingProblem, setGeneratingProblem] = useState(false);
  // 生成が返らない異常で固まらないための安全弁タイマー。
  const generatingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 2: 生成中を立てる/下ろすヘルパーを追加**

`regenerateProblem`（421 行付近）の直前に追加:

```tsx
  // 生成中フラグを立て、65 秒の安全弁を張る（サーバ 60 秒タイムアウト＋余裕）。
  const beginGenerating = () => {
    setGeneratingProblem(true);
    if (generatingTimerRef.current) clearTimeout(generatingTimerRef.current);
    generatingTimerRef.current = setTimeout(() => setGeneratingProblem(false), 65_000);
  };
  const endGenerating = () => {
    setGeneratingProblem(false);
    if (generatingTimerRef.current) {
      clearTimeout(generatingTimerRef.current);
      generatingTimerRef.current = null;
    }
  };
```

import に `useRef` が無ければ追加（既に `useRef` は使われているので通常は不要）。`shouldClearGenerating` を import:

```tsx
import { shouldClearGenerating } from "./ui/problem-generation.js";
```

- [ ] **Step 3: regenerate と設定変更再生成で立てる**

`regenerateProblem`（421 行付近）を:

```tsx
  const regenerateProblem = () => {
    const code = roomRef.current?.code;
    if (code) {
      beginGenerating();
      // 直近のお題と重複しにくい新規生成を代表へ依頼する（FR-012）。
      client?.send({ command: "problem.request", requestId: `req-${code}-regen-${Date.now()}` });
    }
  };
```

`onRoom` 内の設定変更再生成（130 行付近、`req-${r.code}-cfg-` を送る箇所）の直後に `beginGenerating();` を追加（ロビーで難易度/言語を変えてお題を作り直すときも生成中表示にする）。

- [ ] **Step 4: onRoom で生成完了を検知して下ろす**

`onRoom`（101 行）の冒頭 `const prevRoom = roomRef.current;` の後、`roomRef.current = r;` の後あたりに追加:

```tsx
        // 生成中で、お題の内容が前回から変化したら生成中を解除する（AI 成功・定型縮退・
        // タイムアウト確定のすべてが「新しい problem の配信」で終わる）。
        if (shouldClearGenerating(generatingProblem, prevRoom?.problem ?? null, r.problem ?? null)) {
          endGenerating();
        }
```

注: `generatingProblem` をクロージャから参照するため、最新値を読めるよう ref も併用するのが安全。
`generatingProblem` の最新値を持つ `generatingRef` を追加し、`beginGenerating`/`endGenerating` で
同期する。`onRoom` 内では `generatingRef.current` を見る:

```tsx
  const generatingRef = useRef(false);
  // beginGenerating 内: generatingRef.current = true; の 1 行を setGeneratingProblem(true) の隣に
  // endGenerating 内:   generatingRef.current = false; の 1 行を setGeneratingProblem(false) の隣に
  // onRoom 内の判定:    shouldClearGenerating(generatingRef.current, prevRoom?.problem ?? null, r.problem ?? null)
```

（state はレンダリング用、ref はクロージャ用の二重管理。このリポジトリは roomRef/endTypeRef 等で同じ
パターンを使っているので踏襲する）

- [ ] **Step 5: Lobby/Session へ generating を渡す**

`<Lobby ...>`（455 行付近）と `<Session ...>`（39 行付近の Session 呼び出し）の props に追加:

```tsx
          generatingProblem={generatingProblem}
```

（両方に追加。prop 名は受け手の Lobby/Session の型に合わせて Task 4/5 で定義する）

- [ ] **Step 6: 型チェック**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && PATH="$HOME/.local/bin:$PATH" pnpm typecheck`
Expected: Lobby/Session がまだ `generatingProblem` prop を受けないので**型エラーが出る**（Task 4/5 で解消）。ここでは App 単体の構文エラーが無ければ次へ（Lobby/Session の prop 未定義エラーのみ許容）。

- [ ] **Step 7: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web/src/App.tsx
git commit -m "feat(web): App に generatingProblem state と安全弁を配線（Lobby/Session 接続は次タスク）"
```

---

### Task 4: Lobby に generating を中継

**Files:**
- Modify: `apps/web/src/ui/Lobby.tsx`

- [ ] **Step 1: Props 型に追加**

`LobbyProps`（21 行付近）に追加:

```tsx
  /** AI/定型のお題を生成中。ProblemEditor のスピナー＋減光に使う。 */
  generatingProblem?: boolean;
```

分割代入（78 行付近）にも `generatingProblem = false,` を追加。

- [ ] **Step 2: ProblemEditor へ渡す**

`<ProblemEditor ...>`（283 行付近）の props に追加:

```tsx
                    generating={generatingProblem}
```

- [ ] **Step 3: 型チェック・テスト**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && PATH="$HOME/.local/bin:$PATH" pnpm typecheck && cd apps/web && npx vitest run`
Expected: 型 PASS（App↔Lobby の prop 整合）・web テスト全 PASS

- [ ] **Step 4: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web/src/ui/Lobby.tsx
git commit -m "feat(web): Lobby が generatingProblem を ProblemEditor へ中継"
```

---

### Task 5: Session に generating 中継＋生成中文言の AI/定型分岐

**Files:**
- Modify: `apps/web/src/ui/Session.tsx`

- [ ] **Step 1: Props 型に追加**

`SessionProps`（35 行付近の `awaitingProblem` の近く）に追加:

```tsx
  /** AI/定型のお題を生成中（regenerate 中）。ProblemEditor のスピナー＋減光に使う。 */
  generatingProblem?: boolean;
  /** AI 解錠ルームか（生成中文言の出し分けに使う）。 */
  aiUnlocked?: boolean;
  /** AI モードか（problemMode === "ai"）。生成中文言の出し分けに使う。 */
  aiMode?: boolean;
```

分割代入（82 行付近）に `generatingProblem = false, aiUnlocked = false, aiMode = false,` を追加。

- [ ] **Step 2: ProblemEditor へ generating を渡す**

`<ProblemEditor ...>`（192 行付近）の props に追加:

```tsx
            generating={generatingProblem}
```

- [ ] **Step 3: 生成中文言を AI/定型で分岐**

「お題を生成中…」（209 行付近の `<p>お題を生成中…</p>`）を以下に変更:

```tsx
              <p>
                {aiUnlocked && aiMode
                  ? "AI がお題を作成中です…（最大 1 分）"
                  : "お題を生成中…"}
              </p>
```

- [ ] **Step 4: App から aiUnlocked/aiMode を渡す**

`apps/web/src/App.tsx` の `<Session ...>`（39 行付近）に追加:

```tsx
          aiUnlocked={!!room.aiUnlocked}
          aiMode={room.problemMode === "ai"}
```

- [ ] **Step 5: 型チェック・テスト**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && PATH="$HOME/.local/bin:$PATH" pnpm typecheck && cd apps/web && npx vitest run`
Expected: 型 PASS・web テスト全 PASS

- [ ] **Step 6: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web/src/ui/Session.tsx tdd-mob-pro-timer/apps/web/src/App.tsx
git commit -m "feat(web): Session に generating 中継と生成中文言の AI/定型分岐を追加"
```

---

### Task 6: 全体検証と実機 E2E

**Files:** なし（検証のみ）

- [ ] **Step 1: 全テスト・型・ビルド**

Run:
```bash
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer
PATH="$HOME/.local/bin:$PATH" pnpm typecheck && PATH="$HOME/.local/bin:$PATH" pnpm --filter @tdd-mob/web test:unit && PATH="$HOME/.local/bin:$PATH" pnpm build
```
Expected: すべて緑

- [ ] **Step 2: 実機 E2E（AI 解錠ルーム）**

```bash
for p in $(lsof -ti tcp:5173 tcp:5174 tcp:8787 2>/dev/null); do kill -9 $p; done
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer
cp apps/sync/.env.example apps/sync/.env
# claude setup-token で発行したトークンと合言葉を apps/sync/.env に設定する:
#   CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
#   AI_UNLOCK_KEY=test-himitsu
#   AI_PROBLEM_MODEL=haiku
PATH="$HOME/.local/bin:$PATH" pnpm dev
```

ブラウザ（chrome-devtools MCP・http://localhost:5173/）で確認:
1. ルーム作成 → お題に **「定型」ラベル**が出ている（#1 #2 解消）
2. AI 解錠（合言葉 `test-himitsu`）→ 「別のお題にする」を押す
3. **ボタンが「生成中…」＋スピナー＋disabled、お題カードが減光**（#3 #4 解消）
4. 15〜40 秒後、新お題が出て **「AI 生成」ラベル**＋減光解除
5. 「定型に戻す」→「別のお題にする」→ 一瞬の生成中表示の後 **「定型」ラベル**

- [ ] **Step 3: 後始末**

```bash
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer
for p in $(lsof -ti tcp:5173 tcp:5174 tcp:8787 2>/dev/null); do kill -9 $p; done
rm -f apps/sync/.env
cd /workspaces/claym/local/Tasuki && git status --short   # 作業ツリーがクリーンなこと
```

---

## スペック対応表（セルフレビュー用）

| スペック項目 | タスク |
|---|---|
| `shouldClearGenerating` 純関数（内容比較） | Task 1 |
| 出題元ラベル（AI 生成/定型/持ち込み・無印廃止） | Task 2 |
| 生成中表示（スピナー・減光・disabled・aria-busy） | Task 2 |
| `generatingProblem` state・regenerate/設定変更で立てる・安全弁 65 秒 | Task 3 |
| onRoom で内容変化検知し解除（ref 併用） | Task 3 |
| Lobby 中継 | Task 4 |
| Session 中継＋生成中文言の AI/定型分岐 | Task 5 |
| 連打防止（disabled） | Task 2（ボタン disabled） |
| 全テスト緑・実機 E2E（4 点解消の確認） | Task 6 |
