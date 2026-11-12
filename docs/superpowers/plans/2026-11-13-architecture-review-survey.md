# #587 直す前に測る（アーキテクチャと設計原則の調査）実装計画

> マージ後の節は書き換えない。後から分かったことは末尾の補遺の節に書き、置き換えた古い節の末尾に改定の印を足す（`docs/guides/design-doc-revision.md`）。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> まとめ役の手順は [`docs/guides/procedures/orchestration.md`](../../guides/procedures/orchestration.md)。測る 4 本（Task A〜D）は並列に流し、Task 0 と Task E はまとめ役が流す。

**Goal:** コード全体をアーキテクチャと設計原則の観点で測り、問題の一覧・拡張の試算の基準値・次の子 ISSUE の切り方の提案を、測り直せるスクリプトつきで `docs/superpowers/specs/2026-11-13-architecture-review-survey.md` に残す。**コード・検査・依存は直さない・足さない。**

**Architecture:** #495 → #496 と同じ型。測る役を 4 本（A: アーキテクチャと拡張の試算、B: DRY、C: DbC と関数型、D: クリーンコードと単一責任）に分け、別の作業ツリーで並列に走らせる。各本は node 標準ライブラリだけのスクリプトと報告（表）を書く。まとめ役が裏取りして一つの文書に束ね、「効果 × 直す量」で並べ、次の子 ISSUE の切り方・決まりを変える候補・監査の候補を書く。

**Tech Stack:** Node（`node:fs`・`node:path`・`node:child_process` の `git ls-files` だけ。依存を足さない）・Markdown。既存の監査（`scripts/audit-*.mjs`）と #496 の道具（`docs/superpowers/specs/2026-11-01-test-gap-survey/`）は流し直して引く。

**Spec:** [ISSUE #587](https://github.com/tomohiroJin/tasuki-tools/issues/587)（親 [#482](https://github.com/tomohiroJin/tasuki-tools/issues/482)）。設計文書は別に無く、この調査の文書そのものが成果物。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 該当なし | 製品コードを書かない。測るスクリプトは検査ではなく（CI にも `pnpm test` にもつながない。#496 と同じ扱い）、正しさは既知の値（PR #466 の 20 ファイル・`METHOD_IDS` の 9 ファイルほか）との突き合わせと 2 回流して同じ出力になることで確かめる |
| II. 技術選定は ADR を通す | 該当なし | 依存を足さない。重複の検出も node 標準ライブラリで書く（jscpd 等を入れない） |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーの状態管理に触れない |
| IV. 境界の型安全 | 通過 | 境界検証を変えない。C で「契約が型に表れていない箇所」を測る物差しに使う |
| V. 実画面検証 | 該当なし | 利用者の通る経路は変わらない |
| VI. 依存は内向き | 通過 | ドメイン層を変えない。A で層の対応表（`docs/guides/architecture.md`）と `audit-dependency-direction` が見ていない経路を測る物差しに使う |
| VII. 検査は壊して確かめる | 該当なし | 検査を足さない（監査の候補を書くまで）。候補を実装する子 ISSUE で壊して確かめる |
| VIII. 記録が正本 | 通過 | 結果は設計文書 1 本に置き、ISSUE・PR へ表を転記しない。数え方はスクリプトに残す |
| IX. 小さく回す | 通過 | PR 1 本。直す作業は次の子 ISSUE に分ける。デプロイは伴わない |
| X. 抽象は実需で | 通過 | 抽象を足さない。B の写しごとに ADR 0007 の基準（利用者 1 つは抽出しない・20 行未満は抽出しない）を満たすかを書く |
| XI. 秘密と個人情報を持ち込まない | 通過 | 文書に書くのはリポジトリ内のパス・識別子・件数だけ。`.env`・鍵・利用者名を扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- **直さない・足さない。** コード・テスト・監査・依存・`.gitignore` を変えない。見つけたものは一覧に書く
- **数え方はスクリプトにし、手で数えない**（`docs/guides/counting-and-writing.md`）。目で見つけた項目は「目で」と印をつける
- **走査の母集合は `git ls-files`**（`readdirSync` で歩かない）。この環境の FS は大文字小文字を区別せず、`node_modules`・`dist` を除く手間も省ける
- 走査対象の拡張子は `.ts` `.tsx` `.mjs`。テストは `*.test.*` `*.spec.*` と `tests/` `test/` `e2e/` 配下で、ソースと分けて数える
- スクリプトは node 標準ライブラリだけで書き、リポジトリのルートを第 1 引数に取る（`node <script> <ルート>`）。相対パスでよい。結果は標準出力へ JSON（#496 と同じ型）
- 一時ファイルは各作業ツリーの `tmp/`（追跡外。`.gitignore` には `*.tmp` しか無いので、`tmp/` を `git add` しない）
- 一覧の各項目は **場所・観点・何が問題か・直すと何がよくなるか（4 つの目標のどれに効くか: 読みやすい／足すのが速い／続けられる／バグが減る）・直す量（触るファイル数）** の 5 欄
- 測る役（A〜D）は **commit・push・マージ・ブランチ削除・PR と ISSUE への書き込み・`checkout`/`switch`/`stash`/`reset`/`restore`・`rm`・`pnpm install`・dev サーバーと E2E の起動・プロセスの停止をしない**（`docs/guides/procedures/orchestration.md` 3）
- 文書は `docs/superpowers/specs/2026-11-13-architecture-review-survey.md`、スクリプトは同名ディレクトリ `docs/superpowers/specs/2026-11-13-architecture-review-survey/`。どちらも `check-links` の `DORMANT_DOCS`（接頭辞 `docs/superpowers/specs/`）に自動で入る。登録は不要。eslint は `.ts`/`.tsx` だけを見るので `.mjs` は lint されない

## Review Focus

1. **2 回流して数が変わる**（オブジェクトの列挙順・`git ls-files` の順に依存した集計）: どのスクリプトも出力を整列し、同じ入力で同じ出力になる。Task A〜D の各スクリプトに「2 回流して `diff` が空」の段を置く
2. **単語の境界の取り違え**（`checkin` が `checking`・`check-in` の文言に当たる、`id` が `width` に当たる）: 単語境界 `\b` で引き、当たった行の種類（import・識別子・文言・設定の値）を列に持つ。A の拡張の試算は既知の値（`METHOD_IDS` 9 ファイル・`FIBONACCI_DECK` 5 ファイル）と突き合わせる
3. **大文字小文字を区別しない FS**: `readdirSync` で `S02.png` と `s02.png` が同じに見える。母集合は `git ls-files` に限る（Global Constraints）
4. **#496 の道具の既知の癖**: `conventions.mjs` は `it` という名前の変数を拾う（#496 4.2 の 20 件目）。D で流し直すときは、この 1 件を差し引いた数を書き、差し引いたことを書く
5. **写しの検出が資材・生成物に当たる**（`packages/ui/src/fonts`・`*.css`・テストの固定データ）: B の正規化で import 行・空行・コメント行・`}` だけの行を落とし、`.ts`/`.tsx` だけを対象にする。テストの写しはソースの写しと分けて数える

## 検証の時間の見積もり

根拠は 2026-11-13 の実測（main `df9b4f5e`、きれいな作業ツリー）。想定の 2 倍を超えたら人へ報告する。

| 検証 | 1 回 | 回数 | 根拠 |
|---|---:|---:|---|
| 各本のスクリプト（A〜D） | 10 秒未満 | 各 2〜3 回 | #496 の `density.mjs` 0.07 秒・`conventions.mjs` 1.4 秒。母集合は追跡下の `.ts`/`.tsx` 約 1,000 本 |
| `git worktree add`（9p の上） | 1 分未満（見込み。未実測） | 4 回 | 追跡ファイルの書き出しだけ。依存は入れない |
| `node scripts/check-links.mjs` | 2.1 秒 | 3 回 | 実測 |
| `pnpm check:fast` | 6 分 | 2 回（PR の前・レビューの直しの後） | 実測 5 分 56 秒（文書だけの差分。`.mjs` が差分に入ると型・lint・単体も流れ、CI の quality 3 分ぶんが乗る見込み: 9 分） |
| CI 1 周 | 7〜9 分 | 2〜3 回 | 直近 3 回の run（7 分・9 分） |
| 測る役 4 本（並列） | 30〜60 分 | 1 回 | 見込み。#578 の実装役 1 本が 30〜90 分だった |
| 敵対的レビュー（別のエージェント） | 20〜40 分 | 1〜2 往復 | 見込み（`docs/guides/procedures/adversarial-review.md`） |
| `/code-review <番号>` | 5〜10 分 | 1 回 | 見込み |

**合計の見込み: 2.5〜4 時間**（4 本の並列を含む。直列なら 5〜6 時間）。

## 既知の値（裏取り済み・スクリプトの突き合わせに使う）

2026-11-13・main `df9b4f5e` で数えた。

| もの | 値 | 数え方 |
|---|---|---|
| PR #460（checkin の初回 PR）の差分 | ~~100 ファイル~~ → **199 ファイル**（訂正 2026-11-13: `gh pr view --json files` は 100 件で打ち切る。`changedFiles` と `git show --stat 4ed78e21` が 199 で一致。内訳は調査文書の節 2） | `gh pr view 460 --json changedFiles`・`git show --stat --format= 4ed78e21` |
| PR #466（やり方を各側 2 つ足した）の差分 | 20 ファイル: コード 8・テストと変異パッチ 7・文書 2・資材（woff2）3 | 同上。4 欄の分け方の実例 |
| `METHOD_IDS` を持つファイル | 9（`packages/checkin-core` src 3・tests 2、`apps/checkin-web` src 1・tests 3） | `grep -rl` |
| `FIBONACCI_DECK` を持つファイル | 5（`packages/poker-core/src/deck.ts`・`estimate-log.ts`・`index.ts`、`apps/poker-web/src/components/CardHand.tsx`、`packages/poker-core/tests/deck.test.ts`） | 同上。デッキの抽象は無い（#92 は未着手） |
| `checkin` を単語として含み、`apps/checkin-web`・`packages/checkin-core`・`docs/` の外にあるファイル | ~~115~~（訂正 2026-11-13: 拡張子を `.ts` `.tsx` `.mjs` `.yml` `.json` `.sh` に絞った `grep -rl -w` の値で、追跡下の全ファイルを母集合にする A の試算（139）とは母集合が違い、比べられない。A が同じ範囲を `git grep -l -w` で引き直して 139 と一致） | — |
| ソースの行数（テストを除く）の上位 | `apps/tasuki-sync/src/application/poker-handlers.ts` 748・`handlers.ts` 701・`apps/timer-web/src/sync/use-timer-sync.ts` 603・`apps/tasuki-sync/src/create-sync-server.ts` 577・`apps/timer-web/src/ui/components/RosterPanel.tsx` 562・`adapters/ws-adapter.ts` 551・`apps/timer-web/src/ui/Session.tsx` 535・`packages/timer-core/src/evolve.ts` 520 | `wc -l`。テスト支援では `apps/tasuki-sync/test/support/live-sync-server.ts` 1,068 |
| パッケージごとのソース行数 | `apps/tasuki-sync` 10,745・`apps/timer-web` 8,065・`apps/agenda-web` 3,873・`apps/roulette-web` 3,441・`packages/timer-core` 2,890・`apps/poker-web` 2,661（ほかは 2,000 未満） | `find`＋`wc -l` |

---

### Task 0: まとめ役の準備（枝・骨組み・作業ツリー）

**Files:**
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey.md`（骨組み）
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey/README.md`（スクリプトの一覧の枠）
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey/BRIEF.md`（4 本に共通の指示。マージ前に消す）

**Interfaces:**
- Produces: 枝 `docs/587-architecture-review-survey`、作業ツリー `/workspaces/claym/local/Tasuki-wt-587a`〜`587d`（枝 `wt/587-a`〜`wt/587-d`、すべて上の枝から分岐）、文書の節の番号（下）

- [ ] **Step 1: 同じ ISSUE の PR と枝が無いことを確かめる**

```bash
cd /workspaces/claym/local/Tasuki
gh pr list --state all --limit 1000 --search "#587 in:title,body" --json number,title,body -q 'length as $t|"\($t) 件中:",(.[]|select((.title+.body)|test("#587([^0-9]|$)"))|"\(.number) \(.title)")'
git ls-remote --heads origin | grep -E 'refs/heads/.*[/-]587([^0-9]|$)'
git worktree list; git status --porcelain
```
Expected: PR 0 件・枝 0 本・作業ツリーは本体だけ・`porcelain` が空

- [ ] **Step 2: 枝を切る**

```bash
git switch -c docs/587-architecture-review-survey main
```

- [ ] **Step 3: 文書の骨組みを書く**

`docs/superpowers/specs/2026-11-13-architecture-review-survey.md` に、#496 の文書の冒頭（Issue・日付・実測時点・前提となる規範と ADR・位置づけ・「直さない」の宣言）と、次の節見出しだけを置く:
`0. まとめ` / `1. アーキテクチャ・依存の向き・開放閉鎖（A）` / `2. 拡張の試算の基準値（A）` / `3. 同じ知識の写し（B）` / `4. 契約と副作用（C）` / `5. 大きさ・命名・死んだコード・テストの形（D）` / `6. 一覧（効果 × 直す量）` / `7. 次の子 ISSUE の切り方の提案` / `8. 決まりを変える候補` / `9. 監査の候補` / `10. 測れなかったもの`。
冒頭に `docs/guides/design-doc-revision.md` の「書き換えない節」の宣言（この計画の冒頭と同じ引用行 1 つ）を置く。`audit-plan-gate` が 2026-11-03 以降の設計文書に求める（無いと `docs` ジョブが落ちる）。

- [ ] **Step 4: 共通の指示 `BRIEF.md` を書く**

Global Constraints の禁止事項・置き場・出力の型・5 欄・「4 つの目標」の定義・報告の 3 区分（変えたこと／確かめたこと／確かめられなかったこと）を書く。各本への個別の指示（Task A〜D）は、この計画の該当 Task を逐語で渡す。

- [ ] **Step 5: 骨組みをコミットする**

```bash
git add docs/superpowers/plans/2026-11-13-architecture-review-survey.md docs/superpowers/specs/2026-11-13-architecture-review-survey.md docs/superpowers/specs/2026-11-13-architecture-review-survey/
git commit -m "docs(specs): #587 の調査の計画と、文書の骨組み・スクリプトの置き場を置く

- 実装計画（Constitution Check・検証の時間の見積もり・既知の値）
- 測る 4 本（A〜D）が書き込む節の番号を先に決める
- 共通の指示 BRIEF.md はマージ前に消す

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: 作業ツリーを 4 つ切る（依存は入れない）**

```bash
for x in a b c d; do git worktree add -b "wt/587-$x" "/workspaces/claym/local/Tasuki-wt-587$x" docs/587-architecture-review-survey; done
git worktree list
```
Expected: 5 行（本体 + 4）。`stat -f` で 9p と出るが、スクリプトは node 標準ライブラリだけなので `pnpm install` は不要。所要を記録する

- [ ] **Step 7: 4 本を起こす**

Task A〜D を、それぞれ別のサブエージェント（Sonnet）へ、`BRIEF.md` と該当 Task の全文と作業ツリーのパスを渡して同時に起こす。禁止は本文にも 1 行で繰り返す。

---

### Task A: アーキテクチャ・依存の向き・開放閉鎖・拡張の試算

作業ツリー: `/workspaces/claym/local/Tasuki-wt-587a`

**Files:**
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey/a-dependency-edges.mjs`
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey/a-extension-cost.mjs`
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey/report-a.md`（節 1・2 の原稿）

**Interfaces:**
- Consumes: `docs/guides/architecture.md` の「層とディレクトリの対応表」・`scripts/audit-dependency-direction.mjs`（何を見ているか）・既知の値の表
- Produces: `report-a.md`（節 1: 5 欄の表、節 2: 試算 3 つの表）。JSON の型 `{ "edges": [{from, to, kind, file, line}], "violations": [...] }`・`{ "trial": "tool"|"method"|"deck", "files": [{path, column, reason}], "totals": {code, test, docs, asset} }`

- [ ] **Step 1: `a-dependency-edges.mjs` を書く**

`node a-dependency-edges.mjs <ルート>`。追跡下の `.ts`/`.tsx` の import 文（`import … from "…"`・`import("…")`・`export … from "…"`）から辺 `{from: ファイル, to: 解決先, kind: "@tasuki"|"relative"|"external"}` を取り、対応表の層（ファイルのパスから: `packages/*-core/src` → ドメイン、`apps/tasuki-sync/src/application|ports|adapters` → 各層、`apps/*-web/src/**/*.tsx` → 画面、`.ts` → 純粋判断か同期フック（パスに `sync`/`hooks`/`use-` を含む）…）を付け、対応表の「依存してよいもの」に無い辺を `violations` に出す。**`audit-dependency-direction` が既に止めているもの（`@tasuki/*` の package 間の向き・package の外へ出る相対パス）は `covered: true` の印をつけ、見ていない経路（画面から `sync-client`・同期フックから core の内部ファイルの直接参照・app 間）を `covered: false` で分ける。**

- [ ] **Step 2: 2 回流して同じ出力になることを確かめる**

```bash
cd /workspaces/claym/local/Tasuki-wt-587a && mkdir -p tmp
node docs/superpowers/specs/2026-11-13-architecture-review-survey/a-dependency-edges.mjs . > tmp/edges-1.json
node docs/superpowers/specs/2026-11-13-architecture-review-survey/a-dependency-edges.mjs . > tmp/edges-2.json
diff tmp/edges-1.json tmp/edges-2.json && echo same
```
Expected: `same`。`violations` のうち `covered: true` は 0 件（既存の監査が緑なので。0 でなければスクリプトの層の判定が間違っている）

- [ ] **Step 3: `a-extension-cost.mjs` を書く**

`node a-extension-cost.mjs <ルート> tool|method|deck`。
- `tool`: 道具の名前 `checkin` を単語（`\b`）として含む追跡ファイルのうち、`apps/checkin-web/`・`packages/checkin-core/`・`docs/` の外にあるもの＝**新しい道具を足すとき、道具の本体の外で触る場所**。`apps/checkin-web`・`packages/checkin-core` のファイル数は「本体」として別に数える
- `method`: `packages/checkin-core/src/methods.ts` の `METHOD_IDS` の先頭の 1 つを識別子として含む追跡ファイル
- `deck`: `FIBONACCI_DECK` を含む追跡ファイルに加え、`packages/poker-core/src/deck.ts` が持つ値の列（文字列の配列）をそのまま含むファイル（デッキの抽象が無いので、値を知っている場所が「触る場所」）
各ファイルに `column`（code／test／docs／asset。Global Constraints の分け方）と `reason`（当たった行の種類: import・識別子・文言・設定の値・ルーティング）を付け、`totals` を出す。

- [ ] **Step 4: 既知の値と突き合わせる**

```bash
node docs/superpowers/specs/2026-11-13-architecture-review-survey/a-extension-cost.mjs . method | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(r.files.length, r.totals)'
node docs/superpowers/specs/2026-11-13-architecture-review-survey/a-extension-cost.mjs . deck   | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(r.files.length, r.totals)'
node docs/superpowers/specs/2026-11-13-architecture-review-survey/a-extension-cost.mjs . tool   | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(r.files.length, r.totals)'
```
Expected: `method` は 9 以上（`METHOD_IDS` の 9 ファイルを含む。id の文字列そのものを持つ画面・E2E が加わる）、`deck` は 5 以上（`FIBONACCI_DECK` の 5 を含む）、`tool` は 115 以下（単語で引いた上限）。合わなければ、どの既知のファイルが落ちたかを出して直す。2 回流して `diff` が空

- [ ] **Step 5: 実例 PR と並べる**

`gh pr view 460 --json files -q '.files[].path'`・`gh pr view 466 --json files -q '.files[].path'` の一覧を 4 欄に分け、Step 4 の数と並べる。ずれ（PR が触ったが走査に出ない／走査に出るが PR は触っていない）を一覧にし、理由を書く（後続の PR で足した・監査の対象が自動で広がる・など）。読むだけで、`gh` の書き込みはしない。

- [ ] **Step 6: 開放閉鎖の分岐を目で拾う**

やり方・札・デッキ・道具の種類で分岐する箇所（`switch`／`if` の連なり・`Record<MethodId, …>` の写し）を、Step 3 の `method`/`deck`/`tool` の当たったファイルの中から読んで拾い、5 欄の表に書く。「目で」と印をつける。

- [ ] **Step 7: `report-a.md` を書く**

節 1（違反と `covered: false` の経路の 5 欄の表・層の判定の規則・測れなかったもの）、節 2（試算 3 つ × 4 欄の表・ファイルの一覧・実例 PR とのずれ）。各表の上に流したコマンドと所要を書く。報告は 3 区分で。

---

### Task B: DRY（同じ知識の写し）

作業ツリー: `/workspaces/claym/local/Tasuki-wt-587b`

**Files:**
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey/b-duplicates.mjs`
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey/report-b.md`（節 3 の原稿）

**Interfaces:**
- Consumes: ADR 0007 の基準（利用者 1 つは抽出しない・20 行未満は抽出しない。テストからの差し替え利用は利用者に数える）・既知の値の表
- Produces: `report-b.md`。JSON の型 `{ "blocks": [{hash, lines, occurrences: [{file, start}]}], "names": [{name, files}], "literals": [{value, files}] }`

- [ ] **Step 1: `b-duplicates.mjs` を書く**

`node b-duplicates.mjs <ルート>`。追跡下の `.ts`/`.tsx` を読み、各行を正規化（trim・空行・`//`/`/* */`/`*` で始まるコメント行・`import`/`export … from` 行・`}` `};` `)` `);` だけの行を落とす）したうえで、
1. **塊**: 正規化後の連続 **20 行**（ADR 0007 の基準に合わせる）の窓をハッシュし、**2 つ以上の異なるファイル**に現れる窓を、重なる窓をつないで 1 塊にまとめて出す。塊ごとに「ソースどうし／テストどうし／混在」と「同じパッケージ内／パッケージをまたぐ」を付ける
2. **名前**: `export function`／`export const` の名前が 2 つ以上のパッケージ・アプリに現れるもの
3. **文言と定数**: 日本語を含む文字列リテラル（6 文字以上）と、数値の定数（`const X = 数`）の値が、2 つ以上のアプリに現れるもの
出力は整列する。

- [ ] **Step 2: 2 回流して同じ出力になることと、既知の写しが出ることを確かめる**

```bash
cd /workspaces/claym/local/Tasuki-wt-587b && mkdir -p tmp
node docs/superpowers/specs/2026-11-13-architecture-review-survey/b-duplicates.mjs . > tmp/dup-1.json
node docs/superpowers/specs/2026-11-13-architecture-review-survey/b-duplicates.mjs . > tmp/dup-2.json
diff tmp/dup-1.json tmp/dup-2.json && echo same
grep -c font-base tmp/dup-1.json
```
Expected: `same`。書体の base 層の判定の写し（`packages/web-kit/tests/support/font-base.ts` と同じ判定を持つ別のファイル）が `blocks` か `names` に出る。出なければ、まず `grep -rn 'font-base\|isBaseGlyph\|base 層' --include='*.ts' --include='*.tsx'` で写しの実在を確かめ、正規化が落としすぎていないかを直す

- [ ] **Step 3: 目で拾う**

`docs/guides/architecture.md` の「#371 で寄せなかったもの」「#470 で寄せた」に挙がる、各アプリに残る写し（`parseRoute`・招待の表示・タブ・timer の確認のダイアログ・`hubRoomPath`）と、アプリごとの同じ形のフック・定数・テストの補助（`tests/support/`）を読んで拾う。「目で」と印をつける。

- [ ] **Step 4: `report-b.md` を書く**

写しごとに 5 欄に加えて **「寄せると何が減るか」「ADR 0007 の基準を満たすか（利用者の数・行数）」「寄せる／寄せない」** の 3 欄を持つ表。基準を満たさないものは残して「寄せない」と書く。`#463-C`（#470〜#472）で寄せた範囲は重ねて測らず、寄せた結果が残した写しだけを書く。流したコマンドと所要を書く。報告は 3 区分で。

---

### Task C: DbC と関数型（core を中心に）

作業ツリー: `/workspaces/claym/local/Tasuki-wt-587c`

**Files:**
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey/c-contracts.mjs`
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey/report-c.md`（節 4 の原稿）

**Interfaces:**
- Consumes: `scripts/audit-domain-side-effects.mjs`・`scripts/audit-domain-error-shape.mjs`（何を見ているか。走査の対象と字面の一覧）・ADR 0005（Result と境界の検証）・ADR 0016（core ドメインの表現）
- Produces: `report-c.md`。JSON の型 `{ "stringIds": [{file, line, fn, param}], "throws": [{file, line, layer}], "mutable": [{file, line, kind}], "casts": [{file, line}], "propertyTests": [{pkg, files}] }`

- [ ] **Step 1: `c-contracts.mjs` を書く**

`node c-contracts.mjs <ルート>`。対象は `packages/*-core/src`・`packages/room-core/src`・`packages/protocol/src`・`packages/sync-client/src`・`apps/tasuki-sync/src/application`・`apps/tasuki-sync/src/ports`。
1. **`string` のままの ID**: 関数の引数で、名前が `id`／`Id` で終わるか `roomId`・`memberId`・`clientId` 等で、型注釈が `string` のもの（ブランド型・テンプレートリテラル型なら除く）
2. **例外に頼る境界**: `throw` 文の位置と層（ドメイン／アプリケーション／ポート）。ADR 0005 は境界で Result を求めるので、アプリケーション層の `throw` を別に数える
3. **可変の状態**: モジュールの最上位の `let`・`export let`・`Map`/`Set`/配列を最上位で `const` に持ち `.set`/`.push`/`.delete` されているもの・引数の `.push`/`.splice`/`.sort`/プロパティ代入
4. **型の抜け道**: `as unknown as`・`as any`・`!`（非 null 断定）・`@ts-ignore`/`@ts-expect-error` の数
5. **既存の監査が見ているもの**（`audit-domain-side-effects` の字面: `Date.now`・`Math.random`・`process.env` ほか）は `covered: true` で分けて出す
6. **性質テスト**: `fast-check`／`fc.` を import するテストファイルをパッケージごとに数える

- [ ] **Step 2: 2 回流して同じ出力になることと、既存の監査と矛盾しないことを確かめる**

```bash
cd /workspaces/claym/local/Tasuki-wt-587c && mkdir -p tmp
node docs/superpowers/specs/2026-11-13-architecture-review-survey/c-contracts.mjs . > tmp/c-1.json
node docs/superpowers/specs/2026-11-13-architecture-review-survey/c-contracts.mjs . > tmp/c-2.json
diff tmp/c-1.json tmp/c-2.json && echo same
node scripts/audit-domain-side-effects.mjs; echo exit=$?
node scripts/audit-domain-error-shape.mjs; echo exit=$?
```
Expected: `same`、監査は両方 `exit=0`。`covered: true` の項目が `packages/*-core/src` に 1 件でもあれば、スクリプトか監査の対象の読み違い（どちらかを確かめて書く）

- [ ] **Step 3: #496 の道具を流し直す**

```bash
node docs/superpowers/specs/2026-11-01-test-gap-survey/conventions.mjs . > tmp/conventions-now.json
```
性質テストの数を、#496 の文書（4 節）の数と並べる。#496 以後に足されたもの（#522・#530）を差として書く。

- [ ] **Step 4: 目で拾う**

Step 1 の 1〜4 に当たったファイルを読み、**前提を口頭・コメントで守っている関数**（「呼ぶ前に … を確かめること」のようなコメント、引数の順序や範囲の前提）と、不変条件（例: 席の数と参加者の数の整合、ラウンドの状態遷移）が型にもテストにも無いものを拾う。「目で」と印をつける。

- [ ] **Step 5: `report-c.md` を書く**

項目ごとの 5 欄の表（観点は DbC／関数型のどちらか）。「`string` のままの ID」は関数ではなくパッケージごとに件数をまとめ、代表例を 3 つまで書く。流したコマンドと所要を書く。報告は 3 区分で。

---

### Task D: クリーンコードと単一責任

作業ツリー: `/workspaces/claym/local/Tasuki-wt-587d`

**Files:**
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey/d-size.mjs`
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey/d-dead-exports.mjs`
- Create: `docs/superpowers/specs/2026-11-13-architecture-review-survey/report-d.md`（節 5 の原稿）

**Interfaces:**
- Consumes: 既知の値の表（行数の上位）・`docs/guides/architecture.md` の「ユビキタス言語の用語集」・#496 の `conventions.mjs`
- Produces: `report-d.md`。JSON の型 `{ "files": [{path, lines, kind: "src"|"test", hooks: {useState, useEffect, useRef}, exports}], "deadExports": [{file, name}], "tests": [{file, cases, longest, helperLines}] }`

- [ ] **Step 1: `d-size.mjs` を書く**

`node d-size.mjs <ルート>`。追跡下の `.ts`/`.tsx` の行数（ソース・テスト別）、`.tsx` とフック（`use-*.ts`／`use*.ts`）の `useState`・`useEffect`・`useRef`・`useCallback` の数、`export` の数。テストファイルは `it(`/`test(` の数・最長のケースの行数・`tests/support` の行数。出力は行数の降順で整列。

- [ ] **Step 2: `d-dead-exports.mjs` を書く**

`node d-dead-exports.mjs <ルート>`。追跡下の `.ts`/`.tsx` の `export` された名前（`export function`／`export const`／`export type`／`export interface`／`export class`）のうち、**自分以外の追跡ファイルのどこにも単語として現れない**もの。エントリ（`index.ts`・`main.tsx`・`server.ts`・`vite.config.ts`・`*.d.ts`）の export と、`scripts/` は除く。Review Focus 2 の単語境界に従う。**`scripts/audit-public-surface.mjs` は `export *` の有無を見る検査で、死んだ export は見ていない**（#587 の本文の「結果を引く」は読み違い。ここで数える）。

- [ ] **Step 3: 2 回流して同じ出力になることと、既知の値と合うことを確かめる**

```bash
cd /workspaces/claym/local/Tasuki-wt-587d && mkdir -p tmp
for s in d-size d-dead-exports; do node docs/superpowers/specs/2026-11-13-architecture-review-survey/$s.mjs . > tmp/$s-1.json; node docs/superpowers/specs/2026-11-13-architecture-review-survey/$s.mjs . > tmp/$s-2.json; diff tmp/$s-1.json tmp/$s-2.json && echo "$s same"; done
node -e 'const r=JSON.parse(require("fs").readFileSync("tmp/d-size-1.json"));for(const f of r.files.filter(f=>f.kind==="src").slice(0,8))console.log(f.lines,f.path)'
node docs/superpowers/specs/2026-11-01-test-gap-survey/conventions.mjs . > tmp/conventions-now.json
```
Expected: `same` ×2。ソースの上位 8 本が既知の値の表（748・701・603・577・562・551・535・520）と一致する。`conventions.mjs` の `it` 変数の誤検出 1 件（#496 4.2）を差し引いて書く

- [ ] **Step 4: 目で拾う**

ソースの上位 15 本と、フックの `useEffect` が 4 つ以上のファイルを読み、**責務が 2 つ以上**あるもの（例: 接続の管理と画面の状態と URL の同期を 1 つのフックが持つ）を、責務の名前を列挙して書く。命名の揺れは、用語集の語（席・回・札・やり方・玄関…）に対し、識別子で別の英語名が 2 つ以上あるものを拾う（`grep -rwn` で裏取り）。コメントと実装のずれは、上位 15 本の docstring を読んで拾う。「目で」と印をつける。

- [ ] **Step 5: `report-d.md` を書く**

5 欄の表（観点はクリーンコード／単一責任）。行数の表はパッケージごとと上位 15 本。死んだ export の一覧（誤検出の疑いがあるものは理由つきで印）。テストの形は #496 の数（流し直し）と、ここで新たに数えた「最長のケース」「補助の厚さ」。流したコマンドと所要を書く。報告は 3 区分で。

---

### Task E: 束ねる・並べる・提案する・PR（まとめ役）

**Files:**
- Modify: `docs/superpowers/specs/2026-11-13-architecture-review-survey.md`（節 0・1〜5・6〜10）
- Modify: `docs/superpowers/specs/2026-11-13-architecture-review-survey/README.md`（スクリプトの表: ファイル・節・使い方・所要）
- Delete: `docs/superpowers/specs/2026-11-13-architecture-review-survey/BRIEF.md`・`report-*.md`（本文に畳んだ後。`git rm`）

**Interfaces:**
- Consumes: `report-a.md`〜`report-d.md`・各作業ツリーの `tmp/*.json`・スクリプト 6 本

- [ ] **Step 1: 4 本の報告を裏取りする**

各作業ツリーで `git status --porcelain`（指示した置き場以外に書いていないか）を見て、スクリプト 6 本を**本体の作業ツリーへ写してから自分で流し直し**、報告の件数と一致することを確かめる（`docs/guides/procedures/orchestration.md` 4）。報告の「目で」の項目は、代表 3 件ずつ現物を開いて確かめる。

```bash
cd /workspaces/claym/local/Tasuki
for x in a b c d; do cp /workspaces/claym/local/Tasuki-wt-587$x/docs/superpowers/specs/2026-11-13-architecture-review-survey/{$x-*.mjs,report-$x.md} docs/superpowers/specs/2026-11-13-architecture-review-survey/; done
mkdir -p tmp && for s in a-dependency-edges b-duplicates c-contracts d-size d-dead-exports; do node docs/superpowers/specs/2026-11-13-architecture-review-survey/$s.mjs . > tmp/$s.json; done
for t in tool method deck; do node docs/superpowers/specs/2026-11-13-architecture-review-survey/a-extension-cost.mjs . $t > tmp/a-$t.json; done
```
Expected: 報告の件数と一致。ずれたら、報告ではなく流し直した数を採り、ずれを節 10 に書く

- [ ] **Step 2: 節 1〜5 を文書に畳む**

`report-*.md` の表を文書の節 1〜5 へ移し、同じ場所を 2 本が挙げた項目を 1 つに畳む（観点は併記）。各表の上に、流したコマンド・所要・実測時点を残す。

- [ ] **Step 3: 節 6「一覧（効果 × 直す量）」を書く**

全項目を 1 つの表に。**効果**は「4 つの目標のうち効くものの数（1〜4）」と「効く範囲（触るファイル数が減る・同じ直しが要る場所の数）」、**直す量**は触るファイル数で S（5 未満）／M（5〜15）／L（16 以上）。並びは効果の降順・量の昇順。尺度の定義を表の上に書く。

- [ ] **Step 4: 節 7〜9 を書く**

- 節 7: 次の子 ISSUE の案（1 子 ISSUE = 振る舞いを変えない PR 1 本）。各案に、含める項目の番号・順序の根拠・変異の作り直しが要るか・拡張の試算のどの数字が下がる見込みか
- 節 8: 一般の原則と決まりが食い違った項目（ADR の改訂が要るもの）。項目と、どの ADR・原則に当たるか
- 節 9: 機械で止められる規則の破れ（audit-* の候補）。候補ごとに、止める字面と、いま何件当たるか

- [ ] **Step 5: 節 0「まとめ」と節 10 を書き、README を埋める**

節 0 は #496 の表の型（測ったもの／結果／次の手）。節 10 は測れなかったものと理由。README は #496 と同じ表（ファイル・節・使い方・所要）。

- [ ] **Step 6: 作業用ファイルを消し、リンク検査を流してコミットする**

```bash
git rm docs/superpowers/specs/2026-11-13-architecture-review-survey/BRIEF.md docs/superpowers/specs/2026-11-13-architecture-review-survey/report-*.md
node scripts/check-links.mjs; echo exit=$?
git add docs/superpowers/specs/2026-11-13-architecture-review-survey.md docs/superpowers/specs/2026-11-13-architecture-review-survey/
git status --porcelain   # tmp/ が入っていないこと
git commit -m "docs(specs): #587 アーキテクチャと設計原則の調査の結果と測るスクリプトを残す

- 4 本（アーキテクチャと拡張の試算・DRY・DbC と関数型・クリーンコード）の測定を 1 本の文書に束ねた
- 効果 × 直す量の一覧と、次の子 ISSUE の切り方・決まりを変える候補・監査の候補
- スクリプトは検査ではない（CI にもつながない）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Expected: `exit=0`

- [ ] **Step 7: 速い段を流す**

```bash
pnpm check:fast 2>&1 | tail -40
```
Expected: 最後の一覧がすべて成功か理由つきの省略。見込み 9 分（`.mjs` が差分にあるので型・lint・単体も流れる）。2 倍を超えたら人へ報告

- [ ] **Step 8: push して PR を立て、`/code-review` を流す**

PR 本文は 3 区分（変えたこと／確かめたこと／確かめられなかったこと）＋ `Closes #587` を裸で 1 行。末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。立てたら `/code-review <番号>`。

- [ ] **Step 9: 敵対的レビューを通す**

`docs/guides/procedures/adversarial-review.md` に従い、別のエージェント（Opus）に差分と本体の作業ツリーの読み取り（`git show`）だけを渡す。探してもらうもの: **数え違い（スクリプトを流し直して表と比べる）・写しの見落とし・物差しの取り違え（決まりに無い原則で測っていないか）・ADR 0007 の基準の適用の誤り・節 7 の案が「振る舞いを変えない」に収まっているか**。往復の終わり方は手順書の基準。指摘は Step 1〜5 の該当する節へ戻して直し、Step 6〜7 を流し直す。

- [ ] **Step 10: 棚卸しと報告**

```bash
git worktree list; git branch --show-current; ss -tlnp | grep -c LISTEN; git status --porcelain
git ls-remote origin docs/587-architecture-review-survey; git rev-parse HEAD
gh pr view <番号> --json state,mergedAt
```
4 つの作業ツリーと `wt/587-*` の枝を片付ける（`git worktree remove` → `git branch -D`）。報告は 3 区分。利用者が `! gh pr merge <番号> --squash` でマージする（手元では拒まれる）。マージ後に #587 が閉じたことと、親 #482 の次の手（節 7 の案を子 ISSUE にする）を伝える。
