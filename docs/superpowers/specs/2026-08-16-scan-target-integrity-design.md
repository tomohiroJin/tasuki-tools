# 走査対象の健全性（#135）— 設計正本

- **Issue**: [#135](https://github.com/tomohiroJin/tasuki-tools/issues/135)
- **日付**: 2026-08-16
- **前提となる規範**: [`docs/adr/0009`](../../adr/0009-ci-scope-and-checks.md)（CI が守る範囲と検査の配置。特に D2・D6）/
  憲法 原則 VII（検査は壊して確かめる）・原則 VIII（記録が正本）
- **この文書の位置づけ**: **経路の棚卸し・実測値・決定の正本はこの文書**。計画（plan）・タスク（tasks）・
  Issue 本文へ表を転記せず、ここを参照する。

## 1. 範囲

Issue #135 は起票時点で 4 経路だったが、その後 #116・#119・#103・#126 から申し送りが入り
**12 経路**になっている。本設計はそのうち **7 経路**を対象とする。

| 経路 | 内容 | 出典 | 扱い |
|---|---|---|---|
| ① | 変異検査は対応表を空にすると全部緑になる | #70 | **本 Issue** |
| ② | 構造監査は対象ディレクトリを失うと全指標 PASS を出す | #70 | **本 Issue** |
| ③ | `LIVE_DOCS` を部分的に削るとリンク検査が静かに縮む | #70 | **本 Issue** |
| ④ | shellcheck のグロブが非再帰で、サブディレクトリの `.sh` は無検査 | #70 | **本 Issue** |
| ⑧ | `check-links` は git 追跡下のファイルしか走査しない | #119 | **本 Issue** |
| ⑪ | 構造監査・ログ衛生が 11 パッケージ中 3 つしか走査しない | #103 | **本 Issue** |
| ⑬ | `node --test` の対象列挙がハードコードで、新しいテストが走らない | **本設計で発見** | **本 Issue** |
| ⑤⑥⑦ | `trustPolicyExclude` の版指定退化・死んだ除外行・キーと値の綴り誤り | #116 | 別 Issue（B群） |
| ⑫ | pnpm の供給網ポリシー検証がキャッシュで飛ぶ | #126 | 別 Issue（B群） |
| ⑨ | Constitution Check ゲートが plan 36 件中 4 件でしか実施されていない | #119 | 別 Issue（D-1） |
| ⑩ | `check-links` が拡張子なしパス・`path:line` の行番号を検証しない | #119 | 別 Issue（D-2） |

**選び方の根拠**: ①②③④⑧⑪⑬ は**すべて「宣言と実体がずれても誰も言わない」という同一の機序**で、
単一の仕組みで塞げる。⑤⑥⑦⑫ は pnpm 側の設定検証、⑨⑩ は検査の新設で、機序も直し方も異なる。

**#72 との順序**: ②と⑪は #72（パッケージ移設）が着手した瞬間に踏む。本 Issue は #72 の前に完了する。

### 本 Issue で扱わないもの

| 対象 | 理由 | 行き先 |
|---|---|---|
| ログ衛生の走査を `.tsx` へ広げる | ADR 0012 D1 がブラウザのコンソールまで射程に入れるかは**規範の判断**であり、走査対象の話ではない | 別 Issue（D-3）。§4 D7 |
| 構造監査の走査拡大で露出する既存違反の是正 | 測り直しと是正は別の作業。構造監査は非ゼロ終了しない計測器なので CI は緑のまま | #72 または別 Issue。§4 D8 |
| `findRelativeLinks` のネストした角括弧・タイトル付きリンク | #70 の deferred。⑩と同じ「判定が見ていない表記」 | 別 Issue（D-2） |
| `scripts/` を変異検査の対象にする | `mutation-check` の `detectRunner` が `package.json` 依存。ランナー拡張が要る | 申し送り。§7 |

## 2. Issue #135 本文との差異

| Issue 本文の記述 | 実測（2026-08-16・main `c2f2920`） |
|---|---|
| タイトル・完了条件が「4 経路」 | 申し送りで **12 経路**。本 Issue の範囲は **7 経路** |
| `scripts/mutations/*.patch` の 9 本 | **13 本**（#103 が 4 本追加）。`MUTATIONS` も 13 件で現在は一致している |
| 経路④の実証に `deploy/timer/probe.sh` を使用 | このファイルは**実在しない**（実証用に置いたもの）。現行の `.sh` は 6 本で、現行グロブが全件を捉えている |

## 3. 実測した事実

すべて main `c2f2920` の作業クローン `/home/vscode/tasuki-work` で測った。

### 3.1 workspace の実体は 11 パッケージ

```
packages/  timer-core  poker-core  protocol  rate-limit  ui
apps/      timer-sync  timer-web   poker-sync  poker-web  landing
           e2e
```

列挙手段は 2 つあり、**どちらも 11 件で一致した**。

| 手段 | 結果 |
|---|---|
| `pnpm -r list --depth -1 --json` | 12 件（**リポジトリルートを含む**）。ルートを除いて 11 |
| `git ls-files '*package.json'` | 11 件 |

**一致は偶然に依存する。** `git ls-files` は「`package.json` があるディレクトリ」を数えているだけで、
`pnpm-workspace.yaml` の glob を評価していない。glob が変われば両者は乖離する。§4 D2 で権威を定める。

### 3.2 テストディレクトリ名が割れている

| パッケージ | src の TS | テストディレクトリ | テストの TS |
|---|---|---|---|
| `packages/timer-core` | 14 | `test/` | 31 |
| `packages/poker-core` | 7 | `tests/` | 6 |
| `packages/protocol` | 2 | `tests/` | 1 |
| `packages/rate-limit` | 5 | `tests/` | 4 |
| `packages/ui` | **0** | `tests/` | **0** |
| `apps/timer-sync` | 42 | `test/` | 78 |
| `apps/timer-web` | 76 | `test/` | 98 |
| `apps/poker-sync` | 5 | `tests/` | 16 |
| `apps/poker-web` | 12 | `tests/` | 2 |
| `apps/landing` | 4 | `tests/` | 4 |
| `e2e` | **src なし** | `tests/` | 9 |

件数は `.d.ts` を除いた `.ts` + `.tsx`（`audit-structure.mjs` の `EXT_TS` と `readFilesRecursive` の規則に合わせた）。合計は src 167 件・test 249 件。

**「全パッケージの `src/` と `test/` を走査する」と素朴に導出すると `tests/` を静かに取りこぼす。**
導出だけに寄せると、経路②⑪を塞ぐつもりで新しい同型の穴を作る。**宣言＋照合が要る根拠はここにある。**

`packages/ui` は TS を 1 つも持たない（CSS トークンとフォントのみ）。`e2e` は `src/` を持たない。
**「走査対象が 0 件なら落とす」を一律に適用すると誤検知する。**

### 3.3 エントリポイントの実在（SC-027 の到達性測定に必要）

| パッケージ | エントリ | 実在 |
|---|---|---|
| `packages/timer-core` | `src/index.ts` | ○（現行の宣言） |
| `packages/poker-core` | `src/index.ts` | ○ |
| `packages/protocol` | `src/index.ts` | ○ |
| `packages/rate-limit` | `src/index.ts` | ○ |
| `packages/ui` | — | **無し**（TS が 0 件） |
| `apps/timer-sync` | `src/server.ts` | ○（現行の宣言） |
| `apps/timer-web` | `src/main.tsx` | ○（現行の宣言） |
| `apps/poker-sync` | `src/server.ts` | ○ |
| `apps/poker-web` | `src/main.tsx` | ○ |
| `apps/landing` | `src/main.tsx` | ○ |
| `e2e` | — | 無し（`src/` 自体が無い） |

### 3.4 ログ衛生の走査を広げたときの違反件数

本物の `findViolations` を import して測った。

| 走査範囲 | ファイル数 | 違反 |
|---|---|---|
| 現行（`timer-sync/src`・`poker-sync/src`・`rate-limit/src`、`.ts` のみ） | 52 | 0 |
| **全 11 パッケージの `src`、`.ts` のみ** | **120** | **0** |
| 全 11 パッケージの `src`、`.ts` + `.tsx` | 167 | **6** |

`.tsx` を含めたときの 6 件はすべて `apps/timer-web` の直接の `console`。

```
apps/timer-web/src/App.tsx:231
apps/timer-web/src/App.tsx:258
apps/timer-web/src/App.tsx:263
apps/timer-web/src/App.tsx:794
apps/timer-web/src/ui/History.tsx:47
apps/timer-web/src/ui/History.tsx:64
```

**`.ts` のままなら走査を全パッケージへ広げても CI は赤くならない。** 移行費用はゼロ。

### 3.5 `LIVE_DOCS` の被覆率

追跡下の `*.md` は **210 件**（本設計文書を追加する前の値）。`LIVE_DOCS` が覆うのは **36 件（17.1%）**。

**この件数は文書を足すたびに増える。** 実装・検証では直書きせず `git ls-files '*.md' | wc -l` で数える。

| `LIVE_DOCS` の各エントリ | 一致件数 |
|---|---|
| `README.md` / `AGENTS.md` / `CLAUDE.md` / `docs/README.md` | 各 1 |
| `docs/adr/` | 15 |
| `docs/guides/` | 7 |
| `deploy/` | 5 |
| `.github/` | 3 |
| `e2e/` | 1 |
| `.specify/memory/` | 1 |

外側の **174 件**はディレクトリ接頭辞 10 個で表せる。

| 接頭辞 | 件数 |
|---|---|
| `docs/superpowers/` | 68 |
| `docs/plans/` | 57 |
| `docs/timer/` | 14 |
| `.claude/skills/` | 10 |
| `docs/poker/` | 9 |
| `docs/retrospectives/` | 8 |
| `.specify/templates/` | 5 |
| `SECURITY.md` | 1 |
| `packages/protocol/README.md` | 1 |
| `packages/ui/README.md` | 1 |

**`SECURITY.md` がリンク検査の外にある。** §4 D3 で `LIVE_DOCS` へ入れる。

### 3.6 未追跡の Markdown は 0 件

`git ls-files --others --exclude-standard '*.md'` は **0 件**。
経路⑧の手当てを入れても、導入時に赤くならない（対照として使える）。

### 3.7 shellcheck の対象は拡大しても増えない

| 手段 | 対象 |
|---|---|
| 現行のグロブ `deploy/*.sh deploy/lib/*.sh scripts/*.sh` | 6 本 |
| `git ls-files '*.sh'` から `.specify/` を除外 | **同じ 6 本** |

```
deploy/deploy.sh  deploy/lib/common.sh  deploy/setup.sh
scripts/gen-countdown-voices.sh  scripts/gen-sounds.sh  scripts/gen-voices.sh
```

**新しい警告は出ない。** 経路④は「今は漏れていないが、サブディレクトリに置いた瞬間に漏れる」型。

### 3.8 対応表と実体の現在の一致状況

| 対応表 | 宣言 | 実体 | 一致 |
|---|---|---|---|
| `MUTATIONS` ↔ `scripts/mutations/*.patch` | 13 | 13 | ○ |
| `ci.yml` の `node --test` 列挙 ↔ `scripts/**/*.test.mjs` | 4 | 4 | ○ |

**どちらも現在は一致しているが、ずれても誰も言わない。** ⑬は本設計の作業中に発見した
（新しいテストを足す作業そのものが、この穴を踏む）。

### 3.9 構造監査は一度も非ゼロで終了しない

`scripts/audit-structure.mjs` に `process.exit` は存在しない。ADR 0009 D2 の
「構造監査は値を出すだけ。合否は自己テストと変異検査で取る」に従った実装である。
**走査対象を広げても CI は赤くならない。**

#### 実装後に測り直した結果（2026-08-16・走査 3 → 10 パッケージ）

走査対象を宣言駆動へ変えた前後で、同じスクリプトを走らせて比較した実測値。

| 指標 | 変更前 | 変更後 |
|---|---|---|
| SC029（テスト名の SC-ID） | 7 | **15** |
| SC031（前提の段の検証） | **0（PASS）** | **3（未達）** |
| SC032（GWT マーカー） | 1089/1124（96.9%） | **1132/1345（84.2%）** |
| SC036（it/test 総数） | 1466 | **1788** |
| SC027 / SC028 / SC030 / SC035 / SC039 | 0 / 0 / 3 / 0 / 公開記号 34 件 | **すべて不変** |

**要点は SC031 が「0＝PASS」から 3 件の未達へ変わったこと。** 走査外に違反が 3 件隠れていた。

**この結果は #103 が `1f2fc66` 時点で別の方法（本物の `readFilesRecursive` と
`splitIntoTestBodies` を import して測る）で予測した値と一致した**（走査外に SC031 が 3 件・
SC029 が 8 件で合計 15・SC032 は全体で 84.2%）。3 か月前の実測が現行 main でもそのまま成立した。

SC027・SC028・SC030 が動かなかったのは、**新しい走査対象に該当がなかったため**であり、
計測器の断線ではない。レビューで指標の定義（`sc027UnreachableModules` /
`sc028DuplicateTestDoubles` / `sc030CallNamesInNames`）を読み、新規 7 テストディレクトリに
`Fake`/`Spy`/`Stub`/`Mock` の重複が 0 件・「呼ぶ」系のテスト名が 0 件・新規 6 パッケージの
src 35 件がすべてエントリ以外から相対 import で参照されていることを実測して裏付けた。

**露出した未達（SC029 15 件・SC031 3 件・SC032 84.2%）の是正は本 Issue の範囲外**（§4 D8）。

### 3.10 git の pathspec で `**` は特別扱いされない。`*` が `/` を跨ぐ

`scripts/lib/scan-targets.test.mjs` が存在する状態での実測。

```
git ls-files 'scripts/**/*.test.mjs'   → 1 件
git ls-files 'scripts/*/*.test.mjs'    → 1 件（** と完全に同じ）
git ls-files 'scripts/*.test.mjs'      → 5 件
```

**`**` は `*` と同義で、`/` を跨ぐ単なるワイルドカードにすぎない。** したがって
`scripts/**/*.test.mjs` は `scripts/*/*.test.mjs` と同じ意味になり、
**`scripts/` 直下のファイルを静かに取りこぼす**（直下の 4 本が対象から落ちる）。

`*` が `/` を跨ぐので、**再帰列挙には `scripts/*.test.mjs` だけで足りる**。

**`*.test.mjs` を使ってはならない。** `packages/ui/tests/tokens.test.mjs` に一致する。
これは `packages/ui` 自身のテスト（`node --test` で走る）であり、
`ci.yml` の `quality` ジョブが列挙しているものとは別に存在する。
⑬の実体は **`scripts/` に限定する**。

#### 訂正の記録（2026-08-16）

本節は当初「`git ls-files 'scripts/**/*.test.mjs'` は **0 件**を返す」と書いていた。
**測定自体は正しかった** — 測った時点では `scripts/lib/` が存在せず、
`scripts/**/*.test.mjs` に一致しうるファイルが 1 つも無かったためである。
誤っていたのは**そこから引いた一般化**（「`**` を書くと 1 件も一致しない」）の方だった。

この訂正は表現の問題ではない。**危険の向きが逆**である。

| 誤った理解 | 実際 |
|---|---|
| `**` は 0 件を返すので、書けば必ず空振りが露見する | `**` は**非 0 件を返しうる**。一部だけ一致して残りを静かに落とす |

「0 件なら落とす」検査は前者なら救えるが、後者は救えない。
**本 Issue が塞ごうとしている性質そのものを、対策の記述が持っていた。**

## 4. 決定

### D1: 走査対象は宣言し、実体と全単射で照合する

各検査は走査対象を**明示的に宣言**する。実行時に実体を列挙し、次の両方向で照合する。

- **宣言にあるが実在しない** → 赤（経路②を塞ぐ。移設した瞬間に落ちる）
- **実在するが宣言に無い** → 赤（経路⑪を塞ぐ。新パッケージが黙って対象外にならない）

除外は**理由を必須**とする。除外に書いた対象が実在しなくなった場合も「宣言にあるが実在しない」
として赤にする（#116 が申し送った経路⑥「死んだ除外行の残留」と同型の穴を持ち込まないため）。

**完全自動導出を採らない根拠は §3.2**。テストディレクトリ名が `test` と `tests` で割れており、
導出規則を手で書くと必ずどちらかを取りこぼす。宣言があれば取りこぼしは照合で赤くなる。

### D2: 実体の権威はツール自身。自作の再実装を禁ずる

| 実体 | 権威 |
|---|---|
| workspace のパッケージ一覧 | `pnpm -r list --depth -1 --json`（**ルートを除く**） |
| 追跡下のファイル一覧 | `git ls-files` |
| 未追跡かつ gitignore 対象外のファイル一覧 | `git ls-files --others --exclude-standard` |

**`pnpm-workspace.yaml` を手で解析してはならない**（MUST NOT）。手書きの字句解析は 3 回続けて
新しい検出漏れを作った前科がある。**`git ls-files '*package.json'` で workspace を代替してもならない**
（MUST NOT）。§3.1 のとおり両者の一致は偶然であり、これは pnpm の解決規則の自作再実装にあたる。

**制約**: `pnpm -r list` は `pnpm install` 済みであることを要求する。`docs` ジョブは
`pnpm install` を走らせない（ADR 0009 の設計）。したがって **`check-links` は
workspace の列挙を使わない**。実際に不要である。

### D3: `LIVE_DOCS` は全分割にする

**追跡下の全 `*.md` が、`LIVE_DOCS` か除外宣言のどちらか一方に必ず属すること**を検査する。

**「各エントリが 1 件以上に一致すること」では経路③を塞げない。** 経路③の攻撃は
エントリの**削除**であり、削除すれば照合対象ごと消えて緑のままになる。これは経路①
（対応表から項目を消す）と同じ穴を、対策のつもりで再生産することになる。

実体側を全分割すれば、`"docs/guides/"` を削除した瞬間にその配下の 7 件が無所属になって赤くなる。
必要な除外宣言は §3.5 の 10 項目から `SECURITY.md` を除いた **9 個の接頭辞**（173 件）。

あわせて **`SECURITY.md` を `LIVE_DOCS` へ入れる**（除外と明記するより検査した方がよい。1 件）。

### D4: `check-links` は走査対象だけを広げ、存在判定は追跡下に据え置く

| 用途 | 現行 | 変更後 |
|---|---|---|
| 走査対象（`main()` の `gitList(["ls-files","*.md"])`） | 追跡下のみ | **追跡下 ∪（未追跡かつ gitignore 対象外）** |
| 存在判定（`trackedPaths()`） | 追跡下のみ | **変更しない** |

**存在判定を広げてはならない**（MUST NOT）。広げると「未追跡ファイルへのリンクがローカルでは
通り、CI では落ちる」— PR-2 で踏んだ食い違いの、向きが逆なだけの再来になる。

走査対象だけを広げる変更は**厳しくなる方向にしか動かない**。新規文書を 2 本書いて相互に
リンクした場合、`git add` するまでローカルで赤くなるが、これは CI と同じ判定であり
`git add` で解消する。エラーメッセージにその旨を書く。

`gitignore` 対象（`apps/timer-sync/.env`・`dist/`・SDD の作業ディレクトリ）は**従来どおり見ない**。
食い違いの原因はそちらであり、意図した設計は保つ。

### D5: 走査量を常に出力する

緑のときも「何を見て、何件を対象にしたか」を出す（MUST）。

```
[audit-structure] 走査対象: src 9 パッケージ / 167 件、test 10 パッケージ / 249 件
```

**#103 の「11 中 3 しか見ていない」が長く気づかれなかったのは、表が PASS を並べる一方で
走査量を一度も出していなかったため。** 数字が出ていれば人が違和感を持てる。

ログ衛生は**見ていない量も出す**（§4 D7）。

### D6: 経路①は塞ぎきれない。限界を明記する

`MUTATIONS` ↔ `scripts/mutations/*.patch` の全単射と「0 件なら赤」を入れる。これで
「対応表から項目だけを消す」（Issue が名指しした最短経路）は赤くなる。

**ただし対応表の項目と patch ファイルを両方消せば、全単射は保たれたまま緑になる。**
件数の下限を直書きする対策は採らない — `scripts/audit-log-hygiene.mjs` の docstring が
**「件数の下限は直書きしない。ファイルが減るたびに下限を下げるのが赤を消す最短経路になり、
対応表から項目を消すのと同じ穴になる」**と既に規範化している。

したがって **「経路①を塞いだ」とは書かない**。patch ファイルの削除が diff に現れることを
レビューの拠り所とし、限界を ADR に残す。

### D7: ログ衛生の走査は全パッケージへ広げるが、拡張子は `.ts` に据え置く

走査対象のパッケージは D1 に従って全 11 パッケージへ広げる（§3.4 のとおり違反 0 件・移行費用ゼロ）。

**拡張子は `.ts` のまま**とする。`.tsx` を含めると既存 6 件が赤になるが、それは
「ブラウザの `console` が ADR 0012 D1 の射程に入るか」という**規範の判断**であり、
走査対象の健全性とは別の問題である。

**沈黙はやめる。** 検査の出力に「`.tsx` を N 件走査していない」を明示する（MUST）。
規範判断は別 Issue（D-3）へ送る。

### D8: 構造監査は測り直すところまで。露出した違反の是正は別

走査対象を 11 パッケージへ広げると、指標の値が動く（§3.9）。
**#135 は「正しく測り直す」ところまでを範囲とする。**

構造監査は非ゼロ終了しない計測器（§3.9）なので CI は緑のまま。露出した違反の是正は
#72 または別 Issue へ送る。実装時に現行 main で測り直し、値をこの文書へ追記する。

### D9: 計測器の健全性は合否を持つ。測定値の合否とは区別する

ADR 0009 D2 は「構造監査は値を出すだけ。合否は自己テストと変異検査で取る」と決めている。
D1 の照合はこの決定と**矛盾しない** — 落ちるのは**測定値**ではなく**計測器そのもの**だからである。

- 測定値（SC027〜SC039）が目標に届かない → **落ちない**（従来どおり）
- 走査対象の宣言と実体がずれている → **落ちる**（新設）

この区別を ADR-0014 に明記し、ADR 0009 D2 からも参照する。

### D10: 共有モジュールに集約する。各スクリプトへの個別実装を禁ずる

照合の実装は `scripts/lib/scan-targets.mjs` に 1 つだけ置く。同型のコードを 4〜5 箇所へ
散らすと「片側だけ直す」の再発源になる（#119 で 2 度踏んだ）。

## 5. 設計

### 5.1 共有モジュール `scripts/lib/scan-targets.mjs`

**判定は純粋関数、I/O と `process.exit` は呼び出し側**（既存 `audit-log-hygiene.mjs` の方針に合わせる）。
追加依存は禁止。Node 標準の `fs` / `path` / `child_process` のみ。

```js
// 実体の列挙（I/O あり）
export function listWorkspacePackages(repoRoot)
// → ["apps/landing", ..., "e2e"]（リポジトリルートを除いた 11 件）
//    pnpm -r list --depth -1 --json を権威とする（D2）

export function listTrackedFiles(repoRoot, patterns)
// → git ls-files

export function listRepoFiles(repoRoot, patterns)
// → git ls-files ∪ git ls-files --others --exclude-standard

// 照合（純粋関数・I/O なし）
export function diffTargets(declared, actual)
// → { missing: string[], unexpected: string[] }

export function formatTargetDiff(name, diff, scanSummary)
// → 人が読む説明文（D5 の走査量を含む）
```

### 5.2 各検査への結線

| 検査 | 宣言 | 実体 | 落ちる条件 |
|---|---|---|---|
| `mutation-check.mjs` | `MUTATIONS[].patch` | `scripts/mutations/*.patch` | 全単射が崩れる / 0 件 |
| `audit-structure.mjs` | パッケージ → `{ srcDir, testDir, entry }`＋理由つき除外。**src と test は独立に宣言する** | `listWorkspacePackages` | 全単射が崩れる |
| `audit-log-hygiene.mjs` | パッケージ → `src` ディレクトリ＋理由つき除外 | `listWorkspacePackages` | 全単射が崩れる |
| `check-links.mjs` | `LIVE_DOCS` ＋ 理由つき除外接頭辞 | `listTrackedFiles(["*.md"])` | 全分割が崩れる（無所属の `.md` がある） |
| `ci.yml` shellcheck | 除外 `.specify/scripts/**` のみ | `listTrackedFiles(["*.sh"])` | 除外が実在しない / 対象 0 件 |
| `ci.yml` `node --test` | なし（`scripts/` 配下の全件） | `listTrackedFiles(["scripts/*.test.mjs"])` | 対象 0 件 |

`audit-structure` の宣言は §3.2 の実測に従い、パッケージごとに `test` / `tests` を明示する。
`packages/ui` は src・test とも TS が 0 件なので**両方から**除外する。
`e2e` は `src/` を持たないので **src からのみ**除外し、`tests/`（9 件）は走査対象に含める。
したがって src の対象は 9 パッケージ・167 件、test の対象は 10 パッケージ・249 件になる。

### 5.3 CI からの結線（④⑬）

YAML に対象を書かない。薄い CLI を共有モジュールの上に置き、`xargs` で渡す。

```yaml
- name: shellcheck
  shell: bash
  run: |
    set -euo pipefail
    targets="$(node scripts/list-scan-targets.mjs shell)"
    shellcheck -x --source-path=deploy --severity=warning $targets

- name: scripts の自己テスト
  shell: bash
  run: |
    set -euo pipefail
    targets="$(node scripts/list-scan-targets.mjs script-tests)"
    node --test $targets
```

**`| xargs` で繋いではならない**（MUST NOT）。GitHub Actions の既定シェルは `bash -e` で
`pipefail` を設定しないため、**対象生成が失敗しても後段が成功すればジョブは緑になる**。
本 Issue が塞ごうとしている性質そのものを、対策の実装で作ることになる。

コマンド置換への代入なら `set -e` が終了コードを拾う（`x="$(false)"` は 1 を返す）。
`$targets` をクォートしないのは意図的で、対象パスに空白が無いことに依存する（§3.7・§3.10 の実測）。

`list-scan-targets.mjs` は対象が 0 件なら非ゼロで終了する。
pathspec は §3.10 に従い `scripts/*.test.mjs`（`**` を使わない）と `*.sh` を使う。
これにより ADR 0009 D6 の「`deploy/**` と `scripts/**` を対象」という記述と実装が初めて一致する。

### 5.4 エラー表示

```
[audit-structure] 走査対象の宣言が実体とずれています
  宣言にあるが実在しない: packages/timer-core/test    ← 移設したなら宣言を直す
  実在するが宣言に無い:   packages/notification       ← 対象に入れるか、理由つきで除外する
  現在の走査対象: src 9 パッケージ / 167 件、test 10 パッケージ / 249 件
```

**必ず 3 点**を出す: ずれの向き・その向きごとの直し方・現在の走査量。

## 6. 検証

### 6.1 EARS（Issue #135 の「振る舞い」節へ転記する）

- **E1** WHEN 走査対象として宣言されたディレクトリまたはファイルが実在しない、
  THE 検査 SHALL 非ゼロで終了し、実在しない宣言を名指しする。
- **E2** WHEN workspace に存在するパッケージが走査対象の宣言にも除外宣言にも含まれない、
  THE 構造監査およびログ衛生の検査 SHALL 非ゼロで終了し、そのパッケージを名指しする。
- **E3** WHEN 追跡下の Markdown が `LIVE_DOCS` にも除外宣言にも属さない、
  THE リンク検査 SHALL 非ゼロで終了し、無所属のファイルを名指しする。
- **E4** WHEN 走査対象が 0 件になる、THE 検査 SHALL 非ゼロで終了する。
- **E5** WHEN 変異の対応表と `scripts/mutations/*.patch` が全単射でない、
  THE 変異検査 SHALL 非ゼロで終了し、片側にしか無い項目を名指しする。
- **E6** THE 各検査 SHALL 成否によらず走査量（対象の件数）を出力する。
- **E7** THE ログ衛生の検査 SHALL 走査していない `.tsx` の件数を出力する。
- **E8** WHEN 未追跡かつ gitignore 対象外の Markdown が存在する、
  THE リンク検査 SHALL それを走査対象に含める。
- **E9** THE リンク検査の存在判定 SHALL 追跡下のパスのみを対象とする。
- **E10** WHEN `.specify/scripts/` 配下でない `.sh` がリポジトリに追加される、
  THE shellcheck SHALL 配置場所によらずそれを検査する。
- **E11** WHEN `scripts/` 配下に `*.test.mjs` が追加される、THE CI SHALL それを実行する。

### 6.2 破壊検証の手順（7 経路すべてで実施）

過去に「壊せていないのに緑を検出扱いした」失敗を 5 回踏んでいる。**4 段で行う**。

1. **対照** — 壊さずに走らせ、**緑であることと走査件数**を記録する
2. **壊す** — 編集後に `grep -c` などで**壊れたこと自体を先に確認**する
3. **赤を見る** — 終了コードだけでなく**メッセージの内容**まで確認する（別の理由で赤くなっていないか）
4. **戻す** — `git checkout` に頼らず、**検証前にコミットしておく**（罠 24・31）

| 経路 | 壊し方 |
|---|---|
| ① | `MUTATIONS` から 1 件消す（patch は残す） / `MUTATIONS` を `[]` にする |
| ② | 宣言したテストディレクトリを一時的に改名する |
| ③ | `LIVE_DOCS` から `"docs/guides/"` を消す |
| ④ | `deploy/timer/probe.sh` に SC2045 を含むスクリプトを置く |
| ⑧ | 未追跡の `.md` にリンク切れを書いて `git add` せずに走らせる |
| ⑪ | 宣言から `packages/rate-limit` を消す / ダミーパッケージを足す |
| ⑬ | `scripts/lib/scan-targets.test.mjs` を足して自動で走ることを確認、対象 0 件で赤を確認 |

**CI で赤くなることの確認**は、使い捨てブランチに破壊コミットを積んで push し、
赤くなった run の URL を Issue へ残してブランチを削除する。

### 6.3 恒真化の確認（できないことの明示）

`mutation-check` の `detectRunner` は対象パッケージの `package.json` から走者を決める。
`scripts/` は `package.json` を持たないため、**`scan-targets.mjs` を変異検査で守ることは今回できない**。

代替として、`diffTargets` を常に空の差分を返す実装へ差し替え、
`scripts/lib/scan-targets.test.mjs` と 7 経路の破壊検証がすべて赤になることを手で確認する。
ランナー拡張は §7 の申し送りとする。

### 6.4 単体テスト

`scripts/lib/scan-targets.test.mjs` を新設し、`diffTargets` / `formatTargetDiff` を検証する。
⑬により、このテストは**足した瞬間に CI へ乗る**（⑬自身の対照実験になる）。

## 7. 残るリスクと申し送り

| 項目 | 内容 | 行き先 |
|---|---|---|
| 経路①の残余 | 対応表の項目と patch を**両方**消せば緑のまま（D6） | ADR-0014 に限界として明記 |
| `scripts/` の変異検査 | `detectRunner` が `package.json` 依存。ランナー拡張が要る | 申し送り（新 Issue 化は利用者判断） |
| 構造監査の露出違反 | 走査拡大で SC031 等に既存違反が現れる（D8） | #72 または別 Issue |
| `.tsx` の射程 | ADR 0012 D1 がブラウザまで及ぶか（D7） | 別 Issue（D-3） |
| 共有モジュールへの一点集中 | `scan-targets.mjs` が壊れると全検査が壊れる | 単体テストと破壊検証で守る（§6.2・§6.4） |
| `pnpm -r list` への依存 | `pnpm install` 済みを要求する。`docs` ジョブでは使えない | D2 の制約として明記済み |

### 切り出す新 Issue

| Issue | 中身 | 由来 |
|---|---|---|
| **B群** | pnpm 供給網設定の退化を検出する（⑤版指定の退化・⑥死んだ除外行・⑦綴り誤り・⑫検証キャッシュ） | #116 / #126 |
| **D-1** | Constitution Check ゲートの空文化（plan 36 件中 4 件） | #119 |
| **D-2** | `check-links` が見ていない表記（⑩拡張子なしパス・`path:line` の行番号・ネストした角括弧・タイトル付きリンク） | #119 / #70 deferred |
| **D-3** | ログ衛生の射程に `.tsx` を含めるか（ADR 0012 D1 の解釈・既存 6 件の扱い） | 本設計 D7 |

**D-2 に #70 の deferred 2 件を同居させる。** 単独では宛先を失う（期限つき・条件つきの約束を
たらい回しにした前科が 2 度ある）。

## 8. 成果物

| 種別 | 対象 |
|---|---|
| 新規 | `scripts/lib/scan-targets.mjs` / `scripts/lib/scan-targets.test.mjs` / `scripts/list-scan-targets.mjs` |
| 変更 | `scripts/mutation-check.mjs` / `scripts/audit-structure.mjs` / `scripts/audit-log-hygiene.mjs` / `scripts/check-links.mjs` / `.github/workflows/ci.yml` |
| 新設 | `docs/adr/0014-scan-target-integrity.md` |
| 追記 | `docs/adr/0009-ci-scope-and-checks.md`（2026-08-12 の追記から #135・ADR-0014 を参照）/ `.specify/memory/constitution.md`（原則 VII の適用範囲）/ `docs/guides/development.md`（新パッケージ追加時に赤くなる検査と直し方） |
| 更新 | Issue #135（タイトル・範囲・EARS・完了条件）/ 新 Issue 4 本の起票 |
| 振り返り | `docs/retrospectives/2026-08-16-issue-135-scan-target-integrity.md` |

**PR は 1 本**（ADR 0013 の既定「1 Issue = 1 PR」）。7 経路は同一の仕組みで塞ぐため、
分けると仕組みが中途半端な状態を経由する。

DoD 8 項目のうち **2（E2E）は該当なし**（利用者の通る経路は変わらない）。
**4（変異による恒真化確認）は §6.3 の制約により部分的**。理由を PR に明記する。
