# 公開面とテスト規約の未達を解消する 実装計画（#72 E6 / #168）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 構造監査の未達指標（SC029・SC030・SC031・SC032・SC039③）を 0 にし、`packages/poker-core/src/index.ts` の `export *` を明示列挙へ置き換える。

**Architecture:** 3 つの作業面に分かれる。①`packages/timer-core` の公開面を縮める（`export` 修飾子を外し、`index.ts` の列挙から落とす）。②`packages/poker-core` の `export *` を 43 記号の明示列挙へ置き換え、`export *` を禁じる機械検査を新設する。③テスト 60 ファイルの名前・前提・区切りを規範へ寄せ、その規範を ADR-0006 へ昇格させる。**製品の振る舞い・公開 URL・WS プロトコルは 1 文字も変えない。**

**Tech Stack:** TypeScript 6 / pnpm workspace / vitest（timer 系・packages）/ bun:test（poker-sync）/ Node 標準の `node:test`（`scripts/*.test.mjs`）/ turbo

**Spec:** [`docs/superpowers/specs/2026-08-19-public-surface-and-test-conventions-design.md`](../specs/2026-08-19-public-surface-and-test-conventions-design.md)

## Global Constraints

- **作業クローンは `/home/vscode/tasuki-work`**。ブランチは `refactor/168-public-surface-and-test-conventions`（作成済み・設計正本のコミット `06ccae1` が載っている）
- **PR は 1 本**（ADR-0013 決定 1 の既定）。危険度の違いはコミットの切り方で表す
- **依存を 1 つも足さない。** 検査スクリプトは Node 標準の `fs` / `path` のみ
- コメント・docstring・コミットメッセージ・PR 本文はすべて**日本語**
- コミットは Conventional Commits（`feat` / `fix` / `docs` / `refactor` / `test` / `chore`）
- **コミットしたら即 push する。** まとめて後で、はしない
- **数値の正本は設計正本の「実測」節。** コミットメッセージ・PR 本文へ数値を転記しない
- 新しい検査を足したら**わざと壊して赤を見る**（ADR-0006 決定 3）。壊す前と後の両方を数え、`grep -cF`（固定文字列）で壊れたことを先に確認する
- 実装を書き換えたら**変異で恒真化を確かめる**（ADR-0006 決定 4）
- `git checkout -- .` で実験を巻き戻したら、必ず `git status --porcelain` が空であることを確認する

---

## File Structure

| ファイル | 責務 |
|---|---|
| `packages/timer-core/src/events.ts` | ドメインイベント。24 インターフェースを非公開へ。`DomainEvent` は公開のまま |
| `packages/timer-core/src/errors.ts` | ドメインエラー。4 インターフェースを非公開へ。`DomainError` / `ErrorCode` / `SYNC_ERROR_CODES` は公開のまま |
| `packages/timer-core/src/participants.ts` | 参加者の不変条件。`countManagers` を非公開へ |
| `packages/timer-core/src/schemas.ts` | 境界検証スキーマ。`SessionConfigSchema` を非公開へ |
| `packages/timer-core/src/index.ts` | 公開面の正本。30 記号を列挙から落とす |
| `packages/poker-core/src/index.ts` | 公開面の正本。`export *` 7 行 → 43 記号の明示列挙 |
| `scripts/audit-public-surface.mjs` | **新設**。走査対象のエントリに `export *` が無いことを見る |
| `scripts/audit-public-surface.test.mjs` | **新設**。上の自己テスト |
| `scripts/audit-structure.mjs` | 構造監査。SC-039③ の例外表と、その健全性検査を足す |
| `scripts/audit-structure.test.mjs` | 構造監査の自己テスト。例外表のケースを足す |
| `.github/workflows/ci.yml` | `quality` ジョブへ `audit-public-surface` の 1 ステップを足す |
| `docs/guides/development.md` | 「検査系」節のコマンド一覧へ 1 行足す |
| `docs/adr/0006-test-conventions.md` | テスト規約。名前と前提の 2 項を決定へ足す |
| `docs/adr/0016-core-domain-representation.md` | core の表現。`export *` 検査の射程を追記 |
| `docs/timer/adr/0009-test-conventions.md` | 規範が ADR-0006 へ昇格した旨を追記 |
| テスト 60 ファイル | 名前・前提・区切りの修正 |

**検査を 1 本足すと 4 箇所を触る**（スクリプト・自己テスト・`ci.yml`・`development.md`）。
このうち自己テストだけが git から導出され、残り 3 箇所は手で書く。
**4 箇所が揃っているかを見る検査は存在しない**（設計正本「何を見ていないか」）。Task 5 で 4 箇所すべてを触る。

---

### Task 1: 参照されていない 28 記号を非公開にする

**Files:**
- Modify: `packages/timer-core/src/events.ts`（24 インターフェースの `export` を外す）
- Modify: `packages/timer-core/src/errors.ts`（4 インターフェースの `export` を外す）
- Modify: `packages/timer-core/src/index.ts`（28 行を `export type { … }` から落とす）

**Interfaces:**
- Consumes: なし
- Produces: `packages/timer-core/src/index.ts` から次の 28 記号が消える。以降のタスクはこれらを import しない

**対象の 28 記号**（`packages/timer-core/src/index.ts` の「// イベント」「// エラー」ブロックから落とす）:

```
events.ts (24): SessionStarted DriverSwitched SessionPaused SessionResumed SessionReset
                DriverTimerReset PhaseSet ConfigSet MemberAdded MemberRemoved MemberMoved
                MembersShuffled ProblemSet HandoffNoteSet BreakStarted BreakEnded
                SessionCompleted SessionAborted ProxyMemberAdded ParticipantRenamed
                DriverSkipped DriverResumed ProblemEdited ProblemModeSet
errors.ts  (4): Unauthorized PhaseConflict InvalidIndex InputLimitExceeded
```

**残すもの**: `events.ts` の `DomainEvent`、`errors.ts` の `EmptyName` `DuplicateName` `MemberLimitExceeded` `BelowMinMembers` `InvalidInterval` `DomainError` `ErrorCode` `SYNC_ERROR_CODES`。

- [ ] **Step 1: 変更前の値を記録する**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC039
# 期待: 分岐 0 / データ 0 行 / 公開記号 34 件
grep -c "^export interface" packages/timer-core/src/events.ts
# 期待: 24
grep -c "^export interface" packages/timer-core/src/errors.ts
# 期待: 9
```

- [ ] **Step 2: `events.ts` の 24 インターフェースから `export` を外す**

`DomainEvent`（`export type DomainEvent = …`）には触らない。`export interface X {` → `interface X {`。

```bash
cd /home/vscode/tasuki-work
sed -i 's/^export interface /interface /' packages/timer-core/src/events.ts
grep -c "^export interface " packages/timer-core/src/events.ts   # 期待: 0
grep -c "^interface " packages/timer-core/src/events.ts          # 期待: 24
grep -c "^export type DomainEvent" packages/timer-core/src/events.ts  # 期待: 1
```

- [ ] **Step 3: `errors.ts` の 4 インターフェースだけ `export` を外す**

`errors.ts` は 9 インターフェースを持ち、**外すのは 4 つだけ**。一括 `sed` は使わない。

```bash
cd /home/vscode/tasuki-work
for n in Unauthorized PhaseConflict InvalidIndex InputLimitExceeded; do
  before=$(grep -cF "export interface $n " packages/timer-core/src/errors.ts)
  sed -i "s/^export interface $n /interface $n /" packages/timer-core/src/errors.ts
  after=$(grep -cF "export interface $n " packages/timer-core/src/errors.ts)
  echo "$n: 変更前=$before 変更後=$after（1 → 0 なら成功）"
done
grep -c "^export interface " packages/timer-core/src/errors.ts   # 期待: 5
```

- [ ] **Step 4: `index.ts` から 28 行を落とす**

`// イベント` ブロックの `export type { … } from "./events.js";` から 24 行、
`// エラー` ブロックの `export type { … } from "./errors.js";` から 4 行を消す。
`DomainEvent,` と `DomainError,` `ErrorCode,` の行は**残す**。

```bash
cd /home/vscode/tasuki-work
for n in SessionStarted DriverSwitched SessionPaused SessionResumed SessionReset \
         DriverTimerReset PhaseSet ConfigSet MemberAdded MemberRemoved MemberMoved \
         MembersShuffled ProblemSet HandoffNoteSet BreakStarted BreakEnded \
         SessionCompleted SessionAborted ProxyMemberAdded ParticipantRenamed \
         DriverSkipped DriverResumed ProblemEdited ProblemModeSet \
         Unauthorized PhaseConflict InvalidIndex InputLimitExceeded; do
  sed -i "/^  $n,$/d" packages/timer-core/src/index.ts
done
grep -c "DomainEvent," packages/timer-core/src/index.ts   # 期待: 1
grep -c "DomainError," packages/timer-core/src/index.ts   # 期待: 1
```

- [ ] **Step 5: ビルドと型検査が通ることを確かめる**

```bash
cd /home/vscode/tasuki-work
npx tsc --project packages/timer-core/tsconfig.json          # 期待: 出力なし（成功）
(cd apps/timer-sync && npx tsc --noEmit)                     # 期待: 出力なし
(cd apps/timer-web  && npx tsc --noEmit)                     # 期待: 出力なし
```

出力された宣言ファイルで、非 export の `interface` として残っていることを確認する。

```bash
head -8 packages/timer-core/dist/events.d.ts
# 期待: `interface SessionStarted {`（`export` が付いていない）
```

- [ ] **Step 6: `tsc` が空振りしていないことを対照実行で確かめる**

```bash
cd /home/vscode/tasuki-work
cp packages/timer-core/src/events.ts /tmp/events.bak
printf '\nconst __broken: number = "not a number";\n' >> packages/timer-core/src/events.ts
npx tsc --project packages/timer-core/tsconfig.json
# 期待: error TS2322: Type 'string' is not assignable to type 'number'.
cp /tmp/events.bak packages/timer-core/src/events.ts
rm /tmp/events.bak
```

- [ ] **Step 7: テストを走らせる**

```bash
cd /home/vscode/tasuki-work/packages/timer-core && npx vitest run
# 期待: 31 ファイル / 691 件が緑
```

- [ ] **Step 8: 指標が下がったことを確かめる**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC039
# 期待: 分岐 0 / データ 0 行 / 公開記号 6 件（34 から 28 減）
```

- [ ] **Step 9: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add packages/timer-core/src/
git commit -m "refactor(timer-core): 製品から参照されない公開記号 28 件を非公開にする

- events.ts の 24 インターフェースと errors.ts の 4 インターフェースから export を外す
- 合併型 DomainEvent / DomainError は公開のまま。利用側はリテラルで書いており影響なし
- 宣言出力（declaration: true）・依存 2 パッケージの型検査・timer-core の全テストで確認

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin refactor/168-public-surface-and-test-conventions
```

---

### Task 2: `countManagers` を非公開にし、テストを `canDemote` 経由へ寄せる

**Files:**
- Modify: `packages/timer-core/src/participants.ts`（`export function countManagers` → `function countManagers`。Task 1 は触っていないので 32 行目のまま）
- Modify: `packages/timer-core/src/index.ts`（`export { countManagers, canDemote, canRemoveParticipant } from "./participants.js";` の行から `countManagers` を落とす。**Task 1 が 28 行消したので行番号は 121 → 93 へずれている。行番号ではなく行の文字列で当てること**）
- Test: `packages/timer-core/test/participants.test.ts`

**Interfaces:**
- Consumes: Task 1 の結果（`index.ts` の形）
- Produces: `countManagers` は `packages/timer-core` の外から見えなくなる

**対象の選び方に落とし穴がある。** `wouldKeepAtLeastOneManager` は
`if (!isManager(target)) return true;` で早期 return するため、**降格対象自身が唯一の editor だと
`countManagers` に到達しない**。その形だけで組むと、`isManager` から `editor` を落とす変異を
1 件も検出できない（レビューで実証済み）。**編集者が数えられていることを見るテストは、対象を host にする。**

**なぜ `canDemote` で足りるか**: `canDemote(participants, id)` は `wouldKeepAtLeastOneManager` 経由で
`countManagers(participants) - 1 >= 1` を評価する。したがって
「編集者以上が 2 名なら降格できる／1 名なら降格できない」を見れば、数え方を観測できる。
`viewer` や `isPlaceholder: true` の参加者を足しても可否が変わらないことが、
「それらを数えていない」ことの検証になる。

`canRemoveParticipant` は使わない。「残存者 0 名なら true」の分岐が数え方を覆い隠すため。

- [ ] **Step 1: 既存テストを読み、何を主張しているか書き出す**

```bash
cd /home/vscode/tasuki-work
sed -n '26,60p' packages/timer-core/test/participants.test.ts
```

`describe("countManagers")` が持つ主張（host / editor を数え viewer は数えない、代理は数えない、等）を列挙する。

- [ ] **Step 2: `canDemote` 経由の同値なテストを先に書く（Red にはならない。既存の主張の言い換え）**

`describe("countManagers", …)`（26 行目）を次の形へ置き換える。`participant()` ヘルパーは既存のものをそのまま使う。

**56 行目に既存の `describe("canDemote")` がある。**同名にせず、下記の名前を使う
（同じ関数を別の観点から見る describe が 2 つ並ぶので、観点を名前で区別する）。

```typescript
describe("編集者以上の数え方（canDemote の可否として観測する）", () => {
  it("編集者以上が 2 名いれば片方を降格できる", () => {
    // Given
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "host" }),
      participant({ participantId: "p2", role: "editor" }),
    ];
    // When
    const allowed = canDemote(participants, "p2");
    // Then
    expect(allowed).toBe(true);
  });

  it("編集者以上が 1 名だけなら降格できない", () => {
    // Given
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "host" }),
      participant({ participantId: "p2", role: "viewer" }),
    ];
    // When
    const allowed = canDemote(participants, "p1");
    // Then
    expect(allowed).toBe(false);
  });

  it("見学者を何人足しても編集者以上の頭数には入らない", () => {
    // Given
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "host" }),
      participant({ participantId: "p2", role: "viewer" }),
      participant({ participantId: "p3", role: "viewer" }),
    ];
    // When
    const allowed = canDemote(participants, "p1");
    // Then
    expect(allowed).toBe(false);
  });

  it("編集者が 1 名いればホストを降格できる", () => {
    // Given（対象を host にすると早期 return を通らず、数えた結果そのものが可否を決める）
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "host" }),
      participant({ participantId: "p2", role: "editor" }),
    ];
    // When
    const allowed = canDemote(participants, "p1");
    // Then
    expect(allowed).toBe(true);
  });

  it("代理参加者は編集者であっても頭数に入らない", () => {
    // Given
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "host" }),
      participant({ participantId: "proxy", role: "editor", isPlaceholder: true }),
    ];
    // When
    const allowed = canDemote(participants, "p1");
    // Then
    expect(allowed).toBe(false);
  });
});
```

`import` 文から `countManagers` を落とす（`canDemote, canRemoveParticipant` は残す）。

- [ ] **Step 3: 置き換えたテストが緑であることを確かめる**

```bash
cd /home/vscode/tasuki-work/packages/timer-core
npx vitest run test/participants.test.ts
# 期待: 全件 緑
```

- [ ] **Step 4: 新しいテストが本当に効いていることを変異で確かめる**

`isManager` の代理除外を壊し、「代理参加者は頭数に入らない」が赤くなることを見る。

```bash
cd /home/vscode/tasuki-work
grep -cF 'if (participant.isPlaceholder === true) return false;' packages/timer-core/src/participants.ts
# 期待: 1（壊す前に、壊す対象が実在することを確認）
sed -i 's/  if (participant.isPlaceholder === true) return false;//' packages/timer-core/src/participants.ts
grep -cF 'if (participant.isPlaceholder === true) return false;' packages/timer-core/src/participants.ts
# 期待: 0（壊れたことを確認）
(cd packages/timer-core && npx vitest run test/participants.test.ts)
# 期待: 「代理参加者は編集者であっても頭数に入らない」が FAIL
git checkout -- packages/timer-core/src/participants.ts
grep -cF 'if (participant.isPlaceholder === true) return false;' packages/timer-core/src/participants.ts
# 期待: 1（戻ったことを確認）
```

- [ ] **Step 5: `countManagers` を非公開にする**

```bash
cd /home/vscode/tasuki-work
sed -i 's/^export function countManagers(/function countManagers(/' packages/timer-core/src/participants.ts
grep -c "^export function countManagers(" packages/timer-core/src/participants.ts  # 期待: 0
sed -i 's/^export { countManagers, canDemote, canRemoveParticipant } from ".\/participants.js";$/export { canDemote, canRemoveParticipant } from ".\/participants.js";/' packages/timer-core/src/index.ts
grep -cF "countManagers" packages/timer-core/src/index.ts  # 期待: 0
```

- [ ] **Step 6: 型検査とテストを走らせる**

```bash
cd /home/vscode/tasuki-work
npx tsc --project packages/timer-core/tsconfig.json
(cd packages/timer-core && npx vitest run)
(cd apps/timer-sync && npx tsc --noEmit)
(cd apps/timer-web  && npx tsc --noEmit)
node scripts/audit-structure.mjs | grep SC039   # 期待: 公開記号 5 件
```

- [ ] **Step 7: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add packages/timer-core/
git commit -m "refactor(timer-core): countManagers を非公開にしテストを canDemote 経由へ寄せる

- 数え方は canDemote の可否として観測できるため、内部関数を公開する必要がない
- 代理参加者の除外を壊して該当テストが赤くなることを確認した

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 3: `SessionConfigSchema` を非公開にし、テストを `CommandSchema` 経由へ寄せる

**Files:**
- Modify: `packages/timer-core/src/schemas.ts`（`export const SessionConfigSchema` → `const SessionConfigSchema`。Task 1 は触っていないので 65 行目のまま）
- Modify: `packages/timer-core/src/index.ts`（`  SessionConfigSchema,` の行を消す。**Task 1 が 28 行消したので行番号は 102 → 74 へずれている。行番号ではなく行の文字列で当てること**）
- Test: `packages/timer-core/test/schemas.problem-enabled.test.ts`

**Interfaces:**
- Consumes: Task 2 の結果
- Produces: `SessionConfigSchema` は `packages/timer-core` の外から見えなくなる

**なぜ `CommandSchema` で足りるか**: `schemas.ts:118` が `config.set` コマンドの `config` を
`v.partial(SessionConfigSchema)` として持つ。既存テストは `v.partial(SessionConfigSchema)` を
自分で組み立てているが、それは製品が実際に検証に使う経路（`ws-adapter.ts:413` の
`parseBoundaryMessage(CommandSchema, raw)`）の**再実装**である。`CommandSchema` に
`config.set` コマンドとして通せば、実経路と同じものを見ることになる。

- [ ] **Step 1: 変更前を確認する**

```bash
cd /home/vscode/tasuki-work
cat packages/timer-core/test/schemas.problem-enabled.test.ts
sed -n '112,125p' packages/timer-core/src/schemas.ts   # config.set の定義を読む
```

- [ ] **Step 2: `CommandSchema` 経由へ置き換える**

`packages/timer-core/test/schemas.problem-enabled.test.ts` を次の形にする。
`import` は `SessionConfigSchema` を落とし `CommandSchema` を入れる。

```typescript
import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema } from "../src/schemas.js";

describe("config.set の problemEnabled", () => {
  it("problemEnabled=false だけを含む config.set を受理する", () => {
    // Given（config.set の config は v.partial なので単独フィールドでも valid）
    const command = { command: "config.set", config: { problemEnabled: false } };
    // When
    const r = v.safeParse(CommandSchema, command);
    // Then
    expect(r.success).toBe(true);
  });

  // 注: language は列挙ではなく自由文字列（schemas.ts:60 の
  // languageStr = v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_CONFIG_LANGUAGE))）。
  // 置き換え前のテストも「language 単独でも v.partial で valid」を主張していた。
  it("既定の候補に無い言語文字列を含む config.set も受理する（language は自由文字列）", () => {
    // Given
    const command = { command: "config.set", config: { language: "Go" } };
    // When
    const r = v.safeParse(CommandSchema, command);
    // Then
    expect(r.success).toBe(true);
  });
});
```

**訂正（2026-08-19・Task 3 の実装で判明）**: 計画の初版はこの 2 件目を
「`language: "Go"` は拒否される（`toBe(false)`）」と書いていたが、**誤りだった**。
`language` は列挙ではなく自由文字列なので受理される。**置き換え前のテストも `toBe(true)` を
主張していた**（`git show ab8e8dc:packages/timer-core/test/schemas.problem-enabled.test.ts` で確認）。
計画が原本に無い期待値を作っていた。上のコードは訂正後のもの。

- [ ] **Step 3: テストが緑であることを確かめる**

```bash
cd /home/vscode/tasuki-work/packages/timer-core
npx vitest run test/schemas.problem-enabled.test.ts
```

- [ ] **Step 4: 新しいテストが効いていることを変異で確かめる**

```bash
cd /home/vscode/tasuki-work
grep -cF 'config: v.partial(SessionConfigSchema)' packages/timer-core/src/schemas.ts   # 期待: 1
sed -i 's/config: v.partial(SessionConfigSchema)/config: v.strictObject({})/' packages/timer-core/src/schemas.ts
grep -cF 'config: v.partial(SessionConfigSchema)' packages/timer-core/src/schemas.ts   # 期待: 0
(cd packages/timer-core && npx vitest run test/schemas.problem-enabled.test.ts)
# 期待: 2 件とも FAIL（config の中身を受け付けなくなる）
#
# **`v.object({})` では赤くならない。** valibot の `v.object` は非 strict で、未知のキーを
# 黙って剥がして通す。`config: { problemEnabled: false }` を渡しても success のままになる。
# 「無いこと」ではなく「拒否すること」を見たいので `v.strictObject({})` を使う（Task 3 で実測）。
git checkout -- packages/timer-core/src/schemas.ts
grep -cF 'config: v.partial(SessionConfigSchema)' packages/timer-core/src/schemas.ts   # 期待: 1
```

- [ ] **Step 5: `SessionConfigSchema` を非公開にする**

```bash
cd /home/vscode/tasuki-work
sed -i 's/^export const SessionConfigSchema = /const SessionConfigSchema = /' packages/timer-core/src/schemas.ts
grep -c "^export const SessionConfigSchema" packages/timer-core/src/schemas.ts   # 期待: 0
sed -i '/^  SessionConfigSchema,$/d' packages/timer-core/src/index.ts
grep -cF "SessionConfigSchema" packages/timer-core/src/index.ts   # 期待: 0
```

- [ ] **Step 6: 型検査とテストを走らせる**

```bash
cd /home/vscode/tasuki-work
npx tsc --project packages/timer-core/tsconfig.json
(cd packages/timer-core && npx vitest run)
(cd apps/timer-sync && npx tsc --noEmit)
(cd apps/timer-web  && npx tsc --noEmit)
node scripts/audit-structure.mjs | grep SC039   # 期待: 公開記号 4 件
```

- [ ] **Step 7: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add packages/timer-core/
git commit -m "refactor(timer-core): SessionConfigSchema を非公開にしテストを CommandSchema 経由へ寄せる

- 製品が検証に使うのは CommandSchema であり、テストが v.partial を自前で組むのは実経路の再実装だった
- config.set の config を空オブジェクトへ壊して該当テストが赤くなることを確認した

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 4: SC-039③ の例外表と、その健全性検査を足す

**Files:**
- Modify: `scripts/audit-structure.mjs`（例外表・`findStaleSymbolExceptions`・`sc039cSelfOnlyPublicSymbols` の除外・`main()` のガード）
- Test: `scripts/audit-structure.test.mjs`

**Interfaces:**
- Consumes: Task 3 の結果（SC039③ が 4 件になっている）
- Produces:
  - `export const SC039C_EXCEPTIONS: { file: string; name: string; reason: string }[]`
  - `export function findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources): string[]`
  - `sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources, exceptions = [])` — 第 3 引数が増える

**例外表の中身（4 件）**:

| file | name | reason |
|---|---|---|
| `packages/timer-core/src/errors.ts` | `SYNC_ERROR_CODES` | `apps/timer-sync/test/error-code-coverage.test.ts` がソースと双方向に照合済みの権威列挙として起点にしている（PR #34 のレビューで塞いだ穴の土台） |
| `packages/timer-core/src/schemas.ts` | `ServerMsgSchema` | `apps/timer-sync/test/live-ws.protocol.test.ts` が実 WS の全フレームを突き合わせる契約 |
| `packages/timer-core/src/schemas.ts` | `RoomSchema` | `packages/timer-core/test/ai-unlock.test.ts` がスキーマの entries を直接検査している（公開 API 経由では書けない） |
| `packages/timer-core/src/error-messages.ts` | `DEFAULT_ERROR_MESSAGE` | 既定文言の正本。落とすと 3 ファイルへ文言リテラルが複製される |

- [ ] **Step 1: 失敗するテストを書く**

`scripts/audit-structure.test.mjs` の末尾へ足す。

```javascript
describe("findStaleSymbolExceptions: 例外表は両方向に腐らせない", () => {
  const productSources = new Map([
    ["packages/x/src/user.ts", "import { USED } from './decl.js';\nconst a = USED;\n"],
  ]);
  const packageSrcFiles = new Map([
    ["packages/x/src/decl.ts", "export const ALIVE = 1;\nexport const USED = 2;\n"],
  ]);

  test("実在する未参照の記号を挙げた例外は問題にならない", () => {
    // Given
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "ALIVE", reason: "検査の土台" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources);
    // Then
    assert.deepEqual(problems, []);
  });

  test("宣言が実在しない例外は問題として報告する", () => {
    // Given（記号が消えたのに例外だけ残った状態）
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "GONE", reason: "検査の土台" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /GONE/);
  });

  test("ファイルごと実在しない例外は問題として報告する", () => {
    // Given
    const exceptions = [{ file: "packages/x/src/none.ts", name: "ALIVE", reason: "検査の土台" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /none\.ts/);
  });

  test("製品から参照されるようになった記号の例外は不要になったと報告する", () => {
    // Given
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "USED", reason: "検査の土台" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /不要/);
  });

  test("理由が空の例外は問題として報告する", () => {
    // Given
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "ALIVE", reason: "" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /理由/);
  });
});

describe("sc039cSelfOnlyPublicSymbols: 例外表に載る記号は数えない", () => {
  const productSources = new Map([["packages/x/src/user.ts", "const a = 1;\n"]]);
  const packageSrcFiles = new Map([
    ["packages/x/src/decl.ts", "export const A = 1;\nexport const B = 2;\n"],
  ]);

  test("例外なしなら 2 件", () => {
    // Given / When
    const n = sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources);
    // Then
    assert.equal(n, 2);
  });

  test("1 件を例外にすると 1 件になる", () => {
    // Given
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "A", reason: "検査の土台" }];
    // When
    const n = sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources, exceptions);
    // Then
    assert.equal(n, 1);
  });
});
```

`import` 文へ `findStaleSymbolExceptions` を足す。

- [ ] **Step 2: テストが落ちることを確かめる**

```bash
cd /home/vscode/tasuki-work
node --test scripts/audit-structure.test.mjs
# 期待: findStaleSymbolExceptions is not a function / not exported で FAIL
```

- [ ] **Step 3: `audit-structure.mjs` へ例外表と判定を足す**

`SC039C_EXCEPTIONS` は `EXCLUDED_PACKAGES` の直後（理由つき宣言が並ぶ場所）へ置く。

```javascript
/**
 * SC-039③ の例外。**検査の土台になっている公開記号だけ**を、理由つきで載せる。
 *
 * FR-090 は「テストからの参照は生存の根拠に含めない」と定めており、原則はそのとおりでよい。
 * ただし、その記号を失うと**検査そのものが弱くなる**ものが実在する。それらは公開を残し、
 * ここへ理由つきで挙げる。理由を書けないものは例外にしない。
 *
 * **例外表は両方向に腐る。** 記号が消えたのに例外が残れば同名の別記号を静かに覆い、
 * 記号が製品から使われ始めれば例外そのものが不要になる。
 * どちらも `findStaleSymbolExceptions` が落とす。
 */
export const SC039C_EXCEPTIONS = [
  {
    file: "packages/timer-core/src/errors.ts",
    name: "SYNC_ERROR_CODES",
    reason:
      "apps/timer-sync/test/error-code-coverage.test.ts がソースと双方向に照合済みの権威列挙として起点にしている（PR #34 のレビューで塞いだ穴の土台）",
  },
  {
    file: "packages/timer-core/src/schemas.ts",
    name: "ServerMsgSchema",
    reason: "apps/timer-sync/test/live-ws.protocol.test.ts が実 WS の全フレームを突き合わせる契約",
  },
  {
    file: "packages/timer-core/src/schemas.ts",
    name: "RoomSchema",
    reason:
      "packages/timer-core/test/ai-unlock.test.ts がスキーマの entries を直接検査している（公開 API 経由では書けない）",
  },
  {
    file: "packages/timer-core/src/error-messages.ts",
    name: "DEFAULT_ERROR_MESSAGE",
    reason: "既定文言の正本。落とすと 3 ファイルへ文言リテラルが複製される",
  },
];

/**
 * 例外表が腐っていないかを見る（純粋）。問題が無ければ空配列。
 *
 * 3 つの向きで落とす。
 *   1. 例外が指すファイルに その記号の公開宣言が無い（記号が消えた／改名された）
 *   2. 例外の記号が製品コードから参照されている（例外がもう要らない）
 *   3. 理由が空（`EXCLUDED_PACKAGES` と同じ作法。理由の書けない例外は置かない）
 */
export function findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources) {
  const problems = [];
  for (const e of exceptions) {
    if (typeof e.reason !== "string" || e.reason.trim() === "") {
      problems.push(`SC-039③ の例外に理由がありません: ${e.file} ${e.name}`);
    }
    const content = packageSrcFiles.get(e.file);
    if (content === undefined) {
      problems.push(
        `SC-039③ の例外が指すファイルが走査対象にありません: ${e.file}（例外を消すか、走査対象を直してください）`,
      );
      continue;
    }
    const declared = extractPublicDeclarations(content).some((d) => d.name === e.name);
    if (!declared) {
      problems.push(
        `SC-039③ の例外が指す公開宣言がありません: ${e.file} の ${e.name}（記号が消えたなら例外も消してください）`,
      );
      continue;
    }
    if (isReferencedElsewhere(e.name, e.file, productSources)) {
      problems.push(
        `SC-039③ の例外が不要になりました: ${e.file} の ${e.name} は製品コードから参照されています`,
      );
    }
  }
  return problems;
}
```

`sc039cSelfOnlyPublicSymbols` へ第 3 引数を足す。

```javascript
export function sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources, exceptions = []) {
  const excepted = new Set(exceptions.map((e) => `${e.file}::${e.name}`));
  let count = 0;
  for (const [file, content] of packageSrcFiles) {
    for (const decl of extractPublicDeclarations(content)) {
      if (excepted.has(`${file}::${decl.name}`)) continue;
      if (!isReferencedElsewhere(decl.name, file, productSources)) count++;
    }
  }
  return count;
}
```

`sc039UnreachableElements` へ `exceptions` を通し、`runAudit()` の呼び出しで
`exceptions: SC039C_EXCEPTIONS` を渡す。`main()` では、指標を出す**前**に健全性を見る。

```javascript
  // 例外表の健全性（走査対象のずれと同じ扱いで合否を持つ）。
  // 指標を出す前に見る。腐った例外を抱えたまま「0 件」と報告させない。
  const staleExceptions = findStaleSymbolExceptions(SC039C_EXCEPTIONS, coreOnlyForCheck, productSourcesForCheck);
  if (staleExceptions.length > 0) {
    for (const p of staleExceptions) console.error(`[audit-structure] ${p}`);
    process.exit(1);
  }
```

**注意**: `coreOnly` と `productSources` は現在 `runAudit()` の中で作られている。
`main()` から健全性を見るために、この 2 つを作る部分を `runAudit()` から
`buildSc039Sources(loaded)` として切り出し、`main()` と `runAudit()` の両方が同じ結果を使う。
**2 か所で別々に組み立てないこと**（ADR-0014 決定 9 が禁じている形）。

- [ ] **Step 4: テストが通ることを確かめる**

```bash
cd /home/vscode/tasuki-work
node --test scripts/audit-structure.test.mjs
# 期待: 全件 PASS
```

- [ ] **Step 5: SC039③ が 0 になることを確かめる**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC039
# 期待: 分岐 0 / データ 0 行 / 公開記号 0 件
```

- [ ] **Step 6: 健全性検査をわざと壊して赤を見る（3 経路すべて）**

```bash
cd /home/vscode/tasuki-work

# ① 実在しない記号を例外に足す
cp scripts/audit-structure.mjs /tmp/as.bak
sed -i 's|^export const SC039C_EXCEPTIONS = \[|export const SC039C_EXCEPTIONS = [\n  { file: "packages/timer-core/src/errors.ts", name: "NO_SUCH_SYMBOL", reason: "壊すため" },|' scripts/audit-structure.mjs
grep -cF 'NO_SUCH_SYMBOL' scripts/audit-structure.mjs      # 期待: 1（壊れたことを確認）
node scripts/audit-structure.mjs; echo "exit=$?"           # 期待: 公開宣言がありません / exit=1
cp /tmp/as.bak scripts/audit-structure.mjs
grep -cF 'NO_SUCH_SYMBOL' scripts/audit-structure.mjs      # 期待: 0（戻ったことを確認）

# ② 製品から参照されている記号を例外に足す（CommandSchema は ws-adapter.ts が使う）
sed -i 's|^export const SC039C_EXCEPTIONS = \[|export const SC039C_EXCEPTIONS = [\n  { file: "packages/timer-core/src/schemas.ts", name: "CommandSchema", reason: "壊すため" },|' scripts/audit-structure.mjs
grep -cF '"CommandSchema"' scripts/audit-structure.mjs     # 期待: 1
node scripts/audit-structure.mjs; echo "exit=$?"           # 期待: 例外が不要になりました / exit=1
cp /tmp/as.bak scripts/audit-structure.mjs

# ③ 理由を空にする
sed -i 's|reason: "既定文言の正本。落とすと 3 ファイルへ文言リテラルが複製される"|reason: ""|' scripts/audit-structure.mjs
grep -cF 'reason: ""' scripts/audit-structure.mjs          # 期待: 1
node scripts/audit-structure.mjs; echo "exit=$?"           # 期待: 理由がありません / exit=1
cp /tmp/as.bak scripts/audit-structure.mjs
rm /tmp/as.bak
node scripts/audit-structure.mjs | grep SC039              # 期待: 公開記号 0 件（元に戻った）
git diff --stat scripts/audit-structure.mjs                # 期待: 壊す前と同じ内容
```

- [ ] **Step 7: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add scripts/
git commit -m "feat(scripts): SC-039③ に理由つき例外表を入れ、腐った例外で落ちるようにする

- 検査の土台になっている 4 記号を理由つきで例外にする
- 記号が消えた・製品から参照されるようになった・理由が空、の 3 経路で赤にする
- 3 経路すべてをわざと壊して赤を確認した

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 4b: ドメインエラー型の検査が非公開の宣言も見られるようにする

**このタスクは計画の初版に無い。** Task 1 が `packages/timer-core/src/errors.ts` の 4 インターフェースから
`export` を外した結果、`scripts/audit-domain-error-shape.mjs` が「宣言が見つかりません」で
**exit 1 になった**（Task 4 の実装中に発見。controller が実測で再現）。

**Files:**
- Modify: `scripts/audit-domain-error-shape.mjs`（`findDeclarationSpan` の `startRe`）
- Test: `scripts/audit-domain-error-shape.test.mjs`

**Interfaces:**
- Consumes: Task 1 の結果（4 インターフェースが非公開になっている）
- Produces: なし

**なぜ検査側を直すのか（裁定 R7）**: [`docs/adr/0016`](../../adr/0016-core-domain-representation.md) 決定 2 項目 3 は
「ドメインエラーは**判別子（`type` または `code`）と機械可読な詳細のみ**を持つ」と定めており、
**公開されているかどうかを条件にしていない**。合併メンバーに `message?:` を足す危険は
`export` の有無で変わらない。`DOMAIN_ERROR_TARGETS` から 4 型を落とす案は、
自分たちの改修に合わせて検査を弱めることになるので採らない。

- [ ] **Step 1: 現状の赤を再現する**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-domain-error-shape.mjs
echo "exit=$?"
```

期待: 4 件の「型宣言が見つかりません」で exit 1。

- [ ] **Step 2: 失敗するテストを書く**

`scripts/audit-domain-error-shape.test.mjs` の `describe("findDeclarationSpan: …")` へ足す。

```javascript
  test("export の付かない interface も切り出せる（非公開でもドメインエラー型は検査対象）", () => {
    // Given（#168 Task 1 で timer-core の合併メンバーが非公開になった形）
    const src = [
      "interface Unauthorized {",
      "  code: 'unauthorized';",
      "  op: string;",
      "}",
      "",
    ].join("\n");
    // When
    const span = findDeclarationSpan(src, "Unauthorized");
    // Then
    assert.equal(span.startLine, 1);
    assert.equal(span.endLine, 4);
  });

  test("export の付かない type も切り出せる", () => {
    // Given
    const src = "type RoomError = { code: 'x' };\n";
    // When
    const span = findDeclarationSpan(src, "RoomError");
    // Then
    assert.deepEqual(span, {
      startLine: 1,
      endLine: 1,
      lines: ["type RoomError = { code: 'x' };"],
    });
  });

  test("非公開の宣言でも禁止フィールドを見つける", () => {
    // Given
    const sources = new Map([
      ["packages/x-core/src/round.ts", "interface RoundError {\n  code: 'x';\n  message: string;\n}\n"],
    ]);
    // When
    const problems = findDomainErrorProblems(
      { file: "packages/x-core/src/round.ts", type: "RoundError" },
      sources,
    );
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /message/);
  });
```

- [ ] **Step 3: テストが落ちることを確かめる**

```bash
cd /home/vscode/tasuki-work
node --test scripts/audit-domain-error-shape.test.mjs
```

期待: 足した 3 件が FAIL（`span` が `null` になる）。

- [ ] **Step 4: `startRe` を直す**

`scripts/audit-domain-error-shape.mjs` の `findDeclarationSpan` の中。

```javascript
  // `export` は任意にする。ADR-0016 決定 2 項目 3 は「ドメインエラーは判別子と機械可読な
  // 詳細のみを持つ」と定めており、**公開されているかどうかを条件にしていない**。
  // #168 Task 1 で timer-core の合併メンバーが非公開になったとき、`export` 必須の
  // 正規表現では「宣言が見つかりません」に落ちて検査が空振りした（実測）。
  const startRe = new RegExp(`^\\s*(?:export\\s+)?(type|interface)\\s+${typeName}\\b`);
```

docstring の「何を見ていないか」へ次を足す。

```
 * - **`export` の有無は見ていない。** 非公開の宣言も同じ規範に服する（ADR-0016 決定 2 項目 3 は
 *   公開かどうかを条件にしていない）。その代わり、**同名の宣言がファイル内に複数ある場合は
 *   最初に現れたものだけ**を読む。走査対象はファイルと型名で明示宣言しているため、
 *   同名の別宣言を作らない限り問題にならない。
```

- [ ] **Step 5: テストが通り、検査が緑になることを確かめる**

```bash
cd /home/vscode/tasuki-work
node --test scripts/audit-domain-error-shape.test.mjs
node scripts/audit-domain-error-shape.mjs
echo "exit=$?"
```

期待: 自己テスト全件 PASS。検査は「ドメインエラー型の形 OK」で exit 0。

- [ ] **Step 6: 検査が死んでいないことを、わざと壊して確かめる**

`export` を任意にしたことで**何も見つけられなくなっていない**ことを見る。

```bash
cd /home/vscode/tasuki-work
grep -cF "  op: SessionOp;" packages/timer-core/src/errors.ts
```

`packages/timer-core/src/errors.ts` の非公開になった `Unauthorized` の宣言の中へ
`  message: string;` を 1 行足し、`grep -cF "  message: string;"` で足したことを数えてから
`node scripts/audit-domain-error-shape.mjs` を走らせ、**その行番号を名指しして赤になる**ことを確認する。
確認後 `git checkout -- packages/timer-core/src/errors.ts` で戻し、`grep -cF` で戻ったことを数える。

**赤にならなかったら、そこで止めて報告する。**「見つけられるようにした」つもりで
実際には見つけていない、という状態がいちばん危ない。

- [ ] **Step 7: scripts の自己テストが全件通ることを確かめる**

```bash
cd /home/vscode/tasuki-work
bash -c 'set -uo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets 2>&1 | tail -8'
```

期待: `# fail 0`。この赤には `scan-target-wiring.test.mjs` の 2 件も含まれていたので、
それらも緑に戻ることを確認する。

- [ ] **Step 8: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add scripts/audit-domain-error-shape.mjs scripts/audit-domain-error-shape.test.mjs
git commit -m "fix(scripts): ドメインエラー型の検査が非公開の宣言も見られるようにする

- ADR-0016 決定 2 項目 3 は公開かどうかを条件にしていない。export を任意にする
- #168 Task 1 で合併メンバーが非公開になり、検査が「宣言が見つかりません」で落ちていた
- 非公開の宣言へ message を足して赤になることを確認した

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 5: `export *` を禁じる機械検査を新設し、4 箇所へ配線する

**Files:**
- Create: `scripts/audit-public-surface.mjs`
- Create: `scripts/audit-public-surface.test.mjs`
- Modify: `.github/workflows/ci.yml`（`audit-web-sync-boundary` の次へ 1 ステップ）
- Modify: `docs/guides/development.md`（「検査系」節のコマンド一覧へ 1 行）

**Interfaces:**
- Consumes: `scripts/audit-structure.mjs` の `SCANNED_PACKAGES` / `hasScanTarget` / `stripStringsAndComments`
- Produces: `export function findWildcardReexports(entrySources): string[]`

**この時点では赤で正しい。** Task 6 が `poker-core` を直すまで、この検査は 7 行を検出する。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/audit-public-surface.test.mjs` を新規作成する。

```javascript
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findWildcardReexports } from "./audit-public-surface.mjs";

describe("findWildcardReexports: export * を見つける", () => {
  test("export * があれば行番号つきで報告する", () => {
    // Given
    const sources = new Map([["packages/x/src/index.ts", "export * from './a';\n"]]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /packages\/x\/src\/index\.ts:1/);
  });

  test("明示列挙は問題にしない", () => {
    // Given
    const sources = new Map([
      ["packages/x/src/index.ts", "export { a, b } from './a';\nexport type { C } from './a';\n"],
    ]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.deepEqual(problems, []);
  });

  test("ブロックコメントの中の export * は誤検出しない", () => {
    // Given（timer-core の index.ts が実際にこの形の docstring を持つ）
    const sources = new Map([
      ["packages/x/src/index.ts", "/**\n * `export *` を明示列挙に置換したもの。\n */\nexport { a } from './a';\n"],
    ]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.deepEqual(problems, []);
  });

  test("行コメントの中の export * も誤検出しない", () => {
    // Given
    const sources = new Map([["packages/x/src/index.ts", "// export * from './a';\n"]]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.deepEqual(problems, []);
  });

  test("名前つきの再エクスポート（export * as ns）も報告する", () => {
    // Given
    const sources = new Map([["packages/x/src/index.ts", "export * as ns from './a';\n"]]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.equal(problems.length, 1);
  });

  test("複数行にまたがって複数あればすべて報告する", () => {
    // Given
    const sources = new Map([
      ["packages/x/src/index.ts", "export * from './a';\nexport { b } from './b';\nexport * from './c';\n"],
    ]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.equal(problems.length, 2);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

```bash
cd /home/vscode/tasuki-work
node --test scripts/audit-public-surface.test.mjs
# 期待: Cannot find module './audit-public-surface.mjs' で FAIL
```

- [ ] **Step 3: `scripts/audit-public-surface.mjs` を書く**

```javascript
#!/usr/bin/env node
/**
 * 公開面の検査（`docs/adr/0016` 決定 2 項目 2）。
 *
 * ADR-0016 決定 2 項目 2 は「`index.ts` は**公開記号を明示列挙**する。`export *` を使わない
 * （MUST NOT）」と定めている。この検査は、走査対象のエントリに `export *` が現れないことを見る。
 *
 * ## 走査対象の決め方 — **列挙しない**
 *
 * `packages/*-core/src/index.ts` のようなグロブや、パッケージ名の手書き列挙は使わない。
 * パッケージが増減するたびに検査側の列挙が腐り、新しいパッケージが黙って走査から漏れる
 * （#175 が CI ジョブ表に対して行ったのと同じ判断）。
 * `audit-structure.mjs` の `SCANNED_PACKAGES` から `src` と `entry` の両方を持つ宣言を取り、
 * `<pkg>/<src>/<entry>` を対象とする。宣言の実在確認は `audit-structure.mjs` が行っている。
 *
 * **対象は ADR-0016 が言う `index.ts` より広い**（`main.tsx` / `server.ts` も入る）。
 * 「エントリが `index.ts` のものだけ」という絞り込みを書くほうが腐りやすく、
 * かつアプリのエントリに `export *` を置きたい理由も無いため、広いまま採る。
 *
 * ## コメント・文字列の扱い — **落としてから見る**
 *
 * `packages/timer-core/src/index.ts` の docstring は T055 の由来を説明するために
 * `` `export *` `` という文字列を含む。これは規範違反ではないので、
 * `stripStringsAndComments` を通してから行を見る。
 * **これは「無いこと」を求める検査だが、コメントを読み飛ばしても緑には倒れない** —
 * 読み飛ばすのはコメントの中だけであり、コードは全部読むためである。
 *
 * ## 何を見ていないか
 *
 * - **明示列挙の網羅性は見ていない。** 記号を列挙から落としても、その記号を
 *   エントリ経由で使う利用者がいなければ型検査も通る（`computeStats` で実測）。
 *   網羅性を見るには別の検査が要る。
 * - **エントリ以外のファイルの `export *` は見ていない。** ADR-0016 が言うのは
 *   `index.ts`（公開面の正本）であり、内部モジュール間の再エクスポートは対象外。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasZeroScanTargets } from "./lib/scan-targets.mjs";
import { SCANNED_PACKAGES, hasScanTarget, stripStringsAndComments } from "./audit-structure.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/** `export *` / `export * as ns` を拾う。行頭の空白は許す。 */
const WILDCARD_RE = /^\s*export\s+\*/;

/**
 * エントリの中の `export *` を列挙する（純粋）。
 *
 * @param entrySources `Map<相対パス, ソース>`
 * @returns 問題の説明の配列（`<path>:<行番号> …`）。問題が無ければ空配列
 */
export function findWildcardReexports(entrySources) {
  const problems = [];
  for (const [file, source] of entrySources) {
    const stripped = stripStringsAndComments(source);
    stripped.split("\n").forEach((line, i) => {
      if (WILDCARD_RE.test(line)) {
        problems.push(
          `${file}:${i + 1} export * があります。公開記号を明示列挙してください（ADR-0016 決定 2 項目 2）`,
        );
      }
    });
  }
  return problems;
}

/** 走査対象のエントリを `SCANNED_PACKAGES` から導く（実在しないものはキーを作らない）。 */
function readEntrySources() {
  const sources = new Map();
  for (const d of SCANNED_PACKAGES) {
    if (!hasScanTarget(d.src) || !hasScanTarget(d.entry)) continue;
    const rel = `${d.pkg}/${d.src}/${d.entry}`;
    const abs = path.join(REPO_ROOT, rel);
    if (fs.existsSync(abs)) sources.set(rel, fs.readFileSync(abs, "utf8"));
  }
  return sources;
}

function main() {
  const sources = readEntrySources();

  // 走査対象が 0 件なら赤（ADR-0014 決定 8）。宣言を空にして緑にする経路を塞ぐ。
  if (hasZeroScanTargets(sources.size)) {
    console.error("[audit-public-surface] 走査するエントリが 0 件です（検査が空振りします）");
    process.exit(1);
  }

  // 走査量は成否によらず必ず出す（#135 D5）。
  console.log(`[audit-public-surface] 走査対象: エントリ ${sources.size} 件`);

  const problems = findWildcardReexports(sources);
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    console.error(`\n${problems.length} 件の問題があります`);
    process.exit(1);
  }
  console.log("公開面 OK（export * は 0 件）");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: 自己テストが通ることを確かめる**

```bash
cd /home/vscode/tasuki-work
node --test scripts/audit-public-surface.test.mjs
# 期待: 6 件すべて PASS
```

- [ ] **Step 5: 実リポジトリで赤になることを確かめる（この時点では赤が正しい）**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-public-surface.mjs; echo "exit=$?"
# 期待: 走査対象 エントリ 9 件 / packages/poker-core/src/index.ts の 7 行 / exit=1
```

- [ ] **Step 6: `ci.yml` へ 1 ステップ足す**

`audit-web-sync-boundary` のステップの直後へ挿入する。

```yaml
      # 公開面。エントリが export * を使わず公開記号を明示列挙していることを見る
      # （ADR 0016 決定 2 項目 2 が #72 E6 へ割り当てた機械検査・#168）。
      - run: node scripts/audit-public-surface.mjs
        if: steps.scope.outputs.code == 'true'
```

- [ ] **Step 7: `development.md` の「検査系」節へ 1 行足す**

`audit-web-sync-boundary.mjs` の行の直後へ、同じ書式で足す。

```
node scripts/audit-public-surface.mjs            # 公開面（エントリが export * を使っていないか。ADR-0016 決定 2 項目 2）
```

- [ ] **Step 8: 4 箇所すべてを触ったことを確かめる**

```bash
cd /home/vscode/tasuki-work
ls scripts/audit-public-surface.mjs scripts/audit-public-surface.test.mjs
grep -cF "audit-public-surface" .github/workflows/ci.yml     # 期待: 1
grep -cF "audit-public-surface" docs/guides/development.md   # 期待: 1
node scripts/list-scan-targets.mjs script-tests | grep -cF "audit-public-surface.test.mjs"
# 期待: 1（自己テストが git から導出される一覧に入っている。0 なら git add が要る）
```

- [ ] **Step 9: コミットして push**

`export *` がまだ残っているため CI は赤になる。Task 6 で緑にする。

```bash
cd /home/vscode/tasuki-work
git add scripts/audit-public-surface.mjs scripts/audit-public-surface.test.mjs .github/workflows/ci.yml docs/guides/development.md
git commit -m "feat(scripts): エントリに export * が無いことを検査する

- 走査対象は SCANNED_PACKAGES の entry から導く（グロブや手書き列挙は使わない）
- コメント・文字列を落としてから見るので docstring 中の export * を誤検出しない
- スクリプト・自己テスト・ci.yml・development.md の 4 箇所を同時に配線した
- この時点では poker-core の 7 行を検出して赤になる（次のコミットで解消する）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 6: `poker-core` の `export *` を 43 記号の明示列挙へ置き換える

**Files:**
- Modify: `packages/poker-core/src/index.ts`

**Interfaces:**
- Consumes: Task 5 の `scripts/audit-public-surface.mjs`
- Produces: `@tasuki/poker-core` の公開面が明示列挙になる。**公開する記号の集合は変えない**

**43 記号すべてを列挙する**（設計正本 D「43 記号すべて」）。
index 経由の利用者がいない 14 記号も含める。公開面を縮めるのは E6 の範囲外。

- [ ] **Step 1: 変更前を記録する**

```bash
cd /home/vscode/tasuki-work
grep -c "^export \*" packages/poker-core/src/index.ts   # 期待: 7
```

- [ ] **Step 2: `packages/poker-core/src/index.ts` を書き換える**

`verbatimModuleSyntax` が有効なので、型は `export type { … }` で分けて書く。

```typescript
// @tasuki/poker-core — ドメイン + プロトコル契約の単一情報源
//
// **公開記号は明示列挙する。`export *` は使わない**（ADR-0016 決定 2 項目 2）。
// 検査は `scripts/audit-public-surface.mjs` が行う。

// ./deck
export { NUMBER_CARD_VALUES, FIBONACCI_DECK, cardKey, cardEquals } from './deck';
export type { NumberCardValue, Card } from './deck';

// ./error-messages
export { messageForRoundError, messageForRoomError } from './error-messages';

// ./protocol
export {
  ClientMessageSchema,
  ERROR_CODES,
  ServerMessageSchema,
  parseClientMessage,
  parseServerMessage,
} from './protocol';
export type {
  ClientMessage,
  ErrorCode,
  ServerMessage,
  RoomStateMessage,
  ParticipantView,
  RoundStats,
  VoteView,
  ProtocolError,
} from './protocol';

// ./room
export {
  NAME_MAX_LENGTH,
  isValidName,
  createRoom,
  findParticipantByToken,
  markDisconnected,
  markConnected,
  joinRoom,
} from './room';
export type { Participant, Round, Room, RoomError, ParticipantIds, RoomUpdate } from './room';

// ./round
export { castVote, shouldAutoReveal, applyAutoReveal, revealBy, nextRound } from './round';
export type { RoundError } from './round';

// ./snapshot
export { createSnapshotBuilder, snapshotFor } from './snapshot';

// ./stats
export { computeStats } from './stats';
```

- [ ] **Step 3: 列挙が 43 記号を漏れなく写していることを機械で確かめる**

**型検査は列挙漏れを捕まえない**（設計正本「何を見ていないか」）。数えて確かめる。

```bash
cd /home/vscode/tasuki-work
# 各モジュールが公開している記号
grep -rhoE "^export (type )?(const|function|class|interface|type) [A-Za-z0-9_]+" \
  packages/poker-core/src/{deck,error-messages,protocol,room,round,snapshot,stats}.ts \
  | awk '{print $NF}' | sort > /tmp/declared.txt
# index.ts が列挙している記号
node -e '
const fs=require("fs");
const s=fs.readFileSync("packages/poker-core/src/index.ts","utf8");
const out=[];
for (const m of s.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from/g))
  for (const r of m[1].split(",")) { const t=r.trim(); if (t) out.push(t); }
console.log(out.sort().join("\n"));
' > /tmp/listed.txt
echo "宣言 $(wc -l < /tmp/declared.txt) 件 / 列挙 $(wc -l < /tmp/listed.txt) 件"   # 期待: 43 / 43
diff /tmp/declared.txt /tmp/listed.txt && echo "差分なし"                          # 期待: 差分なし
rm /tmp/declared.txt /tmp/listed.txt
```

- [ ] **Step 4: 型検査とテストを走らせる**

```bash
cd /home/vscode/tasuki-work
(cd packages/poker-core && npx tsc --noEmit)
(cd apps/poker-sync && npx tsc --noEmit)
(cd apps/poker-web  && npx tsc --noEmit)
(cd packages/poker-core && npx vitest run)
(cd apps/poker-sync && bun test --timeout 15000)
```

- [ ] **Step 5: 新設した検査が緑になることを確かめる**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-public-surface.mjs; echo "exit=$?"
# 期待: 公開面 OK（export * は 0 件） / exit=0
```

- [ ] **Step 6: 検査をわざと壊して赤に戻ることを確かめる**

```bash
cd /home/vscode/tasuki-work
cp packages/poker-core/src/index.ts /tmp/idx.bak
printf "export * from './stats';\n" >> packages/poker-core/src/index.ts
grep -c "^export \*" packages/poker-core/src/index.ts   # 期待: 1（壊れたことを確認）
node scripts/audit-public-surface.mjs; echo "exit=$?"   # 期待: 1 件の問題 / exit=1
cp /tmp/idx.bak packages/poker-core/src/index.ts
rm /tmp/idx.bak
grep -c "^export \*" packages/poker-core/src/index.ts   # 期待: 0（戻ったことを確認）
node scripts/audit-public-surface.mjs; echo "exit=$?"   # 期待: exit=0
```

- [ ] **Step 6b: 新設した検査の配線テストを足す（裁定 R10）**

`scripts/scan-target-wiring.test.mjs` の配線テストは**検査ごとに手で列挙する**形になっている
（`git ls-files` から導出されるのは「走査量を名乗る」テストだけ）。Task 4 のレビューで
「新しいガードに配線テストが無い」を Important として払ったばかりなので、新設した
`audit-public-surface.mjs` にも同じものを置く。**Task 5 ではなくここに置くのは、
既存の作法が「素のままなら成功し、走査量を名乗る」という緑の対照を含んでおり、
Task 5 の時点では `export *` が残っていて exit 1 だからである。**

既存の `describe("0 件ガードの配線: scripts/audit-domain-error-shape.mjs", …)` を手本に、
次の 3 件を持つ `describe("0 件ガードの配線: scripts/audit-public-surface.mjs", …)` を足す。

1. **緑の対照**: 恒等関数で複製を走らせ、exit 0 かつ `走査対象: ` を名乗る
2. **0 件ガード**: 走査対象が 0 件になるよう壊し、非ゼロ終了かつ「走査するエントリが 0 件です」が出る
3. **判定の配線**: `findWildcardReexports(...)` の呼び出しを、**認識できる偽の問題を差し込む式**へ
   置き換え、非ゼロ終了かつ差し込んだ文言が stderr に出る（消すのではなく差し込む。
   `main()` が結果を読んで終了コードを決めていることまで見るため）

各テストで **`countOf` により「壊れたこと自体」を先に確かめる**こと（この作法は既存テストが全部持っている）。

**確認**: 足したテストが本当に効くことを、`scripts/audit-public-surface.mjs` の
`main()` から `findWildcardReexports` の呼び出しを一時的に断ち切って赤くなるかで見る。
壊す前と後を `grep -cF` で数え、戻したあとも数える。

- [ ] **Step 7: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add packages/poker-core/src/index.ts scripts/scan-target-wiring.test.mjs
git commit -m "refactor(poker-core): index.ts の export * を明示列挙へ置き換える

- 7 行の export * を 43 記号（値 26 / 型 17）の明示列挙にする（ADR-0016 決定 2 項目 2）
- 公開する記号の集合は変えない。各モジュールの宣言と列挙が一致することを機械で照合した
- 型検査は列挙漏れを捕まえない（computeStats で実測）ため、照合を根拠にしている

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 7: テスト名から仕様 ID を外す（SC029: 15 件 → 0）

**Files:**
- Modify: `packages/poker-core/tests/room.test.ts`, `packages/poker-core/tests/round.test.ts`, `packages/poker-core/tests/snapshot.test.ts`
- Modify: `packages/rate-limit/tests/client-key.test.ts`
- Modify: `apps/timer-sync/test/config.test.ts`, `error-specificity.test.ts`, `live-ws.permissions.test.ts`, `participant-remove.test.ts`, `ws-adapter.heartbeat.test.ts`
- Modify: `apps/poker-sync/tests/join.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: なし（テスト名のみ）

**規範**: 仕様 ID は `describe` 直上の JSDoc `@requirements` に置く（FR-094）。
`it` / `test` の名前からは外す。**主張の中身は変えない。**

**対象と書き換え後の名前**（`（…）` の中の ID だけを落とし、意味のある補足は残す）:

| ファイル | 変更前 | 変更後 |
|---|---|---|
| `packages/poker-core/tests/room.test.ts` | `未投票者の切断で全員投票が成立しうる（US4-AS1）` | `未投票者の切断で全員投票が成立しうる` |
| `packages/poker-core/tests/round.test.ts` | `公開前の選び直しは上書きになる（FR-007）` | `公開前の選び直しは上書きになる` |
| `packages/poker-core/tests/snapshot.test.ts` | `participants に token がいかなる形でも含まれない（SC-004 の基盤）` | `participants に token がいかなる形でも含まれない` |
| `packages/rate-limit/tests/client-key.test.ts` | `::/96 の外でも上位 64 ビットが全ゼロなら v6:0:0:0:0 になる（G2）` | `::/96 の外でも上位 64 ビットが全ゼロなら v6:0:0:0:0 になる` |
| 〃 | `ArrayBuffer は length を持たないため throw する（G1）` | `ArrayBuffer は length を持たないため throw する` |
| 〃 | `空の ArrayBuffer も throw する（G1）` | `空の ArrayBuffer も throw する` |
| 〃 | `DataView は length を持たないため throw する（G1）` | `DataView は length を持たないため throw する` |
| `apps/timer-sync/test/config.test.ts` | `ハートビート間隔・許容ミス回数の既定値（Issue #25）` | `ハートビート間隔・許容ミス回数の既定値` |
| 〃 | `ハートビート間隔・許容ミス回数を env から読み込む（Issue #25）` | `ハートビート間隔・許容ミス回数を env から読み込む` |
| 〃 | `ハートビート設定の不正値は既定値にフォールバック（Issue #25）` | `ハートビート設定の不正値は既定値にフォールバック` |
| `apps/timer-sync/test/error-specificity.test.ts` | `④' 編集者（非ホスト）が開始後に現ホストへ host.transfer を送っても ALREADY_HOST を返す（実行者と対象が同一とは限らないことの担保・FR-138）` | `④' 編集者（非ホスト）が開始後に現ホストへ host.transfer を送っても ALREADY_HOST を返す（実行者と対象が同一とは限らないことの担保）` |
| `apps/timer-sync/test/live-ws.permissions.test.ts` | `開始後は編集者もセッションを畳める（FR-063 が実経路に効いている）` | `開始後は編集者もセッションを畳める（実経路で効いている）` |
| `apps/timer-sync/test/participant-remove.test.ts` | `④' 自己退出では本人へ LEFT_ROOM が届く（Issue #32: 自分の操作として区別した通知）` | `④' 自己退出では本人へ LEFT_ROOM が届く（自分の操作として区別した通知）` |
| `apps/timer-sync/test/ws-adapter.heartbeat.test.ts` | `1回だけ pong が欠落し、その後 pong が復帰した接続は terminate されない（US2: 誤検出しない）` | `1回だけ pong が欠落し、その後 pong が復帰した接続は terminate されない（誤検出しない）` |
| `apps/poker-sync/tests/join.test.ts` | `存在しない roomId は room-not-found（FR-015 / US1-AS3）` | `存在しない roomId は room-not-found` |

> **注意**: 表の「変更前」は 2026-08-19 時点の実ファイルからの転記である。
> 置換前に `grep -n` で現物と一致することを確かめてから直すこと。

- [ ] **Step 1: 変更前の値を記録し、実ファイルの文言を取得する**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC029   # 期待: SC029 | 15 | 0 | 未達
grep -n "FR-138" apps/timer-sync/test/error-specificity.test.ts
```

- [ ] **Step 2: 各ファイルで `describe` 直上へ `@requirements` を足す**

既存の `@requirements` JSDoc がある `describe` にはその行へ ID を追記する。
無い `describe` には新しく JSDoc を付ける。書式は既存に合わせる（例）:

```typescript
/**
 * 参加者の切断と全員投票の成立。
 *
 * @requirements US4-AS1
 */
describe('createRoom', () => {
```

**`Issue #25` のような形も `@requirements` に置いてよい**（SC029 は `it` / `test` の
名前しか見ないため、JSDoc に ID が残っても指標は動かない）。

- [ ] **Step 3: `it` / `test` の名前から ID を落とす**

上の表のとおりに置き換える。`sed` で一括置換せず、1 件ずつ確認しながら直す
（`（G1）` のような短い綴りは他の箇所に当たりうる）。

- [ ] **Step 4: SC029 が 0 になることを確かめる**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC029   # 期待: SC029 | 0 | 0 | PASS
```

- [ ] **Step 5: テストが緑のままであることを確かめる**

```bash
cd /home/vscode/tasuki-work
(cd packages/poker-core && npx vitest run)
(cd packages/rate-limit && npx vitest run)
(cd apps/timer-sync && npx vitest run)
(cd apps/poker-sync && bun test --timeout 15000)
```

- [ ] **Step 6: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add packages/ apps/
git commit -m "test: 仕様 ID をテスト名から @requirements JSDoc へ移す

- テスト名は「何が起きるか」だけを述べ、追跡は describe 直上の JSDoc が持つ
- 主張の中身は 1 件も変えていない

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 8: 内部の呼び出しを述べるテスト名を改める（SC030: 4 件 → 0）

**Files:**
- Modify: `apps/timer-sync/test/ws-adapter.heartbeat.test.ts`
- Modify: `apps/timer-web/test/sync/client.reconnect.test.ts`
- Modify: `apps/timer-web/test/ui/App.snapshot-intents.test.tsx`
- Modify: `apps/timer-web/test/ui/Lobby.leave-room.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: なし（テスト名のみ）

**規範**: テスト名に「呼ぶ／呼び出す／呼ばれる／呼び出され／spy／モックが」を含めない。
**発生ではなく結果を述べる**（FR-093）。

| ファイル | 変更前 | 変更後 |
|---|---|---|
| `apps/timer-sync/test/ws-adapter.heartbeat.test.ts` | `close() は heartbeat の setInterval を停止する（clearInterval を呼ぶ）` | `close() の後は heartbeat の周期処理が動かない` |
| `apps/timer-web/test/sync/client.reconnect.test.ts` | `切断→バックオフ後の再接続の onopen では呼ばれる` | `切断→バックオフ後の再接続でも接続確立が通知される` |
| `apps/timer-web/test/ui/App.snapshot-intents.test.tsx` | `完成（中断でない）なら saveRecord が呼ばれる` | `完成（中断でない）なら記録が保存される` |
| `apps/timer-web/test/ui/Lobby.leave-room.test.tsx` | `押すと確認ダイアログを経由せず直接 onRemoveParticipant(自分のID) が呼ばれる` | `押すと確認ダイアログを経由せず自分が退出する` |

- [ ] **Step 1: 変更前の値を記録し、各テストが実際に何を検証しているか読む**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC030   # 期待: SC030 | 4 | 0 | 未達
grep -n "呼ばれる\|呼ぶ" apps/timer-sync/test/ws-adapter.heartbeat.test.ts \
  apps/timer-web/test/sync/client.reconnect.test.ts \
  apps/timer-web/test/ui/App.snapshot-intents.test.tsx \
  apps/timer-web/test/ui/Lobby.leave-room.test.tsx
```

**新しい名前が本体の `expect` と食い違っていないかを、1 件ずつ本体を読んで確認する。**
食い違う場合は上の表ではなく**本体が検証している内容**に名前を合わせる（実装もテストの主張も変えない）。

- [ ] **Step 2: 名前を置き換える**

- [ ] **Step 3: SC030 が 0 になることを確かめる**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC030   # 期待: SC030 | 0 | 0 | PASS
```

- [ ] **Step 4: テストが緑のままであることを確かめる**

```bash
cd /home/vscode/tasuki-work
(cd apps/timer-sync && npx vitest run)
(cd apps/timer-web && npx vitest run)
```

- [ ] **Step 5: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add apps/
git commit -m "test: 内部の呼び出しを述べるテスト名を結果の表現へ改める

- 「〜が呼ばれる」は実装の都合であり、テストが守る振る舞いではない
- 主張の中身は 1 件も変えていない

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 9: 前提段階の冗長な検証を外す（SC031: 3 件 → 0）

**Files:**
- Modify: `packages/poker-core/tests/room.test.ts`（`expect(result.isOk()).toBe(true);` の 2 行。行番号は先行タスクでずれうるので文字列で当てること）
- Modify: `packages/protocol/tests/boundary.test.ts`（同じ形の 1 行）

**Interfaces:**
- Consumes: なし
- Produces: なし

**なぜ落としてよいか**: 3 件はいずれも直後で `result._unsafeUnwrap()` を呼んでいる。
**`_unsafeUnwrap()` は Err で throw する**（neverthrow 8 系で実測済み）ので、
`expect(result.isOk()).toBe(true)` を落としても失敗の signal は失われない。
失敗時のメッセージが「isOk が false」から「unwrap で throw」に変わるだけである。

- [ ] **Step 1: 変更前の値と対象行を確認する**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC031   # 期待: SC031 | 3 | 0 | 未達
grep -n "isOk()).toBe(true)" packages/poker-core/tests/room.test.ts packages/protocol/tests/boundary.test.ts
# 期待: room.test.ts に 2 行、boundary.test.ts に 1 行
```

- [ ] **Step 2: 3 行を落とす**

```bash
cd /home/vscode/tasuki-work
before=$(grep -c "isOk()).toBe(true)" packages/poker-core/tests/room.test.ts)
sed -i '/expect(result\.isOk())\.toBe(true);/d' packages/poker-core/tests/room.test.ts
after=$(grep -c "isOk()).toBe(true)" packages/poker-core/tests/room.test.ts)
echo "room.test.ts: 変更前=$before 変更後=$after（2 → 0 なら成功）"

before=$(grep -c "isOk()).toBe(true)" packages/protocol/tests/boundary.test.ts)
sed -i '/expect(result\.isOk())\.toBe(true);/d' packages/protocol/tests/boundary.test.ts
after=$(grep -c "isOk()).toBe(true)" packages/protocol/tests/boundary.test.ts)
echo "boundary.test.ts: 変更前=$before 変更後=$after（1 → 0 なら成功）"
```

- [ ] **Step 3: テストが緑のままであることを確かめる**

```bash
cd /home/vscode/tasuki-work
(cd packages/poker-core && npx vitest run tests/room.test.ts)
(cd packages/protocol && npx vitest run tests/boundary.test.ts)
```

- [ ] **Step 4: 残ったテストが本当に守っていることを変異で確かめる**

`expect` を減らしたので、失敗を検知する力が落ちていないことを見る（ADR-0006 決定 4）。

```bash
cd /home/vscode/tasuki-work
# createRoom を常に Err にすると、room.test.ts の該当テストが赤くなるはず
grep -n "export function createRoom" packages/poker-core/src/room.ts
```

`createRoom` の本体の先頭へ `return err({ code: 'invalid-name' } as RoomError);` を一時的に足し、
`grep -cF` で足したことを確認してから `npx vitest run tests/room.test.ts` を走らせ、
**該当テストが赤くなる**ことを見る。確認後 `git checkout -- packages/poker-core/src/room.ts` で戻し、
`grep -cF` で戻ったことを確認する。`boundary.test.ts` についても `parseBoundaryMessage` で同様に行う。

- [ ] **Step 5: SC031 が 0 になることを確かめる**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC031   # 期待: SC031 | 0 | 0 | PASS
```

- [ ] **Step 6: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add packages/
git commit -m "test: 前提段階の冗長な isOk 検証を外す

- 直後の _unsafeUnwrap() が Err で throw するため、失敗の signal は失われない
- 対象の関数を常に Err へ変異させ、該当テストが赤くなることを確認した

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 10〜13: 前提・操作の区切りを入れる（SC032: 275 件 → 0）

**4 タスクに分ける。** 区切りコメントの挿入は判断を伴うので、レビューが回る単位で切る。
**検査（`audit-structure.mjs`）には一切手を入れない**（設計正本「敵対的検証で壊れた主張」）。

**共通の作法**:

- 本体の前提を作る部分の直前へ `// Given`、対象を動かす部分の直前へ `// When`、
  検証の直前へ `// Then` を置く。SC032 が見るのは `// Given` と `// When` の 2 つだけだが、
  読み手のために `// Then` も付ける
- 前提と操作が同じ式になるとき（`expect(() => f()).toThrow()` 等）は
  `// When / Then（読み込みが throw するので操作と検証が同じ式になる）` のように
  **理由を添えて 1 つにまとめる**。既存の `apps/timer-sync/test/config.test.ts` がこの形を使っている
- `it.each` は**矢印関数の本体の中**へ置く（引数の配列側ではない）
- **主張は 1 件も変えない。** コメントを足すだけ

**進捗の測り方**（各タスクで使う）:

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC032
```

**絶対値では見ない。増分で見る。** Task 2・Task 3・Task 9 はテストの本体行を書き換えるため、
**SC032 の分母は 1432 から動く**（Task 9 の 3 行削除だけで 1432 → 1431 になることを実測済み）。
Task 10 の Step 1 でそのときの分子・分母を控え、以降は
「**分子が +N、分母は不変**」で判定する。分母が動いたら、コメント以外のものを足している。

---

### Task 10: `packages/` の区切りを入れる（93 件 / 14 ファイル）

**Files:**

| ファイル | 不足 |
|---|---|
| `packages/rate-limit/tests/token-bucket.test.ts` | 38 |
| `packages/poker-core/tests/room.test.ts` | 11 |
| `packages/poker-core/tests/round.test.ts` | 11 |
| `packages/rate-limit/tests/client-key.test.ts` | 9 |
| `packages/poker-core/tests/snapshot.test.ts` | 5 |
| `packages/protocol/tests/boundary.test.ts` | 4 |
| `packages/rate-limit/tests/error-kind.test.ts` | 4 |
| `packages/poker-core/tests/deck.test.ts` | 3 |
| `packages/rate-limit/tests/server-env.test.ts` | 3 |
| `packages/timer-core/test/error-messages.specificity.test.ts` | 1 |
| `packages/timer-core/test/problem.golden.test.ts` | 1 |
| `packages/poker-core/tests/error-messages.characterization.test.ts` | 1 |
| `packages/poker-core/tests/protocol.test.ts` | 1 |
| `packages/poker-core/tests/stats.test.ts` | 1 |

**Interfaces:** Consumes: Task 9 の結果（`room.test.ts` / `boundary.test.ts` は Task 9 でも触る）。Produces: なし

- [ ] **Step 1: 変更前の値を記録する（以降の基準になる）**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC032
```

**この分子・分母を控える。** Task 1〜9 がテスト本体を書き換えているため、
着手前の 1157/1432 とは違う値になっている（Task 9 の 3 行削除だけで分母が 1 減ることを実測済み）。
Task 10〜13 はこの値からの**増分**で判定する。

- [ ] **Step 2: 書き方の見本に従って 14 ファイルへ区切りを入れる**

見本（`packages/rate-limit/tests/token-bucket.test.ts` の先頭のテスト）:

```typescript
    it("容量ぶんまでは連続して消費できる", () => {
      // Given
      const limiter = createTokenBucketLimiter({ capacity: 3, refillPerSec: 1 });
      // When
      for (let i = 0; i < 3; i++) {
        expect(limiter.shouldReject("k", T0), `${i} 回目`).toBe(false);
        limiter.consume("k", T0);
      }
      // Then
      expect(limiter.shouldReject("k", T0)).toBe(true);
    });
```

- [ ] **Step 3: 分子が 93 増え、分母が動いていないことを確かめる**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC032
```

Step 1 で控えた値と比べ、**分子が +93・分母が同じ**であることを確かめる。
**分母が動いていたら止まる。** 区切りコメントは `isMeaningfulLine` が除外するため、
分母は動かないはずである。動いたなら、コメント以外のものを足している。

- [ ] **Step 4: テストが緑のままであることを確かめる**

```bash
cd /home/vscode/tasuki-work
for p in packages/timer-core packages/poker-core packages/protocol packages/rate-limit; do
  echo "=== $p"; (cd $p && npx vitest run)
done
```

- [ ] **Step 5: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add packages/
git commit -m "test(packages): 前提・操作・検証の区切りを入れる

- ADR-0006 決定 2（Given/When/Then 構造）の未達を packages 配下で解消する
- コメントのみの変更。主張は 1 件も変えていない

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 11: `apps/timer-*` の区切りを入れる（91 件 / 24 ファイル）

**Files:**

| ファイル | 不足 |
|---|---|
| `apps/timer-web/test/sync/snapshot-intents.test.ts` | 13 |
| `apps/timer-web/test/sync/use-timer-sync.test.tsx` | 12 |
| `apps/timer-web/test/ui/App.commands.test.tsx` | 8 |
| `apps/timer-web/test/ui/use-banner.test.tsx` | 6 |
| `apps/timer-web/test/sync/commands.test.ts` | 5 |
| `apps/timer-web/test/ui/Lobby.leave-room.test.tsx` | 5 |
| `apps/timer-web/test/ui/color-only-invariants.test.tsx` | 5 |
| `apps/timer-web/test/ui/components/RemovalConfirmDialog.test.tsx` | 5 |
| `apps/timer-web/test/ui/App.snapshot-intents.test.tsx` | 4 |
| `apps/timer-sync/test/log/log-safe-type-wall.test.ts` | 3 |
| `apps/timer-web/test/ui/App.connection.autodismiss.test.tsx` | 3 |
| `apps/timer-web/test/ui/App.connection.test.tsx` | 3 |
| `apps/timer-web/test/ui/problem-text.test.ts` | 3 |
| `apps/timer-sync/test/log/ref-encoder.test.ts` | 2 |
| `apps/timer-sync/test/passphrase-compare.test.ts` | 2 |
| `apps/timer-web/test/sync/resume-identity.test.ts` | 2 |
| `apps/timer-web/test/ui/Lobby.presence-a11y.test.tsx` | 2 |
| `apps/timer-web/test/ui/components/PresenceDot.test.tsx` | 2 |
| `apps/timer-sync/test/pipeline-single-route.test.ts` | 1 |
| `apps/timer-sync/test/solo-leave.test.ts` | 1 |
| `apps/timer-sync/test/ws-adapter.integration.test.ts` | 1 |
| `apps/timer-web/test/sync/client.reconnect.test.ts` | 1 |
| `apps/timer-web/test/ui/App.solo-leave.test.tsx` | 1 |
| `apps/timer-web/test/ui/App.sync-handlers.test.tsx` | 1 |

**Interfaces:** Consumes: Task 10 の結果。Produces: なし

- [ ] **Step 1: 24 ファイルへ区切りを入れる**（Task 10 Step 2 と同じ作法）

- [ ] **Step 2: 分子が 91 増え、分母が動いていないことを確かめる**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC032
```

Task 10 Step 3 の値と比べ、**分子が +91・分母が同じ**であること。動いたら止まる。

- [ ] **Step 3: テストが緑のままであることを確かめる**

```bash
cd /home/vscode/tasuki-work
(cd apps/timer-sync && npx vitest run)
(cd apps/timer-web && npx vitest run)
```

`apps/timer-sync/test/ws-adapter.heartbeat.test.ts` は 50ms × 2 回の窓を測るため
**共有ランナーでフレーキーになりうる**。赤が出たら 1 度だけ再実行し、通れば無関係と判断する。

- [ ] **Step 4: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-sync apps/timer-web
git commit -m "test(timer): 前提・操作・検証の区切りを入れる

- ADR-0006 決定 2（Given/When/Then 構造）の未達を timer 系で解消する
- コメントのみの変更。主張は 1 件も変えていない

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 12: `apps/poker-*` と `apps/landing` の区切りを入れる（80 件 / 17 ファイル）

**Files:**

| ファイル | 不足 |
|---|---|
| `apps/poker-sync/tests/config.test.ts` | 22 |
| `apps/poker-sync/tests/rate-limit.test.ts` | 7 |
| `apps/poker-sync/tests/client-key-safety.test.ts` | 5 |
| `apps/poker-sync/tests/fail-closed.test.ts` | 5 |
| `apps/poker-sync/tests/listening-log.test.ts` | 5 |
| `apps/poker-sync/tests/voting.test.ts` | 5 |
| `apps/poker-sync/tests/guards.test.ts` | 4 |
| `apps/poker-sync/tests/reconnect.test.ts` | 4 |
| `apps/poker-web/tests/router.test.ts` | 4 |
| `apps/landing/tests/App.test.tsx` | 4 |
| `apps/poker-sync/tests/join.test.ts` | 3 |
| `apps/poker-sync/tests/next-round.test.ts` | 3 |
| `apps/poker-sync/tests/protocol-errors.test.ts` | 3 |
| `apps/poker-sync/tests/session.test.ts` | 3 |
| `apps/poker-sync/tests/create-sync-server.in-process.test.ts` | 1 |
| `apps/poker-sync/tests/ws-broadcaster.test.ts` | 1 |
| `apps/landing/tests/caddy-fragment-order.test.ts` | 1 |

**Interfaces:** Consumes: Task 11 の結果。Produces: なし

`apps/poker-sync/tests/config.test.ts` は `it.each` を多く使う。
区切りは**矢印関数の本体の中**へ置く。

- [ ] **Step 1: 17 ファイルへ区切りを入れる**

- [ ] **Step 2: 分子が 80 増え、分母が動いていないことを確かめる**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC032
```

Task 11 Step 2 の値と比べ、**分子が +80・分母が同じ**であること。動いたら止まる。

- [ ] **Step 3: テストが緑のままであることを確かめる**

```bash
cd /home/vscode/tasuki-work
(cd apps/poker-sync && bun test --timeout 15000)
(cd apps/poker-web && npx vitest run)
(cd apps/landing && npx vitest run)
```

- [ ] **Step 4: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add apps/poker-sync apps/poker-web apps/landing
git commit -m "test(poker/landing): 前提・操作・検証の区切りを入れる

- ADR-0006 決定 2（Given/When/Then 構造）の未達を poker 系と landing で解消する
- it.each は矢印関数の本体へ区切りを置く
- コメントのみの変更。主張は 1 件も変えていない

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 13: `e2e/tests` の区切りを入れる（11 件 / 5 ファイル）

**Files:**

| ファイル | 不足 |
|---|---|
| `e2e/tests/target.test.ts` | 4 |
| `e2e/tests/spec-tags.test.ts` | 3 |
| `e2e/tests/site-config.test.ts` | 2 |
| `e2e/tests/fragment-sources.test.ts` | 1 |
| `e2e/tests/ws-frames.test.ts` | 1 |

**Interfaces:** Consumes: Task 12 の結果。Produces: なし

これらは `e2e/specs`（Playwright シナリオ）ではなく `e2e/tests`（vitest のメタテスト）である。
`e2e/specs` は SC032 の走査対象ではないので触らない。

**追加（裁定 R13・2026-08-19）**: Task 10 が保留した `packages/poker-core/tests/deck.test.ts` の
`it('フィボナッチ10種を順序どおりに含む（0,1,2,3,5,8,13,21,?,☕）')` も、ここで対応する。
当初は「import 済みの定数の形を見るだけで前提も操作も無い」として未対応にしたが、Task 11 のレビューが
`// Given（CONNECTION_CASES の各状態を入力に使う）`（下にコードが無く、モジュール定数を指す形）を
「指す識別子が実在するので妥当」と承認した。`FIBONACCI_DECK` も
`packages/poker-core/src/deck.ts:13` のモジュール定数なので同じ扱いが成立する。
**恒常的に赤い指標を残すと、人はその数字を無視するようになる**ため、例外機構を作るより
既存の慣習を適用するほうがよい。担当は 11 + 1 = 12 件。

- [ ] **Step 1: 5 ファイルへ区切りを入れる**

- [ ] **Step 2: SC032 が 100% になることを確かめる**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs | grep SC032
```

**期待: 分子 = 分母（100.0%）。** 残り 11 件を入れて分子が分母に追いつく。
追いつかない場合、Task 10〜12 のいずれかで取りこぼしがある。差分の出ているファイルを
`scripts/audit-structure.mjs` の `sc032GwtMarkers` を 1 ファイルずつ当てて特定する。

- [ ] **Step 3: テストが緑のままであることを確かめる**

```bash
cd /home/vscode/tasuki-work
(cd e2e && npx vitest run)
```

- [ ] **Step 4: 全指標を確認する**

```bash
cd /home/vscode/tasuki-work
node scripts/audit-structure.mjs
# 期待: SC027〜SC039 のうち、目標値が数値のものすべてが PASS または 100%
node scripts/audit-public-surface.mjs
# 期待: 公開面 OK
```

- [ ] **Step 5: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add e2e/
git commit -m "test(e2e): 前提・操作・検証の区切りを入れる

- ADR-0006 決定 2（Given/When/Then 構造）の未達を e2e のメタテストで解消する
- e2e 分は完了。deck.test.ts の 1 件は「操作が無い」という判断で対象外（SC032 は 99.9%）
- コメントのみの変更。主張は 1 件も変えていない

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 14: 規範を ADR へ反映する

**Files:**
- Modify: `docs/adr/0006-test-conventions.md`（決定へ 2 項追加）
- Modify: `docs/adr/0016-core-domain-representation.md`（検査の射程を追記）
- Modify: `docs/timer/adr/0009-test-conventions.md`（昇格した旨を追記）

**Interfaces:** Consumes: Task 13 の結果。Produces: なし

- [ ] **Step 1: ADR-0006 の「決定」へ 2 項足す**

既存の 4 項の後ろへ 5・6 として足す。**件数は書かない**（ADR-0014 の方針）。

```markdown
5. **テストの名前は結果を述べる（MUST）**: `it` / `test` の名前に、仕様の識別番号・
   内部の関数名・「〜が呼ばれる」を含めない。名前は「〜のとき、〜する」の形で
   利用者から見た結果を述べる。仕様への追跡は JSDoc `@requirements` が持つ。
   **`@requirements` は、その識別番号が実際に対象とする範囲のうち最も狭い囲みの直上に置く（MUST）。**
   グループ全体が対象なら `describe` の直上、1 件だけが対象なら その `it` の直上に置く。
   グループにまとまる複数件が対象なら、入れ子の `describe` を切ってその直上に置いてよい。
   **無関係な兄弟テストを巻き込む位置に置いてはならない**（対象でないテストが
   その要求を検証していることになり、追跡が不正確になる）。
   この規約の遵守は `scripts/audit-structure.mjs`（SC029・SC030）で機械的に検査する
   （**検査が見るのは名前だけで、`@requirements` の帰属先の妥当性は見ていない**）。
6. **前提の失敗はビルダーが throw する（MUST）**: 前提の構築段階に `expect` を
   置かない。前提が作れないなら、その場で `throw` して前提の失敗とテスト対象の
   検証失敗を区別できるようにする。`Result` を返す関数を前提に使う場合は、
   `_unsafeUnwrap()` の throw に任せてよい。この規約の遵守は
   `scripts/audit-structure.mjs`（SC031）で機械的に検査する。

**追記（2026-08-19・#168）**: 5・6 は `docs/timer/adr/0009`（timer の
FR-092/093/094・FR-096）からの昇格である。#135 / [ADR-0014](./0014-scan-target-integrity.md)
が構造監査の走査対象を全パッケージへ広げた結果、timer 限定の規約が
poker / protocol / rate-limit へ機械適用される状態になっていた。決定 2（GWT 構造）が
2026-08-16 に受けた扱いと同じ形で、規範の側を全体へ揃える。
```

「timer 固有の詳細（…SC-029〜032 という要求 ID との対応…）は、本 ADR では扱わない」
という既存の一文へ、5・6 が昇格した旨の注記を添える。

- [ ] **Step 2: ADR-0016 へ検査の射程を追記する**

決定 2 項目 2 の近くへ足す。

```markdown
**追記（2026-08-19・#168）**: 項目 2 の機械検査は `scripts/audit-public-surface.mjs` が持つ。
**走査対象は `SCANNED_PACKAGES` の `entry` から導くため、`index.ts` に限らない**
（アプリの `main.tsx` / `server.ts` も含む）。「エントリが `index.ts` のものだけ」という
絞り込みを書くほうが腐りやすく、アプリのエントリに `export *` を置きたい理由も無いため、
本決定より広い範囲を検査する。
```

- [ ] **Step 3: timer ADR 0009 へ昇格した旨を追記する**

```markdown
**追記（2026-08-19・#168）**: 名前（FR-092/093/094）と前提の失敗（FR-096）の規範は
[`docs/adr/0006`](../../adr/0006-test-conventions.md) の決定 5・6 へ昇格した。
本 ADR は 148 ファイルの移行記録として残る。**規範の正本は ADR-0006 である。**
```

- [ ] **Step 4: リンク検査を通す**

```bash
cd /home/vscode/tasuki-work
node scripts/check-links.mjs
# 期待: リンク検査 OK。走査対象の「うち追跡下」の件数が全件と一致すること
```

- [ ] **Step 5: コミットして push**

```bash
cd /home/vscode/tasuki-work
git add docs/
git commit -m "docs: テスト名と前提の規範を ADR-0006 へ昇格させる

- timer 限定だった FR-092/093/094・FR-096 を全体規範にする（決定 5・6）
- ADR-0016 へ公開面検査の射程（entry 全件）を追記する
- timer ADR 0009 は移行記録として残し、規範の正本が移ったことを明記する

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 15: 仕上げ（CI・Issue の訂正・切り出し・振り返り）

**Files:**
- Create: `docs/superpowers/plans/2026-08-19-public-surface-and-test-conventions-retrospective.md`（振り返り。既存の振り返りの書式に合わせる）

**Interfaces:** Consumes: Task 14 の結果。Produces: なし

- [ ] **Step 1: 全体を通しで走らせる**

```bash
cd /home/vscode/tasuki-work
pnpm typecheck
pnpm lint
pnpm test
node scripts/audit-structure.mjs
node scripts/audit-public-surface.mjs
node scripts/audit-log-hygiene.mjs
node scripts/audit-assembly-wiring.mjs
node scripts/audit-domain-error-shape.mjs
node scripts/audit-domain-side-effects.mjs
node scripts/audit-web-sync-boundary.mjs
node scripts/check-links.mjs
bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'
```

`pnpm` 系は turbo のキャッシュで「走ったふり」になりうる。
出力に `FULL TURBO` が出たら `--force` を付けて測り直す。

- [ ] **Step 2: PR を作る**

```bash
cd /home/vscode/tasuki-work
gh pr create --title "refactor: 公開面とテスト規約の未達を解消する（#72 E6 / #168）" --body "..."
```

本文には次を必ず書く。

- **SC039③ の「0 件」は例外表の 4 件を除いた値である**こと（設計正本 D3）
- 変更前と変更後の指標を**両方**出すこと
- 設計正本と実装計画へのリンク

- [ ] **Step 3: CI が 5/5 緑になることを確かめる**

```bash
cd /home/vscode/tasuki-work
gh pr checks --watch
```

**新しく足した `audit-public-surface` のステップが実際に走っていることを、
CI のログで確認する**（`docs` だけの変更では `quality` が走らないため、
コードを含む本 PR では走るはず）。走っていなければ `ci-scope` の判定を確認する。

- [ ] **Step 4: #168 本文の完了条件を訂正する**

```bash
cd /home/vscode/tasuki-work
gh issue view 168
```

- `grep -rn "export \*" packages/*/src apps/*/src` が 0 件 → `node scripts/audit-public-surface.mjs` が緑
- SC030 の目標行に書かれた現状値 3 → 4
- SC032 の現状値 1132/1345（84.2%） → 1157/1432（80.8%）
- `export *` は 6 行 → 7 行
- SC039 の完了条件へ「例外表に載る 4 件を除く」を明記

- [ ] **Step 5: 切り出す Issue を 3 件起票する**

設計正本「スコープ外（切り出す）」の 3 件。**起票時に現行 main で主張を再実測してから書く**
（Issue 本文の事実誤認は過去 4 件で起きている）。

1. `fix(scripts): SC-039 の走査が packages/timer-core 1 パッケージに限定されている`
2. `fix(timer-sync): ServerMsgSchema が製品の実経路に配線されていない`
3. `chore(poker-core): index 経由で誰も使わない 14 記号の扱いを決める`

- [ ] **Step 6: 振り返りを書く**

既存の振り返り文書の書式に合わせ、少なくとも次を残す。

- 敵対的検証で SC032 の定義変更を却下した経緯（`it.each` 35 件の脱落）
- 型検査が `index.ts` の列挙漏れを捕まえないこと（`computeStats` の実測）
- `grep -c` の終了ステータスで `&&` の連鎖が切れ、型検査が走っていなかった事故
- 検査を 1 本足すと 4 箇所を触り、その突合を見る検査が無いこと

- [ ] **Step 7: マージ**

```bash
cd /home/vscode/tasuki-work
gh pr merge --merge --delete-branch=false
```

**`--delete-branch` は付けない**（積み上げ PR の作法）。マージ後 `main` を pull し、
`node scripts/audit-structure.mjs` と `node scripts/audit-public-surface.mjs` を
`main` 上でもう一度走らせる。

---

## 自己レビュー結果

- **設計正本の網羅**: D1 → Task 1、D2 → Task 2・3、D3・D4 → Task 4、D5 → Task 14、
  D6 → Task 9、D7 ① → Task 5、D7 ② → Task 4、D8 → Task 15。
  SC029 → Task 7、SC030 → Task 8、SC032 → Task 10〜13。切り出し 3 件 → Task 15 Step 5
- **型の一貫性**: `findWildcardReexports(entrySources)` は Task 5 で定義し Task 5・6 で使う。
  `findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources)` は Task 4 で定義し
  Task 4 でのみ使う。`sc039cSelfOnlyPublicSymbols` の第 3 引数は既定値つきなので
  既存の呼び出しを壊さない
- **数値の整合**: SC032 の内訳は 93 + 91 + 80 + 11 = 275（設計正本の実測値と一致）。
  SC039③ は 34 −28（Task 1）−1（Task 2）−1（Task 3）= 4 → 例外表で 0（Task 4）
