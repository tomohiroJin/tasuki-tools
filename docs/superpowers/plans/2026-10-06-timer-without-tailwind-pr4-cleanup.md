# timer から Tailwind を外す — PR 4: 片付け（#321）実装計画

> **作業者へ:** 必須サブスキル `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: timer の見た目を変えずに、Tailwind・PostCSS・`autoprefixer` を `apps/timer-web` から外す。基準 `ba9249d` との通しの比較で差 0 件を確かめ、現況の記述を書き直し、比較の仕組みを撤去し、振り返りを書いて #321 を閉じる。

**方式**: 先に、比較用のビルドの切り替えと、Tailwind に寄りかかった検査の判定を外す（Task 2・3）。次に Tailwind 本体を外し、通しの比較を流す（Task 4・5）。現況の記述と ADR を書き直し、PR を作ってレビューを受け、直しも比較で確かめ終えてから、**最後のコミットで比較の仕組みを撤去する**（Task 9）。

**技術**: Vite 8（lightningcss）・Playwright（`e2e/parity/`・撤去まで）・vitest・`node --test`（`scripts/`）

**正本**: `docs/superpowers/specs/2026-09-29-timer-without-tailwind-design.md`。**計画は正本に従属する。両方を読むこと。** この計画は正本の §4 **PR 4** を実装し、**§7.1（PR 3・4 の検証を軽くする）と、Task 1 で足す §7.2（E8 を記録で受け入れる）に従う**。関係する節: D2（`.sr-only`）・D3・D4・D6・D7・D8・D10・§5.1・§6。台帳: `docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`。比較の流し方の正本: `e2e/parity/README.md`（撤去まで）。

**計画の検証**: 初版を文脈を共有しない 3 人（事実照合・CSS とビルド・過去の失敗の型）で検証し、Critical 2 件・Important 約 20 件（重複を含む）を反映した 2 版。CSS とビルドの検証役は、Q7 の並びを scratchpad で実際にビルドして確かめた（以下【実測】）。

## 検証の時間の見積もり（2026-10-06・PR 2・3 の実測と計画の検証から）

比較は 1 本ずつしか流せない（ポートが固定）。全件の通常の比較は約 28 分（PR 2・3 の実測）。

| タスク | 中身 | 1 回 | 想定の回数 | 小計 |
|---|---|---|---|---|
| 2 ビルドの切り替えを外す | 単体テスト・e2e の型検査・**対照実行の一部**（`lobby` と `session-driver`。ハーネスの読み込みを触るので） | 約 6 分 | 1 | 約 10 分 |
| 3 検査から Tailwind を外す | `node --test`・検査の実行・パッチの当て直し | 数分 | — | 約 5 分 |
| 4 Tailwind を外す | `pnpm install`（9p で数分）・ビルド・出力の確かめ | — | 1 | 約 10 分 |
| 4 Tailwind を外す | **通常の比較の全件** | 約 28 分 | 1〜2 | 約 30〜60 分 |
| 5 通しの検査 | 手元の CI 一式（約 10 分）・`mutation-check` 全件（手元約 10〜15 分） | — | 1 | 約 25 分 |
| 6 Minor | 触った部品の状態だけ | — | — | 約 10〜20 分 |
| 7 現況の記述 | `check-links`・`audit-plan-gate`・`@tasuki/ui` のテストと lint | 数分 | — | 約 5 分（**人の仕分けが 1.5〜3 時間**） |
| 8 PR とレビュー | CI の待ち（push ごと約 8 分）・`/code-review`（約 15 分）・直しの後の比べ直し（`layer`・reset に効く直しなら全件） | — | — | 約 30〜90 分 |
| 9 撤去 | e2e の型検査・lint・単体テスト・`check-links`・dist の同一の確かめ | 数分 | 1 | 約 5 分 |

**機械の待ち時間: 約 2.5〜4 時間**（初版の 2.5〜4.5 時間から、Task 2 の対照実行の全件を一部に絞った分と、`.sr-only` と改名欄を先に直して比較の 2 回目を避ける分を引いた）。これとは別に、実装役（Sonnet）の作業・レビュー役（Opus）の往復・差の調べもの・D8 の仕分け・振り返り（4 本の PR をまたぐ）が乗る。**全体は 10〜15 時間を見込む**。

注: D8 の検索は 2026-10-06 の main で 446 行（`woff2` の 1 行を含む）。撤去で `e2e/parity/` の分が消える。残りの多くは timer の CSS の `scale-exempt:` の注釈（正本 D2 が残すと決めたもの）・ルートの `postcss`（ADR 0022 決定 7）・e2e のハーネスの `preflight` など正当な言及。

### 測り方と止まる条件

- Task 0 で開始の時刻を `date -Iseconds > ~/.cache/tasuki-parity/pr4-start.txt` に書く
- **比較と `mutation-check` は、必ず `~/.cache/tasuki-parity/pr4-t<タスク番号>-<回数>.log` へ書き出す**。機械の待ちの合計は `bash -c 'grep -h -E "(passed|failed) \(" ~/.cache/tasuki-parity/pr4-*.log'` で統括が足し上げる
- 実装役への dispatch の本文に「**比較を流した回数と、各回のログの `passed/failed (X m)` の行を報告に含める**」と書く
- **各タスクの終わりに、統括が開始からの実時間を見る**（PR 3 では何も動かない空白が計約 20 時間あった）
- **止まって利用者に報告する条件**（どれか 1 つ）:
  1. Task 2 の対照実行が赤（**直さずに報告する**。物差しの直しを始めない）
  2. Task 4 で通常の比較の全件を 2 回流しても差が残る。または差が全状態の `html` / `body` に出た（1 回で報告。reset の写し方を疑う）
  3. 機械の待ちの合計が 5 時間を超えそう（見積もりの上限の約 1.2 倍）
  4. 開始から実時間で 16 時間を超えそう（何も動かない空白は除く・PR 3 の判断）
  5. 1 つの差の調べものが 1 時間を超えた
  6. 写しの誤りではなく「Tailwind が無いと作れない値」に当たった、または Task 4 Step 5 で Q11 に無い前置詞・逃げ道の差が出た（承認の要る差になる）

流さないもの（正本 §7.1・§7.2）: E8 の規則の使用状況・囲いを外した一時ビルド（PR 4 で囲いそのものを外し、通常の比較がそれを測る）・タスクごとの全件の比較。

## この計画で決めたこと（正本に無い細部）

| # | 決めたこと | 理由 |
|---|---|---|
| Q1 | **E8 は状態を足さず、台帳の記録で受け入れる**（利用者の判断・2026-10-06）。正本 §7.2 と §6 の E8 の行に書く。**代わりに、台帳の 2 つの表（PR 2 の E8 で当たらなかった規則・PR 3 で比較に掛からない要素）の CSS は、`layer(timer)` を外したときの勝ち負けの逆転を Task 4 Step 3 で目で突き合わせる**（比較が防壁にならないため） | 状態を足すと期待値の作り直しと全比較のやり直しが要り、PR 2 の約 29 時間の主因だった。計画の検証で、比較に掛からない要素（改名欄）に逆転が実在した（Q5） |
| Q2 | **Task 2 で外すのはビルド側の切り替えと、その取り残しの止めだけ**: `vite-timer-css.ts` とそのテスト・`vite.config.ts` の 2 か所・`postcss.config.js` の `optimize`・`turbo.json` の `@tasuki/timer-web#build` と注釈の段落・`deploy.sh` の 25・26 行目・`e2e/harness/parity-build-switches.ts` とそのテスト・`playwright.config.ts` と `parity.config.ts` の呼び出し・`parity.unlayered.config.ts`・`parity.usage.config.ts`。**比較の本体（`run-mode.ts` の `unlayered` / `usage`・`timer.parity.ts` の `UsageTracker` など・`usage.ts`・`usage-summary.ts`）は触らず、Task 9 で丸ごと消す** | 比較の本体を最後の計測の直前に書き換えると、対照実行が赤になったときに物差しの直しが始まる（PR 2 の型）。本体は Task 9 で消えるので、それまで死んだ枝のまま残してよい |
| Q3 | **`audit-timer-classes.mjs` から移行中の仕組みを外す**: `UNMIGRATED` と古い一覧の判定・`KNOWN_COLLISIONS`・`loadTailwindDetector`（と `createRequire`・`pathToFileURL` の import）・検査 3 の「Tailwind のユーティリティ名との衝突」・検査 5 の「`UNMIGRATED` のファイルの `animate-<名前>`」の枝。**残すもの**: 書き方（1）・定義（2）・要素層と `ui-` との衝突（3 の残り）・宣言禁止の変数（4）・借り物のキーフレーム（5 は「timer の CSS が定義する」だけになる） | 依存を外す前に、`tailwindcss` を解決する判定を外す（ADR 0023 決定 6）。定義の検査（2）が残るので、Tailwind のクラスを書き戻すと「定義が無い」で落ちる |
| Q4 | **変異 m116（古い一覧）と m117（Tailwind との衝突）は、壊す対象のコードと一緒に引退させる**（パッチと登録を消す。ID は再利用しない）。m115・m118・m119 は当て直す。**m118 は文脈の行（`TAILWIND_HUES` の注釈）が消えるので作り直しになる見込み** | 守っていた判定そのものが消える |
| Q5 | **`.roster-panel-edit-input` の `outline-style: none` を Task 4 で消す**（いまも `:focus-visible` に負けて効いていない宣言。台帳の「消した効いていない宣言」へ） | `layer(timer)` を外すと同じ詳細度（0,1,0）の後勝ちになり、改名欄のフォーカスの輪郭が消える。改名中は比較に描かれない【実測: グローバルなセレクタと衝突する画面の CSS はこの 1 件だけ】 |
| Q6 | **`base.css` の `.sr-only` に `clip-path: inset(50%);` を足す**（正本 D2「両版で勝っている宣言の和を残す」の実施） | いまは Tailwind の utilities 層の `.sr-only` が `clip-path` を足している。外すと 4 か所（常に描かれる要素を含む）で差が出る【実測: Tailwind が生成していまの要素に効いている同名の規則は `.sr-only` だけ】 |
| Q7 | **`index.css` の並び**: `@layer reset;` → `@import './styles/reset.css' layer(reset);` → `@import '@tasuki/ui/tokens.css';` → `@import '@tasuki/ui/components.css';` → `@import './styles/base.css';` → 画面の CSS（いまの並びのまま `layer(timer)` を外して）。`reset.css` の中では `@layer` で包まない（`preflight.css` 自身は `@layer` を持たない【実測】）。`main.tsx` の CSS の import は消す | 正本 D1・D4・D6。【実測】この並びで書体の `url()` 7 本はすべて `/timer/assets/…woff2` に解決され、出力の先頭は `@layer reset{…}` になった |
| Q8 | **Tailwind を外す変更（D3・D4・D6・D7 と Q5・Q6）は 1 つのコミットにする。注釈だけの書き換え（`session.css` の `animation` の注釈・各 CSS の「`@layer timer`」の注釈）は、比較が緑になった後の別コミットにする** | 中間の状態は見た目が壊れる。注釈は最小化で落ちるので、別コミットにしても dist は同一（Task 9 Step 5 で確かめる） |
| Q9 | **比較の仕組みは PR の最後のコミットで撤去する**（Task 9。`/code-review` と直しの後）。撤去後に直しが要ったら、`git restore --source=<撤去の直前の SHA> --worktree -- e2e/parity e2e/harness/parity-build-switches.ts` で作業ツリーだけに戻し（index に触れない）、流し、`rm -rf e2e/parity` と戻したファイルの削除の後に `git status --porcelain` が空であることを見る。**`e2e/tests` は戻さない** | `git checkout <SHA> -- …` は index も書き換え、次のコミットに撤去したファイルが戻る。撤去を最後にすれば、レビューの後の比べ直しに戻しが要らない |
| Q10 | **再現の手順は「PR の枝の SHA を `git fetch origin pull/<PR 番号>/head` で取ってから戻す」と書く**。PR 1〜3 の台帳の SHA にも同じ注記を足す（利用者に確かめる論点 U2） | squash マージなので、枝の SHA は main から辿れない（PR 3 の `6f9b2e99` は main に無い【実測】） |
| Q11 | **前置詞と逃げ道の差は、Task 4 の直前の HEAD の dist と比べる**（基準 `ba9249d` とではない。正本 D7 も「main と PR 4」）。認める差は `-webkit-text-decoration` と `-webkit-text-decoration-color` の回数が減ること（`a` の重複が畳まれる）。**`color-mix()` の `@supports` の逃げ道が 1 本に畳まれ、`not all and (width>=40rem)` が `(width<40rem)` のまま出る差（Safari 16.4 未満だけに効く）は、利用者の承認を得てから台帳に書く**（論点 U3） | 【実測】`-moz-column-gap` は PR 2・3 の時点で既に消えていた。Tailwind の lightningcss はメディアクエリを常に書き換えていた。Chromium の物差しには映らない |
| Q12 | **申し送りの `data-*` の値の不揃いと TeamOrbit の三項は、PR 4 で直さず #316 へ送る**（台帳に 1 行。#316 へのコメントは書かない。論点 U4） | 見た目が変わらない書き換えでも比較を要し、片付けの PR の危険度を上げる |
| Q13 | **ADR が名指しする消えるパス（ADR 0001 の `apps/timer-web/postcss.config.js`・ADR 0023 の `e2e/parity/`）は、`scripts/check-links.mjs` の `MISSING_PATH_EXCEPTIONS` に `doc` を限定して理由つきで足す**（論点 U5） | ADR の本文は書き換えない（ADR 0002）。`check-links` は `docs/adr/` のコードパスの実在を見る |
| Q14 | **実装役のモデル**: Task 2〜4 と Task 9 の Step 1〜4 は Sonnet（`claude-sonnet-5-5`）。それ以外は統括（Opus）。レビュー役は Opus | 利用者の方針（2026-10-03） |

## 利用者に確かめる論点（着手の前に）

**2026-10-06 に利用者が U1〜U6 をすべて承認した**（推奨どおり。実行は Subagent-driven）。

- **U1**: Q1 の代わりの目視の突き合わせ（台帳の 2 つの表の CSS を、レイヤーの外の規則との勝ち負けで見る）で足りるとしてよいか
- **U2**: Q10 の再現の手順（`pull/<番号>/head` を fetch してから戻す）でよいか。PR 1〜3 の台帳の SHA にも遡って注記してよいか
- **U3**: Q11 の Safari 16.4 未満だけに効く差（`color-mix()` の逃げ道・メディアクエリの範囲構文）を承認するか
- **U4**: Q12 を台帳の 1 行だけで #316 へ送ってよいか
- **U5**: Q13 の `check-links` の例外を 2 件足してよいか
- **U6**: E9 の仕分けの記録を、台帳ではファイル単位の表（ファイル・扱い・理由）で書いてよいか（仕分けそのものは 1 件ずつ行う）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Tailwind を外すのは、緑の特性テスト（基準と並べる比較）の下で行う Refactor の段（正本 §8）。検査から判定を外すタスク（Task 3）は、残す判定に足すケースの赤を先に見る |
| II. 技術選定は ADR を通す | 通過 | ADR 0023（PR 1）の実施。実施状況を ADR 0023 に追記する（Task 7） |
| III. 揮発インメモリと単純運用 | 通過 | 同期サーバーに触れない。配布しない |
| IV. 境界の型安全 | 該当なし | wire と境界の型に触れない |
| V. 実画面検証 | 通過 | `ba9249d` との通しの比較（Task 4・5）。比較に描かれない要素は目で突き合わせる（Q1） |
| VI. 依存は内向き | 通過 | 依存を減らすだけ。`audit-dependency-direction` を回す |
| VII. 検査は壊して確かめる | 通過 | 対照実行の一部（Task 2）・生の色（CSS と `.tsx`）・クラス名・キーフレーム・書体の検査の破壊検証（Task 5）・変異の当て直しと引退（Task 3・5） |
| VIII. 記録が正本 | 通過 | 正本 §7.2・台帳の PR 4 の節と再現の手順・ADR 0023 の実施状況・D8 の仕分け（E9）・振り返り |
| IX. 小さく回す | 通過 | 正本 §4 の PR 4。危険度で分けたタスクごとにコミットする |
| X. 抽象は実需で | 通過 | 新しい部品・抽象を作らない |
| XI. 秘密と個人情報 | 該当なし | 秘密・個人情報に触れない |

**逸脱なし**（E8 の扱いは Q1 の利用者の判断。正本へ記録する。U1〜U6 は着手前に利用者に確かめる）。

## 全体の制約

- ブランチは `feature/issue-321-pr4-cleanup`（main `17661a7` から切った）。**main へ直接コミットしない。** push はコミットのたびに統括が行う。**実装役のサブエージェントには push もマージもさせない**（dispatch の本文に書く。作業の後に `git log origin/feature/issue-321-pr4-cleanup` を見る）
- **見た目を 1 つも変えない。** 通しの比較の差は 0 件でなければならない（台帳で承認済みの差を除く）。出た差は、まず写し方の誤りを疑う。どうしても残る差は台帳に書き、利用者の個別の承認を得る
- 基準は `ba9249d` に固定する。基準の dist は `~/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist`（消さない）。作業ツリーで `git checkout main -- …` をしない
- **#321 が終わるまで、timer に触れる他の Issue を main へマージしない**
- 生の色を書かない（`reset.css` の preflight の逐語は正本 D4 の `ui-exempt:` で申告する）。`!important` を新しく書かない
- 破壊検証の前に `git status --porcelain` が空であることを確かめる。破壊はコミットしない。**実装役は破壊を Edit で戻す**（`git checkout --` を使わない）
- **比較は、変更をコミットした clean な作業ツリーで流す**（書き出しの世代が `-dirty` にならないように）
- 長い実行（比較・`mutation-check`）は `run_in_background` で**実行そのもの**を起動し、完了の通知を待つ。`pgrep -f` で見張らない
- 自己テストは bash で回す（zsh は未クォートの glob で偽の赤を出す）。出力を `| head` / `| tail` で切って数えない
- E2E と比較は 8787 と 18080 を使う。利用者の `pnpm run dev` が掴んでいたら止めずに聞く。終わったら `ss -tlnp | grep -E ':(8787|18080)\b'` が空であることを見る
- 実装役に「`e2e/parity/out/` を丸ごと消さない」と毎回書く（消すのは選んだ状態のディレクトリだけ）
- **状態を絞った比較（以下「M7」）**: `cd e2e && rm -rf parity/out/<状態> && TASUKI_E2E_TARGET=local TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist pnpm exec playwright test -c parity/parity.config.ts -g '<状態の正規表現>' > ~/.cache/tasuki-parity/pr4-t<N>-<回数>.log 2>&1`（細部は `e2e/parity/README.md` の「流す」が正本）
- 依存が古くて `pnpm exec` が `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` で止まったら: `pnpm install --frozen-lockfile --virtual-store-dir=.pnpm-virtual --config.confirm-modules-purge=false`。**依存を変える Task 4 は `--frozen-lockfile` を付けない**
- turbo がキャッシュから dist を戻すとき古い CSS を消さない。ビルドの CSS を読むときは `dist/index.html` が参照する 1 本を読む
- 新しい E2E のタグを足さない。台帳と ADR に数を写さない。**決定を記録する段で完了形を書かない**（ADR 0023 の実施状況・振り返りは、PR 番号とレビューの結果が出てから書く）
- コミットは `git add <ファイルを名指し>` で行う（`git commit -a` を使わない）。メッセージは日本語の Conventional Commits。**題や本文に `fix: #321`・`Fixes #321` の形を書かない**（squash の本文に入って閉じる）。末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **`layer(timer)` を外すと、画面の CSS とレイヤー外の規則（`base.css` の `:focus-visible`・`html`・`body`・クラス、部品層 `.ui-*`）の勝ち負けが変わる**。比較に描かれない要素では比較が拾わない → Q5 で既知の 1 件を直し、Task 4 Step 3 で全セレクタを相手に点検し、台帳の 2 つの表の要素は目で突き合わせる（Q1）
2. **Tailwind が生成していた同名のユーティリティ（`.sr-only`）が消える** → Q6
3. **CSS の `@import` で読んだトークン層の書体の `url()` が解決されず、書体が読めなくなる**（#297 の再来） → Task 4 Step 5 で `@font-face` が直前の dist と同じ 7 本・重複なし・`url()` が `/timer/assets/` を指すこと、Task 5 の `pnpm e2e` の書体のドリフト検査、Task 5 の破壊検証 4
4. **前置詞と古いブラウザ向けの逃げ道の差**は Chromium の物差しに映らない → Q11 で直前の dist と比べ、想定外なら止まる
5. **比較した HEAD と最後の HEAD が違う**（Task 6〜9 が注釈や文書を触る） → Task 9 Step 5 で、比較した HEAD の dist と最後の HEAD の dist が同一であることを `diff -r` で見る

---

### Task 0: 着手前の確認

**実装役: 統括**

- [ ] **Step 1: 作業ツリーと基準の dist を確かめ、開始の時刻を書く**

```bash
cd /workspaces/claym/local/Tasuki
git status --porcelain
git rev-parse --abbrev-ref HEAD
git -C ~/.cache/tasuki-parity/base-ba9249d rev-parse HEAD
ls ~/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist/index.html
date -Iseconds > ~/.cache/tasuki-parity/pr4-start.txt
```

Expected: 1 行目は計画のファイルだけ（コミット前なら）。ブランチは `feature/issue-321-pr4-cleanup`。基準の HEAD は `ba9249d` で始まる。`index.html` がある

- [ ] **Step 2: 全変異パッチに `git apply --check` を当てる**

```bash
bash -c 'for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NG $p"; done'
```

Expected: 出力なし（2026-10-06 に全部当たることを確かめた）

- [ ] **Step 3: 計画をコミットして push する**

```bash
git add docs/superpowers/plans/2026-10-06-timer-without-tailwind-pr4-cleanup.md
git commit -m "docs: #321 PR 4 の実装計画を書く

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feature/issue-321-pr4-cleanup
```

---

### Task 1: E8 の判断を正本と台帳へ記録する

**実装役: 統括（Opus）**

**Files:** 正本（§7.1 の直後に §7.2・§6 の E8 の行）・台帳

- [ ] **Step 1: 正本の §7.1 の直後（§8 の前）に「### 7.2 追記（2026-10-06・利用者の判断）: E8 は記録で受け入れる」を足す**

中身: Q1 の判断・受け入れる範囲（台帳の「E8 で当たらなかった規則」と「PR 3 で比較に掛からない要素」の 2 つの表を指す。数は写さない）・理由（状態を足すと期待値の作り直しと全比較のやり直しが要る）・代わりに PR 4 で 2 つの表の CSS を目で突き合わせること・規則の使用状況の道具は PR 4 で流さずに消すこと。§6 の E8 の行の「確かめる手段」に「2026-10-06 からは §7.2 の記録で受け入れる」を足す

- [ ] **Step 2: 台帳の 2 つの表の見出しの直下に 1 行ずつ足す**（「2026-10-06 の利用者の判断で、状態を足さずに受け入れた（正本 §7.2）」）。U2 で承認されたら、PR 1〜3 の「比較の仕組みの SHA」の行に「squash マージなので main から辿れない。`git fetch origin pull/<番号>/head` で取ってから戻す」を足す

- [ ] **Step 3: 確かめてコミットする**

```bash
node scripts/check-links.mjs
git add docs/superpowers/specs/2026-09-29-timer-without-tailwind-design.md docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md
git commit -m "docs: E8 を記録で受け入れる判断を正本と台帳に書く（#321 PR 4）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 比較用のビルドの切り替えを外す（Q2）

**実装役: Sonnet**

**Files:**
- Delete: `apps/timer-web/vite-timer-css.ts`・`apps/timer-web/test/vite-timer-css.test.ts`・`e2e/harness/parity-build-switches.ts`・`e2e/tests/parity-build-switches.test.ts`・`e2e/parity/parity.unlayered.config.ts`・`e2e/parity/parity.usage.config.ts`
- Modify: `apps/timer-web/vite.config.ts`（`timerCssPlugin` の import・`plugins` の 1 項目・`build` の行と、それぞれの注釈）・`apps/timer-web/postcss.config.js`（`optimize` の行と E8 の注釈。`'@tailwindcss/postcss': {}` に戻す）・`turbo.json`（`@tasuki/timer-web#build` のタスクと、`//` の注釈の `@tasuki/timer-web#build の env:` の段落）・`deploy/deploy.sh`（25・26 行目）・`e2e/playwright.config.ts`（8 行目の import と 13 行目付近の呼び出し）・`e2e/parity/parity.config.ts`（`parity-build-switches` の import と呼び出し）・`e2e/parity/README.md`（「囲いを外した一時ビルド」「規則の使用状況（E8）」の節を「PR 4 で外した（正本 §7.2）」の 1 行に置き換える）
- **触らない**: `e2e/parity/run-mode.ts`・`timer.parity.ts`・`usage.ts`・`usage-summary.ts`・`states.ts`・`e2e/tests/parity-run-mode.test.ts`・`usage-summary.test.ts`（Task 9 で丸ごと消す）

- [ ] **Step 1: 参照を引き直す**

```bash
cd /workspaces/claym/local/Tasuki
bash -c 'git grep -n -E "TASUKI_TIMER_UNLAYERED|TASUKI_TIMER_CSS_UNMINIFIED|TASUKI_PARITY_BUILD_SWITCH_OWNED|vite-timer-css|timerCss|parity-build-switches|ParityBuildSwitch|parity\.(unlayered|usage)\.config" -- ":!docs"'
```

上の「Files」の範囲の当たりを消すか書き換える。`run-mode.ts` などの比較の本体の当たりは残す

- [ ] **Step 2: 消した後の参照を見る**

Step 1 の `git grep` を流し、残るのは「触らない」のファイルだけであることを見る

- [ ] **Step 3: テストと検査を回す**

```bash
pnpm --filter @tasuki/timer-web typecheck && pnpm --filter @tasuki/timer-web test
pnpm --filter @tasuki/e2e typecheck && pnpm --filter @tasuki/e2e lint && pnpm --filter @tasuki/e2e exec vitest run
bash -c 'node --test $(node scripts/list-scan-targets.mjs script-tests)'
node scripts/check-links.mjs
shellcheck -x --source-path=deploy --severity=warning deploy/deploy.sh
```

Expected: すべて成功

- [ ] **Step 4: コミットして、対照実行の一部を流す（約 6 分）**

コミット: `chore: 比較用の timer の CSS のビルドの切り替えを外す（#321 PR 4）`（本文に「囲いを外した一時ビルドは PR 4 で囲いそのものを外すので役目を終える。E8 は正本 §7.2 で記録として受け入れた。比較の本体は撤去のときに消す」）

clean な作業ツリーで、README の「対照実行」を `-g 'lobby|session-driver'` に絞って、`~/.cache/tasuki-parity/pr4-t2-control.log` へ。Expected: 緑。**赤なら直さずに報告する**（止まる条件 1）

---

### Task 3: 検査から Tailwind を外す（Q3・Q4）

**実装役: Sonnet**

**Files:** `scripts/audit-timer-classes.mjs`・`scripts/audit-timer-classes.test.mjs`・`apps/timer-web/test/ui/design-tokens.test.ts`・`scripts/mutation-check.mjs`・`scripts/mutations/m116-timer-classes-stale-unmigrated.patch`（Delete）・`scripts/mutations/m117-timer-classes-tailwind-collision.patch`（Delete）・`scripts/mutations/m118-design-tokens-unused-allow.patch`（作り直しの見込み）・`.github/workflows/ci.yml`（245・246 行目の注釈）

- [ ] **Step 1: 残す判定に、Tailwind が無くなった後のケースを足して赤を見る**

`audit-timer-classes.test.mjs` の検査 5 に「`.tsx` に `animate-pulse` の字面があり、`unmigrated` が空で、timer の CSS が `animation-name: pulse` を書き、`@keyframes pulse` を定義していなければ落ちる」ケースを足す。今の実装でも落ちる（`unmigrated` が空なので）ため PASS する見込み。**PASS なら、`unmigrated` に当の `.tsx` を入れた入力で「落ちない」ことも書き、その 2 本で「`UNMIGRATED` の枝が今は出どころとして働く」ことを見ておく**（Step 3 でその枝を消した後、2 本目のケースは引数ごと消える）

Run: `bash -c 'node --test scripts/audit-timer-classes.test.mjs'`

- [ ] **Step 2: テストから、消す判定のケースを外す**

`audit-timer-classes.test.mjs` から: 9 行目の `loadTailwindDetector` の import・292 行目以降の `loadTailwindDetector` の describe・`base` の入力の `unmigrated` / `collisions` / `isTailwindUtility`・古い一覧の判定・Tailwind との衝突・「使われていない衝突の例外は落とす」（262 行目付近）・Step 1 の 2 本目のケース。**残す判定（書き方・定義・要素層と `ui-` との衝突・宣言禁止の変数・timer の CSS が定義するキーフレーム）のケースは消さない**

- [ ] **Step 3: 実装から移行中の仕組みを外す**

`audit-timer-classes.mjs` から `UNMIGRATED`・`KNOWN_COLLISIONS`・`loadTailwindDetector`・`createRequire` / `pathToFileURL` の import・`checkTimerClasses` の `unmigrated` / `collisions` / `isTailwindUtility` の引数と分岐を消す。冒頭の注釈の「何を見るか」「何を見ていないか」「依存」を、残る判定に合わせて書き直す。`main()` の「移行中 N 件」の出力も消す。`ci.yml` の 245・246 行目の注釈から「Tailwind と」「tailwindcss を読む」を消す

- [ ] **Step 4: `design-tokens.test.ts` から `TAILWIND_HUES` と、その判定・注釈を消す**

- [ ] **Step 5: 変異の引退と当て直し**

`scripts/mutation-check.mjs` の m116・m117 の登録を消し、2 本のパッチを `git rm` する。

```bash
bash -c 'for p in scripts/mutations/m11[5-9]-*.patch; do git apply --check "$p" || echo "NG $p"; done'
```

当たらないもの（m118 の見込み）は、PR 3 の計画 Task 8 Step 5 の手順で作り直す（ID は変えない。`git status --porcelain` が空であることを見てから壊し、`git diff` を scratchpad へ書き、Edit で戻してから `cp` する）。作り直したパッチは、元のパッチと並べた差分をレビュー役に渡す。殺されるかの確かめは Task 5 の全件に任せる（`mutation-check.mjs` に 1 本だけ流すオプションは無い。**`--help` を付けると全件が走る**）

- [ ] **Step 6: 検査を回す**

```bash
bash -c 'node --test scripts/audit-timer-classes.test.mjs scripts/mutation-check.test.mjs'
node scripts/audit-timer-classes.mjs
pnpm --filter @tasuki/timer-web exec vitest run test/ui/design-tokens.test.ts
grep -c tailwindcss scripts/audit-timer-classes.mjs
node -e "import('./scripts/mutation-check.mjs').then(({MUTATIONS})=>{const fs=require('fs');const a=fs.readdirSync('scripts/mutations').filter(f=>f.endsWith('.patch')).sort();const d=MUTATIONS.map(m=>m.patch).sort();console.log(JSON.stringify(a)===JSON.stringify(d)?'OK':'DRIFT')})"
```

Expected: テストと検査は成功。`grep -c` は 0。最後は `OK`（登録とパッチの対応。`assertMutationPatchesBijective` は `main()` からしか呼ばれず、`mutation-check.test.mjs` では見ないため）

- [ ] **Step 7: 破壊検証（コミットしない）**

`git status --porcelain` が空であることを見てから、1 つずつ壊して赤を見て、Edit で戻す:
1. `apps/timer-web/src/ui/Session.tsx` の `className` の 1 か所を `px-4` にする → `node scripts/audit-timer-classes.mjs` が「定義が無い」で赤（E6）
2. `apps/timer-web/src/ui/Session.tsx` に `style={{ color: "#ff0000" }}` を 1 か所足す → `pnpm --filter @tasuki/timer-web exec vitest run test/ui/design-tokens.test.ts` が赤（E5 の `.tsx` 側）

空に戻ったことを見る

- [ ] **Step 8: コミット**

コミット: `refactor: timer のクラス名の検査から移行中の仕組みと Tailwind の判定を外す（#321 PR 4）`

---

### Task 4: Tailwind を外す（D3・D4・D6・D7・Q5〜Q8・Q11）

**実装役: Sonnet**

**Files:**
- Create: `apps/timer-web/src/styles/reset.css`
- Modify: `apps/timer-web/src/index.css`・`apps/timer-web/src/main.tsx`・`apps/timer-web/package.json`・`pnpm-lock.yaml`・`apps/timer-web/src/styles/base.css`（`.sr-only`）・`apps/timer-web/src/styles/roster-panel.css`（`outline-style: none`）・`scripts/check-links.mjs`（Q13・U5 で承認されたら）
- Delete: `apps/timer-web/tailwind.config.js`・`apps/timer-web/postcss.config.js`

- [ ] **Step 1: 直前の dist を退避する（Q11 の比べる相手）**

```bash
cd /workspaces/claym/local/Tasuki
git status --porcelain
pnpm --filter @tasuki/timer-web build
rm -rf ~/.cache/tasuki-parity/pr4-before-dist && cp -r apps/timer-web/dist ~/.cache/tasuki-parity/pr4-before-dist
```

- [ ] **Step 2: `reset.css` を書く（正本 D4）**

基準の worktree の `~/.cache/tasuki-parity/base-ba9249d/node_modules/.pnpm/tailwindcss@4.3.3/node_modules/tailwindcss/preflight.css` を逐語で写す。そのうえで:
- 冒頭に出典と MIT の許諾の表記（同じディレクトリの `LICENSE` の著作権行と許諾文）を、**`/* */` の注釈で**付ける（`/*! */` にしない。最小化で残る）
- `@layer` で包まない（Q7。`index.css` の `layer(reset)` が包む）
- `--theme(…)` の 6 か所を、**基準の dist の CSS で解決された字面のまま**写す（`var(--font-sans, …)`・`var(--font-mono, …)` など。`--font-sans` は `base.css`、`--font-mono` はトークン層が定義する。**`reset.css` で変数を定義し直さない**）
- `audit-ui-components` が落とす規則の**直前**（説明の注釈の後）に `/* ui-exempt: preflight の逐語（Tailwind を外しても既定値を変えないため） */` を付ける

- [ ] **Step 3: 勝ち負けの逆転を点検する（Review Focus 1・Q1）**

`layer(timer)` を外すと、画面の CSS は `base.css`・部品層と同じレイヤー外に、それらより後ろに並ぶ。同じ詳細度なら画面の CSS が勝つようになる。次を点検し、結果をタスクの報告に書く:
1. `base.css` の**全セレクタ**（クラス・`:focus-visible`・`html`・`body`・`*`・擬似要素）について、画面の CSS（`src/styles/*.css`。`base.css`・`reset.css` を除く）に、同じ要素に当たりうる規則で同じプロパティ（一括指定と個別のプロパティの両方。`outline` と `outline-style` など）を書くものが無いか。最低でも `grep -n -E 'outline|clip|font-family|line-height|-webkit-tap-highlight' apps/timer-web/src/styles/*.css` を読む
2. `.ui-` のクラスを持つ要素（`git grep -n 'ui-' -- 'apps/timer-web/src/*.tsx' 'apps/timer-web/src/*.ts'`）に、画面の CSS が同じプロパティを書いていないか（いまは `NotifySettingsPanel.tsx` の 2 か所で、重なりは無い）
3. **台帳の「E8 で当たらなかった規則」と「PR 3 で比較に掛からない要素」の表の各行**について、その CSS の規則を開き、1 と 2 の相手と重なるプロパティが無いかを 1 行ずつ見る（比較が拾わないので、ここが唯一の防壁）

既知の 1 件（Q5）を直す: `roster-panel.css` の `.roster-panel-edit-input` の `outline-style: none;` を消し、同じファイルの冒頭の注釈の「負けて無害」を「PR 4 で消した（`layer(timer)` を外すと勝つため）」に書き換える。ほかに見つかったら、いまの勝ち（画面の CSS が負けている）を保つ形に直し、消した宣言を報告に書く

- [ ] **Step 4: `.sr-only` に `clip-path` を足す（Q6）**

`base.css` の `.sr-only` に `clip-path: inset(50%);` を足し、注釈に「Tailwind 版の `.sr-only` が足していた宣言（設計正本 D2「両版で勝っている宣言の和を残す」）」と書く

- [ ] **Step 5: 入口と依存を書き換える**

`src/index.css` を Q7 の並びにする。`@layer theme, base, timer, components, utilities;`・`@import 'tailwindcss';`・`@config` とその注釈を消し、先頭に `@layer reset;` を置く。画面の `@import` から ` layer(timer)` を外す。冒頭の注釈は、いまの構成（トークン層と部品層は CSS の `@import` で読む。Vite が書体の `url()` を解決する）に書き直す（入口の注釈は同じコミットで直す。画面の CSS の注釈は Step 9）。

`src/main.tsx` から `import "@tasuki/ui/tokens.css";`・`import "@tasuki/ui/components.css";` とその注釈（#297 の回避の説明）を消す（E4）。`./index.css` の import は残す。

`apps/timer-web/package.json` の devDependencies から `tailwindcss`・`@tailwindcss/postcss`・`autoprefixer`・`postcss` を消す（E3）。`git rm apps/timer-web/tailwind.config.js apps/timer-web/postcss.config.js`。

```bash
pnpm install --virtual-store-dir=.pnpm-virtual --config.confirm-modules-purge=false
git diff pnpm-lock.yaml | grep -E "^\+  '?[a-z@]"
```

Expected: 足された行は、既存のパッケージのスナップショットの鍵の付け替え（`(jiti@…)` が外れるなど。例: `+  vite@8.3.1(@types/node@…):`）だけ。**新しいパッケージ名・新しい版が現れたら止まって中身を見る**（`minimumReleaseAge` は版を押し下げる向きにも効く）。直し方が分からなければ、main の lockfile から 4 件の importer の行だけを手で落とす形に戻して報告する

- [ ] **Step 6: ビルドして、ビルド出力を確かめる（E4・D7・Q11）**

```bash
pnpm --filter @tasuki/timer-web build
grep -n '@tasuki/ui' apps/timer-web/src/main.tsx
CSS=apps/timer-web/dist/$(grep -oE 'assets/[^"]+\.css' apps/timer-web/dist/index.html)
PREV=~/.cache/tasuki-parity/pr4-before-dist/$(grep -oE 'assets/[^"]+\.css' ~/.cache/tasuki-parity/pr4-before-dist/index.html)
diff <(grep -oE '@font-face\{[^}]*\}' "$PREV" | sort) <(grep -oE '@font-face\{[^}]*\}' "$CSS" | sort)
grep -oE '@font-face\{[^}]*\}' "$CSS" | sort | uniq -d
grep -oE 'url\([^)]*\.woff2\)' "$CSS" | sort -u
grep -c -- '--tw-' "$CSS"
grep -c '@layer reset' "$CSS"
diff <(grep -oE '(^|[;{])-(webkit|moz|ms)-[a-z-]+' "$PREV" | sed -E 's/^[;{]//' | sort | uniq -c) <(grep -oE '(^|[;{])-(webkit|moz|ms)-[a-z-]+' "$CSS" | sed -E 's/^[;{]//' | sort | uniq -c)
diff <(grep -oE '@supports[^{]*|@media[^{]*' "$PREV" | sort | uniq -c) <(grep -oE '@supports[^{]*|@media[^{]*' "$CSS" | sort | uniq -c)
```

Expected:
- `main.tsx` の `@tasuki/ui` は 0 件（E4 の前半）
- `@font-face` は直前の dist と同じ（差なし）。重複は 0 件。`url()` はすべて `/timer/assets/…woff2`（`../fonts/` が残っていたら #297 の再来）
- `--tw-` は 0 件（直前の dist には多数ある。Tailwind が消えた証拠）。`@layer reset` は 1 件以上
- 前置詞の差は `-webkit-text-decoration` と `-webkit-text-decoration-color` の回数が減ることだけ（Q11）
- `@supports` / `@media` の差は、`color-mix()` の逃げ道が畳まれることと、`not all and (…)` が範囲構文のまま出ることだけ（Q11。U3 で承認されていなければ止まって報告）
- それ以外の差があれば止まって報告する（止まる条件 6）

- [ ] **Step 7: テストと検査**

```bash
pnpm --filter @tasuki/timer-web typecheck && pnpm --filter @tasuki/timer-web lint && pnpm --filter @tasuki/timer-web test
node scripts/audit-timer-classes.mjs && node scripts/audit-ui-components.mjs && node scripts/audit-supply-chain-config.mjs && node scripts/audit-dependency-direction.mjs
node scripts/install-with-supply-chain-check.mjs
node scripts/check-links.mjs
pnpm audit --audit-level high
grep -c -E '"(tailwindcss|@tailwindcss/postcss|autoprefixer|postcss)"' apps/timer-web/package.json
```

Expected: すべて成功。ただし `check-links` は ADR 0001 の `apps/timer-web/postcss.config.js` で赤になる → U5 で承認されていれば `scripts/check-links.mjs` の `MISSING_PATH_EXCEPTIONS` に `{ doc: "docs/adr/0001-design-system-scope.md", path: "apps/timer-web/postcss.config.js", reason: "#321 PR 4 で Tailwind と一緒に消した。ADR 本文の言及は記録として正しい（ADR 0002）" }` を足す（承認が無ければ止まって報告）。`pnpm audit` は ADR 0024 の既知の勧告（`braces` など、台帳の PR 3 の節）だけなら可。最後の `grep -c` は 0（E3）

- [ ] **Step 8: コミットして、通常の比較の全件（約 28 分）**

```bash
git add apps/timer-web/src/styles/reset.css apps/timer-web/src/index.css apps/timer-web/src/main.tsx apps/timer-web/package.json pnpm-lock.yaml apps/timer-web/src/styles/base.css apps/timer-web/src/styles/roster-panel.css scripts/check-links.mjs
git commit -m "refactor: timer から Tailwind・PostCSS・autoprefixer を外す（#321 PR 4）

- preflight を reset.css に逐語で写し、最弱のレイヤーに置く（設計正本 D4）
- 画面の CSS の layer(timer) を外す（D3）。外すと勝つようになる改名欄の outline-style: none を消す
- Tailwind 版が足していた .sr-only の clip-path を base.css に足す（D2）
- トークン層と部品層を CSS の @import で読む（D6・#297 の回避を外す）
- 依存と tailwind.config.js・postcss.config.js を消す（D7）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git status --porcelain
```

clean な作業ツリーで、README の「流す」を全件、`~/.cache/tasuki-parity/pr4-t4-1.log` へ。Expected: 全テスト緑（差 0・画素一致・期待値と一致）。赤なら、差を直して新しいコミットにし、**直した部品が描かれる状態だけ**を M7 で流し直す。`reset.css`・`index.css`・`base.css` を直したときは全状態に効くので全件を流す

差の調べ方の手がかり:
- 全状態の `html` / `body` に差 → `reset.css` の `--theme()` の解き方（止まる条件 2）
- 書体だけの差 → トークン層の `@import` の `url()`
- 特定の要素だけ・`.ui-*` か `base.css` の規則が当たる要素 → 勝ち負けの逆転（Step 3）
- `--tw-*` と Tailwind の theme 層の変数の有無 → 正本 §5.4 の類 1 で無害（比較のコードが除いている）

- [ ] **Step 9: 注釈だけを直す別コミット（Q8）**

`session.css` の「`animation` の一括指定で書かない」の注釈は、理由（Tailwind の最適化がテーマの `@keyframes` を残す）が消えたので、「`@keyframes pulse` の定義はここが唯一（`loading.css` も使う）」だけを残して書き換える（宣言の形は変えない）。`grep -n -iE 'layer\(timer\)|@layer timer|Tailwind に(負|勝)|ユーティリティより|移行中' apps/timer-web/src/styles/*.css` で引いた注釈を、いまの構成に合わせて直す。**`scale-exempt:` の「Tailwind の … の写し（#316 で段へ寄せる）」は残す**（正本 D2）。

```bash
pnpm --filter @tasuki/timer-web build
diff -r ~/.cache/tasuki-parity/pr4-t4-dist apps/timer-web/dist 2>/dev/null || true
```

（Step 8 の比較が緑になった時点の dist を `cp -r apps/timer-web/dist ~/.cache/tasuki-parity/pr4-t4-dist` で退避しておき、注釈の書き換えの後の dist と `diff -r` で同一であることを見る。同一なら比較を流し直さない）

コミット: `docs: timer の CSS の注釈を Tailwind を外した後の構成に合わせる（#321 PR 4）`

---

### Task 5: 通しで確かめる

**実装役: 統括（Opus）**（合わせて約 40 分。`run_in_background` で 1 本ずつ起動し、完了の通知を待つ）

- [ ] **Step 1: CI と同じ検査を手元で回す（約 10 分）**

`.github/workflows/ci.yml` の `run:` から導いた一式（2026-10-06。足された検査があればここに足して回す）:

```bash
cd /workspaces/claym/local/Tasuki
git status --porcelain
node scripts/install-with-supply-chain-check.mjs
pnpm typecheck && pnpm lint && pnpm test && pnpm build
bash -c 'node --test $(node scripts/list-scan-targets.mjs script-tests)'
node scripts/check-links.mjs && node scripts/audit-plan-gate.mjs
bash -c 'for s in structure log-hygiene assembly-wiring domain-error-shape domain-side-effects dependency-direction web-sync-boundary ui-components timer-classes public-surface supply-chain-config; do node scripts/audit-$s.mjs || echo "NG $s"; done'
bash -c 'shellcheck -x --source-path=deploy --severity=warning $(node scripts/list-scan-targets.mjs shell)'
pnpm --filter @tasuki/e2e exec vitest run
pnpm e2e
pnpm audit --audit-level high
```

Expected: すべて成功（`NG` の行が出ない）。`pnpm audit` は CI の外の追加で、ADR 0024 の既知の勧告だけなら可。`pnpm e2e` の書体のドリフト検査（`timer-a11y.spec.ts`）が緑であること（E4）。`ss -tlnp | grep -E ':(8787|18080)\b'` が空

- [ ] **Step 2: 通しの比較の記録を確かめる**

Task 4 Step 8 の最後の全件の比較のログと、そのときの HEAD を控える（`~/.cache/tasuki-parity/pr4-compared-head.txt`）。**この HEAD が `ba9249d` との通しの比較の記録になる**（正本 §1.2）。Task 4 Step 8 で直しを入れて状態を絞って流した場合は、最後の直しの後に全件を 1 本流す

- [ ] **Step 3: 検査の破壊検証（コミットしない・数秒ずつ）**

`git status --porcelain` が空であることを見てから、1 つずつ壊して赤を見て、Edit で戻す:
1. `session.css` の色の 1 か所を `#ff0000` にする → `node scripts/audit-ui-components.mjs` が赤（E5）
2. `Session.tsx` の 1 か所の `className` を `px-4` にする → `node scripts/audit-timer-classes.mjs` が赤（E6・Tailwind のクラスの書き戻し）
3. `session.css` の `@keyframes pulse` を消す → `node scripts/audit-timer-classes.mjs` が赤（借り物のキーフレーム）
4. `apps/timer-web/src/index.css` の `@import '@tasuki/ui/tokens.css';` を消す → `pnpm --filter @tasuki/timer-web build` の後、Task 4 Step 6 の `@font-face` の `diff` に差が出る（E4 の確かめ方が書体の欠落を拾えること）。**戻した後に `pnpm --filter @tasuki/timer-web build` を流し直す**

最後に `git status --porcelain` が空であることを見る

- [ ] **Step 4: 変異パッチ（機械約 10〜15 分）**

```bash
bash -c 'for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NG $p"; done'
```

当たらないものは Task 3 Step 5 の手順で作り直す。`git status --porcelain` が空であることを見てから `node scripts/mutation-check.mjs > ~/.cache/tasuki-parity/pr4-t5-mutation.log 2>&1` を全件（`--help` を付けない）。Expected: すべての変異が殺される。終わったら `git status --porcelain` が空

---

### Task 6: 溜めた Minor をまとめて直す

**実装役: 統括（Opus）**

Task 2〜5 のレビューで溜めた Minor を直す。製品の CSS か `.tsx` を直したら、直した部品が描かれる状態だけを M7 で比べ直す（`reset.css`・`index.css`・`base.css` なら全件）。Minor が無ければ飛ばす。

コミット: `refactor: PR 4 のレビューの Minor をまとめて直す（#321）`

---

### Task 7: 現況の記述と ADR（D8・E9）

**実装役: 統括（Opus）**

- [ ] **Step 1: 正本 D8 の検索を引き直す**

```bash
bash -c "git grep -I -inE 'tailwind|postcss|autoprefixer|ユーティリティ|任意値|preflight|\[var\(--|[a-z]-\[' -- ':!pnpm-lock.yaml' ':!docs/plans' ':!docs/superpowers/plans' ':!docs/superpowers/specs' ':!docs/retrospectives' ':!e2e/parity' ':!e2e/tests/parity-*' ':!e2e/tests/*-summary.test.ts'" > ~/.cache/tasuki-parity/pr4-d8.txt
wc -l ~/.cache/tasuki-parity/pr4-d8.txt
cut -d: -f1 ~/.cache/tasuki-parity/pr4-d8.txt | sort | uniq -c | sort -rn
```

（比較の仕組みは Task 9 で丸ごと消えるので除いて引く。Task 9 の後に除外なしで引き直し、残りが 0 件であることを見る）

- [ ] **Step 2: 1 件ずつ「書き直す」か「残す理由」に仕分ける**

既知の書き直し先（正本 D8）: `packages/ui/README.md`（「Tailwind と併用する場合は `@import` しない」の節を消す）・`packages/ui/src/elements/index.css`・`src/tokens/index.css`・`src/tokens/palette.css`・`stylelint.config.mjs`・`tests/tokens.test.mjs`・`apps/topic-web/src/index.css`・`scripts/audit-ui-components.mjs`・`e2e/support/contrast.ts`・`docs/guides/development.md`・`apps/timer-web/src/ui/use-breakpoint.ts`（「画面の CSS の `64rem` の境界と揃える（JS は px なので既定の文字の大きさでだけ一致する）」）。ほかに: ルートの `README.md` の技術一覧（「Tailwind CSS（timer）」を消す）・`docs/guides/architecture.md`・`deploy/README.md`。**「トークン層に要素セレクタを置かない」規則そのものは残し、理由を「timer が要素層を読まないため」にする**

残してよい類: timer の CSS の `scale-exempt:` の「Tailwind の … の写し（#316 で段へ寄せる）」（正本 D2）・ルートの `postcss`・`postcss-selector-parser`（ADR 0022 決定 7）・ADR 0001・0008・0022・0023 の本文と日付つきの追記（ADR 0002）・`pnpm-workspace.yaml` と `audit-supply-chain-config.test.mjs` の `postcss`（ルートの依存）・e2e のハーネスの `preflight`（起動前の検査という別の意味）・関数の意味の「ユーティリティ」・`[var(--` が CSS の正当な書き方のもの・`scripts/mutation-check.mjs` の残る変異の説明文で Tailwind に触れるもの（m119 など。書き戻しの網の説明として正しい）

台帳には、U6 で承認された形（ファイル単位の表: ファイル・扱い・理由）で書く（E9）

- [ ] **Step 3: 確かめてコミット**

```bash
node scripts/check-links.mjs && node scripts/audit-plan-gate.mjs
pnpm --filter @tasuki/ui test && pnpm --filter @tasuki/ui lint
bash -c 'node --test $(node scripts/list-scan-targets.mjs script-tests)'
bash -c 'for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NG $p"; done'
pnpm --filter @tasuki/timer-web build && diff -r ~/.cache/tasuki-parity/pr4-t4-dist apps/timer-web/dist
```

Expected: すべて成功。パッチはすべて当たる（`audit-ui-components.mjs` は m111〜m114、`contrast.ts` は m73〜m75 の文脈。当たらなければ作り直す）。timer の dist は比較した時点と同一（`use-breakpoint.ts` の注釈は最小化で消える。差が出たら比較を流し直す）

コミット: `docs: Tailwind を外した後の現況の記述を書き直す（#321 PR 4）`

---

### Task 8: PR・レビュー

**実装役: 統括（Opus）**

- [ ] **Step 1: draft PR を作って番号を取る**

```bash
git push
gh pr create --draft --title "refactor: timer から Tailwind を外す（#321 PR 4）" --body-file <scratchpad の本文>
```

本文は git-workflow の型（概要・変更内容・テスト方法）で、数は書かず台帳へのリンクだけを置く。末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。**#321 を閉じるキーワードは、この時点では書かない**（Task 10 で文案を利用者に見せて決める）

- [ ] **Step 2: レビュー**

文脈を共有しない `/code-review` を **PR 番号を明示して**通す。指摘は採点が出てから直す。製品の CSS か `.tsx` を直したら、M7 で直した部品が描かれる状態だけを比べ直す（比較の仕組みはまだある。`reset.css`・`index.css`・`base.css` なら全件）。製品コードを変えたら `mutation-check` も全件。比べ直した HEAD を `pr4-compared-head.txt` に書き直し、その dist を `pr4-t4-dist` に退避し直す

---

### Task 9: 比較の仕組みを撤去する（正本 §5.1・Q9）

**実装役: Sonnet（Step 1〜4）・統括（Step 5）**

- [ ] **Step 1: 撤去の直前の SHA を控える**

```bash
git status --porcelain
git rev-parse HEAD > ~/.cache/tasuki-parity/pr4-parity-last-sha.txt
```

- [ ] **Step 2: 引き直して消す**

`e2e/parity/README.md` の冒頭のとおり、一覧で持たず `git grep -n -i parity -- ':!docs'` で引き直して消す。少なくとも: `git rm -r e2e/parity`（の後に `rm -rf e2e/parity/out`）・`e2e/tests/parity-*.test.ts`・`e2e/tests/removal-summary.test.ts`・`e2e/tests/usage-summary.test.ts`・`e2e/tsconfig.json` の `include` の `"parity"`・`e2e/package.json` の `lint` の `parity`・`.gitignore` の 63・64 行目。**`e2e/package.json` の devDependency の `postcss`**（使い手は `usage-summary.ts` とそのテストだけ）も消し、`pnpm install --virtual-store-dir=.pnpm-virtual --config.confirm-modules-purge=false` で lockfile を更新する（足された行が鍵の付け替えだけであることを Task 4 Step 5 と同じく見る）。**正本・台帳・ADR・過去の計画と振り返りの言及は残す**。基準の worktree（`~/.cache/tasuki-parity/base-ba9249d`）は作業ツリーの外なので、ここでは消さない

```bash
bash -c 'git grep -n -i parity -- ":!docs"'
```

Expected: 0 件

- [ ] **Step 3: リンク検査**

`check-links` は、ADR 0023 の `e2e/parity/` と、台帳の `e2e/parity/README.md`・`e2e/parity/expected/base-summary.json` へのリンク（4 か所）で赤になる:
- ADR 0023 の分は、U5 で承認されていれば `MISSING_PATH_EXCEPTIONS` に `{ doc: "docs/adr/0023-timer-without-tailwind.md", path: "e2e/parity/", reason: "#321 PR 4 の最後に撤去した。再現の手順は台帳" }` を足す（`path` の綴りは `check-links` の出力に合わせる）
- 台帳の 4 か所は、相対リンクをやめ、「撤去の直前の SHA の `e2e/parity/README.md`（`git fetch origin pull/<PR 4 の番号>/head` で取る）」と地の文で書く（統括が Step 5 で直す）

- [ ] **Step 4: テストと検査**

```bash
pnpm --filter @tasuki/e2e typecheck && pnpm --filter @tasuki/e2e lint && pnpm --filter @tasuki/e2e exec vitest run
bash -c 'node --test $(node scripts/list-scan-targets.mjs script-tests)'
node scripts/install-with-supply-chain-check.mjs
```

コミット: `chore: 基準と並べる比較の仕組みを撤去する（#321 PR 4）`（本文に撤去の直前の SHA と、`git fetch origin pull/<PR 4 の番号>/head` の後に `git restore --source=<SHA> --worktree -- e2e/parity e2e/harness/parity-build-switches.ts` で再現できることを書く）

- [ ] **Step 5: 統括: 台帳の PR 4 の節・ADR 0023 の実施状況・dist の同一（Review Focus 5）**

```bash
pnpm --filter @tasuki/timer-web build && diff -r ~/.cache/tasuki-parity/pr4-t4-dist apps/timer-web/dist
bash -c "git grep -I -inE 'tailwind|postcss|autoprefixer|ユーティリティ|任意値|preflight|\[var\(--|[a-z]-\[' -- ':!pnpm-lock.yaml' ':!docs/plans' ':!docs/superpowers/plans' ':!docs/superpowers/specs' ':!docs/retrospectives'" | wc -l
```

Expected: dist は同一。D8 の検索の件数は Task 7 の仕分けの残す分と一致する（増えていたら仕分けを足す）

台帳の PR 4 の節: ブランチの SHA・通しの比較の HEAD（`pr4-compared-head.txt`）と結果と所要時間・対照実行の一部（Task 2）・破壊検証（Task 3・5）・前置詞と逃げ道の差（Q11）・`@font-face`（E4）・勝ち負けの点検の結果（Task 4 Step 3）・消した効いていない宣言（Q5 ほか）・`.sr-only` の和（Q6）・D8 の仕分けの表（E9）・#316 へ送ったもの（Q12・大きさで付けた名前）・**比較の仕組みの再現の手順**（Q9・Q10）・計画の見積もりと実際の待ち時間・実時間（`pr4-*.log` と `pr4-start.txt` から）。冒頭の「比較の仕組み」の行は、元の記述を残したまま「PR 4 で撤去した。再現の手順は PR 4 の節」と注記する

ADR 0023 の末尾に「## 実施状況（追記・<書く日>）」を足す: PR 1〜4 の番号と、決定 1〜6 がそれぞれどの PR で実施されたか・E8 を正本 §7.2 の記録で受け入れたこと・比較の仕組みを撤去したことと再現の手順（台帳を指す）。**数は写さない**。本文の「決定した。実施は #321 の PR 4」は書き換えない

```bash
node scripts/check-links.mjs && node scripts/audit-plan-gate.mjs
```

コミット: `docs: 台帳の PR 4 の節と ADR 0023 の実施状況を書く（#321）`

---

### Task 10: 振り返り・#321 の本文・マージの判断

**実装役: 統括（Opus）**

- [ ] **Step 1: 振り返りを書く**

`docs/retrospectives/<書く日>-issue-321-timer-without-tailwind.md`。様式は `docs/retrospectives/2026-09-29-issue-320-ui-components-layer.md` に倣う。中身: 目的と結果（PR 1〜4 と確認ダイアログの PR）・見積もりと実績（PR 2 の約 29 時間と、§7.1 で軽くした後の PR 3・4）・効いたこと（基準を固定した比較・除去検査・台帳・計画の敵対的検証）・効かなかったこと（E8 の網羅の確認が全比較のやり直しを呼んだ・何も動かない空白・E8 を受け入れた代償として比較に描かれない要素の逆転を目で見ることになった）・#316 への申し送り（台帳を指す）・本番へ出すときの注意（timer の見た目は変わらない。依存が変わる。#318 以降と一緒に配る）。数は台帳を指し、写さない

コミット: `docs: #321 の振り返りを書く`。push して CI の緑を見る

- [ ] **Step 2: #321 の本文の「進み具合」と、PR の閉鎖キーワード**

PR 4 の行を `[x]` にして PR 番号を書く文案と、PR 本文に #321 を閉じるキーワードを書くか（書くなら地の文に 1 回だけ・バッククォートで囲まない）を、**書き込みの前に利用者に見せる**

- [ ] **Step 3: マージの前に利用者に確かめる**

draft を外し、CI の結果・台帳・レビューの結果を並べて報告し、マージの判断を仰ぐ。あわせて、基準の worktree（`~/.cache/tasuki-parity/base-ba9249d`）・`~/.cache/tasuki-parity/` の控え・`backup/issue-321-pr2-task13b-stopped` のブランチを消してよいかを聞く。**配布はしない。**
