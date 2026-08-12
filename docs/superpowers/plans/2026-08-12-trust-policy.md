# trustPolicy（信頼証跡の降格拒否）の採用 — 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm-workspace.yaml` に `trustPolicy: no-downgrade` を導入し、決定を ADR 0010 に、運用手順を開発ガイドに記録して Issue #116 を閉じる。

**Architecture:** コードの変更は無い。設定 1 ファイル・ADR 1 本（新規）・ADR 一覧 1 行・ガイド 1 節の 4 か所を変更する。検査は `pnpm install --frozen-lockfile` 自体が担うので、新しいスクリプトや CI ジョブは作らない。

**Tech Stack:** pnpm 11.5.0（`package.json` の `packageManager`）/ GitHub Actions / Markdown

**スペック（数値の正本）:** `/home/vscode/tasuki-work/docs/superpowers/specs/2026-08-12-trust-policy-design.md`

## Global Constraints

- **作業ディレクトリは `/home/vscode/tasuki-work`**（overlay）。`/workspaces/claym/local/Tasuki` では作業しない（9p マウントで約 48 倍遅く、ディレクトリの rename と `rm -rf` が壊れる）
- **ブランチは `chore/116-trust-policy`**（作成済み。スペックの 2 コミット `5ed5889` `be12248` が載っている）
- **pnpm の呼び出しは `export PATH="$HOME/.local/bin:$PATH"` の後に `corepack pnpm`**
- **供給網検証を確認するときは、必ず先に `node_modules` を全削除する。** `node_modules` が最新だと pnpm は `Already up to date` で短絡し、検証を走らせない
- **数値の正本はスペック 1 本。** ADR・ガイド・PR 本文・Issue コメントへ実測値を転記しない
- **成果物を作ったら `/workspaces/claym/local/Tasuki` の同じ相対パスへ写し、フルパスを利用者へ伝える**
- **`trustPolicyIgnoreAfter` は値を問わず使わない**（`minimumReleaseAge: 10080` 以下だと検査が実質何も判定しなくなる）
- **除外は必ず `名前@版` の形式**（`"semver@6.3.1"`）。名前だけにしない

---

### Task 1: 設定を入れ、検査が効いていることを破壊検証で確かめる

**Files:**
- Modify: `/home/vscode/tasuki-work/pnpm-workspace.yaml`（末尾へ追記。現在 24 行）

**Interfaces:**
- Consumes: なし
- Produces: `pnpm-workspace.yaml` の `trustPolicy` / `trustPolicyExclude` キー。Task 2 の ADR と Task 3 のガイドがこの設定を参照する

- [ ] **Step 1: 検査が「まだ無い」ことを確認する（ベースライン）**

```bash
cd /home/vscode/tasuki-work
export PATH="$HOME/.local/bin:$PATH"
git status --short          # 何も出ないこと（変異検査と同じく、汚れたツリーでは判断を誤る）
find . -name node_modules -type d -prune -exec rm -rf {} +
corepack pnpm install --frozen-lockfile
```

期待: 終了コード 0。

**`Verifying lockfile against supply-chain policies` の行が出るかどうかで判断しないこと。**
`minimumReleaseAge` が既に有効なので、`~/.cache/pnpm/lockfile-verified.jsonl` の検証キャッシュが
冷たければこの行は `trustPolicy` 無しでも出る。ここで見るのは終了コード 0 だけでよい。
検査が入ったことの証明は Step 2 の赤で取る。

- [ ] **Step 2: `trustPolicy` だけを入れて、赤くなることを見る**

除外をまだ書かない。これが「先に失敗を見る」ステップにあたる。

```bash
cd /home/vscode/tasuki-work
cat >> pnpm-workspace.yaml <<'YAML'

trustPolicy: no-downgrade
YAML
find . -name node_modules -type d -prune -exec rm -rf {} +
corepack pnpm install --frozen-lockfile
```

期待: **終了コード 1**。次の出力が出ること。

```
[ERR_PNPM_TRUST_DOWNGRADE] 1 lockfile entries failed verification:
  semver@6.3.1 High-risk trust downgrade for "semver@6.3.1" (possible package takeover)
```

**ここで赤が出なければ設定が読まれていない。** `pnpm-workspace.yaml` の末尾を確認し、
インデントが付いていないこと（トップレベルのキーであること）を確かめてから先へ進む。

- [ ] **Step 3: 最終形の設定を書く**

Step 2 で追記した仮の 2 行を消してから、コメントつきの最終形を書く。

```bash
cd /home/vscode/tasuki-work
git checkout -- pnpm-workspace.yaml    # Step 2 の仮追記を捨てる（この時点で他の未コミット変更が無いことは Step 1 で確認済み）
cat >> pnpm-workspace.yaml <<'YAML'

# 信頼証跡（provenance / trusted publisher / staged publish）の降格を拒否する。
# 乗っ取り（盗んだトークンで、CI を経由せず＝証跡なしに publish される）を、
# 公開から 7 日を過ぎていても弾く。待機期間とは直交する防御。
# 判定は公開日のみで行われ semver の系列を見ないため、旧系列の保守版は偽陽性になる。
# 判断の根拠は docs/adr/0010、運用手順は docs/guides/development.md を参照。
trustPolicy: no-downgrade

# 降格判定の偽陽性に対する除外。公開日は動かないため待っても解消せず、
# minimumReleaseAgeExclude の「期限つき」とは性質が異なる。解除予定日は書かない。
# ただし当該版が依存木から消えたらこの行は不要になる（残すと将来その版を黙って免除する）。
# 必ず「名前@版」で書く。名前だけにすると以後その名前の全版が無検査になる。
trustPolicyExclude:
  # semver@6.3.1（2023-07-10T22:38:41Z 公開）は 6.x 系の保守版で証跡を持たない。
  # その公開日より前に 7.5.1〜7.5.4 が provenance 付きで出ているため降格と判定される、
  # 設計上の偽陽性。依存元は @babel/core（eslint-plugin-react-hooks 経由の開発時依存）。
  - "semver@6.3.1"
YAML
```

- [ ] **Step 4: 緑になることを確認する**

```bash
cd /home/vscode/tasuki-work
find . -name node_modules -type d -prune -exec rm -rf {} +
corepack pnpm install --frozen-lockfile
```

期待: 終了コード 0。出力に `Verifying lockfile against supply-chain policies (447 entries)` が出ること（検証は走っている。除外で 1 件だけ免除されている）。

- [ ] **Step 5: 破壊検証 — 除外の版指定が効いていることを確かめる**

除外を存在しない版に差し替える。**通ってしまったら、除外が名前単位で効いていることになり設計違反である。**

```bash
cd /home/vscode/tasuki-work
sed -i 's/- "semver@6\.3\.1"/- "semver@9.9.9"/' pnpm-workspace.yaml
find . -name node_modules -type d -prune -exec rm -rf {} +
corepack pnpm install --frozen-lockfile
```

期待: **終了コード 1**、`semver@6.3.1 High-risk trust downgrade` が再び出ること。

- [ ] **Step 6: 破壊検証を元に戻し、緑を確認する**

```bash
cd /home/vscode/tasuki-work
sed -i 's/- "semver@9\.9\.9"/- "semver@6.3.1"/' pnpm-workspace.yaml
find . -name node_modules -type d -prune -exec rm -rf {} +
corepack pnpm install --frozen-lockfile
git diff --stat        # pnpm-workspace.yaml のみが変更されていること。pnpm-lock.yaml は変わらない
```

期待: 終了コード 0。`git diff --stat` に `pnpm-lock.yaml` が現れないこと（**現れたら lockfile が書き換わっている。`--frozen-lockfile` が効いていないので原因を調べる**）。

- [ ] **Step 7: コミット**

```bash
cd /home/vscode/tasuki-work
git add pnpm-workspace.yaml
git commit -F - <<'MSG'
chore: #116 trustPolicy による信頼証跡の降格拒否を有効にする

- trustPolicy: no-downgrade を有効化
- semver@6.3.1 を版指定で除外（6.x 系保守版に対する設計上の偽陽性）
- trustPolicyIgnoreAfter は使わない（検査が実質何も判定しなくなるため）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 2: ADR 0010 を書き、一覧へ追加する

**Files:**
- Create: `/home/vscode/tasuki-work/docs/adr/0010-trust-policy.md`
- Modify: `/home/vscode/tasuki-work/docs/adr/README.md`（一覧テーブルの末尾。現在 37 行目が 0009）

**Interfaces:**
- Consumes: Task 1 の `pnpm-workspace.yaml` の設定（ADR 本文が参照する）
- Produces: `docs/adr/0010-trust-policy.md`。Task 3 のガイドと Task 1 の設定コメントがこのパスをリンク先にする

- [ ] **Step 1: ADR を書く**

`docs/adr/template.md` の形式（背景 / 決定 / 影響 / ステータス）に従う。
**実測値は書かない**（スペックが数値の正本）。

`/home/vscode/tasuki-work/docs/adr/0010-trust-policy.md` に次の内容で作成する。

```markdown
# ADR-0010: trustPolicy による信頼証跡の降格拒否

- **ステータス**: Accepted（2026-08-12）
- **関連**: [Issue #116](https://github.com/tomohiroJin/tasuki-tools/issues/116) /
  [ADR-0008](./0008-dependency-supply-chain.md) /
  [スペック](../superpowers/specs/2026-08-12-trust-policy-design.md)

## 背景

ADR-0008 で `minimumReleaseAge`（公開から 7 日未満の版を拒否する待機期間）を導入した。
これは「乗っ取りが発覚するまで取り込みを遅らせる」防御であり、**7 日以内に発覚しなかった
改ざんは通す**。

pnpm 11.5.0 の `trustPolicy` は、公開日に関係なく「信頼証跡の降格」を検知する。
過去により強い証跡（staged publish / trusted publisher / provenance）を持っていた
パッケージが、証跡の弱い版・無い版を出したときに install を拒否する。盗んだトークンで
CI を経由せず publish する乗っ取りの典型を、公開から時間が経っていても弾ける。
待機期間とは直交する防御である。

判定の機序・適用コスト・保護対象の件数はスペックを数値の正本とし、本 ADR では転記しない。

## 決定

- **MUST**: `pnpm-workspace.yaml` で `trustPolicy: no-downgrade` を有効にする
- **MUST NOT**: `trustPolicyIgnoreAfter` を使わない。この設定は「公開から N 分より古い版は
  検査しない」を意味するため、`minimumReleaseAge`（7 日）以下の値にすると、install しうる
  版がほぼすべて検査対象から外れる。**検証コストを払ったまま何も判定しない状態**になる
- **MUST**: `trustPolicyExclude` は `名前@版` の形式で書く。名前だけの除外はしない
  （以後そのパッケージの全版が無検査になり、乗っ取りが起きる新しい版も素通りする）
- **MUST**: 除外には**偽陽性と判断した根拠**（どの版が先に証跡を持っていたか）をコメントで
  残す。**解除予定日は書かない**。公開日は動かないため時間では解消せず、
  `minimumReleaseAgeExclude` の期限つき例外とは性質が異なる
- **MUST**: 除外した版が依存木から消えたら、その行を削除する。残すと将来その版が
  再び現れたときに黙って免除を与える
- **MUST NOT**: 違反を見て反射的に除外へ足さない。当該版より前に公開された版の証跡を
  登録所で確認し、旧系列の保守版（偽陽性）か、証跡が消えた最新版（乗っ取りの疑い）かを
  判断してから決める。手順は [`docs/guides/development.md`](../guides/development.md)
- **MUST**: Renovate の PR が降格判定で赤くなったときも同じ判断手順を通す。`trustPolicy` に
  対応する Renovate 側の設定は無く、bot は降格を予見できない。赤は不具合ではなく信号として
  扱い、Renovate の設定で消そうとしない

## 影響

- 導入時点で降格と判定されたのは `semver@6.3.1` のみだった。6.x 系の保守版であり、
  その公開日より前に 7.x 系が provenance つきで公開されていたことによる設計上の偽陽性
  （pnpm の判定は公開日だけで行われ semver の系列を見ない）。版指定で除外した
- CI で `pnpm install` が走るジョブは lockfile の検証時間を追加で払う。#70 の絞り込みにより
  install は条件付きステップなので、**文書のみの PR では増分が無い**
- 登録所からメタデータを取得できないと、pnpm はそれを違反として扱い install を落とす
  （fail-closed）。CI が赤くなる原因が 1 つ増えることを受け入れる
- 除外リストが静かに効かなくなる経路が 2 つある（版指定の退化・依存木から消えた版の
  除外行が残る）。機械的な検査は
  [Issue #135](https://github.com/tomohiroJin/tasuki-tools/issues/135) で扱う
- ADR-0008 の決定はいずれも覆らない。本 ADR は 0008 を置換せず、併存する
```

- [ ] **Step 2: ADR 一覧へ 1 行追加する**

`/home/vscode/tasuki-work/docs/adr/README.md` の 37 行目（`| [0009]...`）の直後に追加する。

```markdown
| [0010](./0010-trust-policy.md) | trustPolicy による信頼証跡の降格拒否 | Accepted |
```

- [ ] **Step 3: リンク検査を走らせる**

新規ファイルは `git add` するまで `git ls-files` に現れず、走査対象にならない。**先に add する。**

```bash
cd /home/vscode/tasuki-work
git add docs/adr/0010-trust-policy.md docs/adr/README.md
node scripts/check-links.mjs
```

期待: `リンク検査 OK`、終了コード 0。

- [ ] **Step 4: 破壊検証 — リンク検査が実際にこの ADR を見ていることを確かめる**

```bash
cd /home/vscode/tasuki-work
sed -i 's|(./0010-trust-policy.md)|(./0010-does-not-exist.md)|' docs/adr/README.md
node scripts/check-links.mjs ; echo "終了コード: $?"
```

期待: **終了コード 1**、存在しないリンクとして報告されること。確認したら戻す。

```bash
cd /home/vscode/tasuki-work
sed -i 's|(./0010-does-not-exist.md)|(./0010-trust-policy.md)|' docs/adr/README.md
node scripts/check-links.mjs
```

期待: 終了コード 0。

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/adr/0010-trust-policy.md docs/adr/README.md
git commit -F - <<'MSG'
docs: #116 ADR 0010 に trustPolicy の決定を記録する

- trustPolicy: no-downgrade の採用と、除外の書き方の規律を MUST / MUST NOT で記録
- trustPolicyIgnoreAfter を使わない理由（検査が実質何も判定しなくなる）を明記
- Renovate の PR が赤くなったときの扱いを決定に含める
- ADR 一覧へ 1 行追加

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 3: 開発ガイドに運用手順を書く

**Files:**
- Modify: `/home/vscode/tasuki-work/docs/guides/development.md`（112 行目と 114 行目の間へ節を挿入。133 行目を 1 か所修正）

**Interfaces:**
- Consumes: Task 1 の設定と Task 2 の ADR 0010（リンク先）
- Produces: 「信頼証跡の降格拒否」節。Task 4 の PR 本文がここを参照する

- [ ] **Step 1: 既存の「3 つの手」が待機期間限定であることを明記する**

133 行目は現在こうなっている。

```markdown
違反が出たときに取れる手は次の 3 つに限られます。「違反したエントリだけを
古い版へ解決し直す」手段は存在しません（検証が解決より先に走るため）。
```

これを次に置き換える。**降格判定にはこの 3 つのうち 2 つが効かないため、対象を限定する。**

```markdown
**待機期間の違反**が出たときに取れる手は次の 3 つに限られます。「違反したエントリだけを
古い版へ解決し直す」手段は存在しません（検証が解決より先に走るため）。降格判定
（`ERR_PNPM_TRUST_DOWNGRADE`）の場合は下の「信頼証跡の降格拒否」を参照してください。
```

- [ ] **Step 2: 「信頼証跡の降格拒否」節を挿入する**

112 行目（`- **解除を完了条件に含める**（消し忘れると恒久設定になる）`）と
114 行目（`### ローカル確認時の注意`）の間に、次を挿入する。

````markdown
### 信頼証跡の降格拒否

`trustPolicy: no-downgrade` により、**過去により強い信頼証跡（provenance / trusted
publisher / staged publish）を持っていたパッケージが、証跡の弱い版・無い版を出したとき**、
`pnpm install` が拒否します（判断の根拠は
[`docs/adr/0010`](../adr/0010-trust-policy.md)）。

待機期間との違いは**公開日に関係なく効く**ことです。待機期間は「7 日以内に発覚した改ざんを
避ける」防御で、それを過ぎた改ざんは通します。

**判定は公開日だけで行われ、semver の系列を見ません。** 新しい系列が証跡を持ち始めた後に
公開された旧系列の保守版は、必ず降格と判定されます。

#### 違反が出たときの判断手順

`ERR_PNPM_TRUST_DOWNGRADE` が出たら、**除外へ足す前に**偽陽性か本物かを判断します。

```bash
# 1. 当該版の証跡を見る
curl -s https://registry.npmjs.org/<pkg>/<version> \
  | jq '{npmUser: ._npmUser, provenance: (.dist.attestations.provenance != null)}'

# 2. その版より前に公開された版の証跡を見る（公開日の昇順）
curl -s https://registry.npmjs.org/<pkg> \
  | jq -r '.versions | to_entries[]
           | "\(.key)\t\(if .value.dist.attestations.provenance then "provenance" else "-" end)\t\(if .value._npmUser.trustedPublisher then "trustedPublisher" else "-" end)"'
```

- **偽陽性**: 当該版が旧系列の保守版で、より新しい系列が先に証跡つきで公開されていた
- **本物を疑う**: 当該版が最新系列の新しい版なのに証跡が消えた → 乗っ取りの可能性

**待機期間の違反で使える「待つ」「全面再解決」はここでは効きません。** 公開日は動かないため、
時間が経っても `pnpm clean --lockfile` を実行しても判定は変わりません。取れる手は
**「除外する」か「依存の版を変える」の 2 つだけ**です。

#### 偽陽性と判断したときの除外

```yaml
# pnpm-workspace.yaml
trustPolicyExclude:
  # semver@6.3.1（2023-07-10T22:38:41Z 公開）は 6.x 系の保守版で証跡を持たない。
  # その公開日より前に 7.5.1〜7.5.4 が provenance 付きで出ているため降格と判定される、
  # 設計上の偽陽性。依存元は @babel/core（eslint-plugin-react-hooks 経由の開発時依存）。
  - "semver@6.3.1"
```

- **必ず「名前@版」で書く。** 名前だけにすると、以後そのパッケージの全版が無検査になります
- **偽陽性と判断した根拠をコメントに残す**（どの版が先に証跡を持っていたか）
- **解除予定日は書きません。** 公開日は動かないので時間では解消しません。ただし
  **その版が依存木から消えたら行を削除してください**（残すと、将来その版が再び現れたときに
  黙って免除を与えます）
- **`trustPolicyIgnoreAfter` は使いません。** `minimumReleaseAge`（7 日）以下の値にすると、
  install しうる版がほぼすべて検査対象から外れ、検証コストだけが残ります（ADR 0010）

#### Renovate の PR が赤くなったとき

Renovate 側に `trustPolicy` に対応する設定はありません。bot は降格を予見できないため、
提案した更新が降格判定に当たれば PR が赤くなります。**これは不具合ではなく信号です。**
上の判断手順を通し、偽陽性なら除外を足して取り込み、そうでなければ更新を見送ってください。
**Renovate の設定でこの赤を消そうとしないでください。**
````

- [ ] **Step 3: リンク検査を走らせる**

```bash
cd /home/vscode/tasuki-work
node scripts/check-links.mjs
```

期待: `リンク検査 OK`、終了コード 0。

- [ ] **Step 4: ガイドに書いたコマンドが実際に動くことを確かめる**

**書いたコマンドを実行せずにコミットしない。** 過去に「実在しないパスの引用」がすり抜けている。

```bash
curl -s https://registry.npmjs.org/semver/6.3.1 \
  | jq '{npmUser: ._npmUser, provenance: (.dist.attestations.provenance != null)}'
```

期待: `provenance` が `false` になること。

```bash
curl -s https://registry.npmjs.org/semver \
  | jq -r '.versions | to_entries[]
           | "\(.key)\t\(if .value.dist.attestations.provenance then "provenance" else "-" end)\t\(if .value._npmUser.trustedPublisher then "trustedPublisher" else "-" end)"' \
  | grep -E '^7\.5\.[1-4]'
```

期待: 4 行出て、いずれも 2 列目が `provenance` であること。

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/guides/development.md
git commit -F - <<'MSG'
docs: #116 開発ガイドに信頼証跡の降格拒否の運用手順を追加する

- 違反時に偽陽性か本物かを判断する手順（登録所のメタデータを見る）
- 待機期間の「待つ」「全面再解決」が降格判定には効かないことを明記
- 除外の書き方（版指定・根拠コメント・期限を書かない・不要になったら消す）
- Renovate の PR が赤くなったときの扱い

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 4: PR を出し、CI で実測してスペックを埋める

**Files:**
- Modify: `/home/vscode/tasuki-work/docs/superpowers/specs/2026-08-12-trust-policy-design.md`（「CI が実際に払うコスト（推定。CI では未計測）」節）

**Interfaces:**
- Consumes: Task 1〜3 のコミット
- Produces: CI 実測値の入ったスペック。Task 5 の振り返りが参照する

- [ ] **Step 1: 手元の検査を通す**

変異検査は作業ツリーが汚れていると実行できないため、Task 3 までコミット済みであることが前提。

```bash
cd /home/vscode/tasuki-work
export PATH="$HOME/.local/bin:$PATH"
git status --short                          # 何も出ないこと
node scripts/check-links.mjs
node scripts/audit-structure.mjs
node --test scripts/audit-structure.test.mjs
```

期待: すべて終了コード 0。

構造監査は ADR やガイドの本数を指標にしていない（`scripts/audit-structure.mjs` に `adr` の
参照は無い）ので、文書を足しても指標は動かないはずである。**動いていたら止まって原因を調べる。**
「文書を足したら基準値が変わったので基準値のほうを直す」は、#135 が扱う「検査が静かに
効かなくなる」経路そのものになる。

- [ ] **Step 2: push して PR を作る**

```bash
cd /home/vscode/tasuki-work
git push -u origin chore/116-trust-policy
gh pr create --base main --title "chore: #116 trustPolicy による信頼証跡の降格拒否を導入する" --body-file - <<'BODY'
## 概要

pnpm 11.5.0 の `trustPolicy: no-downgrade` を導入し、信頼証跡（provenance / trusted
publisher / staged publish）の降格を `pnpm install` の段で拒否する。ADR-0008 の
`minimumReleaseAge`（7 日の待機期間）が「発覚まで遅らせる」防御であるのに対し、
本設定は公開日に関係なく効く直交した防御。Issue #116。

## 変更内容

- `pnpm-workspace.yaml`: `trustPolicy: no-downgrade` と `trustPolicyExclude`（`semver@6.3.1` の版指定除外）
- `docs/adr/0010-trust-policy.md`（新規）と ADR 一覧への 1 行
- `docs/guides/development.md`: 「信頼証跡の降格拒否」節。既存の「3 つの手」が待機期間限定であることの明記
- `docs/superpowers/specs/2026-08-12-trust-policy-design.md`: 設計と実測（数値の正本）

## テスト方法

- [ ] `node_modules` を全削除して `pnpm install --frozen-lockfile` が終了コード 0
- [ ] `trustPolicyExclude` の行を消すと `ERR_PNPM_TRUST_DOWNGRADE` で落ちる
- [ ] 除外を `"semver@9.9.9"` に差し替えると落ちる（版指定が効いている証明）
- [ ] `node scripts/check-links.mjs` が終了コード 0

## DoD

1. テスト先行・全緑 — 該当なし（コードの変更が無く、検査は `pnpm install` 自体が担う）
2. E2E — 該当なし（利用者の通る経路は変わらない）
3. **新しく足した検査をわざと壊して赤くなることを確認した** — 上記「テスト方法」の 2 番目と 3 番目
4. 変異検査 — 該当なし（既存実装を書き換えていない）
5. 実経路での確認 — `pnpm install --frozen-lockfile` を実経路として確認済み
6. リファクタリング — 該当なし（整地の必要が生じなかった）
7. **文書への影響を反映した** — ADR 0010・開発ガイド・スペック
8. **Issue の完了条件を満たした** — 適用コストを実測し、採否を決めて ADR に記録した

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
```

- [ ] **Step 3: CI の完了を待ち、install ステップの所要を取る**

```bash
cd /home/vscode/tasuki-work
gh pr checks --watch
RUN=$(gh run list --branch chore/116-trust-policy --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$RUN" --log | grep -E "Verifying lockfile|policy check|Done in|Progress: resolved"
```

期待: `Verifying lockfile against supply-chain policies (447 entries)` が CI のログに現れ、その所要秒数が読み取れること。

- [ ] **Step 4: スペックの「未計測」を実測で置き換える**

`/home/vscode/tasuki-work/docs/superpowers/specs/2026-08-12-trust-policy-design.md` の
`### CI が実際に払うコスト（推定。CI では未計測）` を
`### CI が実際に払うコスト` に変え、次の 2 文を実測値で書き換える。

- 「**上の秒数はすべて overlay（`/home/vscode/tasuki-work`）での実測であり、CI では計測していない。**（略）**実測は本 Issue の PR で行う。**」
  → CI での実測値（ジョブ名と秒数）に置き換える。ローカル値との差も 1 文で書く

**推定のまま残さない。** 実測できなかった場合は「なぜ取れなかったか」を書く。

- [ ] **Step 5: コミットして push する**

```bash
cd /home/vscode/tasuki-work
git add docs/superpowers/specs/2026-08-12-trust-policy-design.md
git commit -F - <<'MSG'
docs: #116 CI での検証時間を実測してスペックへ反映する

- 推定としていた CI のコストを実測値に置き換えた

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
git push
```

- [ ] **Step 6: 閲覧用コピーを更新し、フルパスを伝える**

```bash
cp /home/vscode/tasuki-work/docs/superpowers/specs/2026-08-12-trust-policy-design.md \
   /workspaces/claym/local/Tasuki/docs/superpowers/specs/
cp /home/vscode/tasuki-work/docs/adr/0010-trust-policy.md \
   /workspaces/claym/local/Tasuki/docs/adr/
```

利用者へ次のフルパスを伝える。

- `/workspaces/claym/local/Tasuki/docs/superpowers/specs/2026-08-12-trust-policy-design.md`
- `/workspaces/claym/local/Tasuki/docs/adr/0010-trust-policy.md`
- PR の URL

---

### Task 5: 振り返りを書き、Issue #116 を閉じる

**Files:**
- Create: `/home/vscode/tasuki-work/docs/retrospectives/2026-08-12-issue-116-trust-policy.md`

**Interfaces:**
- Consumes: Task 1〜4 の実施結果
- Produces: 振り返り。#135 への申し送りがここで確定する

- [ ] **Step 1: 振り返りを書く**

`docs/guides/retrospective.md` の 3 部構成（踏んだ罠 / 検査の穴 / 次への申し送り）に従う。
**再発条件まで書く。** 書けない罠は原因の特定が終わっていない。

最低限、次の 4 件を含める。

1. **`trustPolicyIgnoreAfter` が待機期間と組み合わさると検査を完全に無力化する。**
   再発条件: 「検査対象を絞る設定」と「入力そのものを絞る設定」が併存し、後者の範囲が
   前者を覆うとき。実測では検証に 8 秒かけたうえで終了コード 0 になった
2. **自分のスペックが #70 で入れた CI の絞り込みを無視していた。**
   再発条件: 直前の Issue で入れた仕組みを、次の Issue の見積りで数に入れ忘れるとき。
   「CI の 4 ジョブが各 +6 秒」と書いたが、install はすべて条件付きステップで、
   文書のみの PR では 1 回も走らない
3. **憲法の原則を読まずに引用した。** 再発条件: 引用元が記憶にあると思ったとき。
   原則 IX の本文は「1 PR は 1 つの論理的変更に留める（MUST）」で、
   「本数を規定していない」という結論は保ったが根拠を確かめていなかった
4. **overlay に成果物を置いて場所を伝えず、利用者が確認できなかった。**
   再発条件: 作業クローンと利用者のクローンが分かれているとき。フルパスを書けば足りる

「検査の穴」の節には、**除外リストが静かに効かなくなる 2 経路**（版指定の退化・依存木から
消えた版の除外行の残留）を書く。どちらも現時点で機械的な検査が無い。

「次への申し送り」には反映先を具体的に書く。

- ADR 0010（決定）/ 開発ガイド（手順）/ スペック（数値の正本）
- **#135 へ 2 経路**（上記の検査の穴）

- [ ] **Step 2: リンク検査を走らせる**

```bash
cd /home/vscode/tasuki-work
git add docs/retrospectives/2026-08-12-issue-116-trust-policy.md
node scripts/check-links.mjs
```

期待: 終了コード 0。

- [ ] **Step 3: コミットして push する**

```bash
cd /home/vscode/tasuki-work
git add docs/retrospectives/2026-08-12-issue-116-trust-policy.md
git commit -F - <<'MSG'
docs: #116 の振り返りを追加する

- trustPolicyIgnoreAfter が検査を無力化する機序と再発条件
- 自分のスペックが #70 の CI 絞り込みを無視していた件
- 除外リストが静かに効かなくなる 2 経路を #135 へ申し送り

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
git push
```

- [ ] **Step 4: #135 へ申し送りをコメントする**

```bash
cd /home/vscode/tasuki-work
gh issue comment 135 --body-file - <<'BODY'
## #116 からの申し送り: 検査が静かに効かなくなる経路を 2 本追加

`pnpm-workspace.yaml` に `trustPolicyExclude` を導入した（#116 / ADR-0010）。
この除外リストには、既存の 4 経路と同じ性質の穴が 2 つある。**どちらも CI は緑のまま。**

1. **版指定の退化**: 除外を `"semver@6.3.1"` ではなく `"semver"` と書くと、
   そのパッケージの**全版**が降格検査の対象外になる。乗っ取りが起きる新しい版も素通りする
2. **死んだ除外行の残留**: 除外した版が依存木から消えても行は残る。
   将来その版が再び現れたとき、黙って免除を与える。期限も検査も無いため気づく契機がゼロ

同じ穴は `minimumReleaseAgeExclude` にもある（こちらは期限コメントの運用のみで、
機械的な検査は無い）。#135 で検査を作るときは両方を対象にできる。
BODY
```

- [ ] **Step 5: PR がマージされたら Issue #116 を閉じる**

完了条件への回答を根拠つきでコメントしてから閉じる。

```bash
cd /home/vscode/tasuki-work
gh issue comment 116 --body-file - <<'BODY'
## 完了条件への回答

- [x] **適用コストを実測した** — 詳細は
  [スペック](https://github.com/tomohiroJin/tasuki-tools/blob/main/docs/superpowers/specs/2026-08-12-trust-policy-design.md)の
  「実測で確認した前提」節（数値の正本）
- [x] **導入する/しないを決め、理由を ADR に記録した** —
  [ADR-0010](https://github.com/tomohiroJin/tasuki-tools/blob/main/docs/adr/0010-trust-policy.md)（新規）。
  0008 への追記ではなく新規 ADR にしたのは、`docs/adr/README.md` が「ADR は不変の記録」と
  定めているため。0008 の決定は覆らないので Superseded ではなく併存

## Issue 本文の前提の検証

本文の主張はいずれも正しかった（pnpm 11.5.0 に `trustPolicy` が実在し、`no-downgrade` を
取る）。ただし本文にない性質が 2 つ見つかった。

- 判定は**公開日だけ**で行われ semver の系列を見ないため、旧系列の保守版は必ず偽陽性になる
- `trustPolicyIgnoreAfter` は `minimumReleaseAge` 以下の値にすると検査を実質無力化する

振り返り: `docs/retrospectives/2026-08-12-issue-116-trust-policy.md`
BODY
gh issue close 116
```

---

## Self-Review

**スペック網羅**: D1→Task 1 / D2→Task 1 の設定コメントと Task 2 の ADR / D3・D4→Task 1 の設定と Task 2・3 / D5→Task 3 の判断手順 / D6→Task 2（新規 ADR 0010）/ D7→Task 5 Step 4（#135 へ申し送り）/ D8→Task 2 の ADR と Task 3 の Renovate 小節 / D9→全体を 1 PR（Task 4）。スペックの「検証」表の 4 行のうち 3 行を Task 1 の Step 2・4・5 で再実行する。`trustPolicyIgnoreAfter: 10080` の再実行だけは行わない（採用しない設定を最終形に対して試す意味が無く、ブレスト中に実測済み）。

**未定の残り**: Task 4 Step 4 の CI 実測値のみ。CI を回すまで埋まらないため、その旨をステップ内に明記した。

**用語の一貫性**: 設定キーは `trustPolicy` / `trustPolicyExclude` / `trustPolicyIgnoreAfter`、エラーコードは `ERR_PNPM_TRUST_DOWNGRADE`、除外の書式は `"semver@6.3.1"` で全タスク統一。ADR のパスは `docs/adr/0010-trust-policy.md` で設定コメント・ガイド・一覧の 3 か所とも一致。
