# PR の粒度を定める — 実装計画

> **エージェント作業者へ:** 本計画は superpowers:subagent-driven-development または
> superpowers:executing-plans でタスク単位に実施する。手順は `- [ ]` で追跡する。

**Goal:** 「1 つの論理的変更」の粒度を「既定は 1 Issue = 1 PR」として成文化し、判断基準の正本を
ガイドに置く。憲法・ADR・ガイドの三層に、それぞれの役割の分だけ書く。

**Architecture:** DoD と同じ書き分け（`docs/adr/0002` 決定 2）を採る。憲法は正本の指し先だけを
持ち、決定そのものは ADR 0013、判断基準と実例集はガイドが正本。以後の粒度の見直しは
ガイドの更新だけで済み、憲法と ADR の改版が不要になる。

**Tech Stack:** Markdown のみ。検査は `node scripts/check-links.mjs`。CI は docs ジョブ。

**Spec:** `docs/superpowers/specs/2026-08-14-pr-granularity-design.md`（324 行・敵対的検証済み）

## Global Constraints

- **ブランチは `docs/119-pr-granularity`。PR は 1 本にまとめる**（本決定の自己適用。spec §5）
- **憲法 原則 IX の MUST は 3 つあるが、触るのは 1 つ目だけ。** 2 つ目（DoD）・3 つ目
  （デプロイはまとめて 1 回）は変更しない
- **二重正本を作らない**（`docs/adr/0002` 決定 2）。**実例表の正本はガイド**。ADR には
  数値表を載せず、決定の根拠となる事実の要約までとする
- **数値の正本は spec §2.1。** 本計画・タスクは spec から引用し、数値を転記して二重管理にしない
- **semver は 2.1.1 → 2.1.2（PATCH）。** 判断理由と、MINOR と読む余地があることを
  Sync Impact Report に明記する
- **`check-links` は git 追跡下のファイルしか走査しない。** 新規文書は `git add` してから
  検査する（spec §4.5）
- **検査は対照実行を先に行う。** 壊して赤を見る前に、壊さず緑になることを確認する

## Constitution Check

憲法 Governance の MUST「すべての plan は Constitution Check ゲートを通過しなければならない」に
従う。`docs/superpowers/` の既存 plan でこれを持つものは 4 件しかなく、**この MUST は実運用で
空文化している**（spec §4.3。#135 への申し送り候補）。本計画は憲法を改版する作業なので、
自分の計画が同じ MUST を踏み外さないようにここで通す。

| 原則 | 該当 | 判定 |
|---|---|---|
| I. テスト駆動開発 | 文書のみ。コードなし | 逸脱なし（検査の対照実行と破壊検証で代替） |
| II. 技術選定は ADR を通す | ADR 0013 を新設する | 順守 |
| III. 揮発インメモリと単純運用 | 非該当 | — |
| IV. 境界の型安全 | 非該当 | — |
| V. 実画面検証 | 利用者の経路は変わらない | 非該当 |
| VI. 依存は内向き | 非該当 | — |
| VII. 検査は壊して確かめる | `check-links` の破壊検証を Task 1・Task 3 で行う | 順守 |
| VIII. 記録が正本 | 決定を ADR、基準をガイド、指し先を憲法へ記録する | 順守 |
| IX. 小さく回す | **本作業の対象**。PR 1 本で出す（自己適用） | 順守 |
| X. 抽象は実需で | 新しい抽象を作らない | 順守 |
| XI. 秘密と個人情報を持ち込まない | 秘密・個人情報を扱わない | 非該当 |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## ファイル構成

### 新規作成

| ファイル | 責務 |
|---|---|
| `docs/guides/pr-granularity.md` | 粒度の判断基準と実例集の**正本**。育て続ける |
| `docs/adr/0013-pr-granularity.md` | 「既定は 1 Issue = 1 PR」という**決定そのもの**と根拠 |
| `docs/retrospectives/2026-08-14-issue-119-pr-granularity.md` | 振り返り（`docs/adr/0003` 決定 4） |

### 変更

| ファイル | 変更内容 |
|---|---|
| `.specify/memory/constitution.md` | 原則 IX ① に正本の指し先を追記。版 2.1.2。Sync Impact Report 追記 |
| `docs/README.md:24` | ガイドの列挙に「PR の粒度」を追加 |
| `AGENTS.md:36` | ガイドの列挙に「セキュリティ」（#136 の積み残し）と「PR の粒度」を追加 |

### 変更しない

- `.github/pull_request_template.md` — spec §1.1 の 2・§5 のとおり

---

### Task 1: 粒度ガイドを新設する

**Files:**
- Create: `docs/guides/pr-granularity.md`

**Interfaces:**
- Produces: 憲法 原則 IX ① と ADR 0013 の決定 3 が正本として指す先。パスは
  `docs/guides/pr-granularity.md`（Task 2・Task 3 がこのパスでリンクする）

- [ ] **Step 1: 対照実行（壊さず緑になることを確認する）**

```bash
cd /workspaces/claym/local/Tasuki
node scripts/check-links.mjs
```

期待: `リンク検査 OK（走査 N ファイル）` で**緑**。

**この N を基準値として控える**（spec と本計画がコミット済みの状態。2026-08-14 の実測では
204）。以降のタスクでは**絶対値ではなく基準値からの増分**で確認する。文書を足すたびに
1 ずつ増えるのが正しい。絶対値を計画に書くと、無関係な文書が 1 本増えただけで期待値が
腐る。

- [ ] **Step 2: ガイドを作成する**

`docs/guides/pr-granularity.md` に以下を書く。

````markdown
# PR の粒度ガイド

## このガイドの位置づけ

**粒度の判断基準の正本はこのガイドです。** 「既定を 1 Issue = 1 PR とする」という決定そのものは
[`docs/adr/0013`](../adr/0013-pr-granularity.md) が定めており、基準の追加・変更は ADR の改版を
経ずにこのガイドの更新のみで行います（[`docs/adr/0002`](../adr/0002-document-system-three-layers.md)
の三層構造・書き分け規則）。憲法 原則 IX「小さく回す」がこのガイドを正本として指しています。

## 既定

**1 つの Issue に対する PR は 1 本。** 論理的変更の内訳はコミットが担います。

## 分割してよい理由

次のいずれかに当たるときだけ分けます。

1. **独立して revert したい単位が複数ある**
2. **段階的に本番へ出す必要がある**
3. **危険度の異なる変更が混ざっている**
4. **レビューが実際に回らなかった実績がある**

4 を「実績」と書いているのは、「重そうだから」という事前の見込みで分割しないためです。

## 分割の理由にならないもの

- **コミット数が多い** — #138 は 39 コミットで支障ありませんでした
- **差分行数・ファイル数が大きい** — #138 は 4,835 行・52 ファイルで支障ありませんでした
- **設計 → 実装 → 文書 → 振り返り という工程の違い** — #113 で説明コストが跳ねた主因です。
  工程で割ると、どの PR も本文で「これは全体のどこに当たるか」を毎回説明することになります

## 実例

「本文字÷行」は PR 本文の文字数 ÷（追加行 + 削除行）。差分 1 行あたりの説明コストです。

| Issue | PR | コミット | 差分行 | 本文字÷行 | 分割の理由 |
|---|---|---|---|---|---|
| #136 | 1 本 | 39 | 4,835 | 0.9 | なし（既定どおり） |
| #116 | 1 本 | 10 | 1,411 | 1.0 | なし（既定どおり） |
| #70 | 6 本 | 4〜19 | 202〜2,465 | 0.4〜3.2 | CI 自体を変えるため段階的な確認が要った（理由 2・3） |
| #113 | 7 本 | 1〜3 | 20〜928 | 4.0〜115.1 | 依存の危険度で束ねた（PR-1）。ただし工程分割の分は説明コストが跳ねた |

#113 の行には、同 Issue の振り返り PR #127（比 12.4）とクローズ追従 PR #128（差分 2 行に
本文 562 字＝比 **281.0**）を含めていません。

## 迷ったときは

分割の理由に当たるかどうかで判断します。**当たらなければ 1 本にまとめます。**
「分けた方が丁寧に見える」は理由になりません。分けるたびに PR 本文を書く固定費が
1 本分増えます。
````

- [ ] **Step 3: 追跡に入れて検査する（未追跡だと検査されない）**

```bash
git add docs/guides/pr-granularity.md
node scripts/check-links.mjs
```

期待: **走査 N+1 ファイル**になり、**次の 1 件だけ**が報告される。

```
docs/guides/pr-granularity.md:N 参照先がありません → ../adr/0013-pr-granularity.md
```

**これは正しい状態。** ガイドが Task 2 で作る ADR 0013 を先に参照しているため。
Task 2 の完了で緑へ戻る。

- **走査数が基準値 N のままなら `git add` が効いていない。** 先に進まず原因を確かめる
- **緑になった場合も止まる。** ガイドから ADR 0013 へのリンクが書けていない
- **上記以外の指摘が出た場合も止まる。** 直してから進む

- [ ] **Step 4: 破壊検証（この文書が本当に検査対象に乗ったか）**

Step 3 の時点で ADR 0013 待ちの 1 件が出ている。**壊すとそれが 2 件に増える**ことを見る。

```bash
cp docs/guides/pr-granularity.md /tmp/pr-granularity.bak
sed -i 's|(../adr/0002-document-system-three-layers.md)|(../adr/9999-nope.md)|' docs/guides/pr-granularity.md
grep -c '9999-nope' docs/guides/pr-granularity.md
```

**まず `grep -c` が 1 以上であることを確認する。** 0 なら sed が空振りしており、
この後の検査結果には意味がない（本計画の作成中に 2 度踏んだ空振り）。

```bash
node scripts/check-links.mjs
```

期待: **2 件**の問題。`../adr/0013-pr-granularity.md`（Step 3 から継続）と
`../adr/9999-nope.md`（いま壊した分）。

```bash
cp /tmp/pr-granularity.bak docs/guides/pr-granularity.md
node scripts/check-links.mjs
```

期待: **1 件**へ戻る（ADR 0013 待ちの分のみ）。

- [ ] **Step 5: コミット**

```bash
git add docs/guides/pr-granularity.md
git commit -m "docs: #119 PR の粒度ガイドを新設する

判断基準と実例集の正本をガイドに置く（docs/adr/0002 の書き分け）。
既定は 1 Issue = 1 PR。分割してよい 4 つの理由と、理由にならない
3 つを両側から明記した。実例は #136 #116 #70 #113 の実測から引いた。"
```

---

### Task 2: ADR 0013 を新設する

**Files:**
- Create: `docs/adr/0013-pr-granularity.md`

**Interfaces:**
- Consumes: Task 1 の `docs/guides/pr-granularity.md`（決定 3 が正本として指す）
- Produces: 憲法 Sync Impact Report が改版の根拠として参照する ADR 番号 `0013`

- [ ] **Step 1: 採番が空いていることを確認する**

```bash
ls docs/adr/ | grep -c "^0013" || echo "0013 は未使用"
```

期待: `0013 は未使用`（既存は 0001〜0012）

- [ ] **Step 2: ADR を作成する**

`docs/adr/0013-pr-granularity.md` に以下を書く。テンプレートは `docs/adr/template.md`
（背景 / 決定 / 影響）に従う。

````markdown
# ADR-0013: PR の粒度 — 既定は 1 Issue = 1 PR

- **ステータス**: Accepted（2026-08-14）
- **関連**: [#119](https://github.com/tomohiroJin/tasuki-tools/issues/119) / 憲法 原則 IX「小さく回す」 / [`docs/adr/0002`](0002-document-system-three-layers.md)（三層の書き分け） / [`docs/adr/0003`](0003-agile-operations.md)（DoD の正本をガイドに置く前例） / [`docs/guides/pr-granularity.md`](../guides/pr-granularity.md)（判断基準の正本）

## 背景

憲法 原則 IX ①「1 PR は 1 つの論理的変更に留める（MUST）」の「1 つの論理的変更」の粒度が
明文化されておらず、実質的にコミット単位まで細かくなっていた。その結果、PR 本文の記述コストが
コード差分を上回る事例が生じた。

Issue #119 の起票（2026-08-11）後、実運用が先に動いた。#116 と #136 は**意図的に**
「1 Issue = 1 PR + 多コミット」で出され、レビュー・revert のいずれでも支障が出なかった。
差分 1 行あたりの説明コスト（PR 本文の文字数 ÷ 差分行数）は、#113 の 7 PR での 4.0〜115.1 から、
#116 / #136 の 0.9〜1.0 へ落ちた。

**本決定はこの先行実践の追認である。** 実測の詳細と実例表は
[`docs/guides/pr-granularity.md`](../guides/pr-granularity.md) を正本とする
（`docs/adr/0002` 決定 2「二重正本を作らない」）。

## 決定

1. **1 つの Issue に対する PR は 1 本を既定とする（SHOULD）。** 分割は
   [`docs/guides/pr-granularity.md`](../guides/pr-granularity.md) の分割理由に
   当たるときだけ行う。
2. **1 本の PR に複数の Issue の変更を混ぜない（MUST）。** 「1 つの論理的変更」の単位は
   Issue 1 件であり、論理的変更の内訳はコミットが担う。
3. **粒度の判断基準の正本は `docs/guides/pr-granularity.md` とする（MUST）。**
   基準の追加・変更は本 ADR の改版を経ずにガイドの更新のみで行う
   （`docs/adr/0002` 決定 2 の書き分け規則）。

### 決定 1（SHOULD）と決定 2（MUST）が衝突しない理由

憲法 原則 IX ①「1 PR は 1 つの論理的変更に**留める**」は**上限の規定**である。1 本の PR に
複数の論理的変更を詰めることを禁じるものであり、細かく割りすぎることは規定していない。
決定 2 を同じく上限の形（複数の Issue を混ぜない）で書いているのはこのためである。

「1 つの論理的変更 = Issue 1 件」と**等号**で書くと、分割した PR は「Issue 1 件」ではないため
MUST 違反になってしまう。分割は上限を超えないので、決定 1 の SHOULD と両立する。

## 影響

- 憲法 原則 IX ① に、粒度の判断基準の正本の指し先を追記した（2.1.1 → 2.1.2・PATCH）
- `docs/guides/pr-granularity.md` を新設した。**以後、粒度の見直しはガイドの更新で行い、
  憲法と本 ADR の改版は不要になる**
- **PR テンプレートは変更しない。** DoD の「該当しない項目は『該当なし』と明記してよい」は
  [`docs/guides/definition-of-done.md`](../guides/definition-of-done.md) と
  `.github/pull_request_template.md` の両方に既に記載されており、Issue #119 が挙げた
  記述コストの一部は着手前に解消済みだった
- **Issue #113 の実装計画は改訂しない。** #113 は 2026-08-11 に完了・クローズ済みで、
  改訂対象の計画は既に実行し終えている。本決定は #113 以降の作業に適用する
- **受け入れるトレードオフ**: 1 本の PR が大きくなるため、レビューはコミット単位で行う前提に
  なる。#136（39 コミット・4,835 行・52 ファイル）で支障が出なかったことを根拠に、
  **規模の上限は設けない**。上限が必要だと判明した場合はガイドの更新で対応する
````

- [ ] **Step 3: 追跡に入れて検査する**

```bash
git add docs/adr/0013-pr-granularity.md
node scripts/check-links.mjs
```

期待: `リンク検査 OK（走査 N+2 ファイル）`
Task 1 Step 4 で保留した「ガイド → ADR 0013」のリンク切れも、ここで解消して緑になる。

- [ ] **Step 4: コミット**

```bash
git commit -m "docs: #119 ADR 0013 で PR の粒度の既定を定める

既定は 1 Issue = 1 PR（SHOULD）。1 本の PR に複数の Issue を混ぜない
（MUST）。判断基準の正本はガイド（MUST）。

決定 2 を等号ではなく上限の形で書いているのは、等号だと分割した PR が
MUST 違反になるため。憲法 IX の「留める」が上限規定であることと揃えた。"
```

---

### Task 3: 憲法 原則 IX を改版する

**Files:**
- Modify: `.specify/memory/constitution.md`（原則 IX ①・Sync Impact Report・版表記）

**Interfaces:**
- Consumes: Task 1 の `docs/guides/pr-granularity.md`（指し先）、Task 2 の ADR 0013（改版の根拠）

- [ ] **Step 1: 現在の版と原則 IX を確認する**

```bash
grep -n "^\*\*Version\*\*" .specify/memory/constitution.md
sed -n '/^### IX\./,/^### X\./p' .specify/memory/constitution.md
```

期待: `**Version**: 2.1.1 | **Ratified**: 2026-07-16 | **Last Amended**: 2026-08-13`
と、MUST 3 項目を持つ原則 IX。

- [ ] **Step 2: 原則 IX ① を書き換える**

```diff
 - 1 PR は 1 つの論理的変更に留める（MUST）
+- 1 PR は 1 つの論理的変更に留める（MUST。粒度の判断基準は
+  `docs/guides/pr-granularity.md` を正本とする）
```

**2 つ目（DoD）・3 つ目（デプロイ）の行は変更しない。**

- [ ] **Step 3: 版表記を更新する**

```diff
-**Version**: 2.1.1 | **Ratified**: 2026-07-16 | **Last Amended**: 2026-08-13
+**Version**: 2.1.2 | **Ratified**: 2026-07-16 | **Last Amended**: 2026-08-14
```

- [ ] **Step 4: Sync Impact Report を冒頭へ追記する**

既存の積み上げ形式に従い、冒頭の HTML コメント内の先頭に置き、既存の 2.1.1 の記載は
`Previous release: 2.1.0 → 2.1.1` として下へ送る。

```
- Version change: 2.1.1 → 2.1.2（PATCH: 原則 IX ① に粒度の判断基準の正本の指し先を
  追記。原則の追加・削除・実質的な拡張は無い）
- Rationale: #119。「1 つの論理的変更」の粒度が明文化されておらず、実質的にコミット
  単位まで細かくなっていた。#116（PR 1 本・10 コミット）と #136（PR 1 本・39 コミット）が
  意図的な先行実践として出され、説明コスト（PR 本文の文字数÷差分行数）が #113 の
  4.0〜115.1 から 0.9〜1.0 へ落ち、レビュー・revert のいずれでも支障が出なかった。
  判断基準は docs/guides/pr-granularity.md に置き、憲法からはその指し先だけを示す
  （docs/adr/0002 の書き分け。DoD と同じ構造）。決定そのものは docs/adr/0013。
  MUST の数・強さ・対象は変えず、既存の語が何を指すかの参照先を示すだけなので
  「明確化」と判断した。参照先の新設を「実質的な拡張」と取れば MINOR と読む余地が
  あることを記録しておく。新しい義務を課していないため PATCH とする。
- Modified principles:
  - IX. 小さく回す — 1 項目目に正本の指し先を追記。規範の強さ・見出しは不変。
    2 項目目（DoD）・3 項目目（デプロイ）は変更なし
- Templates requiring updates:
  - OK .specify/templates/plan-template.md — Constitution Check は動的参照のみ。変更不要
  - OK .specify/templates/spec-template.md — 憲法への直接参照なし。変更不要
  - OK .specify/templates/tasks-template.md — 憲法への直接参照なし。変更不要
  - OK AGENTS.md — **見出しに変更が無いため同期作業は不要**（AGENTS.md が転記するのは
    見出しのみ。「IX. 小さく回す」のまま。原則 I〜XI の 11 本一致を確認済み）
```

- [ ] **Step 5: テンプレートへの影響を実際に確かめる（Sync Impact Report の主張を裏取りする）**

```bash
grep -n "原則\|principle\|IX" .specify/templates/plan-template.md .specify/templates/spec-template.md .specify/templates/tasks-template.md
```

期待: 原則名・条項名への**静的な**参照が 0 件（`Constitution Check` の動的参照のみ）。
静的参照が見つかった場合は Sync Impact Report の「変更不要」を書き換える。

- [ ] **Step 6: AGENTS.md の原則見出し 11 本を照合する**

```bash
diff <(grep -oP '^### \K[IVX]+\. .*' .specify/memory/constitution.md) \
     <(grep -oP '^- \K[IVX]+\. .*' AGENTS.md)
```

期待: **差分なし**（I〜XI の 11 本が一致）。差分が出たら Sync Impact Report の
「同期作業は不要」が誤りなので、AGENTS.md 側を直す。

- [ ] **Step 7: 検査と破壊検証**

```bash
node scripts/check-links.mjs
```

期待: `リンク検査 OK（走査 N+2 ファイル）`

憲法からガイドへの新リンクが検査に乗っていることを壊して確かめる。

**この検証が成立することは着手前に実測済み。** 憲法 `.specify/memory/constitution.md` は
`scripts/check-links.mjs` の `LIVE_DOCS` に `".specify/memory/"` として含まれ、
**バッククォート内の拡張子つきパス**は検査される（存在しないガイド名を書いて
`実在しないパスです` が出ることを確認した）。

```bash
cp .specify/memory/constitution.md /tmp/constitution.bak
sed -i 's|`docs/guides/pr-granularity.md`|`docs/guides/nope-granularity.md`|' .specify/memory/constitution.md
grep -c 'nope-granularity' .specify/memory/constitution.md
```

**まず `grep -c` が 1 であることを確認する。** 0 なら sed が空振りしている。

```bash
node scripts/check-links.mjs
```

期待: **失敗**。`.specify/memory/constitution.md:N 実在しないパスです → \`docs/guides/nope-granularity.md\``

> **注意（着手前に確認した落とし穴）**: 憲法には `docs/adr/0002` のような**拡張子なし**の
> パス表記が 6 箇所あるが、これらは `isRepoPathLike` に合致せず**検査されない**。
> 拡張子なしの表記を壊して緑を見ても、それは検査が効いていない証拠にはならない。
> 必ず**拡張子つきの表記**（`docs/guides/pr-granularity.md`）を壊すこと。

```bash
cp /tmp/constitution.bak .specify/memory/constitution.md
node scripts/check-links.mjs
```

期待: `リンク検査 OK（走査 N+2 ファイル）`

- [ ] **Step 8: コミット**

```bash
git add .specify/memory/constitution.md
git commit -m "docs: #119 憲法 原則 IX に粒度の正本の指し先を追記する（2.1.2）

MUST の数・強さ・対象は変えず、既存の語「1 つの論理的変更」が何を指すかの
参照先を示すだけなので PATCH と判断した。参照先の新設を実質的な拡張と
取れば MINOR と読む余地があることも Sync Impact Report に記録した。

2 つ目（DoD）・3 つ目（デプロイ）の MUST は変更していない。"
```

---

### Task 4: 文書地図のガイド列挙を直す

**Files:**
- Modify: `docs/README.md:24`
- Modify: `AGENTS.md:36`

**Interfaces:**
- Consumes: Task 1 のガイド新設

**背景**: どちらもリンク切れではないので `check-links` は検出しない。**手で直す。**
`AGENTS.md:36` は本作業を待たずに**既に古い**（#136 で新設した `security.md` が
反映されていない）。ここも同時に回収する。

- [ ] **Step 1: 現状を確認する（対照）**

```bash
ls docs/guides/ | wc -l
grep -n "今日どう書くか" docs/README.md AGENTS.md
```

期待: ガイドは **7 本**（Task 1 で 1 本増えた）。
`docs/README.md:24` は 6 本の列挙、`AGENTS.md:36` は **5 本**（security 欠落）。

- [ ] **Step 2: `docs/README.md:24` を直す**

```diff
-| 今日どう書くか（DoD・EARS・振り返り・アーキテクチャ・開発手順・セキュリティ） | [`docs/guides/`](./guides/) |
+| 今日どう書くか（DoD・EARS・振り返り・アーキテクチャ・開発手順・セキュリティ・PR の粒度） | [`docs/guides/`](./guides/) |
```

- [ ] **Step 3: `AGENTS.md:36` を直す（security の欠落もあわせて回収）**

```diff
-  今日どう書くか（DoD・EARS・振り返り・アーキテクチャ・開発手順）
+  今日どう書くか（DoD・EARS・振り返り・アーキテクチャ・開発手順・セキュリティ・PR の粒度）
```

- [ ] **Step 4: 列挙とファイルの実体が一致することを確かめる**

```bash
ls docs/guides/
grep -n "今日どう書くか" docs/README.md AGENTS.md
```

期待: ガイド 7 本（architecture / definition-of-done / development / ears-writing /
pr-granularity / retrospective / security）に対し、両方の列挙が 7 項目で一致。

- [ ] **Step 5: 検査**

```bash
node scripts/check-links.mjs
```

期待: `リンク検査 OK（走査 N+2 ファイル）`（Task 4 は文書を増やさない）

- [ ] **Step 6: コミット**

```bash
git add docs/README.md AGENTS.md
git commit -m "docs: #119 文書地図のガイド列挙を実体に合わせる

ガイドが 7 本になったので docs/README.md と AGENTS.md の列挙を直した。
AGENTS.md は #136 で新設した security.md が反映されておらず、本作業を
待たずに既に古かったのであわせて回収した。

どちらもリンク切れではないため check-links は検出しない。"
```

---

### Task 5: PR を出し、固定費を実測して ADR へ記録する

**Files:**
- Modify: `docs/adr/0013-pr-granularity.md`（実測の節を追記）

**Interfaces:**
- Consumes: Task 1〜4 のコミット群

**背景**: Issue #119 の完了条件「決定後の粒度で PR を 1 本以上出し、固定費が実際に下がった
ことを実測した」を満たす。**本 PR 自身が実測台**になる（spec §5）。

- [ ] **Step 1: push して PR を 1 本作成する**

```bash
git push -u origin docs/119-pr-granularity
```

PR 本文は `.github/pull_request_template.md` に従う。DoD は 8 項目中 6 つが「該当なし」、
該当するのは 7（文書への影響を反映）と 8（Issue の完了条件）。

**DoD 8 の「EARS で書かれた振る舞い」は非該当**と明記する。`docs/adr/0003` 決定 2 は
EARS を**機能系** Issue に限って MUST としており、#119 は規範と文書の変更で利用者から
見える振る舞いを変えない。Issue #119 本文にも「振る舞い」節は無い（spec §5.2）。

- [ ] **Step 2: CI の所要時間を測る（測り方を間違えない）**

```bash
RID=$(gh run list --branch docs/119-pr-granularity --limit 1 --json databaseId -q '.[0].databaseId')
gh run view "$RID" --json createdAt,updatedAt -q '"created=\(.createdAt) updated=\(.updatedAt)"'
gh run view "$RID" --json jobs -q '.jobs[] | "\(.name) \(.conclusion)"'
```

**`createdAt` → `updatedAt` の差**を所要時間とする。`gh run list` の `startedAt` を
使うとキュー待ちを含んだ別の値になり、実測を誤る（spec の敵対的検証で 1 度踏んだ）。

期待: 文書のみの変更なので docs ジョブ中心で 20 秒台（#70 の実績。
`docs/retrospectives/2026-08-12-issue-70-ci-checks.md:152`）。

- [ ] **Step 3: 本文字÷行を測る**

```bash
gh pr view --json number,additions,deletions,body -q '"\(.number) \(.additions + .deletions) \(.body|length)"'
```

比 = 本文の文字数 ÷（追加行 + 削除行）。

- [ ] **Step 4: ADR 0013 へ実測の節を追記する**

`## 影響` の後ろに次の節を足す。`<...>` は Step 2・3 で得た実際の値に置き換える。
**プレースホルダのままコミットしない。**

````markdown
## 本決定を適用した最初の PR の実測（2026-08-14）

Issue #119 自身を、本決定の粒度（1 Issue = 1 PR）で出した。

| 指標 | 実測 |
|---|---|
| PR 本数 | 1 本（#<PR番号>） |
| コミット数 | <N> |
| 差分行（追加 + 削除） | <N> |
| PR 本文の文字数 | <N> |
| 本文字÷行 | <N.N> |
| CI 所要（created → updated） | <N> 秒 |

比較対象は [`docs/guides/pr-granularity.md`](../guides/pr-granularity.md) の実例表を参照。
````

- [ ] **Step 5: コミットして push する**

```bash
git add docs/adr/0013-pr-granularity.md
git commit -m "docs: #119 本決定を適用した最初の PR の実測を ADR へ記録する

完了条件「決定後の粒度で PR を 1 本以上出し、固定費が実際に下がった
ことを実測した」を、本 PR 自身を実測台にして満たした。"
git push
```

---

### Task 6: 振り返りを書き、Issue を閉じる

**Files:**
- Create: `docs/retrospectives/2026-08-14-issue-119-pr-granularity.md`

**背景**: `docs/adr/0003` 決定 4「epic・大きめの Issue の完了時には振り返りを記録する（MUST）」。
型は `docs/guides/retrospective.md` に従う。

- [ ] **Step 1: 振り返りの型を確認する**

```bash
cat docs/guides/retrospective.md
```

- [ ] **Step 2: 振り返りを書く**

型に従い、少なくとも次を含める。

- **Issue 本文の前提のうち 3 点が着手時に成り立たなくなっていた**（CI の待ち時間・DoD の
  「該当なし」・#113 の計画改訂）。起票から着手まで 3 日で、その間の #70 / #116 / #136 が
  前提を変えていた
- **設計の self-review が片側しか直せていなかった**（憲法側は上限規定と書き直したが、
  ADR 決定 2 の等号は残っていた）。敵対的検証で F3 として再検出
- **修正の再検証で、自分の修正が新しい矛盾を作っていた**（§2「ガイドへ数値を転記しない」と
  §3.4「実例表の正本はガイド」）。**直したあとに必ずもう一度読む**
- **測り方を誤って誤った反証を立てた**（`gh run list` の `startedAt` はキュー待ちを含む。
  正しくは `createdAt` → `updatedAt`）
- **`check-links` は git 追跡下のファイルしか走査しない** — 未追跡の新規文書はローカル検査で
  何を壊しても緑になる（#135 への申し送り候補）
- **憲法 Governance の Constitution Check ゲートが実運用で空文化している** —
  `docs/superpowers/` で 4 件のみ、#136 の plan にも無い（#135 への申し送り候補）
- **`AGENTS.md:36` が #136 の時点で既に古かった** — 検査が無いので誰も気づかなかった

- [ ] **Step 3: 検査してコミットする**

```bash
git add docs/retrospectives/2026-08-14-issue-119-pr-granularity.md
node scripts/check-links.mjs
git commit -m "docs: #119 の振り返りを追加する"
git push
```

- [ ] **Step 4: #135 へ申し送りをコメントする**

本作業で見つかった「検査が静かに効かなくなる経路」2 件を #135 へ記録する。

1. `check-links` は git 追跡下のファイルしか走査しない（`scripts/check-links.mjs:216-220`）。
   未追跡の新規文書はローカル検査で何を壊しても緑になる。CI は影響を受けない
2. 憲法 Governance の「すべての plan は Constitution Check ゲートを通過しなければならない」が
   実運用で空文化している（`docs/superpowers/` で 4 件のみ。#136 の plan にも無い）。
   検査が存在しないため誰も気づかない
3. `check-links` のコードパス検査は**拡張子つきのパス表記しか見ない**
   （`scripts/check-links.mjs` の `isRepoPathLike`）。憲法には `docs/adr/0002` のような
   拡張子なしの表記が 6 箇所あり、**これらは検査されない**。現時点では実在するので
   無害だが、ADR がリネーム・統合されると静かに壊れる

- [ ] **Step 5: Issue #119 の完了条件を確認してクローズする**

4 項目それぞれについて、満たした根拠を Issue へコメントする。

| 完了条件 | 根拠 |
|---|---|
| 決定が ADR に記録されている | `docs/adr/0013-pr-granularity.md` |
| 憲法の文言・ガイドのいずれか・PR テンプレートが更新されている | 憲法（2.1.2）とガイド新設の 2 つ。読みは「3 つのうち必要なものだけ」（利用者判断 2026-08-14）。PR テンプレートは変更不要（理由は ADR 0013 の影響節） |
| 決定後の粒度で PR を 1 本以上出し固定費を実測 | Task 5 の実測表 |
| #113 の実装計画の改訂 | **改訂不要**。#113 は 2026-08-11 完了・クローズ済み（ADR 0013 の影響節に記録） |

---

## 完了の定義

- [ ] 全 6 タスクのコミットが `docs/119-pr-granularity` に載っている
- [ ] PR は **1 本**（本決定の自己適用）
- [ ] `node scripts/check-links.mjs` が緑（走査 **N+3** ファイル。基準値 N にガイド・ADR・
      振り返りの 3 本を足した数。N は Task 1 Step 1 で控えた値）
- [ ] CI 全ジョブが緑
- [ ] 憲法が 2.1.2 で、Sync Impact Report に判断理由と MINOR と読む余地が記録されている
- [ ] `AGENTS.md` の原則見出し 11 本が憲法と一致（Task 3 Step 6 の diff が空）
- [ ] ガイド 7 本に対し `docs/README.md` と `AGENTS.md` の列挙が 7 項目で一致
- [ ] 破壊検証を 2 回行い、いずれも赤を確認してから戻した（Task 1 Step 4・Task 3 Step 7）
- [ ] #135 へ申し送り 2 件をコメントした
- [ ] Issue #119 の完了条件 4 項目に根拠つきでコメントし、クローズした
