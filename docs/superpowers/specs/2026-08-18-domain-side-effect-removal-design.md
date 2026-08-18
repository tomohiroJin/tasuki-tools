# 設計: ドメインから副作用を除去する（#72 E3 / #166）

- 対象 Issue: [#166](https://github.com/tomohiroJin/tasuki-tools/issues/166)（親: [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)）
- 日付: 2026-08-18
- 起点: main `e905b38`
- 上位の設計正本: [`2026-08-17-adr-alignment-e1-design.md`](2026-08-17-adr-alignment-e1-design.md)

## 概要

`packages/timer-core/src/problem.ts:70` の `Math.abs(Date.now()) % candidates.length` を
引数注入へ替える。**新しい振る舞いは 1 つも足さない。**
呼び出し側が実時刻を渡す限り、選ばれるお題は変更前と 1 件も変わらない。

厳密に言うと、変更後に 1 点だけ差が出る。**`now` に有限数以外が渡った場合の挙動**である。
変更前はその入力が存在しえなかった（内部で `Date.now()` を呼んでいた）。
変更後は呼び出し側の配線漏れで起こりうるので、黙って先頭のお題を返さず `TypeError` で落とす（D1b）。
有効な入力での結果は完全に同一である。

あわせて、規範（憲法 原則 VI / `docs/timer/adr/0002` / `docs/adr/0016` 決定 2 項目 4）が
機械検査を持っていなかった空白を `scripts/audit-domain-side-effects.mjs` で埋める。

## 背景

### 現状（2026-08-18 実測）

`packages/*-core/src` 配下で環境から直接値を読んでいるのは **1 箇所だけ**である。

```
packages/timer-core/src/problem.ts:70:  const index = Math.abs(Date.now()) % candidates.length;
```

`Date.now` / `Math.random` / `performance.now` / `crypto.*` / `process.env` / `process.hrtime` /
`new Date` を timer-core・poker-core の `src` 全体に対して探し、**コメントでの言及も含めて上記 1 行以外は 0 件**
であることを確認した。

### Issue 本文の宛先が足りていない

Issue #166 の完了条件は「呼び出し側（`apps/timer-sync` のアダプタ）まで配線されている」と書いているが、
`pickFallback` の本番呼び出しは **4 箇所**で、うち 1 つは **timer-web** である。

| 呼び出し元 | 箇所 | 時刻源 |
|---|---|---|
| `apps/timer-sync/src/application/problem-delegation.ts` | `:115` `:234` `:279` | `Clock` ポートが**依存として宣言済み**（後述） |
| `apps/timer-web/src/ai/no-ai.ts` | `:12` | 無い |

テストからの呼び出しは `packages/timer-core/test/problem.test.ts` の **4 箇所**（実行して数えた）。

### `ProblemDelegatorDeps.clock` は死んだ必須依存である

`problem-delegation.ts:45` は `clock: Clock` を**必須**で宣言しているが、コンストラクタ（`:93`〜`:103`）は
これを保持していない。`this.clock` は存在せず、`clock` という語はファイル中に **import と型宣言の 2 箇所にしか現れない**。
呼び出し側（`create-sync-server.ts:105` と各テスト）は渡すことを強制されているが、渡した値は捨てられている。

E3 はこの依存に初めて仕事を与える。テスト側は既に偽 clock を渡しているので、決定論的な配線テストの追加コストは
ほぼゼロである。

### 既存テストはこの変更を観測できない

`packages/timer-core/test/problem.test.ts` の `pickFallback` に関する検証は
「`source` が `"fallback"` である」「お題が必須フィールドを持つ」だけで、
**どのお題が選ばれたかを 1 件も見ていない**。したがって第 3 引数を完全に無視する実装でも全件緑になる。

#165 で「見つけた振る舞い差異 3 件はすべて実装者の自己申告が起点で、テストが見つけたものは 0 件」だったのと
同じ地形である。テスト戦略（D6〜D8）はここを埋めることに集中する。

## 決定

### D1: 値注入 `now: number` とする（ポート注入にしない）

```ts
export function pickFallback(
  language: string,
  difficulty: string,
  now: number,
): ProblemWithSource
```

- **既定値を置かない。** 既定値 `= Date.now()` にすると呼び出し側が無変更で通り、
  「配線されている」という完了条件が検査されないまま緑になる。必須にすることで、
  配線漏れは `typecheck` が落とす。
- `Math.abs(now) % candidates.length` は 1 文字も変えない。`now` に `Date.now()` が渡る限り
  選ばれるお題は変更前と同一である。
- **`() => number` や `{ random(): number }` を受け取らない。** ドメインが関数を受け取って中で呼ぶ形にすると
  `pickFallback` が純粋関数でなくなる。憲法 原則 VI が求めているのは「副作用を境界に置く」ことなので、
  境界で評価済みの**値**を渡すのが素直である。
- 引数名は `seed` ではなく `now` とする。`docs/timer/adr/0002` の逐語（「時刻は引数 `now` として注入し」）に
  従い、timer-core の他所（`records.ts:20`・`aggregate.ts:163`・`evolve.ts` 各所）が
  すべて `now: number` なのと語彙を揃える。**実体は擬似乱数の種であり時刻としての意味を持たない**ことは
  docstring に明記する。

### D1b: `?? FALLBACK_PROBLEMS[0]!` を消す

```ts
// 変更前
const entry = candidates[index] ?? FALLBACK_PROBLEMS[0]!;
// 変更後
const entry = candidates[index]!;
```

**理由: この `??` は D1 と組み合わさると「配線漏れを飲み込む穴」になる。**

`now` を渡し忘れると `Math.abs(undefined)` が `NaN`、`candidates[NaN]` が `undefined` となり、
`??` の右辺が受け止めて**先頭のお題が返る**。既存 4 テストの主張は `source === "fallback"` と
truthy チェックだけなので**全部緑のまま通る**（2026-08-18 に実測）。

型検査も捕まえない。`packages/timer-core/tsconfig.json` は `"exclude": [..., "test"]`、
`apps/timer-sync/tsconfig.json` は `"include": ["src/**/*"]` で、**どちらもテストを型検査していない**
（`apps/timer-web` だけが `test/**/*` を含む）。したがって「必須引数にすれば typecheck が落とす」は
**本番の呼び出し 4 箇所には効くが、テストの呼び出しには効かない**。

**観測できる振る舞いは変わらない。** 有効な `now` に対しては `index` が `[0, len-1]` に収まるので
`candidates[index]` は必ず定義済みであり、`??` の右辺は今日も死んでいる。消しても有効入力での結果は同一である。
渡し忘れた場合だけ `entry.problem` が `TypeError` を投げ、**テストが大声で赤くなる**。

なお **この枝は「変更前と同じお題を返す」役目を元から果たしていない。**
`FALLBACK_PROBLEMS` が空だったとすると右辺 `FALLBACK_PROBLEMS[0]` 自身も `undefined` を返す（実測済み）。

**根本原因（timer-core・timer-sync のテストが型検査の射程外）は本 PR では直さない。**
`rootDir: ./src` を外す構成変更に加え、E3 と無関係な既存の型エラーが **10 件 / 5 ファイル**出る
（2026-08-18 に `tsc --noEmit` で実測）。独立した Issue として起票する。

### D2: timer-sync は `Clock` ポートを経由する

`this.clock = deps.clock;` をコンストラクタへ足し、3 箇所へ `this.clock.now()` を渡す。
これにより `ProblemDelegatorDeps.clock` が初めて実際に使われる。

### D3: timer-web は `no-ai.ts` の中で `Date.now()` を直接呼ぶ

`apps/timer-web/src/ai/provider.ts` は自身の docstring で `ProblemProvider` を「ポート」と呼んでおり、
`NoAiProvider` はその**アダプタ**である。憲法 原則 VI がいう「副作用を置く境界」がまさにここなので、
アダプタ内で `Date.now()` を呼ぶのは規範に反しない。`App.tsx` は無変更。

timer-web は既に `App.tsx:214` `:226`、`sync/client.ts:62` `:146` `:159`、`ui/use-now-tick.ts` で
`Date.now()` を素で呼んでおり、既存の作りとも一貫する。

**代償**: `NoAiProvider` は決定論的にテストできない。D9 で明示する。

### D4: 機械検査を `scripts/audit-domain-side-effects.mjs` として新設し、`scripts/lib/scan-targets.mjs` に乗せる

名前は `audit-domain-purity.mjs` にしない。この検査は純粋性を見ておらず、**禁止語彙が字面として現れないこと**
しか見ないので、名乗りを実態に合わせる。

**走査対象の作りは自作しない。** `e905b38` 時点で共有モジュール `scripts/lib/scan-targets.mjs` を
import しているのは `scripts/*.mjs` の **9 本**である（本体 7 本＋自己テスト 2 本。
`git grep -l 'lib/scan-targets.mjs' e905b38 -- 'scripts/*.mjs'` で実測）。
**この 9 本は下の D7 でいう「`audit-*.mjs` の実体は 4 本」とは母数が違う** —
こちらは `scripts/` 直下の `.mjs` 全体（`check-links.mjs` `list-scan-targets.mjs`
`mutation-check.mjs` や `.test.mjs` を含む）を母数にしており、`audit-*.mjs` の本体 4 本は
その部分集合で、4 本とも共有モジュールを使っている。
そのうちパッケージ単位で走る 2 本（`audit-structure.mjs` / `audit-log-hygiene.mjs`）は
`listWorkspacePackages` ＋ `diffTargets` の全単射照合という同じ形をしている。本検査もパッケージ単位なので
その形に揃える。

- **走査対象は宣言する**（ADR-0014 決定 1 の MUST）。
  `DOMAIN_PACKAGES = ["packages/poker-core", "packages/timer-core"]` を宣言し、
  **残るすべての workspace パッケージを理由つき `EXCLUDED_PACKAGES` に書く**（決定 2 の MUST）。
- **実体の権威は `listWorkspacePackages(REPO_ROOT)`**（= `pnpm -r list --depth -1 --json`）。
  `fs.readdirSync("packages/")` も「名前が `-core` で終わるものを拾う」導出も**使わない**
  （ADR-0014 決定 3 の MUST NOT。pnpm の解決規則の自作再実装にあたる）。
  サフィックス導出は `packages/timer-domain` のような名前のコアを黙って取りこぼすが、
  全単射照合はパッケージが増えた時点で赤くなり、書いた人に判断を強制する。
- 宣言と実体のずれは `diffTargets` / `hasTargetDrift` / `formatTargetDiff` で見る。
- 導出した `src/` の実在は `findMissingPaths` で確認する（#158 が塞いだ経路⑪の残余）。
- **0 件ガードは `hasZeroScanTargets`、内訳の 0 件は `findEmptyScanDimensions`**（決定 8 の MUST）。
  **件数の下限は直書きしない。書いてよいのは「非空」の判定のみ**（決定 8 の MUST NOT）。
- **走査量を常に出力する**（決定 6 の MUST）。
  `[audit-domain-side-effects] 走査対象: N パッケージ / M ファイル`。
- **走査量の算出と実走査を同じ述語 1 本から導出する**（決定 9 の MUST）。
  数えるときと読むときで条件を書き分けない。書き分けると「N 件走査した」と出しながら
  実走査が 0 件になる状態が作れる（#135 で実際に起きた）。
- **判定は純粋関数 1 つ** `findForbiddenCalls(text, path)` に切り出し、単体テストを持たせる
  （`audit-assembly-wiring.mjs` / `audit-domain-error-shape.mjs` と同じ作り）。
  行を `includes` で見るだけで、状態を持たない。

### D5: 禁止語彙は 6 つとし、ADR-0016 へ追記する

```js
const FORBIDDEN = [
  "Date.now(",
  "Math.random(",
  "new Date(",
  "performance.now(",
  "crypto.",
  "process.env",
];
```

ADR-0016 決定 2 項目 4 が名指ししているのは `Date.now()` と `Math.random()` の 2 つだけである。
2 語のままにすると `new Date().getTime()` や `crypto.randomUUID()` が検査をすり抜ける
——**対策が自分の塞ぐ欠陥と同じ欠陥を持つ**形になる。

そこで `docs/adr/0016` へ追記し、「項目 4 の趣旨は『ドメインが環境から直接値を読まない』ことであり、
検査はこの 6 語を見る」と明記して**規範と検査の射程を一致させる**。
検査だけを黙って広げると、規範が命じていない禁止を検査が課すことになる。

`packages/*-core/src` は 6 語すべてについて現在 0 件なので、語彙を広げても即日緑である。

**`new Date(` は引数ありでも赤にする。** 引数の有無で分けると字句解析が要る。過剰検出側へ倒す。

### D6: コメント行も読む

`audit-domain-error-shape.mjs` が確立した向きに揃える。

> これは「**無いこと**」を求める検査なので、読み飛ばすと緑に倒れる。

Issue #166 のコメントは「コメント行を除外するか、`import`/呼び出しの形で判定してください」と勧めているが、
**この設計はそれを採らない**。理由は 2 つある。

1. コメント除外の指示は `packages/rate-limit/src/token-bucket.ts` のコメント 3 行が誤爆したことに由来するが、
   **同じコメントが射程を `packages/*-core/src` へ絞ったことで、その誤爆源は既に射程外**である。
2. コメントを剥がすには手書きの字句解析が要る。文字列リテラル中の `//`、正規表現リテラル、
   入れ子のブロックコメントで穴が出る。**「無いこと」を見る検査では、穴はそのまま見逃し（緑）になる。**
   手書きの字句解析が続けて検出漏れを作った先例がある。

**代償**: core の docstring に `Date.now()` と書けなくなる（「現在時刻」「実時刻」と書く）。

**訂正（実装中に反証）**: ここには当初「現在 core にそのような記述は 0 件なので、今日の書き換えは
発生しない」と書いていたが、**書き換えは実際に発生した。** 0 件でなかった原因は既存コードではなく、
**同じ計画の Task 2 が自分で持ち込んだ 1 行**である——`pickFallback` の新しい docstring が
`docs/timer/adr/0002` を逐語引用し、その引用の中に禁止語彙の字面が入っていた。
引用側を言い換えて解消した（規範の側は弱めていない）。
**「今は 0 件」は「今日 0 件のままである」を意味しない。** 同じ PR が対象を増やす。

### D7: `scan-target-wiring.test.mjs` へ導出ガードを 1 本足す

現在このファイルは検査スクリプトごとに `describe` を**手書きで列挙**している。実行して数えると
**6 ブロック / 5 スクリプト**である（`audit-structure.mjs` が 0 件ガードと実在確認で 2 ブロックを持ち、
1 つは `audit-*` ではない `check-links.mjs` を見ている）。
このうち `audit-*.mjs` の実体は **4 本**で、本 PR が 5 本目になる。次に検査を足す人は黙って登録を漏らせる。

列挙された `describe` はそのまま残し（個別の壊し方を書いているため）、別に導出ガードを 1 本足す。

**一覧の権威は `fs.readdirSync` ではなく `git ls-files` に置く。**
`readdirSync` は未追跡ファイルを拾うため、ローカルと CI で見えるものが食い違う
（ADR-0014 決定 5）。共有モジュールの `listTrackedFiles` を使う。

**`scripts/list-scan-targets.mjs` の `KINDS` には足さない。** 同モジュールの除外は
`rel.startsWith(prefix)` の**前方一致**しか持たず、後方一致（`.test.mjs`）を表現できない。
`git ls-files 'scripts/audit-*.mjs'` は自己テストを含む **8 件**に一致することを実測した
（本体 4 ＋ `.test.mjs` 4）。除外の仕組みを共有モジュールへ足すのは本 PR の射程外なので、
このテストの中で後方一致を落とす。

```js
// scripts/scan-target-wiring.test.mjs
// `git ls-files 'scripts/audit-*.mjs'` は自己テストも拾う（実測 8 件）。
// selectTargets の除外は前方一致しか持たないため、ここで後方一致を落とす。
const AUDITS = listTrackedFiles(REPO_ROOT, ["scripts/audit-*.mjs"])
  .map((rel) => path.basename(rel))
  .filter((name) => !name.endsWith(".test.mjs"));

assert.ok(AUDITS.length > 0, "audit-*.mjs が 0 件（テストが空振りしている）");

for (const name of AUDITS) {
  test(`${name} は走査対象を名乗る`, () => {
    assert.match(runScriptCopy(name, (s) => s).stdout, /走査対象: /);
  });
}
```

`runScriptCopy` は複製を `scripts/` 直下へ `.wiring-<pid>-<n>-<名前>` として置くが、
接頭辞が `.wiring-` なので `git ls-files` の追跡下にも `audit-*` の一致にも入らない。
複製が自分自身を走査対象として拾う経路は無い。

**下限は「非空」だけにする。** 当初 `>= 5` を置く案だったが、これは **ADR-0014 決定 8 の
MUST NOT に違反する**（「件数の下限を直書きしない。書いてよい下限は非空（1 件以上）の判定のみ」）。
固定値は本数が変わるたびに腐り、**この検査が守ろうとしている「列挙は腐る」性質を検査自身が持ち込む**。

既存 4 本すべてが「走査対象:」行を出すことは 2026-08-18 に実行して確認した
（`audit-structure` / `audit-log-hygiene` / `audit-assembly-wiring` / `audit-domain-error-shape`）。

## 触れる外部配線

| # | 場所 | 内容 |
|---|---|---|
| 1 | `.github/workflows/ci.yml` | `quality` ジョブ、`audit-domain-error-shape` の次に 1 ステップ |
| 2 | `AGENTS.md` の検査一覧 | 1 行 |
| 3 | `docs/guides/development.md` の一覧と説明節 | 1 行＋1 節 |
| 4 | `docs/adr/0016` | 決定 2 項目 4 の割り当て先と禁止語彙 6 つ（D5） |
| 5 | `scripts/scan-target-wiring.test.mjs` | 導出ガード（D7） |
`scripts/lib/scan-targets.mjs` と `scripts/list-scan-targets.mjs` は**どちらも変更しない**。
既存の輸出（`listWorkspacePackages` / `diffTargets` / `hasTargetDrift` / `findMissingPaths` /
`hasZeroScanTargets` / `findEmptyScanDimensions` / `formatTargetDiff` / `listTrackedFiles`）を
そのまま使う。

`scripts/audit-domain-side-effects.test.mjs` は登録不要である。CI は
`node scripts/list-scan-targets.mjs script-tests` で `scripts/**/*.test.mjs` を**導出**しているため、
置けば自動で走る。

`docs/timer/adr/0002` は**追記不要**。「時刻は引数 `now` として注入し、`Date.now()` をドメイン内で呼ばない」と
既に書いてあり、実装が追いついただけで決定は変わらない。

## 振る舞い不変をどう示すか

### D8: ゴールデン値を変更**前**に採取する

変更前の `e905b38` で、代表的な `(language, difficulty, now)` の組に対して**実際に選ばれるお題の title**を
採取し、固定値表としてテストへ埋める。

**採取の手段は `vi.useFakeTimers()` ＋ `vi.setSystemTime(now)`。** 変更前の `pickFallback` は
内部で `Date.now()` を呼ぶので、システム時刻を固定して**実際に関数を走らせて**結果を記録する。
これは計算ではなく測定なので、実装の写経にならない。2026-08-18 に実行して機能することを確認済み
（`FALLBACK_PROBLEMS` は **33 件**。`TypeScript`/`easy` の `now = 0` は `FizzBuzz`、
未知言語 `easy` の `now = 0,1,2` は `FizzBuzz` / `回文チェッカー` / `ローマ数字変換`）。

**テスト内で `Math.abs(now) % candidates.length` を再計算しない。** それは実装の写経であり、
配線が消えても緑になる。`audit-log-hygiene` のテストが検査と同じ判定を再実装していたために、
配線が消えても緑だった事例（#158）と同型の罠である。採取した実測値だけを置く。

### D9: 追加するテスト

**`packages/timer-core/test/problem.test.ts`**

- 同じ `now` を 2 回渡せば同じお題を返す（安定性）
- 未知言語を渡して全件縮退させ、`now = 0 … FALLBACK_PROBLEMS.length - 1` で**候補が一巡する**。
  これが「第 3 引数が実際に index を決めている」ことの証拠であり、恒真化を止める唯一の砦である
- 負の `now` でも範囲内に落ちる（`Math.abs` の既存挙動の記録）
- D8 のゴールデン値表と一致する
- 既存 4 呼び出しは第 3 引数を足すだけ。主張は変えない

**`apps/timer-sync/test/problem-delegation.test.ts`（および `.ai.test.ts`）**

偽 clock を固定値にして、確定するお題がその値に対応するお題であることを **3 経路それぞれ**で見る。

| 経路 | 箇所 |
|---|---|
| `problemMode === "fallback"` で即確定 | `:115` |
| `validateProblem` 失敗で定型へ縮退 | `:234` |
| 候補を使い切って定型で確定 | `:279` |

要件は「`this.clock` を消したら赤くなること」である。

**`scripts/audit-domain-side-effects.test.mjs`**

- `findForbiddenCalls` の単体: 6 語それぞれを検出する / 行番号が正しい /
  **コメント行も検出する**（D6 が仕様であることをテストで固定する）
- 走査対象の導出が実在確認を通る / 0 件で赤くなる

### D10: 破壊検証の順序

対照実行を先に行う。**壊さずに緑になることを見ていない破壊検証は、何も証明しない**
（変異検査がテストを 1 件も走らせずに全件「検出」していた事例がある）。

1. 対照実行: 何も壊さずに緑を確認する
2. 壊す
3. **壊れたことを `grep -c` で確認する**（`sed` が空振りしたまま「赤にならない」と誤読しない）
4. 赤を確認する
5. 戻す

| 壊すもの | 期待 |
|---|---|
| `problem.ts` へ `Date.now()` を戻す | `audit-domain-side-effects` が赤 |
| 6 語それぞれを core のコメントへ 1 行書く | 6 回とも赤 |
| 走査対象の導出を空にする | 0 件ガードが赤 |
| `pickFallback` が第 3 引数を無視する | D9 の一巡テストが赤 |
| `this.clock.now()` を定数へ差し替える | D9 の 3 経路が赤 |
| `audit-*.mjs` の 1 本から「走査対象:」行を消す | D7 の導出ガードが赤 |
| テストの呼び出し 1 箇所から第 3 引数を消す | `TypeError` で赤（D1b が効いている証拠） |
| 宣言 `DOMAIN_PACKAGES` から 1 つ消す | 全単射照合が赤（ADR-0014 決定 1） |
| 宣言に実在しないパッケージを足す | 全単射照合が赤（同上） |

`node scripts/mutation-check.mjs` も流す。ただし **E1 で判明した「`scripts/` を変異対象にできない」制約
（`detectRunner()` が `<pkg>/package.json` を要求する）は本 PR でも残る**。検査スクリプト自身は
上表の手動変異で代替し、PR にそう明記する。

## 何を見ていないか

**この検査は「足りる」とは言わない。**

- **計算プロパティ・別名束縛はすり抜ける。** `globalThis["Date"].now()`、
  `const D = Date; D.now()`、`const { now } = Date; now()` はいずれも禁止語彙の字面を持たない。
- **`packages/*-core/src` の外は一切見ない。** `apps/` と `packages/rate-limit`・`packages/ui`・
  `packages/protocol` は対象外である。`rate-limit` はドメインではなく node 専用の共有ユーティリティで、
  `docs/guides/architecture.md` の層対応表でも独立した行に置かれている。
- **`test/` は見ない。** ドメインのテストが `Date.now()` を使うのは禁じられていない。
- **`apps/timer-web/src/ai/no-ai.ts` は決定論的なテストを持たない。** D3 で `Date.now()` の直呼びを
  境界と決めた以上、選ばれるお題をテストで固定できない。ここを守るのは**型だけ**である
  （第 3 引数が必須なので、渡さなければ `typecheck` が落ちる）。
- **EARS 要件 2（候補 0 件のフォールバック）は到達不能であるうえ、記述している状況では満たしようがない。**
  `candidates` は言語フィルタ → 全件縮退の順に落ちるので、`FALLBACK_PROBLEMS` が非空である限り
  `candidates.length === 0` にならない。したがって `entry = candidates[index] ?? FALLBACK_PROBLEMS[0]!` の
  `??` の右辺は死んでいる。
  **さらに、仮に `FALLBACK_PROBLEMS` が空だったとすると、`??` の右辺 `FALLBACK_PROBLEMS[0]` 自身も
  `undefined` を返す**（`[][NaN] ?? [][0]` が `undefined` になることを 2026-08-18 に実測）。
  要件 2 が言う「変更前と同じフォールバックお題を返す」は、その状況では変更前も返せていない。
  **要件 2 は実装ではなく Issue のコメントで訂正する。**

## 作業手順

**検査は「コードを直したあと」に置く。** 先に置いて赤を見る順は「検査が働く証拠」として
魅力的に見えるが、**赤いコミットを履歴に残して bisect を濁す**。#165 では
`audit-log-hygiene` を赤にしたまま 5 コミットが通過し、実際に濁った。
検査が働く証拠は、履歴を汚さない破壊検証（D10）で取る。

1. ゴールデン値を `e905b38` で採取する（D8）
2. `pickFallback` のシグネチャを変え、`??` を消し、timer-core のテストを通す（D1・D1b・D9）
3. `problem-delegation.ts` を配線し、配線テストを足す（D2・D9）
4. `no-ai.ts` を配線する（D3）
5. `scripts/audit-domain-side-effects.mjs` とその自己テストを置く。**この時点で緑になる**
6. `scan-target-wiring.test.mjs` へ導出ガードを足す（D7）
8. 外部配線 5 箇所を更新する（`ci.yml` / `AGENTS.md` / `development.md` / `docs/adr/0016` / 済）
9. 破壊検証を D10 の順序で全項目実施する
10. `pnpm test` / `pnpm e2e` / `node scripts/mutation-check.mjs` / `node scripts/check-links.mjs`
11. 実経路確認（DoD 5）: `pnpm dev` を上げ、timer の共有ルームで定型お題が実プロトコル越しに出ることを目視。
    **確認後にポートを解放する**

## 完了条件

- [ ] `packages/timer-core/src/problem.ts` が `Date.now()` を呼ばず、`now: number` を必須引数で受け取る
- [ ] 呼び出し 4 箇所すべて（timer-sync 3・timer-web 1）が配線されている
- [ ] `scripts/audit-domain-side-effects.mjs` が緑で、CI の `quality` ジョブで走る
- [ ] 同検査が ADR-0014 の決定 1・2・3・6・8・9 を満たす
      （宣言＋全単射／理由つき除外／`listWorkspacePackages` の権威／走査量の出力／
      非空のみの下限／述語 1 本）
- [ ] D10 の全項目で壊し、すべて赤になることを確認した
- [ ] `?? FALLBACK_PROBLEMS[0]!` を消し、第 3 引数を落とすと `TypeError` で赤になることを確認した（D1b）
- [ ] timer-core / timer-sync のテストが型検査の射程外である件を Issue として起票した
- [ ] `docs/adr/0016` へ禁止語彙 6 つを追記し、規範と検査の射程が一致している
- [ ] `pnpm test` 全緑・`pnpm e2e` 全緑
- [ ] 選ばれるお題が変更前と一致することを、D8 のゴールデン値で示した
- [ ] `mutation-check.mjs` が `scripts/` を見られない制約を Issue として起票した
- [ ] DoD 8 項目

## スコープ外

- **`no-ai.ts` の位置と `ProblemProvider` の再編** — web 層の再編は E4（#167）が担う
- **`scripts/mutation-check.mjs` が `scripts/` を変異対象にできない制約の解消** — E1 からの繰り越しで、
  本 PR でも手動変異で代替する。**E1・E3 と 2 度繰り越したので、本 PR で独立した Issue として起票し、
  宛先を持たせる**（宛先の無い宿題を作らない。#69 → #113 → #126 で 2 度宛先を失った先例がある）
- **到達不能な `??` の枝の削除** — 振る舞い不変の約束に反する
- **`packages/rate-limit` のコメント 3 行** — 射程外（`packages/*-core/src` に限る）
- **公開面（`index.ts` の明示列挙）の整理** — E6（#168）が担う
- **timer-core / timer-sync のテストを型検査の射程へ入れること** — `rootDir: ./src` を外す構成変更に加え、
  E3 と無関係な既存の型エラーが 10 件 / 5 ファイル出る（`aggregate` `decide-v3` `decide` `records` `shuffle`
  の各テスト。2026-08-18 実測）。**本 PR で独立した Issue として起票する。** D1b はこの根本原因を
  直すのではなく、症状（黙って飲み込むこと）だけを塞ぐ
- **EARS 要件 2 の文言の訂正** — 実装ではなく Issue #166 のコメントで訂正する

## 関連

- 憲法 原則 VI（副作用は境界へ）・原則 VII（検査は壊して確かめる）
- [`docs/timer/adr/0002`](../../timer/adr/0002-decider-pure-domain.md) — 時刻は `now` で注入する
- [`docs/adr/0016`](../../adr/0016-core-domain-representation.md) — 決定 2 項目 4
- [`docs/adr/0014`](../../adr/0014-scan-target-integrity.md) — 走査対象の健全性
- [`2026-08-17-adr-alignment-e1-design.md`](2026-08-17-adr-alignment-e1-design.md) — #72 の分解
- [`2026-08-17-poker-sync-ports-and-adapters-design.md`](2026-08-17-poker-sync-ports-and-adapters-design.md) — E2
