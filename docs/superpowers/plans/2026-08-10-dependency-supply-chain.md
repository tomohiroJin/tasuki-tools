# 依存の最新化と供給網対策（#69）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** #69 の決定（待機期間 7 日の強制・例外手順・Renovate・`pnpm audit` の CI 組み込み・脆弱性 2 件を含む非メジャー 8 件の更新）を PR 5 本で実装する。

**Architecture:** 防御を 3 層に分ける。① **強制** = pnpm の `minimumReleaseAge`（迂回できない層。lockfile エントリにも毎回再適用される）② **検知** = CI の `pnpm audit`（high 以上で落とす）③ **提案** = Renovate（人が取り込みを判断する）。正本スペック: [`docs/superpowers/specs/2026-08-10-dependency-supply-chain-design.md`](../specs/2026-08-10-dependency-supply-chain-design.md)。

**Tech Stack:** pnpm 11.5.0 / GitHub Actions / Renovate。設定は `pnpm-workspace.yaml`・`.github/workflows/ci.yml`・`renovate.json`。文書は Markdown。PR 操作は `gh`。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.0.0）の
コンプライアンスゲート。**Phase 0 前と設計後の両方で通過を確認した。**

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | **該当なし** | 設定・依存の版・文書のみを変更し、プロダクションコードを書かない。テストの新規作成が発生しない |
| II. 技術選定は ADR を通す | **通過** | Renovate の新規導入・待機期間の強制という技術選定を `docs/adr/0008` に記録する（PR-1・PR-5） |
| III. 揮発インメモリと単純運用 | **該当なし** | 同期サーバーの状態管理に触れない。デプロイは #66 でまとめて 1 回（PR-1〜5 のいずれもデプロイを伴わない） |
| IV. 境界の型安全 | **該当なし** | 境界検証・`Result` 型の実装に触れない |
| V. 実画面検証 | **通過** | `dompurify` は timer-web の実行時依存なので実画面で確認する（PR-2 Step 6）。Renovate は実際に PR が立つことを見る（PR-5 Step 4） |
| VI. 依存は内向き | **該当なし** | ドメイン層に触れない |
| VII. 検査は壊して確かめる | **通過** | 待機期間は設定を消して取り込まれることを見る（PR-1 Step 9）。audit ジョブは実際に赤くする（PR-3 Step 4）。既存実装の書き換えは無いが、依存の版が上がるため変異検査を回す（PR-2 Step 7・PR-4 Step 5） |
| VIII. 記録が正本 | **通過** | 決定は ADR 0008、手順は `docs/guides/development.md`、要求は Issue #69。**二重正本を作らない**ため、① 待機期間の設定値は `pnpm-workspace.yaml` の 1 箇所のみ（`.npmrc` には書かない）② **実測値の正本はスペック 1 本**とし、本計画・タスク・ADR は参照に留める（初版は 3 文書へ転記した結果、メジャー更新の件数が食い違った）③ EARS 受け入れ条件は #69 へコメントとして転記する |
| IX. 小さく回す | **通過** | 1 PR = 1 論理変更で 5 本に分割。メジャー更新 12 件は別 Issue へ切り出す。デプロイは行わない |
| X. 抽象は実需で | **通過** | `overrides` を使わない（範囲内で解消できるため）。Renovate の `packageRules` は 20 件という実需に基づく |

**Complexity Tracking: 逸脱なし。**憲法からの逸脱は生じないため、正当化を要する項目は無い。

## Global Constraints

- **利用者から見える振る舞いを変えない**（epic #67 の全体制約）。公開 URL・プロトコル・画面の挙動は据え置き
- **アプリケーションコードのロジックには手を入れない。**変更してよいのは依存の版と設定・文書のみ
- 作業は `/home/vscode/tasuki-work`（overlay）で行う。**`/workspaces` 側では作業しない**（9p 越しではテストが約 48 倍遅く、ディレクトリ操作も壊れる）
- PR は**直列**。前の PR がマージされてから次のブランチを main から切る。`gh pr merge` に `--delete-branch` を付けない
- **本番デプロイはこの Issue の完了条件にしない**（#66 で別途まとめて実施）。**勝手にデプロイしない**
- 各 PR で `pnpm test` 全緑（全 1,970 件・約 28 秒）を確認する
- 文書はすべて日本語。コミットメッセージは Conventional Commits（`type: 日本語説明`）
- PR 本文には DoD 8 項目（[`docs/guides/definition-of-done.md`](../../guides/definition-of-done.md)）を転記し、該当しない項目は「該当なし」と明記する

## 共通手順（各 PR で使う）

### 供給網検証を確実に走らせる

**`node_modules` が最新のとき、pnpm は「Already up to date」で短絡し供給網検証を走らせない。**
ローカルで検証するときは必ず先に消す。

```bash
cd /home/vscode/tasuki-work
rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules
pnpm install --frozen-lockfile   # ここで初めて 533 エントリが検証される
```

> この短絡は**ローカル確認だけの罠**。CI は毎回フレッシュな checkout なので必ず検証が走る。
> 「ローカルで通ったから大丈夫」と判断すると、CI で初めて赤くなる。

### 違反件数を数える

```bash
pnpm install --frozen-lockfile 2>&1 | grep -A5 ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION
```

### 公開日時を調べる

```bash
pnpm view <pkg> time --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const t=JSON.parse(s);console.log(t['<version>'])})"
```

### PR 作成前の敵対的検証

1. その PR の文書・PR 本文に書いた**主張（件数・版・日時・パス）をコマンドで裏取り**する
2. 「この設定で判断に迷う実例」を最低 1 つ挙げ、手順側に不足があれば直してから出す
3. **設定を消したら検査が失われることを 1 度は目で見る**（憲法 原則 VII）

---

### Task 1: PR-1 — 待機期間 7 日の強制と例外手順

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `docs/adr/0008-dependency-supply-chain.md`
- Modify: `docs/adr/README.md`（一覧に 0008 を追加）
- Modify: `docs/guides/development.md`（「依存の更新」節を新設）

**Interfaces:**
- Produces: `minimumReleaseAge: 10080`（分 = 7 日）。以降のすべての `pnpm install` がこの制約下で動く
- Produces: 例外手順（`minimumReleaseAgeExclude` に期限つきで追記 → 解消後に削除）。PR-2 がこれを使う

- [ ] **Step 1: ブランチを切る**

```bash
cd /home/vscode/tasuki-work && git checkout main && git pull && git checkout -b chore/69-pr1-minimum-release-age
```

- [ ] **Step 2: 導入前の違反件数を測る**

**設定を入れる前に測っておく。**後から「元から赤かったのか、自分が赤くしたのか」を切り分けるため。

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules
pnpm install --frozen-lockfile   # 違反 0 件で通るはず（設定がまだ無いので当然）
```

- [ ] **Step 3: `pnpm-workspace.yaml` に待機期間を設定する**

既存の `allowBuilds` の下に追記する。**`.npmrc` には書かない**（実測で無視されることを確認済み）。

```yaml
# 公開直後の版を掴まないための待機期間（単位: 分。10080 = 7 日）。
# npm パッケージの乗っ取り・改ざんは公開から数日以内に発覚することが多いため、
# 公開から 7 日未満の版は pnpm install の段で拒否する。
# pnpm はこの制約を lockfile の各エントリにも毎回再適用するので、
# ローカルで迂回して作られた lockfile は CI で弾かれる。
# 判断の根拠は docs/adr/0008、運用手順は docs/guides/development.md を参照。
minimumReleaseAge: 10080
```

- [ ] **Step 4: 違反件数を測り、分岐する**

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules
pnpm install --frozen-lockfile
```

**違反件数と対象はスペックの「実測で確認した前提」を参照する**（2026-08-11 再実測時点で 1 件。
`postcss-selector-parser@7.1.5` が **2026-08-14T09:32Z** に 7 日を超える）。
測り直した結果に応じて次の順で対処する。**上から順に試し、下に降りるほど例外的**とする。

| # | 状況 | 対処 |
|---|---|---|
| ① | 違反 0 件 | そのまま進む |
| ② | 違反が数件で、いずれも数日で 7 日を超える | **待つ。**lockfile を触らないのが最も安全。この PR を数日寝かせる |
| ③ | 待てない | Step 5 の例外手順を、期限コメントつきで当該エントリに使う。**解除は PR-2 の完了条件に含める** |
| ④ | 違反が多数（14 日以上へ引き上げた場合など） | `pnpm clean --lockfile && pnpm install` で lockfile を全面再解決する。**diff が 533 エントリ規模になるので、この PR には混ぜず単独の PR に切る** |

> ④ を選ぶ判断は原則 IX「小さく回す」に反しやすい。7 日運用では④に至らない想定。
>
> **「違反したエントリだけを古い版へ解決し直す」という第 5 の手は存在しない。**
> 検証は解決より先に走るため、`pnpm update -r <pkg>` も `pnpm install --no-frozen-lockfile` も
> 同じ `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` で落ちる（2026-08-11 実測）。
> 取れる手は上の①〜④だけである。

- [ ] **Step 5: 例外手順を `docs/guides/development.md` に書く**

「テスト」節の前に「依存の更新」節を新設する。内容は次の 4 点。

1. **通常の更新**: `pnpm update <pkg>` / `pnpm outdated -r` で棚卸し。7 日未満の版は自動的に拒否される
2. **緊急の脆弱性修正を待機期間中に取り込む例外手順**:

   ```yaml
   # pnpm-workspace.yaml
   minimumReleaseAgeExclude:
     # 【期限つき】GHSA-xxxx-xxxx-xxxx の修正取り込みのため一時除外。
     # 解除予定: 2026-08-17（当該版が公開から 7 日を超える日）
     - "dompurify"
   ```

   - **除外は特定パッケージのみ**にする。`--trust-lockfile` で全体を切らない
   - **理由・対象アドバイザリ・解除予定日をコメントに残す**
   - **解除を同じ Issue の完了条件に含める**
3. **`node_modules` が最新だと検証が短絡する**こと（上記「共通手順」を参照）
4. **CI では `--trust-lockfile` を使わない**こと（理由は ADR 0008）

- [ ] **Step 6: `allowBuilds` の棚卸し結果を記録する**

現行は `esbuild: true` の 1 件のみ。**pnpm 10 系以降ビルドスクリプトは既定でブロックされる**ので
許可制は既に効いている。次を確認し、`docs/adr/0008` の「影響」節に結果を書く。

```bash
pnpm install --frozen-lockfile 2>&1 | grep -i "ignored build\|build scripts"
```

**この PR では許可リストを変更しない。**変更が必要と判明したら別 Issue に切る。

- [ ] **Step 7: ADR 0008 を書く**

`docs/adr/0008-dependency-supply-chain.md`。テンプレートは `docs/adr/template.md`。

- **背景**: Issue 本文の事実誤認 5 点と、待機期間ごとの導入コストが実測で決まったこと。**数表そのものは転記せず、スペックの「実測で確認した前提」節を参照する**（数値の正本はスペック 1 本。憲法 原則 VIII）
- **決定**: D1〜D4・D8・D11（待機期間 7 日・置き場は `pnpm-workspace.yaml`・CI で `--trust-lockfile` を使わない・例外は `minimumReleaseAgeExclude`・`allowBuilds` は現状維持・仕組みを脆弱性解消より先に置く）。MUST / MUST NOT を明示する
- **影響**: 導入時の違反件数と対処、`allowBuilds` の棚卸し結果、将来 14/30 日へ引き上げる余地、#70 との境界

- [ ] **Step 8: `docs/adr/README.md` の一覧に 0008 を追加する**

- [ ] **Step 9: 検査を壊して確かめる（憲法 原則 VII / DoD 3）**

**「設定を消すと取り込まれる」ことを目で見る。**これが Issue #69 の完了条件そのもの。

**対象の版を決め打ちしない。**その時点で公開から 7 日未満の版を、実行時に選ぶ。

```bash
# 0) 7 日未満の版を探す。時間が経てば別の版になる
pnpm view <任意のパッケージ> time --json | tail -20   # 直近 7 日以内に公開された版を選ぶ

# 1) 設定ありで、その版を明示指定すると拒否されることを見る
pnpm add -w --save-dev <pkg>@<version>   # ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION を期待

# 2) 設定を一時的に消して、同じ操作が通ることを見る
#    → 検査が現に効いていた証拠

# 3) 設定を戻し、作業ツリーを完全に元へ戻す
git checkout pnpm-workspace.yaml package.json pnpm-lock.yaml
```

> **決め打ちが危ない理由。**初版はここに `postcss-selector-parser@7.1.5` と書いていたが、
> この版は 2026-08-14T09:32Z に 7 日を超える。以後この手順は**拒否されずに素通りし、
> 検査が壊れていても気づけない**。このリポジトリが 4 回踏んでいる
> 「検査が静かに効かなくなる」失敗と同じ形なので、版はその場で選ぶ。

- [ ] **Step 10: 例外手順を演習する（憲法 原則 VII / DoD 3）**

**例外手順も「効くこと」を 1 度は目で見る。**実案件を待たずに意図的に作る。

```bash
# 1) 待機期間を一時的に大きく引き上げ、既存 lockfile に封鎖を作る
#    （pnpm-workspace.yaml の minimumReleaseAge を 43200（30 日）などへ）
rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules
pnpm install --frozen-lockfile   # ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION が出ること

# 2) 違反したパッケージを minimumReleaseAgeExclude へ追記し、通ることを見る
# 3) 設定を 10080 へ戻し、除外も消す
git checkout pnpm-workspace.yaml
```

**封鎖されたときのエラーと、除外を入れたら通ったことの両方を PR 本文に貼る。**

> **初版はこの演習を置かず、実案件（`dompurify@3.4.13` が待機期間に引っかかること）で
> 確かめる想定だった。**しかし 2026-08-11 時点でその版は 7 日を超え、実案件は消えた。
> 演習なら日付に依存せず、いつ実行しても同じ結果になる。

- [ ] **Step 11: 検証**

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules
pnpm install --frozen-lockfile   # 違反 0 件で通ること
pnpm test                        # 全 1,970 件緑
pnpm typecheck && pnpm lint && pnpm build
git diff --quiet pnpm-lock.yaml && echo "lockfile は変わっていない"
```

- [ ] **Step 12: マージ可否のゲートを確認する**

**違反 0 件でなければマージしない。**待機期間を入れた状態で `main` の CI が赤くなると、
**以降のすべての PR が赤いまま積み上がる**（この PR だけの問題では済まない）。

- Step 4 の対処①（待つ）を選んだ場合、対象エントリが 7 日を超えたことを確認してからマージする
- 対処②（期限つき除外）を選んだ場合、除外の解除を **PR-2 の完了条件へ明示的に持ち越す**

- [ ] **Step 13: PR を出す**

`chore: 公開直後の版を掴まない待機期間を pnpm へ強制する（#69）`。本文に Step 9・Step 10 の証拠と DoD を書く。
DoD 1・2・4 は「該当なし」（設定と文書のみ）、**3 は Step 9・Step 10 の結果**、5 は `pnpm install` の実挙動、8 は完了条件の一部達成。

---

### Task 2: PR-2 — 脆弱性 2 件の解消

**Files:**
- Modify: `apps/timer-web/package.json`（`dompurify` の版）
- Modify: `pnpm-lock.yaml`
- Modify: `pnpm-workspace.yaml`（PR-1 Step 4 ③ を使った場合のみ、除外の解除）

**Interfaces:**
- Consumes: PR-1 の待機期間と例外手順
- Produces: `pnpm audit` 0 件。PR-3 の CI ゲートが緑で通る前提

- [ ] **Step 1: ブランチを切る**

```bash
cd /home/vscode/tasuki-work && git checkout main && git pull && git checkout -b fix/69-pr2-audit-vulnerabilities
```

- [ ] **Step 2: 現状を測り直す**

```bash
pnpm audit
```

対象と経路はスペックの「脆弱性 2 件の内訳」を参照する。**ここには転記せず、着手時に
再測して差分を確認する**（増減しうる）。

- [ ] **Step 3: 修正版が待機期間を超えているか確かめる**

**7 日の待機期間があるため、修正版が新しすぎると掴めない。**先に確かめる。
**スペックの表を鵜呑みにせず、その場で測る**（日付が進めば判定が変わる）。

```bash
pnpm view dompurify time --json | tail -10
pnpm view nanoid time --json | tail -10
```

超えていれば普通に更新する。超えていなければ PR-1 Step 5 の例外手順を使う。**どちらだったかを PR 本文に記録する。**

> 2026-08-11 の再実測では `dompurify@3.4.13`・`nanoid@3.3.17` とも**既に 7 日を超えている**ため、
> 通常どおり更新できる見込み。例外手順が必要になるのは `nanoid@3.3.18` を選ぶ場合のみ
> （2026-08-14T16:41Z 解禁）。ただし `postcss` の要求は `^3.3.16` なので 3.3.17 で足りる。

- [ ] **Step 4: 更新する**

```bash
# dompurify: 宣言 ^3.4.8 の範囲内なので version 指定は不要
pnpm --filter @tasuki/timer-web update dompurify

# nanoid: 推移依存。postcss の要求は ^3.3.16 なので範囲内で上がる
pnpm update -r nanoid

pnpm audit   # 0 件になること
```

> **`overrides` は使わない。**2 件とも宣言済み semver 範囲内で解消できるため、
> 上流の解決を上書きする必要がない（原則 X「抽象は実需で」の趣旨）。
> 範囲内で解消できないと判明した場合のみ `overrides` を検討し、理由を PR 本文に書く。

- [ ] **Step 5: 例外を使った場合は解除する**

PR-1 Step 4 ③ または Step 3 で `minimumReleaseAgeExclude` を使ったなら、**この PR で必ず消す。**
消し忘れると除外が恒久設定になる。

```bash
grep -n "minimumReleaseAgeExclude" -A5 pnpm-workspace.yaml   # 残っていないこと
```

- [ ] **Step 6: dompurify の実経路を確認する（DoD 5）**

`dompurify` は `apps/timer-web` の**実行時依存**（サニタイズ用途）。版が上がって
挙動が変わっていないことを実画面で確かめる。

```bash
pnpm --filter @tasuki/timer-web dev     # http://localhost:5173/timer/
```

`dompurify` の利用箇所を `grep -rn "dompurify\|DOMPurify" apps/timer-web/src` で特定し、
**その機能が通る画面操作を実際に行う**。確認した操作と結果を PR 本文に書く。

> 終わったら dev サーバーを必ず止める。掴んだままにすると利用者の `pnpm dev` を全滅させる。

- [ ] **Step 7: 変更をコミットしてから変異検査する（DoD 4）**

**順序が重要。**`scripts/mutation-check.mjs` は作業ツリーが汚れていると**実行を拒否する**
（`scripts/mutation-check.mjs:301-308`。変異の適用と復元が自分の変更と区別できなくなるため）。
依存の更新で `package.json` と `pnpm-lock.yaml` が必ず汚れるので、**先にコミットする**。

```bash
git add apps/timer-web/package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "fix: 脆弱性 2 件（nanoid・dompurify）を解消する"

git status --porcelain            # ここで初めて空になる
node scripts/mutation-check.mjs   # 依存の版を上げても既存テストが恒真化していないこと
```

> 初版はコミットの前に `git status --porcelain` が空であることを求めており、
> **そのままでは必ず実行できなかった**。順序を明示する。

- [ ] **Step 8: 検証**

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules
pnpm install --frozen-lockfile
pnpm audit                       # 0 件
pnpm test && pnpm typecheck && pnpm lint && pnpm build
pnpm build && pnpm e2e           # timer の実経路が変わるため E2E も回す
```

- [ ] **Step 9: PR を出す**

`fix: 脆弱性 2 件（nanoid・dompurify）を解消する（#69）`。

---

### Task 3: PR-3 — `pnpm audit` を CI へ組み込む

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/adr/0008-dependency-supply-chain.md`（決定 D9 と #70 との境界を追記）
- Modify: `docs/guides/development.md`（「検査系」節から `pnpm audit` の手動実行の記述を整理）

**Interfaces:**
- Consumes: PR-2 の `pnpm audit` 0 件（先に緑にしておかないと導入と同時に CI が赤くなる）
- Produces: high 以上の脆弱性で CI が落ちる状態

- [ ] **Step 1: ブランチを切る**

```bash
cd /home/vscode/tasuki-work && git checkout main && git pull && git checkout -b ci/69-pr3-audit-job
```

- [ ] **Step 2: 閾値の挙動を実測する**

`pnpm audit` の終了コードが深刻度で変わるかを、**実装前に確かめる。**

```bash
pnpm audit --audit-level high; echo "high: exit=$?"
pnpm audit --audit-level moderate; echo "moderate: exit=$?"
pnpm audit --json | head -40
```

**実測した挙動に合わせてジョブの書き方を決める。**`--audit-level` が期待どおり
終了コードへ効かない場合は、`--json` の `metadata.vulnerabilities.high` と
`.critical` を読んで判定するステップにする（決め打ちで書かない）。

- [ ] **Step 3: `ci.yml` にジョブを足す**

**既存の `ci` ジョブには足さない。**`e2e` と同じく**独立したジョブ**にする
（`ci` に足すと、脆弱性の検査結果を見るのにテストの所要時間を待つことになる。
`e2e` を別ジョブにしたのと同じ理由）。

```yaml
  # 依存の脆弱性検査。high 以上で落とす（moderate 以下は出力に残すだけ）。
  # 判断の根拠は docs/adr/0008。
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      # moderate 以下も内容が見えるように、まず全件を出力に残す
      - run: pnpm audit || true
      # high 以上でだけ落とす（Step 2 の実測に合わせた形にすること）
      - run: pnpm audit --audit-level high
```

> `pnpm install --frozen-lockfile` を含めることで、**このジョブが待機期間の検証も兼ねる**。
> `--trust-lockfile` は付けない（ADR 0008 の決定 D3）。

- [ ] **Step 4: 検査を壊して確かめる（憲法 原則 VII / DoD 3）**

**新しく足した検査なので、わざと落とす。**

1. 一時ブランチで、既知の high 脆弱性を持つ版を明示的に固定する（例: `nanoid@3.3.16`）
   — 待機期間に引っかかる場合は期限つき除外を併用する
2. PR を出して **`audit` ジョブが赤くなることを確認する**
3. 元に戻して緑になることを確認し、一時ブランチを捨てる

**赤くなった CI の実行 URL を PR 本文に貼る。**「落ちるはず」ではなく「落ちた」を示す。

- [ ] **Step 5: moderate では落ちないことも確かめる**

**「high 以上で落ちる」だけでは片手落ち。**受け入れ条件は「moderate 以下では失敗させず、
内容を出力に残す」も要求している。**閾値が厳しすぎる方向に壊れていないこと**を確かめる。

1. 一時ブランチで、moderate 以下の既知脆弱性のみを持つ状態を作る
   （例: `dompurify` を 3.4.12 に戻す。high の `nanoid` は上げたまま）
2. PR を出して **`audit` ジョブが緑のままであること**を確認する
3. ジョブのログに moderate の内容が**出力として残っている**ことを確認する
4. 元に戻し、一時ブランチを捨てる

**緑のままだった CI の実行 URL と、moderate が出力に残っているログ断片を PR 本文に貼る。**

- [ ] **Step 6: #70 との重複を防ぐ**

`docs/adr/0008` に「`pnpm audit` の CI 組み込みは #69 で完了。#70 側の該当項目は
重複追加しない」と書く。**あわせて #70 にコメントを残す**（`gh issue comment 70`）。

- [ ] **Step 7: 検証**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
gh pr checks    # audit ジョブを含む全ジョブが緑
```

- [ ] **Step 8: PR を出す**

`ci: 依存の脆弱性検査を CI へ組み込む（#69）`。DoD 3 は **Step 4（赤くなる）と Step 5（緑のまま）
の両方**の CI 実行 URL で示す。

---

### Task 4: PR-4 — 非メジャーの依存更新

**Files:**
- Modify: `package.json`（ルート）
- Modify: `apps/timer-web/package.json`（`postcss` `lucide-react` `@testing-library/user-event`）
- Modify: `apps/timer-sync/package.json`（`ws`）
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: PR-1 の待機期間（7 日未満の版は自動的に拒否される）

- [ ] **Step 1: ブランチを切る**

```bash
cd /home/vscode/tasuki-work && git checkout main && git pull && git checkout -b chore/69-pr4-low-risk-updates
```

- [ ] **Step 2: 対象を測り直す**

```bash
pnpm outdated       # ルート
pnpm outdated -r    # 全 11 プロジェクト
```

対象はスペックの「陳腐化した依存 20 件の内訳」の**非メジャー 8 件**。うち `dompurify` は
PR-2 で解消済みなので、この PR で扱うのは残り **6 件**（`postcss` は PR-2 の `nanoid` 更新に
伴って動いている可能性があるため、その場で確認する）。

**`pnpm outdated`（ルートのみ）で判断しない。**初版はそれで 4 件を取りこぼした。
必ず `-r` を付けて全 11 プロジェクトを見る。

- [ ] **Step 3: 更新する**

ルートと各アプリを分けて実行する。**`ws` と `lucide-react` は実行時依存**なので、
Step 6 の実画面確認の対象になる。

```bash
# ルート（開発ツール）
pnpm update -w typescript-eslint eslint turbo

# アプリ側
pnpm --filter @tasuki/timer-web update postcss lucide-react @testing-library/user-event
pnpm --filter @tasuki/timer-sync update ws

pnpm outdated -r   # 非メジャーが残っていないこと（メジャーだけが残る）
```

**待機期間に弾かれたら、その版はこの PR に含めない**（例外手順は使わない。緊急ではないため）。
弾かれた版と解禁日を PR 本文に記録する。

- [ ] **Step 4: メジャー更新は別 Issue へ切り出す**

**この PR では上げない。**スペックの「メジャー 12 件」の表を対象とする Issue を新規作成する
（**一覧はここに転記しない**。数値の正本はスペック）。

Issue 本文には次を含める。

- **1 メジャー = 1 PR** を原則とする（`typescript` 7 は型エラーが広範囲に出うるため必ず単独）
- #69 のコメントに転記済みの据え置き理由（2026-06 時点の記録）を背景として引く。
  ただし**内容は古いので着手時に再実測する**
- epic #67 の全体制約（振る舞いを変えない）を引き継ぐ

- [ ] **Step 5: 変更をコミットしてから変異検査する（DoD 4）**

lint / ビルドツールの更新は既存テストの通り方を変えうる。**Task 2 Step 7 と同じ理由で、
先にコミットしないと `mutation-check.mjs` は実行を拒否する。**

```bash
git add -A && git commit -m "chore: 非メジャーの依存を更新する"
git status --porcelain            # 空であること
node scripts/mutation-check.mjs
```

- [ ] **Step 6: 実行時依存の実画面確認（DoD 5）**

`ws`（timer-sync の WebSocket）と `lucide-react`（timer-web のアイコン）は**実行時依存**。
テストが緑なだけで完了としない。

```bash
pnpm --filter @tasuki/timer-sync dev   # :8787
pnpm --filter @tasuki/timer-web dev    # http://localhost:5173/timer/
```

**ルームを作成して同期が通ること**（`ws`）と、**アイコンが従来どおり表示されること**
（`lucide-react`）を実画面で確認し、結果を PR 本文に書く。**終わったら dev サーバーを必ず止める。**

- [ ] **Step 7: 検証**

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules
pnpm install --frozen-lockfile
pnpm test && pnpm typecheck && pnpm lint && pnpm build
node scripts/audit-structure.mjs && node --test scripts/audit-structure.test.mjs
```

- [ ] **Step 8: PR を出す**

`chore: 非メジャーの依存を更新する（#69）`。切り出した Issue 番号を本文に書く。

---

### Task 5: PR-5 — Renovate による自動更新

**Files:**
- Create: `renovate.json`
- Modify: `docs/adr/0008-dependency-supply-chain.md`（決定 D5〜D7 を追記）
- Modify: `docs/guides/development.md`（「依存の更新」節に Renovate PR の扱いを追記）

**Interfaces:**
- Consumes: PR-1 の待機期間 7 日（Renovate 側の待機期間はこれを下回らせない）

- [ ] **Step 1: ブランチを切る**

```bash
cd /home/vscode/tasuki-work && git checkout main && git pull && git checkout -b chore/69-pr5-renovate
```

- [ ] **Step 2: `renovate.json` を書く**

**設計上の要点は 3 つ。**

1. **`minimumReleaseAge` は pnpm 側（7 日）以上**にする。下回らせると Renovate の PR が
   pnpm の検証で弾かれ、**bot の PR が常に赤くなる**
2. **自動マージしない。**取り込みは人が判断する（決定 D7）
3. **グルーピングする。**`pnpm outdated -r` が 20 件を返す現状で 1 件 1 PR にすると溢れる

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "minimumReleaseAge": "7 days",
  "internalChecksFilter": "strict",
  "automerge": false,
  "labels": ["dependencies"],
  "packageRules": [
    { "matchUpdateTypes": ["minor", "patch"], "groupName": "非破壊的な更新" },
    { "matchUpdateTypes": ["major"], "dependencyDashboardApproval": true }
  ]
}
```

**この JSON は出発点であり、着手時に Renovate の現行スキーマで検証すること。**
キー名・既定値は変わりうる。`renovate-config-validator` があれば通す。

> **受け入れ条件との対応を崩さないこと。**スペックの EARS は「minor/patch は PR を自動作成」
> 「major は Dependency Dashboard に提示（PR 作成は人の承認を待つ）」と 2 つに分けている。
> 上の `packageRules` はこの 2 文にそのまま対応する。**片方だけ変えると受け入れ条件と
> 食い違う**ので、設定を変えるならスペックの EARS も同時に直す。

- [ ] **Step 3: GitHub App を有効化する（手動・利用者の操作）**

**設定ファイルのコミットだけでは Renovate は動かない。**リポジトリ管理者が
GitHub App を有効化する必要がある。

- [ ] この手順は**計画の実行者ではなく利用者に依頼する**。勝手に外部サービスへ接続しない
- [ ] 有効化後、Renovate が **Dependency Dashboard の Issue を立てる**ことを確認する
- [ ] 手順と、有効化が必要である事実を `docs/guides/development.md` に書く

- [ ] **Step 4: 動作を確認する（DoD 5）**

**「設定を置いた」で完了としない。**次を目で見る。

1. Renovate が **PR を実際に立てた**こと
2. その PR の **CI が緑**であること（＝ Renovate と pnpm の待機期間が矛盾していない証拠）
3. **7 日未満の版が提案されていない**こと

3 が確認できない場合、Renovate 側の待機期間設定が効いていない。設定を直してから閉じる。

> Renovate の初回スキャンには時間がかかる。**この PR のマージ後にしか確認できない**ので、
> 確認結果は #69 のクローズ前に Issue へコメントとして残す。

- [ ] **Step 5: ADR 0008 に決定 D5〜D7 を追記する**

Renovate を選んだ理由（グルーピングの表現力）、Dependabot を却下した理由、
**bot 側 ≧ pnpm 側**という待機期間の関係、自動マージしない理由を書く。

- [ ] **Step 6: 検証**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

- [ ] **Step 7: PR を出す**

`chore: Renovate による依存の自動更新を導入する（#69）`。

---

### Task 6: #69 の締め

- [ ] **Step 1: 完了条件を 1 つずつ突き合わせる**

スペックの「受け入れ条件（EARS）」を上から確認し、**証拠（コマンド出力・CI の URL・画面）を
Issue へコメントする。**

| 条件 | 証拠 |
|---|---|
| 公開直後の版が仕組みとして取り込まれない | PR-1 Step 9 の実行結果 |
| 設定を消すと取り込まれる | 同上 |
| 更新の提案が自動で上がってくる | PR-5 Step 4 の Renovate PR |
| `pnpm audit` が 0 件 | PR-2 Step 8 |
| high 以上で CI が落ちる | PR-3 Step 4 の赤い CI の URL |
| moderate 以下では CI が落ちない | PR-3 Step 5 の緑の CI の URL とログ断片 |
| 例外手順が効く | PR-1 Step 10 の演習結果 |
| 全タスク緑 | `pnpm turbo test typecheck lint build` |

- [ ] **Step 2: Issue 本文の事実誤認を訂正し、EARS 受け入れ条件を転記する**

**Issue #69 本文には実測と食い違う記載が 5 点ある**（脆弱性 0 件 / 陳腐化 3 件 / `.npmrc` /
`onlyBuiltDependencies` / `docs/BACKLOG.md`）。**後から読む人が誤情報を引かないよう、
訂正をコメントで残す。**本文の書き換えは行わず、コメントで追記する（記録を消さない）。

**あわせてスペックの「受け入れ条件（EARS）」を同じコメントへ転記する。**憲法 原則 VIII は
「要求は Issue（EARS 記法）に記録する（MUST）」と定めており、要求の正本は Issue 側にある。

- [ ] **Step 3: 振り返りを書く（ADR 0003 決定 4）**

`docs/retrospectives/2026-XX-XX-issue-69-supply-chain.md`。型は
[`docs/guides/retrospective.md`](../../guides/retrospective.md)。最低限、次を含める。

- **Issue 本文の前提を実測で叩いた結果、5 点が誤りだった**こと（#68 に続き 2 度目）
- **`node_modules` が最新だと供給網検証が短絡する**という観測の罠を踏んだこと
- 待機期間の日数を「防御の厚さ」ではなく**導入コストの実測**（違反件数）で決めたこと
- **自分の設計文書 3 本に同じ表を転記した結果、メジャー更新の件数が三者で食い違った**こと。
  憲法 原則 VIII「二重正本を作らない」は他人の文書だけでなく自分の成果物にも効く
- **`pnpm outdated` をルートだけで見て実行時依存 4 件を取りこぼした**こと。
  monorepo では `-r` を付けないと「全体を見た」ことにならない
- **日付が進むと前提が崩れる記述**（「今日入れると修正版も掴めない」）を書いてしまい、
  1 日で成立しなくなったこと。破壊検証の対象を版で決め打ちすると同じ形で腐る

- [ ] **Step 4: 申し送りを反映する**

- [ ] #70 へコメント: `pnpm audit` の CI 組み込みは #69 で完了。PR / Issue テンプレートは #68 で完了
- [ ] #71 へコメント: `.specify/feature.json` が実在しない `specs/001-planning-poker-mvp` を指しており、`setup-plan.sh` が空の `specs/` を作ってしまう
- [ ] メジャー更新 12 件の Issue（PR-4 Step 4 で作成）を epic #67 に紐づける
- [ ] `trustPolicy: no-downgrade` の採否を別 Issue として起票する

- [ ] **Step 5: #69 をクローズする**

**本番デプロイは行わない**（#66 で別途まとめて実施）。
