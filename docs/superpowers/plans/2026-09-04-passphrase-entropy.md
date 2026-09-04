# 合言葉のエントロピー規範 実装計画（#145）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `AI_UNLOCK_KEY` とルームパスフレーズのエントロピー下限を規範として定め、`AI_UNLOCK_KEY` については本番の起動時 fail-closed で強制する。

**Architecture:** 判定は `apps/timer-sync/src/ai-unlock-key-policy.ts` の無状態な純粋関数 1 本に閉じ込め、`config.ts` の `loadSyncConfig` が既存の `ALLOWED_ORIGINS` / `HOST` 検査と同じ型で呼ぶ。下限の値はこのモジュールの定数を正本とし、文書へ転記しない。ルームパスフレーズはコードで強制せず規範（SHOULD）に留める。

**Tech Stack:** TypeScript / Bun（`bun test`・`bun:test`）/ valibot（既存。本計画では触らない）

**Spec:** `docs/superpowers/specs/2026-09-04-passphrase-entropy-design.md`

## Global Constraints

- **値の正本は「強制する主体」に置き、文書へ転記しない**（設計正本 D6・ADR 0002「二重正本を作らない」）。`AI_UNLOCK_KEY` の長さ下限はコードの定数、ルームパスフレーズの下限は設計正本 D5、目標値と前提レートは ADR 0011 決定5。
- **拒否の文言に鍵の値を含めない**（ADR 0012。分類は「秘密」）。`HOST` の検査は受け取った値を出しているが、あちらは「秘密」ではない。
- **検査は本番限定**（`isProduction`）。既存の `ALLOWED_ORIGINS` / `HOST` 検査と条件を揃える。
- **`aiUnlockKey` が未設定なら検査しない**（未設定＝AI 機能無効という既存の意味を壊さない）。
- **判定対象は trim 後の値**（`config.ts` は env を trim してから保持する）。
- **テストは `// Given` / `// When` / `// Then` を別の行に置く**。`// Given / When（…）` の 1 行形式は SC-032 の判定に一致しない。
- **構造監査の基準値を増やさない**（2026-09-04 実測: SC031 = 2 / SC032 = 1526/1528 / SC039 = 4 内訳すべて 0 / SC030 PASS）。SC031 の 2 件と SC032 の未達 2 件は #135 以来の既存。
- **公開記号を増やさない。** 新モジュールが `export` するのは関数 1 本だけにする（SC-039 を 0 件のまま保つ）。
- **新しい依存を足さない。**

---

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発（NON-NEGOTIABLE） | 通過 | Task 1・2 はいずれも「失敗するテスト → 実行して赤を見る → 最小実装 → 緑」の順で進む |
| II. 技術選定は ADR を通す | 該当なし | 新しいライブラリを足さない。規範そのものは ADR 0011 決定5 で通す |
| III. 揮発インメモリと単純運用 | 通過 | 状態を増やさない。判定は無状態の純粋関数で、起動時に 1 度だけ走る |
| IV. 境界の型安全 | 通過 | env という外部境界で fail-closed にする。既存の 2 検査と同じ型を踏襲する |
| V. 実画面検証 | 該当なし | 画面の変更が無い。パスフレーズ入力欄への案内は別 Issue へ送った（設計正本 §8） |
| VI. 依存は内向き | 通過 | 新モジュールは `apps/timer-sync/src/` に置く。`packages/timer-core` へ依存を足さない |
| VII. 検査は壊して確かめる | 通過 | Task 2 で判定を恒真に置き換えて赤を確認する。壊す前に対照実行で緑を確認する |
| VIII. 記録が正本 | 通過 | 値の正本を 1 つに決め、他の文書はそこを指す（Global Constraints 参照） |
| IX. 小さく回す | 通過 | 7 タスク。各タスクが独立してコミットでき、単体で検証できる |
| X. 抽象は実需で | 通過 | `export` は関数 1 本のみ。設定可能な下限や汎用のポリシー機構を作らない |
| XI. 秘密と個人情報を持ち込まない | 通過 | 拒否の文言に鍵の値を含めないことを E6 のテストで固定する |

**逸脱なし。** Complexity Tracking は不要。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `apps/timer-sync/src/ai-unlock-key-policy.ts`（新規） | `AI_UNLOCK_KEY` の下限判定。無状態の純粋関数 1 本と、値の正本である定数 |
| `apps/timer-sync/test/ai-unlock-key-policy.test.ts`（新規） | 判定関数の単体テスト（境界・非 ASCII・生成コマンド相当） |
| `apps/timer-sync/src/config.ts`（変更） | 起動時 fail-closed への結線 |
| `apps/timer-sync/test/config.test.ts`（変更） | 結線の単体テスト（本番限定・未設定・trim・文言） |
| `docs/adr/0011-threat-model-and-data-classification.md`（変更） | 決定5 の新設と「影響」への追記 |
| `docs/guides/security.md`（変更） | 運用者・ホスト向けの規範 |
| `deploy/README.md` / `deploy/timer/env.example` / `apps/timer-sync/.env.example`（変更） | 下限の注記とデプロイ前の差し替え手順 |

---

### Task 1: 下限の判定関数

**Files:**
- Create: `apps/timer-sync/src/ai-unlock-key-policy.ts`
- Test: `apps/timer-sync/test/ai-unlock-key-policy.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `findAiUnlockKeyViolation(key: string): string | null` — 規範に反していれば人が読める違反の説明を返し、満たしていれば `null` を返す。引数は **trim 済み**の値であること。

- [ ] **Step 1: 失敗するテストを書く**

`apps/timer-sync/test/ai-unlock-key-policy.test.ts` を新規作成する。

```ts
import { describe, it, expect } from "bun:test";
import { findAiUnlockKeyViolation } from "../src/ai-unlock-key-policy.js";

describe("findAiUnlockKeyViolation", () => {
  it("32 文字ちょうどの ASCII は違反なし", () => {
    // Given
    const key = "a".repeat(32);
    // When
    const violation = findAiUnlockKeyViolation(key);
    // Then
    expect(violation).toBeNull();
  });

  it("31 文字は長さ違反として説明を返す", () => {
    // Given
    const key = "a".repeat(31);
    // When
    const violation = findAiUnlockKeyViolation(key);
    // Then
    expect(violation).toContain("32 文字以上");
  });

  it("`openssl rand -hex 20` 相当（40 文字の 16 進）は違反なし", () => {
    // Given
    const key = "0123456789abcdef0123456789abcdef01234567";
    // When
    const violation = findAiUnlockKeyViolation(key);
    // Then
    expect(violation).toBeNull();
  });

  it("長さが足りていても非 ASCII を含むなら違反", () => {
    // Given
    const key = "あ".repeat(40);
    // When
    const violation = findAiUnlockKeyViolation(key);
    // Then
    expect(violation).toContain("ASCII");
  });

  it("途中に空白を含むなら違反（trim 済みを渡す契約なので中の空白は許さない）", () => {
    // Given
    const key = `${"a".repeat(16)} ${"a".repeat(16)}`;
    // When
    const violation = findAiUnlockKeyViolation(key);
    // Then
    expect(violation).toContain("ASCII");
  });

  it("違反の説明に鍵の値を含めない", () => {
    // Given
    const key = "himitsu-no-aikotoba";
    // When
    const violation = findAiUnlockKeyViolation(key);
    // Then
    expect(violation).not.toBeNull();
    expect(violation).not.toContain(key);
  });
});
```

- [ ] **Step 2: 実行して赤を確認する**

```bash
bun test test/ai-unlock-key-policy.test.ts
```

Expected: FAIL（`Cannot find module '../src/ai-unlock-key-policy.js'`）

- [ ] **Step 3: 最小の実装を書く**

`apps/timer-sync/src/ai-unlock-key-policy.ts` を新規作成する。

```ts
/**
 * AI 解錠キー（`AI_UNLOCK_KEY`）の下限規範（#145・ADR 0011 決定5）。
 *
 * ## 何を見るか
 *
 * 無状態で 2 つだけ見る。
 *
 * 1. ASCII 印字可能文字（`\x21`–`\x7e`）だけで構成されているか（**許可リスト**）
 * 2. 長さが下限以上か
 *
 * ## 何を見ていないか —— **乱数性は検査できない**
 *
 * `a` を 32 個並べた値は通過する。検査は規範（一様乱数で生成する。設計正本 D3）の
 * 充足を保証せず、**破ったことに気づける確率を上げるだけ**である。
 * この位置づけは、#103 設計正本 D6 が接続時 fail-closed に与えたものと同じ。
 *
 * ## なぜ bit 計算ではないのか
 *
 * 出現する文字クラスから探索空間を合算して `長さ × log2(C) ≧ 35 bit` を要求する案を
 * 試作して攻撃したところ、`password` / `aaaaaaaa` / `admin!!!` / `tasuki2026` が
 * すべて通過し、実質「小文字だけ 7 文字以下」しか弾けなかった（設計正本 §3.3）。
 * **賢い検査を選んだことで穴が増えた**ため、長さへ倒した。
 * 32 文字という下限は「人が手で決めた鍵」をほぼすべて落とすので、
 * 規範と検査の射程がおおむね一致する。
 */

/**
 * 長さの下限。**この定数が値の正本である**（設計正本 D6）。
 * 文書はこの位置を指し、値を転記しない。
 *
 * 32 は目標（全探索に 1 年以上）の最低線ではなく、推奨する生成コマンド
 * `openssl rand -hex 20`（40 文字）が自然に満たす値から採った（設計正本 D5）。
 * 最悪ケース（32 文字の 16 進 = 128 bit）でも、分散 1,000 回/秒で 1.08×10^28 年かかる。
 * 最低線（35 bit ＝ 英数 6 文字）を採ると、全ルーム共通・長寿命の秘密が
 * 使い捨てのルームコードより 32 倍薄い余裕になるため採らない。
 */
const MIN_LENGTH = 32;

/** ASCII の印字可能文字（空白と制御文字を除く）だけか。 */
const ASCII_PRINTABLE = /^[\x21-\x7e]+$/;

/**
 * 規範への違反を返す。満たしていれば `null`。
 *
 * **引数は trim 済みの値であること。** `config.ts` は env を trim してから保持するので、
 * 検査した値と保持する値をずらさないために呼び出し側で trim する（設計正本 §3.1）。
 *
 * **戻り値に鍵の値を含めない**（ADR 0012。分類は「秘密」）。
 */
export function findAiUnlockKeyViolation(key: string): string | null {
  if (!ASCII_PRINTABLE.test(key)) {
    return "ASCII の印字可能文字（空白を除く）だけで構成してください";
  }
  if (key.length < MIN_LENGTH) {
    return `${MIN_LENGTH} 文字以上にしてください`;
  }
  return null;
}
```

- [ ] **Step 4: 実行して緑を確認する**

```bash
cd /workspaces/claym/local/Tasuki/apps/timer-sync && bun test test/ai-unlock-key-policy.test.ts
```

Expected: PASS（6 tests）

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add apps/timer-sync/src/ai-unlock-key-policy.ts apps/timer-sync/test/ai-unlock-key-policy.test.ts
git commit -m "feat(timer-sync): AI 解錠キーの下限判定を足す（#145）

- ASCII 印字可能文字の許可リストと長さ下限の 2 条件のみを無状態で見る
- bit 計算を採らない理由（password / aaaaaaaa を通した実測）を doc へ残す
- 下限の値はこのモジュールの定数を正本とし、文書へ転記しない"
```

---

### Task 2: 起動時 fail-closed への結線

**Files:**
- Modify: `apps/timer-sync/src/config.ts`（`HOST` 検査の直後・`return {` の直前に検査を足し、`aiUnlockKey` の算出を `return` の外へ引き上げる）
- Modify: `apps/timer-sync/test/config.test.ts`（末尾に `describe` を 1 つ足す）

**Interfaces:**
- Consumes: `findAiUnlockKeyViolation(key: string): string | null`（Task 1）
- Produces: なし（`loadSyncConfig` の既存シグネチャは変わらない）

- [ ] **Step 1: 失敗するテストを書く**

`apps/timer-sync/test/config.test.ts` の**末尾**（最後の `});` の直前）に次を足す。

```ts
  describe("AI_UNLOCK_KEY の下限（#145・ADR 0011 決定5）", () => {
    /** `openssl rand -hex 20` 相当。下限を満たす。 */
    const VALID_KEY = "0123456789abcdef0123456789abcdef01234567";
    const PROD = { NODE_ENV: "production", ALLOWED_ORIGINS: "https://x.example" };

    it("本番で下限を割る AI_UNLOCK_KEY なら起動を拒否する", () => {
      // Given
      const env = { ...PROD, AI_UNLOCK_KEY: "himitsu" };
      // When
      const load = () => loadSyncConfig(env);
      // Then
      expect(load).toThrow(/AI_UNLOCK_KEY/);
    });

    it("本番で下限を満たす AI_UNLOCK_KEY なら起動する", () => {
      // Given
      const env = { ...PROD, AI_UNLOCK_KEY: VALID_KEY };
      // When
      const c = loadSyncConfig(env);
      // Then
      expect(c.aiUnlockKey).toBe(VALID_KEY);
    });

    it("本番で AI_UNLOCK_KEY が未設定なら検査しない", () => {
      // Given
      const env = { ...PROD };
      // When
      const c = loadSyncConfig(env);
      // Then
      expect(c.aiUnlockKey).toBeUndefined();
    });

    it("本番以外なら下限を割っていても起動する", () => {
      // Given
      const env = { ALLOWED_ORIGINS: "https://x.example", AI_UNLOCK_KEY: "himitsu" };
      // When
      const c = loadSyncConfig(env);
      // Then
      expect(c.aiUnlockKey).toBe("himitsu");
    });

    it("本番で非 ASCII の AI_UNLOCK_KEY なら起動を拒否する", () => {
      // Given
      const env = { ...PROD, AI_UNLOCK_KEY: "あ".repeat(40) };
      // When
      const load = () => loadSyncConfig(env);
      // Then
      expect(load).toThrow(/AI_UNLOCK_KEY/);
    });

    it("前後に空白があっても trim 後の値で判定する", () => {
      // Given
      const env = { ...PROD, AI_UNLOCK_KEY: `  ${VALID_KEY}  ` };
      // When
      const c = loadSyncConfig(env);
      // Then
      expect(c.aiUnlockKey).toBe(VALID_KEY);
    });

    it("拒否の文言に鍵の値を含めない", () => {
      // Given
      const secret = "himitsu-no-aikotoba";
      const env = { ...PROD, AI_UNLOCK_KEY: secret };
      // When
      let message = "";
      try {
        loadSyncConfig(env);
      } catch (e) {
        message = (e as Error).message;
      }
      // Then
      expect(message).toContain("AI_UNLOCK_KEY");
      expect(message).not.toContain(secret);
    });
  });
```

- [ ] **Step 2: 実行して赤を確認する（対照実行を兼ねる）**

```bash
cd /workspaces/claym/local/Tasuki/apps/timer-sync && bun test test/config.test.ts
```

Expected: 既存 56 件は PASS のまま、新規 7 件のうち「拒否する」系 3 件が FAIL（例外が投げられない）。
**「起動する」系 4 件は実装前から緑である**ことを確認する（対照実行。ここが赤いなら前提が壊れている）。

- [ ] **Step 3: 最小の実装を書く**

`apps/timer-sync/src/config.ts` を 3 箇所直す。

1. 冒頭の import に 1 行足す。

```ts
import { findAiUnlockKeyViolation } from "./ai-unlock-key-policy.js";
```

2. `HOST` の検査（既存の `if (isProduction && !isLoopbackHost(host)) { ... }`）の**直後**に足す。

```ts
  // AI 解錠キーの下限（#145・ADR 0011 決定5）。
  // 未設定なら検査しない（未設定＝AI 機能無効という既存の意味を壊さない）。
  // 判定は trim 後の値に対して行う（保持する値とずらさない）。
  const aiUnlockKey = (env["AI_UNLOCK_KEY"] ?? "").trim() || undefined;
  if (isProduction && aiUnlockKey !== undefined) {
    const violation = findAiUnlockKeyViolation(aiUnlockKey);
    if (violation !== null) {
      throw new Error(
        `本番（NODE_ENV=production）では AI_UNLOCK_KEY が下限を満たす必要があります: ${violation}。` +
          "総当たりに対する余裕はこの下限で決まります（ADR 0011 決定5）。起動を中止します。" +
          "対処: `openssl rand -hex 20` で生成し直し、env を差し替えてから再起動してください。" +
          "受け取った値は分類「秘密」のため、この文言には含めません。",
      );
    }
  }
```

3. `return {` の中の `aiUnlockKey` の行を、上で作った変数を使う形へ変える。

```ts
    aiUnlockKey,
```

（変更前は `aiUnlockKey: (env["AI_UNLOCK_KEY"] ?? "").trim() || undefined,`）

- [ ] **Step 4: 実行して緑を確認する**

```bash
cd /workspaces/claym/local/Tasuki/apps/timer-sync && bun test test/config.test.ts
```

Expected: PASS（63 tests = 既存 56 + 新規 7）

- [ ] **Step 5: 破壊検証（判定を恒真にして赤を見る）**

まず作業ツリーが clean であることを確認する。**未コミットの実装を消す事故を防ぐため、この確認を飛ばさない。**

```bash
cd /workspaces/claym/local/Tasuki && git status --porcelain
```

clean でなければ先に Step 6 のコミットを済ませてから戻る。次に判定を恒真に置き換える。

```bash
cd /workspaces/claym/local/Tasuki
sed -i 's|^export function findAiUnlockKeyViolation(key: string): string \| null {|export function findAiUnlockKeyViolation(_key: string): string \| null {\n  return null; // 破壊検証|' apps/timer-sync/src/ai-unlock-key-policy.ts
cd apps/timer-sync && bun test test/ai-unlock-key-policy.test.ts test/config.test.ts
```

Expected: FAIL（`ai-unlock-key-policy.test.ts` の違反系 4 件と `config.test.ts` の拒否系 3 件が赤くなる）。
**赤が出なければ、テストが実装に届いていない。** 戻す。

```bash
cd /workspaces/claym/local/Tasuki && git checkout -- apps/timer-sync/src/ai-unlock-key-policy.ts
cd apps/timer-sync && bun test test/ai-unlock-key-policy.test.ts test/config.test.ts
```

Expected: PASS（元に戻って緑）

- [ ] **Step 6: 型検査と lint を通す**

```bash
cd /workspaces/claym/local/Tasuki && corepack pnpm --filter @tasuki/timer-sync typecheck && corepack pnpm --filter @tasuki/timer-sync lint
```

Expected: どちらも exit 0

- [ ] **Step 7: 構造監査が退行していないことを確認する**

```bash
cd /workspaces/claym/local/Tasuki && node scripts/audit-structure.mjs | tail -12
```

Expected: SC031 = 2 / SC032 = 1526 以上/1528 以上（99.9% 以上）/ SC039 = 4 内訳すべて 0 / SC030 PASS。
**SC039 が 0 でなくなったら、`export` を増やしたことが原因である。**

- [ ] **Step 8: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add apps/timer-sync/src/config.ts apps/timer-sync/test/config.test.ts
git commit -m "feat(timer-sync): 本番で AI 解錠キーの下限を fail-closed で強制する（#145）

- 既存の ALLOWED_ORIGINS / HOST 検査と同じ型で 3 つ目の検査を足す
- 未設定なら検査しない。判定は trim 後の値に対して行う
- 拒否の文言に鍵の値を含めない（ADR 0012・分類「秘密」）"
```

---

### Task 3: ADR 0011 決定5 の新設

**Files:**
- Modify: `docs/adr/0011-threat-model-and-data-classification.md`

**Interfaces:**
- Consumes: なし
- Produces: 「ADR 0011 決定5」という参照先（Task 4・5 が指す）

- [ ] **Step 1: 追記位置を確認する**

```bash
cd /workspaces/claym/local/Tasuki && grep -n "^## \|^### " docs/adr/0011-threat-model-and-data-classification.md
```

Expected: `### 決定4: ルームコードのエントロピー下限` の次の同位以上の見出しが `## 影響` であること。
**決定5 はその `## 影響` の直前に置く**（＝`## 決定` の末尾）。直後が `##` なので、
追記によって直後の小節の親が変わることはない。

- [ ] **Step 2: 決定5 を書く**

`## 影響` の行の直前に、次を挿入する。

```markdown
### 決定5: 合言葉のエントロピー下限

`AI_UNLOCK_KEY`（AI 解錠キー）とルームパスフレーズにも、決定4 と同じ方法でエントロピーの
下限を置く（**MUST**）。下限は「**想定される総当たり速度で全探索に要する時間**」で定義し、
**目標値は決定4 と同じ「1 年以上」**とする。

**前提レートは対象ごとに分ける（MUST）。**

| 対象 | 前提レート | 分ける根拠 |
|---|---|---|
| `AI_UNLOCK_KEY` | **1,000 回/秒**（#103 設計正本 §3.4 の分散モデル） | サーバー全体で 1 本・運用者が変えるまで不変・漏洩すれば全ルームに及ぶ |
| ルームパスフレーズ | **1 回/秒**（単一 IP の持続レート。決定4 と同じ） | 1 ルームだけを守り、アイドル 30 分で消滅する |

決定4 は「ルームの寿命の短さは脅威の抑止にならない」として揮発性を退けたが、**この論法は
ルームコードには成立し、パスフレーズには成立しない。** ルーム名・slug は繰り返し推測できるため
攻撃者は特定ルームの生存に依存しないが、パスフレーズは特定の 1 ルームだけを守るので、
その攻撃は当該ルームの生存に依存する。逆に `AI_UNLOCK_KEY` は決定4 が射程外とした分散攻撃を
前提に置くべき性質（全ルーム共通・長寿命）を持つ。

**`AI_UNLOCK_KEY` は一様乱数で生成する（MUST）。** 人が決めた文字列は算出どおりの
エントロピーを持たないため、長さの下限は乱数生成を前提としてのみ意味を持つ。

**下限は目標の最低線ではなく、生成方法から採る（MUST）。** #144 がルームコードで
目標の 35 倍の余裕を持つ桁数を採ったのと同じ姿勢による。最低線をそのまま下限にすると、
全ルーム共通・長寿命の秘密が使い捨てのルームコードより薄い余裕になる。

**`AI_UNLOCK_KEY` の下限は本番の起動時 fail-closed で強制する（MUST）。**
判定は無状態で「ASCII 印字可能文字のみ（許可リスト）」と「長さ下限」の 2 条件だけを見る。
**文字クラスからエントロピーを算出する方式は採らない** —— 試作して攻撃したところ、
実質「小文字だけ 7 文字以下」しか弾けなかった（#145 設計正本 §3.3）。

**ルームパスフレーズはコードで強制しない（MUST）。** 設定者は運用者ではなく会議中のホストであり、
入力に下限を課すと利用者体験を直接損なう。またパスフレーズはルームコードの上に重ねる任意の層で
あって、単独で資格情報を担っていない。長さの下限は **SHOULD** に留め、
**ルーム名・チーム名・日付・slug と同じ語を使わないこと**を併せて求める（**SHOULD**）。

**定期回転を総当たり対策として求めない（MUST）。** 下限を満たす鍵の全探索には
天文学的な時間がかかるため、総当たりを理由にした定期回転には根拠が無い。回転を求めるのは
「漏洩を疑ったとき」と「鍵を共有した相手の範囲が変わったとき」に限る。

**この検査は規範の充足を保証しない。** 乱数性は検査できないため、同じ文字を並べた値は通過する。
検査は「規範を破ったことに気づける形にする」ものである —— #103 設計正本 D6 が接続時
fail-closed に与えた位置づけと同じである。

**下限の値は本 ADR へ転記しない。** 本 ADR が持つのは目標値と前提レートだけである
（本 ADR ステータス欄の宣言に従う）。`AI_UNLOCK_KEY` の長さ下限の正本は
`apps/timer-sync/src/ai-unlock-key-policy.ts` の定数（実際に強制する主体）であり、
ルームパスフレーズの下限の正本は #145 設計正本 D5 である。算出と検算は同設計正本 §3.4 にある。
```

- [ ] **Step 3: 「影響」へ 1 項足す**

`## 影響` 節の箇条書きの**末尾**に足す（節の途中へ挿し込まない）。

```markdown
- 決定5 により、決定4 が #144 の実施時に見送った選択肢 2（ルーム名つきルームでパスフレーズを
  必須化する）は、「目標を満たした」と言う根拠を持てるようになった。**ただし実装は決定4 自身の
  作法どおり別 Issue とする**（利用者から見える振る舞いが変わるため、本 ADR では実装を決定しない）。
```

- [ ] **Step 4: リンク検査を通す**

```bash
cd /workspaces/claym/local/Tasuki && git add docs/adr/0011-threat-model-and-data-classification.md && node scripts/check-links.mjs
```

Expected: `リンク検査 OK`

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git commit -m "docs: ADR 0011 に決定5（合言葉のエントロピー下限）を足す（#145）

- 目標値は決定4 の「全探索に 1 年以上」を継承し、前提レートだけ対象ごとに分ける
- 下限の値は ADR へ転記せず、強制する主体（コードの定数）と設計正本 D5 を指す
- 決定4 が見送った選択肢 2 の再評価が可能になったことを「影響」へ足す"
```

---

### Task 4: セキュリティガイドへの反映

**Files:**
- Modify: `docs/guides/security.md`

**Interfaces:**
- Consumes: 「ADR 0011 決定5」（Task 3）
- Produces: なし

- [ ] **Step 1: 追記位置を確認する**

```bash
cd /workspaces/claym/local/Tasuki && grep -n "^## " docs/guides/security.md
```

Expected: `## 秘密を比較するとき` と `## レビュー時のチェックリスト` が並んでいること。
**新しい節はこの 2 つの間に置く。**

- [ ] **Step 2: 「合言葉を決めるとき」節を書く**

`## レビュー時のチェックリスト` の行の直前に、次を挿入する。

````markdown
## 合言葉を決めるとき（#145）

規範の正本は `docs/adr/0011-threat-model-and-data-classification.md` の決定5。ここは手順だけを置く。

### AI 解錠キー（`AI_UNLOCK_KEY`）— 運用者が決める

**一様乱数で生成すること（MUST）。** 手で考えた文字列を使わない。

```bash
openssl rand -hex 20
```

`+` `/` `=` を含まないので、systemd の `EnvironmentFile=` やシェルの引用規則で
曖昧さが生じない。`openssl rand -base64 24` でもよいが、これらの文字を含む。

- **長さの下限は本番の起動時検査が強制する。** 下限を割る値を設定するとサーバーは起動しない。
  値の正本は `apps/timer-sync/src/ai-unlock-key-policy.ts` の定数であり、ここには転記しない
- **検査は乱数性を見ない。** 同じ文字を並べた値は通過する。検査は規範の充足を保証しない
- **定期回転は求めない。** 回転するのは、漏洩を疑ったときと、鍵を共有した相手の範囲が
  変わったとき（解錠する host が増える運用では範囲が広がり続ける）

### ルームパスフレーズ — ホストが会議中に決める

コードでは強制しない（**SHOULD**）。ルームコード自体が既に目標を大きく上回る余裕を
持っているため、パスフレーズはその上に重ねる任意の層である。

- **8 文字以上にする（SHOULD）。** 数字だけでもこの長さなら目標を満たす
- **推測されやすい語を使わない（SHOULD）。** ルーム名・チーム名・日付や、
  `daily` `mob` `sprint` のような slug と同じ語は推測の対象になる
- **長さより推測されやすさのほうが効く。** 失敗は IP 単位でレート制限されるため、
  持続的な総当たりよりも「一発で当てられる語」のほうが現実的な脅威である
````

- [ ] **Step 3: リンク検査を通す**

```bash
cd /workspaces/claym/local/Tasuki && git add docs/guides/security.md && node scripts/check-links.mjs
```

Expected: `リンク検査 OK`

- [ ] **Step 4: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git commit -m "docs: セキュリティガイドに「合言葉を決めるとき」を足す（#145）

- 運用者向けに生成コマンドと、検査が乱数性を見ないという限界を書く
- ホスト向けにパスフレーズの SHOULD（8 文字以上・推測されやすい語を避ける）を書く
- 下限の値は転記せず、正本の位置を指す"
```

---

### Task 5: デプロイ手順と env の注記

**Files:**
- Modify: `deploy/README.md`
- Modify: `deploy/timer/env.example`
- Modify: `apps/timer-sync/.env.example`

**Interfaces:**
- Consumes: 「ADR 0011 決定5」（Task 3）・`docs/guides/security.md`（Task 4）
- Produces: なし

- [ ] **Step 1: 現状を確認する**

```bash
cd /workspaces/claym/local/Tasuki
grep -n "AI_UNLOCK_KEY" deploy/README.md deploy/timer/env.example apps/timer-sync/.env.example
```

Expected: `deploy/README.md` に 3 箇所（env 表・変更手順の表・無効化の説明）、
`deploy/timer/env.example` に 1 箇所、`apps/timer-sync/.env.example` に 1 箇所。

- [ ] **Step 2: `deploy/README.md` の env 表の説明を差し替える**

`| `AI_UNLOCK_KEY` | 同上 | AI 生成の解錠合言葉 |` の行の説明を次へ変える。

```markdown
| `AI_UNLOCK_KEY` | 同上 | AI 生成の解錠合言葉。**一様乱数で生成すること**（`openssl rand -hex 20`）。本番では起動時に下限を検査し、割っていれば起動しない（ADR 0011 決定5） |
```

- [ ] **Step 3: `deploy/README.md` に「デプロイ前の確認」を足す**

`AI_UNLOCK_KEY` の変更手順を説明している表の**直後**に、次の段を足す。

```markdown
> **⚠ #145 の起動時検査を含む版を初めて配る前に、必ず鍵を差し替えること。**
> 現行の `AI_UNLOCK_KEY` が下限を割っていると、**デプロイ後にサーバーが起動しない。**
> `ALLOWED_ORIGINS` や `HOST` と違い、これは運用者が過去に決めた値であり、
> 普段は変わらない構造的な設定ではない。
>
> ```bash
> # 1. 新しい鍵を生成する（ローカルで実行してよい）
> openssl rand -hex 20
> # 2. /opt/tasuki/tasuki-sync.env の AI_UNLOCK_KEY を差し替える
> # 3. 利用者へ新しい合言葉を配り直す
> # 4. sudo systemctl restart tasuki-sync
> ```
```

- [ ] **Step 4: 2 つの `env.example` に注記を足す**

`deploy/timer/env.example` の `# AI_UNLOCK_KEY=<解錠の合言葉>` を次へ変える。

```
# AI_UNLOCK_KEY=<解錠の合言葉。openssl rand -hex 20 で生成する>
# 本番では起動時に長さ・文字種の下限を検査する（ADR 0011 決定5）。割っていると起動しない。
```

`apps/timer-sync/.env.example` の `#AI_UNLOCK_KEY=` の直前に次を足す。

```
# 一様乱数で生成すること（openssl rand -hex 20）。本番では起動時に下限を検査する（ADR 0011 決定5）。
```

- [ ] **Step 5: リンク検査と shellcheck を通す**

```bash
cd /workspaces/claym/local/Tasuki
git add deploy/README.md deploy/timer/env.example apps/timer-sync/.env.example
node scripts/check-links.mjs
```

Expected: `リンク検査 OK`（`.env.example` と `deploy/` の `.md` はリンク検査の走査対象。
`env.example` はシェルスクリプトではないので shellcheck の対象外）

- [ ] **Step 6: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git commit -m "docs(deploy): AI 解錠キーの下限と、デプロイ前の差し替え手順を足す（#145）

- 現行の鍵が下限を割っていると、デプロイ後に起動しないことを明記する
- 生成コマンドを env.example 2 本と README に載せる"
```

---

### Task 6: 申し送りの Issue 起票と #145 本文への EARS 転記

> **⚠ このタスクは GitHub へ書き込む。実行前に利用者の承認を得ること。**
> 起票する内容と本文の差分を先に提示し、承認を得てから `gh` を叩く。

**Files:**
- なし（GitHub 上の操作のみ）

**Interfaces:**
- Consumes: 設計正本 §6.1（EARS）・§8（申し送り）
- Produces: なし

- [ ] **Step 1: 起票する 3 件の本文を利用者へ提示して承認を得る**

1. **`ADMIN_TOKEN` のエントロピー規範** — 同じ「資格情報」分類の運用者設定値だが #145 の射程外。
   決定5 と同じ方法を適用できるか判断する
2. **ルームパスフレーズ入力欄への案内** — 設定者はホスト（一般利用者）なので運用ガイドの規範が
   届かない。UI 文言は書体の base 層に収める必要があり、部分集合の計測が要る
3. **ADR 0011 決定4 の選択肢 2 の再評価** — ルーム名つきルームでパスフレーズを必須化するか。
   #145 の決着で「目標を満たした」と言う根拠を持てるようになった

- [ ] **Step 2: 承認後に起票する**

```bash
cd /workspaces/claym/local/Tasuki

gh issue create --title "docs: ADMIN_TOKEN のエントロピー規範を定める" --body "$(cat <<'B1'
## 背景

#145 で `AI_UNLOCK_KEY` とルームパスフレーズのエントロピー下限を定め、ADR 0011 決定5 とした。
`ADMIN_TOKEN` は同じ「資格情報」分類（ADR 0011 決定1）の運用者設定値だが、#145 の射程外とした。

## やること

- [ ] 決定5 と同じ方法（探索空間 ÷ 想定レート ≧ 1 年）を `ADMIN_TOKEN` へ適用できるか判断する
- [ ] 前提レートを決める（管理経路の失敗が IP 単位のレート制限に載っているかを実測してから）
- [ ] 適用するなら下限と起動時検査を足す

## 完了条件

- [ ] `ADMIN_TOKEN` に規範を置くか置かないかが、根拠つきで決まっている

## 関連

- 申し送り元: #145 設計正本 §8
B1
)"

gh issue create --title "feat(timer-web): ルームパスフレーズ入力欄に強度の案内を出す" --body "$(cat <<'B2'
## 背景

#145 でルームパスフレーズの下限を SHOULD として定めたが、**設定者はホスト（一般利用者）**であり、
運用ガイドの規範は届かない。ADR 0011 決定5 はコードでの強制を採らないと決めているため、
届ける手段は画面の案内しかない。

## 制約

UI 文言は書体の base 層に収める必要がある。**新しい漢字を 1 字足すと ext 層 210KB を引く**ため、
文言を決めたら部分集合を計測すること。

## やること

- [ ] `apps/timer-web/src/ui/components/PassphrasePanel.tsx` に案内文を出す
- [ ] 文言が base 層に収まることを計測して確かめる

## 完了条件

- [ ] ホストが設定時に下限と「推測されやすい語を避ける」ことを読める
- [ ] 書体の base 層が増えていない

## 関連

- 申し送り元: #145 設計正本 §8
B2
)"

gh issue create --title "feat: ルーム名つきルームでパスフレーズを必須化するか判断する（ADR 0011 決定4 選択肢 2）" --body "$(cat <<'B3'
## 背景

ADR 0011 決定4 は #144 の実施時に、選択肢 2（ルーム名つきルームでパスフレーズを必須化する）を
**「#145 が未定で『目標を満たした』と言う根拠を持てない」**ため見送った。
#145（ADR 0011 決定5）が決着したので、この再評価が可能になった。

## やること

- [ ] 決定5 のパスフレーズ規範を前提に、必須化が目標を満たすかを判定する
- [ ] 必須化する場合、利用者から見える振る舞いの変化（共有 URL・入室の手順）を洗い出す

## 完了条件

- [ ] 必須化するかしないかが、根拠つきで決まっている

## 関連

- 申し送り元: #145 設計正本 §8 / ADR 0011 決定4「実施（2026-08-30・#144）」
B3
)"
```

- [ ] **Step 3: #145 の本文へ EARS を転記する承認を得て、反映する**

設計正本 §6.1 の E1〜E6 を #145 の「振る舞い」節へ転記する（#68 の運用 2）。
本文の差分を提示し、承認を得てから `gh issue edit 145 --body-file <path>` で反映する。

- [ ] **Step 4: コミットは不要**

GitHub 上の操作のみ。作業ツリーは変わらない。

---

### Task 7: PR を出す

**Files:**
- なし（PR 本文のみ）

**Interfaces:**
- Consumes: Task 1〜6 のすべて
- Produces: なし

- [ ] **Step 1: 全体のテストを通す**

```bash
cd /workspaces/claym/local/Tasuki && corepack pnpm test
```

Expected: 全パッケージ緑

- [ ] **Step 2: 構造監査とリンク検査を最終確認する**

```bash
cd /workspaces/claym/local/Tasuki
node scripts/audit-structure.mjs | tail -12
node scripts/check-links.mjs
node scripts/audit-plan-gate.mjs
```

Expected: SC 指標が基準値から退行していない / `リンク検査 OK` / `audit-plan-gate` が
**本計画（境界日以降の最初の plan）を通す**

- [ ] **Step 3: PR を作る**

```bash
cd /workspaces/claym/local/Tasuki
git push
gh pr create --title "feat: 合言葉のエントロピー規範を定め、AI 解錠キーの下限を強制する（#145）" --body "$(cat <<'BODY'
## 概要

`AI_UNLOCK_KEY` とルームパスフレーズのエントロピー下限を規範として定め、`AI_UNLOCK_KEY` については本番の起動時 fail-closed で強制する。ADR 0011 決定4 が確立した「全探索に 1 年以上」という方法を、合言葉へ適用した。

## 変更内容

- ADR 0011 に決定5 を新設。目標値は決定4 から継承し、前提レートだけ対象ごとに分けた
- `apps/timer-sync` に下限の判定と起動時 fail-closed を足した
- セキュリティガイドとデプロイ手順に規範と生成コマンドを反映した

## 設計上の判断

- **bit 計算方式を採らなかった。** 試作して攻撃したところ `password` / `aaaaaaaa` / `admin!!!` がすべて通過し、実質「小文字だけ 7 文字以下」しか弾けなかった
- **下限は目標の最低線ではなく生成方法から採った。** 最低線では、全ルーム共通・長寿命の秘密が使い捨てのルームコードより 32 倍薄い余裕になる
- **ルームパスフレーズはコードで強制しない。** 設定者は運用者ではなく会議中のホストである

## ⚠ デプロイ前の注意

**現行の本番 `AI_UNLOCK_KEY` が下限を割っていると、デプロイ後にサーバーが起動しない。** `deploy/README.md` に差し替え手順を書いた。

## テスト方法

- [ ] `corepack pnpm test` が緑
- [ ] `corepack pnpm --filter @tasuki/timer-sync typecheck` / `lint` が緑
- [ ] `node scripts/audit-structure.mjs` が基準値から退行していない
- [ ] `node scripts/check-links.mjs` が OK
- [ ] 破壊検証: 判定関数を恒真に置き換えると 7 件が赤くなる

Closes #145
BODY
)"
```

- [ ] **Step 4: DoD 8 項目を PR 本文へ記入する**

`docs/guides/definition-of-done.md` の 8 項目を確認し、該当しない項目は「該当なし」と明記する。
