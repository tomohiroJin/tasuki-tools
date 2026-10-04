# timer から Tailwind を外す — PR 3: Session と子の部品（#321）実装計画

> **作業者へ:** 必須サブスキル `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: timer の見た目を 1 つも変えずに、`Session.tsx` と、その子の部品 10 本を、Tailwind のユーティリティから `@layer timer` に入れた素の CSS へ移す。終わると `scripts/audit-timer-classes.mjs` の `UNMIGRATED` が空になる。

**方式**: 子の部品（葉）を先に移し（Task 2〜6）、最後に親の `Session.tsx` を移す（Task 7）。各タスクは PR 2 の計画の「移植の手順」（M1〜M9）に従い、**対象の状態だけ**を基準と並べて差 0 を確かめる。最後に通常の比較を全件 1 本だけ流す（Task 8）。比較の仕組みは直さない（Task 1 の 3 件は E8 の道具と到達しないコードの片付けで、通常の比較の判定を変えない）。

**技術**: Playwright（`e2e/parity/`）・vitest（`apps/timer-web/test`・`e2e/tests`）・`node --test`（`scripts/`）

**正本**: `docs/superpowers/specs/2026-09-29-timer-without-tailwind-design.md`。**計画は正本に従属する。両方を読むこと。** この計画は正本の §4 **PR 3** を実装し、**§7.1（PR 3・4 の検証を軽くする）に従う**。関係する節: D1・D2・D3・D10・§5（§5.5 の E8 は §7.1 により流さない）・§6（E1・E5・E6）。台帳: `docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`。比較の流し方の正本: `e2e/parity/README.md`。
**移植の手順（M1〜M9）と Tailwind の値の早見表は、PR 2 の計画 `docs/superpowers/plans/2026-10-03-timer-without-tailwind-pr2-primitives-and-screens.md` の「移植の手順」節をそのまま使う。** ただし、下の「PR 2 の計画から差し替える 3 点」を優先する。

## 検証の時間の見積もり（2026-10-05・PR 2 の通常の比較の状態ごとの実測から）

比較は 1 本ずつしか流せない（ポートが固定）。1 回の起動に、ビルドとハーネスで約 1 分の上乗せがある。

| タスク | 比べる状態（下限。M7 で足してよい） | 1 回 | 想定の回数 | 小計 |
|---|---|---|---|---|
| 2 小さな表示部品 | `session-driver`・`session-navigator`・`session-driver（タッチ・360px）` | 約 3.5 分 | 2 | 約 7 分 |
| 3 交代の知らせと自分の交代 | `session-switched`・`session-guest-skipping`・`session-driver`・`session-navigator` | 約 4.5 分 | 2 | 約 9 分 |
| 4 共有メモ | `session-memo`・`session-memo-markdown`・`session-driver` | 約 4 分 | 2 | 約 8 分 |
| 5 終了の操作 | `session-end-confirm`・`session-driver` | 約 3 分 | 2 | 約 6 分 |
| 6 名簿 | `session-remove-confirm`・`session-proxy-form`・`session-guest-skipping`・`session-driver` | 約 5.5 分 | 2 | 約 11 分 |
| 7 Session 本体 | `session-*` の全部（タッチを含む 12）・`banner-warn-reconnecting` | 約 21 分（`session-urgent` だけで 7 分） | 1＋赤の状態だけ流し直し | 約 30 分 |
| 8 通し | 通常の比較の全件 1 本 | 約 28 分 | 1 | 約 28 分 |
| 8 通し | 手元の検査（`pnpm test` 約 1 分・scripts の自己テスト約 2.5 分・型・lint・e2e の vitest・`pnpm e2e`） | 約 10 分 | 1 | 約 10 分 |
| 8 通し | `node scripts/mutation-check.mjs` の全件 | **未実測**（推定 20〜40 分。初回に計って台帳へ書く） | 1 | 20〜40 分 |

**機械の待ち時間の合計: 約 2〜2.5 時間。** これに実装役（Sonnet）の作業とレビューが乗る。
**止まる条件**: あるタスクで比較を 3 回流しても差が残るとき、または計画全体の待ち時間が 5 時間（見積もりの 2 倍）を超えそうなときは、続ける前に利用者に報告する（`estimate-verification-time-in-plans`）。

流さないもの（正本 §7.1）: 対照実行（比較の仕組みを変えないので）・囲いを外した一時ビルド（PR 4 の通しが担う）・E8（PR 4 の前に決め直す）・タスクごとの全件の比較。

## この計画で決めたこと（正本に無い細部）

| # | 決めたこと | 理由 |
|---|---|---|
| Q1 | **子の部品を先に、`Session.tsx` を最後に移す。** 子の根に main で勝っている `margin-block` があるときだけ、`Session.tsx` の親の `space-y-*` をそのタスクで `:where(.x > :not(:last-child))` の形へ先に移す | 親の Tailwind の `space-*`（utilities 層）は、`@layer timer` へ移した子の margin に勝つ（PR 2 の実測）。子の根の多くは PR 2 で移した `Card` で margin を持たないので、親を最後に回せばほとんどのタスクで当たらない |
| Q2 | **`Session.tsx` を移すタスクで `@keyframes pulse { 50% { opacity: 0.5; } }` を `styles/session.css` に 1 つだけ置き、`loading.css` の注釈を書き換える** | `loading.css` の `animation: pulse` は、Session.tsx の `animate-pulse` を見て Tailwind が出しているキーフレームを借りている。Session.tsx から `animate-pulse` が消えると Tailwind は出さなくなる。検査（`audit-timer-classes` の 31 行目の条件）が強制する。2 つ置くと比較のキーフレームで差が出る |
| Q3 | **`RosterPanel.test.tsx` のクラス名のアサーション（`overflow-y-auto`・`max-h-[20rem]`）は、意味のクラス名（`roster-list-scrollable`）を見る形に書き直す** | PR 2 の P6 で送ったもの。jsdom は CSS を当てないので、テストが見られるのは「スクロールの形を選んだか」まで。見た目は比較が見る |
| Q4 | **Task 1 の 3 件は通常の比較の判定を変えないので、対照実行を流さない** | `usage.ts` と `usage-summary.ts` は E8 の道具で、PR 3 では流さない。`timer.parity.ts` の変更は到達しない `return` を消すだけ。Task 8 の通常の比較が、壊していないことを確かめる |
| Q5 | **レビューの Minor はタスクごとに直さず、Task 9 でまとめて直す**。Critical と Important はそのタスクで直す | 正本 §7.1 |
| Q6 | **実装役のモデル**: Task 2〜7 は Sonnet（`claude-sonnet-5-5`）。Task 1・8・9 は統括（Opus）。レビュー役は Opus | 利用者の方針（2026-10-03）。Task 1 は物差しのコードに触れる |

## PR 2 の計画から差し替える 3 点

1. **除去検査を取り直さない。** 基準は `ba9249d` に固定で、PR 3 のファイルの DOM は基準のまま。読むのは `bash ~/.cache/tasuki-parity/probe-grep.sh '<根の語>'`（列は `dead/alive/undecided` の TSV）。PR 2 の計画の `node --experimental-strip-types -e` は拡張子の無い import で動かないので使わない
   - **className の列は基準の className。** PR 2 で `px-3 py-1.5`・`px-4 py-2` を消した行（`Session.tsx` 1・`RosterPanel.tsx` 2・`SelfDriverToggle.tsx` 4）と、`SharedMemo.tsx` の `highlightClass`（`meter-panel-highlight` に変えた）は、いまの className と一致しない。`git diff ba9249d HEAD -- <ファイル>` で元の className を引いてから探す
   - **`w-full` のような短い語は別の要素の行にも当たる。** className の列全体で同じ要素かを見る（PR 2 の Task 12 で 1 度読み違えた）
2. **`text-*` の行の高さで割り切れない比率は `var(--timer-never-defined, calc(1 / 0.75))` の形で書く**（直書きの `calc()` は最小化で 5 桁に畳まれ、16px が 15.984px になる）。`--timer-never-defined` を宣言すると検査が落とす。注釈の正本は `apps/timer-web/src/styles/status-strip.css` の冒頭
3. **M7 の比較で `parity/out/` を丸ごと消さない。** 消すのは選んだ状態のディレクトリだけ（`rm -rf parity/out/<状態>`）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 見た目の移植は、緑の特性テスト（基準と並べる比較）の下で行う Refactor の段（正本 §8）。`RosterPanel.test.tsx` は書き直したあと、スクロールの形を消す壊し方で赤を見る（Task 6） |
| II. 技術選定は ADR を通す | 通過 | 新しい依存は足さない。決定は ADR 0023 の範囲内 |
| III. 揮発インメモリと単純運用 | 通過 | 同期サーバーに触れない。配布しない |
| IV. 境界の型安全 | 該当なし | wire と境界の型に触れない |
| V. 実画面検証 | 通過 | タスクごとに対象の状態を、最後に全件を、基準と並べて比べる（正本 §7.1 の範囲） |
| VI. 依存は内向き | 通過 | `e2e/parity/` の変更は E8 の道具の片付けだけ |
| VII. 検査は壊して確かめる | 通過 | `RosterPanel.test.tsx` の書き直し（Task 6）、生の色とクラス名の検査（Task 8）、変異パッチの当て直し（Task 0・Task 8） |
| VIII. 記録が正本 | 通過 | 台帳の PR 3 の節（Task 9）。#321 の本文の「進み具合」を更新する |
| IX. 小さく回す | 通過 | 正本 §4 の PR 3。部品のまとまりごとにタスクとコミットを分ける |
| X. 抽象は実需で | 通過 | 新しい共有の部品を作らない。CSS は部品と画面の単位 |
| XI. 秘密と個人情報 | 該当なし | 秘密・個人情報に触れない |

**逸脱なし**（検証の範囲は正本 §7.1 のとおり）。

## 全体の制約

- ブランチは `feature/issue-321-pr3-session`（main `d80c0f9` から切った。最初のコミットは正本 §7.1 の追記 `fcca762`）。**main へ直接コミットしない。** push はコミットのたびに統括が行う。**実装役のサブエージェントには push もマージもさせない**（dispatch の本文に書く。作業の後に `git log origin/feature/issue-321-pr3-session` を見る）
- **見た目を 1 つも変えない。** 移したあとの比較の差は 0 件でなければならない。出た差は、雑音として名指しせず、まず写し方の誤りを疑う。どうしても残る差は台帳に書き、利用者の個別の承認を得る
- 基準は `ba9249d` に固定する。基準の dist は `~/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist`（消さない）。作業ツリーで `git checkout main -- …` をしない
- **#321 が終わるまで、timer に触れる他の Issue を main へマージしない**
- 写すのは main で勝っている宣言だけ（正本 D2）。dead は写さず、`~/.cache/tasuki-parity/pr3-dead.tsv`（1 行 1 組・タブ区切り: ファイル・className・token）に足していく
- `@layer timer` の中で `!important` を使わない。新しい CSS は `--tw-*` と Tailwind の theme 層の変数を `var()` で参照しない。生の色を書かない。`src/styles/` に相対 `url()` を書かない
- クラス名は意味で付け、部品の根の名前を語頭に置く（`.roster-panel`・`.roster-panel-row`）。D1 の衝突させない名前（`.ui-`・`.instrument-*`・`.chrono-*`・`.animate-*`・要素層のクラス・Tailwind のユーティリティ名）と重ねない。`scripts/audit-timer-classes.mjs` が落とす
- **既存の `.animate-fade-up`・`.animate-pop-in`（`base.css`）はクラスのまま使ってよい**（timer が定義するクラスで、Tailwind のものではない）
- 破壊検証の前に `git status --porcelain` が空であることを確かめる。破壊はコミットしない
- 長い実行（比較・`mutation-check`）は `run_in_background` で**実行そのもの**を起動し、完了の通知を待つ。`pgrep -f` で見張らない
- 自己テストは bash で回す（zsh は未クォートの glob で偽の赤を出す）。出力を `| head` / `| tail` で切って数えない（数えるときは `grep -c` / `wc -l`）
- E2E と比較は 8787 と 18080 を使う。利用者の `pnpm run dev` が掴んでいたら止めずに聞く。終わったら `ss -tlnp | grep -E ':(8787|18080)\b'` が空であることを見る
- `pnpm exec` が `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` で止まったら依存が古い: `pnpm install --frozen-lockfile --virtual-store-dir=.pnpm-virtual`
- turbo がキャッシュから dist を戻すとき古い CSS を消さない。ビルドの CSS を読むときは `dist/index.html` が参照する 1 本を読む
- 新しい E2E のタグを足さない。台帳と ADR に数を写さない
- コミットメッセージは日本語の Conventional Commits。末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **子を `@layer timer` へ移すと、親 `Session.tsx` の Tailwind（`space-y-6`・`lg:space-y-0`・`lg:grid` の `gap`）が子の根の margin に勝つ** → 各タスクの M3 の 2 で、子の根に alive の `margin-*` があるかを除去検査で見る。あれば Q1 のとおり親の該当の `space-y-*` を同じタスクで移す。比較は 5 幅すべて（`lg:` が効くのは 1024・1280）
2. **`Session.tsx` から `animate-pulse` が消え、Tailwind が `@keyframes pulse` を出さなくなり、読み込み画面の点滅が止まる** → Task 7 で Q2 のとおり置く。Task 7 の比較に `loading-unreachable`・`loading-timed-out` を足し、キーフレームの比較で差 0 を見る
3. **`lg:` / `md:` の範囲の変種を、上端の無い `@media` で写して別の幅にも効かせる**（`Session.tsx` のレスポンシブ 10 か所・`SwitchAlert.tsx` 3 か所） → 除去検査の alive の `widths` が 5 幅の一部だけなら上端つきの範囲にする。比較は 5 幅すべて
4. **`RosterPanel.test.tsx` を書き直したアサーションが恒真になる**（クラス名を両方の分岐で付けてしまう、など） → Task 6 で、`scrollable` を無視する壊し方（`listClass` を常に片方にする）で赤を見る。変異 m55〜m59 が当たり続けるかを `git apply --check` で見る
5. **Session の状態だけ比べて、Session 以外の画面に出る部品の写し忘れを見落とす** → 移す 11 本の部品は Session からしか使われない（2026-10-05 に `grep` で確かめた）。Task 8 の全件の比較が最後に見る

---

### Task 0: 着手前の確認

**実装役: 統括**

**Files:** なし

- [ ] **Step 1: 作業ツリーと基準の dist を確かめる**

```bash
cd /workspaces/claym/local/Tasuki
git status --porcelain
git rev-parse --abbrev-ref HEAD
git -C ~/.cache/tasuki-parity/base-ba9249d rev-parse HEAD
ls ~/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist/index.html
```

Expected: 1 行目は出力なし。ブランチは `feature/issue-321-pr3-session`。基準の HEAD は `ba9249d` で始まる。`index.html` がある

- [ ] **Step 2: 全変異パッチに `git apply --check` を当て、PR 3 のファイルを文脈に持つものを控える**

```bash
cd /workspaces/claym/local/Tasuki
bash -c 'for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NG $p"; done'
bash -c 'grep -l -E "Session.tsx|CircularProgress|EndSessionZone|NotifyHint|RosterPanel|RotationLineup|SelfDriverToggle|SharedMemo|SwitchAlert|Tabs.tsx|TeamOrbit|loading.css" scripts/mutations/*.patch' > ~/.cache/tasuki-parity/pr3-mutations-at-risk.txt
wc -l ~/.cache/tasuki-parity/pr3-mutations-at-risk.txt
```

Expected: 1 本目は出力なし（2026-10-05 に全部当たることを確かめた）。控えは 5 本（m55〜m59。2026-10-05 の時点）

コミットはしない。

---

### Task 1: PR 2 で残した Minor 3 件（E8 の道具と到達しないコード）

**実装役: 統括（Opus）**

**Files:**
- Modify: `e2e/parity/usage.ts`（78 行目の `await cdp.detach();`）
- Modify: `e2e/parity/timer.parity.ts`（140 行目付近の usage の到達しない `return`）
- Modify: `e2e/parity/usage-summary.ts`（187 行目の `startsNestedDeclarations`）
- Test: `e2e/tests/usage-summary.test.ts`

- [ ] **Step 1: `startsNestedDeclarations` の誤りを赤で示すテストを足す**

`usage-summary.test.ts` に、本体の無い at-rule（`@import "x.css";` や `@charset`）の直後の宣言を、塊の先頭とみなさないことを断定するテストを足す。直前の兄弟が本体の無い at-rule のとき（`prev.type === 'atrule' && prev.nodes === undefined`）は、規則の中の宣言の続きとして扱うのが正しい。テストは既存の `describe` の書き方（Given / When / Then の注釈）に合わせる。

Run: `cd /workspaces/claym/local/Tasuki && pnpm --filter @tasuki/e2e exec vitest run tests/usage-summary.test.ts`
Expected: 足したテストだけ FAIL

- [ ] **Step 2: 直す**

`startsNestedDeclarations` の `prev.type === 'atrule'` を `(prev.type === 'atrule' && prev.nodes !== undefined)` にする（本体のある at-rule の後ろだけを塊の先頭とみなす）。

Run: 同上。Expected: PASS

- [ ] **Step 3: `cdp.detach()` を `finally` へ、到達しない `return` を消す**

- `usage.ts` の `stopRuleUsage`: `CSS.stopRuleUsageTracking` の送信から `resolveUsedKeys` までを `try { … } finally { await cdp.detach(); }` で包む（いまは途中で投げると `detach` されない）。`unmatched` の `throw` は `finally` の外のままでよい
- `timer.parity.ts` の `writeUsage`: `expect(used?.length ?? 0, …).toBeGreaterThan(0);` の後ろの `if (used === undefined) return;` は、`expect` が先に投げるので到達しない（型を狭めるためだけにある）。2 行を次の 1 行にまとめ、文言は今のものを使う:

```ts
  if (used === undefined || used.length === 0) throw new Error(`規則の使用状況の当たりが取れていない（${path.join(dir, USAGE_FILE)} を書けない）`);
```

どちらも振る舞いを変えない。

Run:
```bash
cd /workspaces/claym/local/Tasuki
pnpm --filter @tasuki/e2e exec vitest run
pnpm --filter @tasuki/e2e typecheck
```
Expected: すべて成功

- [ ] **Step 4: コミット**

```bash
git add e2e/parity/usage.ts e2e/parity/timer.parity.ts e2e/parity/usage-summary.ts e2e/tests/usage-summary.test.ts
git commit -m "fix: E8 の道具の Minor 3 件を片付ける（#321 PR 3）

- 本体の無い at-rule の後ろの宣言を塊の先頭とみなさない
- CDP の detach を finally で必ず行う
- 到達しない return を消す

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 小さな表示部品

**実装役: Sonnet**

**Files:** `ui/components/NotifyHint.tsx`・`Tabs.tsx`・`CircularProgress.tsx`・`TeamOrbit.tsx`・`RotationLineup.tsx` → `styles/notify-hint.css`・`styles/tabs.css`・`styles/circular-progress.css`・`styles/team-orbit.css`・`styles/rotation-lineup.css`（パスは `apps/timer-web/src/` から）

ファイルごとの注意（移植の手順 M1〜M9 に従う。`@import` は `index.css` の `app.css` の前、部品の位置に足す）:
- `Tabs.tsx`: テンプレートの `className` 1 か所・レスポンシブ 1 か所。タブの見えている幅（`lg:` で隠れるか）を除去検査の `widths` で見て、範囲の `@media` にする
- `CircularProgress.tsx`: SVG の要素の `className` は `stroke-*`・`fill-*` を含む。トークンで書く。`transition` は動きの比較が見る
- `TeamOrbit.tsx`: `animate-pop-in` は `base.css` のクラスのまま使う。テンプレートの `className` 1 か所は字面の分岐にする
- `RotationLineup.tsx`: テンプレートの `className` 1 か所は字面の分岐か `data-*` にする
- `NotifyHint.tsx`: どの状態で描かれるかを `grep -n "NotifyHint" apps/timer-web/src/ui/Session.tsx` の条件から読み、目録に描かれる状態が無ければ統括に報告する（状態を足さない・正本 §7.1）
- 比べる状態（下限）: `session-driver`・`session-navigator`・`session-driver（タッチ・360px）`。`-g` は `'session-driver|session-navigator'`（タッチの組も当たる）。**見積もり 1 回約 3.5 分**

コミット: `refactor: セッションの小さな表示部品を素の CSS へ移す（#321 PR 3）`

---

### Task 3: 交代の知らせと自分の交代

**実装役: Sonnet**

**Files:** `ui/components/SwitchAlert.tsx`・`SelfDriverToggle.tsx` → `styles/switch-alert.css`・`styles/self-driver-toggle.css`

ファイルごとの注意:
- `SwitchAlert.tsx`: レスポンシブ 3 か所・テンプレート 2 か所・`animate-fade-up`・`animate-pop-in`（`base.css` のクラスのまま）。表示中の動きは状態に入れたことを断定してから書き出す仕組み（既存）が見る
- `SelfDriverToggle.tsx`: PR 2 で `PrimaryButton`・`GhostButton` への `px-*`・`py-*` を消した行がある（差し替え 1）。除去検査の className は元の形で探す
- 比べる状態（下限）: `session-switched`・`session-guest-skipping`・`session-driver`・`session-navigator`。**見積もり 1 回約 4.5 分**

コミット: `refactor: 交代の知らせと自分の交代の操作を素の CSS へ移す（#321 PR 3）`

---

### Task 4: 共有メモ

**実装役: Sonnet**

**Files:** `ui/components/SharedMemo.tsx` → `styles/shared-memo.css`

ファイルごとの注意:
- 更新の強調は PR 2 で `meter-panel-highlight`（`primitives.css`）にした。触らない
- メモの本文は PR 2 で移した `Markdown`（`markdown.css`）が描く。`SharedMemo` の外枠だけを移す
- 編集とプレビューの切り替えのボタン・テキストエリアの `ring`・`focus` は、合成した `box-shadow` で写す（PR 2 の M4）
- 比べる状態（下限）: `session-memo`・`session-memo-markdown`・`session-driver`。**見積もり 1 回約 4 分**

コミット: `refactor: 共有メモを素の CSS へ移す（#321 PR 3）`

---

### Task 5: 終了の操作

**実装役: Sonnet**

**Files:** `ui/components/EndSessionZone.tsx` → `styles/end-session-zone.css`

ファイルごとの注意:
- 確認ダイアログは PR 2 で移した `ConfirmDialog`（`confirm-dialog.css`）。`EndSessionZone` の中のボタンと枠だけを移す。**`useFocusTrap` の振る舞いに触れない**（#336）
- 比べる状態（下限）: `session-end-confirm`・`session-driver`。**見積もり 1 回約 3 分**

コミット: `refactor: セッションの終了の操作を素の CSS へ移す（#321 PR 3）`

---

### Task 6: 名簿

**実装役: Sonnet**

**Files:** `ui/components/RosterPanel.tsx` → `styles/roster-panel.css`、`test/ui/RosterPanel.test.tsx`（パスは `apps/timer-web/` から）

ファイルごとの注意:
- 638 行・`className` 28 か所。`listClass`（342 行目）は `scrollable` で分かれるテンプレート。`className={scrollable ? "roster-list roster-list-scrollable" : "roster-list"}` の字面の分岐にする
- `animate-pop-in` は `base.css` のクラスのまま。レスポンシブ 1 か所
- PR 2 で `PrimaryButton` への `px-4 py-2` を消した行がある（差し替え 1）
- 変異 m55〜m59 がこのファイルを文脈に持つ。M6 の後に `bash -c 'for p in scripts/mutations/m5[5-9]-*.patch; do git apply --check "$p" || echo "NG $p"; done'` を当てる。当たらないものは統括に報告する（Task 8 で作り直す）

- [ ] **Step 1: テストを先に書き直す（Q3）**

`RosterPanel.test.tsx` の 392〜393 行目と 409 行目を、次の形にする:

```tsx
      // Then
      expect(screen.getByRole("list").classList.contains("roster-list-scrollable")).toBe(true);
```

```tsx
      // Then
      expect(screen.getByRole("list").classList.contains("roster-list-scrollable")).toBe(false);
```

Run: `cd /workspaces/claym/local/Tasuki && pnpm --filter @tasuki/timer-web exec vitest run test/ui/RosterPanel.test.tsx`
Expected: 1 本目が FAIL（まだ `roster-list-scrollable` を付けていない）

- [ ] **Step 2: M1〜M8 で移す**

M8 の後、Step 1 の 2 本が PASS になることを見る。

- [ ] **Step 3: 書き直したテストの破壊検証（コミットしない）**

先に M9 のコミットを済ませ、`git status --porcelain` が空であることを見てから行う。`className` の分岐を常に `"roster-list roster-list-scrollable"` にする → 2 本目が赤 → 常に `"roster-list"` にする → 1 本目が赤 → `git checkout -- apps/timer-web/src/ui/components/RosterPanel.tsx` で戻し、`git status --porcelain` が空に戻ったことを見る

- 比べる状態（下限）: `session-remove-confirm`・`session-proxy-form`・`session-guest-skipping`・`session-driver`。**見積もり 1 回約 5.5 分**

コミット: `refactor: 名簿を素の CSS へ移す（#321 PR 3）`

---

### Task 7: Session 本体

**実装役: Sonnet**

**Files:** `ui/Session.tsx` → `styles/session.css`、`styles/loading.css`（注釈だけ）、`scripts/audit-timer-classes.mjs`（`UNMIGRATED` を空の配列にする。一覧ごと消すのは PR 4）

ファイルごとの注意:
- `space-y-6` 5 か所（215・223・225・338・407 行目付近。222 行目は注釈）は `:where(.x > :not(:last-child)) { margin-block-end: 1.5rem; }` の形。223 行目の `lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:items-start space-y-6 lg:space-y-0` は、`space-y-6` を `@media (width < 64rem)` に、grid を `@media (width >= 64rem)` に分ける（`lg:space-y-0` は margin を消す宣言で、範囲を分ければ書かなくてよい。除去検査で確かめる）
- 255 行目の `isUrgent ? "text-[var(--urgent)] animate-pulse" : "text-[var(--bone)]"` は字面の分岐（`"session-clock session-clock-urgent"` の形）にし、`animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;` を写す。**`@keyframes pulse { 50% { opacity: 0.5; } }` を `session.css` に 1 つだけ置く**（Q2）。`loading.css` の冒頭の注釈「`@keyframes pulse` は Tailwind から借りて」を「`session.css` が定義する」に書き換える
- `animate-fade-up` は `base.css` のクラスのまま
- PR 2 で `px-3 py-1.5` を消した行がある（差し替え 1）
- レスポンシブ 10 か所・テンプレート 2 か所
- `UNMIGRATED` を `[]` にしたら `node scripts/audit-timer-classes.mjs` が通ることを見る。`bash -c 'node --test scripts/audit-timer-classes.test.mjs'` も回す
- 比べる状態（下限）: `session-*` の全部と `banner-warn-reconnecting`・`loading-unreachable`・`loading-timed-out`（Review Focus 2）。`-g 'session-|banner-warn|loading-'`。**見積もり 1 回約 22 分**。赤が出たら、直したあとは赤の状態だけを流し直す

コミット: `refactor: セッションの画面を素の CSS へ移す（#321 PR 3）`

---

### Task 8: 通しで確かめる

**実装役: 統括（Opus）**（合わせて約 1〜1.3 時間。`run_in_background` で 1 本ずつ起動し、完了の通知を待つ）

- [ ] **Step 1: 手元の検査を全部回す（約 10 分）**

```bash
cd /workspaces/claym/local/Tasuki
pnpm test
bash -c 'node --test $(node scripts/list-scan-targets.mjs script-tests)'
node scripts/audit-timer-classes.mjs && node scripts/audit-ui-components.mjs
pnpm typecheck && pnpm lint
pnpm --filter @tasuki/e2e exec vitest run
pnpm e2e
```

Expected: すべて成功。`ss -tlnp | grep -E ':(8787|18080)\b'` が空

- [ ] **Step 2: 通常の比較を全件 1 本（約 28 分）**

README の「流す」を全件。Expected: 全テスト緑（差 0・画素一致・期待値と一致）。期待値の JSON は変えない。赤なら、直したあとは赤の状態だけを流し直し、最後の全件はやり直さない（直した部品が描かれる状態を含めて流す）

- [ ] **Step 3: 生の色とクラス名の検査の破壊検証（コミットしない・数秒）**

`git status --porcelain` が空であることを見てから:
1. `session.css` の色の 1 か所を `#ff0000` にする → `node scripts/audit-ui-components.mjs` が赤（E5）→ `git checkout -- apps/timer-web/src/styles/session.css`
2. `Session.tsx` の 1 か所の `className` を `flex` にする → `node scripts/audit-timer-classes.mjs` が赤（E6）→ `git checkout -- apps/timer-web/src/ui/Session.tsx`
3. `session.css` の `@keyframes pulse` を消す → `node scripts/audit-timer-classes.mjs` が赤（Q2 の強制）→ 戻す

- [ ] **Step 4: 変異パッチ（推定 20〜40 分・初回に計る）**

```bash
cd /workspaces/claym/local/Tasuki
bash -c 'for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NG $p"; done'
```

当たらないものは、元のパッチと**同じ壊し方**を新しい行に当てる形で作り直し、元と並べて弱まっていないことを読む（ID は変えない）。`git status --porcelain` が空であることを見てから `node scripts/mutation-check.mjs` を全件（`--help` を付けない）。かかった時間を控える（台帳へ書く）。Expected: すべての変異が殺される。作り直したらコミットする:

```bash
git commit -am "test: PR 3 で当たらなくなった変異パッチを作り直す（#321）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Minor・台帳・進み具合・PR・レビュー

**実装役: 統括（Opus）**

- [ ] **Step 1: タスクごとのレビューで溜めた Minor を直す**

直したら、触った部品が描かれる状態だけを M7 で比べ直す。

- [ ] **Step 2: 台帳の「PR 3」の節を埋める**

PR 2 の節と同じ項目のうち、PR 3 で流したものだけを書く: ブランチの SHA と作業ツリーが clean だったか・比較の仕組みの SHA（`git log -1 --format=%H -- e2e/parity`）・通常の比較の結果（緑の件数と所要時間。状態ごとの数は写さず期待値の JSON を指す）・破壊検証（Task 6・8）・**消した dead の組**（`~/.cache/tasuki-parity/pr3-dead.tsv` を表にする）・**流さなかったもの**（対照実行・囲いを外した一時ビルド・E8）と、その根拠の正本 §7.1・`mutation-check` の所要時間・計画の見積もりと実際の待ち時間の比較。

- [ ] **Step 3: #321 の本文の「進み具合」を更新する**

PR 3 の行を `[x]` にして PR 番号を書く（PR を作った後）。本文の他の節は書き換えない。**書き込みの前に文案を利用者に見せる。**

- [ ] **Step 4: push して PR を作る**

```bash
cd /workspaces/claym/local/Tasuki
git push -u origin feature/issue-321-pr3-session
gh pr create --title "refactor: timer の Session と子の部品から Tailwind を外す（#321 PR 3）" --body-file <scratchpad の本文>
```

本文は git-workflow の型（概要・変更内容・テスト方法）で、数は書かず台帳へのリンクだけを置く。末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。**閉鎖キーワードを書かない**（#321 は PR 4 で閉じる）。

- [ ] **Step 5: レビュー**

文脈を共有しない `/code-review` を **PR 番号を明示して**通す。指摘は採点が出てから直す。直したら、触った状態を M7 で比べ直す。

- [ ] **Step 6: マージの前に利用者に確かめる**

CI の結果・台帳・レビューの結果を並べて報告し、マージの判断を仰ぐ。**配布はしない。**
