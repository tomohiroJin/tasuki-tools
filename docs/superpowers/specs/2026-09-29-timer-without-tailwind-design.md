# timer から Tailwind を外し、素の CSS と `@tasuki/ui` で組む（#321）— 設計正本

- **Issue**: [#321](https://github.com/tomohiroJin/tasuki-tools/issues/321)
- **日付**: 2026-09-29　**実測時点**: main `ba9249d`
- **関連 Issue**: [#320](https://github.com/tomohiroJin/tasuki-tools/issues/320)（部品層・完了）/
  [#316](https://github.com/tomohiroJin/tasuki-tools/issues/316)（ボタンの形と段組みの段）/
  [#297](https://github.com/tomohiroJin/tasuki-tools/issues/297)（書体の `url()` が解決されなかった件）
- **前提となる ADR**: [`docs/adr/0001`](../../adr/0001-design-system-scope.md)（デザインシステムの層構造）/
  [`docs/adr/0002`](../../adr/0002-document-system-three-layers.md)（ADR の運用）/
  [`docs/adr/0013`](../../adr/0013-pr-granularity.md)（PR の粒度）/
  [`docs/adr/0022`](../../adr/0022-ui-components-layer.md)（部品層）

**この文書の位置づけ**: 設計の正本はこの文書である。初版（`195a3c8`）と 2 版（`fc2198f`）をそれぞれ文脈を共有しない
4 観点の検証（事実照合・CSS 設計・過去の失敗型・意図と規範）にかけ、指摘と利用者の判断（§1.2）を反映した 3 版である。
検証役は実アプリのビルドと最小構成の実験で前提を実測している（§2 の【実測】）。

## 1. 目的と方針

### 1.1 目的

`apps/timer-web` だけが Tailwind を使っているため、デザインシステムに次の制約がかかっている（Issue 本文の背景）。

- 要素層を読まない理由が「Tailwind のユーティリティと部分的に上書きし合う」になっている（ADR 0001 決定 1・ADR 0022 決定 5）
- トークン層を CSS の `@import` で読めず、`main.tsx` から JS で読んでいる（#297）
- 共通の部品を置くたびに、Tailwind のレイヤーとの勝ち負けを考える必要がある

timer を素の CSS と `@tasuki/ui`（トークン層・部品層）で組み直し、Tailwind・PostCSS・`autoprefixer` を依存から外す。

### 1.2 利用者の判断（2026-09-29）

| 論点 | 判断 |
|---|---|
| 見た目を変えないことを完了の条件にするか | **変えない。** 基準と並べて差分ゼロを目指す。出た差は一覧にして個別に承認を得る。部品層へ寄せて見た目が変わるもの（ボタンの形・段）は #316 に任せる |
| 要素層を timer に読ませるか | **この Issue では読ませない。** 理由は D5。読ませるかは #316 で判断し直す |
| 素の CSS の書き方 | **画面・部品ごとに意味のあるクラス名を付け、CSS は画面単位のファイルに分ける。** 自前のユーティリティ CSS・CSS Modules は採らない |
| PostCSS と `autoprefixer` | **まとめて外す**（他の 3 アプリと同じ構成にする） |
| 刻み方 | **移行中は新しい CSS を `@layer timer` に入れ、Tailwind のユーティリティより弱く置く。** 4 本の PR に刻む（中身は §4） |
| #320 が #321 に預けた「timer の写し（入力欄・`Card`・招待・Markdown）を部品へ寄せる」 | **#316 へ送る。** #321 は見た目を変えずに移すことに徹する（D9） |
| 「無害」な差の扱い | **無害として扱う類を §5.4 に列挙し、その一覧をこの設計の承認で承認する。** 一覧に無い差はすべて個別に承認を得る |
| 比べる基準 | **`ba9249d` に固定する。** 承認した差は 1 つの台帳に積む。PR 4 の最後に `ba9249d` との通しの比較を完了条件にする。比較の仕組みは `pnpm e2e` に数えられない場所にコミットし、通しの比較の後で消す |
| ADR の置き場（3 版で追加） | **新しい ADR 0023 を立てる**（技術選定を覆す判断なので Superseded の作法に従う・ADR 0002） |
| 要素層を読ませない理由（3 版で追加） | **D5 の文言に差し替える**（2 版までの「ADR 0001 決定 5」は出典として誤り） |
| 非 Chromium でしか効かない差（3 版で追加） | **`-moz-column-gap` 2 件が消えることを個別に承認する**（台帳に記録）。preflight の写しは削らない |
| PR の刻み方の組み直し（3 版で追加） | **PR 1 は見た目を移さない土台、PR 2 は primitives と呼び出し側と 5 画面、PR 3 は Session、PR 4 は片付け**（§4） |
| 並行する変更（3 版で追加） | **#321 が終わるまで、timer に触れる他の Issue を main へマージしない**（基準が固定なので差が混ざる） |

### 1.3 範囲に入れないもの

- 見た目の変更。ボタンの形・大きさの段・最大幅・段組みの段、部品層への寄せ（入力欄 14px → 16px の iOS の自動拡大を含む）は #316
- 要素層を timer に読ませること（#316 で判断）
- main で**いま効いていない**宣言を効かせること（例: 主ボタンのフォーカスでアウトラインとリングが両方出ている件）。一覧にして #316 へ渡す（D9）
- 過去の記録（`docs/plans/`・`docs/superpowers/plans|specs/`・`docs/retrospectives/`）と ADR の日付つき追記の中の Tailwind への言及。当時の事実なので書き換えない
- 本番への配布（利用者が決める）

## 2. 実測した事実（main `ba9249d`）

1. **依存**: `tailwindcss`・`@tailwindcss/postcss`（`^4.3.3`）・`autoprefixer`（`^10.4.20`）・`postcss`（`^8.5.25`）。いずれも `apps/timer-web` の devDependencies。`postcss` は vite 経由の推移依存とルートの devDependencies（ADR 0022 決定 7）にも居る
2. **量**: `apps/timer-web/src` の 29 ファイルに `className=` の行が 352 行。`sm:` 15・`md:` 8・`lg:` 8 か所（Issue 本文の `md:` 10 は `cmd:` の部分一致 2 件を含んでいた）。**クラス名は `className=` の行の外にもある** —— 表（`Loading.tsx` の `CONNECTION_TONE`・`Markdown.tsx` の `HEADING_CLASS`・`StatusStrip.tsx`）・関数（`presence.ts`・`SharedMemo.tsx` の `segClass`）・変数（`primitives.tsx` の `base` / `c`・`RosterPanel.tsx` の `listClass`）・props（`SectionHeader` の `color`）。`className={式}` とテンプレートリテラルで組む箇所がある
3. **呼び出し側の上書き**: `primitives.tsx` の部品に `className` を渡している箇所は 32（`Card` 8・`GhostButton` 15・`PrimaryButton` 9。TS の構文木で数えた）。**`IconButton` の呼び出しは 0 件**
4. **Tailwind の出力の並び**【実測】: レイヤーは `properties, theme, base, components, utilities` の順に出る。**同じ詳細度のユーティリティ同士は、`className` に書いた順ではなく出力の並び順で勝つ。** そのため呼び出し側の上書きの一部は**いま効いていない**（`px-3`・`px-4` は `.px-6` より、`py-1.5`・`py-2` は `.py-3` より前に出る）。**勝ち負けは幅で変わる** —— `Summary.tsx` の `<Card className="p-3 sm:p-4">` は、640px 未満では Card の `p-6` に負け、640〜767px では `sm:p-4` が勝ち、768px 以上では Card の `md:p-7` に負ける
5. **レイヤーに入っていない規則が勝っている**【実測】: `index.css` の `:root`・`html`・`body`・`:focus-visible`・`.sr-only`・`.instrument-label`・`.tabular` などは、ビルド出力でもどのレイヤーにも入っていない。これらと衝突するユーティリティの宣言は**いま死んでいる**（`.instrument-label` と同じ要素の色・`text-[10px]`、`.tabular` と同じ要素の `tracking-*`、グローバルの `:focus-visible` と同じ要素の `focus-visible:outline-none`・入力欄の `outline-none` など）。**勝ち負けは宣言ごとに決まる** —— `.sr-only` は Tailwind 版の `clip-path: inset(50%)` とレイヤー外の版の `clip: rect(0,0,0,0)` の両方がいま効いている
6. **値は dist で解決済みではない**【実測】: `.rounded-xl{border-radius:var(--radius-xl)}`・`.gap-1\.5{gap:calc(var(--spacing) * 1.5)}` のように、Tailwind の theme 層にしか無い変数を参照している。`rounded-lg` はトークン層の `--radius-lg`（0.75rem）が Tailwind の既定に勝っている
7. **文字の大きさ**: Tailwind の `text-*` は固定の rem で、行の高さも比で同時に決める。トークンの 5 段（`--font-size-*`）は `clamp()` の可変値で、一致する段は無い。余白もトークン（`--space-*`）に無い段を使っている
8. **変種**【実測】: `hover:` は `@media (hover: hover)` で包まれて出る。境界は `@media (width>=40rem | 48rem | 64rem)`（rem）。`ring-*` と `shadow-*` は `--tw-*` を介して 1 つの `box-shadow` に合成される。`scale-*`・`rotate-*`・`translate-*` は個別のプロパティで出る。`space-y-*` は `:where(.x > :not(:last-child))` の詳細度 0 で `margin-block` を書く。`animate-pulse` は `pulse 2s cubic-bezier(.4, 0, .6, 1) infinite`
9. **レイヤーの宣言の位置**【実測】: `@layer theme, base, timer, components, utilities;` を `@import 'tailwindcss'` の**前**に置くと、出力は `properties, theme, base, timer, components, utilities` の順になり、ユーティリティは 1 本も変わらない（`properties` は Tailwind 自身が先頭に出す）。**後**に置くと `timer` が `utilities` の後ろへ回る。`@import './styles/x.css' layer(timer)` は `@layer timer{…}` として base と components の間に出る
10. **`@import` の位置**【実測】: `@config` の後に `@import './styles/…'` を書くと、Vite は警告を出すがビルドは成功し、**読み込んだはずの中身が出力から消える**。Tailwind が展開する `@import` の中の相対 `url()` は基準が付け替わらない（#297 と同じ）
11. **preflight**【実測】: Tailwind 4.3.3 の `preflight.css`（398 行・MIT）は `@layer base` に入っている。逐語で写すと `scripts/audit-ui-components.mjs` が 5 件落とす（入力欄の型を含むセレクタ）。`ui-exempt:` を規則の直前（説明の注釈の後）に置けば 0 件になる。`--theme()` 関数を使う宣言があり、素の CSS としては無効（出力では `var(--font-sans, …)` などに解決されている）
12. **前置詞**【実測】: Vite 8 の CSS の最小化（lightningcss）が、Tailwind・autoprefixer 無しでも前置詞を付ける。autoprefixer を抜いたときに消えるのは `-moz-column-gap` 2 件だけ（`-webkit-text-decoration-color` は重複が畳まれなくなるだけ）
13. **状態**: 「休憩」は画面から撤去済み（`use-countdown-tick.ts:8`）。在室の「離席（idle）」は代入する経路が 0 件（`packages/room-core/src/room.ts`）。`routeWebSocket` を掛けたページは同期を取りこぼす（`e2e/README.md`）。SessionLost は `timer.spec.ts` の `armRoomLoss`（`addInitScript`）で作っている。`SwitchAlert` は reduced-motion のとき `animate-pop-in` を付けない（JS で分岐）
14. **テスト**: 在室の色を見る E2E は無い。jsdom のテストは CSS を読まない（`vitest.config.ts` に `css` の設定が無い）。`PresenceDot.test.tsx` は期待値を実装と同じ関数から作っている。`RosterPanel.test.tsx` にクラス名で書いた否定のアサーションがある
15. **Tailwind は `.tsx` とテストのコメントの文字列を走査する**【実測】: 意味のクラス名がユーティリティ名（`container`・`hidden`・`grid`・`border`・`truncate`・`table`・`shadow`・`ring` など）と重なると、Tailwind がそのユーティリティを生成し、`@layer timer` より強い規則が生まれる
16. **死んだ規則**: `index.css` の `.animate-confetti`・`.animate-shake`・`.animate-pulse-fast` は `.tsx` に使い手が 0 件
17. **E2E のハーネス**: ポートは固定（`e2e/harness/paths.ts`。Caddy 18080・sync 8787）。配信する dist は `/var/www/*` の symlink で切り替える（`e2e/harness/www.ts`）。ルームコードの無い timer は玄関へ送られるので、比較にも玄関が要る
18. **CDP の規則の使用状況**【実測】: `CSS.startRuleUsageTracking` は Playwright の Chromium で動き、`:hover`・`@media`・擬似要素・`:where()` の規則も当たりとして記録する。**返るのは当たった規則だけ**（当たらなかった規則は結果に出ない）。「当たった」は「セレクタが一致した」で「宣言が勝った」ではない。build では CSS のソースマップが出ず、dev で `css.devSourcemap: true` にすると元のファイルまで辿れる
19. **変異パッチ**: 100 本中 27 本が `apps/timer-web/src` を触る。クラス名の行を文脈に持つのは m63・m102。CSS を触るものは 0 本

## 3. 決定

### D1. CSS の置き場と命名

- `src/index.css` は**入口だけ**にする。並びは「`@layer` の順序宣言 → `@import` 群 → `@config`」（`@import` は `@config` より前・§2 の 10）。`@import` の順は「base（レイヤー外）→ primitives → 画面」（PR 4 で同じ詳細度のときに画面が勝つ順）
- 中身は `src/styles/` に分ける
  - `base.css`: 計器の語彙の別名・`html` / `body`・`:focus-visible`・`.sr-only`・ステージ・計器ラベル・`.tabular`・アニメーション（いまの `index.css` の中身。**レイヤーに入れない**。いまと同じ勝ち負けを保つ）。§2 の 16 の死んだ規則は移すときに消す
  - `primitives.css`: `primitives.tsx` の部品
  - 画面ごと（`lobby.css`・`session.css`・`summary.css` など）と、2 画面以上が使う部品ごと（`invite-panel.css` など）
  - poker・玄関・お題ツールは `index.css` 1 本だが、timer は量が多いので分ける（このリポジトリで初めての分け方）
- クラス名は意味で付ける。接頭辞は付けない。次と衝突させない（D10 の検査が落とす）
  - `.ui-`（部品層）、既存の `.instrument-*`・`.chrono-*`・`.animate-*`・`.boot-reveal`・`.brand-title`・`.driver-name-fluid`
  - 要素層のクラス（`.card`・`.page`・`.badge`・`.card-face`・`.secondary`・`.selected`・`.small`。#316 で要素層を読ませたときに衝突する）
  - Tailwind のユーティリティ名（§2 の 15。PR 1〜3 の間は同名のユーティリティが生成されて勝つ）
- クラス名は**字面で書く**。書いてよい形は「`className="…"` の文字列リテラル」「`className={cond ? "a" : "b"}` の字面の分岐」「名前が `_CLASS` で終わる `as const` の表」に限る。値の分岐（接続状態・在室・見出しの段など）は、この形か `data-*` 属性で書く。クラス名を受け渡す API（`presence.ts`・`SectionHeader` の `color`・`Markdown.tsx` の `HEADING_CLASS`・`Loading.tsx` の `CONNECTION_TONE`・`SharedMemo.tsx`・`StatusStrip.tsx`）もこの形にする
- `src/styles/` に相対 `url()` を書かない（PR 4 まで。§2 の 10）
- `IconButton` は呼び出しが 0 件なので、PR 2 で消す

### D2. 写す値

- **写すのは main で勝っている宣言だけ。** 勝ち負けは**宣言ごと・幅ごと・状態ごと**に判定する（§2 の 4・5）
  - 判定の手段: 基準のページで、要素のクラスを 1 つずつ外して全幅・全状態の計算済みスタイルを取り、変わらなければそのクラスの宣言は死んでいる（**除去検査**。§5 の仕組みの一部として作る）。死んだクラスは写さず、呼び出し側からも消す。見た目は変わらない。消した一覧は台帳に書き、#316 へ渡す（D9）
  - 一部の幅でだけ勝つ宣言（`p-3 sm:p-4` など）は、上端のある範囲のメディアクエリ（`@media (40rem <= width < 48rem)`）で写す
  - `.sr-only` は両版で勝っている宣言の和（`clip` と `clip-path` の両方）を残す
- **値は基準の計算済みスタイルで決める。** dist の字面は写さない（§2 の 6）。ただし**行の高さは比のまま写す**（計算済みは px になり、子へ比で継がれなくなる）。新しい CSS は `--tw-*` と Tailwind の theme 層の変数（名簿は dist の theme ブロックから導く）を参照しない
- **文字の大きさ・余白はトークンへ寄せない**（寄せると見た目が変わる。§2 の 7）。`text-*` は大きさと行の高さの組で固定値のまま写す。宣言と同じ行に `/* scale-exempt: Tailwind の text-sm の写し（#316 で段へ寄せる） */` のように書く。**この印を読む検査は timer の CSS には無い**（`typography-scale.test.mjs` の射程は `packages/ui/src`）。注釈として #316 の手がかりに残す
- **色・角丸・影・書体はトークン（計器の語彙の別名を含む）で書く。** 生の色は書かない。`shadow-lg` は既存の `--shadow-popover` と同じ値なので、それを使う。`.tsx` の影（`rgba(0,0,0,0.5)` など）は値を変えずに `tokens/shape.css` の `--shadow-*` に足す（#320 PR 5 の規範。画面の CSS の影はトークンに置く）。QR の白地は `ui-exempt:`（理由: QR は明暗で読むので地は白でなければならない）
- **レスポンシブの境界は rem のまま写す**（`@media (width >= 40rem)` など）
- **`hover:` は `@media (hover: hover)` の中に書く**
- **`ring-*` と `shadow-*` の合成**は、状態ごとに合成後の `box-shadow` を書く（例: 主ボタンのフォーカス、共有メモのハイライト）
- **変形**は個別のプロパティ（`scale` / `rotate` / `translate`）で写す
- **`space-y-*`** は `:where(.x > :not(:last-child)) { margin-block-end: … }` の形で、詳細度 0 と「下側の余白」を保って写す
- **`animate-pulse`** は `@keyframes pulse { 50% { opacity: .5 } }` と `pulse 2s cubic-bezier(.4, 0, .6, 1) infinite` をそのまま写す
- `@layer timer` の中で `!important` を使わない（レイヤーの順序が逆転する）
- `color-mix()` で α を作るユーティリティ（`decoration-[var(--signal)]/50` など）は、既存の語彙（`-tint` / `-veil` / `-edge`）で**同じ計算済みの値**になるときだけ寄せる。ならなければ値のままトークンに足す

### D3. 移行中の勝ち負け（`@layer timer`）

- `src/index.css` の先頭（`@import 'tailwindcss'` より前）で `@layer theme, base, timer, components, utilities;` を宣言する（§2 の 9）。画面の CSS は `@import './styles/x.css' layer(timer);` で読む
- **移す前に確かめること**（当たれば、呼び出し側・親と同じ PR で移す）
  1. 呼び出し側が `className` で同じプロパティを上書きしていないか。していたら D2 の除去検査で幅ごとに判定する
  2. 親の Tailwind（`space-*`・`divide-*`）が子の margin・枠を書いていないか
  3. 同じ要素の Tailwind が `box-shadow`（`ring-*`・`shadow-*`）・`filter`・`scale` / `rotate` / `translate` を書いていないか
- 部品層（`.ui-*`・レイヤー外）は、移行中は `@layer timer` の画面の CSS に読み込み順と関係なく勝ち、PR 4 で画面の CSS が後から読まれると逆転する。**各 PR で**、timer の画面の CSS が `.ui-*` を持つ要素の同じプロパティを書いていないことを確かめる（いまは `ui-select flex-1` と `ui-select mt-1` の 2 か所で、衝突は無い）
- **囲いを外した一時ビルド**: PR 2・3 の各 PR で、`layer(timer)` を外したビルドでも §5 を回す。負けている宣言を写していたら、その PR のうちに差が出る。切り替えは環境変数で行い、作業ツリーの CSS を編集しない（Vite の設定で `@import … layer(timer)` を外す変換を掛ける。手段は計画で決める）
  - 一時ビルドの差のうち、次の型は**既知の偽陽性**として扱う（PR 4 では消える）: 親を先に移したとき、レイヤー外になった親の `:where(.x > :not(:last-child))` が、まだ Tailwind のままの子の margin に勝つ
  - それ以外の差はすべて直す。一時ビルドで差 0 でも、Tailwind が同名のユーティリティを生成し続けるもの（`.sr-only` など）は隠れるので、PR 4 の比較が最後の防壁になる
- PR 4 で `layer(timer)` を外す

### D4. preflight の代わり

- Tailwind 4.3.3 の preflight を `src/styles/reset.css` に**逐語で**写す。削らない（Firefox・Safari 向けの規則を含む。削ると Chromium の物差しに映らない差が生まれる）
- `@layer reset { … }` に入れ、いまと同じ「最弱」を保つ。PR 4 の順序宣言は `@layer reset;` だけになる（Tailwind が消えるので `theme` などは要らない）
- MIT なので出典と許諾の表記を冒頭の注釈に付ける
- `--theme()` 関数は、main の出力が解決した形（`var(--font-sans, …)` など）に置き換える
- `audit-ui-components` が落とす 5 規則には、それぞれ**規則の直前**（説明の注釈の後）に `/* ui-exempt: preflight の逐語（Tailwind を外しても既定値を変えないため） */` を付ける

### D5. 要素層は読まない（理由を差し替える）

- 要素層（`@tasuki/ui/elements.css`）は timer に読ませない
- 理由: **見た目を変えない条件のもとで要素層を読ませると、timer のボタンや見出しの一つひとつに、要素層を打ち消す規則が要る。読ませるかは、ボタンの形を部品層に足すときに決める（#316）**

### D6. トークン層を CSS の `@import` で読む

- PR 4 で、`main.tsx` の `import "@tasuki/ui/tokens.css"` と `import "@tasuki/ui/components.css"` を `src/index.css` の `@import` に戻す（#297 の回避を外す）。読み込み順（トークン → 部品 → 画面）は main と同じになる【実測】

### D7. 依存と構成

- PR 4 で `tailwindcss`・`@tailwindcss/postcss`・`autoprefixer`・`postcss` を `apps/timer-web/package.json` の直接依存から外し、`tailwind.config.js`・`postcss.config.js` を消す
- 前置詞は「**必要な分は Vite（lightningcss）が build の対象に従って付ける**」。消える `-moz-column-gap` 2 件は利用者が個別に承認した（§1.2。Firefox は 63 以降、前置詞なしの `gap` で効く）。台帳に記録する。main と PR 4 の dist の前置詞の集合の差を取り、これ以外に消えるものが無いことを確かめる
- `pnpm audit --audit-level high` と供給網の検証（ADR 0008）を通す。依存を減らすだけで足さない

### D8. ADR と文書

- **PR 1 で ADR 0023「timer は Tailwind を使わず、素の CSS とトークン層・部品層で組む」を立てる**（憲法 原則 II。技術選定を覆すので Superseded の作法・ADR 0002）。「決定した。実施は PR 4」と書き、完了形で書かない。数は ADR へ写さない
  - 決定: timer は Tailwind・PostCSS・`autoprefixer` を使わない／要素層は読まない（理由は D5）／移行中の `@layer timer` と見た目を変えない方針
  - 置き換えるもの: ADR 0001 決定 1 の「Tailwind のまま維持します」と 2026-08-11 の追記（`@tailwindcss/postcss` の位置づけ・CSS-first の見送り・`autoprefixer` の申し送り。#71 は 2026-08-16 に close 済みで宛先を失っていた）／ADR 0022 決定 5 の「要素層を読まない理由」／ADR 0022 決定 1 の「Tailwind のレイヤー構造に依存しない」という理由（決定そのもの「部品層は `@layer` を使わない」は維持し、理由を「部品の勝ち負けは読み込み順と詳細度で決まる」にする）／ADR 0022 の実施状況の「timer の Tailwind の写し（#321）」の行き先（#316 へ移った）
- **旧 ADR には注記だけを足す**（ADR 0022 が定めた作法）。ADR 0001 と ADR 0022 の末尾に「追記（2026-09-29・#321）: 〜は ADR 0023 が置き換えた。現行の正本は ADR 0023」とだけ書く。日付つきの追記の中は書き換えない
- **PR 4 で ADR 0023 に実施状況を追記する**
- **PR 4 で現況の記述を書き直す。** 対象は一覧で持たず、次の検索で引き直し、**1 件ずつ人が仕分ける**: `git grep -inE 'tailwind|postcss|autoprefixer|ユーティリティ|任意値|preflight|\[var\(--|[a-z]-\['`（`pnpm-lock.yaml` と §1.3 の過去の記録を除く）。この検索は正当な言及（ルートの `postcss`・ADR 0022 決定 7・ADR 0008・`pnpm-workspace.yaml`・ci.yml・e2e のハーネスの `preflight`・関数の意味の「ユーティリティ」など）にも当たる。残すものは理由とともに台帳に書く。既知の書き直し先: `packages/ui` の README・`src/elements/index.css`・`src/tokens/index.css`・`src/tokens/palette.css`・`stylelint.config.mjs`・`tests/tokens.test.mjs`、`apps/topic-web/src/index.css`、`scripts/audit-ui-components.mjs`、`e2e/support/contrast.ts`、`docs/guides/development.md`、timer の `main.tsx`・`presence.ts`・`use-breakpoint.ts`
  - **「トークン層に要素セレクタを置かない」規則そのものは残す**（理由は「timer が要素層を読まないため」になる）
  - README の「Tailwind と併用する場合は `@import` しない」の節は消す
  - `use-breakpoint.ts` の「Tailwind の lg」は「画面の CSS の `64rem` の境界と揃える（JS は px なので既定の文字の大きさでだけ一致する）」に書き換える
- **影のトークンを足す PR で、README のトークン表にも載せる**（片側だけにしない）

### D9. #316 への申し送り

- **#316 にコメントで申し送る**（PR 1 の中で行う。書き込みの前に利用者の承認を得る）。内容:
  1. timer の写し（1 行・複数行の入力欄・`Card`・`InvitePanel`・`Markdown.tsx`）を部品へ寄せること。#320 が #321 に預けたものを、見た目を変えない方針のため #316 へ送った。入力欄の 14px（iOS の自動拡大）を含む
  2. 要素層を timer に読ませるかの判断（D5）
  3. **#321 は timer のボタンの形を変えない**（#316 のコメントは「timer のボタンは #321 で組み直す」前提で書かれている。本文の「timer は Tailwind」も #321 の後は古くなる）
  4. main で効いていない宣言の一覧（D2 の除去検査で消したもの。例: `PrimaryButton` に渡した `px-3 py-1.5`）と、主ボタンのフォーカスでアウトラインとリングが両方出ている件。「ボタンの収まりが悪い」の手がかりになる。一覧は PR 2・3 で増えるので、台帳を指す
- **#320 側の現況の注釈の宛先を直す**（PR 1）: `apps/timer-web/src/index.css` の「Tailwind・#321 まで」など。`git grep -n '#321'` で拾う。ADR 0022 は D8 の注記で扱い、本文・日付つきの追記は書き換えない。#320 の設計正本と振り返りは過去の記録なので書き換えない

### D10. 検査とテスト

- **恒久の検査を 1 本足す（PR 1）**: `scripts/audit-timer-classes.mjs`（名前は計画で決める。`scripts/audit-*.mjs` は ci.yml から呼ばれることが導出テストで確かめられる・#320 D12）。見るもの:
  1. timer の `.tsx` / `.ts` の className は D1 の許した形でしか書かれていない（許した形以外の `className={…}` と、クラス名をテンプレートリテラル・連結で組む書き方を落とす）
  2. 許した形から字面で取り出したクラス名は、どれも timer の CSS（`src/styles/*.css`）か部品層に定義されている
  3. **移行中の許可はファイル単位で持つ**: 「まだ移していないファイル」の一覧に載ったファイルだけは 1・2 を免除する。一覧は PR ごとに減り、PR 4 で空になって消える。**移したファイルでは Tailwind の構文（`-[`・`:` の変種・既知の接頭辞）を広く落とす**（ビルド出力から許可を導かない。導くと取り残しも通し、CI ではテストの時点で dist が無い）
  4. timer の CSS に定義したクラス名が、D1 の衝突させない名前（要素層のクラス・Tailwind のユーティリティ名の既知の一覧）と重ならない
  - 自己テストと変異を持つ（逃げ道の族: テンプレートリテラル・連結・`.ts` の表・props 経由・`data-*` と混同した書き方・一覧に残ったまま移したファイル）
- **`design-tokens.test.ts`**: 射程は `.tsx` と `.ts` に留める（CSS は `audit-ui-components` がすでに timer の CSS を走査し、色名と色関数も持つ。二重に持たない）。Tailwind 同梱の色の判定（`TAILWIND_HUES`）は PR 4 で消す。ALLOW は、使われていない項目があれば落ちる形にする
- **生の色の検査が timer の新しい CSS でも赤になることを破壊検証で確かめる**（入る前に `git status --porcelain` が空であることを見る）
- **単体テストは属性と構造だけを見る**（jsdom は CSS を読まない・§2 の 14）。クラス名で書いた否定のアサーション（`RosterPanel.test.tsx` の `overflow-y-auto`）と、期待値を実装と同じ関数から作るテスト（`PresenceDot.test.tsx`）は、属性か DOM の構造で見る形に書き直す。**CSS の対応は E2E と §5 が担う**
- **在室の色の E2E**: 3 状態がそれぞれトークンを解いた値の色で描かれることを測る。「離席（idle）」は経路が無く状態を作れない（§2 の 13）ので、描画済みの点の属性を `page.evaluate` で書き換えて **CSS の対応だけを測る**。そのことをテストの注釈に書く。**新しいタグは足さない**。CSS の規則に変異を当てて赤になることを確かめる
- 振る舞いの変わるもの（`presence.ts`・D10 の検査・在室の E2E・書き直すテスト）は「テスト → 赤 → 実装」の順で進める（憲法 I）

## 4. PR の刻み方

ADR 0013 の既定（1 Issue = 1 PR）から分割する理由は、`docs/guides/pr-granularity.md` の**理由 1（独立して revert したい単位が複数ある）**と**理由 3（危険度の異なる変更が混ざっている）**。見た目を移す PR は、後退が見つかったときに土台（ADR・物差し・検査）を残したまま戻したい。依存と preflight を外す PR 4 は、画面の移植と危険度が違う。

| PR | 中身 |
|---|---|
| **1** | **見た目を移さない土台。** ADR 0023 と旧 ADR の注記（D8）・#316 への申し送りと #320 側の注釈（D9）・比較の仕組みと除去検査（§5）・台帳・`index.css` の分割とレイヤーの宣言（D1・D3。`base.css` へ移すだけ）・恒久の検査（D10）・`design-tokens.test.ts` の ALLOW・影のトークンと README の表 |
| **2** | **primitives と、その呼び出し側の上書き**（Session の中の該当行を含む）・`IconButton` の削除・Lobby・Loading・SessionLost・History・Summary と 2 画面以上が使う部品（`InvitePanel`・`PassphrasePanel`・`TopicCard`・`NotifySettingsPanel`・`EmptyHint` など）・`presence.ts` と在室の E2E・書き直すテスト |
| **3** | Session と、その子の部品（差分が大きくても割らない。差分の大きさは分割の理由にならない・ガイド） |
| **4** | 依存と設定の撤去（D7）・`reset.css`（D4）・`layer(timer)` を外す（D3）・トークン層の `@import`（D6）・現況の記述の書き直し（D8）・ADR 0023 の実施状況・`ba9249d` との通しの比較（§5）と比較の仕組みの撤去・振り返り |

- PR 1〜3 は依存の宣言を変えない。どの時点でも Tailwind が残ったまま動く
- PR ごとに順に進める（CSS のファイルと変異 ID が衝突するので並列にしない）。**#321 が終わるまで、timer に触れる他の Issue を main へマージしない**（§1.2）
- 各 PR の中のコミット順は「物差し・検査・テスト → 赤を確かめる → 移植」（#320 の振り返り: 部品をテストより先にコミットしていた）
- 着手前に全変異パッチへ `git apply --check` を当てる。PR ごとに `mutation-check` を流し、当たらなくなったものを作り直す。作り直した変異が弱まっていないかを元のパッチと並べて確かめる。新しい変異 ID は既存の最大値の次から振る

## 5. 見た目が変わっていないことの合否

### 5.1 基準・ハーネス・台帳

- **基準は `ba9249d` に固定する。** 基準の dist は別の worktree（`git worktree add <scratch>/base ba9249d`）で依存を入れてビルドする。作業ツリーで `git checkout main -- …` はしない（消したファイルが戻らず、PR 4 以降は依存も合わない）
- **ハーネスは 1 本のまま順に回す。** ポートが固定（§2 の 17）なので、`/var/www/*` の symlink を基準の dist とブランチの dist で差し替え、同じ状態の手順を 2 回流して、それぞれの書き出し（JSON と画像）をファイルに置く。突き合わせはオフラインで行う。回し終えたら `ss -tlnp` で 18080・8787 を掴んだままでないことを確かめる
- **比較の仕組み**は `e2e/parity/` にコミットする（`e2e/specs/` の外なので `pnpm e2e` と spec のタグ検査に数えられない）。`e2e/tsconfig.json` の `include` と `e2e/package.json` の `lint` の対象に `parity` を足し、型検査と lint を通す。`apps/` を相対パスで読まない（`audit-dependency-direction` が落とす）。実行は `cd e2e && TASUKI_E2E_TARGET=local playwright test -c parity/…`（turbo の strict env を避ける。WSLg では `WAYLAND_DISPLAY` が要る）。PR 4 の通しの比較の後で消す
- **台帳**を `docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md` に置く。**承認した差・消した死んだクラス・残した検索結果の正本は台帳**。PR ごとの節に、基準とブランチの SHA・比較の仕組みの SHA・対照実行と破壊検証の結果・状態ごとの比較要素数・差の仕分け・E8 の件数を書く。比較の仕組みを消した後は「`git checkout <SHA> -- e2e/parity` で再現できる」と書く。PR 本文には台帳へのリンクだけを書く（数を転記しない）
- **承認した差を比較から除く範囲は、比較のコードが持つ**（台帳はそれを引用する）

### 5.2 物差し 1: 計算済みスタイル（主）

- 状態ごとに、全要素と擬似要素（`::before`・`::after`・`::placeholder`・`::marker`・開いた一覧の `::picker(select)`）の `getComputedStyle` を書き出し、DOM の道筋で突き合わせる。道筋が片側にしか無ければ差とする
- **比べるプロパティ**: 標準のプロパティと前置詞つきのプロパティの全部。カスタムプロパティは比べるが、§5.4 の類 1 だけを除く
- **2 通りの読み方をする**
  1. `prefers-reduced-motion: reduce` の下で全プロパティを読む（遷移の途中の値と動く要素の揺れを止める）
  2. `no-preference` の下で `transition-*` と `animation-*` の個別プロパティだけを読む（静的な値なので揺れない）。この読みでだけ現れる DOM（`SwitchAlert` の `animate-pop-in` など）も対象にする
- **キーフレーム**: 使われている `animation-name` ごとに、`CSSKeyframesRule` の中身を基準と突き合わせる
- ホバー・フォーカス・押下・無効・チェックは、Playwright で状態を作ってから書き出す。対象は**操作できる全要素**（ボタン・タブ・一覧の行・入力欄・チェックボックス・スライダー）。**状態に入れたことを断定する**（`el.matches(':hover' | ':focus-visible' | ':active')`・`matchMedia`）
- ルームコード・招待 URL・経過時間に依存して揺れる値は、§5.6 の対照実行で洗い出し、要素を名指しで除く（除いた一覧は比較のコードが持つ）

### 5.3 物差し 2: 画素（副）

- Playwright の `toHaveScreenshot` と同じ比較を、書き出した画像同士に当てる（新しい依存は足さない）。`maxDiffPixels: 0`。台帳で承認した差がある状態は、その範囲を比較のコードに書いて除く
- ルームコード・QR・招待 URL・経過時間はマスクし、`animations: 'disabled'` を付ける

### 5.4 無害として扱う差（この設計の承認で承認する）

1. **Tailwind に由来するカスタムプロパティ**: 名前が `--tw-` で始まるもの、と Tailwind の theme 層が定義する変数（名簿は基準の dist の theme ブロックから導き、比較のコードが持つ）の有無と値
2. **透明な 0 層の影**: `box-shadow` の層のうち、長さがすべて 0 で色の α が 0 のものの有無

これ以外の差（前置詞つきのプロパティ・timer 自身のトークンの別名・字面の違いを含む）は、すべて台帳に書いて個別に承認を得る。

### 5.5 撮る状態と網羅の確かめ方

- 幅: 360・640・768・1024・1280px（`sm` だけが効く帯と `lg` の境界ちょうどを含む）。加えて `hasTouch` を有効にした 360px の 1 本（`(hover: hover)` が偽になる【実測】）
- 状態は既存 spec の作り方（実際の操作・`addInitScript`・`armRoomLoss` など）で作る。`routeWebSocket` を掛けたページでは、フレームの到着に依存する状態を撮らない
- **状態ごとに、その状態にしか無い目印（`aria-label`・見出しなど）を書き出しの前に断定し、比較要素数の下限を置く**（ルームが無くて両側が玄関へ飛ぶと、同じ玄関を比べて差 0 になる）
- 主な状態: Lobby（通知設定・合言葉・セッション設定）／Session（ドライバー本人／他人・計測中・一時停止・残りわずか・交代の知らせ・名簿の代理追加と削除の確認・共有メモとその更新・終了の確認）／告知の帯（error・caution）／Summary（完了・中断）／History（空・記録あり）／Loading（接続の各状態）／SessionLost
- **網羅は規則の使用状況で確かめる（E8）。** これは「網羅の確認」であって「効いているかの確認」ではない（効いているかは物差し 1 と除去検査が見る）
  - dev のサーバーに `css.devSourcemap: true` を付けて §5 の状態を回し、CDP の `CSS.startRuleUsageTracking` で当たった規則を取る（§2 の 18）
  - **分母はソースから数える**: その PR で足した `src/styles/*.css` の規則（`@media` の中を含む）をソースの構文木から列挙し、当たった規則とソースの位置で突き合わせる。当たった規則だけが返るので、分母を別に持たないと恒真になる
  - 対象外: `reset.css`（preflight の逐語で、timer の DOM に無い要素の規則を含む）と、`index.css` から `base.css` へ移しただけの規則（PR 1。足した規則ではない）
  - 当たらなかった規則は「撮っていない状態」か「死んだ CSS」のどちらかで、状態を足すか規則を消す
- 作れない状態が見つかったら、その時点で利用者に報告する

### 5.6 物差しを信じる前に

- **対照実行**: 基準同士を 2 回比べて、物差し 1・2 とも差 0 件になること（揺れる値を洗い出して §5.2 のとおり名指しで除く）
- **破壊検証**: ブランチで次をわざと変え、該当する物差しに差が出ること
  1. 値を 1 か所（物差し 1・2）
  2. 擬似要素の値を 1 か所（物差し 1）
  3. `transition-duration` を 1 か所（物差し 1 の 2 つ目の読み方）
  4. キーフレームの中身を 1 か所（キーフレームの突き合わせ）
  5. 当たらない規則を 1 本足す（E8）

## 6. 完了条件（EARS）

| ID | 要求 | 確かめる手段 |
|---|---|---|
| E1 | §5.5 のどの状態・幅でも、ブランチの計算済みスタイル・動きのプロパティ・キーフレームは基準（`ba9249d`）と一致しなければならない（§5.4 と台帳で承認した差を除く） | §5.2・台帳 |
| E2 | §5.5 のどの状態・幅でも、ブランチの画面は基準と画素で一致しなければならない（マスクと台帳で承認した差の範囲を除く） | §5.3・台帳 |
| E3 | PR 4 の後、`apps/timer-web/package.json` の直接依存に `tailwindcss`・`@tailwindcss/postcss`・`autoprefixer`・`postcss` があってはならない | `package.json` |
| E4 | PR 4 の後、`main.tsx` は `@tasuki/ui` の CSS を import してはならず、ビルド出力の CSS で書体の `@font-face` は各 1 回でなければならない | ビルド出力・E2E の書体のドリフト検査 |
| E5 | timer の画面の CSS（`src/styles/*.css`）が生の色を書いたとき、検査は失敗しなければならない（`ui-exempt:` の申告を除く）。`.tsx` / `.ts` が生の色を書いたときも同じ（ALLOW の項目を除く） | `audit-ui-components`・`design-tokens.test.ts`・破壊検証 |
| E6 | timer の `.tsx` / `.ts` が D1 の許した形以外でクラス名を書いたとき、または字面のクラス名が timer の CSS にも部品層にも定義されていないとき、検査は失敗しなければならない（「まだ移していないファイル」の一覧に載ったファイルを除く） | D10 の恒久の検査・自己テスト・変異 |
| E7 | 在室状況の 3 状態は、それぞれトークンを解いた値の色で描かれなければならない（idle は属性の書き換えで測る） | E2E・変異 |
| E8 | 各 PR で足した CSS の規則（§5.5 の対象外を除く）は、§5 の実行中に 1 回以上当たらなければならない | §5.5 の規則の使用状況・台帳 |
| E9 | PR 4 の後、D8 の検索の結果は、1 件ずつ「書き直した」か「残す理由」に仕分けられていなければならない | `git grep`・台帳（人が仕分ける） |

## 7. 各 PR の検証

- 手元で `pnpm test`・`pnpm e2e`・scripts の自己テスト（bash で回す）・`pnpm audit`・`mutation-check` を回す
- §5 の物差し（PR 2・3 は囲いを外した一時ビルドでも回す・D3）
- 生の色の検査と D10 の恒久の検査の破壊検証
- E2E の a11y 走査（コントラスト・reduced-motion・書体のドリフト）。**フォーカス可視化の E2E は玄関しか見ていないので、timer のフォーカスの根拠にはしない**（§5.2 の全操作要素のフォーカスが根拠）
- 計画には `audit-plan-gate` を当てる
- レビュー: 文脈を共有しない `/code-review` を PR 番号を明示して通す。レビュー役には PR 単位の差分を渡す
- 配布: 本番への配布は勝手に行わない

## 8. Constitution Check

| 原則 | 本設計での扱い |
|---|---|
| I. テスト駆動開発 | 見た目の移植は、**緑の特性テスト（§5 の比較）の下で行う Refactor の段**として扱う。振る舞いの変わるもの（`presence.ts`・D10 の検査・在室の E2E・書き直すテスト）は「テスト → 赤 → 実装」の順で進め、コミットも物差し・検査・テストを先に置く（§4） |
| II. 技術選定は ADR を通す | Tailwind・PostCSS・`autoprefixer` を外すことを、PR 1 で ADR 0023 に記録してから実施する（D8） |
| III. 揮発インメモリと単純運用 | CSS と依存のみ。配布は利用者が決める |
| IV. 境界の型安全 | 該当なし（wire と境界の型に触れない） |
| V. 実画面検証 | §5。基準と並べた計算済みスタイル・動き・キーフレーム・画素の比較 |
| VI. 依存は内向き | 該当なし（ドメインに触れない）。`e2e/parity/` は `apps/` を相対パスで読まない |
| VII. 検査は壊して確かめる | §5.6 の対照実行と破壊検証。D10 の検査の自己テストと変異。変異パッチを PR ごとに当て直す |
| VIII. 記録が正本 | 本設計正本・ADR 0023・差の台帳（§5.1。比較の仕組みを消した後の再現手順を含む）。完了条件は §6 の EARS |
| IX. 小さく回す | 分割の理由（ガイドの理由 1・3）を §4 に書いた |
| X. 抽象は実需で | 共有の単位は既存の `primitives.tsx` と、2 画面以上が使う部品に限る。呼び出しの無い `IconButton` は消す。部品層への寄せは #316 |
| XI. 秘密と個人情報 | 該当なし |
