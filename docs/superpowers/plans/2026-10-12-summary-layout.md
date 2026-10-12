# #352 timer の完了画面（まとめ）の器と並び 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完了した瞬間に器（とステータスの帯）が 1536px から 640px へ縮むのをやめ、64rem 以上ではまとめを 2 列（左に統計の札 3 枚・右にドライバー別の回数）に並べる。64rem 未満は今の 1 列のまま、320px で統計の札を縦に積んで数字のはみ出しを無くす。

**Architecture:** `App.tsx` の `pageOf` が、まとめ（`mode === "celebration"`）にもロビー・セッションと同じ `"wide"` を返す。中身の幅と並びは `summary.css` が `@media (width >= 40rem)` と `@media (width >= 64rem)` の 2 つで持つ（`.summary` の最大幅 40rem → 64rem・64rem 以上は 2 列の grid）。統計の札に `summary-stat` のクラスを足す。文言は足さない。

**Tech Stack:** CSS・React 19・Vitest・Playwright

**Spec:** [`docs/superpowers/specs/2026-10-12-summary-layout-design.md`](../specs/2026-10-12-summary-layout-design.md)（D1〜D4・§7 の L1〜L6・m130 / m131）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 1 で E2E の物差しを先に書き main の状態で赤を見る。Task 2 は単体テストの赤から |
| II. 技術選定は ADR を通す | 通過 | 新しい依存を足さない。ADR 0025 決定 2 に追記する（Task 5） |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーに触れない。配布しない |
| IV. 境界の型安全 | 該当なし | 境界検証に触れない |
| V. 実画面検証 | 通過 | 統括が 4 つの幅を撮り main と並べる。利用者に Chrome の実物で見てもらう（Task 6） |
| VI. 依存は内向き | 該当なし | 依存の向きを変えない |
| VII. 検査は壊して確かめる | 通過 | 対照実行（Task 1）・破壊検証（Task 4）・変異 m130 / m131（Task 2） |
| VIII. 記録が正本 | 通過 | 設計（理由）・ADR 0025（決定）・README（使い方）を Task 5 で揃える |
| IX. 小さく回す | 通過 | PR 1 本。#352 の中で閉じる |
| X. 抽象は実需で | 通過 | 部品を足さない。2 列の並びはまとめだけが使うので画面の CSS に置く |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- 作業場所は `/workspaces/claym/local/Tasuki-wt-352`（ブランチ `feature/issue-352-summary-layout`）。ここの外へ書き込まない
- **禁止**: `git push`・`gh pr create` / `merge`・`gh issue *` の書き込み・`git reset`・`git stash`・`git checkout -- <file>`・他ブランチへの checkout・`pnpm install` / `update`・**`pnpm e2e` / `pnpm dev` / Playwright の実行**・`node scripts/mutation-check.mjs` の実行（`--help` も全件を走らせる）。E2E・撮影・変異の全件は**統括が流す**
- コマンドは 1 つずつ、各 5 分以内
- **timer は要素層を読まない**（ADR 0023 決定 4）。部品層（`.ui-*`）は読む
- **生の色を書かない**（色を足す予定は無い）。font-size は 5 段のトークン（`--font-size-xs`〜`-xl`）
- `@media` は `(width >= 40rem)` / `(width >= 64rem)` の範囲構文だけ（`scripts/audit-ui-components.mjs` が落とす）
- `className` は文字列リテラルで書く（`scripts/audit-timer-classes.mjs`）。新しいクラスは `summary-stat` の 1 つだけで、`summary.css` に定義する
- **文言を足さない・変えない**（書体の base 層の実測は設計 §6。変えるなら `fonts.css` の unicode-range で測ってから）
- **E2E のルームを足さない。** 物差しは `layout.spec.ts` の既存の timer の流れ（1 ルーム）の末尾に置く
- 変異の ID は **130・131**（割り当て 130〜139）。パッチの 1 行目は `# 変異 130: …` の形で番号を合わせる
- 閉鎖キーワード（Closes / Fixes / Resolves と #番号）を文書・コミットに書かない
- コミットの末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` の 1 行
- 製品コードを壊す手順（変異パッチを作る・破壊検証）に入る前に、`git status --porcelain` が空であることを確かめる。空でなければコミットしてから入る

## 検証の実行時間の見積もり

| 何を | 誰が | 1 回 | 回数 | 小計 |
|---|---|---|---|---|
| timer-web の単体テスト 1〜2 ファイル（`npx vitest run <file>`・実測 6.6 秒） | 実装役 | 約 10 秒 | 8 | 約 2 分 |
| timer-web の単体テスト全件（`pnpm --filter @tasuki/timer-web test`） | 実装役 | 約 2 分（推定） | 2 | 約 4 分 |
| typecheck・lint（timer-web と e2e） | 実装役 | 約 1 分（推定） | 4 | 約 4 分 |
| `audit-ui-components.mjs`・`audit-timer-classes.mjs` | 実装役 | 約 10 秒 | 4 | 約 1 分 |
| 変異 1 本を当てて赤を見る（`git apply` → vitest → `git apply -R`） | 実装役 | 約 1 分 | 2 | 約 2 分 |
| `node --test scripts/mutation-check.test.mjs`（パッチが当たるかの自己テスト） | 実装役 | 約 1 分（推定） | 1 | 約 1 分 |
| `node scripts/check-links.mjs`（文書のリンク） | 実装役 | 約 10 秒 | 1 | 約 10 秒 |
| **実装役の小計** | | | | **約 15 分** |
| `layout.spec.ts` の対照実行（Task 1 のコミット＝main の製品コード） | 統括 | 約 4 分（推定・ビルド込み） | 1 | 約 4 分 |
| `layout.spec.ts`・`buttons.spec.ts` の緑の確認（Task 3 の後） | 統括 | 約 6 分（推定） | 1 | 約 6 分 |
| 破壊検証（Task 4・2 通り × `layout.spec.ts`） | 統括 | 約 4 分 | 2 | 約 8 分 |
| 撮影（320・768・1280・1920 のまとめ・main と並べる） | 統括 | 約 5 分 | 2 | 約 10 分 |
| E2E 全件 | 統括 | 約 15 分（推定） | 1 | 約 15 分 |
| `mutation-check` 全件 | 統括 | 約 14 分（#316 PR 1 の実測） | 1 | 約 14 分 |
| **統括の小計** | | | | **約 1 時間** |

実作業（コードと文書）は 2〜3 時間の見込み。**見積もりの 2 倍を超えたら、その時点で統括に報告する。**

## ファイルの一覧

| ファイル | 何をする |
|---|---|
| `e2e/specs/layout.spec.ts` | 変える。timer の流れの末尾（まとめ）に L1〜L6 の物差しを置く。テスト名の「まとめは prose」を直す |
| `apps/timer-web/test/ui/App.page-tier.test.tsx` | 新しく作る。完了の前後で器の段が変わらない／読み込み中は `--prose` |
| `apps/timer-web/src/App.tsx` | 変える。`pageOf` がまとめに `"wide"` を返す。注釈 |
| `apps/timer-web/src/ui/Summary.tsx` | 変える。統計の札 3 枚に `className="summary-stat"`。注釈 |
| `apps/timer-web/src/styles/summary.css` | 変える。`.summary` の幅と 3 段の並び・`.summary-stat`・64rem 以上の値の字 |
| `scripts/mutations/m130-timer-summary-page-prose.patch` | 新しく作る |
| `scripts/mutations/m131-timer-default-page-wide.patch` | 新しく作る |
| `scripts/mutation-check.mjs` | 変える。`MUTATIONS` の末尾に 130・131 を足す |
| `packages/ui/README.md` | 変える。「器の選び方」と「新しい画面や機能を足すときの手順」の 1 |
| `docs/adr/0025-responsive-layout.md` | 変える。決定 2 の追記・実施状況の行 |
| `docs/superpowers/specs/2026-10-08-responsive-layout-design.md` | 変える。D2 の表の直下に 1 行 |

---

### Task 1: E2E の物差しを先に書く（L1〜L6）

**Files:**
- Modify: `e2e/specs/layout.spec.ts`（`test.describe('timer は 1 つのルームでロビー・セッション・お題・まとめの順に画面を見る'` の中）

- [ ] **Step 1: 補助関数を足す**

`expectBodyScrolls` など既存の補助の近く（`test.describe` の外）に置く。

```ts
/**
 * まとめの統計の札 3 枚の位置と、値の字が札の内側に収まっているか（#352・設計 L4・L5）。
 * 収まりは値の文字の Range の矩形と、札の矩形から枠と余白を引いた内側で比べる（`scrollWidth` やクラスの値を読まない）。
 */
async function summaryStatCards(page: Page): Promise<Array<{ top: number; left: number; fits: boolean; text: string }>> {
  return page.locator('.summary-stats > .meter-panel').evaluateAll((cards) =>
    cards.map((card) => {
      const r = card.getBoundingClientRect();
      const s = getComputedStyle(card);
      const px = (v: string): number => parseFloat(v);
      const innerLeft = r.left + px(s.borderLeftWidth) + px(s.paddingLeft);
      const innerRight = r.right - px(s.borderRightWidth) - px(s.paddingRight);
      const value = card.querySelector('.summary-stat-value');
      if (value === null) return { top: r.top, left: r.left, fits: false, text: '値が描かれていない' };
      const range = document.createRange();
      range.selectNodeContents(value);
      const t = range.getBoundingClientRect();
      return {
        top: r.top,
        left: r.left,
        fits: t.width > 0 && t.left >= innerLeft - 0.5 && t.right <= innerRight + 0.5,
        text: value.textContent ?? '',
      };
    }),
  );
}

/** 札 3 枚が縦に積まれている（上端が狭義に増え、左端が揃う）か、横に並んでいる（上端が揃う）かを見る。 */
async function expectStatCards(page: Page, arrangement: 'stacked' | 'row', label: string): Promise<void> {
  const cards = await summaryStatCards(page);
  expect(cards, `${label}: 統計の札は 3 枚`).toHaveLength(3);
  // 収まりを先に見る（並びを壊した破壊検証で、はみ出しが実在するかを並びの赤と分けて読むため）
  for (const c of cards) expect(c.fits, `${label}: 「${c.text}」が札の内側からはみ出す`).toBe(true);
  const [a, b, c] = cards as [typeof cards[0], typeof cards[0], typeof cards[0]];
  if (arrangement === 'stacked') {
    expect(a.top < b.top && b.top < c.top, `${label}: 札が縦に積まれていない`).toBe(true);
    expect(Math.abs(a.left - b.left) <= 1 && Math.abs(b.left - c.left) <= 1, `${label}: 積んだ札の左端が揃わない`).toBe(true);
  } else {
    expect(Math.abs(a.top - b.top) <= 1 && Math.abs(b.top - c.top) <= 1, `${label}: 札が横に並んでいない`).toBe(true);
  }
}
```

- [ ] **Step 2: テストの末尾（まとめ）を置き換える**

今の末尾:

```ts
    // 最後にまとめ（prose の段）。完成にすると戻れないので末尾に置く
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: /完成!/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: '完成として記録する' }).click();
    await expect(page.locator('.summary')).toBeVisible();
    expect((await pageBox(page, TIMER_PAGE)).outer).toBe(40 * REM);
```

を次にする。

```ts
    // 最後にまとめ。完成にすると戻れないので末尾に置く。まとめは完了のあと幅を変えても出続けるので、同じルームで 4 つの幅を測る（#352）
    await page.setViewportSize({ width: 1920, height: 1080 });
    // L1 の基準: セッションの器の外寸と、上の帯の位置と幅（段の名前や 96rem の直値とは比べない。跳ねないことだけを見る）
    const frameBefore = { page: (await pageBox(page, TIMER_PAGE)).outer, strip: await boxOf(page, '.app-status-strip') };
    await page.getByRole('button', { name: /完成!/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: '完成として記録する' }).click();
    await expect(page.locator('.summary')).toBeVisible();
    // ドライバー別の札が無いと 2 列の検査が空振りする（ゲストはドライバーで加わっている）
    await expect(page.locator('.summary-drivers')).toBeVisible();

    // Then L1（1920）: 完了の前後で器と帯が動かない
    const frameAfter = { page: (await pageBox(page, TIMER_PAGE)).outer, strip: await boxOf(page, '.app-status-strip') };
    expect(frameAfter.page, '完了で器の幅が変わった').toBeCloseTo(frameBefore.page, 0);
    expect(frameAfter.strip.x, '完了で帯の左端が動いた').toBeCloseTo(frameBefore.strip.x, 0);
    expect(frameAfter.strip.width, '完了で帯の幅が変わった').toBeCloseTo(frameBefore.strip.width, 0);

    // Then L2・L3・L4・L5（1920・1280）: 64rem 以上は 2 列。題と帯は上でまたがり、左に統計（縦に積む）・右にドライバー別。中身は器の内側の中央に 64rem 以下
    for (const width of [1920, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const summary = await boxOf(page, '.summary');
      const stats = await boxOf(page, '.summary-stats');
      const drivers = await boxOf(page, '.summary-drivers');
      const banner = await boxOf(page, '.summary-banner');
      expect(stats.x + stats.width, `${String(width)}: 統計がドライバー別の左に無い`).toBeLessThanOrEqual(drivers.x + 0.5);
      expect(Math.abs(stats.y - drivers.y), `${String(width)}: 統計とドライバー別の上端が揃わない`).toBeLessThanOrEqual(1);
      expect(banner.x, `${String(width)}: 達成の帯が 2 列にまたがらない（左）`).toBeLessThanOrEqual(stats.x + 0.5);
      expect(banner.x + banner.width, `${String(width)}: 達成の帯が 2 列にまたがらない（右）`).toBeGreaterThanOrEqual(drivers.x + drivers.width - 0.5);
      expect(summary.width, `${String(width)}: 中身が 64rem を超える`).toBeLessThanOrEqual(64 * REM + 0.5);
      const frame = await pageBox(page, TIMER_PAGE);
      const innerLeft = frame.innerRight - frame.inner;
      const leftGap = summary.x - innerLeft;
      const rightGap = frame.innerRight - (summary.x + summary.width);
      expect(Math.abs(leftGap - rightGap), `${String(width)}: 中身が器の内側の中央に無い`).toBeLessThanOrEqual(1);
      await expectStatCards(page, 'stacked', `まとめ（${String(width)}）`);
    }

    // Then（768）: 1 列（ドライバー別は統計の下）・中身は 40rem 以下・統計の札は横に 3 枚
    await page.setViewportSize({ width: 768, height: 1024 });
    const mStats = await boxOf(page, '.summary-stats');
    const mDrivers = await boxOf(page, '.summary-drivers');
    expect(mDrivers.y, '768: ドライバー別が統計の下に無い').toBeGreaterThanOrEqual(mStats.y + mStats.height - 0.5);
    expect((await boxOf(page, '.summary')).width, '768: 中身が 40rem を超える').toBeLessThanOrEqual(40 * REM + 0.5);
    await expectStatCards(page, 'row', 'まとめ（768）');

    // Then L5・L4・L6（320）: 統計の札は縦に積み、数字は札に収まり、横に溢れない
    await page.setViewportSize({ width: 320, height: 640 });
    await expectStatCards(page, 'stacked', 'まとめ（320）');
    await expectNoHorizontalOverflow(page);
```

- [ ] **Step 3: テスト名を直す**

`test('Given 幅 320 のロビー（参加者 2 人） / When … / Then … 器は画面の用途の段（ロビー・セッションは wide・まとめは prose）'` の末尾を
`… 器はロビー・セッション・まとめで変わらず、まとめは 64rem 以上で 2 列・未満で 1 列'` にする（`When` の「幅 390・まとめと開く」も「幅 390・まとめ（1920・1280・768・320）と開く」に）。

- [ ] **Step 4: 型と lint を通す**

Run: `pnpm --filter @tasuki/e2e typecheck` → 期待: エラー 0
Run: `pnpm --filter @tasuki/e2e lint` → 期待: エラー 0

- [ ] **Step 5: コミットする**

```bash
git add e2e/specs/layout.spec.ts
git commit -m "test: まとめの器と並びの物差しを先に置く（#352）" -m "..."
```

- [ ] **Step 6（統括が流す）: 対照実行**

このコミット（製品コードは main と同じ）で `layout.spec.ts` を流し、**L1 の「完了で器の幅が変わった」（1536 → 640）で赤になる**ことを確かめる。緑なら物差しが空振りしているので止まる。

---

### Task 2: まとめの器を部屋の器にする（`pageOf`・m130 / m131）

**Files:**
- Create: `apps/timer-web/test/ui/App.page-tier.test.tsx`
- Modify: `apps/timer-web/src/App.tsx`（`pageOf` とその注釈）
- Create: `scripts/mutations/m130-timer-summary-page-prose.patch`・`scripts/mutations/m131-timer-default-page-wide.patch`
- Modify: `scripts/mutation-check.mjs`（`MUTATIONS` の末尾）

- [ ] **Step 1: 赤いテストを書く**

`apps/timer-web/test/ui/App.snapshot-intents.test.tsx` の `beforeEach` / `afterEach`・`participant`・`sendServer` と同じ造作を使う（コピーしてよい。共有化はしない）。

```tsx
/**
 * 器の段（`Stage` の `page`・`App.tsx` の `pageOf`）を画面の段階で見る（#352・設計 D1）。
 *
 * まとめはロビー・セッションと同じ部屋の段階なので、完了しても器の段を変えない（変えると上の帯ごと幅が跳ねる）。
 * **直値（`ui-page--wide`）と比べず、完了の前後の `className` を比べる。** 段の名前が変わっても「跳ねない」ことだけを見る。
 * 読み込み中は読む画面の段（`--prose`）のまま —— 「全部 wide にすれば跳ねない」という直し方を止める。
 *
 * @requirements #352 設計 D1・m130・m131
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act, cleanup } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { aRecord, aRoomView } from "../support/room-view.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const ME = "p-alice";

function participant(participantId: string, displayName: string) {
  return { participantId, displayName, presence: "online" as const, joinedAt: 0 };
}

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

/** 器（`Stage` の内側の div）の className。 */
function pageClass(): string {
  const el = document.querySelector(".stage-inner");
  if (el === null) throw new Error("器（.stage-inner）が描かれていない");
  return el.className;
}

beforeEach(() => {
  FakeWS.instances = [];
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("WebSocket", FakeWS);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("器の段は画面の段階で決まる", () => {
  it("Given ルームのセッション / When 完了の snapshot が届く / Then 器の段は変わらない（帯ごと幅が跳ねない）", () => {
    // Given: セッション中
    const ws = enterRoomAndConnect({ participantId: ME, displayName: "Creator" });
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: ME });
    const room = (phase: "session" | "celebration", sessionRecords: ReturnType<typeof aRecord>[]) =>
      aRoomView({ code: "ROOM01", phase, participants: [participant(ME, "Creator")], sessionRecords });
    sendServer(ws, { type: "snapshot", room: room("session", []) });
    expect(screen.getByRole("main", { name: "セッション" })).toBeInTheDocument();
    const during = pageClass();

    // When: 完成の記録を 1 件足した完了の snapshot
    sendServer(ws, { type: "snapshot", room: room("celebration", [aRecord({ id: "srv-1" })]) });

    // Then: まとめが出て、器の className はセッションのときと同じ
    expect(screen.getByRole("heading", { name: "セッション完了" })).toBeInTheDocument();
    expect(pageClass()).toBe(during);
  });

  it("Given ルームへ入る途中 / When snapshot がまだ届かない / Then 器は読む画面の段（--prose）のまま", () => {
    // Given / When: 接続したが snapshot は届いていない（読み込み中）
    enterRoomAndConnect({ participantId: ME, displayName: "Creator" });

    // Then
    expect(screen.getByRole("status")).toHaveTextContent("読み込んでいます");
    expect(pageClass()).toContain("ui-page--prose");
  });
});
```

- [ ] **Step 2: 赤を見る**

Run: `cd apps/timer-web && npx vitest run test/ui/App.page-tier.test.tsx`
期待: 1 本目が赤（`ui-page ui-page--prose stage-inner` と `ui-page ui-page--wide stage-inner` の不一致）。2 本目は緑（守りのテスト。Step 6 の m131 で赤になることを見る）。**1 本目が緑なら造作が画面を出せていないので止まって報告する。**

- [ ] **Step 3: `pageOf` を直す**

`apps/timer-web/src/App.tsx`:

```ts
/**
 * 画面ごとの器の段（`Stage` の `page`・#316 D2・#352 D1）。分岐の優先順は `renderBody` と同じ。
 * 履歴は記録の一覧なので 72rem。ロビー・セッション・まとめは同じ部屋の段階なので、どれも部屋の器（96rem）にする
 * （段階で器を変えると、上の帯ごと画面の幅が跳ねる。まとめの中身の幅は `summary.css` が持つ）。
 * 喪失・読み込み中は短い読み物なので 40rem。
 */
function pageOf(historyOpen: boolean, sessionLost: boolean, mode: string | null | undefined, hasRoom: boolean): "prose" | "default" | "wide" {
  if (historyOpen) return "default";
  if (sessionLost) return "prose";
  if ((mode === "lobby" || mode === "session" || mode === "celebration") && hasRoom) return "wide";
  return "prose";
}
```

- [ ] **Step 4: 緑を見る**

Run: `cd apps/timer-web && npx vitest run test/ui/App.page-tier.test.tsx test/ui/App.loading.test.tsx test/ui/App.snapshot-intents.test.tsx`
期待: すべて緑

- [ ] **Step 5: コミットする**（変異パッチを作る前に作業ツリーを空にする）

```bash
git add apps/timer-web/test/ui/App.page-tier.test.tsx apps/timer-web/src/App.tsx
git commit -m "feat: まとめもロビー・セッションと同じ部屋の器にする（#352）" -m "..."
git status --porcelain   # 期待: 空
```

- [ ] **Step 6: 変異パッチを作り、1 本ずつ赤を見る**

m130（まとめを部屋の器から外す）: `App.tsx` の `|| mode === "celebration"` を消し、差分を取ってから戻す。

```bash
# 変異を当てる（エディタで `|| mode === "celebration"` を消す）
git diff apps/timer-web/src/App.tsx > /tmp/claude-1000/m130.diff
(cd apps/timer-web && npx vitest run test/ui/App.page-tier.test.tsx)   # 期待: 1 本目が赤
git apply -R /tmp/claude-1000/m130.diff
git status --porcelain   # 期待: 空
```

m131（既定の枝を wide にする）: `pageOf` の最後の `return "prose";` を `return "wide";` に変え、同じ手順で差分を取る。期待: 2 本目（読み込み中）が赤。戻したら `git status --porcelain` が空。

パッチのファイルは差分の前に次の頭を付ける（既存の `scripts/mutations/m99-*.patch` と同じ形）。

```
# 変異 130: timer-summary-page-prose
#
# 検出を期待するテスト:
#   - apps/timer-web/test/ui/App.page-tier.test.tsx
#     「Given ルームのセッション / When 完了の snapshot が届く / Then 器の段は変わらない（帯ごと幅が跳ねない）」
#
# #352・設計 D1。`pageOf` がまとめ（celebration）を部屋の器から外し、既定の 40rem に落とす。
# 完了した瞬間に、ステータスの帯ごと画面の幅が 1536px から 640px へ縮む（#352 の利用者のフィードバック）。
#
# 適用: リポジトリルートから
#       git apply scripts/mutations/m130-*.patch
# 復元: git apply -R scripts/mutations/m130-*.patch
```

```
# 変異 131: timer-default-page-wide
#
# 検出を期待するテスト:
#   - apps/timer-web/test/ui/App.page-tier.test.tsx
#     「Given ルームへ入る途中 / When snapshot がまだ届かない / Then 器は読む画面の段（--prose）のまま」
#
# #352・設計 D1。`pageOf` の既定の枝を wide にする（「全部 wide にすれば跳ねない」という直し方）。
# 読み込み中・行き先の無い URL の短い画面まで 96rem の器になり、ADR 0025 決定 2 の段の選び方が崩れる。
#
# 適用: リポジトリルートから
#       git apply scripts/mutations/m131-*.patch
# 復元: git apply -R scripts/mutations/m131-*.patch
```

- [ ] **Step 7: 変異を宣言する**

`scripts/mutation-check.mjs` の `MUTATIONS` の末尾（`id: 125` の後）に足す。

```js
  {
    id: 130,
    label: "まとめの器を部屋の器から外す（完了の瞬間に帯ごと幅が跳ねる）",
    patch: "m130-timer-summary-page-prose.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.page-tier.test.tsx"],
    note: "#352・設計 D1。まとめはロビー・セッションと同じ部屋の段階。器を変えると、上のステータスの帯ごと 1536px から 640px へ縮む。",
  },
  {
    id: 131,
    label: "器の既定の枝を wide にする（読み込み中まで 96rem になる）",
    patch: "m131-timer-default-page-wide.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.page-tier.test.tsx"],
    note: "#352・設計 D1。「全部 wide にすれば跳ねない」という直し方を止める。読み込み中と行き先の無い URL の画面は読む画面の段のまま。",
  },
```

Run: `node --test scripts/mutation-check.test.mjs` → 期待: 緑（宣言とパッチの 1 対 1・パッチがいまの製品コードへ当たる）

- [ ] **Step 8: コミットする**

```bash
git add scripts/mutations/m130-timer-summary-page-prose.patch scripts/mutations/m131-timer-default-page-wide.patch scripts/mutation-check.mjs
git commit -m "test: まとめの器の変異 m130・m131 を足す（#352）" -m "..."
```

---

### Task 3: まとめの中身を段ごとに並べる（`summary.css`・`Summary.tsx`）

**Files:**
- Modify: `apps/timer-web/src/ui/Summary.tsx`
- Modify: `apps/timer-web/src/styles/summary.css`

E2E（Task 1）が赤い物差しで、この Task の後に統括が緑を見る。jsdom では並びを測れないので、この Task に単体テストの赤は無い（設計 §7.2）。

- [ ] **Step 1: 統計の札にクラスを足す**

`Summary.tsx` の 3 つの `<Card>`（所要時間・交代回数・周回数）を `<Card className="summary-stat">` にする。統計の注釈（「3 列の統計カード。360px 幅では…（R5-3）」）を次に置き換える。

```tsx
          {/* 統計の札 3 枚（#352・設計 D2）。40rem 未満と 64rem 以上（ドライバー別があるとき）は縦に積み、札の中はラベルを左・値を右の 1 行にする。
              40rem 以上 64rem 未満は横に 3 枚。並びは `summary.css` が持つ。2 列の配置は `.summary` の直下の子に掛けるので、
              統計とドライバー別の札を別の要素で包まない。 */}
```

- [ ] **Step 2: `summary.css` を直す**

ファイルの頭の注釈の末尾に次の 1 段落を足す。

```css
 *
 * 並び（#352・設計 D2）: 器は部屋の器（`--wide`）のままで、中身（`.summary`）を段ごとに読みやすい幅で中央に置く。
 *   compact（40rem 未満）: 1 列。統計の札は縦に積み、札の中はラベルを左・値を右（計器の読み）
 *   medium（40rem 以上）: 1 列・最大 40rem。統計の札は横に 3 枚
 *   wide（64rem 以上）: 最大 64rem・2 列。題と達成の帯は上で、次の行動は下で 2 列にまたがる。ドライバー別があれば
 *     左に統計（縦に積む）・右にドライバー別。無ければ統計も 2 列にまたがって横に 3 枚
```

`.summary` を次にする（幅の 3 行を足す）。

```css
.summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: 100%;
  max-width: 40rem;
  margin-inline: auto;
  text-align: center;
}
```

`/* 3 列の統計カード */` の `.summary-stats` を次にし、直後に `.summary-stat` と 2 つの `@media` を置く（`.summary-stat-value` より後ろに置くと、64rem の `font-size` が同じ詳細度で後勝ちになることを確かめやすい。**`@media (width >= 64rem)` の塊は `.summary-stat-value` の定義より後ろに置く**）。

```css
/* 統計の札。既定（40rem 未満）は縦に積む */
.summary-stats {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
}

/* 統計の札 1 枚（`Card` に当てる）。縦に積むときはラベルを左・値を右の 1 行にする（計器の読み） */
.summary-stat {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}
```

`.summary-stat-value` の定義の直後に置く:

```css
@media (width >= 40rem) {
  /* 1 列のまま、統計の札を横に 3 枚（札の中はラベルの下に値） */
  .summary-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .summary-stat {
    display: block;
  }
}

@media (width >= 64rem) {
  /* 2 列。行の高さは揃える（ドライバー別の札が統計の高さまで伸びる） */
  .summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    max-width: 64rem;
  }

  /* 既定はどの子も 2 列にまたがる（題・達成の帯・中断の一言・次の行動・ドライバー別が無いときの統計） */
  .summary > * {
    grid-column: 1 / -1;
  }

  /* ドライバー別があるときだけ、統計を左の列に縦に積み、ドライバー別を右の列に置く */
  .summary:has(> .summary-drivers) > .summary-stats {
    grid-column: 1;
    grid-template-columns: minmax(0, 1fr);
  }

  .summary:has(> .summary-drivers) .summary-stat {
    display: flex;
  }

  .summary > .summary-drivers {
    grid-column: 2;
  }

  .summary-stat-value {
    font-size: var(--font-size-xl); /* 広い画面ではまとめの主役は数字（#352 設計 D3） */
  }
}
```

詳細度の確かめ: `.summary > *`（0,1,0）より `.summary > .summary-drivers`（0,2,0）と `.summary:has(> .summary-drivers) > .summary-stats`（0,3,0）が勝つ。`.summary:has(> .summary-drivers) .summary-stat`（0,3,0）は 40rem の `.summary-stat`（0,1,0）に勝つ。

- [ ] **Step 3: 検査を流す**

Run: `node scripts/audit-ui-components.mjs` → 期待: 違反 0（`@media` は 40rem / 64rem の範囲構文・生の色なし）
Run: `node scripts/audit-timer-classes.mjs` → 期待: 違反 0（`summary-stat` は定義済み）
Run: `pnpm --filter @tasuki/ui test` → 期待: 緑（文字の大きさの検査が `apps/*/src` の CSS も読む）
Run: `pnpm --filter @tasuki/timer-web test` → 期待: 緑（`Summary.test.tsx` を含む）
Run: `pnpm --filter @tasuki/timer-web typecheck` と `pnpm --filter @tasuki/timer-web lint` → 期待: エラー 0

- [ ] **Step 4: コミットする**

```bash
git add apps/timer-web/src/ui/Summary.tsx apps/timer-web/src/styles/summary.css
git commit -m "feat: まとめを 64rem 以上で 2 列に並べ、狭い幅で統計の札を縦に積む（#352）" -m "..."
```

- [ ] **Step 5（統括が流す）: 緑を見る**

`layout.spec.ts` と `buttons.spec.ts` を流し、緑を確かめる。`buttons.spec.ts` の「timer まとめ（390）」は 4 つの幅で押せる大きさ・重なり・字の折れ・横溢れを測る（変えていない物差しで、器が広がっても通ることを見る）。

---

### Task 4（統括が流す）: 破壊検証

**作業ツリーが空であることを確かめてから入る**（`git status --porcelain`）。壊したら必ず `git apply -R`（または手で戻して `git diff` が空）で戻す。

| # | 壊し方 | 期待する赤 |
|---|---|---|
| B1 | `summary.css` の `@media (width >= 64rem)` の塊を消す | 1920 の「統計がドライバー別の左に無い」（L2） |
| B2 | `summary.css` の既定の `.summary-stats` を `repeat(3, minmax(0, 1fr))` にする（40rem 未満も横に 3 枚。main と同じ並び） | 320 の「『0分0X秒』が札の内側からはみ出す」（L5）。**緑で 320 の「札が縦に積まれていない」（L4）だけが赤なら、設計 §2.1 の推定（はみ出し）は外れている** —— 設計 §2.1 に「推定は外れた（実測 …）」と書き足す（積み方の決定は変えない） |

L1（器と帯）は Task 1 の対照実行と m130 が守るので、ここでは壊さない。

---

### Task 5: 文書を揃える

**Files:**
- Modify: `packages/ui/README.md`
- Modify: `docs/adr/0025-responsive-layout.md`
- Modify: `docs/superpowers/specs/2026-10-08-responsive-layout-design.md`

- [ ] **Step 1: README の「器の選び方」**

表を次にする。

```markdown
| 画面の用途 | 器 | 最大幅 |
|---|---|---|
| 読む・入力する（名乗る・待つ・見つからない） | `.ui-page .ui-page--prose` | `40rem` |
| 選ぶ・一覧する（道具を選ぶ・履歴） | `.ui-page` | `72rem` |
| 道具の部屋（区画を横に並べる）と、その部屋の段階（始める前・進行中・終えた後のまとめ） | `.ui-page .ui-page--wide` | `96rem` |
```

表の直後（「器は `<main>` に当てる。」の段落の前）に足す。

```markdown
**部屋の中で段階が移る画面は、段階が変わっても器を変えない。** 器を変えると、上の帯（ステータス）ごと画面の幅が跳ねる。中身が少ない段階は、中身の側で読みやすい幅に寄せて中央に置く（「段組み」の 1 列と同じ考え方）。
```

「新しい画面や機能を足すときの手順」の 1 を次にする。

```markdown
1. **器を選ぶ。** 読む・入力するなら `--prose`、選ぶ・一覧するなら既定、区画を横に並べる道具の部屋とその段階（始める前・進行中・終えた後）なら `--wide`（「器の選び方」）
```

- [ ] **Step 2: ADR 0025**

決定 2 の末尾（「要素層の `.page` は消す」の後）に足す。

```markdown
 部屋の中で段階が移る画面（timer の終えた後のまとめ）は、部屋の器（`--wide`）を保つ。段階で器を変えると上の帯ごと幅が跳ねる（2026-10-12・#352・利用者のフィードバックを受けて。設計は `docs/superpowers/specs/2026-10-12-summary-layout-design.md`）
```

実施状況の表の末尾に 1 行足す（**完了形で書かない**）。

```markdown
| 2 の追記（部屋の段階は器を保つ） | #352 |
```

- [ ] **Step 3: #316 の設計正本**

D2 の表（`| `.ui-page--wide` | `96rem` | 道具の部屋: … |`）の直下、「外の余白は…」の箇条の前に 1 行足す。D2・D7・U3 の表そのものは書き換えない（当時の判断の記録）。

```markdown
> timer のまとめは #352 で `--wide` へ改めた（[#352 の設計](2026-10-12-summary-layout-design.md) D1）。U3 の 640px は、まとめの中身の幅として 64rem 未満に残る。
```

- [ ] **Step 4: リンクを確かめる**

Run: `node scripts/check-links.mjs` → 期待: 壊れたリンク 0

- [ ] **Step 5: コミットする**

```bash
git add packages/ui/README.md docs/adr/0025-responsive-layout.md docs/superpowers/specs/2026-10-08-responsive-layout-design.md
git commit -m "docs: 部屋の段階は器を変えないことを README と ADR 0025 に残す（#352）" -m "..."
```

---

### Task 6（統括が流す）: 全件・撮影・利用者の確認

- [ ] E2E 全件（ルームは増えていない。増えたら止まる）
- [ ] `node scripts/mutation-check.mjs`（m130・m131 が検出されること）
- [ ] 撮影: まとめ（完成）を 320・768・1280・1920 で撮り、main の同じ 4 枚と並べる（#316 の撮り方。使い捨ての spec は残さない）
- [ ] 利用者に Chrome で見てもらう（設計 §10 の Q1・Q2 を添える）
- [ ] PR を作ったら `/code-review <番号>` を流す
