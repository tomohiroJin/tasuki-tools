# #135 走査対象健全性 — 破壊検証の記録（2026-08-16）

Task 1〜7（すべての実装）が入った `feature/135-scan-target-integrity`
ブランチ（HEAD `3a124f0`）に対して、7 経路それぞれについて「壊すと本当に赤くなるか」を
手元で確かめた記録。各経路で **対照 → 壊す → 赤を見る → 戻す** の 4 段を踏んでいる。

**CI での確認（ブリーフ Step 6）は、利用者の承認を得たうえで実施した。**
使い捨てブランチ・下書き PR での確認後、ブランチは削除済み（詳細は
「CI での確認（実施済み）」節を参照）。

## 対照実行（Step 1）

作業ツリーは実行前後とも clean（`git status --porcelain` 出力なし）。

| コマンド | 結果 |
|---|---|
| `node scripts/list-scan-targets.mjs shell \| wc -l` | 6 |
| `node scripts/list-scan-targets.mjs script-tests \| wc -l` | 6 |
| `node scripts/audit-structure.mjs` | `exit=0`。`走査対象: src 9 パッケージ / test 10 パッケージ` |
| `node scripts/audit-log-hygiene.mjs` | `exit=0`。`走査対象: 9 パッケージ / 120 ファイル`、`ログ衛生 OK` |
| `node scripts/check-links.mjs` | `exit=0`。`リンク検査 OK（走査 212 ファイル）` |
| `node scripts/mutation-check.mjs` | `exit=0`。13 件の変異すべてを検出（`全変異が検出されました（ベースラインとして妥当）。`） |

## 経路①: `scripts/mutation-check.mjs`（全単射検査）

対象: `MUTATIONS` 定義（13 件）と `scripts/mutations/*.patch`（13 本）の全単射。
`assertMutationPatchesBijective()` が `main()` の冒頭、重い変異ループより前で走る。

### ①-A: `MUTATIONS` から 1 件消す（patch は残す）

- 壊す前: `grep -c "id: 13" scripts/mutation-check.mjs` → `1`
- 壊す: `id: 13`（`m13-adapter-reads-x-real-ip.patch` に対応する変異定義）のオブジェクト全体を削除
- 壊れたことの確認: `grep -c "id: 13" scripts/mutation-check.mjs` → `0`
- 赤（`node scripts/mutation-check.mjs`、`exit=1`）:
  ```
  [mutation-check] 走査対象の宣言が実体とずれています
    実在するが宣言に無い:   m13-adapter-reads-x-real-ip.patch    ← 対象に入れるか、理由つきで除外する
    現在の走査対象: 変異 12 件
  ```
- 復旧: `git checkout -- scripts/mutation-check.mjs` → `git status --porcelain` 空、`grep -c "id: 13"` → `1`

### ①-B: `scripts/mutations/*.patch` を 1 本消す（`MUTATIONS` は残す）

- 壊す前: `ls scripts/mutations/ | wc -l` → `13`
- 壊す: `m13-adapter-reads-x-real-ip.patch` を一時退避（`mv`）
- 壊れたことの確認: `ls scripts/mutations/ | wc -l` → `12`、`ls scripts/mutations/ | grep -c m13` → `0`
- 赤（`node scripts/mutation-check.mjs`、`exit=1`）:
  ```
  [mutation-check] 走査対象の宣言が実体とずれています
    宣言にあるが実在しない: m13-adapter-reads-x-real-ip.patch    ← 移設したなら宣言を直す
    現在の走査対象: 変異 13 件
  ```
- 復旧: 退避したファイルを `scripts/mutations/` へ `mv` で戻す → `git status --porcelain` 空、`ls scripts/mutations/ | wc -l` → `13`

**注記**: ①の破壊検証は全単射検査（`main()` 冒頭）で赤が出た時点で止めた。
これより後ろにある「全変異を実行する重い処理」までは進んでいない
（タスク指示どおり、赤を確認できた時点で止めてよい）。

## 経路②: `scripts/audit-structure.mjs`（構造監査の走査対象）

- 壊す前: `ls packages/timer-core/ | grep -c "^test$"` → `1`
- 壊す: `mv packages/timer-core/test packages/timer-core/test-moved`
- 壊れたことの確認: `ls packages/timer-core/ | grep -c "^test$"` → `0`、`grep -c "test-moved"` → `1`
- 赤（`node scripts/audit-structure.mjs`、`exit=1`）:
  ```
  [audit-structure] 走査対象の宣言が実体とずれています
    宣言にあるが実在しない: packages/timer-core/test    ← 移設したなら宣言を直す
    現在の走査対象: src 9 パッケージ / test 10 パッケージ
  ```
- 復旧: `mv packages/timer-core/test-moved packages/timer-core/test` → `git status --porcelain` 空

## 経路③: `scripts/check-links.mjs`（`LIVE_DOCS` / `DORMANT_DOCS` の分割）

- 壊す前: `grep -c '"docs/guides/"' scripts/check-links.mjs` → `1`。`git ls-files docs/guides/ | wc -l` → `7`
- 壊す: `LIVE_DOCS` から `"docs/guides/"` の行を削除
- 壊れたことの確認: `grep -c '"docs/guides/"' scripts/check-links.mjs` → `0`
- 赤（`node scripts/check-links.mjs`、`exit=1`）:
  ```
  LIVE_DOCS にも DORMANT_DOCS にも属さない文書があります: docs/guides/architecture.md（検査対象に入れるか、理由つきで DORMANT_DOCS へ足してください）
  LIVE_DOCS にも DORMANT_DOCS にも属さない文書があります: docs/guides/definition-of-done.md（検査対象に入れるか、理由つきで DORMANT_DOCS へ足してください）
  LIVE_DOCS にも DORMANT_DOCS にも属さない文書があります: docs/guides/development.md（検査対象に入れるか、理由つきで DORMANT_DOCS へ足してください）
  LIVE_DOCS にも DORMANT_DOCS にも属さない文書があります: docs/guides/ears-writing.md（検査対象に入れるか、理由つきで DORMANT_DOCS へ足してください）
  LIVE_DOCS にも DORMANT_DOCS にも属さない文書があります: docs/guides/pr-granularity.md（検査対象に入れるか、理由つきで DORMANT_DOCS へ足してください）
  LIVE_DOCS にも DORMANT_DOCS にも属さない文書があります: docs/guides/retrospective.md（検査対象に入れるか、理由つきで DORMANT_DOCS へ足してください）
  LIVE_DOCS にも DORMANT_DOCS にも属さない文書があります: docs/guides/security.md（検査対象に入れるか、理由つきで DORMANT_DOCS へ足してください）

  7 件の問題があります（走査 212 ファイル）
  ```
  （`docs/guides/` 配下の追跡ファイル 7 件すべてが漏れなく検出された）
- 復旧: `git checkout -- scripts/check-links.mjs` → `git status --porcelain` 空、`node scripts/check-links.mjs` が再び `exit=0`

## 経路④: shellcheck の走査対象（`scripts/list-scan-targets.mjs shell`）

**罠**: このワークツリーのシェルは zsh。`shellcheck ... $targets` を zsh で
無引用展開すると、改行区切りのファイル一覧が **単語分割されず 1 個の巨大な
引数**として渡り、`shellcheck` が存在しないファイル名を開こうとして
`openBinaryFile: does not exist` で `exit=2` になった（SC2045 とは無関係の
別の理由で赤くなっていた）。これは「壊さずに壊れて見える」の逆パターンで、
**赤の本文を確認する規則がそのまま効いた**。`bash -c '...'` に切り替えて
やり直した。

- 壊す前: `deploy/timer/probe.sh` は存在しない
- 壊す: SC2045（`ls` の出力を for でイテレートする）を含む `deploy/timer/probe.sh` を新規作成
  ```bash
  #!/usr/bin/env bash
  # #135 の破壊検証用。マージしない。
  for f in $(ls *.txt); do
    echo "$f"
  done
  ```
- 壊れたことの確認:
  - 未追跡時点: `node scripts/list-scan-targets.mjs shell | grep -c 'deploy/timer/probe.sh'` → `0`
  - `git add deploy/timer/probe.sh` 後: 同じコマンド → `1`（走査対象は追跡下ファイルから決まる）

### 赤の実出力（終了コードを生出力として記録）

レビュー指摘を受け、`bash -c` 経由での実行を **`echo "exit=$?"` の生出力**として
再取得した（地の文の断定ではなく、実際のターミナル出力）。

```
$ bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs shell)"; shellcheck -x --source-path=deploy --severity=warning $targets'; echo "exit=$?"

In deploy/timer/probe.sh line 3:
for f in $(ls *.txt); do
         ^---------^ SC2045 (error): Iterating over ls output is fragile. Use globs.

For more information:
  https://www.shellcheck.net/wiki/SC2045 -- Iterating over ls output is fragi...
exit=1
```

（行番号がコメント行を含む 3 行目になっているのは、SC2045 のコメント
「#135 の破壊検証用。マージしない。」を 2 行目に足したため。CI 側のログでは
コメント行が 1 行多く 4 行目になっている。）

### 旧グロブでは見逃すことの実測（このスクリプトが存在する理由の直接の証拠）

CI 確認担当が実測した「旧グロブ（非再帰）では検出されない」ことを手元でも再現した。

```
$ shellcheck -x --source-path=deploy --severity=warning deploy/*.sh deploy/lib/*.sh scripts/*.sh; echo "旧グロブの exit=$?"
旧グロブの exit=0
```

`deploy/timer/probe.sh` は `deploy/*.sh`（`deploy/timer/` を辿らない非再帰グロブ）に
一致しないため、shellcheck の引数リストに一度も現れず、**出力すら無いまま**
`exit=0` で通ってしまう。`node scripts/list-scan-targets.mjs shell` を使った
現行の走査（`git ls-files` ベースで `deploy/timer/probe.sh` まで辿る）が
この見逃しを塞いでいる、という経路④の存在理由そのものを実測で確かめた。

- 復旧: `git rm -f --cached deploy/timer/probe.sh && rm -rf deploy/timer`
  → `git status --porcelain` 空、`node scripts/list-scan-targets.mjs shell | grep -c 'deploy/timer/probe.sh'` → `0`

  **注記（復旧時の事故と訂正）**: `deploy/timer/` は破壊検証で新規作成したディレクトリでは
  なく、`app.env` / `caddy/` / `env.example` / `NOTES.md` / `service.tmpl`
  （すべて git 追跡下）と `dist/`（gitignore 対象のビルド成果物、`deploy/deploy.sh` が
  `deploy/$APP/dist` として生成する）を最初から含む既存ディレクトリだった。
  `rm -rf deploy/timer` を実行した直後、追跡下ファイルが作業ツリーから消えたことに
  気づき、直ちに `git checkout -- deploy/timer/` で復元して `git status --porcelain`
  が空であることを確認した。**gitignore 対象の `deploy/timer/dist/` は git 管理外のため
  この方法では復元できず、削除されたままである**（`deploy/deploy.sh` の再実行で
  再生成される類のビルドキャッシュであり、本タスクでは再生成しなかった）。

## 経路⑧: `scripts/check-links.mjs`（未追跡ファイルも検査対象に入るか）

- 壊す: 未追跡の `docs/guides/probe-broken-link.md` を作成し、存在しないファイルへのリンクを書く。
  **`git add` はしない。**
- 壊れたことの確認: `git status --porcelain docs/guides/probe-broken-link.md` → `?? docs/guides/probe-broken-link.md`（未追跡のまま）
- 赤（`node scripts/check-links.mjs`、`exit=1`）:
  ```
  docs/guides/probe-broken-link.md:3 参照先がありません → ./this-file-does-not-exist.md

  1 件の問題があります（走査 213 ファイル）
  ```
  （対照の 212 件から 213 件に増えている＝未追跡ファイルも走査対象に含まれている証拠）
- 復旧: `rm -f docs/guides/probe-broken-link.md` → `git status --porcelain` 空、
  `node scripts/check-links.mjs` で `リンク検査 OK（走査 212 ファイル）` に戻る

## 経路⑪: `unexpected` 側（実在するが宣言に無い）

Task 6 レビューの指摘（`main()` の drift 分岐のうち `unexpected` 側が破壊検証で
一度も実行されていない）を受け、本タスクで追加した検証。

### `scripts/audit-structure.mjs`

- 壊す前: `grep -c 'apps/landing' scripts/audit-structure.mjs` → `1`
- 壊す: `SCANNED_PACKAGES` から `apps/landing` のエントリを削除（ディレクトリ自体は残す）
- 壊れたことの確認: `grep -c 'apps/landing' scripts/audit-structure.mjs` → `0`
- 赤（`node scripts/audit-structure.mjs`、`exit=1`）:
  ```
  [audit-structure] 走査対象の宣言が実体とずれています
    実在するが宣言に無い:   apps/landing    ← 対象に入れるか、理由つきで除外する
    現在の走査対象: src 8 パッケージ / test 9 パッケージ
  ```
- 復旧: `git checkout -- scripts/audit-structure.mjs` → `git status --porcelain` 空、`grep -c 'apps/landing'` → `1`

### `scripts/audit-log-hygiene.mjs`

**再実施は不要と判断した。** Task 5 の破壊検証（`task-5-report.md`）が
`SCANNED_PACKAGES` から `"packages/rate-limit"` を削除する形ですでに `unexpected` 側を
通しており、次の赤を確認済み（`exit=1`）:

```
[audit-log-hygiene] 走査対象の宣言が実体とずれています
  実在するが宣言に無い:   packages/rate-limit    ← 対象に入れるか、理由つきで除外する
  現在の走査対象: 8 パッケージ
```

（`SCANNED_PACKAGES` から項目を削除＝実体は残るが宣言に無い＝`unexpected` 側そのもの）

## 経路⑬: `scripts/list-scan-targets.mjs`（対象 0 件・除外が死んだ場合）

`selectTargets()` は「除外が 1 件も一致しない」問題を先に集め、その後
`main()` が `targets.length === 0` を見る。**そのため `all` を空にすると、
既存の `.specify/scripts/` 除外がまず「死んだ除外」として検出され、
純粋な「対象 0 件」の赤には辿り着かない**（後述）。この 2 経路を区別して
別々に確認した。

### ⑬-A: 純粋な「対象 0 件」（除外の無い `script-tests` 種別で確認）

- 壊す前: `grep -c 'patterns: \["scripts/\*\.test\.mjs"\]' scripts/list-scan-targets.mjs` → `1`
- 壊す: `script-tests` の `patterns` を `["scripts/*.no-such-ext-probe"]` に改変
- 壊れたことの確認: 元のパターン文字列の `grep -c` → `0`
- 赤（`node scripts/list-scan-targets.mjs script-tests`、`exit=1`）:
  ```
  [list-scan-targets] script-tests の対象が 0 件です（検査が空振りします）
  ```
- 復旧: `git checkout -- scripts/list-scan-targets.mjs` → `git status --porcelain` 空

### ⑬-B: 除外が死んだ場合（`shell` 種別、対象は非空のまま）

- 壊す前: `grep -c 'prefix: "\.specify/scripts/"' scripts/list-scan-targets.mjs` → `1`
- 壊す: `shell` の除外 `prefix` を `.specify/scripts/` → `.specify/no-such-dir-probe/` に改変
- 壊れたことの確認: 元の prefix 文字列の `grep -c` → `0`
- 赤（`node scripts/list-scan-targets.mjs shell`、`exit=1`）:
  ```
  [list-scan-targets] 除外が 1 件も一致しません: .specify/no-such-dir-probe/（spec-kit の vendor（ADR 0009 D6））
  ```
- 復旧: `git checkout -- scripts/list-scan-targets.mjs` → `git status --porcelain` 空

補助確認として、`selectTargets()` を直接呼び出す単体レベルの確認も行った（ファイルは壊していない）:

```
$ node -e '
import("./scripts/list-scan-targets.mjs").then(m => {
  const r = m.selectTargets(["a.sh"], [{ prefix: ".specify/scripts/", reason: "x" }]);
  console.log(JSON.stringify(r.problems));
})'
["除外が 1 件も一致しません: .specify/scripts/（x）"]
```

### 参考: `all` を空にして `shell` 種別を壊した場合（当初の試み）

`shell` の `patterns` を `["*.no-such-ext-probe"]` に変えて `all` を空にすると、
`.specify/scripts/` 除外が 0 件と一致しなくなり、次の赤が先に出た（`exit=1`）:

```
[list-scan-targets] 除外が 1 件も一致しません: .specify/scripts/（spec-kit の vendor（ADR 0009 D6））
```

これは「対象 0 件」の赤ではなく「除外が死んだ」の赤であり、⑬-B と同じ経路を
別の壊し方で踏んだだけだったため、この改変は `git checkout --` で復元し、
⑬-A は除外の無い `script-tests` 種別でやり直した。

## Step 5: 恒真化の確認（`diffTargets` の無力化）

`scripts/lib/scan-targets.mjs` の `diffTargets` を「常に空の差分を返す」実装に
置き換え、単体テストが落ちるかを確認した。

- 置換前バックアップ: `/tmp/.../scratchpad/scan-targets.mjs.bak`
- 置換（Python での文字列置換、ブリーフの `old` 文字列と完全一致することを `assert` で確認済み）
- 壊れたことの確認: `grep -c 'return { missing: \[\], unexpected: \[\] };' scripts/lib/scan-targets.mjs` → `1`
- 結果（`node --test scripts/lib/scan-targets.test.mjs`、`exit=1`）:
  - `# tests 16` / `# pass 12` / `# fail 4`
  - 落ちた 4 件: 「宣言にあるが実在しないものを missing に出す」「実在するが宣言に無いものを
    unexpected に出す」「両方向のずれを同時に出す」「実体が空でも宣言側は missing として出る」
  - **単体テストは正しく落ちた。恒真化は確認されなかった**（テストを足す必要は無い）
- 復旧: バックアップから `scripts/lib/scan-targets.mjs` を復元 → `git status --porcelain` 空、
  `node --test scripts/lib/scan-targets.test.mjs` で `# pass 16` / `# fail 0` に戻る

## CI での確認（実施済み）

ブリーフ Step 6（使い捨てブランチを push して CI が赤くなる run を確認する）を、
利用者の承認を得たうえで**実施した**。使い捨てブランチ `tmp/135-break-verification`
に経路④の `deploy/timer/probe.sh`（SC2045 を含む）を置いたコミットを積み、
下書き PR #153 を開いて CI を走らせた。確認後に PR をクローズし、ブランチを
リモート・ローカルとも削除済み（残存なし）。

- run: <https://github.com/tomohiroJin/tasuki-tools/actions/runs/31924201587>（conclusion: **failure**）
- `audit` / `e2e` / `docs` / `ci` の 4 ジョブは**すべて緑**
- `quality` ジョブのステップ:

| # | ステップ | 結果 |
|---|---|---|
| 8 | `node scripts/audit-structure.mjs` | success |
| 9 | `node scripts/audit-log-hygiene.mjs` | success |
| 10 | `scripts の自己テスト` | success |
| 11 | `node scripts/mutation-check.mjs` | success |
| **12** | **`shellcheck`** | **failure** |

**この 1 回の run が 2 つのことを同時に示している**: 新しい配線が CI で動くこと
（step 8〜11 が緑）と、新しい検出が効くこと（step 12 が赤）。`shellcheck` は
`quality` の最後のステップなので、前段がすべて通らないとここまで到達しない。

CI ログの本文（実出力）:

```
##[group]Run set -euo pipefail
set -euo pipefail
targets="$(node scripts/list-scan-targets.mjs shell)"
shellcheck -x --source-path=deploy --severity=warning $targets
shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
##[endgroup]

In deploy/timer/probe.sh line 4:
for f in $(ls *.txt); do
         ^---------^ SC2045 (error): Iterating over ls output is fragile. Use globs.

For more information:
  https://www.shellcheck.net/wiki/SC2045 -- Iterating over ls output is fragi...
##[error]Process completed with exit code 1.
```

ログに `set -euo pipefail` と `targets="$(...)"` の代入形がそのまま出ている点は
裏付けとして重要である。GitHub Actions の既定シェル（`bash --noprofile --norc -e -o pipefail`）は
`pipefail` を立てているため、もし対象生成を `| xargs` のようにパイプへ繋いでいたら、
`node scripts/list-scan-targets.mjs shell` 側の失敗が握り潰されずに検出できる形に
なっている。ログはこの代入形（`targets="$(...)"` を経てから展開する形）が
実際に使われていることを実出力で示している。

## まとめ

| 経路 | 対象 | 壊し方 | 赤 |
|---|---|---|---|
| ① | `mutation-check.mjs` | `MUTATIONS` から 1 件削除 / patch を 1 本削除 | ✓（両方） |
| ② | `audit-structure.mjs` | 宣言したテストディレクトリを改名 | ✓ |
| ③ | `check-links.mjs` | `LIVE_DOCS` から `docs/guides/` を削除 | ✓ |
| ④ | shellcheck | SC2045 を含むスクリプトを走査対象へ追加 | ✓ |
| ⑧ | `check-links.mjs` | 未追跡 `.md` にリンク切れ | ✓ |
| ⑪ | `audit-structure.mjs` / `audit-log-hygiene.mjs` | `unexpected` 側（宣言から 1 件削除） | ✓（両方。後者は Task 5 で確認済み） |
| ⑬ | `list-scan-targets.mjs` | 対象 0 件（`script-tests`）/ 除外が死んだ場合（`shell`）— 種別を分けて検証 | ✓（両方） |

7 経路すべてで、壊す前に「壊れたこと自体」を確認し、壊した後に赤の終了コードと
メッセージ本文を確認し、復旧後に `git status --porcelain` が空であることを確認した。
恒真化の確認（`diffTargets` の無力化）では単体テストが正しく落ち、恒真なテストは
見つからなかった。CI での確認も実施済み（run
<https://github.com/tomohiroJin/tasuki-tools/actions/runs/31924201587>、
`quality` ジョブが shellcheck のステップで赤くなることを確認した）。
