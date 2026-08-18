# ドメインの副作用除去（#166 / #72 E3）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/timer-core/src/problem.ts` の `Date.now()` を引数注入へ替え、`packages/*-core/src` に環境からの直読みが無いことを機械検査で守る。

**Architecture:** `pickFallback` が第 3 引数 `now: number`（必須・既定値なし）を受け取る純粋関数になる。timer-sync は既存の `Clock` ポート（現在は宣言だけで未使用）を経由し、timer-web は `ProblemProvider` のアダプタ内で `Date.now()` を呼ぶ。機械検査 `scripts/audit-domain-side-effects.mjs` は既存の共有モジュール `scripts/lib/scan-targets.mjs` に乗せ、宣言＋全単射照合という既存 4 本と同じ形にする。

**Tech Stack:** TypeScript 6.0.3 / Vitest 4.1.10（timer-core・timer-web）/ Bun test（timer-sync）/ `node --test`（`scripts/`）/ pnpm 11.5.0 + turbo

**Spec:** [`docs/superpowers/specs/2026-08-18-domain-side-effect-removal-design.md`](../specs/2026-08-18-domain-side-effect-removal-design.md)

## Global Constraints

- **作業場所は `/home/vscode/tasuki-work`**（overlay）。`/workspaces/claym/local/Tasuki` では作業しない（9p マウントで約 48 倍遅い）
- **ブランチは `refactor/166-domain-side-effect-removal`**（作成済み・`origin/main` = `e905b38` 起点）
- **振る舞い不変。** 呼び出し側が実時刻を渡す限り、選ばれるお題は変更前と 1 件も変わらない
- **`Math.abs(now) % candidates.length` の式は 1 文字も変えない**
- **検査は「コードを直したあと」に置く。** 赤いコミットを履歴に残さない（#165 で bisect が濁った）
- **件数の下限を直書きしない。** 書いてよいのは「非空（1 件以上）」の判定のみ（ADR-0014 決定 8 の MUST NOT）
- **走査対象の権威は `listWorkspacePackages`（= `pnpm -r list --depth -1 --json`）と `listTrackedFiles`（= `git ls-files`）。** `fs.readdirSync` によるパッケージ導出は禁止（ADR-0014 決定 3 の MUST NOT）
- **テストを走らせるときは turbo のキャッシュに注意。** `pnpm test` は既定でキャッシュに当たり 1.5 秒で「緑」を出す。実際に走らせるなら `--force` を付けて `0 cached` を確認する
- **`FALLBACK_PROBLEMS` は 33 件**（2026-08-18 実測）。テストにこの数値を直書きせず `FALLBACK_PROBLEMS.length` を使う
- コメント・docstring は日本語。コミットメッセージは Conventional Commits（日本語本文）

---

## File Structure

| ファイル | 責務 | Task |
|---|---|---|
| `packages/timer-core/test/problem.golden.test.ts` | 変更前に採取したゴールデン値表。振る舞い不変の証拠 | 1, 2 |
| `packages/timer-core/src/problem.ts` | `pickFallback` のシグネチャ変更と `??` 削除 | 2 |
| `packages/timer-core/test/problem.test.ts` | 既存 4 呼び出しの更新＋決定論テストの追加 | 2 |
| `apps/timer-sync/src/application/problem-delegation.ts` | `this.clock` の保持と 3 箇所の配線 | 3 |
| `apps/timer-sync/test/problem-delegation.clock.test.ts` | 3 経路の配線テスト（新規ファイル） | 3 |
| `apps/timer-web/src/ai/no-ai.ts` | アダプタ境界での `Date.now()` | 4 |
| `scripts/audit-domain-side-effects.mjs` | 機械検査の本体 | 5 |
| `scripts/audit-domain-side-effects.test.mjs` | 検査の自己テスト（CI は git から導出するので登録不要） | 5 |
| `scripts/scan-target-wiring.test.mjs` | 導出ガードの追加 | 6 |
| `.github/workflows/ci.yml` / `AGENTS.md` / `docs/guides/development.md` / `docs/adr/0016-core-domain-representation.md` | 外部配線と規範 | 7 |

---

## Task 1: ゴールデン値の採取（変更前の振る舞いを固定する）

**Files:**
- Create: `packages/timer-core/test/problem.golden.test.ts`

**Interfaces:**
- Consumes: 現行の `pickFallback(language: string, difficulty: string): ProblemWithSource`
- Produces: `GOLDEN` テーブル（Task 2 が第 3 引数版へ書き換えて再利用する）

**なぜ最初か:** 変更後は `Date.now()` を呼ばなくなるので、この採取は**変更前にしかできない**。採取は `vi.setFakeTimers()` でシステム時刻を固定して**実際に関数を走らせる**測定であり、`Math.abs(now) % len` の再計算（実装の写経）ではない。写経すると配線が消えても緑になる。

- [ ] **Step 1: ゴールデンテストを書く**

`packages/timer-core/test/problem.golden.test.ts` を新規作成:

```typescript
/**
 * `pickFallback` の選択結果を固定する特性テスト（#166 / #72 E3）。
 *
 * **この表は計算ではなく測定である。** 2026-08-18、main `e905b38`（`Date.now()` を
 * 内部で呼んでいた版）に対して `vi.setSystemTime(now)` でシステム時刻を固定し、
 * 実際に `pickFallback` を走らせて採取した。
 *
 * **`Math.abs(now) % candidates.length` をここで再計算してはならない。** 再計算は
 * 実装の写経であり、選択のロジックが壊れても表と実装が同時にずれるので緑のままになる
 * （`audit-log-hygiene` のテストが検査と同じ判定を再実装していたために、配線が消えても
 * 緑だった #158 と同型の罠）。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { pickFallback, FALLBACK_PROBLEMS } from "../src/problem.js";

/** `[言語, 難易度, now, 期待する title]`。main `e905b38` で採取した実測値。 */
const GOLDEN: Array<[string, string, number, string]> = [
  ["TypeScript", "easy", 0, "FizzBuzz"],
  ["TypeScript", "easy", 1, "回文チェッカー"],
  ["TypeScript", "easy", 2, "銀行口座"],
  ["TypeScript", "easy", 3, "二数の和"],
  ["TypeScript", "easy", 4, "文字数カウント"],
  ["TypeScript", "easy", 5, "最大値を探す"],
  ["TypeScript", "easy", 1755500000000, "配列の合計と平均"],
  ["TypeScript", "hard", 0, "行列の回転"],
  ["TypeScript", "hard", 1, "ボウリングのスコア計算"],
  ["TypeScript", "hard", 2, "LRU キャッシュ"],
  ["TypeScript", "hard", 3, "三目並べの勝敗判定"],
  ["TypeScript", "hard", 4, "ネストJSONの平坦化"],
  ["TypeScript", "hard", 5, "レート制限（トークンバケット）"],
  ["TypeScript", "hard", 1755500000000, "レート制限（トークンバケット）"],
  ["COBOL-不明言語", "easy", 0, "FizzBuzz"],
  ["COBOL-不明言語", "easy", 1, "回文チェッカー"],
  ["COBOL-不明言語", "easy", 2, "ローマ数字変換"],
  ["COBOL-不明言語", "easy", 3, "銀行口座"],
  ["COBOL-不明言語", "easy", 4, "テニスゲームスコア"],
  ["COBOL-不明言語", "easy", 5, "行列の回転"],
  ["COBOL-不明言語", "easy", 1755500000000, "電卓（式の評価）"],
];

afterEach(() => {
  vi.useRealTimers();
});

describe("pickFallback: 変更前の選択結果（ゴールデン値）", () => {
  it("定型バンクは 33 件である（母数が変わったら表を採り直す）", () => {
    expect(FALLBACK_PROBLEMS.length).toBe(33);
  });

  it.each(GOLDEN)(
    "%s / %s / now=%d は「%s」を選ぶ",
    (language, difficulty, now, expectedTitle) => {
      // Given: 変更前の実装は内部で Date.now() を読むので、システム時刻を固定する
      vi.useFakeTimers();
      vi.setSystemTime(now);
      // When
      const result = pickFallback(language, difficulty);
      // Then
      expect(result.problem.title).toBe(expectedTitle);
      expect(result.source).toBe("fallback");
    },
  );
});
```

- [ ] **Step 2: テストを走らせて緑になることを確認する（対照実行）**

```bash
cd /home/vscode/tasuki-work/packages/timer-core
corepack pnpm exec vitest run test/problem.golden.test.ts
```

期待: `Tests  22 passed`（母数の 1 件＋ GOLDEN 21 件）

**緑にならなかった場合は表が誤っている。** Task 2 へ進まず、採取をやり直すこと（`vi.setSystemTime` を使って実際に走らせ、出た title を書き写す）。

- [ ] **Step 3: 表が実際に効いていることを確かめる（破壊検証）**

`GOLDEN` の 1 行目の期待値を `"FizzBuzz"` から `"存在しないお題"` へ書き換える。

```bash
grep -c '"存在しないお題"' test/problem.golden.test.ts   # 1 であることを先に確認する
corepack pnpm exec vitest run test/problem.golden.test.ts
```

期待: 1 件 FAIL。確認したら書き戻し、再度緑を確認する。

**`grep -c` を先に見るのは、書き換えが空振りしたまま「赤にならない」と誤読しないため。**

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add packages/timer-core/test/problem.golden.test.ts
git commit -m "test: pickFallback の選択結果をゴールデン値で固定する（#166）

- 変更前の実装に vi.setSystemTime を当てて実際に走らせ、21 組を採取した
- 実装の写経（Math.abs(now) % len の再計算）は行わない
- 以後の変更で選ばれるお題が変わったら、この表が赤くなる"
```

---

## Task 2: `pickFallback` のシグネチャ変更と `??` の削除

**Files:**
- Modify: `packages/timer-core/src/problem.ts:48-75`
- Modify: `packages/timer-core/test/problem.test.ts:119,130,144,160`
- Modify: `packages/timer-core/test/problem.golden.test.ts`（Task 1 で作成）

**Interfaces:**
- Consumes: Task 1 の `GOLDEN` テーブル
- Produces: `pickFallback(language: string, difficulty: string, now: number): ProblemWithSource`（Task 3・Task 4 が呼ぶ）

- [ ] **Step 1: 決定論テストを先に書く（まだ失敗する）**

`packages/timer-core/test/problem.test.ts` の `describe("pickFallback: 定型お題へのフォールバック", ...)` の**末尾**に追加:

```typescript
  /**
   * 第 3 引数が実際に選択を決めていることを固定する（#166 / #72 E3）。
   *
   * **この 3 件が無いと、第 3 引数を完全に無視する実装でも全件緑になる。**
   * 既存のテストは source と必須フィールドしか見ておらず、どのお題が選ばれたかを
   * 観測していないため。
   */
  it("同じ now を渡せば同じお題を返す", () => {
    // Given
    const now = 12345;
    // When
    const a = pickFallback("TypeScript", "easy", now);
    const b = pickFallback("TypeScript", "easy", now);
    // Then
    expect(a.problem.title).toBe(b.problem.title);
  });

  it("now を 0 から順に動かすと定型バンクを一巡する（引数が index を決めている証拠）", () => {
    // Given（未知言語を渡して全件縮退させ、母数を FALLBACK_PROBLEMS.length に確定させる）
    const unknownLanguage = "COBOL-不明言語";
    // When
    const titles = Array.from({ length: FALLBACK_PROBLEMS.length }, (_, now) =>
      pickFallback(unknownLanguage, "easy", now).problem.title,
    );
    // Then（重複が無い＝全件を 1 度ずつ選んでいる）
    expect(new Set(titles).size).toBe(FALLBACK_PROBLEMS.length);
  });

  it("負の now でも範囲内のお題を返す（Math.abs の既存挙動）", () => {
    // Given
    const negativeNow = -7;
    // When
    const result = pickFallback("COBOL-不明言語", "easy", negativeNow);
    // Then
    expect(FALLBACK_PROBLEMS.some((e) => e.problem.title === result.problem.title)).toBe(true);
  });
```

同ファイル冒頭の import に `FALLBACK_PROBLEMS` が含まれていることを確認する（`packages/timer-core/test/problem.test.ts:9` 付近。既に import 済みのはず）。

- [ ] **Step 2: テストを走らせて失敗することを確認する**

```bash
cd /home/vscode/tasuki-work/packages/timer-core
corepack pnpm exec vitest run test/problem.test.ts
```

期待: 新しい 3 件のうち「一巡する」が FAIL（第 3 引数がまだ無視され、`Date.now()` が使われるため全部同じ title になる）。

- [ ] **Step 3: `pickFallback` を書き換える**

`packages/timer-core/src/problem.ts` の該当部分を以下に置き換える:

```typescript
/**
 * 言語・難易度に合った定型お題を返す
 * AI 生成失敗時のフォールバック（FR-024）
 *
 * @param now 選択の元になる値。**実体は擬似乱数の種であり、時刻としての意味は持たない。**
 *   引数名を `now` にしているのは `docs/timer/adr/0002`（「時刻は引数 `now` として注入し、
 *   `Date.now()` をドメイン内で呼ばない」）と timer-core の他所（`records.ts` `evolve.ts`
 *   `aggregate.ts`）の語彙に揃えるため。**既定値は置かない** — 既定値があると呼び出し側が
 *   無変更で通り、「配線されている」ことが検査されないまま緑になる（#166 / #72 E3）。
 */
export function pickFallback(
  language: string,
  difficulty: string,
  now: number,
): ProblemWithSource {
  // 言語・難易度でフィルタ
  let candidates = FALLBACK_PROBLEMS.filter(
    (e) => e.languages.includes(language) && e.difficulty === difficulty,
  );

  // 言語フィルタのみ
  if (candidates.length === 0) {
    candidates = FALLBACK_PROBLEMS.filter((e) =>
      e.languages.includes(language),
    );
  }

  // 全フォールバック
  if (candidates.length === 0) {
    candidates = FALLBACK_PROBLEMS;
  }

  // 疑似ランダムに選択（呼び出し側が渡した値ベース）
  const index = Math.abs(now) % candidates.length;
  // `?? FALLBACK_PROBLEMS[0]!` は置かない。有効な now では candidates[index] が必ず
  // 定義済みなので死んだ枝であり、置くと now の渡し忘れ（NaN）を黙って飲み込んで
  // 先頭のお題を返してしまう。テストは型検査の射程外なので、これが唯一の防波堤になる。
  const entry = candidates[index]!;

  return { problem: entry.problem, source: "fallback" };
}
```

- [ ] **Step 4: 既存 4 呼び出しへ第 3 引数を足す**

`packages/timer-core/test/problem.test.ts` の 4 箇所を書き換える。**主張は変えない。**

| 行 | 変更前 | 変更後 |
|---|---|---|
| 119 | `pickFallback(language, difficulty)` | `pickFallback(language, difficulty, 0)` |
| 130 | `pickFallback(language, difficulty)` | `pickFallback(language, difficulty, 0)` |
| 144 | `pickFallback(unknownLanguage, "easy")` | `pickFallback(unknownLanguage, "easy", 0)` |
| 160 | `pickFallback("TypeScript", "easy")` | `pickFallback("TypeScript", "easy", 0)` |

- [ ] **Step 5: ゴールデンテストを第 3 引数版へ書き換える**

`packages/timer-core/test/problem.golden.test.ts` の `it.each` の本体を差し替える（偽タイマーが不要になる）:

```typescript
  it.each(GOLDEN)(
    "%s / %s / now=%d は「%s」を選ぶ",
    (language, difficulty, now, expectedTitle) => {
      // When（変更後は now を引数で渡す。偽タイマーは不要）
      const result = pickFallback(language, difficulty, now);
      // Then
      expect(result.problem.title).toBe(expectedTitle);
      expect(result.source).toBe("fallback");
    },
  );
```

同ファイルの `import` から `vi` を、末尾から `afterEach(() => { vi.useRealTimers(); });` を削除する。docstring の「main `e905b38`（`Date.now()` を内部で呼んでいた版）に対して `vi.setSystemTime(now)` で…採取した」という記述は**残す**（採取の由来の記録なので消さない）。

- [ ] **Step 6: テストを走らせて緑になることを確認する**

```bash
cd /home/vscode/tasuki-work/packages/timer-core
corepack pnpm exec vitest run
```

期待: 全件 PASS。**ゴールデン値 21 件が変更前と同じ title を返す = 振る舞い不変の証拠。**

- [ ] **Step 7: `??` を消したことが効いているか破壊検証する**

第 3 引数を落とすと大声で落ちることを確認する。`test/problem.test.ts:119` を一時的に `pickFallback(language, difficulty, undefined as unknown as number)` へ書き換える。

```bash
grep -c "undefined as unknown as number" test/problem.test.ts   # 1 であることを先に確認
corepack pnpm exec vitest run test/problem.test.ts
```

期待: `TypeError: Cannot read properties of undefined (reading 'problem')` で FAIL。

**もし PASS したら `??` が残っている。** 確認したら書き戻し、再度緑を確認する。

- [ ] **Step 8: 型検査を通す**

```bash
cd /home/vscode/tasuki-work
corepack pnpm --filter @tasuki/timer-core typecheck
```

期待: エラー 0 件。

- [ ] **Step 9: コミット**

```bash
git add packages/timer-core/src/problem.ts packages/timer-core/test/problem.test.ts packages/timer-core/test/problem.golden.test.ts
git commit -m "refactor: pickFallback へ now を引数注入する（#166）

- 憲法 原則 VI / docs/timer/adr/0002 / docs/adr/0016 決定 2 項目 4 に従い
  ドメインから Date.now() を除去した
- 既定値は置かない。配線漏れを本番側では typecheck が落とす
- ?? FALLBACK_PROBLEMS[0] を削除。有効な now では死んだ枝であり、
  残すと now の渡し忘れ（NaN）を黙って飲み込む
- ゴールデン値 21 件が変更前と同じ結果を返すことで振る舞い不変を示した"
```

**注: この時点で `apps/` はまだ壊れている**（呼び出し側が第 3 引数を渡していない）。Task 3・4 で直す。CI へ push するのは Task 4 の後。

---

## Task 3: timer-sync の配線（`Clock` ポートを生かす）

**Files:**
- Modify: `apps/timer-sync/src/application/problem-delegation.ts`（`:78-103` のクラス定義とコンストラクタ、`:115` `:234` `:279` の呼び出し）
- Create: `apps/timer-sync/test/problem-delegation.clock.test.ts`

**Interfaces:**
- Consumes: `pickFallback(language, difficulty, now)`（Task 2）、既存の `Clock` ポート（`apps/timer-sync/src/ports/clock.ts` の `interface Clock { now(): number }`）
- Produces: なし（内部配線のみ）

**背景:** `ProblemDelegatorDeps.clock`（`:45`）は**必須で宣言されているのにコンストラクタが保持していない**死んだ依存である。`clock` という語はこのファイルの import と型宣言の 2 箇所にしかない。E3 が初めて仕事を与える。

- [ ] **Step 1: 配線テストを先に書く（まだ失敗する）**

`apps/timer-sync/test/problem-delegation.clock.test.ts` を新規作成。

**先に既存テストの組み立てを読むこと**（`apps/timer-sync/test/problem-delegation.test.ts:100-120` 付近）。`store` / `clock` / `broadcaster` / `testLogger` / `testRefEncoder` の作り方をそのまま踏襲し、**模写せず既存のヘルパがあればそれを使う**。

```typescript
/**
 * `ProblemDelegator` が定型お題の選択を `Clock` ポート経由で行うことを見る（#166 / #72 E3）。
 *
 * **`this.clock` を消したら赤くなること**がこのファイルの要件である。
 * 3 つの経路それぞれで `pickFallback` が呼ばれるので、3 つとも押さえる。
 */
import { describe, it, expect } from "vitest";
import { pickFallback } from "@tasuki/timer-core";

// 固定時刻。0 を使うと「渡し忘れて undefined→NaN」との区別が付きにくいので避ける。
const FIXED_NOW = 7;

describe("ProblemDelegator: 定型お題の選択が Clock ポートを通る", () => {
  it("problemMode=fallback の即時確定で、clock.now() に対応するお題が確定する", () => {
    // Given: clock.now() が FIXED_NOW を返す構成で delegator を組む
    //   （既存テストと同じ組み立て。room の problemMode を "fallback" にする）
    // When: delegator.request(roomCode, requestId) を呼ぶ
    // Then: broadcaster が受け取ったお題の title が
    expect(pickFallback(/* room の language */ "TypeScript", /* difficulty */ "easy", FIXED_NOW).problem.title)
      // と一致する
      .toBeTruthy();
  });
});
```

**この骨格をそのまま書かない。** 既存の `problem-delegation.test.ts` を読み、実際に `broadcaster` が受け取った値を検証する形へ具体化すること。検証したいのは「確定したお題が `pickFallback(lang, diff, FIXED_NOW)` と一致する」ことである。3 件書く:

| # | 経路 | 起こし方 |
|---|---|---|
| 1 | `problemMode === "fallback"` で即確定（`:115`） | `room.problemMode = "fallback"` にして `request()` |
| 2 | `validateProblem` 失敗で定型へ縮退（`:234`） | 代表が不正な JSON を `submit()` する |
| 3 | 候補を使い切って定型で確定（`:279`） | 候補を空にして `request()`、または deadline を経過させる |

**期待値に `Math.abs(FIXED_NOW) % len` を書かない。** `pickFallback(lang, diff, FIXED_NOW)` を呼んで比べる（実装の写経を避ける）。

- [ ] **Step 2: テストを走らせて失敗することを確認する**

```bash
cd /home/vscode/tasuki-work/apps/timer-sync
corepack pnpm exec vitest run test/problem-delegation.clock.test.ts
```

期待: 型エラーまたは実行時エラーで FAIL（`pickFallback` の呼び出しが第 3 引数を欠いているため）。

- [ ] **Step 3: `this.clock` を保持して 3 箇所を配線する**

`apps/timer-sync/src/application/problem-delegation.ts` を 3 段階で編集する。

(a) クラスのフィールド宣言（`private readonly store: RoomStore;` の直後）に追加:

```typescript
  /** 定型お題の選択に使う時刻源（#166 / #72 E3 で初めて実際に使われるようになった） */
  private readonly clock: Clock;
```

(b) コンストラクタ（`:93`）の `this.store = deps.store;` の直後に追加:

```typescript
    this.clock = deps.clock;
```

(c) 3 箇所の呼び出しへ `this.clock.now()` を渡す:

```typescript
// :115 付近
const fb = pickFallback(room.config.language, room.config.difficulty, this.clock.now());

// :234 付近
: pickFallback(room.config.language, room.config.difficulty, this.clock.now()).problem;

// :279 付近
const fb = pickFallback(room.config.language, room.config.difficulty, this.clock.now());
```

- [ ] **Step 4: テストを走らせて緑になることを確認する**

```bash
cd /home/vscode/tasuki-work/apps/timer-sync
corepack pnpm exec vitest run
```

期待: 新しい 3 件を含め全件 PASS。

- [ ] **Step 5: 配線が効いていることを破壊検証する**

`this.clock.now()` を 3 箇所とも定数 `0` へ書き換える。

```bash
grep -c "this.clock.now()" src/application/problem-delegation.ts   # 書き換え前に 3 であることを確認
# 3 箇所を 0 に書き換える
grep -c "this.clock.now()" src/application/problem-delegation.ts   # 書き換え後に 0 であることを確認
corepack pnpm exec vitest run test/problem-delegation.clock.test.ts
```

期待: 3 件とも FAIL。確認したら書き戻し、再度緑を確認する。

- [ ] **Step 6: 型検査を通す**

```bash
cd /home/vscode/tasuki-work
corepack pnpm --filter @tasuki/timer-sync typecheck
```

期待: エラー 0 件。

- [ ] **Step 7: コミット**

```bash
git add apps/timer-sync/src/application/problem-delegation.ts apps/timer-sync/test/problem-delegation.clock.test.ts
git commit -m "refactor: timer-sync の定型お題選択を Clock ポートへ配線する（#166）

- ProblemDelegatorDeps.clock は必須で宣言されながらコンストラクタが
  保持しておらず、渡された値が捨てられていた。初めて実際に使う
- pickFallback の 3 箇所（即時確定・検証失敗の縮退・候補使い切り）を配線
- 3 経路それぞれに、this.clock を消したら赤くなるテストを足した"
```

---

## Task 4: timer-web の配線（アダプタ境界での `Date.now()`）

**Files:**
- Modify: `apps/timer-web/src/ai/no-ai.ts:10-14`

**Interfaces:**
- Consumes: `pickFallback(language, difficulty, now)`（Task 2）
- Produces: なし

**背景:** `apps/timer-web/src/ai/provider.ts` は自身の docstring で `ProblemProvider` を「ポート」と呼んでおり、`NoAiProvider` はそのアダプタである。憲法 原則 VI がいう「副作用を置く境界」がここなので、`Date.now()` の直呼びは規範に反しない。timer-web は既に `App.tsx:214` `:226`、`sync/client.ts`、`ui/use-now-tick.ts` で `Date.now()` を素で呼んでおり一貫する。

**このアダプタに決定論テストは書かない**（書けない）。守るのは型だけである。

- [ ] **Step 1: `no-ai.ts` を書き換える**

```typescript
/**
 * NoAiProvider — AI なしで定型お題のみ返す
 * T025: FR-024
 */

import { pickFallback } from "@tasuki/timer-core/problem";
import type { ProblemWithSource } from "@tasuki/timer-core/problem";
import type { ProblemProvider } from "./provider.js";

export class NoAiProvider implements ProblemProvider {
  async generate(language: string, difficulty: string): Promise<ProblemWithSource> {
    // ここが時刻の境界である。`ProblemProvider` はポートで、この class はそのアダプタなので
    // 実時刻の読み取りはここに置く（憲法 原則 VI・#166 / #72 E3）。
    // ドメイン（`pickFallback`）は値だけを受け取り、`Date.now()` を呼ばない。
    return pickFallback(language, difficulty, Date.now());
  }
}
```

`apps/timer-web/src/App.tsx` は**変更しない**（`resolveProvider()` は `new NoAiProvider()` のまま）。

- [ ] **Step 2: 型検査を通す**

```bash
cd /home/vscode/tasuki-work
corepack pnpm --filter @tasuki/timer-web typecheck
```

期待: エラー 0 件。**`apps/timer-web/tsconfig.json` は `test/**/*` も含むので、テスト側の呼び出し漏れもここで落ちる**（timer-core・timer-sync はテストを型検査していないので、この保証は timer-web だけ）。

- [ ] **Step 3: 全パッケージのテストを走らせる**

```bash
cd /home/vscode/tasuki-work
corepack pnpm test -- --force
```

期待: 全タスク PASS。**`--force` を付けて出力に `0 cached` が出ていることを確認する**（turbo は既定でキャッシュに当たり 1.5 秒で「緑」を出す）。

- [ ] **Step 4: コミット**

```bash
git add apps/timer-web/src/ai/no-ai.ts
git commit -m "refactor: timer-web の定型お題選択をアダプタ境界へ寄せる（#166）

- NoAiProvider は ProblemProvider ポートのアダプタなので、
  実時刻の読み取りはここに置く（憲法 原則 VI）
- App.tsx は変更しない
- これで pickFallback の本番呼び出し 4 箇所すべてが配線された"
```

---

## Task 5: 機械検査の新設

**Files:**
- Create: `scripts/audit-domain-side-effects.mjs`
- Create: `scripts/audit-domain-side-effects.test.mjs`

**Interfaces:**
- Consumes: `scripts/lib/scan-targets.mjs` の `listWorkspacePackages` / `diffTargets` / `hasTargetDrift` / `findMissingPaths` / `findEmptyScanDimensions` / `formatTargetDiff`
- Produces: `DOMAIN_PACKAGES` / `EXCLUDED_PACKAGES` / `FORBIDDEN` / `findForbiddenCalls(text, path)`（自己テストが import する）

**なぜここか:** Task 2〜4 でコードが規範に沿ったので、この検査は**置いた時点で緑になる**。先に置いて赤を見る順は魅力的だが、赤いコミットを履歴に残して bisect を濁す（#165 で `audit-log-hygiene` を赤にしたまま 5 コミットが通過した）。検査が働く証拠は Task 8 の破壊検証で取る。

- [ ] **Step 1: 検査本体を書く**

`scripts/audit-domain-side-effects.mjs` を新規作成:

```javascript
#!/usr/bin/env node
/**
 * ドメインが環境から直接値を読んでいないかを見る検査
 * （`docs/adr/0016` 決定 2 項目 4 が #72 E3 へ割り当てた機械検査）。
 *
 * ## 何を見るか
 *
 * 宣言したドメインパッケージ（{@link DOMAIN_PACKAGES}）の `src/` 配下の `.ts` に、
 * {@link FORBIDDEN} の語が**字面として 1 つも現れない**ことだけを見る。
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **計算プロパティ・別名束縛はすり抜ける。** `globalThis["Date"].now()`、
 *   `const D = Date; D.now()`、`const { now } = Date; now()` はいずれも
 *   禁止語彙の字面を持たない。この検査は純粋性を見ていないので
 *   `audit-domain-purity` とは名乗らない。
 * - **宣言したパッケージの外は一切見ない。** `apps/` と `packages/rate-limit` ・
 *   `packages/ui` ・ `packages/protocol` は対象外（下の除外理由を参照）。
 * - **`test/` は見ない。** ドメインのテストが `Date.now()` を使うのは禁じられていない。
 *
 * ## コメント行の扱い — **読み飛ばさない**
 *
 * これは「**無いこと**」を求める検査なので、読み飛ばすと緑に倒れる。
 * `audit-domain-error-shape.mjs` と同じ向きに倒す。コメントを剥がすには
 * 手書きの字句解析が要り、文字列リテラル中の `//`・正規表現リテラル・
 * 入れ子のブロックコメントで穴が出る。**穴はそのまま見逃し（緑）になる。**
 *
 * 代償として、宣言したパッケージの docstring に禁止語彙を書けない
 * （「現在時刻」「実時刻」と書く）。2026-08-18 時点で該当は 0 件。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listWorkspacePackages,
  diffTargets,
  hasTargetDrift,
  findMissingPaths,
  findEmptyScanDimensions,
  formatTargetDiff,
} from "./lib/scan-targets.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 走査するドメインパッケージ。
 *
 * **`packages/` を readdir して `-core` で終わるものを拾う導出にしてはならない**
 * （`docs/adr/0014` 決定 3 の MUST NOT。pnpm の解決規則の自作再実装にあたる）。
 * サフィックス導出は `packages/timer-domain` のような名前のコアを黙って取りこぼすが、
 * 宣言＋全単射照合はパッケージが増えた時点で赤くなり、書いた人に判断を強制する。
 */
export const DOMAIN_PACKAGES = ["packages/poker-core", "packages/timer-core"];

/** 走査から外すパッケージ。**理由が要る。** 実在しなくなったら落ちる（ADR-0014 決定 2）。 */
export const EXCLUDED_PACKAGES = [
  { pkg: "apps/landing", reason: "アプリ層。副作用を置いてよい境界" },
  { pkg: "apps/poker-sync", reason: "アプリ層。時刻は MonotonicClock ポートのアダプタが読む" },
  { pkg: "apps/poker-web", reason: "アプリ層。副作用を置いてよい境界" },
  { pkg: "apps/timer-sync", reason: "アプリ層。時刻は Clock ポートのアダプタが読む" },
  { pkg: "apps/timer-web", reason: "アプリ層。NoAiProvider は ProblemProvider ポートのアダプタ" },
  { pkg: "e2e", reason: "テストコード。ドメインではない" },
  { pkg: "packages/protocol", reason: "WS メッセージの型定義のみ。ドメインの判断を持たない" },
  { pkg: "packages/rate-limit", reason: "node 専用の共有ユーティリティ。docs/guides/architecture.md の層対応表でドメインと別の行に置かれている" },
  { pkg: "packages/ui", reason: "CSS トークンと書体のみ。TS を 1 つも持たない" },
];

/**
 * 禁止語彙。**ADR-0016 決定 2 項目 4 の逐語（`Date.now()` / `Math.random()`）より広い。**
 *
 * 2 語だけにすると `new Date().getTime()` や `crypto.randomUUID()` がすり抜け、
 * 対策が自分の塞ぐ欠陥と同じ欠陥を持つことになる。射程を広げたぶんは
 * `docs/adr/0016` の追記で規範側と一致させてある。
 *
 * `new Date(` は引数の有無で分けない（分けると字句解析が要る）。過剰検出側へ倒す。
 */
export const FORBIDDEN = [
  "Date.now(",
  "Math.random(",
  "new Date(",
  "performance.now(",
  "crypto.",
  "process.env",
];

/**
 * 本文から禁止語彙の出現を拾う。**状態を持たない純粋関数。**
 *
 * コメント行も読む（このファイル冒頭の「コメント行の扱い」を参照）。
 *
 * @param {string} text ファイル本文
 * @param {string} filePath 報告に使うリポジトリ相対パス
 * @returns {Array<{ path: string, line: number, token: string }>} 行番号は 1 始まり
 */
export function findForbiddenCalls(text, filePath) {
  const found = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const token of FORBIDDEN) {
      if (lines[i].includes(token)) {
        found.push({ path: filePath, line: i + 1, token });
      }
    }
  }
  return found;
}

/** ディレクトリ配下の `.ts` を再帰的に集める（リポジトリ相対パス → 本文）。 */
function readTsFiles(relDir) {
  const collected = new Map();
  const walk = (abs) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const child = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        walk(child);
      } else if (entry.name.endsWith(".ts")) {
        collected.set(path.relative(REPO_ROOT, child), fs.readFileSync(child, "utf8"));
      }
    }
  };
  const absDir = path.join(REPO_ROOT, relDir);
  if (fs.existsSync(absDir)) walk(absDir);
  return collected;
}

function main() {
  // 宣言が workspace の実体とずれていないかを最初に見る（ADR-0014 決定 1）。
  const packages = listWorkspacePackages(REPO_ROOT);
  const declared = [...DOMAIN_PACKAGES, ...EXCLUDED_PACKAGES.map((e) => e.pkg)];
  const drift = diffTargets(declared, packages);

  // 宣言から導出した走査ディレクトリの実在を見る（#158・ADR-0014 決定 1）。
  // 全単射照合はパッケージ名しか見ないので、src/ が改名・消失しても照合は通ってしまう。
  const derivedDirs = DOMAIN_PACKAGES.map((pkg) => `${pkg}/src`);
  const missingDirs = findMissingPaths(REPO_ROOT, derivedDirs);

  // **走査対象はここで 1 回だけ確定させる**（ADR-0014 決定 9）。
  // 走査量の算出も実走査もこの scanDirs から導出し、書き分けない。
  const scanDirs = derivedDirs.filter((dir) => !missingDirs.includes(dir));
  const scanned = new Map();
  for (const dir of scanDirs) {
    for (const [rel, text] of readTsFiles(dir)) scanned.set(rel, text);
  }
  const summary = `${scanDirs.length} パッケージ / ${scanned.size} ファイル`;

  // 宣言のずれと導出先の不在は、どちらも計測器の故障なので同じ形で出す。
  if (hasTargetDrift(drift) || missingDirs.length > 0) {
    const merged = {
      missing: [...drift.missing, ...missingDirs].sort(),
      unexpected: drift.unexpected,
    };
    console.error(formatTargetDiff("audit-domain-side-effects", merged, summary));
    process.exit(1);
  }

  // 走査量は成否によらず必ず出す（ADR-0014 決定 6）。
  console.log(`[audit-domain-side-effects] 走査対象: ${summary}`);

  // 走査量のどの内訳も 0 件でないことを見る（ADR-0014 決定 8）。
  // 数えるのは宣言の行数ではなく、実在確認を通った走査対象そのもの。
  const emptyDimensions = findEmptyScanDimensions([
    { label: "パッケージ", count: scanDirs.length },
    { label: "ファイル", count: scanned.size },
  ]);
  if (emptyDimensions.length > 0) {
    console.error(
      `[audit-domain-side-effects] 走査対象が 0 件です（${emptyDimensions.join(" / ")}）。検査が空振りしています`,
    );
    process.exit(1);
  }

  const problems = [];
  for (const [rel, text] of scanned) {
    problems.push(...findForbiddenCalls(text, rel));
  }

  if (problems.length > 0) {
    console.error(
      `[audit-domain-side-effects] ドメイン内で環境から直接値を読んでいます（${problems.length} 件）`,
    );
    for (const p of problems) {
      console.error(`  ${p.path}:${p.line}  ${p.token}`);
    }
    console.error(
      "  時刻・乱数・環境変数は引数で注入し、読み取りはアダプタ（境界）に置いてください",
    );
    console.error("  根拠: 憲法 原則 VI / docs/adr/0016 決定 2 項目 4 / docs/timer/adr/0002");
    process.exit(1);
  }

  console.log("[audit-domain-side-effects] OK（禁止語彙 0 件）");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

**`main()` の起動条件は既存 4 本と揃えること。** `scripts/audit-domain-error-shape.mjs` の末尾を読み、同じ書き方にする（自己テストが import したときに `main()` が走らないようにするため）。

- [ ] **Step 2: 検査を走らせて緑になることを確認する（対照実行）**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-domain-side-effects.mjs
echo "終了コード: $?"
```

期待:
```
[audit-domain-side-effects] 走査対象: 2 パッケージ / N ファイル
[audit-domain-side-effects] OK（禁止語彙 0 件）
終了コード: 0
```

**緑にならなかったら Task 2〜4 が未完了か、禁止語彙が既存コードに当たっている。** 後者なら当たった箇所を報告し、`FORBIDDEN` を勝手に狭めないこと。

- [ ] **Step 3: 自己テストを書く**

`scripts/audit-domain-side-effects.test.mjs` を新規作成:

```javascript
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DOMAIN_PACKAGES,
  EXCLUDED_PACKAGES,
  FORBIDDEN,
  findForbiddenCalls,
} from "./audit-domain-side-effects.mjs";

describe("findForbiddenCalls: 禁止語彙を拾う", () => {
  test("禁止語彙 6 つをそれぞれ拾う", () => {
    // Given / When / Then（宣言した語を 1 つずつ、その語だけの本文で確かめる）
    for (const token of FORBIDDEN) {
      const found = findForbiddenCalls(`const x = ${token});`, "a.ts");
      assert.equal(found.length, 1, `${token} を拾えていない`);
      assert.equal(found[0].token, token);
    }
  });

  test("行番号は 1 始まりで、実際の行を指す", () => {
    // Given
    const src = ["const a = 1;", "const b = 2;", "const c = Date.now();"].join("\n");
    // When
    const found = findForbiddenCalls(src, "a.ts");
    // Then
    assert.equal(found.length, 1);
    assert.equal(found[0].line, 3);
    assert.equal(found[0].path, "a.ts");
  });

  test("**コメント行も拾う**（無いことを求める検査なので読み飛ばさない）", () => {
    // Given: 行コメント・ブロックコメント・docstring の 3 形
    const src = [
      "// Date.now() を呼ばないこと",
      "/* Math.random() も同様 */",
      "/** `new Date(` も拾う */",
    ].join("\n");
    // When
    const found = findForbiddenCalls(src, "a.ts");
    // Then
    assert.equal(found.length, 3);
  });

  test("禁止語彙が無ければ 0 件", () => {
    // Given / When
    const found = findForbiddenCalls("const now = deps.clock.now();\n", "a.ts");
    // Then
    assert.deepEqual(found, []);
  });

  test("同じ行に 2 語あれば 2 件返す", () => {
    // Given
    const src = "const x = Date.now() + Math.random();";
    // When / Then
    assert.equal(findForbiddenCalls(src, "a.ts").length, 2);
  });
});

describe("宣言: 走査対象と除外", () => {
  test("ドメインパッケージの宣言は非空", () => {
    assert.ok(DOMAIN_PACKAGES.length > 0);
  });

  test("除外にはすべて理由がある（ADR-0014 決定 2）", () => {
    for (const e of EXCLUDED_PACKAGES) {
      assert.ok(typeof e.pkg === "string" && e.pkg.length > 0);
      assert.ok(typeof e.reason === "string" && e.reason.length > 0, `${e.pkg} に理由が無い`);
    }
  });

  test("宣言と除外は重ならない", () => {
    const excluded = new Set(EXCLUDED_PACKAGES.map((e) => e.pkg));
    for (const pkg of DOMAIN_PACKAGES) {
      assert.ok(!excluded.has(pkg), `${pkg} が走査対象と除外の両方にある`);
    }
  });
});
```

- [ ] **Step 4: 自己テストを走らせる**

```bash
cd /home/vscode/tasuki-work
node --test scripts/audit-domain-side-effects.test.mjs
```

期待: 全件 PASS。**CI への登録は不要**（`node scripts/list-scan-targets.mjs script-tests` が `git ls-files` から導出するので、`git add` すれば自動で走る）。

- [ ] **Step 5: 導出に乗ったことを確認する**

```bash
git add scripts/audit-domain-side-effects.mjs scripts/audit-domain-side-effects.test.mjs
node scripts/list-scan-targets.mjs script-tests | tr ' ' '\n' | grep domain-side-effects
```

期待: `scripts/audit-domain-side-effects.test.mjs` が出力に含まれる。**出なければ `git add` を忘れている**（導出は追跡下のファイルしか見ない）。

- [ ] **Step 6: コミット**

```bash
git commit -m "test: ドメインの副作用を見る機械検査を追加する（#166）

- docs/adr/0016 決定 2 項目 4 が #72 E3 へ割り当てた検査
- 走査対象は宣言し、workspace の実体と全単射で照合する（ADR-0014 決定 1）
- 実体の権威は listWorkspacePackages。readdir によるサフィックス導出は使わない
  （ADR-0014 決定 3 の MUST NOT）
- 走査量を常に出力し、内訳のどれかが 0 件なら落とす（決定 6・決定 8）
- コメント行も読む。無いことを求める検査は読み飛ばすと緑に倒れる"
```

---

## Task 6: 導出ガード（列挙の腐りを止める）

**Files:**
- Modify: `scripts/scan-target-wiring.test.mjs`（末尾へ追加）

**Interfaces:**
- Consumes: 同ファイル既存の `runScriptCopy(scriptName, mutate)` / `SCRIPTS_DIR`、`scripts/lib/scan-targets.mjs` の `listTrackedFiles`
- Produces: なし

**背景:** このファイルは検査スクリプトごとに `describe` を手書きで列挙している（実測 **6 ブロック / 5 スクリプト**。`audit-structure.mjs` が 0 件ガードと実在確認で 2 つ持ち、1 つは `audit-*` ではない `check-links.mjs`）。`audit-*.mjs` の実体は Task 5 の追加で 5 本になった。次に検査を足す人は黙って登録を漏らせる。

- [ ] **Step 1: 導出ガードを書く**

`scripts/scan-target-wiring.test.mjs` の**末尾**に追加。冒頭の import へ `listTrackedFiles` を足す（`REPO_ROOT` が未定義なら `path.resolve(SCRIPTS_DIR, "..")` で作る）。

```javascript
/**
 * **列挙ではなく導出で見るガード**（#166 / #72 E3）。
 *
 * 上の describe は検査スクリプトごとに手書きで列挙している。列挙は腐るので、
 * 「すべての検査が走査量を名乗る」ことだけは導出で押さえる。新しい検査を足した人が
 * 登録を漏らしても、ここが赤くなる。
 *
 * 権威は `git ls-files`。`fs.readdirSync` は未追跡ファイルを拾い、ローカルと CI で
 * 見えるものが食い違う（`docs/adr/0014` 決定 5）。
 *
 * **`scripts/list-scan-targets.mjs` の KINDS には足していない。** 同モジュールの除外は
 * `rel.startsWith(prefix)` の前方一致しか持たず、`.test.mjs` の後方一致を表現できない。
 * `git ls-files 'scripts/audit-*.mjs'` は自己テストを含む 8 件に一致する（2026-08-18 実測）。
 *
 * `runScriptCopy` が作る複製は `.wiring-` 接頭辞なので、追跡下にも `audit-*` の一致にも
 * 入らない。複製が自分自身を走査対象として拾う経路は無い。
 */
describe("走査量の出力: すべての audit-*.mjs が名乗る（導出で見る）", () => {
  const AUDITS = listTrackedFiles(REPO_ROOT, ["scripts/audit-*.mjs"])
    .map((rel) => path.basename(rel))
    .filter((name) => !name.endsWith(".test.mjs"));

  test("走査対象の検査スクリプトが 0 件でない（このガード自身の空振り検出）", () => {
    // 下限は「非空」だけにする。`>= 5` のような固定値は ADR-0014 決定 8 の MUST NOT。
    assert.ok(AUDITS.length > 0, "audit-*.mjs が 0 件（このガードが空振りしている）");
  });

  for (const name of AUDITS) {
    test(`${name} は走査量を出力する（ADR-0014 決定 6）`, () => {
      // Given / When（恒等関数なので対照実行）
      const r = runScriptCopy(name, (s) => s);
      // Then
      assert.match(r.stdout, /走査対象: /, `${name} が走査量を名乗っていない`);
    });
  }
});
```

- [ ] **Step 2: テストを走らせて緑になることを確認する（対照実行）**

```bash
cd /home/vscode/tasuki-work
node --test scripts/scan-target-wiring.test.mjs
```

期待: 全件 PASS。新しい 6 件（0 件ガード 1 ＋ 検査 5 本）が増えている。

- [ ] **Step 3: 導出が実際に 5 本を拾っているか確認する**

```bash
git ls-files 'scripts/audit-*.mjs' | grep -v '\.test\.mjs' | wc -l
```

期待: `5`。**5 でなければ Task 5 の `git add` が漏れている。**

- [ ] **Step 4: ガードが効いていることを破壊検証する**

`scripts/audit-domain-side-effects.mjs` の走査量出力行を一時的に潰す。

```bash
sed -i 's|console.log(`\[audit-domain-side-effects\] 走査対象: ${summary}`);|// 潰した|' scripts/audit-domain-side-effects.mjs
grep -c "走査対象: \${summary}" scripts/audit-domain-side-effects.mjs   # 0 であることを先に確認
node --test scripts/scan-target-wiring.test.mjs
```

期待: `audit-domain-side-effects.mjs は走査量を出力する` が FAIL。確認したら `git checkout scripts/audit-domain-side-effects.mjs` で戻し、再度緑を確認する。

- [ ] **Step 5: コミット**

```bash
git add scripts/scan-target-wiring.test.mjs
git commit -m "test: 検査が走査量を名乗ることを導出で見るガードを足す（#166）

- describe の手書き列挙は腐る。6 本目を足す人が登録を漏らせた
- 権威は git ls-files。readdirSync は未追跡を拾い CI と食い違う（ADR-0014 決定 5）
- 下限は非空のみ。固定値の下限は ADR-0014 決定 8 の MUST NOT"
```

---

## Task 7: 外部配線と規範の更新

**Files:**
- Modify: `.github/workflows/ci.yml`（`audit-domain-error-shape` のステップ直後）
- Modify: `AGENTS.md:48` の直後
- Modify: `docs/guides/development.md:378` の直後、および `:475` 付近
- Modify: `docs/adr/0016-core-domain-representation.md`（末尾へ追記）

**Interfaces:**
- Consumes: `scripts/audit-domain-side-effects.mjs`（Task 5）
- Produces: なし

- [ ] **Step 1: CI へ登録する**

`.github/workflows/ci.yml` の `audit-domain-error-shape` のステップ（`:224` 付近）の直後に追加。**`if:` の条件を既存ステップと同じにすること。**

```yaml
      # ドメインの副作用。core が環境から直接値を読んでいないことを見る
      # （ADR 0016 決定 2 項目 4 が #72 E3 へ割り当てた機械検査・#166）。
      - run: node scripts/audit-domain-side-effects.mjs
        if: steps.scope.outputs.code == 'true'
```

- [ ] **Step 2: `AGENTS.md` の一覧へ足す**

`AGENTS.md:48`（`audit-domain-error-shape` の行）の直後に追加:

```markdown
- `node scripts/audit-domain-side-effects.mjs` — ドメインの副作用（core が環境から直接値を読まない）
```

- [ ] **Step 3: `docs/guides/development.md` の一覧へ足す**

`:378`（`audit-domain-error-shape` の行）の直後、同じコードブロック内に追加。**列の位置を既存行と揃える。**

```
node scripts/audit-domain-side-effects.mjs       # ドメインの副作用（core が Date.now() 等を直接呼ばないか。ADR-0016 決定 2 項目 4）
```

- [ ] **Step 4: `docs/guides/development.md` へ説明節を足す**

`:475` 付近（`audit-domain-error-shape` の説明段落の直後、「shellcheck・自己テスト…」の段落の**前**）に追加:

```markdown
**ドメインが環境から値を直読みしたら検査が赤くなります。**
`scripts/audit-domain-side-effects.mjs` は `DOMAIN_PACKAGES` として宣言した core の
`src/` に、`Date.now(` / `Math.random(` / `new Date(` / `performance.now(` / `crypto.` /
`process.env` が字面として現れないことを見ます
（[`docs/adr/0016`](../adr/0016-core-domain-representation.md) 決定 2 項目 4）。
**コメント行も読みます** — 「無いこと」を求める検査は読み飛ばすと緑に倒れるためで、
core の docstring にこれらの語を書くこともできません（「現在時刻」等と書いてください）。
時刻・乱数・環境変数は引数で注入し、読み取りはアダプタ（境界）へ置きます。

**この検査は「足りる」とは言いません。** `globalThis["Date"].now()` のような
計算プロパティや `const D = Date; D.now()` のような別名束縛はすり抜けます。
純粋性を見ているのではなく、字面を見ているだけです。
```

- [ ] **Step 5: `docs/adr/0016` へ追記する**

`docs/adr/0016-core-domain-representation.md` の**末尾**へ追加（既存の「## 追記（2026-08-18・#165 / #72 E2）」節の後ろ）:

```markdown
## 追記（2026-08-18・#166 / #72 E3）

決定 2 の項目 4 について、E3 に割り当てた機械検査を
`scripts/audit-domain-side-effects.mjs` として置いた。CI の `quality` ジョブで走る。
`packages/timer-core/src/problem.ts:70` の `Date.now()` は引数注入へ替えて解消した。

**検査が見る語彙は、項目 4 の逐語（`Date.now()` / `Math.random()`）より広い。**
`new Date(` / `performance.now(` / `crypto.` / `process.env` を加えた 6 語である。
逐語の 2 語だけにすると `new Date().getTime()` や `crypto.randomUUID()` が
すり抜け、**対策が自分の塞ぐ欠陥と同じ欠陥を持つ**ことになる。

**項目 4 の趣旨は「ドメインが環境から直接値を読まない」ことであり、
検査の射程はこの趣旨に合わせてある。** 決定の文面（MUST NOT の対象）を
2 語から 6 語へ読み替えること。宣言した 2 パッケージ
（`packages/poker-core` `packages/timer-core`）は 2026-08-18 時点で 6 語すべて 0 件である。
```

- [ ] **Step 6: リンク検査を走らせる**

```bash
cd /home/vscode/tasuki-work
git add -A
node scripts/check-links.mjs
```

期待: `リンク検査 OK`。

- [ ] **Step 7: CI の登録が効いているか確認する**

```bash
grep -c "audit-domain-side-effects" .github/workflows/ci.yml AGENTS.md docs/guides/development.md docs/adr/0016-core-domain-representation.md
```

期待: 4 ファイルすべてで 1 以上。**0 のファイルがあれば登録漏れ。**

- [ ] **Step 8: コミット**

```bash
git commit -m "docs: ドメイン副作用検査を CI と規範へ登録する（#166）

- ci.yml の quality ジョブへ 1 ステップ
- AGENTS.md / docs/guides/development.md の検査一覧と説明節
- docs/adr/0016 へ追記し、検査の語彙（6 語）を規範側と一致させる
- 決定 2 項目 4 の逐語は 2 語だが、new Date().getTime() 等の抜け道を塞ぐため広げた"
```

---

## Task 8: 破壊検証・全体確認・申し送りの起票

**Files:**
- 変更なし（検証のみ）。ただし Issue を 3 件起票する

**Interfaces:**
- Consumes: Task 1〜7 のすべて

- [ ] **Step 1: 対照実行（何も壊さずに緑を確認する）**

**壊す前に緑を見ていない破壊検証は何も証明しない**（変異検査がテストを 1 件も走らせずに全件「検出」していた事例がある）。

```bash
cd /home/vscode/tasuki-work
corepack pnpm test -- --force              # 出力に "0 cached" が出ることを確認
node scripts/audit-structure.mjs
node scripts/audit-log-hygiene.mjs
node scripts/audit-assembly-wiring.mjs
node scripts/audit-domain-error-shape.mjs
node scripts/audit-domain-side-effects.mjs
node scripts/check-links.mjs
node --test $(node scripts/list-scan-targets.mjs script-tests)
```

期待: すべて終了コード 0。

- [ ] **Step 2: 破壊検証（6 項目）**

各項目で「**壊れたことを `grep -c` で先に確認 → 赤を見る → 戻す**」の順を守る。結果を PR 本文へ書けるよう記録する。

| # | 壊すもの | 期待 |
|---|---|---|
| 1 | `packages/timer-core/src/problem.ts` の `Math.abs(now)` を `Math.abs(Date.now())` に戻す | `audit-domain-side-effects` が赤 |
| 2 | 禁止語彙 6 つを `packages/timer-core/src/problem.ts` のコメントへ 1 行ずつ書く | 6 回とも赤 |
| 3 | `DOMAIN_PACKAGES` から `packages/timer-core` を消す | 全単射照合が赤 |
| 4 | `DOMAIN_PACKAGES` へ `packages/nonexistent-core` を足す | 全単射照合が赤 |
| 5 | `problem.test.ts:119` の第 3 引数を落とす | `TypeError` で赤（`??` を消した効果） |
| 6 | `problem-delegation.ts` の `this.clock.now()` 3 箇所を `0` にする | Task 3 の配線テスト 3 件が赤 |

項目 1 の手順例:

```bash
sed -i 's|Math.abs(now) % candidates.length|Math.abs(Date.now()) % candidates.length|' packages/timer-core/src/problem.ts
grep -c "Math.abs(Date.now())" packages/timer-core/src/problem.ts   # 1 であることを先に確認
node scripts/audit-domain-side-effects.mjs; echo "終了コード: $?"    # 1 であること
git checkout packages/timer-core/src/problem.ts
node scripts/audit-domain-side-effects.mjs; echo "終了コード: $?"    # 0 に戻ること
```

- [ ] **Step 3: 変異検査を走らせる**

```bash
cd /home/vscode/tasuki-work
git status --short          # 空であること（汚れていると変異検査は実行できない）
node scripts/mutation-check.mjs
```

期待: 全件「検出」。

**`scripts/` 配下は変異対象にならない**（`detectRunner()` が `<pkg>/package.json` を要求するが `scripts/` には無い）。これは E1 からの既知の繰り越しで、本 PR では Step 2 の手動変異で代替する。**PR 本文にそう明記すること。**

- [ ] **Step 4: E2E を走らせる**

```bash
cd /home/vscode/tasuki-work
corepack pnpm e2e
```

期待: 全件 PASS。**振る舞い不変なので E2E の内容は変えない。**

`pnpm dev` が動いていると 8787 / 3311 を奪い合って落ちる。先に `ss -tlnp | grep -E ':(8787|3311|517[3-5])'` で確認する。

- [ ] **Step 5: 実経路確認（DoD 項目 5）**

```bash
cd /home/vscode/tasuki-work
ss -tlnp | grep -E ':(8787|3311|517[3-5])'   # 古いプロセスが居ないことを先に確認
corepack pnpm dev
```

<http://localhost:5175/> を開き、timer の共有ルームを作って定型お題が表示されることを目視する。**起動ログを見ること**（同期サーバーが落ちていても画面は開けてしまい、ルームを作ろうとして初めて気づく）。

**確認が終わったら必ず `pnpm dev` を止めてポートを解放する**（起動しっぱなしで利用者の `pnpm dev` を全滅させた前例がある）。

- [ ] **Step 6: 申し送りを Issue として起票する**

**宛先の無い宿題を作らない。** 3 件とも起票し、PR 本文から参照する。

1. **timer-core / timer-sync のテストが型検査の射程外**
   - `packages/timer-core/tsconfig.json` は `"exclude": [..., "test"]`、`apps/timer-sync/tsconfig.json` は `"include": ["src/**/*"]`
   - 射程へ入れるには `rootDir: ./src` を外す構成変更が要り、**E3 と無関係な既存の型エラーが 10 件 / 6 ファイル**出る（`aggregate` `decide-v3` `decide` `records` `shuffle` の各テスト。2026-08-18 に `tsc --noEmit` で実測）
   - 本 PR の D1b はこの根本原因ではなく、症状（黙って飲み込むこと）だけを塞いだ

2. **`scripts/mutation-check.mjs` が `scripts/` を変異対象にできない**
   - `detectRunner()` が `<pkg>/package.json` を要求するが `scripts/` には無い
   - **E1・E3 と 2 度繰り越したので独立した宛先を持たせる**（#69 → #113 → #126 で 2 度宛先を失った先例がある）

- [ ] **Step 7: Issue #166 へ EARS 要件 2 の訂正をコメントする**

```
## EARS 要件 2 の訂正（実装時の実測による）

> 2. 候補が 0 件の場合、システムは変更前と同じフォールバックお題を返すこと。

この要件が指す枝は**到達不能**です。`candidates` は言語・難易度フィルタ →
言語のみ → 全件縮退の順に落ちるので、`FALLBACK_PROBLEMS`（33 件）が非空である限り
`candidates.length === 0` になりません。

さらに、**仮に `FALLBACK_PROBLEMS` が空だったとしても、変更前の実装はこの要件を
満たしていません。** 変更前は `candidates[index] ?? FALLBACK_PROBLEMS[0]!` でしたが、
`FALLBACK_PROBLEMS` が空なら右辺の `FALLBACK_PROBLEMS[0]` 自身が `undefined` を返します
（`[][NaN] ?? [][0]` が `undefined` になることを 2026-08-18 に実測）。

したがって要件 2 は「変更前と同じ」を要求できる状況が存在しません。
本 PR では `?? FALLBACK_PROBLEMS[0]!` を**削除**しました。有効な `now` に対しては
`candidates[index]` が必ず定義済みなので観測できる振る舞いは変わらず、
`now` の渡し忘れ（NaN）を黙って飲み込む経路だけが消えます。
```

- [ ] **Step 8: push して CI の緑を確認する**

```bash
cd /home/vscode/tasuki-work
git push -u origin refactor/166-domain-side-effect-removal
gh pr create --fill-first --base main
gh pr checks --watch
```

期待: CI 5/5 緑。

**`poker-sync` の heartbeat テストはフレーキー**（50ms × 2 回 ≒ 100ms の窓を共有ランナーで測る）。落ちたら再実行し、通れば本 PR とは無関係。

- [ ] **Step 9: PR 本文に DoD 8 項目を書く**

| 項目 | 状態 |
|---|---|
| 1. テスト先行・全緑 | Task 1〜6 で Red → Green。`pnpm test --force` 全緑 |
| 2. E2E | 既存 `pnpm e2e` 全緑。利用者の経路は変わらないので追加なし |
| 3. 新しい検査を壊して赤を確認 | Step 2 の 6 項目 |
| 4. 既存テストの恒真化を変異で確認 | Step 3 ＋ Step 2 の項目 5・6 |
| 5. 実経路確認 | Step 5 |
| 6. リファクタリング | `ProblemDelegatorDeps.clock` の死んだ依存を解消。`??` の死んだ枝を削除 |
| 7. 文書への反映 | Task 7（ADR-0016 追記・ガイド・AGENTS.md） |
| 8. Issue の完了条件 | 設計正本の「完了条件」節に対応表を書く。EARS 要件 2 は Step 7 で訂正済み |

---

## Self-Review

**1. Spec coverage**

| 設計正本の決定 | Task |
|---|---|
| D1（`now: number` 必須・既定値なし） | 2 |
| D1b（`??` の削除） | 2 |
| D2（timer-sync は `Clock` 経由） | 3 |
| D3（timer-web はアダプタ内で `Date.now()`） | 4 |
| D4（検査を共有モジュールへ乗せる） | 5 |
| D5（禁止語彙 6 語・ADR-0016 追記） | 5, 7 |
| D6（コメント行も読む） | 5 |
| D7（導出ガード） | 6 |
| D8（ゴールデン値の先行採取） | 1 |
| D9（追加するテスト） | 2, 3, 5 |
| D10（破壊検証の順序） | 8 |
| 触れる外部配線 5 箇所 | 7（＋ 5 の自己テストは導出で自動） |
| 完了条件の「Issue 起票」3 件 | 8 |

**2. Placeholder scan**

Task 3 Step 1 の骨格コードは意図的に「そのまま書かない」と指示している。これは既存テストの組み立て（`store` / `broadcaster` / `testLogger` / `testRefEncoder` の作り方）を読んで合わせる必要があり、ここで模写を書くと**テストが配線を再実装して、配線が消えても緑になる**罠を作るため。検証すべき性質（確定したお題が `pickFallback(lang, diff, FIXED_NOW)` と一致する）と 3 経路の起こし方は具体的に示してある。

**3. Type consistency**

`pickFallback(language: string, difficulty: string, now: number): ProblemWithSource` は Task 2 で定義し、Task 3（`this.clock.now()`）・Task 4（`Date.now()`）・Task 1 のゴールデンテストで同じ順・同じ型で呼んでいる。`findForbiddenCalls(text, filePath)` は Task 5 で定義し、同 Task の自己テストが同名・同順で呼ぶ。`DOMAIN_PACKAGES` / `EXCLUDED_PACKAGES` / `FORBIDDEN` の名前は Task 5 の本体・自己テスト・Task 8 の破壊検証で一致している。
