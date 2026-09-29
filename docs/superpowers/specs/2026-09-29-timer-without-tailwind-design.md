# timer から Tailwind を外し、素の CSS と `@tasuki/ui` で組む（#321）— 設計正本

- **Issue**: [#321](https://github.com/tomohiroJin/tasuki-tools/issues/321)
- **日付**: 2026-09-29　**実測時点**: main `ba9249d`
- **関連 Issue**: [#320](https://github.com/tomohiroJin/tasuki-tools/issues/320)（部品層・完了）/
  [#316](https://github.com/tomohiroJin/tasuki-tools/issues/316)（ボタンの形と段組みの段）/
  [#297](https://github.com/tomohiroJin/tasuki-tools/issues/297)（書体の `url()` が解決されなかった件）
- **前提となる ADR**: [`docs/adr/0001`](../../adr/0001-design-system-scope.md)（デザインシステムの層構造）/
  [`docs/adr/0002`](../../adr/0002-document-system-three-layers.md)（ADR の運用）/
  [`docs/adr/0022`](../../adr/0022-ui-components-layer.md)（部品層。決定 5 が ADR 0001 決定 1 を置き換えた）/
  [`docs/adr/0013`](../../adr/0013-pr-granularity.md)（PR の粒度）

**この文書の位置づけ**: 設計の正本はこの文書である。初版（`195a3c8`）を文脈を共有しない 4 観点の検証
（事実照合・CSS 設計・過去の失敗型・意図と規範）にかけ、指摘と利用者の判断（§1.2）を反映して書き直した。
検証役は実アプリのビルドと最小構成の実験で前提を実測している（§2 の【実測】）。

## 1. 目的と方針

### 1.1 目的

`apps/timer-web` だけが Tailwind を使っているため、デザインシステムに次の制約がかかっている（Issue 本文の背景）。

- 要素層を読まない理由が「Tailwind のユーティリティと部分的に上書きし合う」になっている（ADR 0001 決定 1 → ADR 0022 決定 5）
- トークン層を CSS の `@import` で読めず、`main.tsx` から JS で読んでいる（#297）
- 共通の部品を置くたびに、Tailwind のレイヤーとの勝ち負けを考える必要がある

timer を素の CSS と `@tasuki/ui`（トークン層・部品層）で組み直し、Tailwind・PostCSS・`autoprefixer` を依存から外す。

### 1.2 利用者の判断（2026-09-29）

| 論点 | 判断 |
|---|---|
| 見た目を変えないことを完了の条件にするか | **変えない。** 基準と並べて差分ゼロを目指す。出た差は一覧にして個別に承認を得る。部品層へ寄せて見た目が変わるもの（ボタンの形・段）は #316 に任せる |
| 要素層を timer に読ませるか | **この Issue では読ませない。** 読ませるかは #316 で判断し直す |
| 素の CSS の書き方 | **画面・部品ごとに意味のあるクラス名を付け、CSS は画面単位のファイルに分ける。** 自前のユーティリティ CSS・CSS Modules は採らない |
| PostCSS と `autoprefixer` | **まとめて外す**（他の 3 アプリと同じ構成にする） |
| 刻み方 | **移行中は新しい CSS を `@layer timer` に入れ、Tailwind のユーティリティより弱く置く。** 4 本の PR に刻む |
| #320 が #321 に預けた「timer の写し（入力欄・`Card`・招待・Markdown）を部品へ寄せる」 | **#316 へ送る。** #321 は見た目を変えずに移すことに徹する。#316 へ申し送り、#320 側の注釈の宛先を直す（D9） |
| 「無害」な差の扱い | **無害として扱う類を §5.4 に列挙し、その一覧をこの設計の承認で承認済みとする。** 一覧に無い差はすべて個別に承認を得る |
| 比べる基準 | **`ba9249d` に固定する。** 承認した差は 1 つの台帳に積む。PR 4 の最後に `ba9249d` との通しの比較を完了条件にする。比較の spec は `pnpm e2e` に数えられない場所にコミットし、通しの比較の後で消す |

### 1.3 範囲に入れないもの

- 見た目の変更。ボタンの形・大きさの段・最大幅・段組みの段、部品層への寄せ（入力欄 14px → 16px の iOS の自動拡大を含む）は #316
- 要素層を timer に読ませること（#316 で判断）
- main で**いま効いていない**宣言を効かせること（例: 主ボタンのフォーカスでアウトラインとリングが両方出ている件。§2 の 5）。直すなら #316
- 過去の記録（`docs/plans/`・`docs/superpowers/plans|specs/`・`docs/retrospectives/`）の Tailwind への言及。当時の事実なので書き換えない
- 本番への配布（利用者が決める）

## 2. 実測した事実（main `ba9249d`）

1. **依存**: `tailwindcss`・`@tailwindcss/postcss`（`^4.3.3`）・`autoprefixer`（`^10.4.20`）・`postcss`（`^8.5.25`）。いずれも `apps/timer-web` の devDependencies。`postcss` は vite 経由の推移依存とルートの devDependencies（ADR 0022 決定 7）にも居る
2. **量**: `apps/timer-web/src` の 29 ファイルに `className=` の行が 352 行。`sm:` 15・`md:` 8・`lg:` 8 か所（Issue 本文の `md:` 10 は `cmd:` の部分一致 2 件を含んでいた）。**クラス名は `className=` の行の外にもある** —— 表（`Loading.tsx` の `CONNECTION_TONE`・`Markdown.tsx` の `HEADING_CLASS`・`StatusStrip.tsx`・`presence.ts`）と props（`SectionHeader` の `color`）
3. **呼び出し側の上書き**: `primitives.tsx` の部品に `className` を渡している箇所は 32（`Card` 8・`GhostButton` 15・`PrimaryButton` 9。複数行の JSX を含む）
4. **Tailwind の出力の並び**【実測】: レイヤーは `properties, theme, base, components, utilities` の順に出る。**同じ詳細度のユーティリティ同士は、`className` に書いた順ではなく出力の並び順で勝ち負けが決まる。** そのため呼び出し側の上書きの一部は**いま効いていない**（例: `PrimaryButton` への `px-3 py-1.5`。`.px-6` が出力で後ろにあるので勝つ）
5. **レイヤーに入っていない規則が勝っている**【実測】: `index.css` の `:root`・`html`・`body`・`:focus-visible`・`.sr-only`・`.instrument-label`・`.tabular` などは、ビルド出力でもどのレイヤーにも入っていない。レイヤー外の規則はレイヤー内の規則に詳細度と無関係に勝つので、これらと衝突するユーティリティは**いま死んでいる**（`.instrument-label` と同じ要素の `text-[var(--signal)]` などの色・`text-[10px]`、`.tabular` と同じ要素の `tracking-*`、グローバルの `:focus-visible` と同じ要素の `focus-visible:outline-none` など）
6. **値は dist で解決済みではない**【実測】: `.rounded-xl{border-radius:var(--radius-xl)}`・`.gap-1\.5{gap:calc(var(--spacing) * 1.5)}` のように、Tailwind の theme 層にしか無い変数を参照している。`rounded-lg` はトークン層の `--radius-lg`（0.75rem）が Tailwind の既定に勝っている
7. **文字の大きさ**: Tailwind の `text-*` は固定の rem で、行の高さも同時に決める。トークンの 5 段（`--font-size-*`）は `clamp()` の可変値で、一致する段は無い。余白もトークン（`--space-*`）に無い段を使っている
8. **変種**【実測】: `hover:` は `@media (hover: hover)` で包まれて出る。境界は `@media (width>=40rem | 48rem | 64rem)`（rem）。`ring-*` と `shadow-*` は `--tw-*` を介して 1 つの `box-shadow` に合成される。`scale-*`・`rotate-*`・`translate-*` は `transform` ではなく個別のプロパティで出る。`space-y-*` は `:where(.x > :not(:last-child))` の詳細度 0 で `margin-block` を書く
9. **レイヤーの宣言の位置**【実測】: `@layer theme, base, timer, components, utilities;` を `@import 'tailwindcss'` の**前**に置くと、出力は `properties, theme, base, timer, components, utilities` の順になり、ユーティリティは 1 本も変わらない。**後**に置くと `timer` が `utilities` の後ろへ回る
10. **`@import` の位置**【実測】: `@config` の後に `@import './styles/…'` を書くと、Vite は警告を出すがビルドは成功し、**読み込んだはずの中身が出力から消える**。Tailwind が展開する `@import` の中の相対 `url()` は基準が付け替わらない（#297 と同じ）
11. **preflight**【実測】: Tailwind 4.3.3 の `preflight.css`（398 行・MIT）は `@layer base` に入っている。逐語で写すと `scripts/audit-ui-components.mjs` が 5 件落とす（入力欄の型を含むセレクタ）。`--theme()` 関数を使う宣言があり、素の CSS としては無効
12. **前置詞**【実測】: Vite 8 の CSS の最小化（lightningcss）が、Tailwind・autoprefixer 無しでも前置詞を付ける（`-webkit-user-select`・`-webkit-backdrop-filter` など）。autoprefixer を抜いたビルドとの差は `-moz-column-gap` 2 件と `-webkit-text-decoration-color` の重複を畳むことだけ
13. **状態**: 「休憩」は画面から撤去済み（`use-countdown-tick.ts:8`）。`routeWebSocket` を掛けたページは同期を取りこぼす（`e2e/README.md`）。SessionLost は `timer.spec.ts` の `armRoomLoss`（`addInitScript`）で作っている
14. **在室の色を見る E2E は無い**。`PresenceDot.test.tsx` は期待値を実装と同じ関数から作っている。`RosterPanel.test.tsx` にクラス名で書いた否定のアサーション（`.not.toContain("overflow-y-auto")`）がある
15. **Tailwind は `.tsx` の文字列を走査する**【実測】: 意味のクラス名がユーティリティ名（`container`・`hidden`・`grid`・`border`・`truncate`・`table`・`transition`・`shadow`・`ring` など）と重なると、Tailwind がそのユーティリティを生成し、`@layer timer` より強い規則が生まれる
16. **変異パッチ**: 100 本中 27 本が `apps/timer-web/src` を触る。クラス名の行を文脈に持つのは m63・m102

## 3. 決定

### D1. CSS の置き場と命名

- `src/index.css` は**入口だけ**にする。並びは「`@layer` の順序宣言 → `@import` 群 → `@config`」。**`@import` は `@config` より前に置く**（§2 の 10）
- 中身は `src/styles/` に分ける
  - `base.css`: 計器の語彙の別名・`html` / `body`・`:focus-visible`・`.sr-only`・ステージ・計器ラベル・`.tabular`・アニメーション（いまの `index.css` の中身。**レイヤーに入れない**。いまと同じ勝ち負けを保つ）
  - `primitives.css`: `primitives.tsx` の部品
  - 画面ごと（`lobby.css`・`session.css`・`summary.css` など）と、2 画面以上が使う部品ごと（`invite-panel.css` など）
  - poker・玄関・お題ツールは `index.css` 1 本だが、timer は量が多いので分ける（このリポジトリで初めての分け方）
- クラス名は意味で付ける。接頭辞は付けない。次と衝突させない
  - `.ui-`（部品層）、既存の `.instrument-*`・`.chrono-*`・`.animate-*`・`.boot-reveal`・`.brand-title`・`.driver-name-fluid`
  - 要素層のクラス（`.card`・`.page`・`.badge`・`.card-face`・`.secondary`・`.selected`・`.small`。#316 で要素層を読ませたときに衝突する）
  - **Tailwind のユーティリティ名**（§2 の 15。PR 1〜3 の間は同名のユーティリティが生成されて勝つ）。PR ごとに、新しいクラス名と同名の規則がビルド出力の `utilities` 層に無いことを確かめる
- 値の分岐（接続状態・在室・見出しの段など）は、クラス名を組み立てずに**字面のクラス名か `data-*` 属性**で書く。クラス名を受け渡す API（`presence.ts`・`SectionHeader` の `color`・`Markdown.tsx` の `HEADING_CLASS`・`Loading.tsx` の `CONNECTION_TONE`）もこの形にする
- `src/styles/` に相対 `url()` を書かない（PR 4 まで。§2 の 10）

### D2. 写す値

- **写すのは main で勝っている宣言だけ。** §2 の 4・5 で負けている宣言（効いていない上書き・レイヤー外の規則に負けているユーティリティ）は写さず、呼び出し側からも消す。見た目は変わらない
- **値は計算済みスタイル（`getComputedStyle`）で決める。** dist の字面は写さない（§2 の 6）。PR 1〜3 の新しい CSS は `--tw-*` と Tailwind の theme 層の変数（`--spacing`・`--radius-xl`・`--container-*`・`--text-*`・`--tracking-*` など。名簿は dist の theme ブロックから導く）を参照しない
- **文字の大きさ・余白はトークンへ寄せない**（寄せると見た目が変わる。§2 の 7）。`text-*` は大きさと行の高さの組で固定値のまま写し、宣言と同じ行に `/* scale-exempt: Tailwind の text-sm の写し（#316 で段へ寄せる） */` のように書く。余白の段に無い値は rem の直値で書く
- **色・角丸・影・書体はトークン（計器の語彙の別名を含む）で書く。** 生の色は書かない。`shadow-lg` は既存の `--shadow-popover` と同じ値なので、それを使う。`.tsx` の影（`rgba(0,0,0,0.5)` など）は値を変えずに `tokens/shape.css` の `--shadow-*` に足す。QR の白地は `ui-exempt:`（理由: QR は明暗で読むので地は白でなければならない）
- **レスポンシブの境界は rem のまま写す**（`@media (width >= 40rem)` など）
- **`hover:` は `@media (hover: hover)` の中に書く**
- **`ring-*` と `shadow-*` の合成**は、状態ごとに合成後の `box-shadow` を書く（例: 主ボタンのフォーカス、共有メモのハイライト）
- **変形**は個別のプロパティ（`scale` / `rotate` / `translate`）で写す（キーフレームの `transform` と重なり方を変えない）
- **`space-y-*`** は `:where(.x > :not(:last-child)) { margin-block-end: … }` の形で、詳細度 0 と「下側の余白」を保って写す
- **`animate-pulse`** は Tailwind のキーフレーム（`@keyframes pulse { 50% { opacity: .5 } }`・2 秒）ごと写す。`.sr-only` は Tailwind 版とレイヤー外の版が両方出ているので、勝っているレイヤー外の版だけを残す
- `@layer timer` の中で `!important` を使わない（レイヤーの順序が逆転し、レイヤー外の reduced-motion の `!important` より強くなる）
- `color-mix()` で α を作るユーティリティ（`decoration-[var(--signal)]/50` など）は、既存の語彙（`-tint` / `-veil` / `-edge`）で表せないか先に確かめ、表せなければ値のままトークンに足す

### D3. 移行中の勝ち負け（`@layer timer`）

- `src/index.css` の先頭（`@import 'tailwindcss'` より前）で `@layer properties, theme, base, timer, components, utilities;` を宣言する（§2 の 9。`properties` を含めないと末尾に回る）。画面の CSS は `@import './styles/x.css' layer(timer);` で読む
- **移す前に確かめること**（当たれば、呼び出し側・親と同じ PR で移す）
  1. 呼び出し側が `className` で同じプロパティを上書きしていないか。していたら、main で勝っているかを §2 の 4 で判定し、負けているものは消す
  2. 親の Tailwind（`space-*`・`divide-*`）が子の margin・枠を書いていないか
  3. 同じ要素の Tailwind が `box-shadow`（`ring-*`・`shadow-*`）・`filter`・`scale` / `rotate` / `translate` を書いていないか
- 部品層（`.ui-*`・レイヤー外）は、移行中は `@layer timer` の画面の CSS に読み込み順と関係なく勝つ（`packages/ui/README.md` の「画面が部品に勝つ」は移行中は成り立たない）。timer の画面の CSS が部品を上書きしている箇所が無いことを PR 1 で確かめる
- **PR 1〜3 の各 PR で、囲いを外したビルド（`layer(timer)` を外した一時ビルド）でも §5 を回す。** 負けている宣言を写していたら、その PR のうちに差が出る。PR 4 で差が一斉に出るのを防ぐ
- PR 4 で `layer(timer)` を外す

### D4. preflight の代わり

- Tailwind 4.3.3 の preflight を `src/styles/reset.css` に写す。**`@layer reset { … }` に入れ、いまと同じ「最弱」を保つ**（レイヤー外へ出すと `html` の `font-family` などが既存の規則と順序で競う）。レイヤーの順序宣言の先頭に `reset` を置く
- MIT なので出典と許諾の表記を冒頭の注釈に付ける
- `--theme()` 関数は、main の計算済みスタイルで解決された値に置き換える
- `audit-ui-components` が落とす 5 規則には `/* ui-exempt: preflight の逐語（Tailwind を外しても既定値を変えないため） */` を付ける
- 要らない規則を削るのは、同じ PR で §5 の差が 0 件のまま通る範囲に限る

### D5. 要素層は読まない（理由を差し替える）

- 要素層（`@tasuki/ui/elements.css`）は timer に読ませない。新しい理由は「**見た目を変えない条件のもとで要素層を読ませると、timer のボタン・見出しの一つひとつに要素層を打ち消す規則が要る**。要素層を読ませるかは、ボタンの形を部品層に足すときに決める」
- ADR 0001 決定 5 は理由の出典にしない（決定 5 は計器の骨格の話で、ボタンの形には触れていない）
- 読ませるかは #316 で判断し直す（D9 で #316 へ申し送る）

### D6. トークン層を CSS の `@import` で読む

- PR 4 で、`main.tsx` の `import "@tasuki/ui/tokens.css"` と `import "@tasuki/ui/components.css"` を `src/index.css` の `@import` に戻す（#297 の回避を外す）。読み込み順（トークン → 部品 → 画面）は main と同じになる【実測】

### D7. 依存と構成

- PR 4 で `tailwindcss`・`@tailwindcss/postcss`・`autoprefixer`・`postcss` を `apps/timer-web/package.json` の直接依存から外し、`tailwind.config.js`・`postcss.config.js` を消す
- 前置詞は「**必要な分は Vite（lightningcss）が build の対象に従って付ける**」と書く。main と PR 4 の dist の前置詞の集合の差を取り、消えるもの（`-moz-column-gap`・`-webkit-text-decoration-color` の重複）がどれも Vite の既定の対象ブラウザで不要であることを記録する。この差は非 Chromium でしか効かず、§5 には映らない
- `pnpm audit --audit-level high` と供給網の検証（ADR 0008）を通す。依存を減らすだけで足さない

### D8. ADR と文書

- **PR 1 で ADR 0022 に追記して決定を記録する**（憲法 原則 II: 既存スタックからの変更は ADR に記録した上で行う）。「決定した。実施は PR 4」と書き、完了形で書かない。数は ADR へ写さない。本文は書き換えず、末尾の追記で置き換える（ADR 0002）
  - timer は Tailwind・PostCSS・`autoprefixer` を使わない。素の CSS とトークン層・部品層で組む
  - 要素層を読まない理由を D5 に差し替える（決定 5 の理由の置き換え）
  - 決定 1「部品層は `@layer` を使わない」は維持し、理由を「部品の勝ち負けは読み込み順と詳細度で決まる」に差し替える
  - 記録先を ADR 0001 ではなく ADR 0022 にする理由（ADR 0001 決定 1 はすでに ADR 0022 決定 5 が置き換えている）を一文書く
- **PR 1 で ADR 0001 の末尾に新しい追記（日付・#321）を足す**。過去の追記の中は書き換えない。内容は次の 3 点
  - 決定 1 の「Tailwind のまま維持します」は ADR 0022 の追記（#321）が置き換えた
  - 2026-09-27 の追記の「要素層を読まない理由は変わらない」は、理由が差し替わった
  - 2026-08-11 の追記の `@tailwindcss/postcss` の位置づけと `autoprefixer` の申し送り（#71。2026-08-16 に close 済みで宛先を失っていた）は、#321 で外すことで終わる
- **PR 4 で ADR 0022 に実施状況を追記する**
- **PR 4 で現況の記述を書き直す。** 対象は一覧で持たず、次の検索で引き直す: `git grep -inE 'tailwind|postcss|autoprefixer|ユーティリティ|任意値|preflight|\[var\(--'`（`pnpm-lock.yaml` と §1.3 の過去の記録を除く）。既知の例: `packages/ui` の README・`src/elements/index.css`・`src/tokens/index.css`・`src/tokens/palette.css`・`stylelint.config.mjs`・`tests/tokens.test.mjs`、`apps/topic-web/src/index.css`、`scripts/audit-ui-components.mjs`、`e2e/support/contrast.ts`、`docs/guides/development.md`、timer の `main.tsx`・`presence.ts`・`use-breakpoint.ts`・`index.css`
  - **「トークン層に要素セレクタを置かない」規則そのものは残す**（理由は「timer が要素層を読まないため」になる）
  - README の「Tailwind と併用する場合は `@import` しない」の節は消す
  - `use-breakpoint.ts` の「Tailwind の lg」は「画面の CSS の `64rem` の境界と揃える（JS は px なので既定の文字の大きさでだけ一致する）」に書き換える
  - README のトークン表に足した `--shadow-*` を載せる

### D9. #316 と #320 への申し送り

- **#316 にコメントで申し送る**（PR 1 の中で行う。書き込みの前に利用者の承認を得る）。内容は次の 2 点
  - timer の写し（1 行・複数行の入力欄・`Card`・`InvitePanel`・`Markdown.tsx`）を部品へ寄せること。#320 が #321 に預けたものを、見た目を変えない方針のため #316 へ送った。入力欄の 14px（iOS の自動拡大）を含む
  - 要素層を timer に読ませるかの判断（D5）
- **#320 側の注釈の宛先を直す**（PR 1）: `apps/timer-web/src/index.css` の「Tailwind・#321 まで」、ADR 0022 の「timer の Tailwind の写し（#321）」など。`git grep -n '#321'` で拾う。#320 の設計正本と振り返りは過去の記録なので書き換えない

### D10. 検査

- **恒久の検査を 1 本足す（PR 1）**: 「timer の `.tsx` に字面で現れるクラス名は、どれも timer の CSS か部品層で定義されている」。PR 1〜3 の間は Tailwind のユーティリティ名を許す一覧（ビルド出力から導く）を持ち、PR 4 でその一覧を消す。E6 の grep では表・props のクラス名の取り残しを拾えないため（§2 の 2）
- **`design-tokens.test.ts`**: 生の色の射程を `.tsx` と `src/styles/*.css` に広げる。Tailwind 同梱の色の判定（`TAILWIND_HUES`）は PR 4 で消す。ALLOW は、使われていない項目があれば落ちる形にする
- **生の色の検査が新しい CSS でも赤になることを破壊検証で確かめる**（入る前に `git status --porcelain` が空であることを見る）
- **クラス名で書いたテストを書き直す**: 否定のアサーション（`RosterPanel.test.tsx` の `overflow-y-auto` など）と、期待値を実装と同じ関数から作るテスト（`PresenceDot.test.tsx`）を、計算済みスタイルか属性で見る形にする。どれも変異を当てて赤になることを確かめる
- **在室の色**: 3 状態がそれぞれトークンを解いた値の色で描かれることを E2E で測る（いまは測っていない）
- `presence.ts` と E5 の検査は「テスト → 赤 → 実装」の順で進める（憲法 I）

## 4. PR の刻み方

ADR 0013 の既定（1 Issue = 1 PR）から分割する理由は、`docs/guides/pr-granularity.md` の**理由 1（独立して revert したい単位が複数ある）**と**理由 3（危険度の異なる変更が混ざっている）**。primitives・画面・Session はそれぞれ見た目の後退が見つかったときに独立して戻したく、依存と preflight を外す PR 4 は画面の移植と危険度が違う。

| PR | 中身 |
|---|---|
| **1** | 設計正本・ADR の追記（D8）・#316 / #320 への申し送り（D9）・比較の仕組み（§5）・`index.css` の分割（D1）・`primitives.tsx` と効いていない上書きの削除（D2・D3）・`presence.ts` と在室の E2E・恒久の検査（D10）・影のトークン |
| **2** | Lobby・Loading・SessionLost・History・Summary と、2 画面以上が使う部品（`InvitePanel`・`PassphrasePanel`・`TopicCard`・`NotifySettingsPanel`・`EmptyHint` など） |
| **3** | Session と、その子の部品（差分が大きくても割らない。差分の大きさは分割の理由にならない・ガイド） |
| **4** | 依存と設定の撤去（D7）・`reset.css`（D4）・`layer(timer)` を外す（D3）・トークン層の `@import`（D6）・現況の記述の書き直し（D8）・`ba9249d` との通しの比較（§5）と比較の仕組みの撤去・振り返り |

- PR 1〜3 は依存の宣言を変えない。どの時点でも Tailwind が残ったまま動く
- PR ごとに順に進める（変異 ID と CSS のファイルが衝突するので並列にしない）
- 着手前に全変異パッチへ `git apply --check` を当てる。PR ごとに `mutation-check` を流し、当たらなくなったものを作り直す。作り直した変異が弱まっていないかを元のパッチと並べて確かめる

## 5. 見た目が変わっていないことの合否

### 5.1 基準と台帳

- **基準は `ba9249d` に固定する。** 基準側は別の worktree（`git worktree add <scratch>/base ba9249d`）で依存を入れ直してビルドし、別のポートで配る。作業ツリーで `git checkout main -- …` はしない（消したファイルが戻らず、PR 4 以降は依存も合わない）
- **承認した差の台帳**を `docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md` に置く。PR ごとに、状態数・幅・差の件数・仕分けを追記する。PR 本文にも同じ要約を書く
- **比較の仕組み**は `e2e/parity/` にコミットする（`e2e/specs/` の外なので `pnpm e2e` と spec のタグ検査に数えられない。専用の Playwright 設定で動かす）。turbo の strict env を避けて `cd e2e && playwright test -c parity/…` で叩く。PR 4 の通しの比較の後で消す

### 5.2 物差し 1: 計算済みスタイル（主）

- 状態ごとに、全要素と擬似要素（`::before`・`::after`・`::placeholder`・`::marker`）の `getComputedStyle` を書き出し、DOM の道筋で突き合わせる
- 比べるのは標準のプロパティだけ。カスタムプロパティ（`--*`）は比べない
- `box-shadow` は透明な 0 層を取り除いてから比べる
- `prefers-reduced-motion: reduce` を再現した状態で読む（遷移の途中の値と、`.chrono-hand` などの動く要素の揺れを止める）
- ホバー・フォーカス・押下・無効は、Playwright で状態を作ってから書き出す。対象は**操作できる全要素**（ボタン・タブ・一覧の行・入力欄・チェックボックス・スライダー）

### 5.3 物差し 2: 画素（副）

- Playwright の `toHaveScreenshot`（新しい依存は足さない）。基準で基準画像を作り、ブランチで `maxDiffPixels: 0` で比べる。台帳で承認した差がある状態は、その範囲を台帳に書いて除く
- ルームコード・QR・招待 URL・経過時間はマスクし、`animations: 'disabled'` を付ける

### 5.4 無害として扱う差（この設計の承認で承認済み）

1. カスタムプロパティ（`--tw-*`・Tailwind の theme 層の変数）の有無と値
2. `box-shadow` の透明な 0 層（`0 0 #0000` など）の有無
3. 見た目に効かない既定値の字面の違いのうち、計算済みスタイルが同じ値に解決されるもの（例: `0px` と `0`）

これ以外の差（例: 幅 0 の枠の `border-style` の違い）は、すべて台帳に書いて個別に承認を得る。

### 5.5 撮る状態と網羅の確かめ方

- 幅: 360・640・768・1024・1280px（`sm` だけが効く帯と `lg` の境界ちょうどを含む）。加えて `hasTouch` を有効にした 1 本（`@media (hover: hover)` の差を見る）
- 状態は既存 spec の作り方（実際の操作・`addInitScript`・`armRoomLoss` など）で作る。`routeWebSocket` を掛けたページでは、フレームの到着に依存する状態を撮らない
- 主な状態: Lobby（通知設定・合言葉・セッション設定）／Session（ドライバー本人／他人・計測中・一時停止・残りわずか・交代の知らせ・名簿の代理追加と削除の確認・共有メモとその更新・終了の確認）／告知の帯（error・caution）／Summary（完了・中断）／History（空・記録あり）／Loading（接続の各状態）／SessionLost
- **状態の列挙は腐るので、網羅は機構で確かめる。** §5 の実行中に CDP の `CSS.startRuleUsageTracking` で規則の使用状況を取り、**その PR で足した規則のうち一度も当たらなかったものが 0 件**であることを合格の条件にする。当たらなかった規則は「撮っていない状態」か「死んだ CSS」のどちらかで、どちらも直す
- 作れない状態が見つかったら、その時点で利用者に報告する

### 5.6 物差しを信じる前に

- **対照実行**: 基準同士を 2 回比べて、物差し 1・2 とも差 0 件になること
- **破壊検証**: ブランチで値を 1 か所わざと変え、物差し 1・2 の両方に差が出ること（擬似要素の値でも 1 回）

## 6. 完了条件（EARS）

| ID | 要求 | 確かめる手段 |
|---|---|---|
| E1 | §5.5 のどの状態・幅でも、ブランチの計算済みスタイルは基準（`ba9249d`）と一致しなければならない（§5.4 と台帳で承認した差を除く） | §5.2 |
| E2 | §5.5 のどの状態・幅でも、ブランチの画面は基準と画素で一致しなければならない（マスクと台帳で承認した差の範囲を除く） | §5.3 |
| E3 | PR 4 の後、`apps/timer-web/package.json` の直接依存に `tailwindcss`・`@tailwindcss/postcss`・`autoprefixer`・`postcss` があってはならない | `package.json` |
| E4 | PR 4 の後、`main.tsx` は CSS を import してはならず、ビルド出力の CSS で書体の `@font-face` は各 1 回でなければならない | ビルド出力・E2E の書体のドリフト検査 |
| E5 | timer の画面の CSS（`src/styles/*.css`）と `.tsx` が生の色を書いたとき、検査は失敗しなければならない（ALLOW の項目を除く） | `design-tokens.test.ts`・`audit-ui-components`・破壊検証 |
| E6 | timer の `.tsx` に字面で現れるクラス名が、timer の CSS にも部品層にも定義されていないとき、検査は失敗しなければならない（PR 1〜3 は Tailwind のユーティリティ名を除く） | D10 の恒久の検査・自己テスト・変異 |
| E7 | 在室状況の 3 状態は、それぞれトークンを解いた値の色で描かれなければならない | E2E |
| E8 | 各 PR で足した CSS の規則は、§5 の実行中に 1 回以上当たらなければならない | §5.5 の規則の使用状況 |
| E9 | PR 4 の後、§D8 の検索で現況の記述に Tailwind・PostCSS・`autoprefixer` を前提にしたものがあってはならない（`reset.css` の出典表記と ADR の追記の経緯を除く） | `git grep` |

## 7. 各 PR の検証

- 手元で `pnpm test`・`pnpm e2e`・scripts の自己テスト（bash で回す）・`pnpm audit`・`mutation-check` を回す
- §5 の 2 つの物差し（PR 1〜3 は囲いを外した一時ビルドでも回す・D3）
- 生の色の検査と D10 の恒久の検査の破壊検証
- E2E の a11y 走査（コントラスト・reduced-motion・書体のドリフト）。**フォーカス可視化の E2E は玄関しか見ていないので、timer のフォーカスの根拠にはしない**（§5.2 の全操作要素のフォーカスが根拠）
- 計画には `audit-plan-gate` を当てる
- レビュー: 文脈を共有しない `/code-review` を PR 番号を明示して通す
- 配布: 本番への配布は勝手に行わない

## 8. Constitution Check

| 原則 | 本設計での扱い |
|---|---|
| I. テスト駆動開発 | **移植は見た目を固定したまま移す作業で、比較（§5）に赤の段は無い。** 赤を先に見るのは、振る舞いの変わるもの（`presence.ts`・D10 の検査・在室の E2E・書き直すテスト）で、これらは「テスト → 赤 → 実装」の順で進める（D10） |
| II. 技術選定は ADR を通す | Tailwind・PostCSS・`autoprefixer` を外すことを、PR 1 で ADR 0022 の追記に記録してから実施する（D8） |
| III. 揮発インメモリと単純運用 | CSS と依存のみ。配布は利用者が決める |
| IV. 境界の型安全 | 該当なし（wire と境界の型に触れない） |
| V. 実画面検証 | §5。基準と並べた計算済みスタイルと画素の比較 |
| VI. 依存は内向き | 該当なし（ドメインに触れない） |
| VII. 検査は壊して確かめる | §5.6 の対照実行と破壊検証。D10 の検査の変異。変異パッチを PR ごとに当て直す |
| VIII. 記録が正本 | 本設計正本・ADR 0022 と 0001 の追記・差の台帳（§5.1）。完了条件は §6 の EARS |
| IX. 小さく回す | 分割の理由（ガイドの理由 1・3）を §4 に書いた |
| X. 抽象は実需で | 共有の単位は既存の `primitives.tsx` と、2 画面以上が使う部品に限る。部品層への寄せは #316 |
| XI. 秘密と個人情報 | 該当なし |
