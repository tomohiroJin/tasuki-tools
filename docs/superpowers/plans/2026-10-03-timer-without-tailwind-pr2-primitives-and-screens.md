# timer から Tailwind を外す — PR 2: primitives と呼び出し側・5 画面（#321）実装計画

> **作業者へ:** 必須サブスキル `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: timer の見た目を 1 つも変えずに、`primitives.tsx` と、Lobby・Loading・SessionLost・History・Summary の 5 画面、2 画面以上が使う部品を、Tailwind のユーティリティから `@layer timer` に入れた素の CSS へ移す。その前に、比較の仕組みに残っている偽の緑の経路を塞ぎ、PR 1 から送られた E8（規則の使用状況）と囲いを外した一時ビルドを用意する。

**方式**: 物差しを先に直し（Task 1〜3）、除去検査を取り直してから（Task 4）、在室の点（Task 5）・primitives（Task 6）・画面（Task 7〜12）の順に移す。各画面は「移植の手順」（下の節）に従い、移すたびに対象の状態だけを基準と並べて差 0 を確かめる。最後に通しの比較を 4 設定（通常・対照・囲いを外した一時ビルド・規則の使用状況）で流す（Task 13）。

**技術**: Playwright（`@playwright/test`・CDP）・vitest（`e2e/tests`・`apps/timer-web/test`）・`node --test`（`scripts/`）・postcss（ルートの devDependencies。`e2e` から解決できることを 2026-10-03 に確かめた）・Vite のプラグイン・turbo の `env`

**正本**: `docs/superpowers/specs/2026-09-29-timer-without-tailwind-design.md`（3 版）。**計画は正本に従属する。両方を読むこと。** この計画は正本の §4 **PR 2** を実装する。関係する節: D1・D2・D3・D10・§5（特に §5.5 の E8・§5.6 の破壊検証の 5 つ目）・§6（E1・E2・E5・E6・E7・E8）。台帳: `docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`。比較の流し方の正本: `e2e/parity/README.md`。

## この計画で決めたこと（正本に無い細部）

| # | 決めたこと | 理由 |
|---|---|---|
| P1 | **`SectionHeader` の `color` の props を消す。** 呼び出しは 6 か所あり、6 か所とも `text-[var(--signal)]` を渡している（2026-10-03 実測）。色は `.section-header-icon` が持つ。`RosterPanel.tsx`（PR 3 で移すファイル）の呼び出しからも props を消す（その 1 行だけ触る） | 正本 D1 は「クラス名を受け渡す API も許した形にする」と定めている。値が 1 種類しか無いので、表にする必要もない（憲法 X） |
| P2 | **在室の点は `data-presence` 属性で塗り分ける。** `PresenceDot` は `className="presence-dot" data-presence={presence}` にする。`presence.ts` の `presenceDotClass` と `presenceTextClass` は消す（`presenceTextClass` は使い手が 0 件だった） | 正本 D1 の「値の分岐は字面の形か `data-*` 属性で書く」のうち、属性の形にした。E2E で idle を作るときも属性を書き換えるだけで済み、CSS の対応がそのまま測れる（正本 D10） |
| P3 | **囲いを外した一時ビルドは、環境変数 `TASUKI_TIMER_UNLAYERED=1` で切り替える。** Vite のプラグイン（`enforce: 'pre'`）が `src/index.css` の ` layer(timer)` を外す。変数が立っているのに外す箇所が 0 件なら、ビルドを止める。turbo は宣言していない環境変数を渡さず、キャッシュの鍵にも入れないので、`turbo.json` に `@tasuki/timer-web#build` の `env` を宣言する | 正本 D3 は「作業ツリーの CSS を編集しない・手段は計画で決める」と定めている。0 件で止めるのは、外し損ねたまま普通のビルドを比べて緑になる経路を塞ぐため |
| P4 | **E8 は、dev サーバーではなく、同じハーネスで配る「最小化しないビルド」で測る**（`TASUKI_TIMER_CSS_UNMINIFIED=1`）。この変数は Vite の `build.cssMinify` と、`@tailwindcss/postcss` の `optimize`（本番では Lightning CSS で最適化する。`optimize ?? NODE_ENV==="production"`・2026-10-03 にコードで確かめた）の両方を止める。当たった規則は CDP の `CSS.stopRuleUsageTracking` のオフセットからビルドの CSS の規則を引き、**「`@layer` を除いた at-rule の並び＋セレクタ」の鍵**でソースの規則と突き合わせる。**正本 §5.5（dev ＋ ソースマップ）からの逸脱**で、利用者の承認を得た（2026-10-03） | ハーネスは Caddy から dist を配っているので、dev サーバーを使うと配り方が別の経路になる。鍵での突き合わせは、ソースの全規則がビルドの CSS にちょうど 1 回ずつ現れることを検査が断定するので、鍵の重複や書き換えは黙って通らない |
| P5 | **影のトークンは使い手と同じタスクで足す。** `--shadow-panel`（`0 10px 30px rgba(0, 0, 0, 0.5)`・`Card`）は Task 6、`--shadow-dialog`（`0 20px 50px rgba(0, 0, 0, 0.6)`・確認ダイアログ）は Task 11。どちらも `packages/ui/README.md` のトークン表に載せる | PR 1 の計画 P5 と正本 D8 の「影のトークンを足す PR で README の表にも載せる」 |
| P6 | **`RosterPanel.test.tsx` の `overflow-y-auto` の書き直しは PR 3 へ送る** | `RosterPanel.tsx` を移すのは PR 3。PR 2 でテストだけを属性の形に変えると、実装に属性を足すことになり、PR 3 のファイルを先に触る範囲が広がる |
| P7 | **呼び出し側の上書きの扱い**: primitives を `@layer timer` へ移すと、呼び出し側の Tailwind のユーティリティ（`utilities` レイヤー）が**どの幅でも**勝つようになる。そこで、Task 4 の除去検査で (a) dead の上書きは消す、(b) 一部の幅でだけ alive の上書きは、その幅だけに効く形に直す。移すファイルでは上端のある `@media`、PR 3 のファイルでは Tailwind の範囲の変種（`sm:max-md:p-4` など）にする | 正本 D2・D3 の 1。PR 3 のファイルを素の CSS にすると PR 2 の範囲を超えるので、Tailwind のまま範囲だけ狭める |
| P8 | **画面のタスクにはコードを逐語で載せない。** 値は基準の計算済みスタイルで決めるので（正本 D2）、写す宣言は Task 4 の除去検査の結果と、比較の差（`diff.json`）で決まる。計画には共通の「移植の手順」、Tailwind の値の早見表、ファイルごとの注意を置く。primitives（Task 6）と在室の点（Task 5）だけは逐語で載せる | 除去検査を流すまで、写す宣言は決まらない。逐語で書くと、死んだ宣言を写すか、生きている宣言を落とす（PR 1 の振り返り: 計画の逐語コードが正本の要求を落とした） |
| P9 | **実装役のモデル**: Task 1〜3（物差しを作るタスク）は Opus、それ以外は Sonnet（`claude-sonnet-5-5`）。レビュー役はすべて Opus | 利用者の方針（2026-10-03）。過去の欠陥は検査の抜け穴と恒真テストから多く出ている |

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 比較の仕組みの直し（Task 1）・ビルドの切り替え（Task 2）・E8（Task 3）・在室の点（Task 5）は、テストを先に書いて赤を見る。見た目の移植（Task 6〜12）は、緑の特性テスト（基準と並べる比較）の下で行う Refactor の段（正本 §8） |
| II. 技術選定は ADR を通す | 通過 | 新しい依存は足さない。決定は ADR 0023 の範囲内（`@layer timer`・素の CSS）。E8 の測り方の逸脱（P4）は計画と台帳に記録する（技術選定ではない） |
| III. 揮発インメモリと単純運用 | 通過 | 同期サーバーに触れない。配布しない |
| IV. 境界の型安全 | 該当なし | wire と境界の型に触れない |
| V. 実画面検証 | 通過 | 基準と並べる比較を、通常・対照・囲いを外した一時ビルド・規則の使用状況の 4 設定で流す（Task 13） |
| VI. 依存は内向き | 通過 | `e2e/parity/` は `apps/` を相対パスで読まない。ソースの CSS は `git ls-files` で列挙して読む（ファイルとして読むだけ） |
| VII. 検査は壊して確かめる | 通過 | 期待値の下限・`--ignore-snapshots`・除去検査の世代の揃い（Task 1）、一時ビルドの 0 件停止（Task 2）、E8 の破壊検証（Task 3）、在室の色の破壊検証（Task 5）、生の色とクラス名の検査の破壊検証（Task 13）、変異パッチの当て直し（Task 0・Task 13） |
| VIII. 記録が正本 | 通過 | 台帳の PR 2 の節（Task 14）。#321 の本文の「進み具合」を更新する。PR 本文には台帳へのリンクだけを書く |
| IX. 小さく回す | 通過 | 正本 §4 の PR 2。画面ごとにタスクとコミットを分ける |
| X. 抽象は実需で | 通過 | 使い手の無い `IconButton` を消す。`SectionHeader` の `color` は値が 1 種類なので props ごと消す（P1）。影のトークンは使い手と同じタスクで足す（P5） |
| XI. 秘密と個人情報 | 該当なし | 秘密・個人情報に触れない |

**逸脱なし**（正本 §5.5 の E8 の測り方を変えたのは P4。利用者の承認済み）。

## 全体の制約

- ブランチは `feature/issue-321-pr2-primitives-and-screens`（main `74fc920` から切った）。**main へ直接コミットしない。** push はコミットのたびに統括が行う。**実装役のサブエージェントには push もマージもさせない**（dispatch の本文に書く。作業の後に `git log origin/<branch>` を見る）
- **見た目を 1 つも変えない。** 移したあとの比較の差は 0 件でなければならない。出た差は、雑音として名指しせず、まず写し方の誤りを疑う。どうしても残る差は台帳に書き、利用者の個別の承認を得る（正本 §5.4 の 2 類を除く）
- 基準は `ba9249d` に固定する。基準の dist は `~/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist`（消さない）。作業ツリーで `git checkout main -- …` をしない
- **#321 が終わるまで、timer に触れる他の Issue を main へマージしない**
- 写すのは main で勝っている宣言だけ（正本 D2）。dead は写さず、呼び出し側からも消して台帳に書く
- `@layer timer` の中で `!important` を使わない。新しい CSS は `--tw-*` と Tailwind の theme 層の変数を `var()` で参照しない。生の色を書かない（QR の白地だけは `ui-exempt:`）。`src/styles/` に相対 `url()` を書かない
- クラス名は意味で付け、部品の根の名前を語頭に置く（`.status-strip`・`.status-strip-phase`）。D1 の衝突させない名前（`.ui-`・`.instrument-*`・`.chrono-*`・`.animate-*`・要素層のクラス・Tailwind のユーティリティ名）と重ねない。`scripts/audit-timer-classes.mjs` が落とす
- 破壊検証の前に `git status --porcelain` が空であることを確かめる。破壊はコミットしない
- 長い実行（比較・除去検査）は `run_in_background` で**実行そのもの**を起動し、完了の通知を待つ。`pgrep -f` で見張らない
- 自己テストは bash で回す（zsh は未クォートの glob で偽の赤を出す）。出力を `| head` / `| tail` で切って数えない（数えるときは `grep -c` / `wc -l`）
- E2E と比較は 8787 と 18080 を使う。利用者の `pnpm run dev` が掴んでいたら止めずに聞く。終わったら `ss -tlnp | grep -E ':(8787|18080)\b'` が空であることを見る
- 新しい E2E のタグを足さない
- 台帳と ADR に数を写さない（数の正本は `e2e/parity/expected/base-summary.json` と除去検査の出力）
- コミットメッセージは日本語の Conventional Commits。末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **移した primitives が、呼び出し側の「死んでいた上書き」を生き返らせる**（例: `PrimaryButton` に渡した `px-3 py-1.5` は main では `px-6 py-3` に負けているが、primitives を `@layer timer` へ移すと勝つ）→ Task 6 で、除去検査の dead を呼び出し側から消してから移す。Task 6 の比較で、primitives の使い手のいる全状態を流す
2. **一部の幅でだけ勝っていた上書きが、移した後はほかの幅でも勝つ**（`Summary.tsx` の `p-3 sm:p-4` は、768px 以上では `Card` の `md:p-7` に負けている）→ P7 の範囲つきの形に直す。比較は 5 幅すべてで見る
3. **負けている宣言を写していても、`@layer timer` の下では Tailwind の宣言に隠れて差が出ない**（PR 4 で囲いを外したときに初めて出る）→ Task 13 で、囲いを外した一時ビルドでも全状態を比べる。差は正本 D3 の既知の偽陽性の型だけを残し、ほかは直す
4. **一時ビルドの切り替えが効かず、普通のビルドを 2 回比べて緑になる** → Task 2 で、外す箇所が 0 件ならビルドを止める。Task 13 で、変数を立てたビルドの CSS に `@layer timer` の囲いが無いことを確かめてから比べる
5. **E8 の分母と当たりの鍵が噛み合わず、全件「未使用」になるか、恒真で緑になる** → Task 3 で、ソースの全規則の鍵が最小化しないビルドの CSS にちょうど 1 回ずつ現れることを断定する。わざと当たらない規則を 1 本足して赤を見る（正本 §5.6 の破壊検証の 5 つ目）

---

## 移植の手順（Task 6〜12 で共通）

画面のタスクは、この手順で 1 ファイルずつ移す。**手順の番号（M1〜M9）を、タスクのチェックボックスで引く。**

- **M1. 範囲を決める。** 移すファイルの `className` を全部読む（`className=` の行の外にある表・関数・変数・props も含む・正本 §2 の 2）
- **M2. dead を引く。** Task 4 の除去検査の結果を `loadRemovalProbe` だけを通して読み、そのファイルの要素の className に当たる dead の組を出す（下の「除去検査の読み方」）。**除去検査の JSON を直に読まない**
- **M3. 移す前の確認（正本 D3）。** 当たれば同じタスクで扱う
  1. 呼び出し側が `className` で同じプロパティを上書きしていないか（P7）
  2. 親の Tailwind（`space-*`・`divide-*`）が子の margin・枠を書いていないか
  3. 同じ要素の Tailwind が `box-shadow`（`ring-*`・`shadow-*`）・`filter`・`scale` / `rotate` / `translate` を書いていないか
  4. `.ui-*` を持つ要素の同じプロパティを、移す CSS が書いていないか（いまは `ui-select flex-1` と `ui-select mt-1` の 2 か所で、衝突は無い）
- **M4. CSS を書く。** `apps/timer-web/src/styles/<画面か部品>.css` に、alive の宣言だけを写す。値は下の早見表から始め、基準の計算済みスタイルで確かめる（M7）。
  - `hover:` は `@media (hover: hover) { … }` の中に書く
  - 境界は rem のまま書く（`@media (width >= 40rem)`）。一部の幅でだけ勝つものは上端つきの範囲（`@media (40rem <= width < 48rem)`）にする
  - `space-y-*` は `:where(.x > :not(:last-child)) { margin-block-end: …; }` の形にする
  - `ring-*` と `shadow-*` は、状態ごとに合成した後の `box-shadow` を書く（並びは ring-offset → ring → shadow）
  - 変形は個別のプロパティ（`scale` / `rotate` / `translate`）で書く
  - `text-*` は大きさと行の高さの組を固定値で写し、同じ行に `/* scale-exempt: Tailwind の text-sm の写し（#316 で段へ寄せる） */` を付ける
  - 色・角丸・影・書体はトークンで書く。`shadow-lg` は `var(--shadow-popover)` にする
- **M5. 入口に足す。** `src/index.css` の `@import './styles/base.css';` の後ろ、`@config` より前に `@import './styles/<名前>.css' layer(timer);` を足す（並びは primitives → 部品 → 画面）
- **M6. `.tsx` を書き換える。** 正本 D1 が許した形（`className="…"`・`className={cond ? "a" : "b"}`・名前が `_CLASS` で終わる `as const` の表・`data-*` 属性）だけで書く。移し終えたファイルは `scripts/audit-timer-classes.mjs` の `UNMIGRATED` から消す
- **M7. 対象の状態だけを比べる。** 目録の状態の名前は `grep -n "name: '" e2e/parity/states.ts` で引き、移したファイルが描かれる状態を `-g` で選ぶ（`run_in_background` で起動する）:

  ```bash
  cd /workspaces/claym/local/Tasuki/e2e && rm -rf parity/out/<選んだ状態> && \
  TASUKI_E2E_TARGET=local \
  TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist \
  pnpm exec playwright test -c parity/parity.config.ts -g '<状態 1>|<状態 2>'
  ```

  Expected: 選んだ状態がすべて緑。赤なら `parity/out/<状態>/diff.json` に基準とブランチの値が並ぶので、M4 へ戻って写し方を直す（**雑音として名指ししない**）
- **M8. 検査を回す。**

  ```bash
  cd /workspaces/claym/local/Tasuki
  node scripts/audit-timer-classes.mjs
  node scripts/audit-ui-components.mjs
  pnpm --filter @tasuki/timer-web test
  pnpm --filter @tasuki/timer-web typecheck
  pnpm --filter @tasuki/timer-web lint
  ```

  Expected: すべて成功
- **M9. コミットする。** 消した dead の組（ファイル・className・token）は、作業ツリーの外の控え `~/.cache/tasuki-parity/pr2-dead.tsv`（1 行 1 組・タブ区切り。セッションをまたいで残る置き場）に足していく。Task 14 で台帳へ写す

### 除去検査の読み方

```bash
cd /workspaces/claym/local/Tasuki/e2e
node --experimental-strip-types -e "
import('./parity/removal-summary.ts').then(({ loadRemovalProbe }) => {
  const probe = loadRemovalProbe();
  const owner = process.argv[1]; // 例: 'px-6'（PrimaryButton の根の語）
  for (const d of probe.dead) if (d.className.split(/\s+/).includes(owner)) console.log(['dead', d.token, d.className, d.states.join(',')].join('\t'));
  for (const s of probe.states) for (const h of s.alive) if (h.className.split(/\s+/).includes(owner)) console.log(['alive', h.token, (h.widths ?? []).join(','), h.className, s.state].join('\t'));
});
" '<根の語>'
```

- `dead` の行の token は写さず、呼び出し側からも消す
- `alive` の行で `widths` が 5 幅（360・640・768・1024・1280）の一部だけのものは、その幅だけに効く形に直す（P7）
- `undecided` は写す側へ倒す（`loadRemovalProbe` の束ね方と同じ）

### Tailwind の値の早見表（Tailwind 4.3.3 の既定。**最後は比較が決める**）

| ユーティリティ | 写す値 |
|---|---|
| `p-N`・`m-N`・`gap-N`・`w-N`・`h-N` | `N × 0.25rem`（`p-2.5` → `0.625rem`）。`px` は `padding-inline`、`py` は `padding-block`、`mx-auto` は `margin-inline: auto` |
| `text-xs` / `text-sm` / `text-base` / `text-lg` / `text-xl` / `text-2xl` | `0.75rem` / `calc(1 / 0.75)`、`0.875rem` / `calc(1.25 / 0.875)`、`1rem` / `1.5`、`1.125rem` / `calc(1.75 / 1.125)`、`1.25rem` / `calc(1.75 / 1.25)`、`1.5rem` / `calc(2 / 1.5)`（大きさ / 行の高さ） |
| `font-medium` / `font-semibold` / `font-bold` | `500` / `600` / `700` |
| `tracking-tight` / `tracking-wide` / `tracking-wider` / `tracking-widest` | `-0.025em` / `0.025em` / `0.05em` / `0.1em` |
| `leading-tight` / `leading-snug` / `leading-relaxed` | `1.25` / `1.375` / `1.625` |
| `rounded-sm` / `rounded-md` / `rounded-lg` / `rounded-xl` | `var(--radius-sm)` / `var(--radius-md)` / `var(--radius-lg)` / 基準の計算済みの値（トークン層に `--radius-xl` が無い） |
| `rounded-full` | `calc(infinity * 1px)` |
| `border` / `border-l` など | `border-width: 1px`（辺ごと）。`border-[var(--x)]` は **4 辺すべての** `border-color` |
| `transition-all` | `transition-property: all; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms;` |
| `transition-colors` | `transition-property: color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to;`（計算済みの値に合わせるため、名前としてだけ書く。`var()` では参照しない）と、上と同じ timing・duration |
| `active:scale-95` | `:active { scale: 95% 95%; }` |
| `max-w-md` / `max-w-lg` / `max-w-2xl` / `max-w-6xl` | `28rem` / `32rem` / `42rem` / `72rem` |
| `animate-pulse` | `animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;` と `@keyframes pulse { 50% { opacity: 0.5; } }` |
| `sm:` / `md:` / `lg:` | `@media (width >= 40rem)` / `(width >= 48rem)` / `(width >= 64rem)` |

---

### Task 0: 着手前の確認

**Files:** なし

**Interfaces:**
- Produces: clean な作業ツリー・当たる変異パッチの一覧・基準の dist の所在

- [ ] **Step 1: 作業ツリーと基準の dist を確かめる**

```bash
cd /workspaces/claym/local/Tasuki
git status --porcelain
git rev-parse --abbrev-ref HEAD
git -C ~/.cache/tasuki-parity/base-ba9249d rev-parse HEAD
ls ~/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist/index.html
```

Expected: 1 行目は出力なし。ブランチは `feature/issue-321-pr2-primitives-and-screens`。基準の HEAD は `ba9249d` で始まる。`index.html` がある

- [ ] **Step 2: 全変異パッチに `git apply --check` を当てる**

```bash
cd /workspaces/claym/local/Tasuki
bash -c 'for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NG $p"; done'
```

Expected: 出力なし（全部当たる）。当たらないものがあれば、PR 2 で触る前から壊れているので、統括に報告して止まる

- [ ] **Step 3: PR 2 で触るファイルを文脈に持つ変異を控える**

```bash
cd /workspaces/claym/local/Tasuki
bash -c 'grep -l -E "primitives.tsx|presence.ts|PresenceDot|Loading.tsx|SessionLost.tsx|History.tsx|Summary.tsx|Lobby.tsx|App.tsx|InvitePanel|PassphrasePanel|TopicCard|Markdown.tsx|EmptyHint|StatusStrip|NotifySettings|ConfirmDialog|SessionConfigPanel|RosterPanel|design-tokens" scripts/mutations/*.patch' > ~/.cache/tasuki-parity/pr2-mutations-at-risk.txt
wc -l ~/.cache/tasuki-parity/pr2-mutations-at-risk.txt
```

Expected: 件数が出る（2026-10-03 の時点で 14 本）。Task 13 で、これらが当たるかを見直す

コミットはしない。

---

### Task 1: 比較の仕組みの偽の緑の経路を塞ぐ（テストが先）

**実装役: Opus**

**Files:**
- Modify: `e2e/parity/expected.ts`（期待値の下限・世代の揃い）
- Modify: `e2e/parity/timer.parity.ts`（基準側の要約の控えに世代と下限を書く）
- Create: `e2e/parity/guard.ts`（snapshot の扱いの断定を純関数に）
- Modify: `e2e/parity/context.ts`（`assertSnapshotsNotUpdated` が `guard.ts` を使う）
- Create: `e2e/parity/git-head.ts`（作業ツリーの世代）
- Modify: `e2e/parity/removal.parity.ts`・`e2e/parity/removal-summary.ts`（除去検査の世代の揃い）
- Modify: `e2e/parity/README.md`（期待値を作り直す手順）
- Modify: `docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`（マスクの表に喪失画面の行）
- Test: `e2e/tests/parity-expected.test.ts`・`e2e/tests/removal-summary.test.ts`・`e2e/tests/parity-guard.test.ts`（新規）

**Interfaces:**
- Produces:
  - `snapshotGuardProblem(mode: { updateSnapshots: string; ignoreSnapshots: boolean }): string | null`（`guard.ts`）
  - `repoGeneration(cwd?: string): string`（`git-head.ts`。`<HEAD の SHA>` か、作業ツリーが汚れていれば `<SHA>-dirty`）
  - `writeExpectedFromOut(outDir?, file?, generation?)` が、下限と世代の揃いを満たさないときに throw する
  - 除去検査の JSON に `generation: string` が入り、`loadRemovalProbe` が全状態の揃いを断定する
- Consumes: 既存の `checkExpectation`・`loadRemovalProbe`・`assertSnapshotsNotUpdated`

PR 1 の最終レビューが残した 2 つの経路と、2 つの小さな穴を塞ぐ:

1. **期待値の作り直しに下限が無い。** `out/<状態>/base-expectation.json` に 0 や空があっても束ねてしまう。さらに `out/` を消さずに流すと、前の世代の要約が混ざる
2. **`--ignore-snapshots` を付けると、画素を比べずに緑になる**（`-u` は塞いだ）
3. 除去検査を `-g` で一部だけ流すと、世代の違う JSON が混ざる
4. 台帳のマスクの表に、喪失画面の「ルーム XXXXXX」の行が無い（`roomMask` の 2 つ目のロケーターが隠している）

- [ ] **Step 1: 世代の関数と snapshot の断定のテストを書く**

`e2e/tests/parity-guard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { snapshotGuardProblem } from '../parity/guard';

describe('snapshotGuardProblem', () => {
  it.each(['missing', 'none'])('Given updateSnapshots=%s・ignoreSnapshots なし / Then 止めない', (updateSnapshots) => {
    expect(snapshotGuardProblem({ updateSnapshots, ignoreSnapshots: false })).toBeNull();
  });

  it.each(['all', 'changed'])('Given updateSnapshots=%s / Then 止める（基準の画像が上書きされる）', (updateSnapshots) => {
    expect(snapshotGuardProblem({ updateSnapshots, ignoreSnapshots: false })).toMatch(/updateSnapshots/);
  });

  it('Given --ignore-snapshots / Then 止める（画素を比べずに緑になる）', () => {
    expect(snapshotGuardProblem({ updateSnapshots: 'missing', ignoreSnapshots: true })).toMatch(/ignore-snapshots/);
  });
});
```

- [ ] **Step 2: 期待値の下限と世代のテストを書く**

`e2e/tests/parity-expected.test.ts` に足す（既存の `describe` の後ろ。既存の fixture の作り方に合わせる）:

```ts
describe('writeExpectedFromOut の下限と世代', () => {
  const good = { elements: { 360: 80, 640: 80, 768: 80, 1024: 80, 1280: 80 }, motionEntries: 12, keyframes: ['fade-up'], interactions: { counts: {}, entries: 3, notEntered: [], skipped: [] } };
  const meta = (generation: string, minElements = 60) => ({ generation, minElements });

  function outWith(entries: Record<string, { exp: unknown; meta: unknown }>): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'parity-out-'));
    for (const [key, { exp, meta: m }] of Object.entries(entries)) {
      mkdirSync(path.join(dir, key), { recursive: true });
      writeFileSync(path.join(dir, key, 'base-expectation.json'), JSON.stringify(exp));
      writeFileSync(path.join(dir, key, 'base-expectation.meta.json'), JSON.stringify(m));
    }
    return dir;
  }

  it('Given 全件が下限を満たし同じ世代 / Then 書ける', () => {
    const dir = outWith({ a: { exp: good, meta: meta('abc') }, b: { exp: good, meta: meta('abc') } });
    expect(writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc')).toBe(2);
  });

  it('Given ある幅の要素数が minElements 未満 / Then 書かずに止める', () => {
    const thin = { ...good, elements: { ...good.elements, 768: 0 } };
    const dir = outWith({ a: { exp: thin, meta: meta('abc') } });
    expect(() => writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc')).toThrow(/a.*768/);
  });

  it('Given タッチの要約（elements が数）が minElements 未満 / Then 止める', () => {
    const dir = outWith({ 'a-touch': { exp: { ...good, elements: 3 }, meta: meta('abc') } });
    expect(() => writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc')).toThrow(/a-touch/);
  });

  it('Given 動きの件数が 0 / Then 止める', () => {
    const dir = outWith({ a: { exp: { ...good, motionEntries: 0 }, meta: meta('abc') } });
    expect(() => writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc')).toThrow(/動き/);
  });

  it('Given 前の世代の要約が混ざっている / Then 止める（out/ を消さずに流した）', () => {
    const dir = outWith({ a: { exp: good, meta: meta('abc') }, b: { exp: good, meta: meta('old') } });
    expect(() => writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc')).toThrow(/世代/);
  });

  it('Given 世代の控えが無い要約 / Then 止める', () => {
    const dir = outWith({ a: { exp: good, meta: meta('abc') } });
    rmSync(path.join(dir, 'a', 'base-expectation.meta.json'));
    expect(() => writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc')).toThrow(/世代/);
  });

  it('Given 作業ツリーが汚れている世代 / Then 止める（コミットしていない変更で期待値を作らない）', () => {
    const dir = outWith({ a: { exp: good, meta: meta('abc-dirty') } });
    expect(() => writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc-dirty')).toThrow(/dirty/);
  });

  it('現行の期待値の JSON は下限を満たす（下限が厳しすぎて作り直せない、を防ぐ）', () => {
    const table = loadExpected();
    expect(table).not.toBeNull();
    for (const [key, exp] of Object.entries(table ?? {})) expect(expectationFloorProblems(key, exp, 10), key).toEqual([]);
  });
});
```

`import` に `mkdtempSync`・`mkdirSync`・`writeFileSync`・`rmSync`（`node:fs`）・`tmpdir`（`node:os`）・`path`・`expectationFloorProblems`・`loadExpected` を足す（既にあるものは重ねない）。

- [ ] **Step 3: 除去検査の世代のテストを書く**

`e2e/tests/removal-summary.test.ts` の fixture の書き出しに `generation` を足し（既存の fixture はすべて `generation: 'g1'` にする）、次を足す:

```ts
it('Given 状態ごとの結果の世代が食い違う / Then 止める（-g で一部だけ流し直した）', () => {
  const dir = fixtureDir({ s1: { generation: 'g1' }, s2: { generation: 'g2' } });
  expect(() => loadRemovalProbe(dir, ['s1', 's2'])).toThrow(/世代/);
});

it('Given 世代の無い結果 / Then 止める（PR 1 の形式の残り）', () => {
  const dir = fixtureDir({ s1: { generation: undefined } });
  expect(() => loadRemovalProbe(dir, ['s1'])).toThrow(/世代/);
});
```

`fixtureDir` は既存のテストの fixture の作り方に合わせて作る（既存のヘルパがあればそれに `generation` を渡せるようにする）。

- [ ] **Step 4: 赤を見る**

```bash
cd /workspaces/claym/local/Tasuki/e2e
pnpm exec vitest run tests/parity-guard.test.ts tests/parity-expected.test.ts tests/removal-summary.test.ts
```

Expected: FAIL（`guard.ts` が無い・`expectationFloorProblems` が無い・世代を見ていない）。**赤の理由が上の 3 つだけであることを読む**

- [ ] **Step 5: `guard.ts` と `git-head.ts` を書く**

`e2e/parity/guard.ts`:

```ts
/**
 * 画素の基準（snapshot）の扱いの断定（#321）。比較は基準の画像を snapshot の置き場へ書いてから、ブランチの画像を照合する。
 *
 * - `-u` / `--update-snapshots`: ブランチの画像で基準の画像を上書きして、画素を比べずに通る
 * - `--ignore-snapshots`: `toMatchSnapshot` そのものを飛ばして、画素を比べずに通る
 *
 * どちらも偽の緑なので止める。許すのは、既定の `missing` と `none` で、`ignoreSnapshots` が偽のときだけ。
 */
export function snapshotGuardProblem(mode: { updateSnapshots: string; ignoreSnapshots: boolean }): string | null {
  if (mode.ignoreSnapshots) return '--ignore-snapshots で流している。画素を比べずに緑になるので止める';
  if (mode.updateSnapshots !== 'missing' && mode.updateSnapshots !== 'none') {
    return `updateSnapshots が ${mode.updateSnapshots}（-u / --update-snapshots で流している）。基準の画像がブランチの画像で上書きされるので止める`;
  }
  return null;
}
```

`e2e/parity/git-head.ts`:

```ts
/**
 * 作業ツリーの世代（#321）。期待値の要約と除去検査の結果に書き、束ねるときに揃いを断定する
 * （`out/` を消さずに流す・`-g` で一部だけ流し直す、で世代の違う結果が混ざるのを止める）。
 */
import { execFileSync } from 'node:child_process';

const git = (cwd: string, args: string[]): string =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** `<HEAD の SHA>`。作業ツリーに変更があれば `<SHA>-dirty`。 */
export function repoGeneration(cwd = process.cwd()): string {
  const head = git(cwd, ['rev-parse', 'HEAD']);
  return git(cwd, ['status', '--porcelain']) === '' ? head : `${head}-dirty`;
}
```

- [ ] **Step 6: `context.ts` の断定を `guard.ts` に寄せる**

`assertSnapshotsNotUpdated` の本体を次にする（関数の名前と呼び出し側は変えない。注釈の「`-u`」の説明に `--ignore-snapshots` を足す）:

```ts
export function assertSnapshotsNotUpdated(testInfo: TestInfo): void {
  const problem = snapshotGuardProblem({
    updateSnapshots: testInfo.config.updateSnapshots,
    ignoreSnapshots: testInfo.project.ignoreSnapshots,
  });
  if (problem !== null) throw new Error(problem);
}
```

- [ ] **Step 7: `expected.ts` に下限と世代を入れる**

`expected.ts` は相対の import を持たない（`node --experimental-strip-types parity/expected.ts` で直に走らせるため）。世代は `git-head.ts` を import せず、同じ 3 行をこのファイルの中に持つ（注釈で `git-head.ts` と同じ定義であることを書く）。足すもの:

```ts
/** 1 テストの世代と下限の控え（`base-expectation.json` の隣）。 */
export const BASE_EXPECTATION_META_FILE = 'base-expectation.meta.json';

/** 世代と下限の控えの形。`minElements` は目録の状態の下限（`states.ts`）。 */
export interface ExpectationMeta {
  readonly generation: string;
  readonly minElements: number;
}

/**
 * 基準側の要約の下限（作り直しで 0 や空を期待値にしない）。
 * - 要素数: どの幅でも `minElements` 以上（タッチは数 1 つ）
 * - 動きの件数: 1 以上（どの状態にも遷移を持つ要素がある・現行の期待値で確かめる）
 */
export function expectationFloorProblems(key: string, expectation: unknown, minElements: number): string[] {
  if (!isRecord(expectation)) return [`${key}: 要約がオブジェクトでない`];
  const problems: string[] = [];
  const elements = expectation['elements'];
  const counts = typeof elements === 'number' ? { touch: elements } : isRecord(elements) ? elements : {};
  if (Object.keys(counts).length === 0) problems.push(`${key}: 要素数が無い`);
  for (const [width, n] of Object.entries(counts)) {
    if (typeof n !== 'number' || n < minElements) problems.push(`${key}@${width}: 要素数 ${String(n)} が下限 ${minElements} 未満`);
  }
  const motion = expectation['motionEntries'];
  if (typeof motion !== 'number' || motion < 1) problems.push(`${key}: 動きの件数 ${String(motion)} が 0`);
  return problems;
}
```

`writeExpectedFromOut(outDir = OUT, file = EXPECTED_FILE, generation = currentGeneration())` に変え、束ねる前に次を断定する（1 つでも当たれば何も書かずに throw する。メッセージに状態の名前を入れる）:

1. `generation` が `-dirty` で終わる → 「作業ツリーが汚れている（dirty）。コミットしてから流す」
2. 各キーの `base-expectation.meta.json` が無い、または `generation` が引数と違う → 「世代が揃わない（out/ を消してから全件流し直す）」
3. 各キーの `expectationFloorProblems(key, exp, meta.minElements)` が空でない

`currentGeneration()` は `repoGeneration()` と同じ定義をこのファイルに持つ。

- [ ] **Step 8: `timer.parity.ts` が世代と下限の控えを書く**

`checkBaseExpectation(dir, key, expectation)` を `checkBaseExpectation(dir, key, expectation, minElements)` に変え、`base-expectation.json` の隣に `{ generation: GENERATION, minElements }` を `BASE_EXPECTATION_META_FILE` で書く。`GENERATION` はファイルの先頭で `repoGeneration()` を 1 回だけ呼んで持つ。呼び出し 2 か所は `state.minElements` を渡す。

- [ ] **Step 9: 除去検査の世代**

- `removal.parity.ts`: 書き出す `out` に `generation: repoGeneration()` を足す
- `removal-summary.ts`: `StateRemoval` に `readonly generation: string` を足し、`loadRemovalProbe` で、全状態の `generation` が文字列で、全部同じであることを断定する（違えば `除去検査の結果の世代が揃わない: <状態>=<世代> …（-g で一部だけ流し直した。全状態を流し直す）`、無ければ `世代の無い結果: <状態>`）。**束ねた結果に `generation` を返す**（`RemovalProbe` に `readonly generation: string`）

- [ ] **Step 10: 緑を見る**

```bash
cd /workspaces/claym/local/Tasuki/e2e
pnpm exec vitest run tests/parity-guard.test.ts tests/parity-expected.test.ts tests/removal-summary.test.ts
pnpm exec tsc --noEmit -p tsconfig.json
pnpm run lint
```

Expected: すべて PASS。「現行の期待値の JSON は下限を満たす」も通る（通らなければ下限を緩めるのではなく、どの状態が何件かを統括に報告する）

- [ ] **Step 11: README の「期待値を作り直す」を書き直す**

手順を次にする（番号の並びを保つ）:

1. 作業ツリーが clean であることを見る（`git status --porcelain` が空）。世代が `-dirty` だと 3 が止まる
2. **`rm -rf parity/out` で前の出力を消す**
3. 「流す」を全件流す（各テストが `out/<状態>/base-expectation.json` と `base-expectation.meta.json` を書く）
4. `node --experimental-strip-types parity/expected.ts`（世代が揃わない・下限を下回る・dirty なら、何も書かずに止まる）
5. `git diff e2e/parity/expected/` で、変わったのが変えた所だけであることを読む
6. もう一度全件流し、全件緑を見てからコミットする

「流す」の節の `-u` の説明の隣に「**`--ignore-snapshots` も付けない**（画素を比べずに緑になるので、各テストの先頭で止まる）」を足す。除去検査の節に「結果には世代が入り、`loadRemovalProbe` は全状態の世代が揃っていなければ止まる（`-g` で一部だけ流し直したら、全状態を流し直す）」を足す。

- [ ] **Step 12: 台帳のマスクの表に行を足す**

台帳の「画素のマスク」の表の「招待パネルのルームコードの行」の次に、次の行を足す:

```markdown
| 喪失画面の「ルーム XXXXXX」 | 部屋ごとに変わる（§5.3）。コードの要素の親（行）を隠す（`roomMask` の 2 つ目） | なし（字の色・書体はスタイルの比較が見る） |
```

- [ ] **Step 13: 破壊検証（コミットしない）**

`git status --porcelain` が空であることを見てから:

1. `guard.ts` の `if (mode.ignoreSnapshots) …` の行を消す → `parity-guard.test.ts` が赤 → `git checkout -- e2e/parity/guard.ts`
2. `expected.ts` の `expectationFloorProblems` の `n < minElements` を `n < 0` にする → 下限のテストが赤 → 戻す
3. `removal-summary.ts` の世代の揃いの断定を消す → 世代のテストが赤 → 戻す

各回の後に `git status --porcelain` が空に戻ったことを見る。

- [ ] **Step 14: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add e2e/parity e2e/tests docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md
git commit -m "fix: 比較の仕組みの偽の緑の経路を塞ぐ（#321 PR 2）

- 期待値の作り直しに下限と世代の揃いを置き、out/ の取り残しと 0 件の期待値を止める
- --ignore-snapshots で流したら止める（-u と同じく画素を比べずに緑になる）
- 除去検査の結果に世代を書き、-g で一部だけ流し直した結果の混在を止める
- 台帳のマスクの表に喪失画面のルームコードの行を足す

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 囲いを外した一時ビルドと、最小化しないビルドの切り替え（テストが先）

**実装役: Opus**

**Files:**
- Create: `apps/timer-web/vite-timer-css.ts`（切り替えの純関数と Vite のプラグイン）
- Modify: `apps/timer-web/vite.config.ts`（プラグインと `build.cssMinify`）
- Modify: `apps/timer-web/postcss.config.js`（`optimize`）
- Modify: `turbo.json`（`@tasuki/timer-web#build` の `env`）
- Create: `e2e/parity/parity.unlayered.config.ts`・`e2e/parity/parity.usage.config.ts`
- Modify: `e2e/parity/README.md`
- Test: `apps/timer-web/test/build/vite-timer-css.test.ts`

**Interfaces:**
- Produces:
  - `stripTimerLayer(code: string): { code: string; count: number }`
  - `timerCssSwitches(env: NodeJS.ProcessEnv): { unlayered: boolean; unminified: boolean }`（`'1'` のときだけ真）
  - `timerCssPlugin(env?): Plugin`（`unlayered` のとき `src/index.css` から ` layer(timer)` を外す。0 件なら throw）
  - 設定 `parity/parity.unlayered.config.ts`（project の名前 `囲いを外した一時ビルド`・`metadata.parityUnlayered: true`）と `parity/parity.usage.config.ts`（project の名前 `規則の使用状況`・`metadata.parityUsage: true`）
- Consumes: なし

- [ ] **Step 1: テストを書く**

`apps/timer-web/test/build/vite-timer-css.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stripTimerLayer, timerCssPlugin, timerCssSwitches } from "../../vite-timer-css.js";

describe("timerCssSwitches", () => {
  it("Given 変数なし / Then どちらも偽", () => {
    expect(timerCssSwitches({})).toEqual({ unlayered: false, unminified: false });
  });
  it("Given '1' / Then 真（'true' や '0' は偽）", () => {
    expect(timerCssSwitches({ TASUKI_TIMER_UNLAYERED: "1", TASUKI_TIMER_CSS_UNMINIFIED: "1" })).toEqual({ unlayered: true, unminified: true });
    expect(timerCssSwitches({ TASUKI_TIMER_UNLAYERED: "true", TASUKI_TIMER_CSS_UNMINIFIED: "0" })).toEqual({ unlayered: false, unminified: false });
  });
});

describe("stripTimerLayer", () => {
  it("Given layer(timer) の @import が 2 本 / Then 2 本とも外し、件数 2 を返す", () => {
    const src = "@import './styles/base.css';\n@import './styles/primitives.css' layer(timer);\n@import \"./styles/lobby.css\" layer(timer);\n";
    expect(stripTimerLayer(src)).toEqual({
      code: "@import './styles/base.css';\n@import './styles/primitives.css';\n@import \"./styles/lobby.css\";\n",
      count: 2,
    });
  });
  it("Given 順序宣言の @layer の中の timer / Then 触らない（@import の layer() だけを外す）", () => {
    const src = "@layer theme, base, timer, components, utilities;\n";
    expect(stripTimerLayer(src)).toEqual({ code: src, count: 0 });
  });
});

describe("timerCssPlugin", () => {
  const transform = (env: NodeJS.ProcessEnv, code: string, id: string) => {
    const plugin = timerCssPlugin(env);
    const fn = plugin.transform as (code: string, id: string) => { code: string } | null;
    return fn.call({}, code, id);
  };
  it("Given 変数なし / Then 何もしない", () => {
    expect(transform({}, "@import './a.css' layer(timer);", "/x/apps/timer-web/src/index.css")).toBeNull();
  });
  it("Given unlayered・入口の CSS / Then 外す", () => {
    expect(transform({ TASUKI_TIMER_UNLAYERED: "1" }, "@import './a.css' layer(timer);", "/x/apps/timer-web/src/index.css")).toEqual({ code: "@import './a.css';", map: null });
  });
  it("Given unlayered・外す箇所が 0 件 / Then 止める（普通のビルドを一時ビルドと取り違えない）", () => {
    expect(() => transform({ TASUKI_TIMER_UNLAYERED: "1" }, "@import './a.css';", "/x/apps/timer-web/src/index.css")).toThrow(/layer\(timer\)/);
  });
  it("Given unlayered・入口でない CSS / Then 触らない", () => {
    expect(transform({ TASUKI_TIMER_UNLAYERED: "1" }, "@import './a.css' layer(timer);", "/x/apps/timer-web/src/styles/lobby.css")).toBeNull();
  });
});
```

- [ ] **Step 2: 赤を見る**

```bash
cd /workspaces/claym/local/Tasuki
pnpm --filter @tasuki/timer-web exec vitest run test/build/vite-timer-css.test.ts
```

Expected: FAIL（`vite-timer-css.ts` が無い）。テストが `vitest.config.ts` の `include` に入っていなければ、ここで `include` を確かめて合わせる（`test/**/*.test.ts(x)` なら入る）

- [ ] **Step 3: 実装する**

`apps/timer-web/vite-timer-css.ts`:

```ts
/**
 * timer の CSS のビルドの切り替え（#321・計画 P3・P4）。どちらも比較の仕組み（`e2e/parity/`）からだけ使う。PR 4 で消す。
 *
 * - `TASUKI_TIMER_UNLAYERED=1`: 入口（`src/index.css`）の `@import … layer(timer)` から `layer(timer)` を外す（設計正本 D3 の
 *   「囲いを外した一時ビルド」）。外す箇所が 0 件ならビルドを止める（外し損ねたまま普通のビルドを比べて緑にしない）
 * - `TASUKI_TIMER_CSS_UNMINIFIED=1`: CSS を最小化しない（E8 の規則の使用状況を、ソースの規則と鍵で突き合わせるため）。
 *   `vite.config.ts` の `build.cssMinify` と `postcss.config.js` の `optimize` が読む
 *
 * turbo は宣言していない環境変数を渡さず、キャッシュの鍵にも入れないので、`turbo.json` の `@tasuki/timer-web#build` に宣言する。
 */
import type { Plugin } from "vite";

export function timerCssSwitches(env: NodeJS.ProcessEnv): { unlayered: boolean; unminified: boolean } {
  return { unlayered: env["TASUKI_TIMER_UNLAYERED"] === "1", unminified: env["TASUKI_TIMER_CSS_UNMINIFIED"] === "1" };
}

/** `@import` の行の末尾の ` layer(timer)` だけを外す（順序宣言の `@layer …, timer, …;` は触らない）。 */
export function stripTimerLayer(code: string): { code: string; count: number } {
  let count = 0;
  const out = code.replace(/(@import\s+(['"])[^'"]+\2)\s+layer\(timer\)/g, (_m, head: string) => {
    count += 1;
    return head;
  });
  return { code: out, count };
}

const ENTRY = /\/apps\/timer-web\/src\/index\.css$/;

export function timerCssPlugin(env: NodeJS.ProcessEnv = process.env): Plugin {
  const { unlayered } = timerCssSwitches(env);
  return {
    name: "tasuki-timer-css-unlayered",
    enforce: "pre",
    transform(code, id) {
      if (!unlayered || !ENTRY.test(id.split("?")[0] ?? "")) return null;
      const stripped = stripTimerLayer(code);
      if (stripped.count === 0) throw new Error("TASUKI_TIMER_UNLAYERED=1 なのに src/index.css に layer(timer) の @import が 1 本も無い");
      return { code: stripped.code, map: null };
    },
  };
}
```

`vite.config.ts`: `plugins` を `[timerCssPlugin(), react(), hubRedirectPlugin()]` にし、`build` に次を足す（既定を変えない形）:

```ts
  // 比較の仕組みの E8 のためだけに、CSS を最小化しないビルドを作る（`vite-timer-css.ts`・#321 計画 P4）
  build: timerCssSwitches(process.env).unminified ? { cssMinify: false } : {},
```

`postcss.config.js` の `'@tailwindcss/postcss': {}` を、次にする（`undefined` なら Tailwind の既定 `NODE_ENV === 'production'` のまま）:

```js
  // 比較の仕組みの E8 のためだけに、Tailwind の最適化（Lightning CSS）を止める（#321 計画 P4）。既定は変えない
  '@tailwindcss/postcss': { optimize: process.env.TASUKI_TIMER_CSS_UNMINIFIED === '1' ? false : undefined },
```

`turbo.json` の `tasks` に足す（`@tasuki/timer-core#test` の前。注釈は `$comment` の流儀に合わせて前置きの文に 1 文足す）:

```json
    "@tasuki/timer-web#build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "env": ["TASUKI_TIMER_UNLAYERED", "TASUKI_TIMER_CSS_UNMINIFIED"]
    },
```

- [ ] **Step 4: 緑を見る**

```bash
cd /workspaces/claym/local/Tasuki
pnpm --filter @tasuki/timer-web exec vitest run test/build/vite-timer-css.test.ts
pnpm --filter @tasuki/timer-web typecheck
pnpm --filter @tasuki/timer-web lint
```

Expected: PASS。`vite-timer-css.ts` が tsconfig・eslint の対象に入っていなければ、`vite.config.ts` と同じ扱いに合わせる

- [ ] **Step 5: ビルドで効き目を確かめる**

```bash
cd /workspaces/claym/local/Tasuki
pnpm exec turbo run build --filter @tasuki/timer-web
f=$(ls apps/timer-web/dist/assets/index-*.css); wc -l "$f"; sha256sum "$f"
TASUKI_TIMER_CSS_UNMINIFIED=1 pnpm exec turbo run build --filter @tasuki/timer-web
f=$(ls apps/timer-web/dist/assets/index-*.css); wc -l "$f"
grep -c '^\.instrument-label' "$f"
TASUKI_TIMER_UNLAYERED=1 pnpm exec turbo run build --filter @tasuki/timer-web; echo "exit=$?"
pnpm exec turbo run build --filter @tasuki/timer-web
f=$(ls apps/timer-web/dist/assets/index-*.css); sha256sum "$f"
```

Expected:
- 1 回目は数行（最小化されている）
- 2 回目は数千行、`.instrument-label` が行頭に 1 回以上出る（最小化も最適化もされていない）
- 3 回目は `exit` が 0 でない（この時点では `layer(timer)` の `@import` がまだ 0 本なので止まる）
- 4 回目のハッシュは 1 回目と一致する（turbo のキャッシュが環境変数を鍵に分けている）

- [ ] **Step 6: 比較の設定を 2 本足す**

`e2e/parity/parity.unlayered.config.ts`（`parity.control.config.ts` と同じ形で作る。中身は次の要点を満たす）:

```ts
/**
 * 囲いを外した一時ビルドで比べる設定（#321・設計正本 D3・計画 P3）。ブランチの timer を `layer(timer)` 無しでビルドして配る。
 * **環境変数ではなく設定ファイルで選ぶ**（対照実行と同じ流儀）。`globalSetup` のビルドより前に変数を立てる。
 * 差のうち「親を先に移したとき、レイヤー外になった親の `:where(.x > :not(:last-child))` が、まだ Tailwind のままの子の
 * margin に勝つ」型は既知の偽陽性（設計正本 D3）。ほかの差は直す。
 */
import { defineConfig } from '@playwright/test';
import base from './parity.config';

process.env['TASUKI_TIMER_UNLAYERED'] = '1';

export default defineConfig({
  ...base,
  metadata: { ...base.metadata, parityUnlayered: true },
  projects: [{ name: '囲いを外した一時ビルド', use: base.use }],
});
```

`e2e/parity/parity.usage.config.ts` も同じ形で、`TASUKI_TIMER_CSS_UNMINIFIED` を立て、`metadata.parityUsage: true`・project の名前 `規則の使用状況` にする（E8 の書き出しは Task 3 で足す）。

`globalSetup` のビルドが turbo を通して変数を受け取ることを確かめる: `e2e/harness/build.ts` の `buildWebApps` が子プロセスへ `process.env` を渡しているかを読む（渡していなければ、渡す形に直す。直したらそのことを注釈に書く）。

- [ ] **Step 7: README に 2 つの流し方を足す**

「対照実行」の節の後に「囲いを外した一時ビルド」「規則の使用状況（E8）」の節を足し、それぞれの `-c` の設定ファイルと、何を見るか（前者は既知の偽陽性の型だけを残す・後者は Task 3 の照合）を書く。**流し方の正本は README**（台帳に写さない）。

- [ ] **Step 8: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add apps/timer-web/vite-timer-css.ts apps/timer-web/vite.config.ts apps/timer-web/postcss.config.js apps/timer-web/test/build turbo.json e2e/parity e2e/harness
git commit -m "feat: 囲いを外した一時ビルドと最小化しないビルドの切り替えを足す（#321 PR 2）

- TASUKI_TIMER_UNLAYERED=1 で入口の layer(timer) を外す（0 件ならビルドを止める）
- TASUKI_TIMER_CSS_UNMINIFIED=1 で CSS の最小化と Tailwind の最適化を止める（E8 用）
- turbo の timer-web#build に env を宣言し、キャッシュを分ける
- 比較の設定を 2 本足す（囲いを外した一時ビルド・規則の使用状況）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: E8（規則の使用状況）を測る（テストが先）

**実装役: Opus**

**Files:**
- Create: `e2e/parity/usage.ts`（CDP で当たった規則を取る）
- Create: `e2e/parity/usage-summary.ts`（ソースの規則の列挙・鍵・突き合わせ）
- Modify: `e2e/parity/timer.parity.ts`（`metadata.parityUsage` のときブランチの側で書き出す）
- Modify: `e2e/parity/README.md`
- Test: `e2e/tests/usage-summary.test.ts`

**Interfaces:**
- Produces:
  - `ruleKey(rule: postcss.Rule): string`（`@layer` を除いた祖先の at-rule を外から順に `@name params`（空白を 1 つに畳む）で並べ、最後にセレクタ（`,` の前後と空白を畳む）を置き、`\u0000` で繋ぐ。`@keyframes` の中の規則は対象外で `null` を返す形にするなら型は `string | null`）
  - `sourceRules(files: readonly { path: string; css: string }[]): SourceRule[]`（`SourceRule = { key: string; file: string; line: number }`）
  - `rulesInBuiltCss(css: string): Map<string, number>`（鍵ごとの出現回数）
  - `usageProblems(source: SourceRule[], used: ReadonlySet<string>): string[]`（当たらなかった規則を `file:line key` で返す）
  - `startRuleUsage(page): Promise<RuleUsageSession>` / `stopRuleUsage(session): Promise<string[]>`（当たった規則の鍵）
  - 書き出し `out/<キー>/usage.json` = `{ generation: string; used: string[] }`
- Consumes: `repoGeneration`（Task 1）・`parity.usage.config.ts`（Task 2）

**分母**: `git ls-files 'apps/timer-web/src/styles/*.css'` のうち `base.css` を除いたもの（PR 1 で移しただけ・正本 §5.5 の対象外。PR 4 の `reset.css` も対象外）。`@keyframes` の中の段は除く（キーフレームは別に突き合わせている）。

- [ ] **Step 1: 純関数のテストを書く**

`e2e/tests/usage-summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import { ruleKey, rulesInBuiltCss, sourceRules, usageProblems } from '../parity/usage-summary';

const first = (css: string) => {
  let found: postcss.Rule | undefined;
  postcss.parse(css).walkRules((r) => { found ??= r; });
  if (found === undefined) throw new Error('規則が無い');
  return found;
};

describe('ruleKey', () => {
  it('Given @media の中の規則 / Then at-rule とセレクタで鍵を作る', () => {
    expect(ruleKey(first('@media (width >= 40rem) { .a  >  .b { color: red } }'))).toBe('@media (width >= 40rem)\u0000.a > .b');
  });
  it('Given @layer timer の囲い / Then @layer を鍵に入れない（ソースには囲いが無い）', () => {
    expect(ruleKey(first('@layer timer { @media (hover: hover) { .a:hover { color: red } } }'))).toBe('@media (hover: hover)\u0000.a:hover');
  });
  it('Given 複数のセレクタ / Then カンマの前後の空白を畳む', () => {
    expect(ruleKey(first('.a ,\n .b { color: red }'))).toBe('.a,.b');
  });
});

describe('sourceRules', () => {
  it('Given @keyframes の段 / Then 分母に入れない', () => {
    const rules = sourceRules([{ path: 'x.css', css: '.a { color: red }\n@keyframes k { 50% { opacity: .5 } }' }]);
    expect(rules.map((r) => r.key)).toEqual(['.a']);
  });
  it('Given 2 つのファイルに同じ鍵 / Then 止める（鍵で突き合わせられない）', () => {
    expect(() => sourceRules([{ path: 'x.css', css: '.a { color: red }' }, { path: 'y.css', css: '.a { margin: 0 }' }])).toThrow(/x\.css.*y\.css|重複/);
  });
});

describe('rulesInBuiltCss と usageProblems', () => {
  it('Given ビルドの CSS / Then 鍵ごとの出現回数を返す', () => {
    const built = '@layer timer { .a { color: red } }\n.a { margin: 0 }\n@media (width >= 40rem) { @layer timer { .b { color: red } } }';
    expect(Object.fromEntries(rulesInBuiltCss(built))).toEqual({ '.a': 2, '@media (width >= 40rem)\u0000.b': 1 });
  });
  it('Given 当たらなかった規則 / Then 場所つきで返す', () => {
    const source = [{ key: '.a', file: 'x.css', line: 1 }, { key: '.b', file: 'x.css', line: 2 }];
    expect(usageProblems(source, new Set(['.a']))).toEqual(['x.css:2 .b']);
  });
  it('Given 当たりが空 / Then 全件を返す（空振りを緑にしない）', () => {
    expect(usageProblems([{ key: '.a', file: 'x.css', line: 1 }], new Set())).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 赤を見る**

```bash
cd /workspaces/claym/local/Tasuki/e2e && pnpm exec vitest run tests/usage-summary.test.ts
```

Expected: FAIL（`usage-summary.ts` が無い）

- [ ] **Step 3: `usage-summary.ts` を書く**

上の Interfaces のとおりに書く。要点:
- `ruleKey` は `rule.parent` を根まで辿り、`atrule` で `name !== 'layer'` のものだけを外側から並べる。`params` と `selector` は、空白の並びを 1 つの空白に畳み（`replace(/\s+/g, ' ')`）、`,` の前後の空白だけを消す（`replace(/\s*,\s*/g, ',')`）。結合子（`>` など）の前後は空白 1 つのまま残る（テストの期待値 `.a > .b`）。前後の空白は `trim()` する
- `sourceRules` は `@keyframes`（名前が `keyframes` で終わる at-rule）の中を除き、鍵が重複したら両方の `file:line` を入れて throw する
- `rulesInBuiltCss` は同じ `ruleKey` で数える
- **ファイルの I/O を持たない**（読み込みは呼び出し側）。ソースのファイルの列挙は `listUsageSources(repoRoot)` として同じファイルに置き、`git ls-files` で引いて `base.css` と `reset.css` を除く

- [ ] **Step 4: 緑を見る**

```bash
cd /workspaces/claym/local/Tasuki/e2e && pnpm exec vitest run tests/usage-summary.test.ts
```

Expected: PASS

- [ ] **Step 5: CDP で当たった規則を取る `usage.ts` を書く**

```ts
/**
 * 規則の使用状況（E8・#321・設計正本 §5.5・計画 P4）。ブランチの側のページで CDP の規則の使用状況を取り、当たった規則の鍵を返す。
 * 返るのは**当たった規則だけ**なので、分母はソースから数える（`usage-summary.ts`）。「当たった」はセレクタが一致したことで、
 * 宣言が勝ったことではない（効いているかは比較と除去検査が見る）。
 */
import postcss from 'postcss';
import type { CDPSession, Page } from '@playwright/test';
import { ruleKey } from './usage-summary';

export interface RuleUsageSession {
  readonly cdp: CDPSession;
  readonly sheets: Map<string, string>;
}

export async function startRuleUsage(page: Page): Promise<RuleUsageSession> {
  const cdp = await page.context().newCDPSession(page);
  const sheets = new Map<string, string>();
  cdp.on('CSS.styleSheetAdded', (e: { header: { styleSheetId: string } }) => sheets.set(e.header.styleSheetId, ''));
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  await cdp.send('CSS.startRuleUsageTracking');
  return { cdp, sheets };
}

/** 当たった規則の鍵（重複なし・整列）。 */
export async function stopRuleUsage(session: RuleUsageSession): Promise<string[]> {
  const { ruleUsage } = (await session.cdp.send('CSS.stopRuleUsageTracking')) as {
    ruleUsage: { styleSheetId: string; startOffset: number; endOffset: number; used: boolean }[];
  };
  const keys = new Set<string>();
  const parsed = new Map<string, postcss.Root>();
  for (const u of ruleUsage) {
    if (!u.used) continue;
    let root = parsed.get(u.styleSheetId);
    if (root === undefined) {
      const { text } = (await session.cdp.send('CSS.getStyleSheetText', { styleSheetId: u.styleSheetId })) as { text: string };
      root = postcss.parse(text);
      parsed.set(u.styleSheetId, root);
    }
    // 規則の始まりのオフセットで引く。セレクタの先頭か宣言ブロックの先頭のどちらかに当たる（Step 6 で実測して片方に決める）
    root.walkRules((rule) => {
      const start = rule.source?.start?.offset;
      const end = rule.source?.end?.offset;
      if (start !== undefined && end !== undefined && start <= u.startOffset && u.startOffset <= end) keys.add(ruleKey(rule));
    });
  }
  await session.cdp.detach();
  return [...keys].sort();
}
```

`walkRules` で包含を見ると、入れ子の外側の規則まで拾う可能性がある（CSS の入れ子を使っていないので、いまの timer の CSS では起きないはず）。Step 6 の実測で、`u.startOffset` が `rule.source.start.offset` と一致するかを確かめ、一致するなら等号での引き当てに変える。

- [ ] **Step 6: 実測で引き当てを確かめる（コミットしない一時スクリプト）**

最小化しないビルドを作り、ハーネスなしの素のページで確かめる:

```bash
cd /workspaces/claym/local/Tasuki
TASUKI_TIMER_CSS_UNMINIFIED=1 pnpm exec turbo run build --filter @tasuki/timer-web
```

scratchpad に、Playwright の `chromium.launch()` で `about:blank` に `<style>` を 1 枚置き（`.a{color:red}\n@media (width >= 1px){.b{color:blue}}` と、当たる `<div class="a b">`）、`startRuleUsage` → `stopRuleUsage` の結果が `['.a', '@media (width >= 1px)\u0000.b']` になることを確かめるスクリプトを書いて流す。結果に合わせて Step 5 の引き当てを等号か包含のどちらかに決め、注釈の「Step 6 で実測して」を実測の結果に書き換える。

- [ ] **Step 7: 比較の本体に書き出しを足す**

`timer.parity.ts`:
- `const USAGE = …` を各テストの中で `testInfo.config.metadata['parityUsage'] === true` から決め、project の名前が `規則の使用状況` と食い違えば止める（`isControlRun` と同じ流儀）
- `captureSide` に第 4 引数 `usage: boolean` を足す。**ブランチの側で `usage` が真のときだけ**、目印が見えた直後に `startRuleUsage(page)`、操作の書き出しの後に `stopRuleUsage` を呼び、`Capture` に `used?: string[]` を持たせる。タッチの `captureTouchSide` も同じ
- 書き出しの置き場に `usage.json`（`{ generation: GENERATION, used }`）を書く

- [ ] **Step 8: 照合のゲートを足す**

`e2e/tests/usage-summary.test.ts` の末尾に、除去検査の既知の答えと同じ流儀で、環境変数 `TASUKI_PARITY_USAGE_CHECK=1` のときだけ走る照合を足す:

```ts
describe.runIf(process.env['TASUKI_PARITY_USAGE_CHECK'] === '1')('E8: 足した規則はどれも 1 回以上当たる', () => {
  it('全状態の usage.json を束ね、分母の全規則が当たっている', () => {
    const result = collectUsage(); // usage-summary.ts に置く: out/<キー>/usage.json を目録のキーで全部読む（欠ければ throw・世代が揃わなければ throw）
    const source = sourceRules(listUsageSources(REPO_ROOT));
    expect(source.length, '分母が空（ソースの CSS を 1 つも読めていない）').toBeGreaterThan(0);
    const built = rulesInBuiltCss(readBuiltTimerCss(REPO_ROOT)); // dist/assets/index-*.css を読む（1 本でなければ throw）
    expect(source.filter((r) => built.get(r.key) !== 1).map((r) => `${r.file}:${r.line} ${r.key} → ${built.get(r.key) ?? 0} 回`), '分母の鍵がビルドの CSS にちょうど 1 回ずつ現れない').toEqual([]);
    expect(usageProblems(source, result.used)).toEqual([]);
  });
});
```

`collectUsage` の「目録のキー」は、`expected/base-summary.json` のキー（状態とタッチ）を使う（`states.ts` を import すると Playwright を読み込むので避ける）。`readBuiltTimerCss` は `TASUKI_TIMER_CSS_UNMINIFIED=1` でビルドした dist を読む前提で、最小化されていたら（行数が 100 未満なら）「最小化しないビルドではない」と止める。

- [ ] **Step 9: 緑を見る（純関数）と、ゲートの空振りを見る**

```bash
cd /workspaces/claym/local/Tasuki/e2e
pnpm exec vitest run tests/usage-summary.test.ts
TASUKI_PARITY_USAGE_CHECK=1 pnpm exec vitest run tests/usage-summary.test.ts; echo "exit=$?"
pnpm exec tsc --noEmit -p tsconfig.json && pnpm run lint
```

Expected: 1 本目は PASS（ゲートは skip）。2 本目は**赤**（この時点では `src/styles/` に `base.css` しか無く分母が 0 件なので、「分母が空」で落ちる。空振りを緑にしないことの確かめ）。型検査と lint は通る

- [ ] **Step 10: README の「規則の使用状況（E8）」の節を仕上げる**

流し方（`-c parity/parity.usage.config.ts` を全件）→ `TASUKI_PARITY_USAGE_CHECK=1 pnpm exec vitest run tests/usage-summary.test.ts` の順、当たらなかった規則の扱い（「撮っていない状態」なら目録に状態を足す・「死んだ CSS」なら規則を消す・作れない状態は利用者に報告）、分母の定義（`base.css` と `reset.css` を除く）を書く。

- [ ] **Step 11: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add e2e/parity e2e/tests
git commit -m "feat: 足した CSS の規則が実行中に当たるかを測る（E8・#321 PR 2）

- 当たった規則を CDP の規則の使用状況から取り、@layer を除いた at-rule とセレクタの鍵でソースと突き合わせる
- 分母はソースの CSS（base.css を除く）から数え、鍵がビルドの CSS にちょうど 1 回ずつ現れることを断定する
- 照合は TASUKI_PARITY_USAGE_CHECK=1 のときだけ走る（分母が空なら赤）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

E8 の破壊検証（当たらない規則を 1 本足して赤を見る・正本 §5.6 の 5 つ目）は、分母ができた後の Task 13 で行う。

---

### Task 4: 除去検査を取り直す

**実装役: 統括（Opus）が流す**（約 26 分。サブエージェントに渡さない）

**Files:** なし（出力は `e2e/parity/out/removal/`・無視している）

- [ ] **Step 1: clean を確かめて流す**

```bash
cd /workspaces/claym/local/Tasuki && git status --porcelain
```

Expected: 出力なし（世代が `-dirty` にならないように）。次を `run_in_background` で起動し、完了の通知を待つ:

```bash
cd /workspaces/claym/local/Tasuki/e2e && rm -rf parity/out/removal && \
TASUKI_E2E_TARGET=local \
TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist \
pnpm exec playwright test -c parity/parity.removal.config.ts > ~/.cache/tasuki-parity/pr2-removal.log 2>&1; echo "exit=$?" >> ~/.cache/tasuki-parity/pr2-removal.log
```

Expected: 26 状態がすべて通る。`ss -tlnp | grep -E ':(8787|18080)\b'` が空

- [ ] **Step 2: 既知の答えと世代を確かめる**

```bash
cd /workspaces/claym/local/Tasuki/e2e
TASUKI_PARITY_REMOVAL_CHECK=1 pnpm exec vitest run tests/removal-summary.test.ts --reporter=verbose
```

Expected: 既知の答え 5 行とも `OK`。`loadRemovalProbe` が世代の揃いで止まらない。dead・alive・undecided の延べが PR 1 の台帳の値と同じなら、そのことを控える（違えば理由を調べて統括のメモに書く。基準が固定なので本来は変わらない）

コミットはしない（Task 6 以降は、この出力を `loadRemovalProbe` を通して読む）。

---

### Task 5: 在室の点を `data-presence` で塗り分ける（テストが先）

**実装役: Sonnet**

**Files:**
- Modify: `apps/timer-web/src/ui/components/PresenceDot.tsx`
- Modify: `apps/timer-web/src/ui/presence.ts`（`presenceDotClass`・`presenceTextClass` を消す）
- Create: `apps/timer-web/src/styles/presence-dot.css`
- Modify: `apps/timer-web/src/index.css`（`@import` を足す）
- Modify: `scripts/audit-timer-classes.mjs`（`UNMIGRATED` から 2 本を消す）
- Test: `apps/timer-web/test/ui/components/PresenceDot.test.tsx`・`presence.ts` のテスト（あれば）・`e2e/specs/timer.spec.ts`

**Interfaces:**
- Produces: `.presence-dot` と `data-presence="online" | "idle" | "offline"`。`presence.ts` は `presenceLabel` と `Presence` 型だけを持つ
- Consumes: `--color-presence-online` / `--color-presence-idle` / `--color-presence-offline`（既存のトークン。`tailwind.config.js` の `presence-*` が指しているもの）

- [ ] **Step 1: 単体テストを属性の形に書き直す（赤）**

`PresenceDot.test.tsx` の「状態に対応するクラスを持つドット」のテストを次にする（**期待値を実装の関数から作らない**・正本 D10）。import から `presenceDotClass` を消す:

```tsx
    cases.forEach((presence) => {
      it(`presence が ${presence} のとき、data-presence に ${presence} を持つ点が描画される`, () => {
        // Given
        const { container } = render(<PresenceDot presence={presence} />);
        // When
        const dot = container.querySelector("span");
        // Then
        expect(dot?.getAttribute("data-presence")).toBe(presence);
        expect(dot?.classList.contains("presence-dot")).toBe(true);
      });
    });
```

`presence.ts` を直接テストしているファイルがあれば（`grep -rln "presenceDotClass\|presenceTextClass" apps/timer-web/test`）、クラスの関数のテストを消し、`presenceLabel` のテストは残す。

```bash
cd /workspaces/claym/local/Tasuki && pnpm --filter @tasuki/timer-web exec vitest run test/ui/components/PresenceDot.test.tsx
```

Expected: FAIL（`data-presence` が無い）

- [ ] **Step 2: E2E を書く（赤）**

`e2e/specs/timer.spec.ts` の、ホストとゲストがロビーに揃う既存の `describe` の中に足す（**新しいタグを足さない**。既存のヘルパ（ルームを作る・ゲストを入れる）をそのまま使う）:

```ts
  test('Given ホストとゲストのロビー / When 在室の点を読む / Then 状態ごとにトークンの色で塗られる', async ({ browser }) => {
    // （既存のヘルパでホストのページとゲストを用意する。名簿にゲストの行が出るまで待つ）
    const dot = host.locator('[data-presence]').first();
    await expect(dot).toHaveAttribute('data-presence', 'online');
    // idle（離席）は代入する経路が無く状態を作れない（設計正本 §2 の 13）。描画済みの点の属性を書き換え、CSS の対応だけを測る
    const colors = await dot.evaluate((el) => {
      const resolve = (name: string): string => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = `var(${name})`;
        document.body.append(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      };
      const read = (presence: string): string => {
        el.setAttribute('data-presence', presence);
        return getComputedStyle(el).backgroundColor;
      };
      const out = {
        online: { want: resolve('--color-presence-online'), got: read('online') },
        idle: { want: resolve('--color-presence-idle'), got: read('idle') },
        offline: { want: resolve('--color-presence-offline'), got: read('offline') },
      };
      el.setAttribute('data-presence', 'online');
      return out;
    });
    // 3 色が互いに違うことを先に断定する（同じなら、取り違えても緑になる）
    expect(new Set([colors.online.want, colors.idle.want, colors.offline.want]).size).toBe(3);
    expect(colors.online.got).toBe(colors.online.want);
    expect(colors.idle.got).toBe(colors.idle.want);
    expect(colors.offline.got).toBe(colors.offline.want);
  });
```

`e2e/specs` のタイトルの流儀（Given / When / Then・タグの埋め込み）は、同じファイルの隣のテストに合わせる。

```bash
cd /workspaces/claym/local/Tasuki && pnpm e2e -- -g '在室の点を読む'
```

Expected: FAIL（`[data-presence]` が無い）。**赤の理由がそれだけであること**を読む

- [ ] **Step 3: 実装する**

`apps/timer-web/src/styles/presence-dot.css`:

```css
/* 在室の点（`PresenceDot.tsx`・#321）。状態は `data-presence` 属性で塗り分ける（色だけで伝えず、隣に文字のラベルがある）。
 * Tailwind の `h-2 w-2 shrink-0 rounded-full bg-presence-*` の写し。 */
.presence-dot {
  width: 0.5rem;
  height: 0.5rem;
  flex-shrink: 0;
  border-radius: calc(infinity * 1px);
}

.presence-dot[data-presence='online'] {
  background-color: var(--color-presence-online);
}

.presence-dot[data-presence='idle'] {
  background-color: var(--color-presence-idle);
}

.presence-dot[data-presence='offline'] {
  background-color: var(--color-presence-offline);
}
```

`PresenceDot.tsx` の `span` を次にし、`presenceDotClass` の import と、冒頭の注釈の `presenceDotClass()` の説明を「状態は `data-presence` 属性で渡し、色は `styles/presence-dot.css` が塗る（#321）」に書き換える:

```tsx
    <span className="presence-dot" data-presence={presence} aria-hidden="true" />
```

`presence.ts` から `presenceDotClass` と `presenceTextClass` を消す（`presenceLabel` と型は残す）。`src/index.css` の `@import './styles/base.css';` の次に `@import './styles/presence-dot.css' layer(timer);` を足す。`scripts/audit-timer-classes.mjs` の `UNMIGRATED` から `presence.ts` と `PresenceDot.tsx` を消す。

- [ ] **Step 4: 緑を見る**

```bash
cd /workspaces/claym/local/Tasuki
pnpm --filter @tasuki/timer-web exec vitest run test/ui/components/PresenceDot.test.tsx
pnpm e2e -- -g '在室の点を読む'
node scripts/audit-timer-classes.mjs
```

Expected: すべて PASS

- [ ] **Step 5: 破壊検証（コミットしない）**

コミットの前に、`presence-dot.css` だけを次の 2 通りで壊し、E2E が赤になることを見て戻す（`git diff --stat` で壊したのがそのファイルだけであることを見る）:
1. `idle` と `offline` の色を入れ替える → idle と offline の断定が赤
2. `.presence-dot[data-presence='online']` の規則を消す → online の断定が赤

- [ ] **Step 6: 移植の手順の M7・M8 を回す**

在室の点が描かれる状態（ロビーの名簿・セッションの名簿）を `-g` で選んで比べる。

- [ ] **Step 7: コミット**

```bash
git add apps/timer-web e2e/specs/timer.spec.ts scripts/audit-timer-classes.mjs
git commit -m "refactor: 在室の点を data-presence 属性と素の CSS で塗り分ける（#321 PR 2）

- PresenceDot は presence-dot のクラスと data-presence 属性を持ち、色は styles/presence-dot.css が塗る
- presence.ts からクラス名を返す関数を消す（presenceTextClass は使い手が無かった）
- 3 状態がそれぞれトークンの色で塗られることを E2E で測る（idle は属性の書き換えで測る）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: primitives を移し、呼び出し側の上書きを整える

**実装役: Sonnet**

**Files:**
- Create: `apps/timer-web/src/styles/primitives.css`
- Modify: `apps/timer-web/src/ui/primitives.tsx`（`IconButton` を消す・`SectionHeader` の `color` を消す）
- Modify: primitives の呼び出し側すべて（dead の上書きを消す・範囲を狭める・`SectionHeader` の `color` を消す）。PR 3 のファイル（`Session.tsx`・`EndSessionZone.tsx`・`SelfDriverToggle.tsx`・`SharedMemo.tsx`・`RosterPanel.tsx`）も、この目的の行だけ触る
- Modify: `packages/ui/src/tokens/shape.css`・`packages/ui/README.md`（`--shadow-panel`）
- Modify: `apps/timer-web/src/index.css`・`scripts/audit-timer-classes.mjs`（`UNMIGRATED` から `primitives.tsx` を消す）

**Interfaces:**
- Produces: クラス `.stage`・`.stage-inner`・`.meter-panel`・`.corner-tick`（と位置の `.corner-tick-tl` / `-tr` / `-bl` / `-br`）・`.signal-button`・`.ghost-button`・`.section-header`・`.section-header-lead`・`.section-header-icon`・`.section-header-title`。`SectionHeader` の props は `{ icon; title; right? }`。トークン `--shadow-panel`
- Consumes: Task 4 の除去検査

- [ ] **Step 1: 呼び出し側の上書きを引く**

primitives の根の語ごとに「除去検査の読み方」を当てる: `PrimaryButton` は `px-6`、`GhostButton` は `min-h-[44px]`、`Card` は `p-6`。出力をファイルに控え、呼び出し側の `className` の字面と突き合わせる（`grep -rn -A3 -E '<(Card|GhostButton|PrimaryButton)\b' apps/timer-web/src`）。

- [ ] **Step 2: dead の上書きを消す**

dead の token を呼び出し側の `className` から消す。消した組を `~/.cache/tasuki-parity/pr2-dead.tsv` に足す。**この時点では primitives はまだ Tailwind なので、見た目は変わらない**。M7 で primitives の使い手のいる状態を比べ、差 0 を確かめてコミットする:

```bash
git commit -am "refactor: primitives の呼び出し側から効いていない上書きを消す（#321 PR 2）

基準の除去検査で dead と判定した上書きだけを消す（見た目は変わらない。一覧は台帳）。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: 一部の幅でだけ効く上書きを、その幅に絞る**

alive で `widths` が一部の幅だけの token を、P7 の形に直す。例: `Summary.tsx` の `<Card className="p-3 sm:p-4">` は、`p-3` が dead（Step 2 で消える）、`sm:p-4` が 640px だけで alive なので `sm:max-md:p-4` にする（Summary は Task 10 で素の CSS に移すが、ここでは Tailwind のまま範囲を絞る）。M7 で差 0 を確かめてコミットする。

- [ ] **Step 4: `primitives.css` を書く**

```css
/* 計器 UI の共通プリミティブ（`primitives.tsx`・#321）。Tailwind のユーティリティの写し。
 * 値は基準（`ba9249d`）の計算済みスタイルと比較で確かめる（設計正本 D2）。
 * `focus-visible:outline-none` は写さない（レイヤー外のグローバルな `:focus-visible` に負けて、いまも効いていない・設計正本 §2 の 5）。 */

/* 舞台。地は `base.css` の `.instrument-stage`。 */
.stage {
  color: var(--bone);
}

.stage-inner {
  position: relative;
  max-width: 72rem;
  margin-inline: auto;
  padding-inline: 1rem;
  padding-block: 2.5rem;
}

@media (width >= 48rem) {
  .stage-inner {
    padding-block: 3rem;
  }
}

/* 計器パネル。ヘアライン枠＋四隅ティック＋上端の僅かな立ち上がり。 */
.meter-panel {
  position: relative;
  border-radius: var(--radius-lg);
  border-width: 1px;
  border-color: var(--hairline);
  background-color: var(--panel);
  padding: 1.5rem;
  box-shadow: inset 0 1px 0 var(--inset-highlight), var(--shadow-panel);
}

@media (width >= 48rem) {
  .meter-panel {
    padding: 1.75rem;
  }
}

/* 四隅のティック。枠の色は 4 辺すべてに塗る（Tailwind の `border-[…]` と同じ）。 */
.corner-tick {
  pointer-events: none;
  position: absolute;
  width: 0.625rem;
  height: 0.625rem;
  border-color: var(--hairline-strong);
}

.corner-tick-tl {
  left: 0.5rem;
  top: 0.5rem;
  border-left-width: 1px;
  border-top-width: 1px;
}

.corner-tick-tr {
  right: 0.5rem;
  top: 0.5rem;
  border-right-width: 1px;
  border-top-width: 1px;
}

.corner-tick-bl {
  left: 0.5rem;
  bottom: 0.5rem;
  border-left-width: 1px;
  border-bottom-width: 1px;
}

.corner-tick-br {
  right: 0.5rem;
  bottom: 0.5rem;
  border-right-width: 1px;
  border-bottom-width: 1px;
}

/* 主操作（シグナル朱）。 */
.signal-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: 1.5rem;
  padding-block: 0.75rem;
  border-radius: var(--radius-md);
  font-weight: 700;
  letter-spacing: 0.025em;
  color: var(--on-signal);
  background-color: var(--signal);
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
  box-shadow: 0 0 0 1px var(--signal-edge), 0 6px 20px var(--signal-glow);
}

@media (hover: hover) {
  .signal-button:hover {
    background-color: var(--signal-hover);
  }
}

.signal-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.signal-button:active {
  scale: 95% 95%;
}

/* ring-offset → ring → 自前の影の順に合成する（Tailwind の `box-shadow` の並び） */
.signal-button:focus-visible {
  box-shadow:
    0 0 0 2px var(--ink),
    0 0 0 4px var(--signal),
    0 0 0 1px var(--signal-edge),
    0 6px 20px var(--signal-glow);
}

/* 副操作（スチール枠のゴースト）。 */
.ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: 1rem;
  padding-block: 0.5rem;
  min-height: 44px;
  border-radius: var(--radius-md);
  font-weight: 500;
  color: var(--bone);
  background-color: var(--panel-2);
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
  border-width: 1px;
  border-color: var(--hairline-strong);
}

@media (width >= 40rem) {
  .ghost-button {
    min-height: 0;
  }
}

@media (hover: hover) {
  .ghost-button:hover {
    background-color: var(--panel-hover);
  }
}

.ghost-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ghost-button:active {
  scale: 95% 95%;
}

.ghost-button:focus-visible {
  box-shadow: 0 0 0 2px var(--ink), 0 0 0 4px var(--signal);
}

/* カード見出し。 */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.section-header-lead {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.section-header-icon {
  width: 1rem;
  height: 1rem;
  color: var(--signal);
}

.section-header-title {
  font-weight: 700;
  font-size: 1rem; /* scale-exempt: Tailwind の text-base の写し（#316 で段へ寄せる） */
  line-height: 1.5;
  letter-spacing: 0.025em;
  color: var(--bone);
}
```

`packages/ui/src/tokens/shape.css` の `--shadow-popover` の次に `--shadow-panel: 0 10px 30px rgba(0, 0, 0, 0.5); /* 計器パネルの落ち影（timer） */` を足す。`packages/ui/README.md` の表の `| \`--shadow-card\` / \`--shadow-popover\` | 影 |` を `| \`--shadow-card\` / \`--shadow-popover\` / \`--shadow-panel\` | 影 |` にする。`packages/ui` のトークンのテスト（`pnpm --filter @tasuki/ui test`）を回す。

- [ ] **Step 5: `primitives.tsx` を書き換える**

- `Stage`: `<div className="instrument-stage stage"><div className="stage-inner">`。注釈の「`max-w-md` 等を維持」は「Summary・History は内側で最大幅を持つ」にする
- `CornerTicks`: `base`・`c` の変数をやめ、4 つの `<span className="corner-tick corner-tick-tl" aria-hidden="true" />` など字面で書く
- `Card`: `className={\`meter-panel ${className}\`}`（部品の受け渡しは `className` を置換に持つテンプレートとして許されている）
- `PrimaryButton`: `className={\`signal-button ${className}\`}`、`GhostButton`: `className={\`ghost-button ${className}\`}`
- `IconButton` を消す（`grep -rn IconButton apps/timer-web` が 0 件になること）
- `SectionHeader`: `color` を props と型から消し、`<div className="section-header"><div className="section-header-lead"><Icon className="section-header-icon" /><h2 className="section-header-title">`
- 呼び出し 6 か所の `color="text-[var(--signal)]"` を消す（`RosterPanel.tsx` を含む）

`src/index.css` に `@import './styles/primitives.css' layer(timer);` を、`presence-dot.css` より**前**に足す（並びは primitives → 部品 → 画面）。`UNMIGRATED` から `primitives.tsx` を消す。

- [ ] **Step 6: 比べる**

primitives は全画面で使われるので、目録の**全状態**を流す（M7 の `-g` を付けずに。約 27 分。`run_in_background`）。差が出たら、まず呼び出し側の上書き（P7）と、同じ要素の Tailwind の `box-shadow`・変形を疑う。

- [ ] **Step 7: M8 とコミット**

```bash
git add apps/timer-web packages/ui scripts/audit-timer-classes.mjs
git commit -m "refactor: timer の primitives を素の CSS へ移す（#321 PR 2）

- Stage・Card・PrimaryButton・GhostButton・SectionHeader を styles/primitives.css（@layer timer）へ移す
- 呼び出しの無い IconButton を消し、SectionHeader の color（値は 1 種類だった）を消す
- Card の落ち影を --shadow-panel としてトークン層に足す

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: ステータスの帯と通知設定

**実装役: Sonnet**

**Files:** `ui/components/StatusStrip.tsx`・`NotifySettings.tsx`・`NotifySettingsPanel.tsx` → `styles/status-strip.css`・`styles/notify-settings.css`

ファイルごとの注意（移植の手順 M1〜M9 に従う）:
- `StatusStrip.tsx`: `CONNECTION_CONFIG` の `className` を、`CONNECTION_CLASS` という名前の `as const` の表（値は字面の意味のクラス名）に分ける。ラベルの表と混ぜない。`connection-status.ts` が `StatusStrip` から何を import しているかを確かめ、壊さない
- `NotifySettings.tsx`: `ring-2 ring-[var(--signal)]` と `shadow-lg` の合成は M4 の並びで 1 つの `box-shadow` にする。`shadow-lg` は `var(--shadow-popover)`
- `NotifySettingsPanel.tsx`: テンプレートの `className` 4 か所・条件 1 か所は、字面の分岐か `data-*` にする。`ui-select` を持つ要素の `flex-1`・`mt-1` は M3 の 4（`.ui-select` はレイヤー外で、同じプロパティを書けば部品層が勝つ。いまは衝突しないことを確かめる）。スイッチのつまみの `translate-*`・`scale-*` は個別のプロパティで写す。`transition`・`duration-*` は動きの比較が見る
- 比べる状態: ステータスの帯は全画面に出るので、`status-strip-lobby` と、通知設定を開いた状態（`grep -n "notify" e2e/parity/states.ts` で名前を引く）とセッションの状態を 1 つ

コミット: `refactor: ステータスの帯と通知設定を素の CSS へ移す（#321 PR 2）`

---

### Task 8: 読み込み・セッション喪失・アプリの枠

**実装役: Sonnet**

**Files:** `ui/Loading.tsx`・`ui/SessionLost.tsx`・`App.tsx` → `styles/loading.css`・`styles/session-lost.css`・`styles/app.css`（`App.tsx` の 2 か所が 1 規則で済むなら `app.css` を作らず、どこに置いたかを注釈に書く）

ファイルごとの注意:
- `Loading.tsx`: `CONNECTION_TONE` を `CONNECTION_TONE_CLASS`（`as const`・字面の意味のクラス名）にする。変異 m63（`m63-loading-hides-connection-state`）がこのファイルを文脈に持つ。書き換えた後に `git apply --check scripts/mutations/m63-*.patch` を当て、当たらなければ Task 13 で作り直す対象として控える。`animate-*` は動きの比較が見る
- `SessionLost.tsx`: `Card`・ボタンへの上書きは Task 6 で整えた後の形を移す。喪失画面の状態は `session-lost`
- `App.tsx`: テンプレートの `className` 1 か所を字面の形にする
- 比べる状態: `loading-*` の全状態（`grep -n "name: 'loading" e2e/parity/states.ts`）・`session-lost`

コミット: `refactor: 読み込みとセッション喪失の画面を素の CSS へ移す（#321 PR 2）`

---

### Task 9: 履歴

**実装役: Sonnet**

**Files:** `ui/History.tsx`・`ui/components/EmptyHint.tsx` → `styles/history.css`・`styles/empty-hint.css`

ファイルごとの注意:
- `History.tsx`: レスポンシブ 1 か所。変異 m102（`m102-history-delete-name-without-date`）が文脈に持つ。M6 の後に `git apply --check` を当てる
- `EmptyHint.tsx` は Lobby でも使う。履歴の空の状態とロビーの両方で比べる
- 比べる状態: 履歴の空・記録あり（`grep -n "name: 'history" e2e/parity/states.ts`）と、`EmptyHint` が出るロビーの状態

コミット: `refactor: 履歴の画面を素の CSS へ移す（#321 PR 2）`

---

### Task 10: まとめ

**実装役: Sonnet**

**Files:** `ui/Summary.tsx` → `styles/summary.css`

ファイルごとの注意:
- `space-y-*` 1 か所（M4 の `:where()` の形）・レスポンシブ 6 か所
- `<Card className="sm:max-md:p-4">`（Task 6 の Step 3 で絞った形）を、`summary.css` の `@media (40rem <= width < 48rem) { .summary-… { padding: 1rem; } }` にする。**`.meter-panel` より詳細度が同じで後に読まれる**ことで勝つ（`@import` の並びが primitives → 画面）
- 所要時間の値はマスクされている（台帳の表）。スタイルの比較で見る
- 比べる状態: `summary-*` の全状態

コミット: `refactor: まとめの画面を素の CSS へ移す（#321 PR 2）`

---

### Task 11: ロビーとセッションで共有する部品

**実装役: Sonnet**

**Files:** `ui/components/InvitePanel.tsx`・`PassphrasePanel.tsx`・`TopicCard.tsx`・`Markdown.tsx`・`ConfirmDialog.tsx`・`SessionConfigPanel.tsx` → 部品ごとの CSS（`invite-panel.css`・`passphrase-panel.css`・`topic-card.css`・`markdown.css`・`confirm-dialog.css`・`session-config-panel.css`）。`packages/ui/src/tokens/shape.css`・`packages/ui/README.md`（`--shadow-dialog`）

ファイルごとの注意:
- `InvitePanel.tsx`: QR の `h-52 w-52` は**組で効いている**（台帳。片方ずつ外すと dead に見える）。両方写す。QR の白地は `/* ui-exempt: QR は明暗で読むので地は白でなければならない */` を規則の直前に付けて生の色で書く。QR の出現は `waitForInviteQr` が待つ
- `PassphrasePanel.tsx`: フォーカスの `ring` の合成・状態の変種 5 か所
- `Markdown.tsx`: `HEADING_CLASS` を `as const` の字面の表にする（キーは見出しの段）。`space-y-*` 3 か所。条件の `className` 1 か所は字面の分岐にする。共有メモ（Session）とお題の札の両方に出るので、セッションの状態でも比べる
- `ConfirmDialog.tsx`: 確認の主ボタンの `shadow-[…signal…]`・危険のボタンの `shadow-[0_4px_16px_var(--urgent-veil)] ring-1 ring-[var(--urgent-edge)]`（合成は `0 0 0 1px var(--urgent-edge), 0 4px 16px var(--urgent-veil)`）・ダイアログの `shadow-[inset_0_1px_0_var(--inset-highlight),0_20px_50px_rgba(0,0,0,0.6)]` は `inset 0 1px 0 var(--inset-highlight), var(--shadow-dialog)` にし、`--shadow-dialog: 0 20px 50px rgba(0, 0, 0, 0.6);` を `shape.css` と README の表（`--shadow-panel` の隣）に足す。`scale` の変形・状態の変種 13 か所。**#336 で直した `useFocusTrap` の振る舞いに触れない**（`className` だけを変える）。`ConfirmDialog` は `UNMIGRATED` に載っていない `RemovalConfirmDialog` と、PR 3 の `EndSessionZone` から使われる
- `SessionConfigPanel.tsx`: `space-y-*` 2 か所・主ボタンの影・`ring`
- 比べる状態: ロビーの全状態・確認ダイアログの状態（`grep -n "confirm" e2e/parity/states.ts`）・共有メモの状態

コミット: `refactor: ロビーとセッションで共有する部品を素の CSS へ移す（#321 PR 2）`

---

### Task 12: ロビー

**実装役: Sonnet**

**Files:** `ui/Lobby.tsx` → `styles/lobby.css`

ファイルごとの注意:
- 69 行目の自前のボタンの `ring-2 ring-[var(--signal)] ring-offset-2 ring-offset-[var(--ink)]`（合成は `0 0 0 2px var(--ink), 0 0 0 4px var(--signal)`）
- `space-y-*` 2 か所・状態の変種 8 か所・レスポンシブ 3 か所
- 輪の外のゲストの行の「ドライバーに加わる」（`PrimaryButton` に `text-xs px-3 py-1.5`）は、Task 6 で dead の上書きを消した後の形になっている。状態 `lobby-guest-outside` で比べる
- 比べる状態: `lobby-*` の全状態

コミット: `refactor: ロビーの画面を素の CSS へ移す（#321 PR 2）`

この時点で `UNMIGRATED` に残るのは、PR 3 のファイル（`Session.tsx` と、その子の部品）だけであることを確かめる:

```bash
cd /workspaces/claym/local/Tasuki && node -e "import('./scripts/audit-timer-classes.mjs').then(m => console.log(m.UNMIGRATED.join('\n')))"
```

Expected: `Session.tsx`・`CircularProgress.tsx`・`EndSessionZone.tsx`・`NotifyHint.tsx`・`RosterPanel.tsx`・`RotationLineup.tsx`・`SelfDriverToggle.tsx`・`SharedMemo.tsx`・`SwitchAlert.tsx`・`Tabs.tsx`・`TeamOrbit.tsx` の 11 本

---

### Task 13: 通しで確かめる

**実装役: 統括（Opus）が流す**（比較は合わせて約 2 時間。`run_in_background` で 1 本ずつ起動し、完了の通知を待つ）

**Files:** 必要に応じて変異パッチ（`scripts/mutations/`）

- [ ] **Step 1: 手元の検査を全部回す**

```bash
cd /workspaces/claym/local/Tasuki
git status --porcelain
pnpm test
bash -c 'node --test $(node scripts/list-scan-targets.mjs script-tests)'
node scripts/audit-timer-classes.mjs && node scripts/audit-ui-components.mjs
pnpm --filter @tasuki/e2e exec vitest run
pnpm e2e
```

Expected: すべて成功。`ss -tlnp | grep -E ':(8787|18080)\b'` が空

- [ ] **Step 2: 通常の比較・対照実行**

README の「流す」と「対照実行」を全件。Expected: どちらも全テスト緑（差 0・画素一致・期待値と一致）。期待値の JSON は変えない（目録を変えていなければ作り直さない）

- [ ] **Step 3: 囲いを外した一時ビルド**

起動の前に、変数を立てたビルドの CSS に `@layer timer` の囲いが無いことを確かめる:

```bash
cd /workspaces/claym/local/Tasuki
TASUKI_TIMER_UNLAYERED=1 pnpm exec turbo run build --filter @tasuki/timer-web
grep -c '@layer timer' apps/timer-web/dist/assets/index-*.css
```

Expected: `0`（順序宣言は `@layer theme,base,timer,…` の形なので `@layer timer` の字面を含まない。囲い `@layer timer{` が 1 つでもあれば外し損ねている）。続けて `-c parity/parity.unlayered.config.ts` で全件。差は、正本 D3 の既知の偽陽性の型（レイヤー外になった親の `:where(.x > :not(:last-child))` が、まだ Tailwind のままの子の margin に勝つ）だけを台帳に書き、それ以外は直して Step 2 からやり直す

- [ ] **Step 4: 規則の使用状況（E8）と破壊検証の 5 つ目**

`-c parity/parity.usage.config.ts` で全件 → `TASUKI_PARITY_USAGE_CHECK=1 pnpm exec vitest run tests/usage-summary.test.ts`。Expected: 緑（分母の全規則が当たっている）。当たらない規則は、撮っていない状態なら目録に状態を足し（期待値は README の手順で作り直す）、死んだ CSS なら消す。作れない状態は利用者に報告する。

破壊検証（コミットしない）: `git status --porcelain` が空であることを見てから、`primitives.css` の末尾に `.never-used-probe { color: var(--bone); }` を足し、`TASUKI_TIMER_CSS_UNMINIFIED=1` でビルドし直して、照合だけを流す（使用状況の書き出しは既存のものを使う）→ 赤（`never-used-probe` が当たらない）を見て戻す。

- [ ] **Step 5: 生の色とクラス名の検査の破壊検証（コミットしない）**

1. `lobby.css` の色の 1 か所を `#ff0000` にする → `node scripts/audit-ui-components.mjs` が赤（E5）→ 戻す
2. `Lobby.tsx` の 1 か所の `className` を Tailwind のクラス（`flex`）にする → `node scripts/audit-timer-classes.mjs` が赤（E6）→ 戻す
3. `Lobby.tsx` を `UNMIGRATED` に戻す → 「古い一覧」として赤 → 戻す

- [ ] **Step 6: 変異パッチ**

```bash
cd /workspaces/claym/local/Tasuki
bash -c 'for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NG $p"; done'
```

当たらないものは、元のパッチと**同じ壊し方**を新しい行に当てる形で作り直し、元と並べて弱まっていないことを読む（ID は変えない）。その後 `node scripts/mutation-check.mjs` を全件（`--help` を付けない。付けても全件が走る）。Expected: すべての変異が殺される。作り直したらコミットする:

```bash
git commit -am "test: PR 2 で当たらなくなった変異パッチを作り直す（#321）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 台帳・進み具合・PR・レビュー

**実装役: 統括（Opus）**

- [ ] **Step 1: 台帳の「PR 2」の節を埋める**

PR 1 の節と同じ項目で書く: ブランチの SHA と作業ツリーが clean だったか・比較の仕組みの SHA（`git log -1 --format=%H -- e2e/parity`）・4 設定の結果（緑の件数と所要時間。**状態ごとの数は写さず期待値の JSON を指す**）・対照実行・破壊検証（Task 1・3・5・13 の各回）・除去検査の取り直し（Task 4）・**消した dead の組**（`~/.cache/tasuki-parity/pr2-dead.tsv` を表にする。#316 への申し送りの一覧）・囲いを外した一時ビルドで残した既知の偽陽性・E8 の結果と、当たらなかった規則の扱い・E8 の測り方の逸脱（P4）と利用者の承認日・`RosterPanel.test.tsx` を PR 3 へ送ったこと（P6）。

- [ ] **Step 2: #321 の本文の「進み具合」を更新する**

PR 2 の行を `[x]` にして PR 番号を書く（PR を作った後）。本文の他の節は書き換えない。**書き込みの前に文案を利用者に見せる。**

- [ ] **Step 3: push して PR を作る**

```bash
cd /workspaces/claym/local/Tasuki
git push -u origin feature/issue-321-pr2-primitives-and-screens
gh pr create --title "refactor: timer の primitives と 5 画面から Tailwind を外す（#321 PR 2）" --body-file <scratchpad の本文>
```

本文は git-workflow の型（概要・変更内容・テスト方法）で、数は書かず台帳へのリンクだけを置く。末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。**閉鎖キーワードを書かない**（#321 は PR 4 で閉じる）。

- [ ] **Step 4: レビュー**

文脈を共有しない `/code-review` を **PR 番号を明示して**通す。指摘は採点が出てから直す（採点の途中で直さない）。直したら、触った状態を M7 で比べ直す。

- [ ] **Step 5: マージの前に利用者に確かめる**

CI の結果・台帳・レビューの結果を並べて報告し、マージの判断を仰ぐ。**配布はしない。**
