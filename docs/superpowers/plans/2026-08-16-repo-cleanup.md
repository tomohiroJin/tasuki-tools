# リポジトリ整理・spec-kit 経路の廃止（#71）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 死んでいる spec-kit 経路を廃止し、そこに同居していた憲法の正本を
`docs/constitution.md` へ移して、規範の三層を `docs/` 直下に揃える。

**Architecture:** 削除と移設は 2 コミットに分け、**各コミットで `check-links` と
`list-scan-targets` が緑になる順**に並べる。参照の付け替えは移設と同一コミットで行う
（分けると必ず赤い中間状態ができる）。規範の変更は ADR への追記として記録する。

**Tech Stack:** Node.js 22（`node --test`）／pnpm 11（corepack 経由）／turbo ／
Bash ／GitHub Actions ／`gh` CLI

**Spec:** `docs/superpowers/specs/2026-08-16-repo-cleanup-design.md`

## Global Constraints

- **作業場所は `/home/vscode/tasuki-work`**（overlay）。`/workspaces/claym/local/Tasuki`
  では作業しない（9p マウントでディレクトリ操作が壊れ、約 48 倍遅い）
- **ブランチは `chore/71-retire-spec-kit`**（作成済み。設計文書のコミット `f988cf9` まで済み）
- **各コミットで `node scripts/check-links.mjs` と `node scripts/list-scan-targets.mjs shell`
  が緑**であること
- **憲法の原則 I〜XI は 1 文字も変えない。** 触るのは Governance 節の 1 句のみ
- **記録文書は移動も改名もしない**（`docs/plans/` `docs/superpowers/` `docs/retrospectives/`
  `docs/timer/` `docs/poker/`）
- **破壊検証は定数を書き換えて行う。ファイルの退避・削除では確かめられない**
  （`check-links.mjs` の `exists` は `git ls-files` の索引を見ており、
  退避すると名指しの赤ではなく Node のクラッシュになる。実測済み）
- pnpm は `corepack pnpm` で呼ぶ
- 変異検査は**作業ツリーが clean** でないと実行できない

## ファイル構成

| ファイル | 役割 | 操作 |
|---|---|---|
| `docs/constitution.md` | 憲法の新しい正本 | `.specify/memory/constitution.md` から移動 |
| `scripts/check-links.mjs` | リンク・コードパス検査 | `REPO_TOP_LEVEL` / `LIVE_DOCS` / `DORMANT_DOCS` を更新 |
| `scripts/list-scan-targets.mjs` | CI へ走査対象を渡す | `shell` の除外を空にする |
| `scripts/list-scan-targets.test.mjs` | 上の単体テスト | 題材のパスを差し替える |
| `.github/workflows/ci.yml` | CI 定義 | shellcheck 節のコメントを更新 |
| `AGENTS.md` / `docs/README.md` | 入口 | 憲法の指し先を更新 |
| `docs/adr/0002` | 三層の定義 | パス更新 ＋ 追記節を新設 |
| `docs/adr/0009` | CI の射程 | 追記節を新設 |
| `docs/adr/0004・0005・0006・0007・0011・0012` | 各 ADR | パス表記の更新のみ |
| `docs/guides/architecture.md` / `security.md` | ガイド | パス表記の更新のみ |
| `docs/poker/README.md` ／ `docs/superpowers/` 5 本 | 記録 | 相対リンクの付け替えのみ |
| `docs/retrospectives/2026-08-16-issue-71-cleanup.md` | 振り返り | 新規作成 |
| `.specify/` ／ `.claude/skills/speckit-*` | spec-kit 経路 | 削除（計 28 ファイル） |

---

### Task 1: 憲法を `docs/constitution.md` へ移し、全参照を付け替える

**Files:**
- Move: `.specify/memory/constitution.md` → `docs/constitution.md`
- Modify: `scripts/check-links.mjs:168`（`LIVE_DOCS` のみ。`REPO_TOP_LEVEL` は Task 2 で触る）
- Modify: `AGENTS.md:8,31` / `docs/README.md:9,22` / `docs/adr/0002,0004,0005,0006,0007,0011,0012`
- Modify: `docs/guides/architecture.md` / `docs/guides/security.md`
- Modify: `docs/poker/README.md:12` / `docs/superpowers/plans/` 3 本 / `docs/superpowers/specs/` 2 本
- Modify: `docs/constitution.md`（Sync Impact Report ＋ Governance ＋ Version）

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: `docs/constitution.md` が憲法の正本。`scripts/check-links.mjs` の
  `LIVE_DOCS` に `"docs/constitution.md"` が含まれ、`".specify/memory/"` は含まれない。
  `REPO_TOP_LEVEL` はまだ `\.specify` を含んだまま（Task 2 で外す）

- [ ] **Step 1: 対照実行 — 壊す前に緑であることを見る**

```bash
cd /home/vscode/tasuki-work
git status --short
node scripts/check-links.mjs
node scripts/list-scan-targets.mjs shell | wc -l
```

Expected:
- `git status --short` は空（clean）
- `リンク検査 OK（走査 216 ファイル）`
- `6`

**緑でなければ以降に進まない。** 対照実行が赤いまま作業すると、後の「緑になった」が
何の証拠にもならない。

- [ ] **Step 2: 憲法を移動する**

```bash
git mv .specify/memory/constitution.md docs/constitution.md
test -f docs/constitution.md && echo "移動できた"
```

Expected: `移動できた`

- [ ] **Step 3: `check-links.mjs` の `LIVE_DOCS` を更新する**

**`REPO_TOP_LEVEL` はこのタスクでは触らない。** `\.specify` を外すと、Step 4〜7 で行う
置換の**取りこぼしを検出する網を、置換の前に自分で外す**ことになる。網を残しておけば、
憲法を移した時点で置換漏れのバッククォート表記は「実在しないパスです」で全部落ちる。
`REPO_TOP_LEVEL` の変更は Task 2（`.specify/` を実際に削除するコミット）で行う。

`scripts/check-links.mjs:168` の `LIVE_DOCS` の `".specify/memory/",` を
`"docs/constitution.md",` に置き換える。

変更前:
```js
  "e2e/",
  ".specify/memory/",
];
```
変更後:
```js
  "e2e/",
  "docs/constitution.md",
];
```

- [ ] **Step 4: ADR とガイドのバッククォート表記を置換する**

`| xargs` は使わない（引数の分割で取りこぼす）。ファイルを明示して回す。

```bash
for f in \
  docs/adr/0002-document-system-three-layers.md \
  docs/adr/0004-sync-server-ports-and-adapters.md \
  docs/adr/0005-result-and-boundary-validation.md \
  docs/adr/0006-test-conventions.md \
  docs/adr/0007-abstraction-criteria.md \
  docs/adr/0011-threat-model-and-data-classification.md \
  docs/adr/0012-logging-secrets-and-disclosure.md \
  docs/guides/architecture.md \
  docs/guides/security.md
do
  sed -i 's|`\.specify/memory/constitution\.md`|`docs/constitution.md`|g' "$f"
done
git grep -c 'docs/constitution\.md' -- docs/adr docs/guides
```

Expected: 0002 が 3、0004 が 2、0005 が 3、0006 が 2、0007 が 2、0011 が 1、0012 が 1、
`architecture.md` が 2、`security.md` が 1（合計 17）

- [ ] **Step 5: `AGENTS.md` の 2 箇所を置換する**

```bash
sed -i 's|\[`\.specify/memory/constitution\.md`\](\.specify/memory/constitution\.md)|[`docs/constitution.md`](docs/constitution.md)|g' AGENTS.md
grep -n 'docs/constitution\.md' AGENTS.md
grep -o 'docs/constitution\.md' AGENTS.md | wc -l
```

Expected: 8 行目と 31 行目の 2 行が出て、出現回数は `4`
（1 行にラベルとリンク先の 2 箇所 × 2 行）。**`grep -c` は行数を数えるので `2` になる。**
出現回数を見るなら `grep -o ... | wc -l` を使う。

- [ ] **Step 6: `docs/README.md` の 2 箇所を置換する**

`docs/README.md` はリポジトリ直下ではなく `docs/` 配下なので、**リンク先の `../` が要らなくなる**。

```bash
sed -i \
  -e 's|\[`\.specify/memory/constitution\.md`\](\.\./\.specify/memory/constitution\.md)|[`docs/constitution.md`](./constitution.md)|g' \
  -e 's|\[憲法\](\.\./\.specify/memory/constitution\.md)|[憲法](./constitution.md)|g' \
  docs/README.md
grep -n 'constitution' docs/README.md
```

Expected（2 行）:
```
- **憲法**（[`docs/constitution.md`](./constitution.md)） — 何を守るか
| 守るべき原則 | [憲法](./constitution.md) |
```

- [ ] **Step 7: 休眠文書の相対リンク 6 箇所を置換する**

リンクは休眠文書でも検査されるため、**直さないと落ちる**。階層の深さごとに `../` の数が違う。

```bash
sed -i 's|\[`\.specify/memory/constitution\.md`\](\.\./\.\./\.specify/memory/constitution\.md)|[`docs/constitution.md`](../constitution.md)|g' \
  docs/poker/README.md

for f in \
  docs/superpowers/plans/2026-08-10-dependency-supply-chain-tasks.md \
  docs/superpowers/plans/2026-08-10-dependency-supply-chain.md \
  docs/superpowers/plans/2026-08-11-major-dependency-updates-tasks.md \
  docs/superpowers/specs/2026-08-10-dependency-supply-chain-design.md \
  docs/superpowers/specs/2026-08-14-pr-granularity-design.md
do
  sed -i 's|\[`\.specify/memory/constitution\.md`\](\.\./\.\./\.\./\.specify/memory/constitution\.md)|[`docs/constitution.md`](../../constitution.md)|g' "$f"
done

git grep -n '](.*\.specify/memory/constitution\.md)' || echo "リンクの残りは 0 件"
```

Expected: `リンクの残りは 0 件`

（作業前にこのパターンは 10 件に一致する — `AGENTS.md` 2・`docs/README.md` 2・
`docs/poker/README.md` 1・`docs/superpowers/` 5。実測で確認済み）

- [ ] **Step 8: 憲法 Governance の 1 句を削除する**

`docs/constitution.md` の 299〜301 行付近。**`.specify/templates/` が消えるため宛先を失う
「依存テンプレート（plan/spec/tasks）との整合」だけ**を削る。AGENTS.md 見出し同期の
MUST は残す。

変更前:
```
- **改版手続き**: 改版は ADR を伴う（原則の変更・削除・追加の理由と背景を ADR に
  記録する）。改版時は Sync Impact Report に変更内容を記録した上で、依存テンプレート
  （plan/spec/tasks）との整合、および **AGENTS.md の憲法見出しの同期**を確認する
  （MUST）（`docs/adr/0002` 決定 5）
```
変更後:
```
- **改版手続き**: 改版は ADR を伴う（原則の変更・削除・追加の理由と背景を ADR に
  記録する）。改版時は Sync Impact Report に変更内容を記録した上で、
  **AGENTS.md の憲法見出しの同期**を確認する（MUST）（`docs/adr/0002` 決定 5）
```

**「すべての plan は Constitution Check ゲートを通過しなければならない」の行は変更しない。**
テンプレートを名指ししておらず、`docs/superpowers/plans/` の 4 本が
`## Constitution Check` 節として体現しているため。

- [ ] **Step 9: Version を上げる**

`docs/constitution.md` の末尾行。

変更前:
```
**Version**: 2.1.3 | **Ratified**: 2026-07-16 | **Last Amended**: 2026-08-16
```
変更後:
```
**Version**: 2.1.4 | **Ratified**: 2026-07-16 | **Last Amended**: 2026-08-16
```

- [ ] **Step 10: Sync Impact Report を足す**

`docs/constitution.md` の 3 行目 `==================` の直後に新しいブロックを挿入し、
既存の `- Version change: 2.1.2 → 2.1.3` ブロックの前に区切りと
`Previous release: 2.1.2 → 2.1.3` を入れる（既存の書式に倣う）。

挿入する内容:
```
- Version change: 2.1.3 → 2.1.4（PATCH: 正本のパスを docs/constitution.md へ移し、
  Governance の改版手続きから「依存テンプレート（plan/spec/tasks）との整合」を削除。
  原則 I〜XI は 1 文字も変えていない）
- Rationale: #71。spec-kit 経路（.specify/ の道具部分と .claude/skills/speckit-* 10 本）を
  廃止した。setup-plan.sh が exit 0 でリポジトリ直下に幽霊 specs/ を作る一方、実運用の
  設計文書は docs/superpowers/ で回っており、10 本のスキルは AGENTS.md から 1 つも
  案内されていなかった。憲法の正本が .specify/memory/ に同居していたため、docs/ 直下へ
  移して三層（憲法・ADR・ガイド）を揃えた。Governance の「依存テンプレートとの整合」は
  .specify/templates/ の消滅で宛先を失うため削除した。「すべての plan は Constitution
  Check ゲートを通過しなければならない」は残す — テンプレートを名指ししておらず、
  docs/superpowers/plans/ の 4 本が ## Constitution Check 節として体現しているため。
  ゲートの空文化を検出する話は #155 の領分。
- Modified principles: なし（原則 I〜XI は不変）
- Templates requiring updates:
  - 削除 .specify/templates/ — spec-kit 経路ごと廃止（#71）。以後、依存テンプレートは無い
  - OK AGENTS.md — **見出しに変更が無いため同期作業は不要**（原則 I〜XI の 11 本一致を
    確認済み。Step 11 で実測）

---

Previous release: 2.1.2 → 2.1.3
```

- [ ] **Step 11: AGENTS.md の見出し同期を実測する（ADR 0002 決定 5 の MUST）**

憲法は `### I. テスト駆動開発（NON-NEGOTIABLE）`、AGENTS.md は
`- I. テスト駆動開発（NON-NEGOTIABLE）` の書式。接頭辞を落として突き合わせる。

```bash
diff <(grep -oE '^### [IVX]+\. .*' docs/constitution.md | sed 's/^### //') \
     <(grep -oE '^- [IVX]+\. .*' AGENTS.md | sed 's/^- //') \
  && echo "見出し一致"
grep -cE '^### [IVX]+\. ' docs/constitution.md
```

Expected: `見出し一致` と `11`

（作業前の `.specify/memory/constitution.md` に対してこのコマンドを実測し、
`見出し一致` / `11` が出ることを確認済み）

- [ ] **Step 12: リンク検査が緑に戻ることを確認する**

```bash
node scripts/check-links.mjs
```

Expected: `リンク検査 OK（走査 216 ファイル）`

赤が出た場合は、そのメッセージが名指ししているファイルと行を直す。
**この段階で「実在しないパスです」が残っていたら、それは付け替え漏れである。**

- [ ] **Step 13: コミット**

```bash
git add -A
git status --short
git commit -F - <<'MSG'
docs: 憲法を docs/constitution.md へ移し 2.1.4 とする（#71）

- .specify/memory/constitution.md を docs/ 直下へ移設。三層（憲法・ADR・ガイド）が揃う
- 参照 30 箇所を付け替え（バッククォート表記 20・相対リンク 10）
- check-links の LIVE_DOCS と REPO_TOP_LEVEL を更新
- Governance の改版手続きから「依存テンプレートとの整合」を削除（宛先を失うため）
- 原則 I〜XI は不変。AGENTS.md の見出し 11 本の一致を確認済み

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
git status --short && echo "(空なら clean)"
```

Expected: コミットが作られ、作業ツリーが clean

- [ ] **Step 14: 破壊検証 — 新しい憲法パスが本当に検査に載っているか**

**コミットの後に行う。** そうすれば復元に `git checkout --` を使っても、
直前の作業が巻き添えで消えることがない。

定数を書き換えて壊す。**ファイルを退避する方法では確かめられない。**

```bash
# 壊す
sed -i 's|^  "docs/constitution\.md",$|  "docs/constitution.md",\n  "docs/no-such-probe/",|' scripts/check-links.mjs
# 壊れたことを先に確認する
grep -c 'docs/no-such-probe/' scripts/check-links.mjs
# 赤を見る
node scripts/check-links.mjs
```

Expected:
- `grep -c` が `1`（改変が入った）
- `LIVE_DOCS が実在しないパスを指しています: docs/no-such-probe/`

```bash
# 戻す
git checkout -- scripts/check-links.mjs
grep -c 'docs/no-such-probe/' scripts/check-links.mjs || echo "0 件（復元完了）"
node scripts/check-links.mjs
git status --short && echo "(空なら clean)"
```

Expected: `0 件（復元完了）` / `リンク検査 OK` / 作業ツリーが clean

---

### Task 2: spec-kit 経路を廃止する

**Files:**
- Delete: `.specify/`（残り 18 ファイル）・`.claude/skills/speckit-*`（10 ファイル）
- Modify: `scripts/check-links.mjs`（`DORMANT_DOCS` から 2 件削除）
- Modify: `scripts/list-scan-targets.mjs:23,33`（`shell` の除外を空にする）
- Modify: `scripts/list-scan-targets.test.mjs`（題材のパスを差し替え）
- Modify: `.github/workflows/ci.yml:233`（コメント）

**Interfaces:**
- Consumes: Task 1 の `docs/constitution.md`（`LIVE_DOCS` に載っていること）
- Produces: `git ls-files .specify` が 0 件、`git ls-files .claude` が 0 件。
  `scripts/list-scan-targets.mjs` の `KINDS.shell.exclusions` が `[]`

- [ ] **Step 1: 削除する**

```bash
cd /home/vscode/tasuki-work
git rm -r -q .specify
git rm -r -q .claude/skills
git status --short | wc -l
```

Expected: `28`（削除されたファイル数）

- [ ] **Step 2: `REPO_TOP_LEVEL` から `\.specify` を外す**

`scripts/check-links.mjs:105`。**`.specify/` が実際に消えるこのコミットで外す。**

変更前:
```js
const REPO_TOP_LEVEL = /^(packages|apps|scripts|docs|deploy|e2e|\.github|\.specify)\//;
```
変更後:
```js
const REPO_TOP_LEVEL = /^(packages|apps|scripts|docs|deploy|e2e|\.github)\//;
```

これを外さないと、Task 3 で足す ADR 0009 の追記が `` `.specify/` `` をバッククォートで
書いた時点で「実在しないパスです」で落ちる。

- [ ] **Step 3: `DORMANT_DOCS` から 2 件を消す**

`scripts/check-links.mjs` の `DORMANT_DOCS` から次の 2 行を削除する。

```js
  { prefix: ".claude/skills/", reason: "AI CLI のスキル定義。リポジトリの文書ではない" },
  { prefix: ".specify/templates/", reason: "spec-kit の vendor テンプレート" },
```

**残す 7 行**は `docs/superpowers/` `docs/plans/` `docs/timer/` `docs/poker/`
`docs/retrospectives/` `packages/protocol/README.md` `packages/ui/README.md`。

- [ ] **Step 4: `list-scan-targets.mjs` の除外を空にする**

`scripts/list-scan-targets.mjs:23` のコメントから `.specify` の行を削り、
`:33` の除外エントリを消す。

変更前（20〜40 行付近）:
```js
 * shell:        `.specify/scripts/**` は spec-kit の vendor（ADR 0009 D6）。
 * script-tests: `scripts/` に限定する。`*.test.mjs` にすると
```
変更後:
```js
 * shell:        除外は無い。追跡下の `*.sh` を全件対象にする（#71 で
 *               `.specify/scripts/**` の vendor 除外が宛先を失ったため。ADR 0009 追記）。
 * script-tests: `scripts/` に限定する。`*.test.mjs` にすると
```

変更前:
```js
  shell: {
    patterns: ["*.sh"],
    exclusions: [
      { prefix: ".specify/scripts/", reason: "spec-kit の vendor（ADR 0009 D6）" },
    ],
  },
```
変更後:
```js
  shell: {
    patterns: ["*.sh"],
    exclusions: [],
  },
```

- [ ] **Step 5: 単体テストの題材を差し替える**

`scripts/list-scan-targets.test.mjs` の 2 つのテストが `.specify/scripts/` を題材にしている。
**これらはインメモリの配列を使う純粋な単体テストで、実ディレクトリに依存していないため
落ちない。** ただし実在しないパスを題材に名乗り続けるのは紛らわしいので差し替える。
**除外の仕組み自体は残るので、テストは削らない。**

```bash
sed -i 's|"\.specify/scripts/bash/common\.sh"|"vendor/scripts/common.sh"|g; s|prefix: "\.specify/scripts/", reason: "spec-kit の vendor"|prefix: "vendor/scripts/", reason: "テスト用の vendor 除外"|g' scripts/list-scan-targets.test.mjs
grep -c 'vendor/scripts/' scripts/list-scan-targets.test.mjs
grep -c '\.specify' scripts/list-scan-targets.test.mjs || echo "0 件（.specify は消えた）"
```

Expected: `vendor/scripts/` が 4 件、`.specify` は 0 件

- [ ] **Step 6: `.gitignore` は変更しない（D4 の確認）**

```bash
grep -n '\.claude' .gitignore || echo ".claude は .gitignore に無い（正しい状態）"
```

Expected: `.claude は .gitignore に無い（正しい状態）`

**`.claude/` を `.gitignore` に足さない。** 追跡候補のまま残す決定である（設計 D4）。
speckit スキル 10 本の削除で追跡ファイルは 0 件になり、git は空ディレクトリを追跡しないため、
クローン直後に `.claude/` は存在しなくなる。これは想定どおりで、対処は不要。

- [ ] **Step 7: `ci.yml` のコメントを直す**

`.github/workflows/ci.yml:233`。

変更前:
```yaml
      # .sh が無検査だった。#135 経路④）。.specify/scripts/** は vendor（ADR 0009 D6）。
```
変更後:
```yaml
      # .sh が無検査だった。#135 経路④）。除外は無い（#71 で .specify/ を廃止。ADR 0009 追記）。
```

- [ ] **Step 8: 3 つの検査が緑であることを確認する**

```bash
node scripts/check-links.mjs
node scripts/list-scan-targets.mjs shell
node --test scripts/list-scan-targets.test.mjs 2>&1 | grep -E '^# (pass|fail)'
```

Expected:
- `リンク検査 OK`
- `.sh` が 6 本（`deploy/deploy.sh` `deploy/lib/common.sh` `deploy/setup.sh`
  `scripts/gen-countdown-voices.sh` `scripts/gen-sounds.sh` `scripts/gen-voices.sh`）
- `# pass 6` / `# fail 0`

- [ ] **Step 9: コミット**

```bash
git add -A
git commit -F - <<'MSG'
chore: spec-kit 経路を廃止する（#71）

- .specify/ の道具部分 18 ファイルと .claude/skills/speckit-* 10 本を削除
- setup-plan.sh は exit 0 でリポジトリ直下に幽霊 specs/ を作っていた
- 10 本のスキルは AGENTS.md から 1 つも案内されておらず、全部が死んだ経路に依存していた
- check-links の DORMANT_DOCS から 2 件、list-scan-targets の shell 除外を削除
- shellcheck の対象は 6 本のまま変わらない（削除分はもともと除外されていた）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
git status --short && echo "(空なら clean)"
```

Expected: コミットが作られ、作業ツリーが clean

- [ ] **Step 10: 破壊検証 — 死んだ除外の検出が空振りしていないか**

**コミットの後に行う。** 復元に `git checkout --` を使っても巻き添えが出ない。

`exclusions` が空になったので、**検出機能そのものが生きているか**を確かめる。

```bash
# 壊す
sed -i 's|    exclusions: \[\],|    exclusions: [{ prefix: "no-such-probe/", reason: "破壊検証" }],|' scripts/list-scan-targets.mjs
# 壊れたことを先に確認する
grep -c 'no-such-probe/' scripts/list-scan-targets.mjs
# 赤を見る
node scripts/list-scan-targets.mjs shell; echo "exit=$?"
```

Expected:
- `grep -c` が `1`
- `[list-scan-targets] 除外が 1 件も一致しません: no-such-probe/（破壊検証）`
- `exit=1`

```bash
# 戻す
git checkout -- scripts/list-scan-targets.mjs
grep -c 'no-such-probe/' scripts/list-scan-targets.mjs || echo "0 件（復元完了）"
node scripts/list-scan-targets.mjs shell | wc -l
git status --short && echo "(空なら clean)"
```

Expected: `0 件（復元完了）` / `6` / 作業ツリーが clean

---

### Task 3: ADR 0002 と 0009 に追記し、docs/README.md に規約の要約を置く

**Files:**
- Modify: `docs/adr/0002-document-system-three-layers.md`（末尾に追記節を新設）
- Modify: `docs/adr/0009-ci-scope-and-checks.md`（末尾に追記節を新設）
- Modify: `docs/README.md`（`docs/plans/` の位置づけの一文に追記規約への参照を足す）

**Interfaces:**
- Consumes: Task 1・Task 2 の結果（`docs/constitution.md` の実在、`.specify/` の不在）
- Produces: 追記規約の正本が `docs/adr/0002` の追記節にあること

- [ ] **Step 1: ADR 0002 の末尾に追記節を足す**

`docs/adr/0002-document-system-three-layers.md` の末尾（`## この ADR で決めないこと` 節の後）
に次を追加する。**既存の節は変更しない**（Task 1 でパス表記だけ更新済み）。

```markdown
## 追記（2026-08-16・#71）

### 憲法の正本を `docs/constitution.md` へ移した

#71 で spec-kit 経路（`.specify/`）を廃止したため、同居していた憲法を `docs/` 直下へ移した。
決定 1 の三層表・背景・決定 5 のパス表記は更新済み。**三層構造そのもの、書き分けの規則、
採番規約、改版時の AGENTS.md 見出し同期の MUST は変えていない。**

**2026-08-16 以前の文書は憲法を `.specify/memory/constitution.md` として参照している。**
これは当時の正本のパスであり、記録として正しい。**現在の正本は `docs/constitution.md`。**
休眠文書（`docs/superpowers/` `docs/retrospectives/` ほか）のバッククォート表記は
リンク検査の対象外であり、意図的に当時のまま残している。

### 設計文書の追記規約（決定 4 の運用を明文化する）

決定 4 は置き場を定めたが、**完了した文書をどう扱うか**を宣言していなかった。#71 で
明文化する。

- `docs/plans/` は SDD 期の記録一式、`docs/superpowers/` は現行の設計文書
- **どちらも追記のみ。完了しても移動しない。ディレクトリ名も当時のまま改名しない**
- `docs/plans/archive/` は実装前の最終設計書の置き場（1 本）。隣接する spec / plan / tasks とは
  種類が違うため分かれている。廃止しない

理由: 記録の所在が動くと、そこを指す過去の文書が一斉に壊れる。実際 #71 で
`docs/plans/archive/` の廃止を検討した際、`docs/adr/0011` のリンクのほか、**リンク検査が
捕まえない**休眠文書からのバッククォート参照 2 系統が壊れることが分かったため撤回した。
```

- [ ] **Step 2: ADR 0009 の末尾に追記節を足す**

`docs/adr/0009-ci-scope-and-checks.md` の末尾（既存の `## 追記（2026-08-16・#135）` 節の後）
に次を追加する。**D6 本体の文言は歴史として残し、変更しない。**

```markdown
## 追記（2026-08-16・#71）

### D6 の「`.specify/scripts/**` は vendor のため対象外（MUST NOT）」は宛先を失った

#71 で `.specify/` を廃止したため、除外すべき対象そのものが消えた。
`scripts/list-scan-targets.mjs` の `shell` 種別から除外を削除し、`exclusions` は空になった。

**走査対象は 6 本のまま変わらない**（削除された `.specify/scripts/bash/*.sh` の 5 本は
もともと除外されていたため）。CI の shellcheck ジョブの挙動に変化は無い。

D6 本体の文言は歴史として残す。以後、shellcheck の対象は `git ls-files '*.sh'` の全件である。
除外が空になったことで「死んだ除外を検出する」機能が守る対象は無くなったが、機能自体は
残しており、#71 で実在しない除外を 1 件足して赤くなることを確認している。
```

- [ ] **Step 3: `docs/README.md` に追記規約への参照を足す**

既存の一文（`docs/plans/` の位置づけ）に、規約の正本への参照を足す。
**規約本文は転記しない**（正本は ADR 0002 の 1 箇所だけ）。

変更前:
```
[`docs/plans/`](./plans/) は SDD（Specification-Driven Development）期の記録であり、
新規の設計文書の追加先ではありません（詳細は [`docs/adr/0002`](./adr/0002-document-system-three-layers.md) を参照）。
```
変更後:
```
[`docs/plans/`](./plans/) は SDD（Specification-Driven Development）期の記録であり、
新規の設計文書の追加先ではありません。**`docs/plans/` も `docs/superpowers/` も追記のみで、
完了しても移動・改名しません**（規約の正本は
[`docs/adr/0002`](./adr/0002-document-system-three-layers.md) の追記節）。
```

- [ ] **Step 4: リンク検査が緑であることを確認する**

```bash
node scripts/check-links.mjs
```

Expected: `リンク検査 OK`

新設した追記節の中のリンク（`docs/adr/0011` など）が解決できない場合はここで落ちる。

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -F - <<'MSG'
docs: ADR 0002 に追記規約と移設の記録を、ADR 0009 に D6 の宛先消滅を記録する（#71）

- ADR 0002: 憲法の移設と、記録文書は移動・改名しないという追記規約を明文化
- ADR 0002: docs/plans/archive/ を廃止しない理由（休眠文書の参照は検査が捕まえない）
- ADR 0009: D6 の vendor 除外が宛先を失った。走査対象は 6 本のまま
- docs/README.md からは規約の正本を参照するだけにする（本文を転記しない）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 4: 全体の検査を回して振り返りを書く

**Files:**
- Create: `docs/retrospectives/2026-08-16-issue-71-cleanup.md`

**Interfaces:**
- Consumes: Task 1〜3 のコミット
- Produces: 振り返り文書（DoD 項目 7 と #68 の運用）

- [ ] **Step 1: 作業ツリーが clean であることを確認する**

```bash
cd /home/vscode/tasuki-work
git status --short && echo "(空なら clean)"
```

変異検査は clean を要求する。汚れていたらコミットしてから進む。

- [ ] **Step 2: 全テストを流す**

```bash
corepack pnpm test 2>&1 | tail -20
```

Expected: 全パッケージ緑。**`Tests N passed | M skipped` の `passed` の数を見る**
（括弧内の総数は `.skip` を取り逃がす）。

- [ ] **Step 3: 構造監査・変異検査・shellcheck を流す**

```bash
node scripts/audit-structure.mjs > /dev/null; echo "audit exit=$?"
node --test scripts/audit-structure.test.mjs 2>&1 | grep -E '^# (pass|fail)'
node scripts/mutation-check.mjs 2>&1 | tail -5; echo "mutation exit=$?"
shellcheck -x --source-path=deploy --severity=warning $(node scripts/list-scan-targets.mjs shell); echo "shellcheck exit=$?"
```

Expected: すべて `exit=0`。変異検査は **9 件すべて検出**が正。

- [ ] **Step 4: 振り返りの書式を確認する**

```bash
sed -n '1,60p' docs/guides/retrospective.md
```

**このガイドが振り返りの正本の書式である。** 自己流の見出しを作らない。

- [ ] **Step 5: 振り返りを書く**

`docs/retrospectives/2026-08-16-issue-71-cleanup.md` を Step 4 の書式で作成する。
**次の内容を必ず含める**（いずれも #71 で実際に起きたこと）。

- **Issue 本文の前提が 3 つ古かった。** 「やること」6 項目のうち 2 つは宛先が消滅
  （`docs/BACKLOG.md`・`dompurify`）、2 つは既に達成済み（README の入口・リンク検査）だった
- **申し送りの記述が実態と違った。** 「3 本のスクリプトはいずれも失敗するか空の `specs/` を
  作る」→ 実際は 3 者 3 様で、`setup-plan.sh` だけが **exit 0 で幽霊ディレクトリを作る**
- **自分の設計が自分の決めた規約と矛盾していた。** `docs/plans/archive/` の廃止は
  「記録は移動しない」という同じ設計内の D6 と正面から矛盾しており、敵対的検証で撤回した
- **破壊検証の手順そのものが空振りだった。** `check-links.mjs` の `exists` は
  `git ls-files` の索引を見ているため、ファイルを退避しても検査は落ちない
  （名指しの赤ではなく Node のクラッシュになる）。定数を書き換える壊し方に差し替えた
- **「憲法は中身を変えない」が成立しなかった。** Governance 節の改版手続きに
  `.specify/templates/` への依存が 1 句だけ残っており、設計の途中で D3 を訂正した
- **`git checkout` でブランチを切り替えても、`git rm` の結果はインデックスに残る。**
  プローブ用ブランチを削除した後も削除がステージされたまま main へ持ち越された
  （`git reset --hard` で復元）

- [ ] **Step 6: リンク検査が緑であることを確認する**

```bash
node scripts/check-links.mjs
```

Expected: `リンク検査 OK`（振り返りは `docs/retrospectives/` = 休眠だが、リンクは検査される）

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -F - <<'MSG'
docs: #71 の振り返り（#71）

- Issue 本文の前提が 3 つ古く、やること 6 項目のうち 4 つが宛先消滅か達成済みだった
- 申し送りの「3 本とも失敗する」は誤り。setup-plan.sh だけが exit 0 で幽霊 specs/ を作る
- 自分の設計内で規約と実作業が矛盾していた（archive 廃止 vs 記録は移動しない）
- 破壊検証の壊し方が空振りだった（exists は git の索引を見る）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 5: PR を作り、申し送りを残す

**Files:** なし（GitHub 上の操作）

**Interfaces:**
- Consumes: Task 1〜4 の 4 コミット ＋ 設計文書の 2 コミット
- Produces: PR、#155 と #71 へのコメント

- [ ] **Step 1: push して PR を作る**

```bash
cd /home/vscode/tasuki-work
git log --oneline main..HEAD
git push -u origin chore/71-retire-spec-kit
```

**1 Issue = 1 PR**（ADR 0013 の既定）。分割してよい 4 つの理由のどれにも当たらない。
DoD 8 項目は「該当なし」も明記する（`docs/guides/definition-of-done.md`）。

```bash
gh pr create --base main --head chore/71-retire-spec-kit \
  --title "chore: spec-kit 経路を廃止し憲法を docs/ へ移す（#71）" \
  --body-file - <<'PRBODY'
## 概要

死んでいた spec-kit 経路（`.specify/` の道具部分と `.claude/skills/speckit-*` 10 本）を
廃止し、そこに同居していた憲法の正本を `docs/constitution.md` へ移しました。
規範の三層（憲法・ADR・ガイド）が `docs/` 直下で揃います。Closes #71

## 変更内容

- `.specify/` の道具部分 18 ファイルと speckit スキル 10 本を削除（計 28 ファイル）
- 憲法を `docs/constitution.md` へ移設し 2.1.4 とする（原則 I〜XI は不変）
- 憲法の参照 30 箇所を付け替え（バッククォート表記 20・相対リンク 10）
- `check-links` の `LIVE_DOCS` / `DORMANT_DOCS` / `REPO_TOP_LEVEL`、
  `list-scan-targets` の shell 除外、`ci.yml` のコメントを更新
- ADR 0002 に「記録は移動・改名しない」追記規約と移設の記録を新設
- ADR 0009 に D6 の vendor 除外が宛先を失ったことを記録

## 測ったこと

- `setup-plan.sh` だけが **exit 0 でリポジトリ直下に幽霊 `specs/` を作っていた**
  （申し送りの「3 本ともいずれも失敗するか空の specs/ を作る」は不正確だった）
- shellcheck の走査対象は **6 本のまま変わらない**（削除分はもともと除外されていた）
- 憲法の Governance に `.specify/templates/` への依存が 1 句だけ残っていたので削除した
- 休眠文書 12 ファイル・25 箇所は古いパスを指したまま残す（当時の記録として正しい。
  リンク検査の対象外であることは承知のうえ）

## 破壊検証

- `check-links` の `LIVE_DOCS` に実在しないエントリを足す →
  `LIVE_DOCS が実在しないパスを指しています: docs/no-such-probe/` で赤
- `list-scan-targets` に実在しない除外を足す →
  `除外が 1 件も一致しません: no-such-probe/` で赤（exit 1）
- **どちらも定数を書き換えて壊した。** `exists` は `git ls-files` の索引を見るため、
  ファイルの退避では確かめられない（退避するとクラッシュする）

## テスト方法

- [ ] `node scripts/check-links.mjs` が緑
- [ ] `node scripts/list-scan-targets.mjs shell` が 6 本
- [ ] `corepack pnpm test` が全緑
- [ ] `node scripts/mutation-check.mjs` が 9 件すべて検出
- [ ] CI 5 ジョブが緑

## DoD

1. [x] テスト全緑（`corepack pnpm test`）
2. [ ] E2E — **該当なし**（利用者の通る経路は変わらない）
3. [x] 新しい検査を壊して赤を確認した（上の破壊検証 2 件）
4. [x] 変異検査で恒真化していないことを確認した
5. [ ] 実経路確認 — **該当なし**（文書とスクリプト定数のみ）
6. [ ] Tidy First — **該当なし**（`docs/plans/archive/` の廃止は設計時に撤回した）
7. [x] 文書への影響を反映した（ADR 0002・0009・AGENTS.md・docs/README.md・憲法）
8. [x] Issue の完了条件を満たした（本文の「全 30 タスク緑」は腐っていたため置き換え。
   置き換えた内容は #71 へコメント済み）

## 分割しなかった理由

ADR 0013 の既定は 1 Issue = 1 PR。分割してよい 4 つの理由のどれにも当たらない —
独立して revert したい単位は無く、段階的に本番へ出す必要も無く（本番の振る舞いは
一切変わらない）、危険度は一様で、レビューが回らなかった実績も無い。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
```

- [ ] **Step 2: CI が 5 ジョブとも緑になることを確認する**

```bash
gh pr checks --watch
```

Expected: 5/5 緑。**`docs` ジョブと `quality` ジョブが実際に走っていること**を確認する
（`paths` フィルタで飛ばされていると緑でも何も検査していない）。

- [ ] **Step 3: #155 へ申し送る**

```bash
gh issue comment 155 --body-file -
```

内容:
- #71 で `.specify/templates/plan-template.md` を削除した。**Constitution Check ゲートの
  様式を定義していた正本が無くなった**
- 憲法 Governance の「すべての plan は Constitution Check ゲートを通過しなければならない」は
  そのまま残してある（テンプレートを名指ししていないため）
- 実運用では `docs/superpowers/plans/` の 4 本が `## Constitution Check` 節として体現している。
  #155 が検出手段を作るときは、この 4 本が唯一の様式の手がかりになる

- [ ] **Step 4: #71 へ完了条件の置き換えをコメントする**

```bash
gh issue comment 71 --body-file -
```

内容:
- 本文の完了条件「全 30 タスク緑」は turbo が現在 44 タスクのため成立しない。**数え上げを
  やめて性質で指す**形に置き換えた
- 置き換えた完了条件: `docs/README.md` と ADR 0002 が正本と追記規約を宣言している ／
  `node scripts/check-links.mjs` が緑 ／ CI 5 ジョブが緑 ／ `git ls-files .specify` と
  `git ls-files .claude` が 0 件で作業ツリーが clean
- 本文の前提のうち古かったもの（`docs/BACKLOG.md` 不在・`dompurify` 削除済み・
  README の入口は既存・リンク検査は #70 で自動化済み・最大は `docs/superpowers/`）

- [ ] **Step 5: 残存ブランチの削除（利用者の確認を取ってから）**

ローカル側は作業のついでに消してよい。

```bash
git branch -D docs/103-ip-rate-limit-design
```

**リモート側は戻しにくいので、必ず確認を取ってから実行する。**

```bash
# 先に「main の祖先である」ことを再確認する
git fetch origin
git merge-base --is-ancestor origin/docs/136-security-norms origin/main && echo "マージ済み。削除して安全"
# 確認が取れてから
git push origin --delete docs/136-security-norms
```

---

## 実装後の確認

- [ ] `git ls-files .specify` が 0 件
- [ ] `git ls-files .claude` が 0 件
- [ ] `node scripts/check-links.mjs` が緑
- [ ] `node scripts/list-scan-targets.mjs shell` が 6 本
- [ ] `corepack pnpm test` が全緑
- [ ] `node scripts/mutation-check.mjs` が 9 件すべて検出
- [ ] CI 5 ジョブが緑
- [ ] 作業ツリーが clean（幽霊 `specs/` が生まれていない）
- [ ] `docs/constitution.md` の Version が 2.1.4
- [ ] 利用者へ `/workspaces/claym/local/Tasuki` での `git pull` が必要なことを伝えた
