# R1 検査系（scripts）の整理（#361）— 実装計画

- **Issue**: [#361](https://github.com/tomohiroJin/tasuki-tools/issues/361)（親 [#360](https://github.com/tomohiroJin/tasuki-tools/issues/360)）
- **設計正本**: [`2026-10-13-large-refactoring-design.md`](../specs/2026-10-13-large-refactoring-design.md) §5.1
- **日付**: 2026-10-13
- **実測時点**: main `e9180c9`

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 動かす前に全検査の出力を基準として固定し（Task 0）、新しい検査は赤から書く（Task 1） |
| II. 技術選定は ADR を通す | 該当なし | 依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーに触れない |
| IV. 境界の型安全 | 該当なし | 境界の検証に触れない |
| V. 実画面検証 | 該当なし | 利用者の通る経路は変わらない。実経路は「CI と同じ起動で全検査を流す」（Task 0・Task 4） |
| VI. 依存は内向き | 通過 | スクリプト同士の取り込みを許可表で固定する（Task 1）。分けた判定は入口から一方向に読まれる（Task 2） |
| VII. 検査は壊して確かめる | 通過 | 新しい検査は壊して赤を見る（Task 1）。走査の配線テスト（`scan-target-wiring.test.mjs`）を緩めずに通す（Task 2） |
| VIII. 記録が正本 | 通過 | 見送った項目と理由はこの計画と #361 に残し、設計正本 §5.1 へ追記する |
| IX. 小さく回す | 通過 | PR 1 本。デプロイは伴わない。`mutation-check.mjs` の分割は #94 PR 3 とぶつかるので別の Issue へ出す（§2） |
| X. 抽象は実需で | 通過 | `docs/adr/0007` の 20 行の基準に満たない重複は抽出しない（§2 の見送り） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密・個人情報を扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 1. 着手時点の実測（Issue 本文の前提との差）

Issue 本文（2026-10-12 起票）の前提を、1 つずつ現物で確かめた。**前提の半分は、測ると成り立たなかった。**

| Issue 本文の前提 | 実測 | 確かめた場所 |
|---|---|---|
| import の解析と解決が 4〜5 通りあり、同じ知識の写し | **同じ知識なのは「相対指定子を `.ts` に読み替える解決」の 2 つだけで、片方は 6 行**。抽出（指定子を拾う正規表現）の 3 つは、**わざと違う意味**を持つ（下の 3 行） | 下の各行 |
| 〃 `audit-structure.mjs:69` | 到達性（SC-027）のために、`import` / `export ... from` と動的 import から指定子を拾う | `extractImportSpecifiers` |
| 〃 `audit-dependency-direction.mjs:238,246` | **越境を見逃さないために広く拾う**（`.mjs` を含む 8 拡張子、`from` / `import(` の直後なら何でも）。狭めると検査が弱まる | `TASUKI_SPECIFIER` / `RELATIVE_SPECIFIER` と `SCANNED_EXTENSIONS` の注記 |
| 〃 `audit-web-sync-boundary.mjs:210-221` | **行単位で、コメントの中も読む**ことを注記で明言している（`./sync/client.js を` のような字面も拾う）。`react-dom/client` の誤検知を避ける固有の工夫がある | `needleAppearsAsSpecifier` の注記 |
| 〃 `audit-assembly-wiring.mjs:134` | import の行かどうかを判定するだけ（行頭の `import`）。指定子は解析しない | `isImportLine` |
| 解決の写し | `audit-structure.mjs:84-106`（22 行）と `audit-timer-classes.mjs:256-261`（6 行）。**候補の並びが違う**（後者は指定子そのものも候補に入れ、`.jsx` も外す）。重なっている知識は 6 行ぶん | 両関数 |
| スクリプト同士が互いを import している（隠れたライブラリ） | 2 件ある。**どちらも単一の情報源を守るための取り込みだった**: `audit-public-surface` は走査の宣言 `SCANNED_PACKAGES` を、`audit-ui-components` は web アプリの導出 `listWebAppDirs` を、写さずに取り込んでいる。問題は取り込みそのものではなく、**許可された取り込みと、そうでない取り込みの区別が無いこと** | `audit-public-surface.mjs:99`・`audit-ui-components.mjs:64` |
| `SCANNED_PACKAGES` を `scripts/lib/` へ移す | **移すと、走査の配線テストが壊す対象を失う。** `scan-target-wiring.test.mjs` は `audit-structure.mjs` の**複製**を書き換えて（`runScriptCopy`）宣言を壊し、赤を確かめる（`:111-120,228-261,1189-1340` ほか）。宣言が `lib/` にあると、複製の書き換えでは届かない | `scan-target-wiring.test.mjs:53-64` |
| `REPO_ROOT` が 12 本にある | 15 本にあり、**意味が 2 通り**（スクリプトの 1 つ上 11 本、`git rev-parse --show-toplevel` 4 本）。各 1〜3 行 | `grep -n "REPO_ROOT =" scripts/*.mjs` |
| 小さな写し（`escapeRegExp`・`unescapeIdent`・`readDeclaredSources`・`main()` の骨組み） | 各 3〜10 行 | 各ファイル |
| `mutation-check.mjs` 2,341 行 | **うち 94〜1,606 行（約 1,500 行）が変異の宣言の表 `MUTATIONS`**。機構は約 730 行 | `mutation-check.mjs:94` |
| 〃 | **直近 2 週間で 10 コミットが触った、最も熱いファイルの 1 つ。** #94 PR 3 が変異 m162〜m164 の宣言を足す予定 | `git log --since=2026-09-28` |
| `audit-structure.mjs` 2,307 行 | 中身は 3 つの層に分かれている: ①指標の判定（純粋関数。38〜1,070 行）②走査の宣言と照合（1,071〜1,945 行）③組み立て（`runAudit`・`main`。1,946 行〜） | ファイルの区切りコメント |
| 〃 | **変異のパッチは 1 本も当たっていない**（`scripts/mutations/` に `audit-structure.mjs` を書き換えるパッチは無い） | パッチの `+++ b/` 行 |

## 2. この PR でやること・やらないこと

**やること（PR 1 本）**

1. **スクリプト同士の取り込みを許可表で固定する検査を足す**（Task 1）。いまある 2 件を理由つきで載せ、表に無い取り込みは落とす。
   決まりを文書でなくコードで守らせる（設計正本 §2）
2. **`audit-structure.mjs` の①指標の判定を、`scripts/lib/structure/` の 4 つのモジュールへ移す**（Task 2）。②と③は入口に残す。
   入口が「何を・どこから・どう組み立てて測るか」だけを持ち、判定の中身はモジュールが持つ形にする

**やらないこと（理由つき）**

| 項目 | 理由 |
|---|---|
| import の抽出（指定子を拾う正規表現）を 1 つにする | 3 つは意味が違う（§1）。1 つにすると、`audit-dependency-direction` が狭まって越境を見逃すか、`audit-structure` が広がって到達しないモジュールを見逃す。**どちらも検査を弱める** |
| 解決（`.js` → `.ts`）を 1 つにする | 重なる知識は 6 行。`docs/adr/0007` 基準 2（20 行未満は抽出しない）に満たない。候補の並びも違い、そろえると片方の判定が変わる |
| `SCANNED_PACKAGES`・`listWebAppDirs` を `lib/` へ移す | 宣言を移すと、配線テストが壊して確かめる対象を失う（§1）。取り込みは単一の情報源を守るためのものなので、**許可表で明示して残す**（Task 1） |
| `REPO_ROOT`・`escapeRegExp`・`unescapeIdent`・`readDeclaredSources`・`main()` の骨組み | 各 10 行以下。基準 2 に満たない。`REPO_ROOT` は意味も 2 通りある |
| `mutation-check.mjs` の分割（宣言の表を別ファイルへ） | **#94 PR 3 が同じ表に宣言を足す。** いま動かすと、PR 3 が必ずぶつかる。#94 PR 3 のマージ後に、別の Issue（#380）で行う |

## 3. 振る舞いを保つ方法

**「変えない」の定義**（設計正本 §4.1 の「検査」の行）: CI が流す全検査について、**標準出力・標準エラー・終了コードが変更前と一致する**。
あわせて、scripts の自己テスト（`node --test $(node scripts/list-scan-targets.mjs script-tests)`）が、**件数も含めて**変更前と同じく緑であること。

## 4. タスク

### Task 0: 基準を固定する（コードは変えない）

- 作業ブランチを main から切った直後に、次を流して出力を保存する（保存先は作業者の手元の一時ディレクトリ。リポジトリには入れない）

  ```bash
  for s in audit-structure audit-public-surface audit-dependency-direction audit-web-sync-boundary \
           audit-ui-components audit-timer-classes audit-log-hygiene audit-assembly-wiring \
           audit-domain-error-shape audit-domain-side-effects audit-plan-gate audit-supply-chain-config \
           check-links; do
    node scripts/$s.mjs >"$BASE/$s.out" 2>"$BASE/$s.err"; echo $? >"$BASE/$s.code"
  done
  node --test $(node scripts/list-scan-targets.mjs script-tests) 2>&1 | grep -E '^# (tests|pass|fail)' >"$BASE/script-tests.summary"
  ```

- **確かめる**: 全検査が終了コード 0。自己テストが全緑。`audit-structure.mjs` の表（SC027〜SC039 の値）が保存されている
- 所要: 5 分

### Task 1: スクリプト同士の取り込みを許可表で固定する

**先に書く赤いテスト**: `scripts/script-imports.test.mjs`（新規）

- 対象は `scripts/*.mjs` のうち、テスト（`*.test.mjs`）と `scripts/lib/` を除く追跡下のファイル。**列挙は `listTrackedFiles` で実体から導く**（`docs/adr/0014`。名指しで並べない）
- 各ファイルの相対の取り込みのうち、`./lib/` 以外を拾い、許可表 `ALLOWED_SCRIPT_IMPORTS` と照らす
  - 許可表の 1 行: `{ from, to, names, reason }`。いまの 2 件（`audit-public-surface` → `audit-structure` の `SCANNED_PACKAGES`・`hasScanTarget`、`audit-ui-components` → `audit-web-sync-boundary` の `listWebAppDirs`）を、理由（単一の情報源・配線テストが宣言を壊せる位置）つきで載せる
- テストの項目（Given/When/Then。`docs/adr/0006`）
  1. 表に無い取り込みがあれば落ち、`from → to` を名指しする
  2. 表にある取り込みでも、表に無い名前を取り込んでいれば落ちる（取り込みが黙って太るのを止める）
  3. 表の行が実体に 1 件も一致しなければ落ちる（死んだ許可。`docs/adr/0014` 決定 2 の形）
  4. 走査対象が 0 件なら落ちる（`hasZeroScanTargets`。ADR-0014 決定 8）
  5. 走査量（ファイル数・取り込み数）を出す（同 決定 6）
- 判定の本体は純粋関数（ファイルの一覧と中身を受け取る）にし、1〜3 は架空の入力で赤 → 緑にする。そのうえで、実リポジトリに対して緑になることを見る

**確かめる（壊して赤を見る。原則 VII）**

- `audit-ui-components.mjs` に `import { WEB_APPS } from "./audit-web-sync-boundary.mjs";` を一時的に足す → 2 で落ちる
- `audit-timer-classes.mjs` に `import { SCANNED_PACKAGES } from "./audit-structure.mjs";` を一時的に足す → 1 で落ちる
- 許可表の 1 行の `to` を存在しないファイル名にする → 3 で落ちる
- 3 つとも赤を見たら戻す。赤の出力を PR の本文に貼る
- 所要: 1.5 時間

### Task 2: `audit-structure.mjs` の指標の判定をモジュールへ移す

**置き場**: `scripts/lib/structure/`。**`scripts/lib/` の下に置くのは、`entry-point-wiring.test.mjs` が `scripts/lib/` を起動の対象から外すため**（`:82-84`）。
`scripts/` 直下に置くと、起動の判定を持たないモジュールが入口として扱われて落ちる。

| モジュール | 移すもの（いまの行） | 使う側 |
|---|---|---|
| `reachability.mjs` | `extractImportSpecifiers`・`resolveRelativeImport`・`computeReachableFiles`・`sc027UnreachableModules`（69〜150） | `runAudit`・走査の照合（`computeReachableFiles` は 1656・1829 行も使う） |
| `test-conventions.mjs` | `sc028`〜`sc032`・`sc036` と、その補助（`extractTestNames`・`splitIntoTestBodies`・GWT の判定。152〜400） | `runAudit`・例外の鮮度の判定（`findStaleSc029Exceptions`・`findStaleTestExceptions`） |
| `message-definitions.mjs` | `sc035` と、その補助（括弧の対応・文言の表の抽出。404〜512） | `runAudit` |
| `unreachable-elements.mjs` | `sc039a`〜`sc039d`・`sc039UnreachableElements` と、その補助（`stripStringsAndComments`・`extractPublicDeclarations`・`extractContractNames`・`extractNamedImportsFromPackage` ほか。515〜1,068） | `runAudit`・`findStaleSymbolExceptions` |

**入口（`audit-structure.mjs`）に残すもの**: 走査の宣言（`SCANNED_PACKAGES`・`EXCLUDED_PACKAGES`・各例外の表・`METRIC_FILE_PINS`）、宣言と実体の照合、走査量、`runAudit`、`formatTable`、`main`、`readFilesRecursive`（`main` だけが使う I/O）。

**守る制約**

- **`scan-target-wiring.test.mjs` が複製を書き換える綴りは、すべて入口に残る。** 書き換える綴りは宣言（`{ pkg: ...}`）・例外の鮮度の配線（`const staleExceptions = findStaleSymbolExceptions(...)` など）・走査の配線で、いずれも②③の層にある。
  綴りが入口から消えると、同テストの「壊せていません」の確かめが落ちる —— **この制約はテストが機械で守っている**
- 移すのは関数の本体をそのまま。**1 コミット 1 モジュール**。各コミットで Task 0 の全検査の出力が一致し、自己テストが全緑
- `audit-structure.test.mjs`（1,771 行）は、取り込み元の行だけを書き換える（`./audit-structure.mjs` → `./lib/structure/<module>.mjs`）。**テストの本体（Given/When/Then と assert）は 1 行も変えない**。差分は `import` の行だけであることを `git diff --stat` と目視で確かめる
- モジュールの公開は、入口とテストが使う名前だけにする（使われない `export` を増やさない）
- モジュール同士の依存は一方向にする（`unreachable-elements` → `reachability` の `computeReachableFiles` のような依存が要るなら、それだけ）

**確かめる**

- 各コミットで: Task 0 と同じ手順で出力を取り、基準と `diff -r` で差が 0 件
- `node --test scripts/scan-target-wiring.test.mjs scripts/entry-point-wiring.test.mjs scripts/audit-structure.test.mjs` が全緑
- 最後に、入口の行数と各モジュールの行数を PR に書く（目安: 入口は約 1,250 行、判定は 4 モジュールで約 1,030 行）
- 所要: 3 時間

### Task 3: 文書を合わせる

- `audit-structure.mjs` の冒頭コメントに、判定が `scripts/lib/structure/` にあることを 1 行で書く
- `docs/guides/development.md` の「検査系」に、`audit-structure.mjs` の判定の置き場が出てくるなら直す。**#94 PR 3 が同じファイルに触るので、直す必要が無ければ触らない**（出てこなければ「該当なし」と PR に書く）
- 設計正本 §5.1 に、この計画で決めたこと（§2 の見送りと理由）を日付つきで追記する
- 所要: 30 分

### Task 4: 通しの確かめ

- Task 0 の全検査の出力が、基準と一致する（`diff -r "$BASE" "$AFTER"` が空）
- 自己テストの件数が、基準より Task 1 で足した数だけ多く、ほかは同じ
- `pnpm test`（スクリプト以外は変えていないので、緑のままであることだけを見る）
- `node scripts/mutation-check.mjs`: **この PR は変異のパッチが当たるファイルに触らない**（§1。`audit-structure.mjs` に当たるパッチは無い）。対照実行が緑であることを見る
- 所要: 30 分（変異検査の時間を除く）

## 5. 変異の ID

**新しい ID は使わない。** 新しい検査（Task 1）の破壊検証は、手で壊して赤を見る（Task 1 の「確かめる」）。
`mutation-check.mjs` の宣言の表は、#94 PR 3 が m162〜m164 を足す予定で、ここで行を足すと同じ場所でぶつかる。
既存のパッチの当て直しも無い（§1）。

## 6. この計画から切り出すもの

- **`mutation-check.mjs` の分割**（宣言の表 約 1,500 行を別ファイルへ移し、機構を入口に残す）。#94 PR 3 のマージ後に着手する。
  #380 として起票した。分割のときは、宣言の表を移しても `MUTATIONS` が 0 件のときのガード（`mutation-check.mjs:2099`）と
  宣言とパッチの全単射の照合（`assertMutationPatchesBijective`）が効くことを、壊して確かめる

## 7. 完了条件（#361 の完了条件をこの計画に合わせて読み替えたもの）

- [ ] CI が流す全検査の出力（標準出力・標準エラー・終了コード）が、変更前と同じ
- [ ] 新しい検査（スクリプト同士の取り込みの許可表）を 3 通りに壊して、赤を見た
- [ ] `scan-target-wiring.test.mjs`・`entry-point-wiring.test.mjs` を緩めずに緑
- [ ] `audit-structure.test.mjs` の差分が取り込みの行だけ
- [ ] 見送った項目と理由を、設計正本 §5.1 と #361 に残した
