# R5 core の片付け — 定型バンクの冗長なデータと使われていない公開面（#365）— 実装計画

- **Issue**: [#365](https://github.com/tomohiroJin/tasuki-tools/issues/365)（親 [#360](https://github.com/tomohiroJin/tasuki-tools/issues/360)）
- **設計正本**: [`2026-10-13-large-refactoring-design.md`](../specs/2026-10-13-large-refactoring-design.md) §2（制御はコードで）・§6（順番。波 0）
- **日付**: 2026-10-13
- **実測時点**: main `e9180c9` ＋ #379 の作業ブランチ（#361〜#364 の後。`3d348ba`）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 定型のお題の選び方の結果を、変える前に特性テストで固定する（Task 1）。import の書き方の規則は、違反を置いて赤を見てから全体を直す（Task 4） |
| II. 技術選定は ADR を通す | 該当なし | 依存を足さない。ESLint の組み込みの規則（`no-restricted-syntax`）だけを使う |
| III. 揮発インメモリと単純運用 | 該当なし | 状態の持ち方に触れない |
| IV. 境界の型安全 | 該当なし | 境界の検証に触れない（スキーマの中身は変えず、公開だけを外す） |
| V. 実画面検証 | 該当なし | 利用者の通る経路は変わらない。お題の選び方は特性テストで、wire は既存の実 WS 越しのテストで確かめる |
| VI. 依存は内向き | 通過 | パッケージの外から使われない記号を公開面から外す。外から使うものは公開面（`index.ts`）を通す形のまま |
| VII. 検査は壊して確かめる | 通過 | 特性テストは壊して赤を見る（Task 1）。import の書き方の規則は違反を置いて赤を見る（Task 4） |
| VIII. 記録が正本 | 通過 | 公開を残すものは、理由を例外表（`SC039C_EXCEPTIONS`）に書く。理由を書けないものは公開を外す |
| IX. 小さく回す | 通過 | PR 1 本（#379 に積む。2026-10-13 の利用者の了承）。デプロイは伴わない |
| X. 抽象は実需で | 通過 | 定型バンクの `languages` は、全件が同じ値で使い分けの実需が無いので、欄ごと外す（§2） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密・個人情報を扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 1. 着手時点の実測（Issue 本文の前提との差）

使われていない公開は、`audit-structure.mjs` の SC-039 が数えている記号を一時的に書き出して測った（いまは「公開記号 6 件 / 公開契約 9 件」）。

| Issue の項目 | 実測 | 確かめた場所 |
|---|---|---|
| 定型バンクの `languages` | **Issue のとおり。** 33 件すべてが `LANGUAGES` の 10 言語を同じ順で並べる（`topic-bank.ts` 582 行のうち約 400 行）。難易度は easy 12・medium 14・hard 7 | 実行して数えた |
| 〃 選び方 | `pickTopicFallback` の言語の絞り込みは、許可リストの言語なら何も除かない。**許可リストに無い言語**（境界をすり抜けた値）では全件が外れ、難易度で絞らずに全 33 件から選ぶ。この枝は `fallback.test.ts` が固定している（「COBOL」の組） | `fallback.ts:23-27`・`fallback.test.ts` |
| 〃 公開 | `TOPIC_BANK` と `TopicBankEntry` を外から使う所は 0。`TOPIC_BANK` は自分のテストだけが `../src/index.js` から取る | `grep` |
| roulette-core の公開 | `SPIN_DURATION_MS`: 外の製品コードは使わない。**同期サーバーのテストが 3 か所で使う**（`roulette-handlers.test.ts:208,266,325`）。e2e はコメントで名前を挙げるだけ<br>`MAX_GUESTS`・`MAX_WHEEL`: 外から使う所は 0<br>**Issue に無かったもの**: `ROULETTE_ERROR_CODES` も外の製品コードは使わない。**roulette-web のテスト（文言が書体に収まるか）が使う** | SC-039 ④・`grep` |
| 〃 #94 PR 3 の見込み | PR 3 の計画（`2026-10-12-facilitator-roulette.md` §4）と設計（§6.3）は、席の名前の切り方を「12 席まで 5.5 字・13 席以上 4 字」と決めていて、`MAX_WHEEL`・`MAX_GUESTS` を使う記述は無い。PR 3 の PR はまだ無い（2026-10-13 時点） | 同左 |
| topic-core の公開 | `TopicSchema`・`TopicStateSchema`: 外から使う所は 0。**型のテスト（`wire-types.test.ts`、#363）が `../src/schemas.js` から取る**<br>`TopicErrorCodeSchema`: 自分のファイルの中だけで使う<br>**Issue に無かったもの**: `TOPIC_ERROR_CODES` も外の製品コードは使わない。**topic-web のテスト（文言が書体に収まるか）と自分のテストが使う** | SC-039 ③④・`grep` |
| import の書き方 | **poker-core だけではなかった。** 拡張子の無い相対 import は、poker-core 25・markdown 7・room-core 1（`src` と `test(s)` の合計）。ほかの packages は 0<br>書き方を守らせる検査は無い | `grep` |
| SC-039 のほかの項目 | `dev-hub-redirect` の `HUB_PORT`・`hubRedirectPlugin` も数えられている。dev サーバーの設定（`vite.config.ts`）が使うもので、SC-039 の参照元（各パッケージの `src`）に入っていないだけ。**core ではないのでこの Issue では触らない** | 同左 |
| 変異のパッチ | 触るファイルに当たるもの: m76（topic-core `schemas.ts`）・m24・m32（poker-core `round.ts`）。どれも文脈が import 行やスキーマの公開に掛からない見込み。当たらなければ当て直す（ID は変えない） | `scripts/mutations/*.patch` |

## 2. この PR でやること・やらないこと

**やること**

1. **定型のお題の選び方の結果を特性テストで固定する**（Task 1）
2. **定型バンクから `languages` の欄を外す**（Task 2）
   - 選び方は「許可リストの言語なら、難易度で絞る。許可リストに無い言語なら、全件から選ぶ」と書き直す。全ての入力で結果が変わらない
   - **欄を省略可能にする案（Issue の例）は採らない。** 全件が同じ値で、言語ごとに出し分ける要望も計画も無い（原則 X）。省略可能にすると、誰も使わない分岐と「省略したら全言語」という決まりが残る。将来必要になったら、そのとき欄を戻す
3. **外から使われていない公開を外す**（Task 3）

   | 記号 | どうするか | 理由 |
   |---|---|---|
   | `TOPIC_BANK`・`TopicBankEntry` | `index.ts` から外す。テストは `../src/topic-bank.js` から取る | 外の利用者は 0 |
   | `TopicErrorCodeSchema` | 宣言の `export` ごと外す | 自分のファイルの中でしか使わない |
   | `TopicSchema`・`TopicStateSchema` | `index.ts` から外す。宣言の `export` は残し、`SC039C_EXCEPTIONS` に理由を書く | 型のテスト（#363）の土台。外すと、手書きの型とスキーマの一致を見る検査が書けない |
   | `MAX_GUESTS`・`MAX_WHEEL` | `index.ts` から外す | 外の利用者は 0。#94 PR 3 の計画も使わない（§1）。PR 3 が要るようになったら、そのとき公開する |
   | `SPIN_DURATION_MS` | `index.ts` から外す。同期サーバーのテストは、wire で届いた `durationMs` を使う | 同期サーバーのテストが確かめたいのは「wire で届いた長さだけ待つと回せる」こと。定数と `durationMs` が等しいことは、core のテスト（`roulette.test.ts:166`）が既に固定している |
   | `ROULETTE_ERROR_CODES`・`TOPIC_ERROR_CODES` | **残す**。`SC039C_EXCEPTIONS`（topic）に理由を書く | 各 web の「文言が書体に収まるか」の検査の土台。外すとコードの一覧が web のテストへ写される |

4. **packages の相対 import を `.js` 付きにそろえ、ESLint の規則で守らせる**（Task 4）
   - 対象は `packages/*/src`・`packages/*/test(s)` の `.ts`。拡張子の無い相対の `import` / `export … from` を拒む
   - apps は対象にしない（Vite の web と同期サーバーで書き方の決まりが別。この Issue の範囲の外）

**やらないこと**

| 項目 | 理由 |
|---|---|
| `dev-hub-redirect` の SC-039 の 2 件 | core ではない。SC-039 の参照元の宣言（`vite.config.ts` を見ていない）の問題で、別の話 |
| SC-039 ④ を 0 件にすること | `ROULETTE_ERROR_CODES`・`TOPIC_ERROR_CODES` は理由があって残す。④には例外表が無いので、2 件は残る（④の例外表を作るかは、この Issue の範囲の外） |
| apps の import の書き方 | 上の 4 |

## 3. 振る舞いを保つ方法

- **お題の選び方**: 全ての言語（許可リストの 10 言語と、許可リストに無い言語）× 3 つの難易度 × 種（`now`）× 直前のお題の有無で、返るお題が変わらないことを特性テストで固定する（Task 1）
- **wire**: 公開を外すだけで、スキーマの中身は変えない。`TopicFrameSchema` などの公開のスキーマは、外したスキーマを内側で使い続ける
- **型**: `pnpm typecheck` が、外した記号を使っている所がないことを確かめる
- **ログ**: 触らない

## 4. タスク

### Task 1: 定型のお題の選び方を特性テストで固定する

**変えるファイル**: `packages/topic-core/tests/fallback.test.ts`

- 難易度ごとに、`now = 0, 1, …, (候補の数 − 1)` で返るタイトルの並びを、期待値に直書きする（easy 12・medium 14・hard 7）
- それが**全ての許可リストの言語で同じ**であることを見る（言語の絞り込みが何も除いていないことの固定）
- 許可リストに無い言語では、`now = 0, …, 32` の並びが全 33 件の並びになること（既存の「COBOL」の組を、並びまで固定する形に強める）
- 直前のお題を渡したときの並び（直前を除いた候補から選ぶ）を、難易度ごとに 1 つずつ固定する
- **確かめる（緑で入るので、壊して赤を見る）**
  - 言語の絞り込みを外す（`languages.includes` を常に真にする）→「COBOL」の組が赤
  - 難易度の絞り込みを外す → 並びの組が赤
  - 定型バンクの 2 件の順を入れ替える → 並びの組が赤
- 所要: 1 時間

### Task 2: 定型バンクから `languages` を外す

**変えるファイル**

- `packages/topic-core/src/topic-bank.ts`: `TopicBankEntry` から `languages` を外し、33 件の `languages` の配列を消す（約 400 行減る）。冒頭の注記に、外した理由（全件が同じ値・使い分けの実需が無い）を 1 段落で書く
- `packages/topic-core/src/fallback.ts`: 選び方を書き直す
  - 許可リストの言語か（`LANGUAGES.includes(language)`）を先に見る
  - 許可リストの言語なら、難易度で絞った候補（空なら全件）から選ぶ
  - 許可リストに無い言語なら、全件から選ぶ（今の「言語で絞ると 0 件 → 全件」と同じ結果）
- `packages/topic-core/tests/fallback.test.ts`: 「どの言語×難易度でも候補が 2 件以上」の組は、言語の次元が無くなるので「どの難易度でも候補が 2 件以上」に書き換える（**書き換える既存のテストはこの 1 件**。見ている性質は同じ）

**確かめる**: Task 1 の特性テストが緑。変異 m76 を当て直す（当たらなければ。ID は変えない）

- 所要: 45 分

### Task 3: 外から使われていない公開を外す

**変えるファイル**

- `packages/topic-core/src/index.ts`: `TOPIC_BANK`・`TopicBankEntry`・`TopicSchema`・`TopicStateSchema`・`TopicErrorCodeSchema` を外す
- `packages/topic-core/src/schemas.ts`: `TopicErrorCodeSchema` の `export` を外す
- `packages/topic-core/tests/fallback.test.ts`: `TOPIC_BANK` を `../src/topic-bank.js` から取る
- `packages/roulette-core/src/index.ts`: `MAX_GUESTS`・`MAX_WHEEL`・`SPIN_DURATION_MS` を外す
- `packages/roulette-core/tests/limits.test.ts`: `../src/limits.js` から取る
- `apps/tasuki-sync/test/roulette-handlers.test.ts`
  - 待つ長さは、届いたビューの `spin.durationMs` を使う（3 か所）
  - `:325` の「`durationMs` が定数と等しい」は、core のテストが固定しているので、同期サーバーの側は「途中から加わった画面にも、回した画面と同じ `durationMs` が届く」に読み替える
- `scripts/audit-structure.mjs` の `SC039C_EXCEPTIONS`: `TopicSchema`・`TopicStateSchema`（型のテストの土台）と `TOPIC_ERROR_CODES`（topic-web の文言の検査と、自分の文言表の網羅の検査の土台）を、理由つきで足す

**確かめる**

- `pnpm typecheck`・`pnpm test` が緑
- `audit-structure.mjs` の SC-039 が「公開記号 6 → 2 件 / 公開契約 9 → 2 件」になる
  - 公開記号（③）に残るのは `dev-hub-redirect` の 2 件
  - 公開契約（④）に残るのは、理由があって残す `ROULETTE_ERROR_CODES`・`TOPIC_ERROR_CODES` の 2 件
  - 数は実装のときに測り直して記録に残す
- `audit-public-surface.mjs` が緑
- 所要: 1 時間

### Task 4: packages の相対 import を `.js` にそろえ、ESLint で守らせる

**先に書く赤**

- `eslint.config.mjs` に、`packages/*/{src,test,tests}/**/*.ts` を対象とする `no-restricted-syntax` の規則を足す
  - 拡張子の無い相対の `import` / `export … from` / `import()` を拒む
  - 文言で「`.js` を付ける」ことと理由（ほかの packages の書き方。`moduleResolution: "Bundler"` でも Node でも同じ指定子で解決できる）を出す
- この時点で `pnpm lint` が 33 件で赤になることを確かめる（poker-core 25・markdown 7・room-core 1）

**変えるファイル**: 上の 33 か所に `.js` を付ける

**確かめる**

- `pnpm lint`・`pnpm typecheck`・`pnpm test` が緑
- 拡張子を 1 つ外すと `pnpm lint` が赤（壊して確かめる）
- 変異 m24・m32 が当たる（当たらなければ当て直す。ID は変えない）
- 所要: 1 時間

### Task 5: 文書を合わせ、通して確かめる

- 設計正本 §9（決めたこと）に、`languages` を省略可能にせず外したことを日付つきで足す
- 計画の末尾に「実施の記録」を足す
- 通しで確かめる
  - `pnpm test`・`pnpm typecheck`・`pnpm lint`
  - 構造監査（`audit-structure`・`audit-public-surface`・`audit-dependency-direction`）
  - `node scripts/mutation-check.mjs`
  - e2e は CI で確かめる
- 所要: 45 分（変異検査の時間を除く）

## 5. 変異の ID

**新しい ID は使わない**（#361〜#364 と同じ理由。#94 PR 3 の宣言とぶつかる）。特性テストと ESLint の規則の破壊検証は、手で壊して赤を見る。

## 6. 完了条件（#365 の完了条件をこの計画に合わせて読み替えたもの）

- [x] 定型のお題の選び方の結果が変更前と同じ（Task 1 の特性テストが、変える前も後も緑）
- [x] 定型バンクに `languages` の欄が無い
- [x] 外から使われていない公開が外れ、残したものは理由が例外表にある
- [x] packages の相対 import がすべて `.js` 付きで、ESLint が違反を拒む（壊して確かめた）
- [x] `audit-public-surface.mjs`・`audit-structure.mjs` が緑
- [x] 変異検査が緑（パッチの ID は変えない）
- [x] #360 の共通の守りを満たす

## 7. 実施の記録（2026-10-13）

計画から外れたこと・計画の時点で分かっていなかったことだけを書く。

- **`languages` を欄ごと外すことは、着手前に利用者が了承した**（§2 の 2）。`topic-bank.ts` は 582 → 190 行になった
- **特性テストは 8 件になった**（難易度ごとの並び 3・直前を除く並び 3・許可リストに無い言語 1・種の剰余と負の値 1）。計画に無かった「種の剰余と負の値」は、`Math.abs(now) % pool.length` の 2 つの性質（候補の数を超える種・負の種）を固定するために足した。言語の絞り込みを外す・難易度の絞り込みを外す・バンクの 2 件を入れ替える、の 3 通りで赤を見た
- **選び方は `isAllowedLanguage` の 1 つの判定にまとまった。** 以前は「言語と難易度で絞る → 0 件なら言語だけで絞る → 0 件なら全件」の 3 段で、2 段目は全件と同じ結果になっていた（全件が全言語を持つため）
- **SC-039 は計画どおり、公開記号 6 → 2 件・公開契約 9 → 2 件**
- **ESLint の規則は、規則を先に入れて 33 件の赤を見てから直した**（poker-core 25・markdown 7・room-core 1）。packages のほかの 8 つは 0 件だった。`.js` を 1 つ外すと赤に戻ることも確かめた
- **変異のパッチは 1 本も当て直さずに済んだ**（触ったファイルの差分の文脈は、どのパッチにも掛からなかった）。変異検査は全件検出
