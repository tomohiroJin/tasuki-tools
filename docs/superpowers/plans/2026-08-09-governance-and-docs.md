# 規範と文書体系（#68）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** #68 の決定（三層の文書体系・全体憲法・ADR 6 本・ガイド 5 本・テンプレート・README 再編・BACKLOG 解体）を PR 6 本で実装する。

**Architecture:** 変更頻度で層を分けた三層構造（憲法 = 薄い骨子 / ADR = 決定の不変記録 / ガイド = 育つ手引き）。AI の入口は AGENTS.md 1 本に絞る。正本スペック: `docs/superpowers/specs/2026-08-09-governance-and-docs-design.md`。

**Tech Stack:** Markdown のみ。検証は grep / 一時リンクチェッカー（Node）/ `pnpm test`。PR 操作は `gh`。

## Global Constraints

- **アプリケーションコード（`apps/` `packages/` `e2e/` `scripts/` の実装・テスト）は 1 行も変更しない**（#68 完了条件。適用は #72）
- **利用者から見える振る舞いを変えない**（epic #67 の全体制約）
- 作業は `/home/vscode/tasuki-work`（overlay）で行う。`/workspaces` 側では作業しない
- PR は直列。**前の PR がマージされてから次のブランチを main から切る**。`gh pr merge` に `--delete-branch` を付けない
- **憲法原則 III・IV の意味を保存する**（コード内参照 7 箇所: III=1・IV=6。突き合わせ表が PR-2 の必須成果物）
- 文書はすべて日本語。コミットメッセージは Conventional Commits（type: 日本語説明）
- 各 PR で `corepack pnpm test` 全緑を確認する（docs のみの変更でも回す）
- リンクチェッカーは**恒久追加しない**（#70 へ申し送り）。一時スクリプトは scratchpad に置きコミットしない

## 共通手順（各 PR で使う）

**リンク検査**（一時スクリプト。`$SCRATCH` は scratchpad ディレクトリ）:

```bash
cat > $SCRATCH/check-links.mjs <<'EOF'
// 引数の md ファイル群から相対リンク（http 以外・#アンカー除去）を集め、実在を確かめる
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
let bad = 0;
for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = m[1].split("#")[0].trim();
    if (!target || /^(https?|mailto):/.test(m[1])) continue;
    const p = resolve(dirname(file), target);
    if (!existsSync(p)) { console.log(`BROKEN: ${file} -> ${m[1]}`); bad++; }
  }
}
console.log(bad === 0 ? "OK" : `${bad} broken`); process.exit(bad === 0 ? 0 : 1);
EOF
```

**検査を壊して確かめる**（初回の PR-1 で 1 度だけ）: 実在しないリンク `[x](no-such-file.md)` を一時的に対象ファイルへ書き込み、チェッカーが `BROKEN` で exit 1 することを見てから戻す。

**PR 作成**: `gh pr create --title "<type>: <題名>" --body` で概要 / 変更内容 / テスト方法（実行した検証コマンド）を書く。本文末尾に `Refs #68`。

**PR 作成前の敵対的検証**（スペックの検証方法 5）: ① その PR の文書内の主張（件数・パス・実測値）をコマンドで裏取りする ② 「この文書の規則で判断に迷う実例」を最低 1 つ挙げ、規則側に不足があれば直してから出す。

---

### Task 1: PR-1 — ADR テンプレートと ADR 0002（文書体系の三層構造）

**Files:**
- Create: `docs/adr/template.md`
- Create: `docs/adr/0002-document-system-three-layers.md`

**Interfaces:**
- Produces: ADR 0002 が宣言する三層の書き分け規則・採番規約・設計文書の置き場。後続の全タスクがこの規則に従う

- [ ] **Step 1: ブランチを切る**

```bash
cd /home/vscode/tasuki-work && git checkout main && git pull && git checkout -b docs/68-pr1-doc-system
```

- [ ] **Step 2: `docs/adr/template.md` を書く**

Michael Nygard 形式。内容:

```markdown
# ADR-NNNN: <タイトル>

- **ステータス**: Proposed | Accepted | Superseded by NNNN
- **日付**: YYYY-MM-DD
- **関連**: <Issue / PR / 関連 ADR>

## 背景

<この決定が必要になった状況。実測・事実を根拠にする>

## 決定

<何をどうすると決めたか。MUST / MUST NOT を明示>

## 影響

<この決定で変わること・受け入れるトレードオフ・適用の時期>
```

- [ ] **Step 3: `docs/adr/0002-document-system-three-layers.md` を書く**

スペック「文書体系 — 三層構造」「ADR — 横断 6 本と昇格」の節を ADR 形式に落とす。必須要素:

- 背景: 判断の拠りどころの分散（timer ADR 10 件 + 横断 0001 / poker 憲法の矛盾条項 / docs/ の混在）。#78 からの申し送り（採番規約）。timer ADR 0010 の宣言と現行運用の乖離（`docs/superpowers/` に新規作成が続いている実態）
- 決定 1 — 三層: 憲法（何を守るか・原則 10 本・めったに変えない）/ ADR（なぜ決めたか・追記のみ・覆すときは Superseded）/ ガイド（どう書くか・ADR 改版なしに育ててよい）
- 決定 2 — 書き分け: 決定の中身と根拠 → ADR、手順・例・チェックリスト → ガイド。跨るときは片方に書き他方から参照（二重正本を作らない）。「DoD を運用する」決定は ADR、DoD の項目変更はガイドのみ
- 決定 3 — 採番: 横断は `docs/adr/` で 0001 からの連番、アプリ固有は `docs/<app>/adr/` で独立採番。参照は必ず置き場つき（例: `docs/adr/0005`）
- 決定 4 — 設計文書の置き場: 新規の機能設計文書（spec / plan）は `docs/superpowers/` に日付つきで置く（現行スキル運用の追認）。`docs/plans/` は SDD 期の記録。**本 ADR が timer ADR 0010 の全体向け宣言を置換する**
- 決定 5 — 憲法改版時のチェック項目に AGENTS.md の見出し同期を含める
- 影響: 既存 plans / specs は移動しない（#71 の領分）。コード変更なし

- [ ] **Step 4: リンク検査を壊して確かめてから通す**

```bash
echo '[x](no-such-file.md)' >> docs/adr/0002-document-system-three-layers.md
node $SCRATCH/check-links.mjs docs/adr/template.md docs/adr/0002-document-system-three-layers.md
# Expected: BROKEN ... / exit 1 —— チェッカーが生きていることを確認
git checkout docs/adr/0002-document-system-three-layers.md をせず、追記した 1 行だけを削除して再実行
# Expected: OK / exit 0
```

- [ ] **Step 5: コミット**

```bash
git add docs/adr/template.md docs/adr/0002-document-system-three-layers.md
git commit -m "docs: ADR テンプレートと ADR 0002（文書体系の三層構造）を追加（#68）"
```

### Task 2: PR-1 — 文書地図（docs/README.md）と docs/adr/README.md 更新

**Files:**
- Create: `docs/README.md`
- Modify: `docs/adr/README.md`（#68 申し送り注記の解消・0002 の一覧追加）

**Interfaces:**
- Consumes: ADR 0002 の三層・採番規約
- Produces: `docs/README.md` の目的別入口表。AGENTS.md（Task 4）と README（Task 12）がここへリンクする

- [ ] **Step 1: `docs/README.md` を書く**

内容（スペック「README 再編と文書地図」の節）:

- 冒頭に正本宣言: 規範の正本は「憲法（`.specify/memory/constitution.md`）・横断 ADR（`docs/adr/`）・ガイド（`docs/guides/`）」。機能ごとの設計文書は `docs/superpowers/` に日付つきで置く（現行運用）。`docs/plans/` は SDD 期の記録（`docs/adr/0002` 参照）
- 目的別の入口表:

| 知りたいこと | 行き先 |
|---|---|
| 守るべき原則 | 憲法 |
| なぜそう決まっているか | `docs/adr/`（横断）・`docs/<app>/adr/`（アプリ固有） |
| 今日どう書くか（DoD・EARS・振り返り・アーキテクチャ・開発手順） | `docs/guides/` |
| 機能の設計経緯 | `docs/superpowers/specs/`・`docs/superpowers/plans/` |
| 過去の SDD 記録 | `docs/plans/` |
| timer の実験記録 | `docs/timer/experiments/` |

- 注意: `docs/guides/` は PR-4 で新設されるため、この時点では「(PR-4 で新設)」と注記せず、**リンク先ディレクトリが未存在のままにしない**。対処: `docs/guides/` への行はこの PR では表に入れず、PR-4 で行を追加する

- [ ] **Step 2: `docs/adr/README.md` を更新する**

- 「申し送り（#68 へ）」の段落を「#68 で解消済み。採番規約は `docs/adr/0002` が正本」に差し替える
- 一覧へ 0002 を追加する

- [ ] **Step 3: リンク検査と全テスト**

```bash
node $SCRATCH/check-links.mjs docs/README.md docs/adr/README.md docs/adr/0002-document-system-three-layers.md
# Expected: OK
corepack pnpm test 2>&1 | tail -5   # Expected: 全緑（docs のみの変更で壊れないことの確認）
```

- [ ] **Step 4: コミットして PR-1 を作成**

```bash
git add docs/README.md docs/adr/README.md
git commit -m "docs: 文書地図（docs/README.md）を新設し #78 申し送りを解消（#68）"
git push -u origin docs/68-pr1-doc-system
gh pr create --title "docs: 文書体系の三層構造を確立する（#68 PR-1）" --body "<概要 / 変更内容 / テスト方法>"
```

マージを待つ（利用者確認）。

---

### Task 3: PR-2 — Tasuki 全体憲法への書き直し

**Files:**
- Modify: `.specify/memory/constitution.md`（全面書き直し）

**Interfaces:**
- Consumes: ADR 0002 の三層規則
- Produces: 原則 I〜X。番号 III・IV はコード参照の意味を保存。AGENTS.md（Task 4）が見出しを転記する

- [ ] **Step 1: ブランチを切る**

```bash
git checkout main && git pull && git checkout -b docs/68-pr2-constitution
```

- [ ] **Step 2: 書き直し前に現参照の意味を記録する**

```bash
grep -rn "憲法原則" --include="*.ts" --include="*.tsx" apps packages | tee $SCRATCH/refs-before.txt
# Expected: 7 行（III が 1・IV が 6）。これが突き合わせ表の「参照側」になる
```

- [ ] **Step 3: `.specify/memory/constitution.md` を全面的に書き直す**

構成: 冒頭に Sync Impact Report（HTML コメント・version 1.0.0 → 2.0.0・変更概要）→ 題名「Tasuki Constitution」→ 前文（二本柱: 実用ツール集 / AI 駆動開発の実践場）→ Core Principles I〜X → Governance（改版手続き: 改版は ADR を伴う・AGENTS.md の見出し同期を確認）。

原則はスペックの表のとおり（各原則は見出し + 骨子 2〜5 行 + MUST/MUST NOT）:

- I. テスト駆動開発（NON-NEGOTIABLE）— Red-Green-Refactor。テストより先に実装を書かない（MUST NOT）
- II. 技術選定は ADR を通す — 現行スタック（TypeScript / React / Bun / pnpm / turbo / Vite / Valibot / neverthrow）を基本とし、追加・変更は ADR で記録してから（MUST）
- III. 揮発インメモリと単純運用 — 本番は永続化を持たない。再起動でルームが消える前提で設計する（MUST）。デプロイは束ねて行う
- IV. 境界の型安全 — 外部入力は Valibot で検証し、ドメイン操作は neverthrow の `Result` で返す（MUST）。ドメインは例外を投げない（MUST NOT）。DbC は「事前条件 = 境界検証・不変条件 = 型」で表す
- V. 実画面検証 — テスト緑・typecheck 通過だけで完了と言わない。利用者が通る実経路で確かめる（MUST）
- VI. 依存は内向き — ドメイン（`packages/*-core`）は純粋。I/O・時計・乱数はアダプタに置いて注入する（MUST）。同期サーバーはポート/アダプタ構成を標準とする
- VII. 検査は壊して確かめる — 新しい検査はわざと壊して赤を見る（MUST）。実装を書き換えたら既存テストの恒真化を変異で確かめる（MUST）
- VIII. 記録が正本 — 決定は ADR、要求は Issue（EARS）、教訓は振り返りへ（MUST）。正本は一意（SOT）。契約には単一情報源を宣言する
- IX. 小さく回す — 1 PR = 1 論理変更。DoD を満たしてからマージ（MUST）。デプロイは全工程後に 1 回
- X. 抽象は実需で — 利用者が 1 つのものを抽出しない。20 行未満は抽出しない。パターンは変更容易性のためだけに採る

旧憲法から消えるもの: 「既存の timer には手を入れない（MUST NOT）」「3 パッケージ構成」「技術スタックの固定」。これらは背景ごと Sync Impact Report に記す。

- [ ] **Step 4: 突き合わせ表を作って検証する**

`$SCRATCH/refs-before.txt` の 7 行それぞれについて「参照コメントの意図 → 新憲法の該当原則 → 意味が一致するか」の表を作り、PR 本文に貼る。判定基準: III の参照（揮発インメモリ）が新 III に、IV の参照（Valibot / Result / 境界検証）が新 IV に、**文言の変更なしで**意味が通ること。

```bash
grep -rn "憲法原則" --include="*.ts" --include="*.tsx" apps packages | diff - $SCRATCH/refs-before.txt
# Expected: 差分なし（コードに触れていないことの証明）
grep -rn "constitution" .specify/templates/*.md
# Expected: Constitution Check は「[Gates determined based on constitution file]」の動的参照のみで、
# 旧憲法の条項名・原則名への静的な参照が無いこと（あれば書き直しに追従させる）
```

- [ ] **Step 5: コミット**

```bash
git add .specify/memory/constitution.md
git commit -m "docs: poker MVP 憲法を Tasuki 全体憲法へ書き直す（#68）"
```

### Task 4: PR-2 — AGENTS.md と CLAUDE.md

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`

**Interfaces:**
- Consumes: 憲法 I〜X の見出し・`docs/README.md` の入口表
- Produces: AI が毎セッション読む入口。README（Task 12）からもリンクする

- [ ] **Step 1: `AGENTS.md` を書く**

1 画面（80 行以内）に収める。構成:

```markdown
# Tasuki — AI エージェント向けガイド

<二本柱 2 行: 実用ツール集 / AI 駆動開発の実践場>

## 絶対規則

<憲法 I〜X の見出しのみを列挙。正本は `.specify/memory/constitution.md` と明記>

### AI 運用規則
- 本番デプロイ（deploy.sh / systemctl / Caddy reload）は明示指示を待つ
- テスト・検査はコンテナ native の FS で回す（9p マウント上で回さない）
- 起動した dev サーバーは使い終わったら止める（ss -tlnp で確認）

## 文書地図

<憲法 / ADR / ガイド / 設計文書の 1 行ずつ + docs/README.md へのリンク>

## 基本コマンド

pnpm test / pnpm e2e / node scripts/audit-structure.mjs / node scripts/mutation-check.mjs
```

- [ ] **Step 2: `CLAUDE.md` を書く**

```markdown
# CLAUDE.md

このリポジトリの決めごとは [AGENTS.md](AGENTS.md) を読んでください。正本はそちらです。
```

- [ ] **Step 3: 検証（見出し同期・リンク・全テスト）**

```bash
grep -c "^### " .specify/memory/constitution.md   # 原則数を確認（10 のはず）
# AGENTS.md の絶対規則の列挙が憲法の見出し 10 本と一致することを目視で突き合わせる
node $SCRATCH/check-links.mjs AGENTS.md CLAUDE.md
corepack pnpm test 2>&1 | tail -5   # Expected: 全緑
```

- [ ] **Step 4: コミットして PR-2 を作成**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: AI エージェントの入口 AGENTS.md / CLAUDE.md を新設（#68）"
git push -u origin docs/68-pr2-constitution
gh pr create --title "docs: Tasuki 全体憲法と AI の入口を確立する（#68 PR-2）" --body "<概要 / 変更内容（突き合わせ表を含む） / テスト方法>"
```

---

### Task 5: PR-3 — ADR 0003（アジャイル運用）と 0004（ポート/アダプタ標準）

**Files:**
- Create: `docs/adr/0003-agile-operations.md`
- Create: `docs/adr/0004-sync-server-ports-and-adapters.md`

**Interfaces:**
- Consumes: `docs/adr/template.md` の形式
- Produces: 0003 はガイド（Task 8〜9）と .github テンプレート（Task 11）の根拠。0004 は #72 の作業指針

- [ ] **Step 1: ブランチを切る**

```bash
git checkout main && git pull && git checkout -b docs/68-pr3-adrs
```

- [ ] **Step 2: `docs/adr/0003-agile-operations.md` を書く**

- 背景: ソロ + AI の体制。BACKLOG.md と Issues の二重管理。振り返りが AI のメモリにしか残らない
- 決定: ① DoD を全 Issue / PR に適用（項目の正本はガイド）② 機能系 Issue の「振る舞い」節は EARS で書く ③ バックログは GitHub Issues に一本化（BACKLOG.md は廃止）④ epic・大きめ Issue の完了時に振り返りを `docs/retrospectives/` へ記録 ⑤ スプリントは設けない
- 影響: `.github` テンプレート新設（PR-4）・BACKLOG 解体（PR-6）

- [ ] **Step 3: `docs/adr/0004-sync-server-ports-and-adapters.md` を書く**

- 背景: timer-sync は `adapters/application/ports`、poker-sync は `config.ts / rooms.ts / server.ts` のモジュール関数で非対称（2026-08-09 実測）
- 決定: 同期サーバーは timer-sync 型（ポート/アダプタ）を標準とする。根拠: テスト時にアダプタを差し替えられることが実 WS 試験（#80）で効いた。配線は 1 箇所（`create-sync-server.ts` 型）に集める
- 影響: poker-sync の再編は #72 で行う。**本 ADR 時点ではコードを変更しない**

- [ ] **Step 4: コミット**

```bash
git add docs/adr/0003-agile-operations.md docs/adr/0004-sync-server-ports-and-adapters.md
git commit -m "docs: ADR 0003（アジャイル運用）と 0004（同期サーバー標準）を追加（#68）"
```

### Task 6: PR-3 — ADR 0005・0006・0007（昇格 2 本と抽象基準）

**Files:**
- Create: `docs/adr/0005-result-and-boundary-validation.md`
- Create: `docs/adr/0006-test-conventions.md`
- Create: `docs/adr/0007-abstraction-criteria.md`

**Interfaces:**
- Consumes: timer ADR 0006 / 0009 の本文（昇格元）
- Produces: 0005 / 0006 は憲法 IV / VII の根拠。0007 は憲法 X の根拠

- [ ] **Step 1: `docs/adr/0005-result-and-boundary-validation.md` を書く**

timer ADR 0006 の決定を全体へ昇格: 外部入力は Valibot、ドメイン操作は neverthrow の `Result`、ドメインは例外を投げない。実測（neverthrow 6 / valibot 5 パッケージで利用済み・`packages/poker-core/src/protocol.ts:1` の SOT 宣言）を背景に記す。timer 固有の詳細は `docs/timer/adr/0006` が引き続き持つことを関連に明記。

- [ ] **Step 2: `docs/adr/0006-test-conventions.md` を書く**

timer ADR 0009 の決定を全体へ昇格し、運用実績を加える: ① TDD（テスト先行）② Given/When/Then 構造（構造監査 SC032 が機械的に検査。実測 97.3%）③ 新しい検査はわざと壊して赤を見る ④ 実装を書き換えたら変異で恒真化を確かめる（#62・#64 で 2 回踏んだ実績を背景に）。

- [ ] **Step 3: `docs/adr/0007-abstraction-criteria.md` を書く**

- 背景: #20 で「20 行に満たないなら抽出しない」を適用し sync-kit の抽出を見送った（`docs/superpowers/plans/2026-08-05-bun-test-migration.md`）。`packages/ui` から伏せ札の裏模様を外した判断
- 決定: ① 利用者が 1 つしかないものを将来のために抽出しない ② 20 行未満の重複は抽出しない ③ デザインパターンは変更容易性を得るためだけに採る（過剰適用を避ける）
- 影響: DRY は「知識の重複」に限って適用する

- [ ] **Step 4: コミット**

```bash
git add docs/adr/0005-result-and-boundary-validation.md docs/adr/0006-test-conventions.md docs/adr/0007-abstraction-criteria.md
git commit -m "docs: ADR 0005〜0007（型安全境界・テスト規約・抽象基準）を追加（#68）"
```

### Task 7: PR-3 — timer ADR への昇格注記と一覧更新

**Files:**
- Modify: `docs/timer/adr/0006-result-and-boundary-validation.md`（先頭に注記）
- Modify: `docs/timer/adr/0009-test-conventions.md`（先頭に注記）
- Modify: `docs/timer/adr/0010-design-doc-source.md`（先頭に注記）
- Modify: `docs/adr/README.md`（0003〜0007 を一覧へ追加）

**Interfaces:**
- Consumes: 横断 0002 / 0005 / 0006 の存在
- Produces: timer 側から後継への一方向リンク

- [ ] **Step 1: timer ADR 3 本の先頭（ステータス行の直後）に注記を足す**

0006: `> **昇格**: 全体標準としては [docs/adr/0005](../../adr/0005-result-and-boundary-validation.md) が後継。timer 固有の詳細は本文のまま有効。`
0009: 同形式で `docs/adr/0006` を指す。
0010: `> **置換**: 設計文書の置き場の全体宣言は [docs/adr/0002](../../adr/0002-document-system-three-layers.md) が後継（横断 ADR の置き場が無かった時期に全体向けの宣言をここで行っていた）。`

**本文はいっさい変更しない。**

- [ ] **Step 2: `docs/adr/README.md` の一覧へ 0003〜0007 を追加する**

- [ ] **Step 3: 検証**

```bash
node $SCRATCH/check-links.mjs docs/adr/*.md docs/timer/adr/0006-result-and-boundary-validation.md docs/timer/adr/0009-test-conventions.md docs/timer/adr/0010-design-doc-source.md
corepack pnpm test 2>&1 | tail -5   # Expected: 全緑
```

- [ ] **Step 4: コミットして PR-3 を作成**

```bash
git add docs/timer/adr docs/adr/README.md
git commit -m "docs: timer ADR 0006/0009/0010 へ昇格・置換の注記を追加（#68）"
git push -u origin docs/68-pr3-adrs
gh pr create --title "docs: 横断 ADR 0003〜0007 と昇格注記を追加する（#68 PR-3）" --body "<概要 / 変更内容 / テスト方法>"
```

---

### Task 8: PR-4 — ガイド: DoD と EARS

**Files:**
- Create: `docs/guides/definition-of-done.md`
- Create: `docs/guides/ears-writing.md`

**Interfaces:**
- Consumes: ADR 0003 の決定
- Produces: DoD 8 項目（PR テンプレート Task 11 が転記）・EARS 5 型の書式（Issue テンプレート Task 11 が参照）

- [ ] **Step 1: ブランチを切る**

```bash
git checkout main && git pull && git checkout -b docs/68-pr4-guides-templates
```

- [ ] **Step 2: `docs/guides/definition-of-done.md` を書く**

チェックリスト 8 項目（正本はここ。根拠は `docs/adr/0003`）:

```markdown
1. [ ] テストを先に書き、ユニットテストが揃って全緑（`pnpm test`）
2. [ ] 利用者の通る経路が変わる変更では、必要な E2E テストを作成した（`pnpm e2e`）
3. [ ] 新しく足した検査は、わざと壊して赤くなることを確認した
4. [ ] 実装を書き換えた場合、既存テストが恒真化していないか変異で確認した
5. [ ] 実経路で動作を確認した（実画面または実プロトコル）
6. [ ] リファクタリングを実施した（Tidy First: 実装に先立つ整地、または実装後の
       後片づけ。大きな整理は別出しの Issue / PR として明示した）
7. [ ] 文書（README / ADR / ガイド）への影響を反映した
8. [ ] Issue の完了条件を満たした
```

各項目に 1〜2 行の補足（何をもって満たしたとするか・文書のみの変更など該当しない場合は「該当なし」と明記してよいこと）を付ける。

- [ ] **Step 3: `docs/guides/ears-writing.md` を書く**

EARS 5 型の日本語テンプレと Tasuki の実例（機能系 Issue の「振る舞い」節で使う）:

| 型 | テンプレ | Tasuki の実例 |
|---|---|---|
| ユビキタス | システムは、常に〈応答〉すること | システムは、常にルームコードを 6 文字で表示すること |
| イベント駆動 | 〈トリガ〉のとき、システムは〈応答〉すること | タイマーが 0 になったとき、システムは交代通知を表示すること |
| 状態駆動 | 〈状態〉の間、システムは〈応答〉すること | 投票中の間、システムは各参加者の選択値を伏せて表示すること |
| オプション | 〈機能〉を備える場合、システムは〈応答〉すること | 読み上げを備える場合、システムは残り 10 秒から 1 秒ごとに読み上げること |
| 望まれない振る舞い | 〈好ましくない条件〉の場合、システムは〈応答〉すること | 不正なメッセージを受信した場合、システムはそのフレームを無視し切断しないこと |

書き方の注意: 1 文 1 要求・受動態を避ける・計測できる語を使う。

- [ ] **Step 4: コミット**

```bash
git add docs/guides/definition-of-done.md docs/guides/ears-writing.md
git commit -m "docs: DoD と EARS 記法のガイドを追加（#68）"
```

### Task 9: PR-4 — ガイド: 振り返りとアーキテクチャ

**Files:**
- Create: `docs/guides/retrospective.md`
- Create: `docs/guides/architecture.md`
- Create: `docs/retrospectives/.gitkeep`

**Interfaces:**
- Consumes: ADR 0003（振り返りの決定）・ADR 0004（ポート/アダプタ標準）・憲法 VI
- Produces: 振り返りの 3 部構成・層の対応表と判断フロー・用語集

- [ ] **Step 1: `docs/guides/retrospective.md` を書く**

- いつ: epic または大きめ Issue の完了時
- どこへ: `docs/retrospectives/YYYY-MM-DD-<topic>.md`
- 型（3 部構成）: ① 踏んだ罠（事実と再発条件）② 検査の穴（緑のまま壊れていたものは何か・なぜ緑だったか）③ 次への申し送り（どの文書・Issue に反映したか）
- 書き方: 事実 → 原因 → 対処の順。感想ではなく再発防止に使える形で

- [ ] **Step 2: `docs/guides/architecture.md` を書く**

- 層とディレクトリの対応表:

| 層 | 置き場 | 依存してよいもの |
|---|---|---|
| ドメイン | `packages/timer-core` `packages/poker-core` | なし（純粋関数と型のみ） |
| プロトコル契約 | `packages/protocol`・各 core の `protocol.ts` | ドメインの型 |
| アプリケーション | `apps/*-sync/src/application` | ドメイン・ポート |
| ポート | `apps/*-sync/src/ports` | ドメインの型 |
| アダプタ | `apps/*-sync/src/adapters`・`apps/*-web` | 上のすべて |
| UI 資産 | `packages/ui` | なし（CSS トークンと静的資産） |

- 判断フロー: 「I/O・時計・乱数に触るか？ → アダプタ」「複数アプリで使う純粋ロジックか？ → core。ただし ADR 0007 の抽出基準を先に確認」「メッセージの形か？ → protocol（契約の単一情報源）」
- 注記: poker-sync は現在モジュール関数中心で、標準形への再編は #72（`docs/adr/0004`）
- ユビキタス言語の用語集（初期は最小限・育てる）: ルーム / 参加者 / ホスト / ドライバー（timer: 現在の運転者）/ 交代 / ラウンド（poker: 1 テーマの投票）/ 公開（reveal）/ お題（timer: TDD の練習課題。poker: 見積り対象。**同名別概念**につき文脈を明記する）

- [ ] **Step 3: コミット**

```bash
git add docs/guides/retrospective.md docs/guides/architecture.md docs/retrospectives/.gitkeep
git commit -m "docs: 振り返りとアーキテクチャのガイドを追加（#68）"
```

### Task 10: PR-4 — ガイド: 開発手順（README からの移設先）

**Files:**
- Create: `docs/guides/development.md`

**Interfaces:**
- Consumes: 現 README の「起動方法」「開発」節の内容（README 側の削除は Task 12 / PR-5）
- Produces: 起動・検査の詳細手順。README（Task 12）がここへリンクする

- [ ] **Step 1: `docs/guides/development.md` を書く**

現 README から**内容を複製して**整理（README 側はまだ触らない。削除は PR-5）:

- 前提(Node 22+ / pnpm 11.5+ / Bun)
- まとめて起動（`pnpm dev`・入口は 5175・ポート表・古いプロセスの確認 `ss -tlnp | grep -E ':(8787|3311|517[3-5])'`）
- 個別起動
- テスト（`pnpm test`・タスク構成・9p 上で回さないこと）
- E2E（`pnpm e2e`・`pnpm dev` と同時に走らせられない・残骸の掃除）
- 検査系（構造監査・変異検査・作業ツリーが汚れていると変異検査は実行できない）

- [ ] **Step 2: 検証**

```bash
node $SCRATCH/check-links.mjs docs/guides/*.md
corepack pnpm test 2>&1 | tail -5   # Expected: 全緑
```

- [ ] **Step 3: コミット**

```bash
git add docs/guides/development.md
git commit -m "docs: 開発手順ガイドを追加（README 移設の受け皿）（#68）"
```

### Task 11: PR-4 — .github テンプレートと文書地図の更新

**Files:**
- Create: `.github/ISSUE_TEMPLATE/feature.md`
- Create: `.github/ISSUE_TEMPLATE/task.md`
- Create: `.github/pull_request_template.md`
- Modify: `docs/README.md`（`docs/guides/` の行を入口表へ追加）

**Interfaces:**
- Consumes: DoD 8 項目（Task 8）・EARS 書式（Task 8）
- Produces: Issue / PR の入力形式

- [ ] **Step 1: `feature.md`（機能系 Issue）を書く**

```markdown
---
name: 機能
about: 機能の追加・変更
---

## 背景

<なぜ必要か。実測・事実を添える>

## 振る舞い（EARS）

<docs/guides/ears-writing.md の 5 型で書く。例:
- 〈トリガ〉のとき、システムは〈応答〉すること>

## 完了条件

- [ ] <検証可能な条件>
- [ ] DoD（docs/guides/definition-of-done.md）を満たす

## スコープ外

<やらないことを明示>
```

- [ ] **Step 2: `task.md`（作業系 Issue）を書く**

```markdown
---
name: 作業
about: 調査・整備・chore
---

## 背景

## やること

- [ ]

## 完了条件

- [ ]
```

- [ ] **Step 3: `pull_request_template.md` を書く**

概要 / 変更内容 / テスト方法 + DoD 8 項目のチェックリスト（`docs/guides/definition-of-done.md` から転記。「正本はガイド」と注記）。

- [ ] **Step 4: `docs/README.md` の入口表へ guides の行を追加**

- [ ] **Step 5: 検証・コミット・PR-4 作成**

```bash
node $SCRATCH/check-links.mjs docs/README.md .github/pull_request_template.md .github/ISSUE_TEMPLATE/*.md
corepack pnpm test 2>&1 | tail -5
git add .github docs/README.md
git commit -m "docs: Issue / PR テンプレートを追加し文書地図を更新（#68）"
git push -u origin docs/68-pr4-guides-templates
gh pr create --title "docs: ガイド 5 本と Issue/PR テンプレートを追加する（#68 PR-4）" --body "<概要 / 変更内容 / テスト方法>"
```

---

### Task 12: PR-5 — README 二部構成への再編

**Files:**
- Modify: `README.md`（全面再編）

**Interfaces:**
- Consumes: `docs/guides/development.md`（詳細の移設先）・`docs/README.md`（文書地図）・`AGENTS.md`
- Produces: 二部構成の README

- [ ] **Step 1: ブランチを切る**

```bash
git checkout main && git pull && git checkout -b docs/68-pr5-readme
```

- [ ] **Step 2: `README.md` を再編する**

- **前半（訪問者向け）**: 冒頭に二本柱の宣言（実用ツール集 / AI 駆動開発の実践場。各 1〜2 文）→ 収録ツール 3 つ（現内容を維持）→ ライブデモ
- **後半（開発の入口）**: クイックスタート（前提 + `pnpm i` + `pnpm dev` + `pnpm test` のみ）→ 文書への案内（`AGENTS.md` / `docs/README.md` / `docs/guides/development.md` への 3 リンク）→ 技術スタック・ステータス（現内容を維持）
- **削除するもの**: 個別起動・ポート表・検査の詳細・「検査はコンテナの FS 上で」節（→ `docs/guides/development.md` が受け皿。移設済みを確認してから削除）
- **`docs/BACKLOG.md` へのリンク（現 186 行目）を「バックログは GitHub Issues」に差し替える**（PR-6 の削除に先行して導線を消す）

- [ ] **Step 3: 移設漏れの確認**

README から削除した各節見出しについて、`docs/guides/development.md` に対応する内容があることを 1 対 1 で突き合わせる（表にして PR 本文へ）。

- [ ] **Step 4: 検証・コミット・PR-5 作成**

```bash
node $SCRATCH/check-links.mjs README.md
corepack pnpm test 2>&1 | tail -5
git add README.md
git commit -m "docs: README を二部構成（訪問者向け / 開発の入口）へ再編（#68）"
git push -u origin docs/68-pr5-readme
gh pr create --title "docs: README を二部構成へ再編する（#68 PR-5）" --body "<概要 / 変更内容（移設対応表） / テスト方法>"
```

---

### Task 13: PR-6 — BACKLOG.md の解体

**Files:**
- Modify: `deploy/README.md`（方針・運用メモの受け入れ）
- Delete: `docs/BACKLOG.md`

**Interfaces:**
- Consumes: ADR 0003（バックログ一本化の決定）
- Produces: 生存タスクの Issue 化と移行対応表

- [ ] **Step 1: ブランチを切る**

```bash
git checkout main && git pull && git checkout -b docs/68-pr6-backlog
```

- [ ] **Step 2: 生存タスク 3 件を処理する**

1. 「メジャー依存の更新（保留）」→ **新 Issue は作らない**。#69（B: 依存の最新化）へ BACKLOG の据え置き理由（React 19 / Tailwind 4 / TS 6 / vite 7 の各リスク）をコメントで転記
2. 「IP 単位のレート制限（L-1）」→ `gh issue create` で作業系 Issue に（本文は BACKLOG の記述を EARS ではなく作業系テンプレの形で移す。ufw connlimit 案 ~80/IP を含める）
3. 「`127.0.0.1:42179` の所有プロセス特定」→ 同上で作業系 Issue に

「その他・既知の残件」節は 1 件ずつ読み、対応済みなら移さない・未対応なら Issue 化する（実施時に判断し、対応表に判断理由を書く）。

- [ ] **Step 3: 方針・運用メモを `deploy/README.md` へ移設する**

- 「公開範囲の方針（重要）」→ 移設時に現状へ直す: 「#15〜#20 完了後に」の記述は古い（monorepo 統合は完了済み）。「poker の公開は #66 で行う」に更新。二重の歯止め（deploy.sh のアプリ単位指定・Caddy 断片未設置）の記述は維持
- 「デプロイ運用メモ（再掲）」→ `deploy/README.md` の既存内容と突き合わせ、**重複しない差分だけ**を移す（二重正本を作らない）

- [ ] **Step 4: `docs/BACKLOG.md` を削除し、参照が残っていないことを確認する**

```bash
git rm docs/BACKLOG.md
grep -rn "BACKLOG" README.md docs/README.md AGENTS.md CLAUDE.md .github 2>/dev/null
# Expected: ヒットなし（歴史的記録 docs/plans/ 等のヒットは可。生きた導線が無いことを確認）
```

- [ ] **Step 5: 検証・コミット・PR-6 作成**

```bash
node $SCRATCH/check-links.mjs deploy/README.md
corepack pnpm test 2>&1 | tail -5
git add deploy/README.md
git commit -m "docs: BACKLOG.md を解体し Issues と deploy/README.md へ移す（#68）"
git push -u origin docs/68-pr6-backlog
gh pr create --title "docs: バックログを GitHub Issues へ一本化する（#68 PR-6）" --body "<概要 / 移行対応表（項目 → 行き先 → 判断理由） / テスト方法>"
```

---

### Task 14: 締め — #68 のクローズ準備

- [ ] **Step 1: 完了条件を 1 つずつ検証する**

- 「決定が ADR として記録され正本が一意」→ `docs/adr/0002〜0007` と `docs/README.md` の存在
- 「コード内参照が壊れていない」→ PR-2 の突き合わせ表
- 「docs/ の入口から目的別に到達できる」→ `docs/README.md` の入口表の各リンクを実際に辿る
- 「コードは変更しない」→ `git log main --oneline --stat` で `apps/` `packages/` `e2e/` `scripts/` に変更が無いことを確認

- [ ] **Step 2: #68 に完了コメントを書く**

Issue のチェックボックス（決めること 1〜5・完了条件）それぞれに「どの成果物で満たしたか」を対応づけたコメントを `gh issue comment 68` で残し、クローズは利用者に確認してから行う。

- [ ] **Step 3: 振り返りを書く（新運用の初回実践）**

`docs/retrospectives/<実施日 YYYY-MM-DD>-issue-68-governance.md` を 3 部構成で書き、軽量 PR として出す（これ自体が ADR 0003 の運用の初回実践になる）。
