# お題の文脈と同期サーバー（#91 PR 1）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** お題を 4 つ目の文脈（`packages/topic-core`）として作り、同期サーバーにお題ツールの接続（`?tool=topic`）・生成・配信を足す。`docs/adr/0012` D10 をこの新しい経路で満たす。

**Architecture:** topic-core は依存ゼロの純粋なドメイン（型・上限・許可リスト・帳簿の遷移・定型バンク・プロンプト・境界スキーマ）。同期サーバーはハブと同じ形（生テキストを受けるメッセージ層＋共通の受理・切断）でお題の接続を受け、`join-room.ts` で名簿に載せ、`TopicStore` と `TopicGenerator` で状態と生成を持つ。**既存の timer のお題の経路には一切手を入れず、新しいファイルを並べて足すだけにする。**

**Tech Stack:** TypeScript / valibot / neverthrow / vitest（topic-core）/ bun test（tasuki-sync）/ Bun.serve の WebSocket

**Spec:** `docs/superpowers/specs/2026-09-23-shared-topic-design.md`（§9 の PR 1）。**計画と spec が食い違ったら spec が正本。** 実装者は両方を読むこと。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクを Red → Green で書く。変異検査を Task 12 で足す |
| II. 技術選定は ADR を通す | 通過 | 新しい外部依存は足さない（valibot・neverthrow は既存と同じ版）。新 ADR 0021 は PR 3 で書く（spec §8） |
| III. 揮発インメモリと単純運用 | 通過 | お題の状態はインメモリの `TopicStore` だけに置き、ルームと一緒に消す |
| IV. 境界の型安全 | 通過 | お題の接続のコマンドは topic-core の valibot スキーマで境界検証する。`language` / `difficulty` は `v.picklist` |
| V. 実画面検証 | 該当なし | この PR は画面を持たない（画面は PR 2・3） |
| VI. 依存は内向き | 通過 | topic-core は `@tasuki/*` に依存しない。依存方向の許可表を Task 1 で更新する |
| VII. 検査は壊して確かめる | 通過 | 新しいガードに変異を足す（Task 12） |
| VIII. 記録が正本 | 通過 | T8 ① の実測結果を spec §10 へ記録する（Task 0）。ADR の完了形は PR 3 で書く |
| IX. 小さく回す | 通過 | PR 1 本。デプロイは伴わない（配布は PR 3 の後に 1 回） |
| X. 抽象は実需で | 通過 | 新しいポートは `TopicStore` と `ServerTopicProvider` だけで、どちらも実装とテストのフェイクの 2 つの利用者を持つ |
| XI. 秘密と個人情報を持ち込まない | 通過 | お題のタイトル・本文をログへ出さない（Task 7・Task 12）。OAuth トークンは子プロセスの env にだけ渡す |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- お題のタイトルは 1〜200 字、本文は 0〜4000 字（`MAX_TOPIC_TITLE = 200` / `MAX_TOPIC_BODY = 4000`）
- `LANGUAGES` = TypeScript / JavaScript / Python / Java / Go / Ruby / Rust / C# / Kotlin / Swift、`DIFFICULTIES` = easy / medium / hard
- **topic-core は `@tasuki/*` に依存しない（MUST NOT）**。timer-core・poker-core も topic-core に依存しない
- お題を変えられるのは `?tool=topic` の接続だけ。お題のコマンドをハブ・timer・poker のスキーマに**含めない**
- お題の接続の受理と切断は**timer・ハブと同じ `onConnect` / `onDisconnect` を通す**（poker のように手前で return しない）
- `ai.unlock` のレート制限は `handlers.rateLimitGate`（`room.join` と共有しているインスタンス）を渡す。**新しいゲートを作らない**
- この PR の配信先は **お題の接続とハブの接続だけ**（timer・poker へは送らない。spec §9）
- お題のタイトル・本文はログへ出さない
- **既存の timer のお題の経路（`problem-*`・`lobby-problem.ts`・`ai-unlock.ts`・`claude-cli-problem-provider.ts`）を編集・削除しない**
- 作業は `/workspaces/claym/local/Tasuki` の `feature/issue-91-shared-topic` ブランチで行う。テストは `pnpm --filter <pkg> test`

## Review Focus

spec が求めるが、どのタスクのテストも踏まないと利用者に最も当たりやすい入力（上ほど当たりやすい）:

1. **お題の接続が名乗らずにコマンドを送る**（`room.join` の前に `topic.set`）→ `NOT_IN_ROOM` で拒否し、どのルームのお題も変えない。Task 9 のテスト「参加前の topic.set は NOT_IN_ROOM」
2. **同じ人がお題ツールを 2 タブで開き、片方を閉じる** → 残ったタブには引き続き配信が届く。Task 10 のテスト「2 本のお題の接続の片方を閉じても、もう片方に届く」
3. **生成中にルームの最後の 1 人が抜けてルームが消える** → 子プロセスが止まり、消えたルームへ書き戻さない。Task 9 のテスト「破棄でお題の状態を消し、進行中の生成を中断する」と Task 7 のテスト「中断後に provider が解決しても保管に書かない」
4. **タイトルが空白だけ・本文が 4000 字ちょうど／4001 字**→ 前者と 4001 字は拒否、4000 字は通す。Task 2 のスキーマのテスト
5. **AI が JSON の外に説明文を付けて返す／`title` が 201 字**→ 前者は抽出して通す、後者は検証で落として定型へ縮退する。Task 6 と Task 7 のテスト

---

## ファイル構成

**新規（topic-core）**

| ファイル | 責務 |
|---|---|
| `packages/topic-core/package.json` / `tsconfig.json` / `vitest.config.ts` | パッケージの雛形（room-core と同じ形） |
| `packages/topic-core/src/limits.ts` | 上限・許可リストと、その型 |
| `packages/topic-core/src/topic.ts` | `Topic` / `TopicState` と帳簿の遷移（純粋関数） |
| `packages/topic-core/src/schemas.ts` | 境界スキーマ（お題・状態・フレーム・コマンド・エラーコード） |
| `packages/topic-core/src/topic-bank.ts` | 定型バンク（timer-core の 33 件を畳んで生成したデータ） |
| `packages/topic-core/src/fallback.ts` | `pickTopicFallback` |
| `packages/topic-core/src/prompt.ts` | `buildTopicPrompt` |
| `packages/topic-core/src/validate.ts` | `validateTopicDraft`（AI の出力の検証） |
| `packages/topic-core/src/index.ts` | 公開契約 |

**新規（tasuki-sync）**

| ファイル | 責務 |
|---|---|
| `src/ports/topic-store.ts` / `src/adapters/in-memory-topic-store.ts` | お題の状態の保管 |
| `src/ports/server-topic-provider.ts` | AI 生成のポート |
| `src/adapters/claude-cli-topic-provider.ts` | `claude -p` の子プロセス（**ツールを閉じる**） |
| `src/application/topic-broadcast.ts` | 配信先の決定と `topic` フレームの送出 |
| `src/application/topic-generation.ts` | 生成の依頼・中断・縮退（`TopicGenerator`） |
| `src/application/topic-handlers.ts` | お題の接続のメッセージ層 |

**変更（tasuki-sync）**: `application/tool-id.ts`（`TOOL_TOPIC`）・`application/ai-limits.ts`（`isCoolingDown`）・`application/destroy-room.ts`（お題の後始末）・`application/hub-handlers.ts`（参加時にお題を送る）・`adapters/ws-adapter.ts`（`topic` の振り分けと送出）・`create-sync-server.ts`（組み立て）・`package.json`（`@tasuki/topic-core`）・`test/support/live-sync-server.ts`（`connectTopic`）

**変更（検査）**: `scripts/audit-dependency-direction.mjs`・`scripts/mutation-check.mjs`・`scripts/mutations/m76〜m83-*.patch`

---

### Task 0: T8 ① の実測（ゲート。これが通らなければ AI 生成を入れない）

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-shared-topic-design.md`（§10 の該当行へ結果を追記）

spec §5.3 T8 ①。**本番と同じ CLI 2.1.178 で、`--tools ""` を付けた起動が報告するツール一覧が空になることを確かめる。** 以降のタスクの前に行う。

- [ ] **Step 1: 2.1.178 をスクラッチへ入れる**

```bash
S=/tmp/claude-1000/-workspaces-claym-local-Tasuki/$(ls -t /tmp/claude-1000/-workspaces-claym-local-Tasuki | head -1)/scratchpad/cli178
mkdir -p "$S" && cd "$S"
export _ZO_DOCTOR=0
npm install --no-save --no-audit --no-fund @anthropic-ai/claude-code@2.1.178 @anthropic-ai/claude-code-linux-x64@2.1.178
# npm の設定でインストールスクリプトが止められているので、公式の install.cjs を手で流す
(cd node_modules/@anthropic-ai/claude-code && node install.cjs)
./node_modules/.bin/claude --version
```

Expected: `2.1.178 (Claude Code)`

- [ ] **Step 2: 本番と同じ引数に `--tools ""` と観測用の 2 つを足して起動し、init 行のツール一覧を見る**

```bash
cd "$S"
echo 'Reply with the single word OK.' | ./node_modules/.bin/claude -p \
  --output-format stream-json --verbose \
  --model sonnet \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' --settings '{}' \
  --tools "" \
  | head -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.type,j.subtype,JSON.stringify(j.tools))})'
```

Expected: `system init []`

対照として `--tools ""` を外して同じ行を実行し、ツール一覧が**空でない**ことも見る（対照が空なら観測の仕方が壊れている）。

- [ ] **Step 3: 判定する**

- 空になった → 第一候補を採用する。Step 4 へ
- 空にならない → spec §5.3 の順で `--allowedTools ""` / `--disallowedTools ...` / `--permission-mode` の組み合わせを同じ方法で試す
- **どれでも空にならない → ここで止まり、利用者へ報告する。** 以降のタスクは「AI 生成を入れない」形（Task 6 を飛ばし、Task 7 の `provider` を常に `undefined` にする）に変える判断を利用者から受けてから進める
- 認証の都合で起動できない場合も止まり、利用者へ報告する（実測を推測で置き換えない）

- [ ] **Step 4: 結果を spec §10 に記録する**

`docs/superpowers/specs/2026-09-23-shared-topic-design.md` の §10 の 1 行目の末尾へ、次の形で追記する（日付・版・指定・対照の結果）:

```markdown
  - **実測（2026-09-23・CLI 2.1.178）**: `--tools ""` で init のツール一覧は `[]`。対照（指定なし）は N 個
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-23-shared-topic-design.md
git commit -m "docs: claude -p のツールを閉じる指定を本番の版で実測する（#91）"
```

---

### Task 1: topic-core の雛形と、上限・許可リスト

**Files:**
- Create: `packages/topic-core/package.json` / `tsconfig.json` / `vitest.config.ts` / `src/limits.ts` / `src/index.ts`
- Create: `packages/topic-core/tests/limits.test.ts`
- Modify: `scripts/audit-dependency-direction.mjs`（`ALLOWED` に `"packages/topic-core": []` を足す）

**Interfaces:**
- Produces: `MAX_TOPIC_TITLE: 200`、`MAX_TOPIC_BODY: 4000`、`LANGUAGES`（readonly タプル）、`DIFFICULTIES`（readonly タプル）、`type Language`、`type Difficulty`

- [ ] **Step 1: 雛形を作る**（room-core と同じ形。依存は valibot と neverthrow。版は timer-core の `package.json` に揃える）

`packages/topic-core/package.json`:

```json
{
  "name": "@tasuki/topic-core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run --coverage",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "neverthrow": "^8.1.1",
    "valibot": "^1.0.0"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^4.1.11",
    "vitest": "^4.1.11"
  }
}
```

`tsconfig.json` と `vitest.config.ts` は `packages/room-core` のものを写し、`vitest.config.ts` の注釈だけを「お題の文脈（#91）。下限は room-core に揃える」に書き換える。

```bash
pnpm install
```

- [ ] **Step 2: 失敗するテストを書く**

`packages/topic-core/tests/limits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DIFFICULTIES, LANGUAGES, MAX_TOPIC_BODY, MAX_TOPIC_TITLE } from "../src/index.js";

describe("お題の上限と許可リスト", () => {
  it("タイトルは 200 字、本文は 4000 字まで（現行の MAX_PROBLEM_TITLE / MAX_PROBLEM_TEXT を引き継ぐ）", () => {
    expect([MAX_TOPIC_TITLE, MAX_TOPIC_BODY]).toEqual([200, 4000]);
  });

  it("言語は timer の画面にあった 10 言語と同じ並び", () => {
    expect(LANGUAGES).toEqual([
      "TypeScript", "JavaScript", "Python", "Java", "Go",
      "Ruby", "Rust", "C#", "Kotlin", "Swift",
    ]);
  });

  it("難易度は easy / medium / hard", () => {
    expect(DIFFICULTIES).toEqual(["easy", "medium", "hard"]);
  });
});
```

- [ ] **Step 3: 失敗を確かめる**

Run: `pnpm --filter @tasuki/topic-core test`
Expected: FAIL（`../src/index.js` が無い）

- [ ] **Step 4: 実装する**

`packages/topic-core/src/limits.ts`:

```ts
/**
 * お題の上限と、生成の材料の許可リスト（#91）。
 *
 * **許可リストは境界の列挙検証の正本である**（`docs/adr/0012` D10）。プロンプトへ
 * 埋め込まれる値はこの中の値だけになる。画面の選択肢もここから引く ——
 * 画面と境界で別の一覧を持つと、片方だけが増えて「選べるのに拒まれる」言語が生まれる。
 */

/** タイトルの上限（現行の `MAX_PROBLEM_TITLE` を引き継ぐ） */
export const MAX_TOPIC_TITLE = 200;
/** 本文の上限（現行の `MAX_PROBLEM_TEXT` を引き継ぐ。定型バンクを畳んだ本文もこの中に収まる） */
export const MAX_TOPIC_BODY = 4000;

export const LANGUAGES = [
  "TypeScript", "JavaScript", "Python", "Java", "Go",
  "Ruby", "Rust", "C#", "Kotlin", "Swift",
] as const;
export type Language = (typeof LANGUAGES)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
```

`packages/topic-core/src/index.ts`:

```ts
export { MAX_TOPIC_TITLE, MAX_TOPIC_BODY, LANGUAGES, DIFFICULTIES } from "./limits.js";
export type { Language, Difficulty } from "./limits.js";
```

- [ ] **Step 5: 通ることを確かめる**

Run: `pnpm --filter @tasuki/topic-core test`
Expected: PASS

- [ ] **Step 6: 依存方向の許可表へ登録し、検査を回す**

`scripts/audit-dependency-direction.mjs` の `ALLOWED` の `"packages/room-core": [],` の直後に足す:

```js
  // お題の文脈（#91）。**@tasuki/* に依存しない** —— ツールのドメインと同格の文脈であり、
  // 文脈をつなぐのはアプリ層である（docs/adr/0017）。
  "packages/topic-core": [],
```

```bash
node scripts/audit-dependency-direction.mjs
node scripts/audit-structure.mjs
bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'
```

Expected: すべて成功。**赤になった検査があれば、その検査が求める登録を足して緑にする**（新しいパッケージで落ちる検査の一覧は列挙しない。実行して確かめる — spec §5.6）。足したものはコミットに含める。

- [ ] **Step 7: Commit**

```bash
git add packages/topic-core scripts pnpm-lock.yaml
git commit -m "feat: お題の文脈 topic-core を新設し、上限と許可リストを置く（#91）"
```

---

### Task 2: お題の型・帳簿の遷移・境界スキーマ

**Files:**
- Create: `packages/topic-core/src/topic.ts` / `src/schemas.ts`
- Create: `packages/topic-core/tests/topic.test.ts` / `tests/schemas.test.ts`
- Modify: `packages/topic-core/src/index.ts`

**Interfaces:**
- Consumes: Task 1 の上限・許可リスト
- Produces:
  - `type TopicSource = "manual" | "ai" | "fallback"`
  - `interface Topic { title: string; body: string; source: TopicSource }`
  - `interface TopicState { topic: Topic | null; generating: boolean; degraded: boolean; aiUnlocked: boolean }`
  - `INITIAL_TOPIC_STATE: TopicState`
  - 遷移（すべて `(state: TopicState, ...) => TopicState` の純粋関数）: `startGeneration(s)` / `settleWithAi(s, topic)` / `settleWithFallback(s, topic, degraded: boolean)` / `setManualTopic(s, { title, body })` / `clearTopic(s)` / `unlockAi(s)`
  - スキーマ: `TopicSchema` / `TopicStateSchema` / `TopicFrameSchema`（`{ type: "topic"; state: TopicState }`）/ `TopicCommandSchema` / `TopicErrorCodeSchema` / `TopicErrorFrameSchema`（`{ type: "error"; code: TopicErrorCode; message: string }`）
  - `type TopicCommand` = `{ command: "topic.set"; title; body }` | `{ command: "topic.clear" }` | `{ command: "topic.generate"; mode: "ai" | "fallback"; language: Language; difficulty: Difficulty }` | `{ command: "ai.unlock"; key: string }`
  - `TOPIC_ERROR_CODES` = `["INVALID_JSON", "INVALID_COMMAND", "NOT_IN_ROOM", "RATE_LIMITED", "AI_UNLOCK_FAILED", "GENERATION_COOLDOWN"]`（**文言は持たない**。`scripts/audit-domain-error-shape.mjs` の規則）

- [ ] **Step 1: 遷移の失敗するテストを書く**（spec §5.1 の帳簿の遷移表の全行。E8〜E11・E20）

`packages/topic-core/tests/topic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  INITIAL_TOPIC_STATE, clearTopic, setManualTopic, settleWithAi, settleWithFallback,
  startGeneration, unlockAi, type Topic, type TopicState,
} from "../src/index.js";

const AI_TOPIC: Topic = { title: "FizzBuzz", body: "3 の倍数で…", source: "ai" };
const FALLBACK_TOPIC: Topic = { title: "文字列の反転", body: "…", source: "fallback" };
/** 「定型に落ちた」知らせが立っていて、生成中でもある状態（取り下げを見るための出発点） */
const DEGRADED_AND_GENERATING: TopicState = {
  topic: FALLBACK_TOPIC, generating: true, degraded: true, aiUnlocked: true,
};

describe("お題の帳簿の遷移（spec §5.1）", () => {
  it("既定はお題なし・生成していない・縮退していない・未解錠（E1）", () => {
    expect(INITIAL_TOPIC_STATE).toEqual({
      topic: null, generating: false, degraded: false, aiUnlocked: false,
    });
  });

  it("作り始めると生成中になり、縮退の知らせを取り下げ、お題は据え置く（E10・E20）", () => {
    const s: TopicState = { ...DEGRADED_AND_GENERATING, generating: false };
    expect(startGeneration(s)).toEqual({ ...s, generating: true, degraded: false });
  });

  it("AI のお題で確定すると生成中を降ろし、縮退なしで掲げる（E8）", () => {
    expect(settleWithAi(DEGRADED_AND_GENERATING, AI_TOPIC)).toEqual({
      topic: AI_TOPIC, generating: false, degraded: false, aiUnlocked: true,
    });
  });

  it("定型で確定するとき、縮退かどうかは呼び出し側が決める（E7・E9）", () => {
    expect(settleWithFallback(DEGRADED_AND_GENERATING, FALLBACK_TOPIC, true).degraded).toBe(true);
    expect(settleWithFallback(DEGRADED_AND_GENERATING, FALLBACK_TOPIC, false).degraded).toBe(false);
  });

  it("手で掲げると source は manual になり、生成中と縮退を降ろす（E11・E20）", () => {
    expect(setManualTopic(DEGRADED_AND_GENERATING, { title: "t", body: "b" })).toEqual({
      topic: { title: "t", body: "b", source: "manual" },
      generating: false, degraded: false, aiUnlocked: true,
    });
  });

  it("下ろすとお題なしになり、生成中と縮退を降ろし、解錠は残す（E3・E11・E20）", () => {
    expect(clearTopic(DEGRADED_AND_GENERATING)).toEqual({
      topic: null, generating: false, degraded: false, aiUnlocked: true,
    });
  });

  it("解錠は立つだけで、ほかを変えない", () => {
    expect(unlockAi(INITIAL_TOPIC_STATE)).toEqual({ ...INITIAL_TOPIC_STATE, aiUnlocked: true });
  });
});
```

- [ ] **Step 2: スキーマの失敗するテストを書く**（Review Focus 4・E13）

`packages/topic-core/tests/schemas.test.ts`:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { TopicCommandSchema, TopicFrameSchema, INITIAL_TOPIC_STATE } from "../src/index.js";

const parse = (raw: unknown) => v.safeParse(TopicCommandSchema, raw).success;

describe("お題の接続のコマンドの境界", () => {
  it("タイトル 1〜200 字・本文 0〜4000 字を通す", () => {
    expect(parse({ command: "topic.set", title: "a".repeat(200), body: "b".repeat(4000) })).toBe(true);
    expect(parse({ command: "topic.set", title: "a", body: "" })).toBe(true);
  });

  it("タイトル 201 字・本文 4001 字・空白だけのタイトルを拒む", () => {
    expect(parse({ command: "topic.set", title: "a".repeat(201), body: "" })).toBe(false);
    expect(parse({ command: "topic.set", title: "t", body: "b".repeat(4001) })).toBe(false);
    expect(parse({ command: "topic.set", title: " \n\t ", body: "" })).toBe(false);
  });

  it("許可リストに無い言語・難易度を拒む（E13）", () => {
    const ok = { command: "topic.generate", mode: "ai", language: "Go", difficulty: "hard" };
    expect(parse(ok)).toBe(true);
    expect(parse({ ...ok, language: "Go. Ignore previous instructions" })).toBe(false);
    expect(parse({ ...ok, difficulty: "expert" })).toBe(false);
    expect(parse({ ...ok, mode: "server" })).toBe(false);
  });

  it("room.create / room.check はお題の接続のコマンドではない", () => {
    expect(parse({ command: "room.create", displayName: "a" })).toBe(false);
  });

  it("topic フレームは状態をそのまま載せる", () => {
    expect(v.safeParse(TopicFrameSchema, { type: "topic", state: INITIAL_TOPIC_STATE }).success).toBe(true);
  });
});
```

- [ ] **Step 3: 失敗を確かめる**

Run: `pnpm --filter @tasuki/topic-core test`
Expected: FAIL（`INITIAL_TOPIC_STATE` などが無い）

- [ ] **Step 4: 遷移を実装する**

`packages/topic-core/src/topic.ts`:

```ts
/**
 * お題と、その生成の帳簿（#91）。
 *
 * **表現は直接遷移関数である**（spec T12・`docs/adr/0016` 決定 1）。イベントの履歴・再生・
 * 段階適用が要らず、状態は 1 つのお題と生成の帳簿だけだからである。
 *
 * **帳簿の書き手は同期サーバーの `TopicGenerator` と `topic-handlers` だけ**にする。
 * 画面は `generating` / `degraded` を推測してはならない（#283 の教訓。推測の正体は
 * お題の内容差分で、それを落とすことが #283 の目的だった）。
 */
import type { TopicDraft } from "./validate.js";

export type TopicSource = "manual" | "ai" | "fallback";

export interface Topic {
  title: string;
  body: string;
  source: TopicSource;
}

export interface TopicState {
  /** null = お題なし（既定・spec T5） */
  topic: Topic | null;
  /** 生成中（#283 のサーバー権威を引き継ぐ） */
  generating: boolean;
  /** 直近の生成が、AI を求めたのに定型へ落ちた */
  degraded: boolean;
  /** AI 解錠。いったん立ったらルームの寿命の間続く（再施錠の操作は持たない） */
  aiUnlocked: boolean;
}

export const INITIAL_TOPIC_STATE: TopicState = {
  topic: null,
  generating: false,
  degraded: false,
  aiUnlocked: false,
};

/** 作り始めた。**縮退の知らせはここで取り下げる**（新しい依頼は前の結果を語らない）。 */
export function startGeneration(s: TopicState): TopicState {
  return { ...s, generating: true, degraded: false };
}

export function settleWithAi(s: TopicState, topic: Topic): TopicState {
  return { ...s, topic, generating: false, degraded: false };
}

/**
 * 定型で確定する。**縮退かどうかは呼び出し側が決める** —— 同じ定型でも、
 * 利用者が「定型から選ぶ」を押した結果なら縮退ではない。
 */
export function settleWithFallback(s: TopicState, topic: Topic, degraded: boolean): TopicState {
  return { ...s, topic, generating: false, degraded };
}

export function setManualTopic(s: TopicState, draft: TopicDraft): TopicState {
  return { ...s, topic: { ...draft, source: "manual" }, generating: false, degraded: false };
}

export function clearTopic(s: TopicState): TopicState {
  return { ...s, topic: null, generating: false, degraded: false };
}

export function unlockAi(s: TopicState): TopicState {
  return { ...s, aiUnlocked: true };
}
```

`TopicDraft` は Task 4 の `validate.ts` で定義する。**この Task では `validate.ts` に型だけ先に置く**:

```ts
/** 利用者または AI が出した、出所の付く前のお題 */
export interface TopicDraft {
  title: string;
  body: string;
}
```

- [ ] **Step 5: スキーマを実装する**

`packages/topic-core/src/schemas.ts`:

```ts
/**
 * お題の接続の境界スキーマ（#91・原則 IV）。
 *
 * **お題のコマンドはここにしか無い。** ハブ・timer・poker のスキーマに含めないことが、
 * 「お題を変えられるのはお題ツールの接続だけ」（spec T4）の仕組みそのものである。
 * 共通の処理（`handlers.ts`）にツール別の可否判定を戻さない（#95 S5b で撤去済み）。
 *
 * **エラーコードは文言を持たない**（`scripts/audit-domain-error-shape.mjs`）。
 * 文言はアプリ層（`apps/tasuki-sync/src/application/topic-handlers.ts`）が持つ。
 */
import * as v from "valibot";
import { DIFFICULTIES, LANGUAGES, MAX_TOPIC_BODY, MAX_TOPIC_TITLE } from "./limits.js";

/** 空白だけのタイトルを拒む（見出しが空の札が全員の画面に出る） */
const titleStr = v.pipe(
  v.string(),
  v.maxLength(MAX_TOPIC_TITLE),
  v.check((s) => s.trim().length > 0, "title must not be blank"),
);
const bodyStr = v.pipe(v.string(), v.maxLength(MAX_TOPIC_BODY));

export const TopicSchema = v.object({
  title: titleStr,
  body: bodyStr,
  source: v.picklist(["manual", "ai", "fallback"]),
});

export const TopicStateSchema = v.object({
  topic: v.nullable(TopicSchema),
  generating: v.boolean(),
  degraded: v.boolean(),
  aiUnlocked: v.boolean(),
});

export const TopicFrameSchema = v.object({
  type: v.literal("topic"),
  state: TopicStateSchema,
});

export const TopicCommandSchema = v.variant("command", [
  v.object({ command: v.literal("topic.set"), title: titleStr, body: bodyStr }),
  v.object({ command: v.literal("topic.clear") }),
  v.object({
    command: v.literal("topic.generate"),
    mode: v.picklist(["ai", "fallback"]),
    // `docs/adr/0012` D10 の列挙検証。**ここを `v.string()` に戻すと、プロンプトへ
    // 任意の文字列が届く**（2026-08-13 に持ち出し経路が本番で成立した入口）。
    language: v.picklist(LANGUAGES),
    difficulty: v.picklist(DIFFICULTIES),
  }),
  v.object({ command: v.literal("ai.unlock"), key: v.pipe(v.string(), v.maxLength(200)) }),
]);
export type TopicCommand = v.InferOutput<typeof TopicCommandSchema>;

export const TOPIC_ERROR_CODES = [
  "INVALID_JSON",
  "INVALID_COMMAND",
  "NOT_IN_ROOM",
  "RATE_LIMITED",
  "AI_UNLOCK_FAILED",
  "GENERATION_COOLDOWN",
] as const;
export const TopicErrorCodeSchema = v.picklist(TOPIC_ERROR_CODES);
export type TopicErrorCode = (typeof TOPIC_ERROR_CODES)[number];

export const TopicErrorFrameSchema = v.object({
  type: v.literal("error"),
  code: TopicErrorCodeSchema,
  message: v.string(),
});
```

`ai.unlock` の `key` の上限 200 は、timer の `AiUnlockCommand` の上限と合わせる（`packages/timer-core/src/schemas.ts` の `ai.unlock` を見て同じ値にする。違えば timer の値に揃える）。

`index.ts` に `topic.ts` / `schemas.ts` の公開物と `TopicDraft` 型を足す。

- [ ] **Step 6: 通ることを確かめる**

Run: `pnpm --filter @tasuki/topic-core test && pnpm --filter @tasuki/topic-core typecheck && node scripts/audit-domain-error-shape.mjs`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/topic-core
git commit -m "feat: お題の帳簿の遷移と境界スキーマを置く（#91）"
```

---

### Task 3: 定型バンク・定型の選び方・プロンプト

**Files:**
- Create: `packages/topic-core/src/topic-bank.ts`（生成物）/ `src/fallback.ts` / `src/prompt.ts`
- Create: `packages/topic-core/tests/fallback.test.ts` / `tests/prompt.test.ts`
- Modify: `packages/topic-core/src/index.ts`

**Interfaces:**
- Produces:
  - `interface TopicBankEntry { title: string; body: string; languages: readonly Language[]; difficulty: Difficulty }`
  - `TOPIC_BANK: readonly TopicBankEntry[]`
  - `pickTopicFallback(language: Language, difficulty: Difficulty, now: number, previous: Topic | null): Topic`（`source: "fallback"`）
  - `buildTopicPrompt(language: Language, difficulty: Difficulty): string`

- [ ] **Step 1: 定型バンクを生成する**（timer-core の 33 件を畳む。**topic-core は timer-core に依存できないので、データを生成して置く**）

スクラッチに生成スクリプトを置いて流す（リポジトリには入れない。生成物だけを入れる）:

```ts
// $SCRATCH/gen-topic-bank.ts —— bun で実行する
import { FALLBACK_PROBLEMS } from "/workspaces/claym/local/Tasuki/packages/timer-core/src/problem-bank.ts";

const fold = (p: (typeof FALLBACK_PROBLEMS)[number]["problem"]): string =>
  [
    p.description,
    "",
    "満たすこと:",
    ...p.requirements.map((r) => `- ${r}`),
    "",
    "最初のテストの例:",
    p.exampleTest,
    ...(p.hints.length > 0 ? ["", "ヒント:", ...p.hints.map((h) => `- ${h}`)] : []),
  ].join("\n");

const entries = FALLBACK_PROBLEMS.map((e) => ({
  title: e.problem.title,
  body: fold(e.problem),
  languages: e.languages,
  difficulty: e.difficulty,
}));

console.log(`/**
 * 定型バンク（#91）。**生成物である。手で直さない。**
 *
 * timer-core の \`problem-bank.ts\`（33 件）の要件・テスト例・ヒントを本文 1 本へ畳んだもの
 * （spec §5.1 T2）。topic-core は timer-core に依存できない（spec T1）ので、データとして置く。
 * 旧バンクは PR 3 で timer-core から消える。以後の正本はこのファイルである。
 */
import type { Difficulty, Language } from "./limits.js";

export interface TopicBankEntry {
  title: string;
  body: string;
  languages: readonly Language[];
  difficulty: Difficulty;
}

export const TOPIC_BANK: readonly TopicBankEntry[] = ${JSON.stringify(entries, null, 2)};`);
```

```bash
bun "$SCRATCH/gen-topic-bank.ts" > packages/topic-core/src/topic-bank.ts
pnpm exec prettier --write packages/topic-core/src/topic-bank.ts 2>/dev/null || true
```

- [ ] **Step 2: 失敗するテストを書く**

`packages/topic-core/tests/fallback.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DIFFICULTIES, LANGUAGES, MAX_TOPIC_BODY, MAX_TOPIC_TITLE, TOPIC_BANK, pickTopicFallback,
} from "../src/index.js";

describe("定型バンク", () => {
  it("33 件すべてが上限に収まり、空白だけのタイトルが無い（spec §10）", () => {
    expect(TOPIC_BANK).toHaveLength(33);
    for (const e of TOPIC_BANK) {
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(e.title.length).toBeLessThanOrEqual(MAX_TOPIC_TITLE);
      expect(e.body.length).toBeLessThanOrEqual(MAX_TOPIC_BODY);
    }
  });

  it("どの言語×難易度でも候補が 2 件以上ある（直前を外しても空にならない）", () => {
    for (const language of LANGUAGES) {
      for (const difficulty of DIFFICULTIES) {
        const n = TOPIC_BANK.filter((e) => e.languages.includes(language) && e.difficulty === difficulty).length;
        expect(n).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("pickTopicFallback（E7）", () => {
  it("選ばれた難易度のお題を source: fallback で返す", () => {
    const t = pickTopicFallback("Go", "hard", 0, null);
    const entry = TOPIC_BANK.find((e) => e.title === t.title);
    expect(entry?.difficulty).toBe("hard");
    expect(t.source).toBe("fallback");
  });

  it("直前と同じお題を返さない（どの種でも）", () => {
    for (let now = 0; now < 50; now++) {
      const first = pickTopicFallback("Python", "easy", now, null);
      const second = pickTopicFallback("Python", "easy", now, first);
      expect(second.title).not.toBe(first.title);
    }
  });
});
```

`packages/topic-core/tests/prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTopicPrompt } from "../src/index.js";

describe("buildTopicPrompt", () => {
  it("言語と難易度を埋め、title と body だけの JSON を求める", () => {
    const p = buildTopicPrompt("Rust", "medium");
    expect(p).toContain("Rust");
    expect(p).toContain("medium");
    expect(p).toContain('"title"');
    expect(p).toContain('"body"');
    expect(p).not.toContain('"exampleTest"');
  });
});
```

- [ ] **Step 3: 失敗を確かめる**

Run: `pnpm --filter @tasuki/topic-core test`
Expected: FAIL（`pickTopicFallback` / `buildTopicPrompt` が無い）

- [ ] **Step 4: 実装する**

`packages/topic-core/src/fallback.ts` —— 規則は `packages/timer-core/src/problem.ts` の `pickFallback` と同じ（言語×難易度 → 言語だけ → 全件の順に絞る → 直前と同じタイトルを外す → 外して空なら戻す → `now` を種に選ぶ）。**`pickFallback` の注釈（同一性を `title` で見る理由・`?? 先頭` を置かない理由）も読んでから書く**:

```ts
import type { Difficulty, Language } from "./limits.js";
import type { Topic } from "./topic.js";
import { TOPIC_BANK } from "./topic-bank.js";

/**
 * 言語・難易度に合った定型のお題を返す（#91。timer-core の `pickFallback` の規則を引き継ぐ）。
 *
 * @param now 選択の種。**既定値は置かない**（既定があると呼び出し側が無変更で通り、
 *   配線されていることが検査されないまま緑になる。#166）。
 * @param previous いま載っているお題。**候補から外す** —— 同じお題が返ると
 *   作り直しを押したことが画面に出ない（#283）。同一性は `title` で見る
 *   （利用者が「同じお題だ」と感じる単位。理由は `pickFallback` の注釈）。
 */
export function pickTopicFallback(
  language: Language,
  difficulty: Difficulty,
  now: number,
  previous: Topic | null,
): Topic {
  let candidates = TOPIC_BANK.filter(
    (e) => e.languages.includes(language) && e.difficulty === difficulty,
  );
  if (candidates.length === 0) candidates = TOPIC_BANK.filter((e) => e.languages.includes(language));
  if (candidates.length === 0) candidates = TOPIC_BANK;

  const remaining =
    previous === null ? candidates : candidates.filter((e) => e.title !== previous.title);
  // 除いて空になったら元へ戻す（契約「必ず 1 件返す」を守る。`pickFallback` と同じ判断）
  const pool = remaining.length > 0 ? remaining : candidates;

  // `?? TOPIC_BANK[0]!` は置かない。`now` の渡し忘れ（NaN）を黙って飲み込むため
  const entry = pool[Math.abs(now) % pool.length]!;
  return { title: entry.title, body: entry.body, source: "fallback" };
}
```

`packages/topic-core/src/prompt.ts`:

```ts
import type { Difficulty, Language } from "./limits.js";

/**
 * AI へ渡すプロンプト（#91）。
 *
 * **埋め込むのは許可リストの値だけである**（`docs/adr/0012` D10）。引数の型が
 * `Language` / `Difficulty` なのはそのためで、利用者が手で書いたタイトル・本文は
 * ここへ入らない。
 */
export function buildTopicPrompt(language: Language, difficulty: Difficulty): string {
  return `You are a TDD coding kata generator. Generate a programming kata for ${language} at ${difficulty} difficulty.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "title": "短いお題名（日本語・3〜10語相当）",
  "body": "お題の本文（日本語）"
}

Rules for "body":
- Write in NATURAL, CLEAR JAPANESE.
- Include, as plain prose with line breaks: what to build (1-2 sentences), 4-6 testable behaviors as a "- " list, and one example of the first test to write in ${language} syntax with ENGLISH identifiers.
- Keep the whole body under 3000 characters.
- Difficulty: ${difficulty} (easy=beginner/30min, medium=intermediate/60min, hard=advanced/90min+)
- The kata must be suitable for TDD practice (test-first approach). Avoid trivial one-liners.`;
}
```

`index.ts` に `TOPIC_BANK` / `TopicBankEntry` / `pickTopicFallback` / `buildTopicPrompt` を足す。

- [ ] **Step 5: 通ることを確かめる**

Run: `pnpm --filter @tasuki/topic-core test && pnpm --filter @tasuki/topic-core typecheck`
Expected: PASS。**「候補が 2 件以上」が落ちたら、その組み合わせを報告して止まる**（旧バンクの前提が崩れている。黙ってテストを緩めない）

- [ ] **Step 6: Commit**

```bash
git add packages/topic-core
git commit -m "feat: 定型バンクを本文へ畳んで移し、定型の選び方とプロンプトを置く（#91）"
```

---

### Task 4: AI の出力の検証

**Files:**
- Modify: `packages/topic-core/src/validate.ts`（Task 2 で型だけ置いたファイル）
- Create: `packages/topic-core/tests/validate.test.ts`

**Interfaces:**
- Produces: `validateTopicDraft(raw: unknown): Result<TopicDraft, TopicDraftError>`（`TopicDraftError` は `v.ValiError` の型に名前を与えたもの）

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from "vitest";
import { validateTopicDraft } from "../src/index.js";

describe("validateTopicDraft（AI 由来の値を信頼しない入力として検証する）", () => {
  it("title と body だけを取り出す（余計なキーは落とす）", () => {
    const r = validateTopicDraft({ title: "t", body: "b", exampleTest: "x" });
    expect(r.isOk() && r.value).toEqual({ title: "t", body: "b" });
  });

  it("201 字のタイトル・4001 字の本文・空白のタイトル・文字列でない値を拒む", () => {
    expect(validateTopicDraft({ title: "a".repeat(201), body: "" }).isErr()).toBe(true);
    expect(validateTopicDraft({ title: "t", body: "b".repeat(4001) }).isErr()).toBe(true);
    expect(validateTopicDraft({ title: "  ", body: "" }).isErr()).toBe(true);
    expect(validateTopicDraft({ title: 1, body: "" }).isErr()).toBe(true);
    expect(validateTopicDraft(null).isErr()).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `pnpm --filter @tasuki/topic-core test` / Expected: FAIL

- [ ] **Step 3: 実装する**

`schemas.ts` の `titleStr` / `bodyStr` を export し、`validate.ts` で使う:

```ts
import { err, ok, type Result } from "neverthrow";
import * as v from "valibot";
import { bodyStr, titleStr } from "./schemas.js";

export interface TopicDraft {
  title: string;
  body: string;
}

const TopicDraftSchema = v.object({ title: titleStr, body: bodyStr });

/** {@link validateTopicDraft} の失敗の型（外から注釈を書けるように名前を与える。#220 と同じ理由）。 */
export type TopicDraftError = v.ValiError<typeof TopicDraftSchema>;

export function validateTopicDraft(raw: unknown): Result<TopicDraft, TopicDraftError> {
  const r = v.safeParse(TopicDraftSchema, raw);
  return r.success ? ok(r.output) : err(new v.ValiError(r.issues));
}
```

`index.ts` に `validateTopicDraft` / `TopicDraftError` を足す。**`titleStr` / `bodyStr` は index から公開しない**（`scripts/audit-*` の公開契約の検査が「自分しか使わない公開記号」を数える。赤になれば非公開のままにする）。

- [ ] **Step 4: 通ることを確かめる** — Run: `pnpm --filter @tasuki/topic-core test` / Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/topic-core
git commit -m "feat: AI の出力をお題の下書きとして検証する（#91）"
```

---

### Task 5: 同期サーバーのお題の保管

**Files:**
- Create: `apps/tasuki-sync/src/ports/topic-store.ts` / `src/adapters/in-memory-topic-store.ts`
- Modify: `apps/tasuki-sync/package.json`（`"@tasuki/topic-core": "workspace:*"`）/ `src/application/tool-id.ts`
- Modify: `scripts/audit-dependency-direction.mjs`（`"apps/tasuki-sync"` の欄に `"@tasuki/topic-core"`）
- Test: `apps/tasuki-sync/test/in-memory-topic-store.test.ts`

**Interfaces:**
- Produces:
  - `TOOL_TOPIC = "topic"`（`tool-id.ts`）
  - `interface TopicStore { get(code: string): TopicState | undefined; put(code: string, state: TopicState): void; remove(code: string): void }`
  - `class InMemoryTopicStore implements TopicStore`

ルーム破棄での後始末（`destroy-room.ts`）は、生成（Task 7）ができてから配線と一緒に Task 9 で足す（ここで足すと `create-sync-server.ts` の型検査が Task 9 まで赤のままになる）。

- [ ] **Step 1: 失敗するテストを書く**

`test/in-memory-topic-store.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { INITIAL_TOPIC_STATE } from "@tasuki/topic-core";
import { InMemoryTopicStore } from "../src/adapters/in-memory-topic-store.js";

describe("InMemoryTopicStore", () => {
  it("置いた状態を引け、消すと引けなくなる", () => {
    const store = new InMemoryTopicStore();
    store.put("R1", INITIAL_TOPIC_STATE);
    expect(store.get("R1")).toEqual(INITIAL_TOPIC_STATE);
    store.remove("R1");
    expect(store.get("R1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm --filter @tasuki/tasuki-sync test test/in-memory-topic-store.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`tool-id.ts` に足す（既存の 2 つと同じ注釈の形で）:

```ts
/** お題ツールの入口から来た接続（#91）。 */
export const TOOL_TOPIC = "topic";
```

`ports/topic-store.ts`:

```ts
import type { TopicState } from "@tasuki/topic-core";

/**
 * お題の状態の保管（#91）。**ルームと寿命を共にする**（`destroy-room.ts` が消す）。
 * 永続化しない（`docs/timer/adr/0007`）。
 */
export interface TopicStore {
  get(code: string): TopicState | undefined;
  put(code: string, state: TopicState): void;
  remove(code: string): void;
}
```

`adapters/in-memory-topic-store.ts`:

```ts
import type { TopicState } from "@tasuki/topic-core";
import type { TopicStore } from "../ports/topic-store.js";

export class InMemoryTopicStore implements TopicStore {
  private readonly states = new Map<string, TopicState>();
  get(code: string): TopicState | undefined {
    return this.states.get(code);
  }
  put(code: string, state: TopicState): void {
    this.states.set(code, state);
  }
  remove(code: string): void {
    this.states.delete(code);
  }
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `pnpm --filter @tasuki/tasuki-sync test test/in-memory-topic-store.test.ts && pnpm --filter @tasuki/tasuki-sync typecheck && node scripts/audit-dependency-direction.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/tasuki-sync scripts/audit-dependency-direction.mjs pnpm-lock.yaml
git commit -m "feat: お題の状態の保管を足し、ルームの破棄で消す（#91）"
```

---

### Task 6: `claude -p` の provider（ツールを閉じる）

Task 0 が「AI 生成を入れない」と決まった場合は飛ばす。

**Files:**
- Create: `apps/tasuki-sync/src/ports/server-topic-provider.ts` / `src/adapters/claude-cli-topic-provider.ts`
- Test: `apps/tasuki-sync/test/claude-cli-topic-provider.test.ts`

**Interfaces:**
- Produces:
  - `interface ServerTopicProvider { generate(language: Language, difficulty: Difficulty, signal: AbortSignal): Promise<unknown> }`
  - `class ClaudeCliTopicProvider implements ServerTopicProvider`（コンストラクタの引数は `ClaudeCliProblemProvider` と同じ `{ token, model, spawnFn?, maxOutputBytes? }`）
  - 失敗は既存の `ProviderFailure`（`src/ports/server-problem-provider.ts`）で投げる。**PR 3 で `server-problem-provider.ts` を消すとき、`ProviderFailure` を `server-topic-provider.ts` へ移す**（この申し送りを PR 3 の計画へ書く）

- [ ] **Step 1: 失敗するテストを書く**

`test/claude-cli-problem-provider.test.ts` を**写して**新しいファイルを作る。変えるのは次の 4 点:

1. import 先を `claude-cli-topic-provider.js` / `ClaudeCliTopicProvider` にする
2. 応答の見本を `{ title: "FizzBuzz", body: "3 の倍数で…" }` にする
3. プロンプトの確認を `buildTopicPrompt("TypeScript", "easy")` と一致することにする
4. **起動引数のテストに次を足す**（E12）:

```ts
it("組み込みツールを起動引数で全部閉じる（docs/adr/0012 D10・E12）", async () => {
  // Given
  const fake = makeFakeChild();
  const { provider, spawnFn } = makeProvider(fake);

  // When
  const p = provider.generate("TypeScript", "easy", new AbortController().signal);
  fake.stdout.emit("data", Buffer.from(JSON.stringify({ result: JSON.stringify({ title: "t", body: "b" }) })));
  fake.child.emit("close", 0);
  await p;

  // Then（`--tools` の直後の値が空文字であること。**並びで見る** —— `toContain("")` は
  // どの配列にも真になる恒真の検査である）
  const args = (spawnFn as ReturnType<typeof jest.fn>).mock.calls[0]![1] as string[];
  const i = args.indexOf("--tools");
  expect(i).toBeGreaterThanOrEqual(0);
  expect(args[i + 1]).toBe("");
});
```

Task 0 で `--tools ""` 以外の指定を採った場合は、このテストの期待をその指定に合わせる。

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm --filter @tasuki/tasuki-sync test test/claude-cli-topic-provider.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する**

`ports/server-topic-provider.ts`:

```ts
import type { Difficulty, Language } from "@tasuki/topic-core";

/**
 * サーバー側の AI お題生成（#91）。戻り値は**未検証の値**であり、呼び出し側が
 * `validateTopicDraft` で検証する（AI 由来の値を信頼しない）。
 *
 * 失敗は `ProviderFailure`（`server-problem-provider.ts`）で投げる。PR 3 でこちらへ移す。
 */
export interface ServerTopicProvider {
  generate(language: Language, difficulty: Difficulty, signal: AbortSignal): Promise<unknown>;
}
```

`adapters/claude-cli-topic-provider.ts`: `adapters/claude-cli-problem-provider.ts` を**丸ごと写し**、次だけを変える（env の絞り込み・出力上限・stderr の伏せ字・二重 settle の防止・`ProviderFailure` の分類は**そのまま**残す。spec §5.3「引き継ぐもの」）:

- クラス名・注釈を topic へ
- `generate` の引数の型を `Language` / `Difficulty` に
- `buildProblemPrompt` → `buildTopicPrompt`
- 起動引数の末尾に、注釈つきで次を足す:

```ts
        // 組み込みツールを全部閉じる（docs/adr/0012 D10・spec T8 ①）。
        // 2026-08-13 に「注入 → Read ツールで /opt/tasuki/tasuki-sync.env を読む」経路が
        // 本番で成立した。既定の挙動に頼らず、ここで明示的に閉じる。
        // 本番の CLI（2.1.178）で init のツール一覧が空になることを実測済み（spec §10）。
        "--tools",
        "",
```

`SpawnFn` / `SpawnedProcess` / `extractJsonObject` も**このファイルに写して**持つ（旧ファイルから import しない。旧ファイルは PR 3 で消える）。

- [ ] **Step 4: 通ることを確かめる**

Run: `pnpm --filter @tasuki/tasuki-sync test test/claude-cli-topic-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/tasuki-sync
git commit -m "feat: お題の AI 生成の provider を足し、claude -p のツールを閉じる（#91）"
```

---

### Task 7: クールダウンの読み取りと、生成（`TopicGenerator`）

**Files:**
- Modify: `apps/tasuki-sync/src/application/ai-limits.ts`（`isCoolingDown` を足す）
- Create: `apps/tasuki-sync/src/application/topic-generation.ts`
- Test: `apps/tasuki-sync/test/ai-limits.test.ts`（足す）/ `test/topic-generation.test.ts`

**Interfaces:**
- Consumes: `TopicStore`（Task 5）、`ServerTopicProvider`（Task 6）、topic-core の遷移・`pickTopicFallback`・`validateTopicDraft`
- Produces:
  - `AiLimiter#isCoolingDown(roomCode: string): boolean`（**枠を取らない読み取り**）
  - `class TopicGenerator`:
    - `constructor(deps: { topics: TopicStore; clock: Clock; publish: (roomCode: string) => void; provider?: ServerTopicProvider; aiLimiter?: AiLimiter; aiTimeoutMs?: number; logger: Logger; refEncoder: RefEncoder })`
    - `request(roomCode: string, req: { mode: "ai" | "fallback"; language: Language; difficulty: Difficulty }): "started" | "cooldown"`
    - `cancel(roomCode: string): void`（進行中の生成を止める。**帳簿は触らない** —— 呼び出し側が次の状態を書く）
    - `cancelAll(): void`

**なぜ `isCoolingDown` が要るか**: `tryAcquire` は同時実行数をクールダウンより先に判定する。自分の生成中に作り直すと、`cooldown` ではなく `concurrent` が返る。spec §5.3 は「クールダウンの判定は中断より先」で、進行中の生成を残したまま拒否すると決めているので、枠を取らずに読む手段が要る。

- [ ] **Step 1: `isCoolingDown` の失敗するテストを書く**（`test/ai-limits.test.ts` の既存の時計のフェイクを使う）

```ts
it("isCoolingDown は枠を取らずにクールダウン中かだけを返す", () => {
  // Given（R1 で 1 度生成を始めた直後）
  const { limiter, clock } = makeLimiter(); // 既存テストの組み立てに合わせる
  const acquired = limiter.tryAcquire("R1");
  if (!acquired.ok) throw new Error("前提: 取得できる");
  acquired.release();

  // Then（R1 は 10 秒間クールダウン中。R2 は違う。読んでも日次の回数は増えない）
  const before = limiter.todayCount;
  expect([limiter.isCoolingDown("R1"), limiter.isCoolingDown("R2")]).toEqual([true, false]);
  expect(limiter.todayCount).toBe(before);

  // When（10 秒たつ）
  clock.advance(10_000);

  // Then
  expect(limiter.isCoolingDown("R1")).toBe(false);
});
```

- [ ] **Step 2: 実装する**（`ai-limits.ts`）

```ts
  /**
   * クールダウン中か（**枠を取らない読み取り**）。
   *
   * `tryAcquire` は同時実行数を先に見るので、自分の生成中に作り直すと `concurrent` が返り、
   * クールダウンを見分けられない。お題の作り直し（#91）は「クールダウンなら進行中の生成を
   * 残して拒否する」ので、中断する前にこれで判定する。
   */
  isCoolingDown(roomCode: string): boolean {
    const now = this.clock.now();
    this.rolloverIfNeeded(now);
    const last = this.lastStartByRoom.get(roomCode);
    return last !== undefined && now - last < this.cooldownMs;
  }
```

Run: `pnpm --filter @tasuki/tasuki-sync test test/ai-limits.test.ts` / Expected: PASS

- [ ] **Step 3: `TopicGenerator` の失敗するテストを書く**

`test/topic-generation.test.ts`。フェイクの provider は「呼ばれたら、外から解決・失敗させられる Promise を返す」ものにする。`problem-delegation.ai.test.ts` のフェイクと時計の組み立てに揃える。最低限、次のテストを書く（各テストは Given / When / Then の注釈つき）:

| テスト名 | 見るもの |
|---|---|
| 定型を求めると、その場で定型を掲げ、縮退しない（E7） | `request(…mode:"fallback")` の直後の `topics.get` が `source:"fallback"`・`degraded:false`・`generating:false`。`publish` が呼ばれた |
| AI を求めると生成中を配り、AI のお題で確定する（E8・E10） | 1 回目の `publish` の時点で `generating:true`。provider を `{title,body}` で解決すると `source:"ai"`・`generating:false` |
| AI が失敗したら定型へ落として縮退を立てる（E9） | provider を `ProviderFailure` で失敗させる → `source:"fallback"`・`degraded:true` |
| AI の出力が検証に落ちたら定型へ落とす（Review Focus 5） | provider を `{ title: "a".repeat(201), body: "" }` で解決 → `degraded:true` |
| 未解錠で AI を求めると、provider を呼ばずに定型へ落とす（E9） | `aiUnlocked:false` の状態で `mode:"ai"` → provider の呼び出し 0 回・`degraded:true` |
| 時間切れで定型へ落とす（E9） | `aiTimeoutMs: 10` と偽の時計で時間を進める → `degraded:true` |
| **作り直しがクールダウン中なら "cooldown" を返し、進行中の生成とお題を残す（E22）** | 1 回目を開始（provider は未解決のまま）→ 2 回目の `request` が `"cooldown"`・provider の呼び出しは 1 回のまま・`generating:true` のまま・1 回目の signal は abort されていない |
| **中断後に provider が解決しても保管に書かない（E11・Review Focus 3）** | 開始 → `cancel` → provider を解決 → `topics.get` のお題は開始前のまま・`publish` は開始時の 1 回だけ |
| 中断で子プロセスの signal が abort される | `cancel` の後、provider に渡した `signal.aborted` が true |
| 日次上限なら定型へ落として縮退する | `dailyLimit: 0` の limiter で `mode:"ai"` → `degraded:true` |
| ログにお題のタイトルが出ない（E14） | 失敗時に `logger` へ渡ったフィールドのどこにも AI が返したタイトルの文字列が無い（テスト用ロガー `test/support/test-logger.ts` を使う） |

- [ ] **Step 4: 失敗を確かめる**

Run: `pnpm --filter @tasuki/tasuki-sync test test/topic-generation.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 5: 実装する**

`application/topic-generation.ts`（`problem-delegation.ts` の `startServerGeneration` / `clearServer` / `failoverFromServer` / `classifyFailure` と同じ規則。**クライアント委譲の部分は写さない**）:

```ts
/**
 * お題の生成（#91）。サーバー生成と定型だけを持つ（クライアント委譲は廃止・spec T7）。
 *
 * **帳簿（`TopicState` の generating / degraded）の書き手はここと `topic-handlers.ts` だけ**。
 * 画面は推測しない（#283）。
 *
 * ⚠ **クールダウンの判定は中断より先に行う**（spec §5.3・E22）。先に中断すると、
 * 作り直しを拒んだのに進行中の生成だけが消える。`AiLimiter#tryAcquire` は同時実行数を
 * 先に見るので、自分の生成中の作り直しでは `cooldown` を返さない —— そのため
 * 枠を取らない `isCoolingDown` で先に読む。
 */
import {
  pickTopicFallback, settleWithAi, settleWithFallback, startGeneration, validateTopicDraft,
  type Difficulty, type Language, type Topic, type TopicState,
} from "@tasuki/topic-core";
import type { Clock } from "../ports/clock.js";
import type { TopicStore } from "../ports/topic-store.js";
import type { ServerTopicProvider } from "../ports/server-topic-provider.js";
import { ProviderFailure } from "../ports/server-problem-provider.js";
import type { AiLimiter } from "./ai-limits.js";
import type { Logger } from "./log/logger.js";
import type { RefEncoder } from "./log/ref-encoder.js";
import type { LogSafe } from "./log/log-safe.js";
import { AI_FAILURE_REASONS, AI_SKIP_REASONS } from "./log/vocabulary.js";

export interface GenerateRequest {
  mode: "ai" | "fallback";
  language: Language;
  difficulty: Difficulty;
}

export interface TopicGeneratorDeps {
  topics: TopicStore;
  /** 定型の選択の種（`pickTopicFallback` の `now`） */
  clock: Clock;
  /** 保管のあとに呼ぶ（宛先は呼び出し時点の名簿から決まる） */
  publish: (roomCode: string) => void;
  /** 省略時は AI 無効（トークンか合言葉が無い） */
  provider?: ServerTopicProvider | undefined;
  /** provider とセットで渡す。**timer の delegator と同じインスタンス**（上限はサーバー全体で 1 つ） */
  aiLimiter?: AiLimiter | undefined;
  /** 既定 60 秒 */
  aiTimeoutMs?: number | undefined;
  logger: Logger;
  refEncoder: RefEncoder;
}

interface ActiveGeneration {
  abort: AbortController;
  timer: ReturnType<typeof setTimeout>;
  release: () => void;
}

/** 失敗理由を既知の語彙へ畳む（例外メッセージをログへ出さない。ADR 0012 D5・D12） */
function classifyFailure(e: unknown): LogSafe {
  return e instanceof ProviderFailure ? AI_FAILURE_REASONS[e.reason] : AI_FAILURE_REASONS.other;
}

export class TopicGenerator {
  /** roomCode → 進行中のサーバー生成 */
  private readonly active = new Map<string, ActiveGeneration>();
  private readonly aiTimeoutMs: number;

  constructor(private readonly deps: TopicGeneratorDeps) {
    this.aiTimeoutMs = deps.aiTimeoutMs ?? 60_000;
  }

  request(roomCode: string, req: GenerateRequest): "started" | "cooldown" {
    const state = this.deps.topics.get(roomCode);
    if (state === undefined) return "started"; // ルームが無い。何もしない
    const wantsAi = req.mode === "ai" && state.aiUnlocked && this.deps.provider !== undefined;

    if (wantsAi && this.deps.aiLimiter?.isCoolingDown(roomCode) === true) return "cooldown";

    this.cancel(roomCode);
    const previous = state.topic;

    if (req.mode === "fallback") {
      this.write(roomCode, (s) => settleWithFallback(s, this.fallback(req, previous), false));
      return "started";
    }
    if (!wantsAi) {
      // 未解錠・AI 無効。provider を呼ばずに縮退する（E9）
      this.write(roomCode, (s) => settleWithFallback(s, this.fallback(req, previous), true));
      return "started";
    }
    const acquired = this.deps.aiLimiter!.tryAcquire(roomCode);
    if (!acquired.ok) {
      this.deps.logger.warn("ai.skip", {
        room: this.deps.refEncoder.room(roomCode),
        reason: AI_SKIP_REASONS[acquired.reason],
      });
      this.write(roomCode, (s) => settleWithFallback(s, this.fallback(req, previous), true));
      return "started";
    }
    this.write(roomCode, startGeneration);
    this.runAi(roomCode, req, previous, acquired.release);
    return "started";
  }

  /** 進行中の生成を止める。**帳簿は触らない**（次の状態は呼び出し側が書く） */
  cancel(roomCode: string): void {
    const gen = this.active.get(roomCode);
    if (gen === undefined) return;
    this.active.delete(roomCode);
    clearTimeout(gen.timer);
    gen.abort.abort();
    gen.release();
  }

  cancelAll(): void {
    for (const code of [...this.active.keys()]) this.cancel(code);
  }

  private runAi(roomCode: string, req: GenerateRequest, previous: Topic | null, release: () => void): void {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.aiTimeoutMs);
    const gen: ActiveGeneration = { abort, timer, release };
    this.active.set(roomCode, gen);

    // **自分の生成であることを確かめてから書く**（中断・作り直しの後に届いた結果を捨てる。E11）
    const isCurrent = (): boolean => this.active.get(roomCode) === gen;
    const finish = (): void => {
      this.active.delete(roomCode);
      clearTimeout(timer);
      release();
    };
    const failover = (reason: LogSafe): void => {
      if (!isCurrent()) return;
      finish();
      this.deps.logger.warn("ai.fail", { room: this.deps.refEncoder.room(roomCode), reason });
      this.write(roomCode, (s) => settleWithFallback(s, this.fallback(req, previous), true));
    };

    this.deps.provider!
      .generate(req.language, req.difficulty, abort.signal)
      .then((raw) => {
        if (!isCurrent()) return;
        const draft = validateTopicDraft(raw);
        if (draft.isErr()) {
          failover(AI_FAILURE_REASONS.invalid);
          return;
        }
        finish();
        this.write(roomCode, (s) => settleWithAi(s, { ...draft.value, source: "ai" }));
      })
      .catch((e: unknown) => failover(classifyFailure(e)));
  }

  private fallback(req: GenerateRequest, previous: Topic | null): Topic {
    return pickTopicFallback(req.language, req.difficulty, this.deps.clock.now(), previous);
  }

  /** 保管から引き直して遷移を当て、保管してから配る。**ルームが消えていたら書かない** */
  private write(roomCode: string, next: (s: TopicState) => TopicState): void {
    const current = this.deps.topics.get(roomCode);
    if (current === undefined) return;
    this.deps.topics.put(roomCode, next(current));
    this.deps.publish(roomCode);
  }
}
```

`ProviderFailure` の `reason` の型と `AI_FAILURE_REASONS` のキーが一致していることは `problem-delegation.ts` の `classifyFailure` が既に前提にしている。型検査が落ちたら、その関数と同じ書き方に合わせる。

**ログのフィールドにはタイトル・本文・言語・難易度を入れない**（E14。入れてよいのは相関 ID と語彙 `AI_SKIP_REASONS` / `AI_FAILURE_REASONS` だけ）。

- [ ] **Step 6: 通ることを確かめる**

Run: `pnpm --filter @tasuki/tasuki-sync test test/topic-generation.test.ts test/ai-limits.test.ts && node scripts/audit-log-hygiene.mjs`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/tasuki-sync
git commit -m "feat: お題の生成を足す（クールダウンは中断より先に判定する）（#91）"
```

---

### Task 8: 接続層に `topic` の振り分けと送出を足す

**Files:**
- Create: `apps/tasuki-sync/src/ports/topic-server-msg.ts`
- Modify: `apps/tasuki-sync/src/adapters/ws-adapter.ts`
- Test: `apps/tasuki-sync/test/ws-adapter-tool-query.test.ts`（足す）/ `test/ws-adapter.message.test.ts`（足す）

**Interfaces:**
- Produces:
  - `ports/topic-server-msg.ts` の `type TopicServerMsg`（下のコード。アダプタとアプリ層の両方が使うのでポートに置く）
  - `protocolFromRequestUrl` の戻り値に `"topic"`
  - `WsAdapterOptions.onTopicMessage: (connId: string, raw: string) => Promise<void>`（ハブと同じく**パース前の文字列**）
  - `WsAdapter#sendTopic(connId: string, msg: TopicServerMsg): void` と `WsAdapter#broadcastTopic(connIds: string[], msg: TopicServerMsg): void`

```ts
// ports/topic-server-msg.ts
import type * as v from "valibot";
import type { HubServerMsg } from "@tasuki/room-core";
import type { TopicErrorFrameSchema, TopicFrameSchema } from "@tasuki/topic-core";

/**
 * お題の接続へ送るフレーム（#91）。`room.joined` はハブと同じ形を返すので `HubServerMsg` を含む。
 * **ハブの接続へ `topic` フレームを送るときもこの型で送る**（玄関は契約に合わないフレームを黙って捨てる）。
 */
export type TopicServerMsg =
  | v.InferOutput<typeof TopicFrameSchema>
  | v.InferOutput<typeof TopicErrorFrameSchema>
  | HubServerMsg;
```
  - **`topic` の接続は `onConnect` / `onDisconnect` を通る**（`protocol === "poker"` の早期 return に `topic` を**足さない**）

- [ ] **Step 1: 失敗するテストを書く**

`test/ws-adapter-tool-query.test.ts` の既存の形に揃えて足す:

- `?tool=topic` の接続は `topic` と判定される
- `?tool=topic` の接続で `onConnect` が `(connId, rateKey)` で 1 回呼ばれ、閉じると `onDisconnect` が 1 回呼ばれる（**poker の形を写していないことを見る**。spec §5.3 の MUST）
- `?tool=topic` の接続へ送った生テキストは `onTopicMessage` に届き、`onMessage`（timer）と `onHubMessage` には届かない
- `?tool=topic` の接続へ 64KB を超えるテキストを送ると `onTopicMessage` は呼ばれず、`{ type: "error", code: "INVALID_COMMAND" }` が返る（ハブのサイズ超過の扱いに揃える。ハブがどのコードを返しているかを先に読み、同じにする）

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm --filter @tasuki/tasuki-sync test test/ws-adapter-tool-query.test.ts test/ws-adapter.message.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

- `protocolFromRequestUrl` に `if (declared === TOOL_TOPIC) return TOOL_TOPIC;` を足し、戻り値の型と `ConnectionData.protocol` の型に `"topic"` を足す（注釈の「4 値の選択子」を「5 値」に直す）
- `handleMessage` の `if (ws.data.protocol === "hub")` の直後に、`handleHubMessage` と同じ形の `handleTopicMessage` への分岐を足す（サイズ判定 → `onTopicMessage(connId, raw.toString())` を `.catch` と `try/catch` で隔離）
- `sendHub` / `broadcastHub` と同じ形で `sendTopic` / `broadcastTopic` を足す
- 受理（`handleOpen`）と切断（`handleClose`）は**変えない**。`topic` は poker の分岐に入らないので、そのまま `onConnect` / `onDisconnect` を通る。**そのことを受理処理の poker の分岐の直前に注釈で書く**:

```ts
    // ⚠ **お題（topic）をこの分岐に足してはならない**（#91・spec §5.3 の MUST）。
    // ここで return すると onConnect が呼ばれず、`rateLimitGate.open` が接続とクライアント鍵を
    // 結ばない。すると鍵は connId へ落ち、`ai.unlock` の総当たりが**張り直すだけで**
    // 枠を回避できる（2026-09-23 のレビューで見つかった）。
```

- [ ] **Step 4: 通ることを確かめる**

Run: `pnpm --filter @tasuki/tasuki-sync test test/ws-adapter-tool-query.test.ts test/ws-adapter.message.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/tasuki-sync
git commit -m "feat: 接続層にお題ツールの振り分けと送出を足す（#91）"
```

---

### Task 9: お題の接続のメッセージ層と、組み立て

**Files:**
- Create: `apps/tasuki-sync/src/application/topic-broadcast.ts` / `src/application/topic-handlers.ts`
- Modify: `apps/tasuki-sync/src/create-sync-server.ts` / `src/application/hub-handlers.ts` / `src/application/destroy-room.ts`
- Test: `apps/tasuki-sync/test/topic-handlers.test.ts` / `test/destroy-room.test.ts`（足す）

**ルーム破棄の後始末**（E6・Review Focus 3）: `RoomDestroyerDeps` に `topics: Pick<TopicStore, "remove">` と `topicGenerator: { cancel(roomCode: string): void }` を**必須**で足す（省略可にすると配線し忘れが緑で通る）。破棄の本体で、**既存の `delegator?.cancel(roomCode)` の直後**に `deps.topicGenerator.cancel(roomCode)`、保管の解放の並びに `deps.topics.remove(roomCode)` を足す。注釈は「生成の中断は保管の解放より先。中断した生成が消えたルームへ書き戻さないため（`TopicGenerator#write` は状態が無ければ書かないが、子プロセスは止まらない）」。

`test/destroy-room.test.ts` に足すテスト（既存のテストの依存の組み立てに揃える。既存の `createRoomDestroyer` 呼び出しにも新しい 2 つをフェイクで渡す。組み立てが各テストに散っていれば関数へ切り出してから使う）:

```ts
it("破棄でお題の状態を消し、進行中の生成を中断する（E6・Review Focus 3）", () => {
  // Given
  const removed: string[] = [];
  const cancelled: string[] = [];
  const destroy = createRoomDestroyer({
    ...baseDeps(),
    topics: { remove: (code) => removed.push(code) },
    topicGenerator: { cancel: (code) => cancelled.push(code) },
  });

  // When
  destroy("ROOM01");

  // Then
  expect({ removed, cancelled }).toEqual({ removed: ["ROOM01"], cancelled: ["ROOM01"] });
});
```

**Interfaces:**
- Consumes: Task 5〜8 のすべて。`joinRoom`（`join-room.ts`）、`findParticipantByConnId` / `connectionsIn`（`@tasuki/room-core`）、`HubCommandSchema`（`room.join` の形）、`handlers.rateLimitGate`、`constantTimeEqual`（`secure-compare.ts`）
- Produces:
  - `topic-broadcast.ts`: `TOPIC_RECIPIENT_TOOLS: readonly (ToolId | null)[] = [TOOL_TOPIC, null]`（**PR 3 で timer・poker を足す**）、`makeTopicBroadcaster({ store, topics, send })` → `{ publish(roomCode): void; sendCurrent(connId, roomCode): void }`
  - `topic-handlers.ts`: `makeTopicHandlers(deps)` → `{ handleMessage(connId: string, raw: string): Promise<void> }`
  - `hub-handlers.ts`: 作成・参加の成功時に `topicBroadcaster.sendCurrent(connId, code)` を呼ぶ（E4 のハブ側）

**メッセージ層の振る舞い**（spec §5.3）:

| 受信 | 振る舞い |
|---|---|
| JSON でない | `error` / `INVALID_JSON` |
| `command === "room.join"` | `HubCommandSchema` で検証（`room.create` / `room.check` は `INVALID_COMMAND`）→ 表示名の規約（`applyDisplayNameRule`）→ `joinRoom(deps, { …, tool: TOOL_TOPIC })` → 成功なら `room.joined` を本人へ、名簿を保存・配信（`saveRoster`）、**お題の状態が無ければ `INITIAL_TOPIC_STATE` を置き**、本人へ現在のお題を 1 通（E4）。失敗は hub と同じ文言の引き方で `error` |
| それ以外 | `TopicCommandSchema` で検証（落ちたら `INVALID_COMMAND`）→ 接続の在室者を引く（`store.list()` を走査して `findParticipantByConnId`。`presence.ts` と同じ引き方）。居なければ `NOT_IN_ROOM`（Review Focus 1） |
| `topic.set` | `generator.cancel` → `setManualTopic` → 保管 → `publish` |
| `topic.clear` | `generator.cancel` → `clearTopic` → 保管 → `publish` |
| `topic.generate` | `generator.request(...)` が `"cooldown"` なら本人へ `GENERATION_COOLDOWN` |
| `ai.unlock` | `rateLimitGate.shouldReject(connId, performance.now())` なら `RATE_LIMITED` → 合言葉を `constantTimeEqual` で照合（**AI 無効（合言葉が未設定）でも不一致と同じ `AI_UNLOCK_FAILED`**。存在の秘匿）→ 失敗なら `rateLimitGate.consume` して `AI_UNLOCK_FAILED`、成功なら `unlockAi` → 保管 → `publish`。**`ai-unlock.ts` の手順（照合の前にレート判定・失敗だけ積算・単調時計）をそのまま写す** |

**文言**は `topic-handlers.ts` に `TOPIC_ERROR_MESSAGES: Record<TopicErrorCode, string>` として持つ（timer の同じコードの文言があればそれと同じ文にする。`errorMessageFor` を読んで揃える）。

- [ ] **Step 1: 失敗するテストを書く**（`test/topic-handlers.test.ts`。依存はフェイク・スパイで組む。`test/support/spy-broadcaster.ts` と `room-builder.ts` の使い方に揃える）

最低限:

- 参加前の `topic.set` は `NOT_IN_ROOM` で、どのルームのお題も変わらない（Review Focus 1）
- `room.join` の成功で、本人へ `room.joined` と現在のお題（初回は `INITIAL_TOPIC_STATE`）が届く（E4）
- `room.create` を送ると `INVALID_COMMAND`（お題の接続はルームを作らない）
- `topic.set` で状態が `source: "manual"` になり、`publish` が 1 回呼ばれる（E2 の単体側）
- `topic.clear` で `topic: null` になる（E3）
- 生成中の `topic.set` は `generator.cancel` を先に呼ぶ（E11。呼び出し順を記録して見る）
- `topic.generate` が `"cooldown"` を返したら本人に `GENERATION_COOLDOWN` が届き、`publish` は呼ばれない（E22）
- `ai.unlock` の成功で `aiUnlocked: true`、失敗で `AI_UNLOCK_FAILED`、合言葉未設定でも `AI_UNLOCK_FAILED`
- `ai.unlock` の失敗は `rateLimitGate.consume` を呼び、成功は呼ばない
- **`topic-broadcast` の `publish` は、お題の接続とハブの接続にだけ送り、timer・poker の接続には送らない**（この PR の配信先。spec §9）

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm --filter @tasuki/tasuki-sync test test/topic-handlers.test.ts test/destroy-room.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`topic-broadcast.ts`:

```ts
/**
 * お題の状態を配る（#91・spec T3）。
 *
 * **配信先は PR ごとに広げる**（spec §9）。いまはお題の接続とハブの接続だけ ——
 * 玄関は契約に合わないフレームを黙って捨てるので、まだ読めなくても害が無い。
 * timer と poker は捨てたことを利用者へ通知する（#209・#212）ので、PR 3 で両者が
 * `topic` フレームを読めるようになってから足す。
 *
 * 宛先は**呼び出し時点の名簿**から決まる（`create-sync-server.ts` の `recipientsOf` と同じ規則）。
 * 保管より先に配ると 1 つ前の名簿に送ることになるので、**保管のあとに呼ぶ**。
 */
export const TOPIC_RECIPIENT_TOOLS: readonly (ToolId | null)[] = [TOOL_TOPIC, null];
```

`create-sync-server.ts` の組み立て（既存の順序と注釈の書き方に揃える）:

1. `const topics = new InMemoryTopicStore();`
2. `aiReady` のときだけ `new ClaudeCliTopicProvider({ token, model })`（Task 0 で「入れない」と決まったら常に `undefined`）
3. `topicBroadcaster = makeTopicBroadcaster({ store, topics, send: (ids, msg) => wsAdapter.broadcastTopic(ids, msg) })`
4. `topicGenerator = new TopicGenerator({ topics, clock, publish: topicBroadcaster.publish, provider, aiLimiter, aiTimeoutMs: config.aiGenerationTimeoutMs, logger, refEncoder })` —— **`aiLimiter` は timer の `delegator` と同じインスタンス**（日次上限と同時実行数はサーバー全体で 1 つ）
5. `createRoomDestroyer` に `topics` と `topicGenerator` を渡す
6. `makeTopicHandlers({ store, timers, clock, codeGen, tokenStore: tokens, rateLimitGate: handlers.rateLimitGate, topics, generator: topicGenerator, broadcaster: topicBroadcaster, send: (id, msg) => wsAdapter.sendTopic(id, msg), aiUnlockKey: aiReady ? config.aiUnlockKey : undefined })` —— **`rateLimitGate` は `handlers.rateLimitGate` を渡す。新しく作らない**（`makeHubHandlers` の注釈と同じ理由を注釈に書く）
7. `WsAdapter` に `onTopicMessage: async (connId, raw) => { await topicHandlers.handleMessage(connId, raw); }`
8. `close()` に `topicGenerator.cancelAll();`
9. `makeHubHandlers` に `topicBroadcaster` を渡し、作成・参加の成功時に `sendCurrent` を呼ぶ

**ルームの作成時にもお題の状態を置く**: お題の状態は「最初にお題の接続が参加したとき」か「ハブの `sendCurrent` が呼ばれたとき」に `INITIAL_TOPIC_STATE` で置く（無ければ置く）。`TopicGenerator` の `write` は状態が無いと書かないので、置かれていないルームへの生成は起きない。

- [ ] **Step 4: 通ることを確かめる**

```bash
pnpm --filter @tasuki/tasuki-sync test
pnpm --filter @tasuki/tasuki-sync typecheck
```

Expected: 全部 PASS（**既存のテストも含む**）

- [ ] **Step 5: Commit**

```bash
git add apps/tasuki-sync
git commit -m "feat: お題ツールの接続のメッセージ層を組み立てる（#91）"
```

---

### Task 10: 実 WebSocket の結合テスト

**Files:**
- Modify: `apps/tasuki-sync/test/support/live-sync-server.ts`（`LiveTopicClient` と `connectTopic`）
- Create: `apps/tasuki-sync/test/live-ws.topic.test.ts`

**Interfaces:**
- Produces: `LiveSyncServer#connectTopic(label?, headers?): Promise<LiveTopicClient>`（`?tool=topic`）。`LiveTopicClient` は `LiveHubClient` と同じ形（`send(msg: unknown)` / `take(predicate, what)` / `close()`）で、受信の型は `TopicServerMsg`

- [ ] **Step 1: 支援コードを足す**（`LiveHubClient` / `connectHub` を写して `topic` にする。`close()` の後始末の並びにも足す）

- [ ] **Step 2: 失敗するテストを書く**

`test/live-ws.topic.test.ts` —— 最低限:

| テスト名 | 手順と期待 |
|---|---|
| ハブで作ったルームへお題ツールが参加でき、現在のお題（なし）が届く（E1・E4） | ハブで `room.create` → 同じ復帰の組でお題の接続が `room.join` → `room.joined` と `{type:"topic", state: INITIAL_TOPIC_STATE}` |
| お題ツールで掲げると、同じルームのハブとお題の接続に同じ状態が届く（E2） | ハブの接続・お題の接続 2 本（別の人）を用意 → 片方が `topic.set` → 3 本すべてに同じ `state.topic` |
| **timer・poker の接続にはこの PR では届かない**（spec §9） | 同じルームに timer の接続を入れておく → `topic.set` の後、timer の接続の受信に `type:"topic"` が無い（ハブ側に届いたことを確かめてから見る。**届く前に「無い」を見ると空振りの緑になる**） |
| **timer の接続から `topic.set` を送っても拒否され、お題は変わらない（E5）** | timer の接続で `{command:"topic.set",…}` → `INVALID_COMMAND`。お題の接続が新しく参加して受け取る状態が `topic: null` のまま |
| 2 本のお題の接続の片方を閉じても、もう片方に届く（Review Focus 2） | 同じ人が 2 本 → 1 本を閉じる → 別の人が `topic.set` → 残った 1 本に届く |
| **合言葉の失敗は、張り直しても枠が続く（E21）** | `startLiveSyncServer({ AI_UNLOCK_KEY: "right", CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-dummy" })`（トークンと合言葉が揃わないと AI 無効で、それでも失敗の応答は同じだが、**積算が起きる経路を確実に通すため揃える**）。同じ `x-forwarded-for` のお題の接続で `ai.unlock` の失敗を `DEFAULT_CAPACITY + 1` 回 → 最後が `RATE_LIMITED` → 閉じて張り直し → 3 回試すと `RATE_LIMITED` が混じる。**逆向き**: 同じ IP の timer の接続の `room.join` も `JOIN_RATE_LIMITED` を返す |
| ルームが消えるとお題も消える（E6） | 全員が退出してルームが破棄される → 同じコードへお題の接続が `room.join` → `ROOM_NOT_FOUND` |

`test/live-ws.rate-limit.test.ts` の `drainBadUnlocks` / `lastErrorCodes` の書き方に揃える。

- [ ] **Step 3: 失敗を確かめてから通す**

Run: `pnpm --filter @tasuki/tasuki-sync test test/live-ws.topic.test.ts`
Expected: Task 9 までが正しければ、ここは**初回から PASS しうる**（結合テストは配線の確認である）。**PASS したら、E21 のテストが本当に張り直しを見ているかを Task 12 の変異 m82（受理で return する）で確かめる**。FAIL したら原因を直す（テストを緩めない）

- [ ] **Step 4: Commit**

```bash
git add apps/tasuki-sync/test
git commit -m "test: お題ツールの接続を実 WebSocket 越しに確かめる（#91）"
```

---

### Task 11: 検査を全部回す

- [ ] **Step 1: 全体を回す**

```bash
pnpm test
pnpm -r typecheck
pnpm -r lint
node scripts/audit-structure.mjs
node scripts/audit-log-hygiene.mjs
node scripts/audit-assembly-wiring.mjs
node scripts/audit-domain-error-shape.mjs
node scripts/audit-domain-side-effects.mjs
node scripts/audit-dependency-direction.mjs
node scripts/check-links.mjs
bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'
```

Expected: すべて成功。**出力を `| head` / `| tail` で切らずに終了コードを見る**（パイプは終了コードを隠す）

- [ ] **Step 2: 赤があれば直してコミットする**（`topic-core` が走査対象・公開契約・ログ衛生の射程に入っていないことで落ちるものは、その検査の登録を足す）

```bash
git add -A && git commit -m "chore: お題の文脈を検査の射程へ登録する（#91）"
```

---

### Task 12: 変異検査（原則 VII）

**Files:**
- Create: `scripts/mutations/m76-*.patch` 〜 `m83-*.patch`
- Modify: `scripts/mutation-check.mjs`（`MUTATIONS` の末尾に 8 件）

**変異 ID は既存の最大値（75）の次から採る。** 並びに頼らず `grep -o -E '^\s+id: [0-9]+' scripts/mutation-check.mjs | sort -n | tail -1` で確かめてから採番する。

| ID | 変異 | 赤になるべきテスト |
|---|---|---|
| 76 | `schemas.ts` の `language: v.picklist(LANGUAGES)` を `v.pipe(v.string(), v.minLength(1))` にする | `packages/topic-core/tests/schemas.test.ts`（E13） |
| 77 | `claude-cli-topic-provider.ts` の起動引数から `"--tools", ""` を消す | `test/claude-cli-topic-provider.test.ts`（E12） |
| 78 | `topic-handlers.ts` の `topic.set` で `generator.cancel` を呼ばない | `test/topic-handlers.test.ts`（E11） |
| 79 | `topic-generation.ts` の `isCoolingDown` の判定を `cancel` の後ろへ移す | `test/topic-generation.test.ts`（E22） |
| 80 | `destroy-room.ts` の `topicGenerator.cancel(roomCode)` を消す | `test/destroy-room.test.ts`（E6） |
| 81 | `create-sync-server.ts` で `makeTopicHandlers` に `createRateLimitGate(...)` で作った新しいゲートを渡す | `test/live-ws.topic.test.ts`（E21） |
| 82 | `ws-adapter.ts` の受理処理で `if (ws.data.protocol === "poker" \|\| ws.data.protocol === "topic") return;` にする | `test/live-ws.topic.test.ts`（E21 の張り直し）・`test/ws-adapter-tool-query.test.ts` |
| 83 | `ws-adapter.ts` の timer の `onMessage` の分岐で、`TopicCommandSchema` にも合うメッセージを `onTopicMessage` へ流す | `test/live-ws.topic.test.ts`（E5） |

**「お題のコマンドを timer のスキーマに足す」変異は置かない**（spec §7.3。スキーマを通っても `buildDomainCommand` が null を返してお題は変わらず、E5 は緑のまま残る恒真の変異である）。

- [ ] **Step 1: 作業ツリーが空であることを確かめる**

```bash
git status --porcelain
```

Expected: 何も出ない。**出たら先にコミットする**（変異パッチを作る手順は `git checkout --` で未コミットの変更を消しうる。過去 4 度実装を消している）

- [ ] **Step 2: 1 件ずつ、壊して・パッチを取り・戻す**

```bash
# 例: m76
$EDITOR packages/topic-core/src/schemas.ts        # 変異を手で入れる
git diff > scripts/mutations/m76-topic-language-not-enumerated.patch
git checkout -- packages/topic-core/src/schemas.ts
git status --porcelain                              # パッチ以外が出ないこと
```

- [ ] **Step 3: `MUTATIONS` に登録する**（既存の項目と同じ形。`note` には spec の EARS 番号と「何が起きるか」を書く）

```js
  {
    id: 76,
    label: "お題の生成の言語を列挙で検証しない",
    patch: "m76-topic-language-not-enumerated.patch",
    pkg: "packages/topic-core",
    tests: ["tests/schemas.test.ts"],
    note:
      "#91・E13・docs/adr/0012 D10。プロンプトへ任意の文字列が届く。" +
      "2026-08-13 に持ち出し経路が本番で成立した入口である。",
  },
```

- [ ] **Step 4: 登録をコミットする**（`mutation-check.mjs` は作業ツリーが空でないと走らない）

```bash
git add scripts/mutation-check.mjs scripts/mutations
git commit -m "test: お題の文脈の守りに変異検査を足す（#91）"
```

- [ ] **Step 5: 全変異を回す**（絞り込みのオプションは無い。既定は「対応表のテストだけ」を全変異について回す）

```bash
node scripts/mutation-check.mjs; echo "exit=$?"
```

Expected: `exit=0`。新しい 8 件がどれも「対照で緑・変異で赤」。**`| head` / `| tail` を付けない**（SIGPIPE で中断しても exit 0 に見える）。

- 新しい変異が緑のまま残った → そのテストを、正しい実装と誤った実装で値が分かれる局面へ置き直す（テストを消さない・緩めない）
- **既存の変異のパッチが当たらない** → 製品コードを触ったため（`ws-adapter.ts` / `create-sync-server.ts` / `ai-limits.ts`）。同じ変異を今のコードに入れ直してパッチを作り直す。**当たらないパッチでスクリプトが止まると、それ以降の変異がすべて無検査になる**（#276 で 2 度）

直したらコミットして、もう一度 Step 5 を回す。

---

### Task 13: 押す前の確認と PR

- [ ] **Step 1: 独立したレビュー**を回す（`/code-review` に PR 番号を明示する。**採点が走っている間は直さない**）

- [ ] **Step 2: PR を作る**（本文は `docs/guides/` の PR の粒度・`.claude/rules/git-workflow.md` の形。`Closes` は書かない —— #91 は PR 3 で閉じる。`Refs #91` にする）

- [ ] **Step 3: PR 3 の計画へ申し送る事項を PR 本文に書く**
  - `ProviderFailure` を `server-topic-provider.ts` へ移す（旧 `server-problem-provider.ts` の削除時）
  - `TOPIC_RECIPIENT_TOOLS` に timer・poker を足す
  - `docs/adr/0012` D10・`0011` の完了の記録と S9 の改定
