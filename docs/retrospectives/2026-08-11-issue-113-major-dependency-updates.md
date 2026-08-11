# 振り返り: メジャー依存 12 件の更新（#113）

**対象**: Issue #113 ・ **PR**: #118（spec/plan/tasks）/ #120 / #121 / #122 / #123 / #124 / #125
**期間**: 2026-08-11（着手から全 PR マージまで同日） ・ **`main`**: `6af135d` → `29f913f`

## 踏んだ罠（事実と再発条件）

### 1. 「ビルドが通る」を「設定が効いている」の代わりに使いかけた

**事実**: Tailwind 4 へ移して `@config` で既存の `tailwind.config.js` を読ませたところ、
`pnpm build` は 6/6 で通り警告も 0 件だった。しかし**通っただけでは、config が読まれた証拠に
ならない**。生成 CSS を直接見て、config 由来の 11 規則（`.text-presence-*` /
`.bg-presence-*` / `.rounded-*` / `.shadow-lg` / `.font-mono`）が更新前と同じ形で出ていることを
確かめて初めて成立が言えた。

**再発条件**: **設定ファイルを「読み込ませる」種類の変更全般。** 読み込みに失敗しても
既定値で動くため、ビルドもテストも緑のまま通る。とくに Tailwind のようにユーティリティを
生成する道具では、config が読まれなくても「ユーティリティ名は存在するが値が既定になる」形で
静かに劣化する。

**対処**: 生成物を直接検査したうえで、`@config` を外して**在室状況の 3 色が骨色へ退化し、
影が Tailwind 既定へ戻ること**まで確認した。なお `rounded-md` は Tailwind 4 の既定と
偶然 8px で一致するため、**この 1 指標だけを見ていたら破壊検証が空振りしていた**。

### 2. 期限つき例外の宛先が、引き取り元のクローズで消えた

**事実**: `postcss-selector-parser` の期限つき例外（解除予定 2026-08-14）は #69 PR-2 の
完了条件だったが、#69 は 2026-08-11 にクローズ済み。#113 の T017 が引き取っていたものの、
**#113 の全作業日が 2026-08-11 で解除予定日より前**だったため実行できず、宛先を失った。

**再発条件**: **「期限つきの約束」を、その期限より前に閉じる Issue に預けたとき。**
tasks.md は「作業日が解除予定日より前なら最後の PR へ移す」という条件を持っていたが、
**最後の PR も同じ日に出る可能性を織り込んでいなかった。**

**対処**: 独立した Issue（#126）へ移した。日付を見て諦めるのではなく、例外を外して
`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` で落ちることを実測してから戻している。

### 3. `pnpm install` の「Already up to date」で `node_modules` の実体を取り違えた

**事実**: TypeScript 7.0.2 の不採用根拠を使い捨てブランチで測ったあと、ブランチを破棄して
`pnpm install` を走らせたら `Already up to date` が返った。**作業ツリーには TS 7 の
package.json が残ったままで、`node_modules` も TS 7 のままだった**（演習ブランチで
コミットしていなかったため checkout で持ち越された）。

**再発条件**: 使い捨てブランチで依存を差し替えて測り、コミットせずに戻ったとき。
`git checkout <branch>` は未コミットの変更を持ち越すので、「ブランチを消したから戻った」は
成立しない。

**対処**: `git checkout -- .` で作業ツリーを HEAD へ戻し、`pnpm install` を再実行し、
**`node_modules/typescript/package.json` の版を直接読んで 6.0.3 であることを確認**してから
4 検査を測り直した。これは #69 で記録した「`node_modules` が最新だと供給網検証が短絡する」の
同型で、**同じ短絡が「戻したつもり」の確認でも起きる**。

### 4. `--force` がまた turbo ではなくサブコマンドへ渡った

**事実**: `corepack pnpm --filter @tasuki/timer-web build --force` が
`CACError: Unknown option --force` で落ちた。`--force` が turbo ではなく vite へ渡っていた。

**再発条件**: `pnpm --filter <pkg> <script> <flag>` の形。#113 の spec 作成時にも
`pnpm test -- --force` で同じ取り違えを起こしており、**形を変えて 2 度目**。

**対処**: turbo へ渡すときは `pnpm <script> --force`（フィルタが要るなら
`pnpm exec turbo run <task> --filter=<pkg> --force`）。

### 5. 観測手段の側の誤りを、対象の不具合と読みかけた（2 件）

**事実 A**: Playwright でルーム作成ボタンを押そうとして 30 秒タイムアウトした。原因は
**名前の入力が先という手順を踏んでいなかった**こと（ボタンは `disabled`）。製品側は正常。

**事実 B**: nanoid 6 の確認で、参加者 ID（`p_`）と再開トークン（`rt_`）を `localStorage`
だけ見て「無い」と判定した。実際は **`sessionStorage['tdd-mob:resume-identity']`** にあり、
WS フレーム上にも流れていた。

**再発条件**: 既存の E2E ヘルパ（`e2e/support/timer.ts`）を読まずに手順を自分で組んだとき。
**製品には正しい手順の正本があり、そこを読めば両方とも起きなかった。**

**対処**: `support/timer.ts` の `createRoom` / `joinAsDriverAt` と同じ手順に揃え、
保存先は localStorage / sessionStorage / WS フレームの 3 経路を見るようにした。

## 検査の穴（緑のまま壊れていたものは何か・なぜ緑だったか）

### 1. `apps/landing` の `@types/node` は、誰も宣言しないまま通っていた

**何が壊れていたか**: `apps/landing/tests/` は `node:fs` / `node:path` / `process` を
使っているのに、`apps/landing/package.json` は `@types/node` を宣言しておらず、
`tsconfig.json` の `types: ["vite/client"]` も node 型を含めていなかった。

**なぜ緑だったか**: **vitest 3 の型グラフが `@types/node` をプログラムへ引き込んでいた**ため、
`tsc --noEmit` が偶然通っていた。vitest 4 に上げた瞬間に 12 件の型エラーが出た
（該当ファイルは 2026-08-06 と 08-08 に追加されており、それ以来ずっとこの状態だった）。
つまり**型検査は「landing が node 型を持っている」ことを検査していたのではなく、
たまたま第三者の依存が漏らした型に乗っていた**。

**ただし機序は最後まで特定していない。** vitest 3 と 4 のどちらの配布物にも
`/// <reference types="node" />` は無く、どの型定義が `@types/node` を引き込んでいたかは
突き止められなかった。確かめたのは 3 点のみ ——（a）vitest 4 の前は通っていた
（b）vitest 4 で落ちる（c）落ちた時点で `--explainFiles` の出力に `@types/node` が居ない。
**「vitest の型グラフ経由」はこの 3 点からの推定である。**

**対処**: 依存の宣言（`@types/node`）と `tsconfig` の `types` への `"node"` 追加の**両方**を
明示にした。`types` から `"node"` を外すと同じエラーが再現することを確認済み。

### 2. カバレッジのしきい値は、計測器が変わると意味が変わる

**何が壊れていたか**: `packages/timer-core` の branches が 93.91% → 89.61% に落ちてしきい値
（90%）を割った。**テストは 662 件すべて緑・ソースは 1 行も変えていない。**

**なぜそうなったか**: `@vitest/coverage-v8@3.2.7` では AST 対応の再マッピングが
`experimentalAstAwareRemapping`（既定オフ）の実験オプションだったのが、**4.1.10 では
そのオプションごと消えて既定の唯一の挙動になった**。数え方が変わった証拠として、
下がったファイル（`decide.ts` 94.17 → 86.95）と**上がったファイル**（`display-name.ts`
94.11 → 100）が混在する。

**つまり旧計測の 93.91% は実態より甘く出ていた。** しきい値 90 を満たしていたのは
計測器の粗さのおかげだった部分がある。

**対処**: **しきい値は下げていない。** 未到達分岐の中身を読み、防御的な `??` の空振りではなく
実在の定義域規則（`decideMemberMove` の移動元・移動先 × 下限側・上限側の拒否）が
一切検査されていないと分かったので、**4 ケースを追加して埋めた**（92.38%）。追加した検査は
実装から範囲検査を外して 4 件とも赤くなることを確認済み。

### 3. テスト件数の突合は「passed」を見ないと `.skip` を取り逃がす

**何が壊れていたか**: 本件で持ち込んだ「テスト実行件数の突合」という確認手段そのもの。

**なぜ危ういか**: 破壊検証（1 ケースを `.skip`）の出力は
`Tests 5 passed | 1 skipped (6)` だった。**括弧内の総数は 6 のまま変わらない。**
括弧内だけを突き合わせる運用にしていたら、`.skip` による静かな無効化を取り逃がしていた。

**対処**: 基準（T006）を passed 側で記録し、各 PR も passed 側で照合した。この性質を
PR #120 の本文に明記した。

### 4. stylelint の新規則が、正当な CSS を「不明」と報告した

**何が壊れていたか**: 検査の側。`stylelint-config-recommended` 18 で新規追加された
`at-rule-descriptor-value-no-unknown` が、`packages/ui/src/tokens/fonts.css` の日本語
サブセット用 `unicode-range`（数千レンジ）を「Unknown value」と報告した。

**なぜ偽陽性と言えるか**: 短いレンジ（`U+00A0, U+4E01, U+FF61-FF65`）は通り、
明らかに不正な値（`totally-not-a-range`）は正しく検出される。本ファイルでだけ
`[csstree-match] BREAK after 15000 iterations` が出た直後に「不明」と報告される。
**値が不正なのではなく、照合器が反復上限で諦めた結果を「不明」に丸めている。**

**対処**: 当該ファイルに限って 1 規則を無効化し、実測 3 点を設定ファイルにコメントで残した。
記述名の検査（`at-rule-descriptor-no-unknown`）は有効なまま。

## 次への申し送り（どの文書・Issue に反映したか）

| 教訓・残件 | 反映先 |
|---|---|
| `@tailwindcss/postcss` の追加は技術選定の変更に当たらない（原則 II の解釈） | `docs/adr/0001`（追記） |
| Tailwind の設定は `@config` で読み、CSS-first へは移行しない | `docs/adr/0001`（追記）・`apps/timer-web/src/index.css` |
| **`autoprefixer` は Tailwind 4 でも冗長ではない**（外すと CSS が増え `-moz-column-gap` が消える） | `apps/timer-web/postcss.config.js`・`docs/adr/0001`（追記）→ **#71** |
| stylelint の偽陽性の実測 3 点 | `packages/ui/stylelint.config.mjs` |
| vitest 4 で `test.poolOptions` が削除されたこと | `apps/timer-web/vitest.config.ts` |
| vite 8 の `configLoader: 'native'` では `__dirname` が使えないこと | `apps/timer-web/vite.config.ts` |
| landing の node 型が暗黙の借り物だったこと | `apps/landing/tsconfig.json` |
| **`postcss-selector-parser` の期限つき例外の削除**（2026-08-14 以降） | **#126**（新規） |
| `typescript@7.0.2` の不採用と再開条件 | Issue #113 のコメント |

### 運用として変えたいこと（提案・この振り返りでは決めない）

- **期限つきの約束は、期限より前に閉じうる Issue に預けない。** #69 → #113 → #126 と
  2 度たらい回しになった。期限が来る日を持つ作業は最初から独立した Issue に置くか、
  期限を検知する検査（`pnpm-workspace.yaml` の解除予定日を読んで期限超過なら落とす）を
  持つのが筋。後者は #70（CI 整備）の範囲

## 数値

| 指標 | 着手前（`6af135d`） | 完了時（`29f913f`） |
|---|---|---|
| テスト件数 | 1,970 | **1,974**（+4） |
| `pnpm outdated -r` のメジャー残件 | 12 | **1**（`typescript`・不採用として記録済み） |
| `pnpm audit --audit-level high` | 0 件 | 0 件 |
| 構造監査 SC029 / SC030 / SC032 | 7 / 3 / 1023-1051 | 同値 |
| 構造監査 SC036（テスト総数） | 1,378 | 1,382 |

## 関連

- Issue: #113 ・ 残件: #126 ・ 申し送り先: #71
- spec / plan / tasks: `docs/superpowers/{specs,plans}/2026-08-11-major-dependency-updates*`
- 前段の振り返り: [`2026-08-11-issue-69-supply-chain.md`](./2026-08-11-issue-69-supply-chain.md)
