# poker-sync のテストを bun test へ移行する（#165 PR-1）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/poker-sync` のテストランナーを `vitest` から `bun test` へ移す。**`src/` は 1 行も変えない。**

**Architecture:** テストの import を `vitest` から `bun:test` へ置換し、`package.json` の `test` スクリプトを `bun test --timeout 15000` にする。`vitest.config.ts` と devDependency の `vitest` を撤去する。移行の正しさは、**移行前後の JUnit XML から（ファイル名, 葉のテスト名）の多重集合を取り出して突き合わせる**ことで示す。

**Tech Stack:** Bun 1.3.14（`bun:test`）/ vitest 4.1.10（移行元）/ pnpm 11.5.0 / turbo

**Spec:** [`docs/superpowers/specs/2026-08-17-poker-sync-ports-and-adapters-design.md`](../specs/2026-08-17-poker-sync-ports-and-adapters-design.md)

**Branch:** `refactor/165-poker-sync-bun-test`（作成済み。設計文書の 3 コミットが載っている）

## Global Constraints

- **`apps/poker-sync/src` を 1 行も変更しない。** これが PR-1 の定義であり、完了条件でもある
- **利用者から見える振る舞いを変えない**（epic #67 の制約）
- **移行前後でテストの本数と名前が変わらない。** 現状は **134 件 / 14 ファイル**（`vitest run` で実測）
- 文書は日本語。コミットは Conventional Commits の type 接頭辞 ＋ 日本語タイトル ＋ 末尾に `（#165）`
- **作業ディレクトリは `/home/vscode/tasuki-work`**（overlay）。`/workspaces/claym/local/Tasuki` では作業しない
- 検査コマンドの前に `export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH` を通す
- **`git checkout -- .` のようなワークツリー全体を戻す操作は禁止。** 戻すときは必ずファイルを名指しする
- スクラッチ用のファイルは
  `/tmp/claude-1000/-workspaces-claym-local-Tasuki/f49088eb-a1cf-410b-a518-3295b130503d/scratchpad/` に置く

## 実測で確定している事実（推測を混ぜないこと）

すべて 2026-08-17 に実測済み。**計画の各手順はこれに依拠している。**

| 事実 | 実測結果 |
|---|---|
| 現在のテスト件数 | **134 件 / 14 ファイル**（`vitest run`） |
| `vitest` から import している名前 | **6 種類だけ** — `it` `expect` `describe` `beforeAll` `afterAll` `afterEach` |
| `vi.*` の使用 | **0 件** |
| `expect.extend` / スナップショット | **0 件** |
| `it.each` / `describe.each` | `bun:test` で動く（単一引数・タプルとも実測） |
| `beforeAll` / `afterAll` / `afterEach` | `bun:test` で動く（実測） |
| `bun:test` の型解決 | **設定変更不要。** `apps/poker-sync` は既に `@types/bun` を devDeps に持ち、`tsconfig.json` に `"types": ["bun"]` がある。probe ファイルで `tsc --noEmit` と `eslint` が通ることを確認済み |
| timeout | **`bun test --timeout 15000`。** 既定 5 秒では 6.5 秒の `beforeAll` が落ち、`--timeout` は**フックにも効く**（`testTimeout` と `hookTimeout` を 1 つで置き換えられる） |
| CI の変更 | **不要。** `ci` ジョブに `setup-bun` が既にある |
| turbo | `test` タスクは `outputs: []` でランナー非依存 |

## テスト名の突き合わせ方（重要・罠あり）

**`bun test` はパイプ経由（非 TTY）だと個々のテスト名を出さない。** 素朴に
`bun test | grep '^(pass)'` と書くと **0 件を返し、検査が何も見ないまま緑になる**（実測で踏んだ）。

**両者とも JUnit XML を出して比較する。**

- vitest: `vitest run --reporter=junit --outputFile=<path>`
- bun: `bun test --reporter=junit --reporter-outfile=<path>`

ただし **XML の形が違う。**

| | `name` 属性 | 場所を示す属性 |
|---|---|---|
| vitest | `describe &gt; it` の**フルパス** | `classname`（ファイル名） |
| bun | **`it` の葉の名前だけ** | `file`（ファイル名）。`classname` は describe の連結だが**内側から外側への逆順**で、しかも `&amp;gt;` と**二重エスケープ**されている |

そのため **（ファイル名の basename, 葉のテスト名）の多重集合**で比較する。

**この比較の弱点を明記する: `describe` の名前だけが変わった場合は検出できない。**
検出できるのは、テストの消失・葉の名前の変更・ファイル間の移動である。本移行は import 文と
スクリプトしか触らないため、この範囲で十分と判断する。

---

### Task 1: 移行前の基準を採り、`bun:test` へ移行して突き合わせる

**Files:**
- Create: `<scratchpad>/junit-names.py`（比較用スクリプト。リポジトリには入れない）
- Modify: `apps/poker-sync/tests/*.test.ts`（14 ファイル）と `apps/poker-sync/tests/helpers.ts` 等のうち `from 'vitest'` を含むもの
- Modify: `apps/poker-sync/package.json`（`test` スクリプト）

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: `bun test --timeout 15000` で 134 件が通る状態。Task 2 が `vitest` の撤去を行う

- [ ] **Step 1: 比較用スクリプトを作る**

`<scratchpad>` は
`/tmp/claude-1000/-workspaces-claym-local-Tasuki/f49088eb-a1cf-410b-a518-3295b130503d/scratchpad`
とする。

```python
# <scratchpad>/junit-names.py
# JUnit XML から (ファイル名の basename, 葉のテスト名) を取り出して 1 行ずつ出す。
# vitest と bun で XML の形が違うため、両方に対応する。
import html
import os
import re
import sys

src = open(sys.argv[1], encoding="utf-8").read()
rows = []
for m in re.finditer(r"<testcase\b([^>]*?)/?>", src):
    attrs = m.group(1)
    name_m = re.search(r'\sname="([^"]*)"', attrs)
    if not name_m:
        continue
    name = html.unescape(name_m.group(1))
    # vitest は name がフルパス（"describe > it"）。bun は葉だけ。
    leaf = name.split(">")[-1].strip()
    # 場所: vitest は classname、bun は file
    file_m = re.search(r'\sfile="([^"]*)"', attrs) or re.search(r'\sclassname="([^"]*)"', attrs)
    where = os.path.basename(html.unescape(file_m.group(1))) if file_m else "?"
    rows.append(f"{where}\t{leaf}")
print("\n".join(sorted(rows)))
```

- [ ] **Step 2: 移行前の基準を採る（対照実行）**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
SP=/tmp/claude-1000/-workspaces-claym-local-Tasuki/f49088eb-a1cf-410b-a518-3295b130503d/scratchpad

corepack pnpm --filter @tasuki/poker-sync exec vitest run \
  --reporter=junit --outputFile=$SP/before.xml
grep -c '<testcase' $SP/before.xml
python3 $SP/junit-names.py $SP/before.xml > $SP/before.txt
wc -l < $SP/before.txt
```

期待: `grep -c` と `wc -l` がどちらも **134**。

**どちらかが 134 でなければ先へ進まない。** 基準が取れていない状態で移行すると、
突き合わせが空振りする（検査には対照実行が要る。#136 で「テストを 1 件も走らせず全件検出」を踏んだのと同じ型）。

- [ ] **Step 3: import を `bun:test` へ置換する**

```bash
cd /home/vscode/tasuki-work
grep -rl "from 'vitest'" apps/poker-sync/tests/
```

期待: 14 ファイルが並ぶ。次に置換する。

```bash
cd /home/vscode/tasuki-work
grep -rl "from 'vitest'" apps/poker-sync/tests/ | xargs sed -i "s/from 'vitest'/from 'bun:test'/"
grep -rn "from 'vitest'" apps/poker-sync/tests/ ; echo "残存: $? （1 なら 0 件）"
grep -rc "from 'bun:test'" apps/poker-sync/tests/*.ts | grep -v ':0' | wc -l
```

期待: `from 'vitest'` の残存が 0 件、`from 'bun:test'` を含むファイルが 14。

- [ ] **Step 4: `package.json` の `test` スクリプトを差し替える**

`apps/poker-sync/package.json` の

```json
"test": "vitest run",
```

を次に変える。

```json
"test": "bun test --timeout 15000",
```

**`--timeout 15000` を省かないこと。** 既定は 5 秒で、`tests/helpers.ts` の `startServer` は
サーバー起動を最大 10 秒待つ。省くと `beforeAll` がタイムアウトする（実測）。

- [ ] **Step 5: `bun test` が通ることを確認する**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/poker-sync test 2>&1 | tail -8
```

期待: `134 pass` / `0 fail`。

**落ちた場合は取り繕わずに報告すること。** 特に heartbeat 系が落ちたときは
既知のフレーキー（#139。PR #138 と PR #169 で実発生）の可能性があるので、
**もう一度だけ実行して切り分ける**（2 回とも落ちるなら移行由来）。

- [ ] **Step 6: 移行後の名前を採り、基準と突き合わせる**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
SP=/tmp/claude-1000/-workspaces-claym-local-Tasuki/f49088eb-a1cf-410b-a518-3295b130503d/scratchpad

corepack pnpm --filter @tasuki/poker-sync exec bun test \
  --timeout 15000 --reporter=junit --reporter-outfile=$SP/after.xml
grep -c '<testcase' $SP/after.xml
python3 $SP/junit-names.py $SP/after.xml > $SP/after.txt
wc -l < $SP/after.txt

diff $SP/before.txt $SP/after.txt && echo "★ テスト名の集合が一致"
```

期待: `grep -c` と `wc -l` がどちらも **134**、`diff` が差分なしで
`★ テスト名の集合が一致` が出る。

- [ ] **Step 7: 突き合わせが空振りしていないことを確かめる（破壊検証）**

**`diff` が差分なしで通ることと、`diff` が差分を検出できることは別である。** 確かめる。

```bash
cd /home/vscode/tasuki-work
SP=/tmp/claude-1000/-workspaces-claym-local-Tasuki/f49088eb-a1cf-410b-a518-3295b130503d/scratchpad

# after.txt から 1 行だけ落として、diff が気づくか見る
head -n -1 $SP/after.txt > $SP/after-broken.txt
wc -l < $SP/after-broken.txt
diff $SP/before.txt $SP/after-broken.txt > /dev/null; echo "差分検出の終了コード: $?（1 なら検出できている）"
rm -f $SP/after-broken.txt
```

期待: 行数が **133**、終了コードが **1**。

- [ ] **Step 8: `src/` が無変更であることを示してコミット**

```bash
cd /home/vscode/tasuki-work
git diff --stat -- apps/poker-sync/src
echo "src の差分: 上が空なら 0 行"
git status --short
```

期待: `apps/poker-sync/src` の差分が**空**。変更されているのは `tests/` と `package.json` のみ。

```bash
git add apps/poker-sync/tests apps/poker-sync/package.json
git commit -m "test: poker-sync のテストを bun test へ移行する（#165）

- from 'vitest' を from 'bun:test' へ置換（14 ファイル）
- test スクリプトを bun test --timeout 15000 へ
  既定 5 秒では helpers.ts の startServer を待つ beforeAll が落ちる（実測）
- 移行前後の JUnit XML から（ファイル名, 葉のテスト名）の多重集合を突き合わせ、
  134 件が一致することを確認した
- src は 1 行も変更していない"
```

---

### Task 2: `vitest` の設定と依存を撤去する

**Files:**
- Delete: `apps/poker-sync/vitest.config.ts`
- Modify: `apps/poker-sync/package.json`（devDependencies から `vitest` を外す）
- Modify: `pnpm-lock.yaml`（`pnpm remove` が更新する）

**Interfaces:**
- Consumes: Task 1 の `bun test --timeout 15000` で通る状態
- Produces: `vitest` への参照が `apps/poker-sync` から消えた状態

- [ ] **Step 1: `vitest` への参照が他に無いことを確かめる**

```bash
cd /home/vscode/tasuki-work
grep -rn "vitest" apps/poker-sync --include='*.ts' --include='*.json' --include='*.mjs' | grep -v node_modules
```

期待: `apps/poker-sync/vitest.config.ts` と `apps/poker-sync/package.json` の devDependencies だけ。
**それ以外が出たら止めて報告すること。**

- [ ] **Step 2: 設定ファイルを削除する**

```bash
cd /home/vscode/tasuki-work
git rm apps/poker-sync/vitest.config.ts
```

`vitest.config.ts` が持っていた `testTimeout: 15_000` と `hookTimeout: 15_000` は、
Task 1 の `--timeout 15000` が両方を置き換えている（`--timeout` はフックにも効く。実測）。

- [ ] **Step 3: devDependency を外す**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/poker-sync remove vitest
```

- [ ] **Step 4: 依存の整合とテストを確認する**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
node -e "const j=require('./apps/poker-sync/package.json');console.log('devDeps:',JSON.stringify(j.devDependencies))"
corepack pnpm install --frozen-lockfile 2>&1 | tail -3
corepack pnpm --filter @tasuki/poker-sync test 2>&1 | tail -6
```

期待: devDeps に `vitest` が無く、`--frozen-lockfile` が通り、テストが **134 pass**。

**`--frozen-lockfile` が失敗したら、lockfile が更新されていない。** Step 3 をやり直す。

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add -A
git commit -m "chore: poker-sync から vitest の設定と依存を外す（#165）

- vitest.config.ts を削除。timeout は bun test --timeout 15000 が置き換える
- devDependencies から vitest を外し lockfile を更新した
- apps/poker-sync に vitest への参照が残っていないことを grep で確認した"
```

---

### Task 3: リポジトリ全体の検査を通して PR を作る

**Files:**
- 変更なし（検証と PR 作成のみ）

**Interfaces:**
- Consumes: Task 1・Task 2 の成果
- Produces: PR。PR-2（再編）はこのブランチの上に積む

- [ ] **Step 1: パッケージ単位の検査**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/poker-sync typecheck
corepack pnpm --filter @tasuki/poker-sync lint
```

期待: どちらも成功。**`tsconfig.json` は変更していない**（`@types/bun` と `"types": ["bun"]` が
既にあり、`bun:test` の型はそれで解決する。probe ファイルで実測済み）。

- [ ] **Step 2: turbo 経由の全体テスト**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm test 2>&1 | tail -12
```

期待: 全タスク成功。**turbo のキャッシュに注意する** — 「FULL TURBO」で実行されずに緑が出る
ことがある。`Tasks: N successful` の行と、poker-sync が `cache miss` か `cache hit` かを見る。
判断がつかなければ `corepack pnpm test --force` で確かめる。

- [ ] **Step 3: スクリプト検査一式**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
node scripts/check-links.mjs > /dev/null 2>&1; echo "check-links: $?"
node scripts/audit-structure.mjs > /dev/null 2>&1; echo "audit-structure: $?"
node scripts/audit-log-hygiene.mjs > /dev/null 2>&1; echo "audit-log-hygiene: $?"
node --test $(node scripts/list-scan-targets.mjs script-tests) 2>&1 | tail -3
```

期待: 前 3 つが終了コード 0、`node --test` が全緑。

- [ ] **Step 4: `src/` 無変更の最終確認**

```bash
cd /home/vscode/tasuki-work
git diff --stat main...HEAD -- apps/poker-sync/src
echo "★ 上が空なら src は 0 行"
git diff --stat main...HEAD
```

期待: `apps/poker-sync/src` が空。変更は `apps/poker-sync/tests`・`apps/poker-sync/package.json`・
`pnpm-lock.yaml`・`docs/superpowers/` のみ。

- [ ] **Step 5: push して PR を作る**

```bash
cd /home/vscode/tasuki-work
git status --short
git push -u origin refactor/165-poker-sync-bun-test
```

PR 本文を `<scratchpad>/pr1-body.md` へ書き出してから `--body-file` で渡す。

```markdown
## 概要

#165（E2）の PR-1。`apps/poker-sync` のテストランナーを `vitest` から `bun test` へ移す。
**`src/` は 1 行も変えていない。**

再編（PR-2）の前にこれを済ませるのは、`vitest`（Node）では `Bun.serve` を in-process 起動できず、
`docs/adr/0004` が根拠に挙げた「テスト時にアダプタを差し替えられる構成」が成立しないため。
`typeof Bun === 'undefined'` を poker-sync の vitest 上で実測して確認した。

## 変更内容

- `tests/*.ts` の `from 'vitest'` を `from 'bun:test'` へ（14 ファイル）
- `package.json` の `test` を `bun test --timeout 15000` へ
- `vitest.config.ts` を削除し、devDependencies から `vitest` を外した
- E2 の設計正本を追加。あわせて E1 の設計正本のテスト件数の誤りを訂正した

## テスト方法

- [x] 移行前後の JUnit XML から（ファイル名, 葉のテスト名）の多重集合を突き合わせ、
      **134 件が一致**することを確認
- [x] 突き合わせの破壊検証（1 行落とすと `diff` が終了コード 1 を返すこと）
- [x] `pnpm --filter @tasuki/poker-sync test` が 134 pass
- [x] `typecheck` / `lint` が成功（`tsconfig.json` は無変更）
- [x] `check-links` / `audit-structure` / `audit-log-hygiene` が終了コード 0
- [x] `git diff --stat main...HEAD -- apps/poker-sync/src` が空

## DoD

1. ユニットテスト全緑 — ✅ 134 件
2. E2E — 該当なし（利用者の経路は変わらない）
3. 新しい検査を壊して赤くなる確認 — ✅ 突き合わせの破壊検証
4. 変異検査 — 該当なし（`src/` を変更していない）
5. 実経路での確認 — 該当なし（画面・プロトコルは不変）
6. Tidy First — 該当なし
7. 文書への影響 — ✅ E2 の設計正本を追加
8. Issue の完了条件 — PR-2 とあわせて #165 を満たす

## 既知の残り

- テスト名の突き合わせは（ファイル名, 葉の名前）の多重集合で行っており、
  **`describe` の名前だけが変わった場合は検出できない**。本 PR は import 文と
  スクリプトしか触らないため、この範囲で十分と判断した
```

```bash
gh pr create --title "test: poker-sync のテストを bun test へ移行する（#165 PR-1）" \
  --body-file <scratchpad>/pr1-body.md
```

**マージはしない。** PR を作るところまで。

---

## Self-Review

**1. Spec coverage:** 設計正本の PR-1 に関する記述を突き合わせた。

| 設計正本の記述 | 実装するタスク |
|---|---|
| `from 'vitest'` → `from 'bun:test'`（14 ファイル） | Task 1 Step 3 |
| `package.json` の `test` を `bun test --timeout 15000` へ | Task 1 Step 4 |
| `vitest.config.ts` を削除 | Task 2 Step 2 |
| 134 件が同じテスト名で通ることを示す | Task 1 Step 2・6・7 |
| `src/` は 0 行 | Task 1 Step 8・Task 3 Step 4 |

**漏れなし。**

**訂正（実行前スキャン・2026-08-17）:** 設計正本と本計画は当初「28 箇所」と書いていたが、
実測は **14 箇所（14 ファイル × 1 import）** である。28 は、最初の grep に
`tests/*.test.ts` と `tests/*.ts` の**両方を渡して同じファイルを 2 回数えた**もの。
両方の文書を訂正した。

**2. Placeholder scan:** 「TBD」「後で」「同様に」「適切に」の類は無い。比較スクリプトは全文を書いた。
PR 本文も全文を書いた。`<scratchpad>` は Global Constraints で実パスを与えている。

**3. Type consistency:** 新しい関数・型は導入していない。`junit-names.py` はリポジトリに入れない
スクラッチであり、Task 1 の中で完結する。

**4. 順序の依存:** Task 1 Step 2（基準の採取）は **`vitest` を外す前**でなければならない。
Task 2 で `pnpm remove vitest` するため、順序を入れ替えると基準が取れない。計画の順序はこれを満たす。
