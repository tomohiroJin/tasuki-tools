# timer から Tailwind を外す — PR 3: Session と子の部品（#321）実装計画

> **作業者へ:** 必須サブスキル `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: timer の見た目を 1 つも変えずに、`Session.tsx` と、その子の部品 10 本を、Tailwind のユーティリティから `@layer timer` に入れた素の CSS へ移す。終わると `scripts/audit-timer-classes.mjs` の `UNMIGRATED` が空になる。

**方式**: 子の部品（葉）を先に移し（Task 1〜5）、最後に親の `Session.tsx` を移す（Task 6）。各タスクは PR 2 の計画の「移植の手順」（M1〜M9）に従い、**対象の状態だけ**を基準と並べて差 0 を確かめる。最後に、溜めた Minor を直してから、対照実行（`approved.ts` を変えるため）と通常の比較を全件 1 本ずつ流す（Task 7・8）。

**技術**: Playwright（`e2e/parity/`）・vitest（`apps/timer-web/test`）・`node --test`（`scripts/`）

**正本**: `docs/superpowers/specs/2026-09-29-timer-without-tailwind-design.md`。**計画は正本に従属する。両方を読むこと。** この計画は正本の §4 **PR 3** を実装し、**§7.1（PR 3・4 の検証を軽くする）に従う**。関係する節: D1・D2・D3・D8（トークン表）・D10・§5（§5.5 の E8 は §7.1 により流さない）・§6（E1・E2・E5・E6）。台帳: `docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`。比較の流し方の正本: `e2e/parity/README.md`。
**移植の手順（M1〜M9）と Tailwind の値の早見表は、PR 2 の計画 `docs/superpowers/plans/2026-10-03-timer-without-tailwind-pr2-primitives-and-screens.md` の「移植の手順」節をそのまま使う。** ただし、下の「PR 2 の計画から差し替える点」を優先する。

## 検証の時間の見積もり（2026-10-05・PR 2 の通常の比較の状態ごとの実測と、計画の敵対的検証から）

比較は 1 本ずつしか流せない（ポートが固定）。秒数は基準とブランチの両側の合計で、1 回の起動ごとにビルドとハーネスで約 1 分が乗る。

| タスク | 比べる状態（下限。M7 で足してよい） | 1 回 | 想定の回数 | 小計 |
|---|---|---|---|---|
| 1 小さな表示部品 | `session-driver`・`session-navigator`・`session-paused`・`session-guest-skipping`（タッチの組を含む） | 約 5 分 | 2 | 約 10 分 |
| 2 交代の知らせと自分の交代 | `session-switched`・`session-guest-skipping`・`session-driver`・`session-navigator` | 約 5 分 | 2 | 約 10 分 |
| 3 共有メモ | `session-memo`（`session-memo-markdown` も当たる）・`session-driver` | 約 4.5 分 | 2 | 約 9 分 |
| 4 終了の操作 | `session-end-confirm`・`session-driver` | 約 3.5 分 | 2 | 約 7 分 |
| 5 名簿 | `session-remove-confirm`・`session-proxy-form`・`session-guest-skipping`・`session-driver` | 約 5.5 分 | 3 | 約 17 分 |
| 6 Session 本体 | (a) `session-urgent` を除く Session の全状態と `loading-unreachable`（約 11 分・最大 3 回）／(b) `session-urgent` だけ（約 8 分・最大 2 回） | — | — | 約 30〜50 分 |
| 7 Minor をまとめて直す | 触った部品の状態だけ | — | — | 約 10〜20 分 |
| 8 通し | 手元の検査（CI と同じ一式） | 約 6〜10 分 | 1 | 約 10 分 |
| 8 通し | 対照実行の全件（`approved.ts` を変えるので・§7.1） | 約 28 分 | 1 | 約 28 分 |
| 8 通し | 通常の比較の全件 | 約 28 分 | 1 | 約 28 分 |
| 8 通し | `node scripts/mutation-check.mjs` の全件（CI で約 6 分・手元は約 2 倍） | 約 10〜15 分 | 1 | 約 15 分 |
| 9 PR | CI の待ち（push ごと約 8 分）・`/code-review` の後の比べ直し・main を取り込んだ後の全件（取り込むときだけ） | — | — | 約 20〜90 分 |

**機械の待ち時間: 約 3〜5 時間。** これとは別に、実装役（Sonnet）の作業・レビュー役（Opus）の往復・差の調べもの・変異パッチの作り直し（PR 2 では約 55 分）が乗る。**全体は 8〜13 時間を見込む**（PR 2 の実績では、機械の待ちは活動の 3 割弱だった）。

### 測り方と止まる条件

- Task 0 で開始の時刻を `date -Iseconds > ~/.cache/tasuki-parity/pr3-start.txt` に書く
- **比較と `mutation-check` は、必ず `~/.cache/tasuki-parity/pr3-t<タスク番号>-<回数>.log` へ書き出す**（`… > ~/.cache/tasuki-parity/pr3-t1-1.log 2>&1`）。機械の待ちの合計は `bash -c 'grep -h -E "(passed|failed) \(" ~/.cache/tasuki-parity/pr3-*.log'` で統括が足し上げる
- 実装役への dispatch の本文に「**比較を流した回数と、各回のログの `passed/failed (X m)` の行を報告に含める**」と書く
- **止まって利用者に報告する条件**（どれか 1 つ）:
  1. あるタスクで比較を 3 回流しても差が残る
  2. 機械の待ちの合計が 8 時間を超えそう
  3. 開始から実時間で 16 時間を超えそう
  4. 1 つの差の調べもの（比較を流さずに `diff.json` や除去検査を読む時間）が 1 時間を超えた

流さないもの（正本 §7.1）: 囲いを外した一時ビルド（PR 4 の通しが担う）・E8（PR 4 の前に決め直す）・タスクごとの全件の比較。

## この計画で決めたこと（正本に無い細部）

| # | 決めたこと | 理由 |
|---|---|---|
| Q1 | **子の部品を先に、`Session.tsx` を最後に移す。ただし `Session.tsx:215` の `space-y-6` は Task 1 で `NotifyHint` と一緒に移す**（`session.css` を Task 1 で作る）。ほかの子で、根に alive の `margin-*` を持ち、親が Tailwind の `space-*` のものは、検証の時点で無い（2026-10-05 に除去検査で確かめた。`SelfDriverToggle` の `mb-3` と `RotationLineup` の `mt-3` は親が `space-*` ではない） | 親の Tailwind の `space-*`（utilities 層）は、`@layer timer` へ移した子の margin に勝つ（PR 2 の実測）。`NotifyHint` の根の `mb-3` は `session-driver` の 5 幅すべてで alive で、いまは詳細度で `:where(.space-y-6 > …)` に勝っている。子だけ移すと余白が 0.75rem から 1.5rem に変わる |
| Q2 | **`Session.tsx` を移すタスクで `@keyframes pulse { 50% { opacity: 0.5; } }` を `styles/session.css` に 1 つだけ置き、`loading.css` の注釈を書き換える** | `loading.css` の `animation: pulse` は、Session.tsx の `animate-pulse` を見て Tailwind が出しているキーフレームを借りている。Session.tsx から `animate-pulse` が消えると Tailwind は出さなくなる。`audit-timer-classes` の検査 5（借り物のキーフレームの出どころ）が強制する。2 つ置くと比較のキーフレームで差が出る |
| Q3 | **`RosterPanel` のスクロールの形は `data-scrollable` 属性で分け、`RosterPanel.test.tsx` は属性を見る**（`toHaveAttribute("data-scrollable")`） | 正本 D10「クラス名で書いた否定のアサーションは、属性か DOM の構造で見る形に書き直す」と、PR 2 の P6（属性の形で PR 3 へ送った） |
| Q4 | **PR 2 で残した E8 の道具の Minor 3 件（`usage.ts` の `cdp.detach()`・`timer.parity.ts` の `writeUsage` の到達しない `return`・`usage-summary.ts` の `startsNestedDeclarations`）は PR 4 の前の E8 の決め直しへ送る**（利用者の判断・2026-10-05） | E8 は PR 3 で流さない。計画の検証で、`startsNestedDeclarations` の直しのテスト例が直す前から緑になること・前提の Chromium の挙動が実測でないこと・`finally` の `detach` が元の例外を隠しうることが分かった。比較の仕組みのコードに触れなければ、§7.1 の「仕組みを変えたら対照実行」とも食い違わない |
| Q5 | **比較に描かれない要素も、alive と同じく写す。** 除去検査に行の無い要素は undecided と同じ扱い（写す側へ倒す）。写した要素は `~/.cache/tasuki-parity/pr3-unseen.tsv`（ファイル・行・要素の説明）に足し、台帳の「PR 3 で比較に掛からない要素」として残す。**状態は足さない**（利用者の判断・2026-10-05。PR 4 の前の決め直しの材料） | 目録にタブを押す状態・編集中のメモ・改名の入力欄などが無い。状態を足すと期待値の作り直しと全比較のやり直しを呼び、PR 2 と同じく終わりが来にくい |
| Q6 | **`TeamOrbit` の王冠の `drop-shadow`（Tailwind の既定値で生の色）は、トークン `--shadow-crown` を足して書く。** 基準に無いトークンの差は `e2e/parity/approved.ts` の承認に足す（利用者の承認・2026-10-05）。`approved.ts` を変えるので、Task 8 で対照実行を流す | 正本 D2（影はトークン）と E5（生の色を書かない）。PR 2 の `--shadow-panel`・`--shadow-dialog` と同じ扱い |
| Q7 | **レビューの Minor はタスクごとに直さず、Task 7 でまとめて直す**（通しの比較より前）。Critical と Important はそのタスクで直す | 正本 §7.1。直しを通しの比較と変異検査より前に置き、最後に確かめた HEAD と台帳の SHA を揃える |
| Q8 | **実装役のモデル**: Task 1〜6 は Sonnet（`claude-sonnet-5-5`）。Task 0・7〜9 は統括（Opus）。レビュー役は Opus。変異パッチを作り直したときの弱まりの確認はレビュー役に渡す | 利用者の方針（2026-10-03）・`mutate-after-rewriting` |

## PR 2 の計画から差し替える点

1. **除去検査を取り直さない。** 基準は `ba9249d` に固定で、PR 3 のファイルの DOM は基準のまま（2026-10-05 に `git diff ba9249d HEAD` で className 以外の変化が無いことを確かめた）。読むのは `bash ~/.cache/tasuki-parity/probe-grep.sh '<根の語>'`（列は `dead/alive/undecided` の TSV）。PR 2 の計画の `node --experimental-strip-types -e` は拡張子の無い import で動かないので使わない
   - **className の列は基準の className。** PR 2 で次の行を書き換えたので、`git diff ba9249d HEAD -- <ファイル>` で元の className を引いてから探す: `PrimaryButton`・`GhostButton` への `px-*`・`py-*` を消した行（`Session.tsx` 1・`RosterPanel.tsx` 1・`SelfDriverToggle.tsx` 5）、`RosterPanel.tsx` の `SectionHeader` の `color` の行、`SharedMemo.tsx` の `highlightClass`（`meter-panel-highlight` に変えた）
   - **TSV は要素の場所を持たない。** `w-full` のような短い語や、`space-y-6` のように別の画面にも同じ className がある語は、className の列だけでは見分けられない。**状態の列で、移すファイルが描かれる状態の行かを見る**（`Session.tsx:215` の `space-y-6` は Lobby と同じ className で、alive の行は lobby の状態にしか出ない）
   - TSV（世代 `0e87abb`）には `session-memo-markdown` の行が無い（後から足した状態）。共有メモの外枠は `session-memo` と同じ DOM なので、`session-memo` の行で読む
   - **行の無い要素は写す**（Q5）
2. **`text-*` の行の高さで割り切れない比率は `var(--timer-never-defined, calc(1 / 0.75))` の形で書く**（直書きの `calc()` は最小化で 5 桁に畳まれ、16px が 15.984px になる）。`--timer-never-defined` を宣言すると検査が落とす。注釈の正本は `apps/timer-web/src/styles/status-strip.css` の冒頭
3. **M7 の比較で `parity/out/` を丸ごと消さない。** 消すのは選んだ状態のディレクトリだけ（`rm -rf parity/out/<状態>`）。比較の出力は「測り方と止まる条件」のとおりログへ書き出す
4. **M6 の検査は、変数を渡す形（`className={x}`）と関数の呼び出し（`className={f(…)}`）を落とす。** 字面の条件式（`className={cond ? "a b" : "a"}`・入れ子の条件式も可）か `data-*` 属性にする

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 見た目の移植は、緑の特性テスト（基準と並べる比較）の下で行う Refactor の段（正本 §8）。`RosterPanel.test.tsx` は先に属性の形へ書き直して赤を見る（Task 5） |
| II. 技術選定は ADR を通す | 通過 | 新しい依存は足さない。決定は ADR 0023 の範囲内 |
| III. 揮発インメモリと単純運用 | 通過 | 同期サーバーに触れない。配布しない |
| IV. 境界の型安全 | 該当なし | wire と境界の型に触れない |
| V. 実画面検証 | 通過 | タスクごとに対象の状態を、最後に全件を、基準と並べて比べる（正本 §7.1 の範囲）。比較に掛からない要素は台帳に残す（Q5） |
| VI. 依存は内向き | 通過 | `e2e/parity/` の変更は `approved.ts` の承認の 1 項目だけ |
| VII. 検査は壊して確かめる | 通過 | `RosterPanel.test.tsx` の書き直し（Task 5）、生の色・クラス名・借り物のキーフレームの検査（Task 8）、`approved.ts` を変えたので対照実行（Task 8）、変異パッチの当て直し（Task 0・Task 8） |
| VIII. 記録が正本 | 通過 | 台帳の PR 3 の節（Task 9）。#321 の本文の「進み具合」を更新する |
| IX. 小さく回す | 通過 | 正本 §4 の PR 3。部品のまとまりごとにタスクとコミットを分ける |
| X. 抽象は実需で | 通過 | 新しい共有の部品を作らない。トークンは使い手（王冠）と同じタスクで足す |
| XI. 秘密と個人情報 | 該当なし | 秘密・個人情報に触れない |

**逸脱なし**（検証の範囲は正本 §7.1 のとおり。Q4・Q5・Q6 は利用者の判断）。

## 全体の制約

- ブランチは `feature/issue-321-pr3-session`（main `d80c0f9` から切った。最初のコミットは正本 §7.1 の追記 `fcca762`）。**main へ直接コミットしない。** push はコミットのたびに統括が行う。**実装役のサブエージェントには push もマージもさせない**（dispatch の本文に書く。作業の後に `git log origin/feature/issue-321-pr3-session` を見る）
- **見た目を 1 つも変えない。** 移したあとの比較の差は 0 件でなければならない。出た差は、雑音として名指しせず、まず写し方の誤りを疑う。どうしても残る差は台帳に書き、利用者の個別の承認を得る
- 基準は `ba9249d` に固定する。基準の dist は `~/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist`（消さない）。作業ツリーで `git checkout main -- …` をしない
- **#321 が終わるまで、timer に触れる他の Issue を main へマージしない**
- 写すのは main で勝っている宣言と、比較に描かれない要素の宣言（Q5）。dead は写さず、`~/.cache/tasuki-parity/pr3-dead.tsv`（1 行 1 組・タブ区切り: ファイル・className・token）に足していく
- `@layer timer` の中で `!important` を使わない。新しい CSS は `--tw-*` と Tailwind の theme 層の変数を `var()` で参照しない（`backdrop-blur-sm` は `--blur-sm` を参照せず `8px` で書く）。生の色を書かない。`src/styles/` に相対 `url()` を書かない
- クラス名は意味で付け、部品の根の名前を語頭に置く（`.roster-panel`・`.roster-panel-row`）。D1 の衝突させない名前（`.ui-`・`.instrument-*`・`.chrono-*`・`.animate-*`・要素層のクラス・Tailwind のユーティリティ名）と重ねない。`scripts/audit-timer-classes.mjs` が落とす
- **残すクラス**: `base.css` の `.animate-fade-up`・`.animate-pop-in`（timer が定義する）と、`CircularProgress.tsx` の `chrono-hand`（`e2e/specs/timer-a11y.spec.ts` がセレクタに使う）
- 破壊検証の前に `git status --porcelain` が空であることを確かめる。破壊はコミットしない。**実装役は破壊を Edit で戻す**（`git checkout --` を使わない）
- 長い実行（比較・`mutation-check`）は `run_in_background` で**実行そのもの**を起動し、完了の通知を待つ。`pgrep -f` で見張らない
- 自己テストは bash で回す（zsh は未クォートの glob で偽の赤を出す）。出力を `| head` / `| tail` で切って数えない（数えるときは `grep -c` / `wc -l`）
- E2E と比較は 8787 と 18080 を使う。利用者の `pnpm run dev` が掴んでいたら止めずに聞く。終わったら `ss -tlnp | grep -E ':(8787|18080)\b'` が空であることを見る
- `pnpm exec` が `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` で止まったら依存が古い: `pnpm install --frozen-lockfile --virtual-store-dir=.pnpm-virtual`
- turbo がキャッシュから dist を戻すとき古い CSS を消さない。ビルドの CSS を読むときは `dist/index.html` が参照する 1 本を読む
- 新しい E2E のタグを足さない。台帳と ADR に数を写さない
- コミットは `git add <ファイルを名指し>` で行う（`git commit -a` を使わない）。メッセージは日本語の Conventional Commits。末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **子を `@layer timer` へ移すと、親 `Session.tsx` の Tailwind（`space-y-6`・`lg:space-y-0`・`lg:grid` の `gap`）が子の根の margin に勝つ** → Task 1 で `NotifyHint` と `Session.tsx:215` を一緒に移す（Q1）。ほかのタスクでも M3 の 2 で確かめる。比較は 5 幅すべて
2. **比較に描かれない要素（「ルーム」タブの中身・編集中の共有メモ・名簿の改名の入力欄と理由の行・「代理」のチップ・代理追加の誤りの行・「見学」の一覧・輪の外の人の加入の盤・「ナビ:」の表示・送信中の `disabled` の見た目）を写し落とす、または写し違える** → Q5 で写す側へ倒し、各タスクの注意に名指しし、台帳に残す。レビュー役は、そのタスクの `pr3-unseen.tsv` の行と `.tsx` の差分を突き合わせ、Tailwind のクラスを 1 つずつ CSS の宣言へ対応づけて読む
3. **状態の変種の写し忘れ**（11 本の実数・2026-10-05 の grep: `hover:` 6・`focus-visible:` 32・`focus:` 3・`active:scale-95` 3・`disabled:` 2・`[&>span.chip]:` 1。`group-*`・`peer-*`・`aria-*:`・`data-*:`・`motion-*` は 0） → `hover:` は `@media (hover: hover)` の中へ。`focus-visible:` の ring は影と合成した 1 つの `box-shadow`（並びは ring-offset → ring → shadow）。`hover:` を `@media` に入れ忘れると、各タスクの `-g` が当たる `session-driver（タッチ・360px）` が拾う
4. **`Session.tsx` から `animate-pulse` が消え、Tailwind が `@keyframes pulse` を出さなくなり、読み込み画面の点滅が止まる** → Task 6 で Q2 のとおり置く。Task 6 の比較に `loading-unreachable`（pulse を持つ。`loading-timed-out` は持たない）を足し、キーフレームの比較で差 0 を見る
5. **`lg:` / `md:` / `sm:` の範囲の変種を、上端の無い `@media` で写して別の幅にも効かせる**（`sm:` 2・`md:` 5・`lg:` 8） → 除去検査の alive の `widths` が 5 幅の一部だけなら上端つきの範囲にする。比較は 5 幅すべて

---

### Task 0: 着手前の確認

**実装役: 統括**

**Files:** なし

- [ ] **Step 1: 作業ツリーと基準の dist を確かめ、開始の時刻を書く**

```bash
cd /workspaces/claym/local/Tasuki
git status --porcelain
git rev-parse --abbrev-ref HEAD
git -C ~/.cache/tasuki-parity/base-ba9249d rev-parse HEAD
ls ~/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist/index.html
date -Iseconds > ~/.cache/tasuki-parity/pr3-start.txt
```

Expected: 1 行目は出力なし。ブランチは `feature/issue-321-pr3-session`。基準の HEAD は `ba9249d` で始まる。`index.html` がある

- [ ] **Step 2: 全変異パッチに `git apply --check` を当て、PR 3 のファイルを文脈に持つものを控える**

```bash
cd /workspaces/claym/local/Tasuki
bash -c 'for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NG $p"; done'
bash -c 'grep -l -E "Session.tsx|CircularProgress|EndSessionZone|NotifyHint|RosterPanel|RotationLineup|SelfDriverToggle|SharedMemo|SwitchAlert|Tabs.tsx|TeamOrbit|loading.css|shape.css|approved.ts" scripts/mutations/*.patch' > ~/.cache/tasuki-parity/pr3-mutations-at-risk.txt
wc -l ~/.cache/tasuki-parity/pr3-mutations-at-risk.txt
```

Expected: 1 本目は出力なし（2026-10-05 に全部当たることを確かめた）。控えは 5 本（m55〜m59。文脈は `RosterPanel.tsx` のロジックの部分で、className の行を含まない）

コミットはしない。

---

### Task 1: 小さな表示部品と、セッションの縦積み

**実装役: Sonnet**

**Files:** `ui/components/NotifyHint.tsx`・`Tabs.tsx`・`CircularProgress.tsx`・`TeamOrbit.tsx`・`RotationLineup.tsx`・`ui/Session.tsx`（215 行目の 1 行だけ） → `styles/notify-hint.css`・`styles/tabs.css`・`styles/circular-progress.css`・`styles/team-orbit.css`・`styles/rotation-lineup.css`・`styles/session.css`（パスは `apps/timer-web/src/` から）、`packages/ui/src/tokens/shape.css`・`packages/ui/README.md`・`e2e/parity/approved.ts`

ファイルごとの注意（移植の手順 M1〜M9 に従う。`@import` は `index.css` の `app.css` の前に、部品 → `session.css` の順で足す）:
- **`Session.tsx:215`**: `<div className="space-y-6">` を `className="session-panel"` にし、`session.css` に `:where(.session-panel > :not(:last-child)) { margin-block-end: 1.5rem; }` を書く（Q1）。`session.css` は Task 6 で育てる。`Session.tsx` は `UNMIGRATED` に残したまま（ほかの行は Task 6）
- **`NotifyHint.tsx`**: 根の `mb-3` は alive。`.notify-hint` の margin は `.session-panel` の `:where()`（詳細度 0）に詳細度で勝つ。`session-driver` で余白が変わらないことを比較で見る
- **`Tabs.tsx`**: テンプレートの `className` 1 か所・レスポンシブは `sm:min-h-0` の 1 か所（タブは全幅で見えている）。`hover:`・`focus-visible:` がある
- **`CircularProgress.tsx`**: `-rotate-90` は個別の `rotate`、`transition-all duration-1000 ease-linear` は動きの比較が見る。**`chrono-hand` は残す**
- **`TeamOrbit.tsx`**: `animate-pop-in` は `base.css` のクラスのまま。テンプレートの `className` 1 か所は字面の分岐にする。`scale-125` と `shadow-[…]` と `transition-all duration-700` の組（M3 の 3）。**王冠（81 行目）の `drop-shadow`** は Q6 のとおり:
  - `shape.css` の `--shadow-dialog` の後ろに `--shadow-crown: drop-shadow(0 1px 2px #0000001a) drop-shadow(0 1px 1px #0000000f); /* 王冠の落ち影（timer・filter の値。Tailwind の drop-shadow の写し） */` を足す（値は基準の dist の字面のまま）
  - `team-orbit.css` で `filter: var(--shadow-crown);`。同じ要素の `rotate-12` は個別の `rotate: 12deg`
  - `packages/ui/README.md` の影の行（`--shadow-card` / … / `--shadow-dialog`）に `--shadow-crown` を足す
  - `e2e/parity/approved.ts` の `prop: /^--shadow-(panel|dialog)$/` を `/^--shadow-(panel|dialog|crown)$/` にし、`reason` に「`--shadow-crown`（王冠の落ち影）は利用者が 2026-10-05 に承認した」を足す
- **`RotationLineup.tsx`**: テンプレートの `className` 1 か所は字面の分岐か `data-*` にする。`isPaused`・`skipReason` の分岐は `session-paused`・`session-guest-skipping` で描かれる
- 比較に描かれない要素（Q5）: `NotifyHint` は `session-driver` で描かれる（初回ヒント）。描かれない分岐があれば `pr3-unseen.tsv` に足す
- 比べる状態: `-g 'session-driver|session-navigator|session-paused|session-guest-skipping'`。**見積もり 1 回約 5 分**

コミット: `refactor: セッションの小さな表示部品を素の CSS へ移す（#321 PR 3）`

---

### Task 2: 交代の知らせと自分の交代

**実装役: Sonnet**

**Files:** `ui/components/SwitchAlert.tsx`・`SelfDriverToggle.tsx` → `styles/switch-alert.css`・`styles/self-driver-toggle.css`

ファイルごとの注意:
- `SwitchAlert.tsx`: レスポンシブ 3 か所・テンプレート 2 か所・`animate-fade-up`・`animate-pop-in`（`base.css` のクラスのまま）・`backdrop-blur-sm`（`backdrop-filter: blur(8px)`。`--blur-sm` を参照しない）
- `SelfDriverToggle.tsx`: PR 2 で `px-*`・`py-*` を消した行が 5 行ある（差し替え 1）。**輪の外の人に出す加入の盤（62〜71 行目）は比較に描かれない**（Q5・`pr3-unseen.tsv`）
- 比べる状態: `-g 'session-switched|session-guest-skipping|session-driver|session-navigator'`。**見積もり 1 回約 5 分**

コミット: `refactor: 交代の知らせと自分の交代の操作を素の CSS へ移す（#321 PR 3）`

---

### Task 3: 共有メモ

**実装役: Sonnet**

**Files:** `ui/components/SharedMemo.tsx` → `styles/shared-memo.css`

ファイルごとの注意:
- **`<Card className={highlightClass}>`（85 行目）と `className={segClass(false)}`（98・106 行目）は検査が落とす形**（差し替え 4）。`highlightClass` は `<Card className={updated ? "meter-panel-highlight" : ""}>` の字面の条件式にする（`.meter-panel-highlight` の CSS は `primitives.css` のまま触らない）。`segClass` は関数をやめ、字面のクラス名にする。`segClass` の active の枝は呼び出しが無く描かれないので、写さずに関数ごと消し、`pr3-dead.tsv` に「呼び出しの無い枝」として書く
- メモの本文は PR 2 で移した `Markdown`（`markdown.css`）が描く。`SharedMemo` の外枠だけを移す
- **編集中のテキストエリア（122 行目）は比較に描かれない**（Q5）。`ring`・`focus` は合成した `box-shadow` で写す
- 比べる状態: `-g 'session-memo|session-driver'`。**見積もり 1 回約 4.5 分**

コミット: `refactor: 共有メモを素の CSS へ移す（#321 PR 3）`

---

### Task 4: 終了の操作

**実装役: Sonnet**

**Files:** `ui/components/EndSessionZone.tsx` → `styles/end-session-zone.css`

ファイルごとの注意:
- 確認ダイアログは PR 2 で移した `ConfirmDialog`（`confirm-dialog.css`）。`EndSessionZone` の中のボタンと枠だけを移す。**`useFocusTrap` の振る舞いに触れない**（#336）
- `hover:` 2・`focus-visible:` 10。完成ボタンの `shadow-[…]` と focus の ring は 1 つの `box-shadow` に合成する
- 比べる状態: `-g 'session-end-confirm|session-driver'`。**見積もり 1 回約 3.5 分**

コミット: `refactor: セッションの終了の操作を素の CSS へ移す（#321 PR 3）`

---

### Task 5: 名簿

**実装役: Sonnet**

**Files:** `ui/components/RosterPanel.tsx` → `styles/roster-panel.css`、`test/ui/RosterPanel.test.tsx`（パスは `apps/timer-web/` から）

ファイルごとの注意:
- 638 行・`className` 28 か所。`listClass`（342 行目）と、それを使う 621・631 行目は、`className="roster-panel-list"` と `data-scrollable={scrollable ? "" : undefined}` の形にする（Q3）。CSS は `.roster-panel-list[data-scrollable] { max-height: 20rem; overflow-y: auto; padding-inline-end: 0.25rem; }`（値は比較で確かめる）
- `animate-pop-in` は `base.css` のクラスのまま。レスポンシブ 1 か所・`disabled:` 2・`focus-visible:` 13
- **`chip`（437〜449 行目）は CSS に定義の無い目印のクラス**で、移すと検査が落とす。`roster-panel-chip` に改名し、`[&>span.chip]:`（419 行目）は `.roster-panel-… > span.roster-panel-chip` の子セレクタで書く
- PR 2 で `PrimaryButton` への `px-4 py-2` を消した行がある（差し替え 1）
- **比較に描かれない要素**（Q5）: 改名の入力欄と理由の行（377・378・392・404 行目）・「代理」のチップ（437 行目）・代理追加の誤りの行（609 行目）・「見学」の見出しと一覧（631 行目）・送信中の `disabled` の見た目。「ルーム」タブの 2 つ目の `RosterPanel` も描かれない
- 変異 m55〜m59 がこのファイルを文脈に持つ。M6 の後に `bash -c 'for p in scripts/mutations/m5[5-9]-*.patch; do git apply --check "$p" || echo "NG $p"; done'` を当てる。当たらないものは統括に報告する（Task 8 で作り直す）

- [ ] **Step 1: テストを先に書き直す（Q3）**

`RosterPanel.test.tsx` の 390〜393 行目（`// Then` から `max-h-[20rem]` のアサーションまで）を次に置き換える:

```tsx
      // Then
      expect(screen.getByRole("list")).toHaveAttribute("data-scrollable");
```

409 行目を次に置き換える:

```tsx
      expect(screen.getByRole("list")).not.toHaveAttribute("data-scrollable");
```

Run: `cd /workspaces/claym/local/Tasuki && pnpm --filter @tasuki/timer-web exec vitest run test/ui/RosterPanel.test.tsx`
Expected: 1 本目（`scrollable` のとき）が FAIL（まだ属性を付けていない）。2 本目は PASS（属性が無いので）

- [ ] **Step 2: M1〜M9 で移してコミットする**

M8 で Step 1 の 2 本が PASS になることを見る。

- [ ] **Step 3: 書き直したテストの破壊検証（コミットしない）**

`git status --porcelain` が空であることを見てから:
1. `data-scrollable` を常に `""` にする → 2 本目が赤 → Edit で戻す
2. `data-scrollable` を常に `undefined` にする → 1 本目が赤 → Edit で戻す

最後に `git status --porcelain` が空に戻ったことを見る。

- 比べる状態: `-g 'session-remove-confirm|session-proxy-form|session-guest-skipping|session-driver'`。**見積もり 1 回約 5.5 分**

コミット: `refactor: 名簿を素の CSS へ移す（#321 PR 3）`

---

### Task 6: Session 本体

**実装役: Sonnet**

**Files:** `ui/Session.tsx` → `styles/session.css`（Task 1 で作った）、`styles/loading.css`（注釈だけ）、`scripts/audit-timer-classes.mjs`（`UNMIGRATED` を空の配列にし、注釈を直す。一覧ごと消すのは PR 4）

ファイルごとの注意:
- 残る `space-y-6` 4 か所（223・225・338・407 行目）は `:where(.x > :not(:last-child)) { margin-block-end: 1.5rem; }` の形。223 行目の `lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:items-start space-y-6 lg:space-y-0` は、`space-y-6` を `@media (width < 64rem)` に、grid を `@media (width >= 64rem)` に分ける（`lg:space-y-0` と同値であることを除去検査で確かめた: `space-y-6` は 360・640・768 だけで alive、`lg:*` は 1024・1280 だけで alive）。222 行目の注釈の「（space-y-6）」も書き直す
- 254〜256 行目には条件式が 2 つある（`isUrgent ? "text-[var(--urgent)] animate-pulse" : "text-[var(--bone)]"` と `isPaused ? "opacity-50" : ""`）。字面の条件式（入れ子でもよい）か `data-*` にする。`animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;` を写し、**`@keyframes pulse { 50% { opacity: 0.5; } }` を `session.css` に 1 つだけ置く**（Q2）。`loading.css` の冒頭の注釈「`@keyframes pulse` は Tailwind から借りて」を「`session.css` が定義する」に書き換える
- 234 行目の `drop-shadow-[0_0_8px_var(--signal-edge)]` は `filter: drop-shadow(0 0 8px var(--signal-edge));`（トークン参照なので足さない）
- `animate-fade-up` は `base.css` のクラスのまま。PR 2 で `px-3 py-1.5` を消した行（427 行目）がある
- **比較に描かれない要素**（Q5）: 「ナビ:」の表示（274 行目）・「ルーム」タブの中身すべて（403〜460 行目付近。タブを押す状態が目録に無い）
- `UNMIGRATED` を `[]` にし、`audit-timer-classes.mjs` の 38 行目「PR 4 で一覧は空になる」と 66 行目「PR 2・3 で移したら消す。PR 4 で空にして、この一覧ごと消す」を「PR 3 で空になった。PR 4 で一覧ごと消す」の趣旨に直す（完了形の記録は「いつ空になったか」だけを書く）。`bash -c 'node --test scripts/audit-timer-classes.test.mjs'` と `node scripts/audit-timer-classes.mjs` を回す
- 比べる状態（2 段で流す・Review Focus 4）:
  - (a) `-g 'session-(driver|navigator|paused|switched|remove|proxy|memo|end|guest)|loading-unreachable'`（**約 11 分**）。赤なら直して (a) を流し直す（最大 3 回）
  - (b) (a) が緑になってから `-g 'session-urgent'`（**約 8 分**。実時間を待つ状態で短くできない。`isUrgent` の分岐と pulse はここでしか見えない）

コミット: `refactor: セッションの画面を素の CSS へ移す（#321 PR 3）`

---

### Task 7: 溜めた Minor をまとめて直す

**実装役: 統括（Opus）**

- [ ] **Step 1: Task 1〜6 のレビューで溜めた Minor を直す**

直したら、触った部品が描かれる状態だけを M7 で比べ直し、M8 を回す。Minor が無ければ飛ばす。

コミット: `refactor: PR 3 のレビューの Minor をまとめて直す（#321）`

---

### Task 8: 通しで確かめる

**実装役: 統括（Opus）**（合わせて約 1.5 時間。`run_in_background` で 1 本ずつ起動し、完了の通知を待つ）

- [ ] **Step 1: CI と同じ検査を手元で回す（約 6〜10 分）**

`.github/workflows/ci.yml` の `run:` から導いた一式（2026-10-05）:

```bash
cd /workspaces/claym/local/Tasuki
git status --porcelain
pnpm typecheck && pnpm lint && pnpm test && pnpm build
bash -c 'node --test $(node scripts/list-scan-targets.mjs script-tests)'
node scripts/check-links.mjs && node scripts/audit-plan-gate.mjs
bash -c 'for s in structure log-hygiene assembly-wiring domain-error-shape domain-side-effects dependency-direction web-sync-boundary ui-components timer-classes public-surface supply-chain-config; do node scripts/audit-$s.mjs || echo "NG $s"; done'
pnpm --filter @tasuki/e2e exec vitest run
pnpm e2e
pnpm audit
```

Expected: すべて成功（`NG` の行が出ない）。`ss -tlnp | grep -E ':(8787|18080)\b'` が空。`ci.yml` に足された検査があれば、ここに足して回す

- [ ] **Step 2: 対照実行の全件（約 28 分・`approved.ts` を変えたので）**

README の「対照実行」を全件、`~/.cache/tasuki-parity/pr3-t8-control.log` へ。Expected: 全テスト緑

- [ ] **Step 3: 通常の比較の全件（約 28 分）**

README の「流す」を全件、`~/.cache/tasuki-parity/pr3-t8-normal.log` へ。Expected: 全テスト緑（差 0・画素一致・期待値と一致）。期待値の JSON は変えない。赤なら、直したあとは直した部品が描かれる状態だけを流し直し、全件はやり直さない

- [ ] **Step 4: 検査の破壊検証（コミットしない・数秒ずつ）**

`git status --porcelain` が空であることを見てから、1 つずつ壊して赤を見て、Edit で戻す:
1. `session.css` の色の 1 か所を `#ff0000` にする → `node scripts/audit-ui-components.mjs` が赤（E5）
2. `Session.tsx` の 1 か所の `className` を `flex` にする → `node scripts/audit-timer-classes.mjs` が赤（E6）
3. `session.css` の `@keyframes pulse` を消す → `node scripts/audit-timer-classes.mjs` が赤（Q2・`loading.css` の借り物の出どころが無い）

最後に `git status --porcelain` が空であることを見る。

- [ ] **Step 5: 変異パッチ（機械約 10〜15 分・作り直しは作業 30〜60 分）**

```bash
cd /workspaces/claym/local/Tasuki
bash -c 'for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NG $p"; done'
```

当たらないものがあれば、1 本ずつ次の手順で作り直す（ID は変えない）:
1. `git status --porcelain` が空であることを見る
2. 元のパッチを読み、**同じ壊し方**を今の行へ Edit で当てる
3. `git diff -- <対象のファイル> > /tmp/claude-1000/<作業用>/mNN.patch`（追跡下のパッチへ直接リダイレクトしない）。先頭の注釈（`# 変異 NN: …`）は元のパッチから写す
4. Edit で戻し、`git status --porcelain` が空に戻ったことを見てから、`cp` で `scripts/mutations/` のパッチへ写す
5. `git apply --check` が通ることを見る

作り直したパッチは、元のパッチと並べた差分をレビュー役（Opus）に渡し、壊し方が弱まっていないかを見てもらう。

`git status --porcelain` が空（作り直したパッチはコミット済み）であることを見てから、`node scripts/mutation-check.mjs > ~/.cache/tasuki-parity/pr3-t8-mutation.log 2>&1` を全件（`--help` を付けない）。Expected: すべての変異が殺される。終わったら `git status --porcelain` が空であることを見る（復元の失敗が製品コードに残らないこと）。

作り直したらコミットする:

```bash
git add scripts/mutations/<作り直したパッチを名指し>
git commit -m "test: PR 3 で当たらなくなった変異パッチを作り直す（#321）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 台帳・進み具合・PR・レビュー

**実装役: 統括（Opus）**

- [ ] **Step 1: 台帳の「PR 3」の節を埋める**

PR 2 の節と同じ項目のうち、PR 3 で流したものだけを書く:
- ブランチの SHA と作業ツリーが clean だったか・比較の仕組みの SHA（`git log -1 --format=%H -- e2e/parity`）
- 対照実行と通常の比較の結果（緑の件数と所要時間。状態ごとの数は写さず期待値の JSON を指す）
- 破壊検証（Task 5・8）
- **承認した差**: `--shadow-crown`（利用者が 2026-10-05 に承認）
- **消した dead の組**（`~/.cache/tasuki-parity/pr3-dead.tsv` を表にする）
- **PR 3 で比較に掛からない要素**（`~/.cache/tasuki-parity/pr3-unseen.tsv` を表にする。Q5・PR 4 の前の決め直しの材料）
- **流さなかったもの**（囲いを外した一時ビルド・E8）と根拠の正本 §7.1
- **PR 4 の前へ送ったもの**: E8 の道具の Minor 3 件（Q4）と、計画の検証で分かったこと（`startsNestedDeclarations` のテストは規則の中に本体の無い at-rule を置かないと赤にならない・Chromium の挙動は実測していない・`finally` の `detach` が元の例外を隠しうる・`writeUsage` を `throw` にすると `Expected/Received` の行が消える）
- `mutation-check` の所要時間・**計画の見積もりと実際の待ち時間・実時間の比較**（`pr3-*.log` と `pr3-start.txt` から）

- [ ] **Step 2: #321 の本文の「進み具合」を更新する**

PR 3 の行を `[x]` にして PR 番号を書く（PR を作った後）。本文の他の節は書き換えない。**書き込みの前に文案を利用者に見せる。**

- [ ] **Step 3: push して PR を作る**

```bash
cd /workspaces/claym/local/Tasuki
git push -u origin feature/issue-321-pr3-session
gh pr create --title "refactor: timer の Session と子の部品から Tailwind を外す（#321 PR 3）" --body-file <scratchpad の本文>
```

本文は git-workflow の型（概要・変更内容・テスト方法）で、数は書かず台帳へのリンクだけを置く。末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。**閉鎖キーワードを書かない**（#321 は PR 4 で閉じる）。

- [ ] **Step 4: レビュー**

文脈を共有しない `/code-review` を **PR 番号を明示して**通す。指摘は採点が出てから直す。直したら、次を回し直す: M8・全変異パッチの `git apply --check`・触った部品が描かれる状態の比較（M7）。製品コードを変えたら `mutation-check` も全件。

- [ ] **Step 5: マージの前に利用者に確かめる**

CI の結果・台帳・レビューの結果を並べて報告し、マージの判断を仰ぐ。**配布はしない。**
