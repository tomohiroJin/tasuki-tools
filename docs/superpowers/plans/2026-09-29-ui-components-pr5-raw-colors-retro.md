# 生の色を仕分けて検査を有効にし、epic を閉じる（#320 PR 5）実装計画

> **作業者へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: 画面の CSS（要素層を含む）に残る生の色を全部トークンへ仕分け、`scripts/audit-ui-components.mjs` の
**生の色の禁止を画面の CSS へ広げる**（正本 D10 の 3・§8 E9）。ADR 0022 に実施状況を追記し、epic #320 の振り返りを書く。

**方式**: 生の色は 2 通りに仕分ける。(a) **既存の語彙（tint / veil / edge / line / faint）に近い値は畳む**（パレットの注釈
「数値の α をコンポーネントに直書きさせないための語彙」に従う。見た目が少し変わる）。(b) **語彙に相当が無い値は、役割の名前で
いまの値のままトークンにする**（影・札の地・伏せ札の裏・在室の色など。見た目は変わらない）。検査は、画面の CSS の規則の宣言に
部品の CSS と同じ `findRawColors` を当て、`ui-exempt:` で外せる（正本 D9。外す箇所はこの PR では作らない）。

**技術**: 素の CSS / node の自己テスト（`node --test`）/ Playwright（E2E）

**設計正本**: `docs/superpowers/specs/2026-09-27-ui-components-layer-design.md`（**計画は正本に従属する。両方を読むこと**）。
この計画は正本 §7 の **PR 5** を扱う。出発点は正本 D10 の 3・§6（ADR の「実施は PR n」の書き方）・§8 E9。
PR 4 が入った main（`baf07ee`）の現物を見て書いた。

## 実測した生の色（main `baf07ee`・画面の CSS の宣言 28 件）

`findRawColors` を画面の CSS の全宣言に当てて数えた（一時スクリプト。コミットしない）。

| 置き場 | 件数 | 中身 |
|---|---|---|
| `apps/poker-web/src/index.css` | 12 | 行と手札の沈んだ地・席のカード（点線・伏せ札の裏と縞と影）・投票済みの札・未投票の印・集計の発光・エラーの枠 |
| `apps/timer-web/src/index.css` | 7 | 在室の 3 色と P3 の 2 色・真鍮の発光・計器の周辺減光 |
| `packages/ui/src/elements/card.css` | 5 | 札の縁・地のグラデーション・内枠・ホバーと選択の影 |
| `packages/ui/src/elements/controls.css` | 3 | ボタンの影 2 つ・控えめなボタンのホバーの敷き |
| `packages/ui/src/elements/reset.css` | 1 | 羅紗の織り目の影 |

**未投票の印（poker の `.no-vote`・「未投票」の字）は α 0.4 の象牙で、卓の上で 2.65:1〜3.29:1 と AA を割っている**（トークンの値からの計算）。
E2E の走査はどのシナリオでも未投票を出していない（1 人のルームで全員が投票してから公開するため）。

## この計画で決めたこと（正本に無い細部）

| # | 決定 | 根拠 |
|---|---|---|
| P1 | **仕分けの方式は上の (a) / (b)**。(a) で見た目が変わるものは下の表に全部並べ、利用者の確認を取る | パレットの注釈（`palette.css` の「アクセントの派生」）が「同じ薄い敷きを 0.10 / 0.12 / 0.14 と書き分けても意味は無い」と決めている。一方、影や札の地は語彙の外で、近い語彙に寄せると役割が違う色になる |
| P2 | **未投票の印は `--ivory-faint` にする**（α 0.4 → 0.66） | 12px の本文で AA を満たす最も淡い段が faint（パレットの「文字の 3 段」）。α 0.4 は文字に使えない値 |
| P3 | **影は `shape.css` に、色は `palette.css` に置く**（影は `--shadow-*`、色は役割の名前） | 正本 D10 の 3「影の黒などパレット外の値はトークン（`--shadow-*` など）へ寄せる」。既存の `--shadow-card` / `--shadow-popover` と同じ置き場 |
| P4 | **在室の 3 色と P3 の上書きはトークン層へ移し、timer は `--color-presence-*` を別名として残す** | timer の Tailwind のクラス（`bg-[var(--color-presence-online)]` など）を触らない（#321 の範囲）。P3 の `@supports` もトークン層へ移す |
| P5 | **生の色の違反は `ui-exempt:` で外せる**（入力欄の写しと同じ作法）。**この PR では外す箇所を作らない** | 正本 D9 は「規則 1 つを免除する」申告を D10 全体に置いている。利用者の方針「共有は既定・強制しない」 |
| P6 | **`@keyframes` の中の宣言も生の色を見る**（セレクタの判定は飛ばすまま） | 画面の CSS の `checkScreenCss` は `@keyframes` の中を丸ごと飛ばしている。色だけは破れる（部品の CSS の側は PR 1 のレビューでこれを塞いだ） |
| P7 | 変異 **m114** を登録する（画面の CSS の生の色の判定を外す）。検出するのは自己テスト | 自己テストは `node --test` で、`mutation-check.mjs` に載る（m111〜m113 と同じ扱い） |
| P8 | **振り返りは epic 全体（PR 1〜5）を 1 本**で書く（`docs/retrospectives/2026-09-29-issue-320-ui-components-layer.md`） | ガイド「epic の完了時に書く。PR 1 件ごとには書かない」 |

**見た目が変わるもの**（利用者の確認が要る。Task 7 で main と並べて撮る）:

| 画面 | いま | 仕分け先 | 変化 |
|---|---|---|---|
| poker の未投票の印（字） | 象牙 α 0.4 | `--ivory-faint`（α 0.66） | **はっきり読めるようになる**（AA の修正） |
| poker の未投票の印（点線） | 象牙 α 0.25 | `--line-strong`（α 0.26） | ほぼ同じ |
| poker の考え中の席のカード（点線） | 象牙 α 0.3 | `--line-strong`（α 0.26） | わずかに淡い |
| poker の伏せ札の縞（45°） | 真鍮 α 0.55 | `--gold-edge`（α 0.5） | わずかに淡い |
| poker の「投票済み」の札の枠 | 緑 α 0.4 | `--jade-edge`（翡翠 α 0.5） | 翡翠に揃い、少し鮮やか |
| poker のエラーの枠と地 | `--rose` 系 α 0.45 / 0.14 | `--rose-edge` / `--rose-tint` | 朱が少し明るく（`--rose-bright` 系）なる。帯と揃う |
| 控えめなボタンのホバー（poker・玄関・お題ツール） | `--gold` α 0.12 | `--gold-tint`（`--gold-bright` α 0.12） | 敷きの色味がわずかに明るい |

ほかの 21 件は値を変えずにトークンへ移す（見た目は変わらない）。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。
様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 1 で自己テストと E2E（未投票の印の AA）を先に書き、赤を見てから Task 2 で検査を、Task 3〜5 で置き換えを書く |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | CSS と検査と文書のみ。配布は epic の区切りとして利用者に諮る（この PR では配らない） |
| IV. 境界の型安全 | 該当なし | 境界を越えるデータを扱わない |
| V. 実画面検証 | 通過 | Task 7 で上の表の画面を main と並べて撮り、Chrome で目視する |
| VI. 依存は内向き | 該当なし | ドメインに触れない |
| VII. 検査は壊して確かめる | 通過 | Task 2 の対照実行（main の 28 件が名指しで出る）・m114・Task 6 の破壊検証 |
| VIII. 記録が正本 | 通過 | ADR 0022 に実施状況を追記し、振り返りを `docs/retrospectives/` に書く。**この計画に数値の正本を作らない** |
| IX. 小さく回す | 通過 | PR 5 は生の色と記録だけ。分割の理由は正本 §7 |
| X. 抽象は実需で | 通過 | 新しいトークンはどれも既存の宣言の置き換えで、使われないトークンを作らない |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密も個人情報も扱わない |

**逸脱なし。**

## 全体の制約

- **ブランチ**: `feature/issue-320-pr5-raw-colors-retro`（main `baf07ee` から切った。この計画のコミットを含んだまま PR 5 にする）
- **破壊検証の前に `git status --porcelain` が空であることを見る**
- **コミットしたらすぐ push する**
- **本番へ配布しない**（epic の区切りの配布は、マージの後に利用者へ諮る）
- トークン層（`packages/ui/src/tokens/`）は要素・クラスのセレクタを置かない（stylelint が落とす）。`:root` と `@supports` だけ
- 部品の CSS のコメントと同じく、**`packages/ui/src` 配下の CSS のコメントに `font-size:` と `font:` の字面を書かない**
- timer の TSX（Tailwind のクラス）は触らない（#321 の範囲）
- scripts の自己テストは **bash** で回す
- **`node scripts/mutation-check.mjs --help` は引数を解さず全件を走らせる**。m114 だけを見るときは `git apply` → 自己テスト → `git apply -R`
- 決定は完了形で書かない（ADR の追記は「実施した PR」を事実として書くのはよいが、未来の約束を完了形で書かない）
- 追記は ADR の**末尾**へ（節の途中に足すと直後の小節が親を変える）

## Review Focus

1. **検査が画面の CSS の一部しか見ない**（`@keyframes` の中・`@media` の中・`:root` のカスタムプロパティ・一覧のセレクタ）→ Task 1 の自己テストが族ごとに 1 件ずつ固定する
2. **置き換えで値が変わったのに表に無い**（(b) のつもりで近い既存トークンへ寄せた）→ Task 7 の撮影で、上の表に無い差が出たら止める
3. **P3 の上書きの移設で、対応ディスプレイの在室の色が sRGB に戻る**（`@supports` の中の名前と別名の関係の取り違え）→ Task 5 Step 3 で計算後の値を見る
4. **トークンの置き換えで AA が割れる**（`--rose-tint` の上の `--rose-pale`・`--felt-sink` の上の `--ivory-faint`）→ Task 1 の E2E が未投票の印を走査する。エラーの枠は PR 2 の `notices-a11y` が測っている
5. **振り返りの数値が他の文書と食い違う**（件数・PR 番号）→ 振り返りには数を転記せず、PR 番号と事実だけを書く

---

### Task 1: 自己テストと E2E を先に書き、赤を見る

**Files:**
- Modify: `scripts/audit-ui-components.test.mjs`（末尾に `describe` を 1 つ足す）
- Modify: `e2e/specs/poker-a11y.spec.ts`（テストを 1 本足す）

**Interfaces:**
- Consumes: `checkScreenCss`（既存）・`createRoom` / `joinRoom` / `chooseCard` / `resultsSection`（`e2e/support/poker.ts`）・`scanContrast` / `expectReadable`
- Produces: なし

- [ ] **Step 1: 自己テストを書く**

`scripts/audit-ui-components.test.mjs` の末尾に足す:

```js
describe("checkScreenCss: 生の色（設計正本 D10 の 3・#320 PR 5）", () => {
  const rawOf = (css) => messagesOf(css).filter((m) => /生の色/.test(m));
  test("画面の CSS の生の色を落とす", () => {
    assert.equal(rawOf(".a { color: #fff; }").length, 1);
  });
  test("宣言ごとに数える（1 つの規則に 2 つなら 2 件）", () => {
    assert.equal(rawOf(".a { color: #fff; background: rgba(0, 0, 0, 0.2); }").length, 2);
  });
  test(":root のカスタムプロパティの値も落とす", () => {
    assert.equal(rawOf(":root { --presence: #16a34a; }").length, 1);
  });
  test("@media / @supports の中も落とす", () => {
    assert.equal(rawOf("@media (min-width: 1px) { .a { color: red; } }").length, 1);
    assert.equal(rawOf("@supports (color: color(display-p3 1 1 1)) { :root { --x: color(display-p3 0 1 0); } }").length, 1);
  });
  test("@keyframes の中の宣言も落とす（セレクタの判定は飛ばしたまま）", () => {
    assert.equal(rawOf("@keyframes k { from { color: #000; } 50% { opacity: 1; } }").length, 1);
  });
  test("一覧のセレクタでも宣言ごとに 1 件", () => {
    assert.equal(rawOf(".a, .b { color: #fff; }").length, 1);
  });
  test("大文字の関数・名前の色・var() の第 2 引数も落とす", () => {
    assert.equal(rawOf(".a { color: RGBA(0, 0, 0, 0.5); }").length, 1);
    assert.equal(rawOf(".a { color: White; }").length, 1);
    assert.equal(rawOf(".a { color: var(--x, #fff); }").length, 1);
  });
  test("トークン・transparent・currentColor・トークンの color-mix() は通す", () => {
    assert.deepEqual(
      rawOf(".a { color: var(--x); background: transparent; border-color: currentColor; box-shadow: 0 0 0 1px color-mix(in srgb, var(--x) 50%, transparent); }"),
      [],
    );
  });
  test("直前の ui-exempt: で外せる", () => {
    assert.deepEqual(messagesOf("/* ui-exempt: 計器の文字盤の色 */\n.a { color: #fff; }"), []);
  });
  test("@keyframes の段も直前の ui-exempt: で外せる", () => {
    assert.deepEqual(messagesOf("@keyframes k { /* ui-exempt: 光の明滅 */\n from { color: #fff; } }"), []);
  });
});
```

- [ ] **Step 2: 自己テストが落ちることを見る**

Run: `bash -c 'node --test scripts/audit-ui-components.test.mjs' 2>&1 | grep -E '^# (pass|fail)|^not ok' | head`
Expected: `# fail` が 8（生の色を落とす側の 8 件。「通す」2 件は main でも緑。**緑になった「落とす」側があれば、その書き方は既に別の判定が拾っている** —— 入力欄の型を使っていないかを見直す）

- [ ] **Step 3: 未投票の印を走査する E2E を書く**

`e2e/specs/poker-a11y.spec.ts` の `test.describe` の中の末尾（1 本目の `test` の後）に足す。import に `createRoom` を加える
（`import { chooseCard, createRoom, joinRoom, resultsSection } from '../support/poker';`）:

```ts
  test('Given 2 人のルームで 1 人だけが投票 / When 票を公開する / Then 未投票の印も AA を満たす', async ({ page, openPeer }) => {
    // Given: 2 人目が居るので、1 人が投票しても自動では公開されない
    const inviteUrl = await createRoom(page, 'a11y-voter');
    const idle = await openPeer('a11y-idle');
    await joinRoom(idle.page, inviteUrl, 'a11y-idle');
    await chooseCard(page, '5');

    // When: 投票した側が票を公開する
    await page.getByRole('button', { name: '票を公開する' }).click();
    await expect(resultsSection(page)).toBeVisible();
    await expect(resultsSection(page).getByText('未投票', { exact: true })).toBeVisible();

    // Then: 未投票の印（`.no-vote`）を含めて、画面の字がすべて AA を満たす
    expectReadable(await scanContrast(page, 8), 6, []);
  });
```

- [ ] **Step 4: E2E が落ちることを見る**

Run: `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/poker-a11y.spec.ts --reporter=line; cd ..`
Expected: 1 本目 PASS・2 本目 **FAIL**。失敗の一覧に「未投票」が 2.x:1 で出る（ほかの字は出ない）。
**見込みと違う理由で落ちたら止める**（`resultsSection` に「未投票」が無い・公開ボタンが押せない、など）

- [ ] **Step 5: コミットする**

```bash
git add scripts/audit-ui-components.test.mjs e2e/specs/poker-a11y.spec.ts
git commit -m "test: 画面の CSS の生の色と未投票の印の AA を固定する（#320 PR 5）"
git push -u origin feature/issue-320-pr5-raw-colors-retro
```

---

### Task 2: 検査を画面の CSS の生の色へ広げ、main の 28 件を名指しで出す

**Files:**
- Modify: `scripts/audit-ui-components.mjs`（冒頭の注釈・`checkScreenCss`）
- Create: `scripts/mutations/m114-ui-components-screen-raw-colors-ignored.patch`
- Modify: `scripts/mutation-check.mjs`（m114 の登録）

- [ ] **Step 1: 判定を足す**

`checkScreenCss` の直前に足す:

```js
/**
 * 画面の CSS の規則が書いた生の色（設計正本 D10 の 3）。宣言ごとに 1 件。
 * **`@keyframes` の段にも当てる** —— セレクタの判定は `from` / `50%` に当てはまらないが、色は破れる。
 */
function rawColorViolations(rule) {
  return ownDeclarationsOf(rule)
    .filter((d) => findRawColors(d.value).length > 0)
    .map((d) => `生の色を書いています: ${d.prop}: ${d.value.replace(/\s+/g, " ")}    ← packages/ui/src/tokens/ のトークンにするか、直前に /* ui-exempt: 理由 */ を書く`);
}
```

`checkScreenCss` の `walkRules` の先頭 2 行を置き換える:

```js
  root.walkRules((rule) => {
    const violations = inKeyframes(rule)
      ? rawColorViolations(rule)
      : [...screenRuleViolations(rule), ...rawColorViolations(rule)];
    if (violations.length === 0) return;
```

冒頭の注釈の「何を見るか」の 1 の箇条に足す（`- どちらも直前の …` の行を置き換える）:

```js
 *      - 生の色（`#…`・`rgb()` などの関数・名前の色）を値に書いた宣言は落とす。`@keyframes` の段も見る（設計正本 D10 の 3）
 *      - いずれも直前の `/* ui-exempt: 理由 *\/` で外せる。理由が空・何も免除していない申告は落とす
```

「何を見ていないか」に 1 行足す:

```js
 * - 規則の外にある宣言（`@font-face` / `@page` の記述子）の生の色は見ない（画面の CSS にはいま無い）
```

- [ ] **Step 2: 自己テストが緑になることを見る**

Run: `bash -c 'node --test scripts/audit-ui-components.test.mjs' 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# fail 0`

- [ ] **Step 3: 対照実行 —— main の 28 件が名指しで出ることを見る**

Run: `node scripts/audit-ui-components.mjs 2>&1 | grep -c '生の色を書いています'; node scripts/audit-ui-components.mjs 2>&1 | grep '生の色' | sed -E 's/^ *- \[画面の CSS\] ([^ ]+) .*/\1/' | sort | uniq -c`
Expected: `28`。ファイルごとに poker 12・timer 7・`card.css` 5・`controls.css` 3・`reset.css` 1。**上の「実測した生の色」の表と数が違えば止める**（実装かこの表のどちらかが誤っている）

- [ ] **Step 4: 変異 m114 を作って登録する**

`rawColorViolations` を呼ばない形の差分をパッチにする（**作る前に `git status --porcelain` が空でないこと —— Step 1 の変更が未コミットであること —— を見る。先に Step 5 のコミットを済ませてから作る**）:

```bash
git status --porcelain   # 空であること（Step 5 のコミット後）
sed -i 's/      : \[...screenRuleViolations(rule), ...rawColorViolations(rule)\];/      : screenRuleViolations(rule);/' scripts/audit-ui-components.mjs
git diff scripts/audit-ui-components.mjs > /tmp/m114.diff
git checkout -- scripts/audit-ui-components.mjs
git status --porcelain   # 空に戻ったこと
```

`scripts/mutations/m114-ui-components-screen-raw-colors-ignored.patch` を、`/tmp/m114.diff` の前に次の注釈を置いて作る:

```
# 変異 114: ui-components-screen-raw-colors-ignored
#
# 検出を期待するテスト:
#   - scripts/audit-ui-components.test.mjs
#     describe「checkScreenCss: 生の色（設計正本 D10 の 3・#320 PR 5）」
#
# 適用: リポジトリルートから
#       git apply scripts/mutations/m114-*.patch
# 復元: git apply -R scripts/mutations/m114-*.patch
#
# #320 PR 5・設計正本 D10 の 3。画面の CSS の規則から生の色の判定を外す。部品の CSS の側は
# 生の色を落とし続けるので、部品の自己テストは緑のまま。画面の側の族だけが赤になるべき。
```

`scripts/mutation-check.mjs` の m113 の項目の後に足す:

```js
  {
    id: 114,
    label: "audit-ui-components が画面の CSS の生の色を見逃す",
    patch: "m114-ui-components-screen-raw-colors-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note:
      "#320 PR 5・設計正本 D10 の 3。画面の CSS の規則から生の色の判定を外す。部品の CSS の側は" +
      "落とし続けるので、部品の自己テストは緑のまま画面の側の族だけが赤になる。",
  },
```

Run:
```bash
git apply --check scripts/mutations/m114-ui-components-screen-raw-colors-ignored.patch && echo APPLIES
git apply scripts/mutations/m114-ui-components-screen-raw-colors-ignored.patch
bash -c 'node --test scripts/audit-ui-components.test.mjs' 2>&1 | grep -E '^# (pass|fail)'
git apply -R scripts/mutations/m114-ui-components-screen-raw-colors-ignored.patch
bash -c 'node --test scripts/mutation-check.test.mjs' 2>&1 | grep -E '^# (pass|fail)'
git status --porcelain   # パッチと mutation-check.mjs だけ
```
Expected: `APPLIES`。当てると `# fail 8`（Task 1 Step 2 と同じ 8 件）。`mutation-check` の自己テストは `# fail 0`

- [ ] **Step 5: コミットする**

Step 1〜3 の後に検査をコミットし、Step 4 の後に変異をコミットする:

```bash
git add scripts/audit-ui-components.mjs
git commit -m "feat: 画面の CSS の生の色を検査で落とす（#320 PR 5）"
git push
# Step 4 の後
git add scripts/mutations/m114-ui-components-screen-raw-colors-ignored.patch scripts/mutation-check.mjs
git commit -m "test: 画面の CSS の生の色の判定を外す変異 m114 を足す（#320 PR 5）"
git push
```

（この時点の CI は `audit-ui-components` が 28 件で赤。Task 5 の終わりで緑になる）

---

### Task 3: トークンを足し、要素層の生の色を置き換える

**Files:**
- Modify: `packages/ui/src/tokens/palette.css`・`packages/ui/src/tokens/shape.css`
- Modify: `packages/ui/src/elements/card.css`・`controls.css`・`reset.css`

**Interfaces:**
- Produces（Task 4・5 が使う）: 色 `--gold-glow`・`--jade-pale`・`--felt-sink`・`--felt-grain`・`--felt-vignette`・`--felt-vignette-deep`・
  `--card-edge`・`--card-sheen`・`--card-shade`・`--card-inline`・`--card-back`・`--presence-online`・`--presence-idle`・`--presence-offline`。
  影 `--shadow-chip`・`--shadow-lift-near`・`--shadow-lift-far`・`--shadow-button`・`--shadow-button-pressed`

- [ ] **Step 1: 色のトークンを足す**

`packages/ui/src/tokens/palette.css` の `:root` の末尾（`--felt-shade` の行の後・`}` の前）に足す:

```css

  /* --- 語彙に畳めない色（#320 PR 5・設計正本 D10 の 3） -------------------
   * 画面の CSS に直書きされていた色のうち、上の語彙（tint / veil / edge など）に相当が無いものを、
   * **値を変えずに**役割の名前で置く。語彙に近い値は語彙へ畳んだ（計画の P1）。 */
  --gold-glow: rgba(236, 200, 121, 0.35); /* 真鍮の発光（集計の数字・計器の針。text-shadow / drop-shadow 用） */
  --jade-pale: #b7dcc4; /* 「投票済み」の札の字。felt-700 上 6.22:1 */
  --felt-sink: rgba(0, 0, 0, 0.22); /* 卓より一段沈んだ敷き（席の行・票の行・手札） */
  --felt-grain: rgba(0, 0, 0, 0.05); /* 羅紗の織り目の影（body::after のマスクの地） */
  --felt-vignette: rgba(7, 31, 24, 0.55); /* 計器の周辺減光の中ほど */
  --felt-vignette-deep: rgba(4, 20, 15, 0.9); /* 計器の周辺減光の外縁 */

  /* 象牙の札（トランプ）の地 */
  --card-edge: #cdc4a8; /* 札の縁 */
  --card-sheen: #fffdf4; /* 札の地のグラデーションの明るい端 */
  --card-shade: #eae1c6; /* 札の地のグラデーションの暗い端 */
  --card-inline: rgba(38, 35, 28, 0.18); /* 札の内枠（coal の淡い線） */
  --card-back: #7d3c2b; /* 伏せた札の裏の地 */

  /* 在室状況（色 + テキスト/アイコン併記で色のみに頼らない。timer が `--color-presence-*` で使う） */
  --presence-online: #16a34a;
  --presence-idle: #d97706;
  --presence-offline: #94a3b8;
```

`:root { … }` の閉じ括弧の後に足す（timer の `index.css` から移す。注釈も一緒に移す）:

```css

/* P3 色域（対応ディスプレイで彩度を強化）。@supports で分岐し、非対応環境では上の sRGB 値が必ず残る。
 * 明度は sRGB に近く保ち、コントラスト（AA）を維持する。在室状況の 2 色だけを強化する
 * （真鍮・フェルト・翡翠は彩度を上げると卓の質感が壊れる）。 */
@supports (color: color(display-p3 1 1 1)) {
  :root {
    --presence-online: color(display-p3 0.18 0.62 0.32);
    --presence-idle: color(display-p3 0.82 0.49 0.08);
  }
}
```

- [ ] **Step 2: 影のトークンを足す**

`packages/ui/src/tokens/shape.css` の `--shadow-popover` の行の後に足す:

```css
  --shadow-chip: 0 2px 5px rgba(0, 0, 0, 0.45); /* 小さな札（poker の伏せた席のカード） */
  --shadow-lift-near: 0 2px 3px rgba(0, 0, 0, 0.3); /* 持ち上げた札の足元の影 */
  --shadow-lift-far: 0 14px 24px rgba(0, 0, 0, 0.45); /* 持ち上げた札の遠い影 */
  --shadow-button: 0 6px 14px rgba(0, 0, 0, 0.35); /* ボタンの落ち影 */
  --shadow-button-pressed: 0 3px 8px rgba(0, 0, 0, 0.35); /* 押し込んだボタンの落ち影 */
```

- [ ] **Step 3: 要素層を置き換える**

`packages/ui/src/elements/card.css`:
- `.card` の `border: 1px solid #cdc4a8;` → `border: 1px solid var(--card-edge);`
- `.card` の `linear-gradient(165deg, #fffdf4 0%, var(--ivory) 60%, #eae1c6 100%);` → `linear-gradient(165deg, var(--card-sheen) 0%, var(--ivory) 60%, var(--card-shade) 100%);`
- `.card::before` の `border: 1px solid rgba(38, 35, 28, 0.18);` → `border: 1px solid var(--card-inline);`
- `.card:hover:not(:disabled)` の `box-shadow: 0 2px 3px rgba(0, 0, 0, 0.3), 0 14px 24px rgba(0, 0, 0, 0.45);` → `box-shadow: var(--shadow-lift-near), var(--shadow-lift-far);`
- `.card.selected` の `0 0 22px rgba(236, 200, 121, 0.5),` → `0 0 22px var(--gold-edge),`、`0 14px 24px rgba(0, 0, 0, 0.45);` → `var(--shadow-lift-far);`

`packages/ui/src/elements/controls.css`:
- `button` の `box-shadow: 0 2px 0 var(--gold-deep), 0 6px 14px rgba(0, 0, 0, 0.35);` → `box-shadow: 0 2px 0 var(--gold-deep), var(--shadow-button);`
- `button:active:not(:disabled)` の `box-shadow: 0 0 0 var(--gold-deep), 0 3px 8px rgba(0, 0, 0, 0.35);` → `box-shadow: 0 0 0 var(--gold-deep), var(--shadow-button-pressed);`
- `button.secondary:hover:not(:disabled)` の `background: rgba(207, 161, 76, 0.12);` → `background: var(--gold-tint);`（**見た目が変わる**。表の最後の行）

`packages/ui/src/elements/reset.css`:
- `body::after` の `background-color: rgba(0, 0, 0, 0.05);` → `background-color: var(--felt-grain);`

- [ ] **Step 4: 検査と自己テストを流す**

Run:
```bash
node scripts/audit-ui-components.mjs 2>&1 | grep -c '生の色を書いています'
corepack pnpm --filter @tasuki/ui test && corepack pnpm --filter @tasuki/ui lint
```
Expected: `19`（要素層の 9 件が消える）。`@tasuki/ui` の test と lint（stylelint のトークン層の規則を含む）が PASS

- [ ] **Step 5: コミットする**

```bash
git add packages/ui/src/tokens packages/ui/src/elements
git commit -m "feat: 生の色のトークンを足し、要素層の生の色を置き換える（#320 PR 5）"
git push
```

---

### Task 4: poker の生の色を置き換える

**Files:**
- Modify: `apps/poker-web/src/index.css`

- [ ] **Step 1: 置き換える**

| 規則 | いま | 置き換え |
|---|---|---|
| `.participants li` / `.votes li` | `background: rgba(0, 0, 0, 0.22);` | `background: var(--felt-sink);` |
| `.seat-card` | `border: 1.5px dashed rgba(245, 239, 221, 0.3);` | `border: 1.5px dashed var(--line-strong);` |
| `.seat-card.facedown` の `background` | `rgba(236, 200, 121, 0.55)` / `rgba(236, 200, 121, 0.35)` / `#7d3c2b` | `var(--gold-edge)` / `var(--gold-glow)` / `var(--card-back)` |
| `.seat-card.facedown` | `box-shadow: 0 2px 5px rgba(0, 0, 0, 0.45);` | `box-shadow: var(--shadow-chip);` |
| `.badge.voted` | `color: #b7dcc4;` / `border-color: rgba(140, 200, 160, 0.4);` | `color: var(--jade-pale);` / `border-color: var(--jade-edge);` |
| `.no-vote` | `color: rgba(245, 239, 221, 0.4);` / `border: 1.5px dashed rgba(245, 239, 221, 0.25);` | `color: var(--ivory-faint);` / `border: 1.5px dashed var(--line-strong);` |
| `.stats dd` | `text-shadow: 0 0 24px rgba(236, 200, 121, 0.35);` | `text-shadow: 0 0 24px var(--gold-glow);` |
| `.error-note` | `background: rgba(198, 95, 69, 0.14);` / `border: 1px solid rgba(198, 95, 69, 0.45);` | `background: var(--rose-tint);` / `border: 1px solid var(--rose-edge);` |

`.no-vote` の規則の前に注釈を置く:

```css
/* 未投票の印。字は `--ivory-faint`（12px の本文で AA を満たす最も淡い段）。α 0.4 では卓の上で
   2.65:1 と AA を割っていた（#320 PR 5 で発見。E2E はどのシナリオでも未投票を出していなかった）。 */
```

- [ ] **Step 2: 検査・テスト・E2E を流す**

Run:
```bash
node scripts/audit-ui-components.mjs 2>&1 | grep -c '生の色を書いています'
corepack pnpm --filter @tasuki/poker-web test && corepack pnpm --filter @tasuki/poker-web lint
cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/poker-a11y.spec.ts specs/notices-a11y.spec.ts specs/poker.spec.ts --reporter=line; cd ..
```
Expected: `7`（timer の分だけ残る）。単体テスト・lint が PASS。E2E が全部 PASS（`poker-a11y` の 2 本目は Task 1 で赤だったもの）

- [ ] **Step 3: コミットする**

```bash
git add apps/poker-web/src/index.css
git commit -m "feat: poker の生の色をトークンへ仕分け、未投票の印を AA に上げる（#320 PR 5）"
git push
```

---

### Task 5: timer の生の色を置き換え、検査を緑にする

**Files:**
- Modify: `apps/timer-web/src/index.css`

- [ ] **Step 1: 在室の色を別名にし、P3 の上書きを消す**

- `--color-presence-online: #16a34a;` → `--color-presence-online: var(--presence-online);`（idle・offline も同じ形）。直前の注釈はそのまま
- P3 の節（`/* =====… P3 色域 …` の注釈と `@supports (color: color(display-p3 1 1 1)) { … }`）を消し、次の 1 行に置き換える:

```css
/* 在室状況の P3 の強化はトークン層（`@tasuki/ui` の `palette.css`）が持つ。上の別名がそれを継ぐ。 */
```

- その上の「**P3 の上書きは置かない。** …在室状況の 3 色だけは従来どおり下の @supports で強化する。」の最後の文を
  「在室状況の 2 色だけはトークン層の @supports で強化する。」にする

- [ ] **Step 2: 発光と周辺減光を置き換える**

- `--signal-glow: rgba(236, 200, 121, 0.35);` → `--signal-glow: var(--gold-glow);`
- `.instrument-stage::before` の `radial-gradient` の 3 つの色: `rgba(7, 31, 24, 0) 0%` → `transparent 0%`、`rgba(7, 31, 24, 0.55) 70%` → `var(--felt-vignette) 70%`、`rgba(4, 20, 15, 0.9) 100%` → `var(--felt-vignette-deep) 100%`
  （`transparent` と `rgba(7, 31, 24, 0)` はグラデーションの補間が前乗算の色空間で行われるので同じ描画になる。Task 7 の撮影で画素の差が無いことを確かめる）

- [ ] **Step 3: 検査を緑にし、在室の色を実画面で確かめる**

Run:
```bash
node scripts/audit-ui-components.mjs; echo "exit=$?"
corepack pnpm --filter @tasuki/timer-web test && corepack pnpm --filter @tasuki/timer-web lint && corepack pnpm --filter @tasuki/timer-web typecheck
cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/timer-a11y.spec.ts specs/timer.spec.ts --reporter=line; cd ..
```
Expected: `exit=0`。すべて PASS。

在室の色（Review Focus 3）は Task 7 の撮影の spec の中で、timer のロビーを開いて
`getComputedStyle(document.documentElement).getPropertyValue('--color-presence-online')` と
`getComputedStyle(<在室の印の要素>).backgroundColor` を main とこのブランチで比べる（Chromium は `color(display-p3 …)` を解するので、
P3 の値が出れば移設は効いている）

- [ ] **Step 4: コミットする**

```bash
git add apps/timer-web/src/index.css
git commit -m "feat: timer の生の色をトークンへ移す（#320 PR 5）"
git push
```

---

### Task 6: 壊して赤を見る（破壊検証・コミットしない）

各項目の前に `git status --porcelain` が空であることを見る。壊したファイルは、赤を見たら `git checkout -- <そのファイル>` で戻す。

- [ ] **Step 1: 画面の CSS に生の色を 1 つ戻す** — `apps/poker-web/src/index.css` の `.no-vote` の `var(--ivory-faint)` を `rgba(245, 239, 221, 0.4)` に戻す。
  Run: `node scripts/audit-ui-components.mjs; echo "exit=$?"` と `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/poker-a11y.spec.ts --reporter=line; cd ..`
  Expected: 検査が `exit=1` で `.no-vote` の行を名指し。E2E の 2 本目が FAIL
- [ ] **Step 2: 要素層の `@keyframes` に生の色を足す** — `packages/ui/src/elements/card.css` の末尾に `@keyframes zz { from { color: #fff; } }` を足す。
  Expected: 検査が `exit=1` で `card.css` の行を名指し
- [ ] **Step 3: 申告で外せることを見る** — Step 2 の `@keyframes` の段の直前に `/* ui-exempt: 破壊検証 */` を置く。Expected: `exit=0`。
  続けて段の色を `var(--ivory)` に替える。Expected: `exit=1`（何も免除していない申告）
- [ ] **Step 4: 結果を記録する** — 3 項目の結果を PR 本文の「テスト方法」に書く

---

### Task 7: 通しで確かめ、実画面を main と並べる（コミットしない）

- [ ] **Step 1: 全体の検査を流す**

Run:
```bash
corepack pnpm test
corepack pnpm lint
corepack pnpm typecheck
bash -c 'set -euo pipefail; for t in $(node scripts/list-scan-targets.mjs script-tests); do node --test "$t"; done' 2>&1 | grep -E '^# (pass|fail)' | sort | uniq -c
for s in scripts/audit-*.mjs; do case "$s" in *.test.mjs) ;; *) node "$s" >/dev/null || echo "NG: $s";; esac; done
for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NOT APPLY: $p"; done
node scripts/audit-plan-gate.mjs
node scripts/check-links.mjs
corepack pnpm audit --audit-level high
git grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(" -- 'apps/*/src/*.css' 'packages/ui/src/elements/*.css' 'packages/ui/src/components/*.css'
```
Expected: すべて緑。最後の grep は 0 件（コメントの中の例示が出たら読んで、値でなければ無視する）

- [ ] **Step 2: 構造監査を main と並べる** — PR 3 の計画 Task 7 Step 2 と同じ手順。Expected: 差は走査量だけ
- [ ] **Step 3: E2E を全部流す** — `corepack pnpm e2e`。Expected: 全件 PASS

- [ ] **Step 4: 見た目の変わる画面を main と並べて撮る**

PR 3・4 と同じく、使い捨ての spec を `e2e/specs/` に一時的に置いて撮る（`git checkout main -- apps packages` → 撮る → `git checkout HEAD -- apps packages`。前後で `git status --porcelain` を見る。撮り終えたら spec を消す）。
1280px で次を撮る:
- poker: 2 人のルームで 1 人だけ投票した投票中の画面（伏せた席のカード・考え中の点線・「投票済み」の札）と、公開後の画面（未投票の印・集計の発光）
- poker: エラーの一言（`notices-a11y.spec.ts` と同じく `routeWebSocket` で未知のコードの `error` を差し込む）
- 控えめなボタンのホバー（poker の「票を公開する」にマウスを乗せる）
- timer のロビー（在室の印）と計器の画面（周辺減光）。在室の色の計算値も記録する（Task 5 Step 3）

Expected: 差は「見た目が変わるもの」の表の行だけ（ルームコードの字は毎回変わる）。**timer の計器と、札（手札）には差が出ない**。それ以外の差が出たら止める

- [ ] **Step 5: 利用者に Chrome での目視を頼む** — 撮影の対と「見た目が変わるもの」の表を見せ、受け入れるかを聞く

---

### Task 8: ADR 0022 に実施状況を追記し、文書を直す

**Files:**
- Modify: `docs/adr/0022-ui-components-layer.md`（末尾に節を足す）
- Modify: `packages/ui/README.md`（検査・約束の節）

- [ ] **Step 1: ADR 0022 の末尾に追記する**

ファイルの末尾（`## 影響` の節の後）に足す。**本文の「実施は #320 の PR n」の文は書き換えない**（記録は当時の記述を保つ・ADR 0002）:

```markdown

## 実施状況（2026-09-29 追記）

決定 1〜7 は epic #320 の 5 つの PR で実施した。

| PR | 実施した決定 |
|---|---|
| #322 | 決定 1・2・3・5・7。部品層の骨組みと入力欄の系、検査（生の色は部品の CSS だけ） |
| #323 | 決定 4 のうち接続の告知の帯と一言 |
| #324 | 決定 4 のうちパネルの面と、見出し・戻る導線 |
| #327 | 決定 4 のうち招待リンクの表示・象牙の札・Markdown の見た目 |
| この PR | 決定 6 のうち、生の色の禁止を画面の CSS（アプリの CSS と要素層）へ広げること |

ボタンの形・大きさの段と、最大幅・段組みの段（#316）、Markdown の描画の置き場（#315）、timer の Tailwind の写し（#321）は
この ADR の決定の範囲にあるが、それぞれの Issue で扱う。
```

（「この PR」は PR を作った後に番号へ置き換えてコミットし直す —— Task 10 Step 1）

- [ ] **Step 2: README の検査の説明を直す**

`packages/ui/README.md` の「部品の CSS の約束」の段落の後に 1 段落を足す:

```markdown
**画面の CSS の約束**（同じ検査が見る）: アプリの CSS と要素層（`elements/`）にも生の色を書きません。色は
`tokens/` のトークンで書き、語彙（tint / veil / edge など）に近い値は語彙を使います。語彙に相当が無い色は、
役割の名前でトークン層に足します。外すときは規則の直前に `/* ui-exempt: 理由 */` を書きます。
```

`## 検査` の節に、生の色の検査を名指しする行があれば同じ内容に揃える（`git grep -n "生の色" packages/ui/README.md` で確かめる）

- [ ] **Step 3: 設計正本と計画以外で「PR 5 で」「生の色は部品の CSS だけ」と現況を書いた文を探す**

Run: `git grep -nE "PR 5|生の色" -- docs packages scripts apps | grep -v -E "docs/superpowers/(plans|specs)/|docs/retrospectives/"`
Expected: ADR 0022 本文の「実施は #320 の PR 5」（当時の記述なので残す）と、今回足した文だけ。**現況として古くなった文が出たら直す**

- [ ] **Step 4: コミットする**

```bash
git add docs/adr/0022-ui-components-layer.md packages/ui/README.md
git commit -m "docs: ADR 0022 に実施状況を追記し、画面の CSS の約束を README に書く（#320 PR 5）"
git push
```

---

### Task 9: epic の振り返りを書く

**Files:**
- Create: `docs/retrospectives/2026-09-29-issue-320-ui-components-layer.md`

- [ ] **Step 1: 振り返りを書く**

`docs/guides/retrospective.md` の 3 部構成（踏んだ罠・検査の穴・次への申し送り）で書く。**数を他の文書から転記しない**（PR 番号と事実だけ）。
各項目は「事実 → 原因 → 対処」の順。材料（PR 本文・計画・各 PR の最終レビューと `/code-review` の結果）から、少なくとも次を書く:

踏んだ罠:
- **移設のたびに注釈が古くなった**（PR 3・4 の最終レビューの Important はどちらも、地や色の持ち主が部品へ移ったのに「`.topic` の地」「リンクが 1.03:1」と書いた注釈）。再発条件: 規則を部品へ移すとき、移した値を理由として語る注釈が別のファイルにある
- **計画の逐語コードが設計正本を落とした**（PR 1 の「入れ子の `&` を解いてから判定」・PR 4 の JSX として不正な位置の注釈）
- **部品より先にテストを置く順を、PR 3 の `/code-review` に指摘されるまで守っていなかった**（PR 1〜3 は部品を先にコミットし、死んだ部品の検査の赤を RED とみなした）
- **CI の速度テストが揺れで赤になり、main が赤のまま 1 つの PR をまたいだ**（#323 のマージで赤、#325 で直した）。最初の直し方の案が実測していない推測に立っていた

検査の穴:
- **`<div>` の帯は文字の走査に入らず、表示しても測られていなかった**（PR 2 で `<p>` にした）
- **未投票の印は AA を割っていたが、E2E のどのシナリオも未投票を出していなかった**（PR 5 の生の色の仕分けで見つかった）
- **面の判定は写しと部品が同じ値なので、置き換える前から緑だった**（PR 3・4。赤は破壊検証でしか見えない）
- `scanContrast` は h4〜h6・li・blockquote・code を走査しない（PR 4 の `/code-review`。札の上は色を継ぐので実害は無い）

次への申し送り（反映先を書く）:
- 部品層の使い方と約束 → `packages/ui/README.md`／決定と実施状況 → ADR 0022
- #316（ボタンと段）・#315（Markdown の描画とチェックボックス）・#314（お題の札の配置）・#313（お題の入力）・#321（timer から Tailwind）は部品層の上で進める
- 本番への配布は、epic の区切りとして利用者に諮る（#318・#319・#322〜#327 とこの PR が未配布）

- [ ] **Step 2: リンクの検査を流してコミットする**

Run: `node scripts/check-links.mjs`
```bash
git add docs/retrospectives/2026-09-29-issue-320-ui-components-layer.md
git commit -m "docs: epic #320（部品層）の振り返りを書く"
git push
```

---

### Task 10: PR を作り、レビューを通す

- [ ] **Step 1: PR を作る** — `gh pr create --base main --title "feat: 生の色を仕分けて検査を有効にし、部品層の epic を閉じる（#320 PR 5）" --body-file <本文>`。
  本文は PR 4 と同じ形。**`Closes` も地の文の閉鎖キーワードも書かない**（#320 は利用者の確認の後に手で閉じる）。PR 番号が決まったら、ADR 0022 の「この PR」を番号に置き換えてコミットし、push する
- [ ] **Step 2: 最終レビューと、文脈を共有しない `/code-review` を PR 番号を明示して通す** — 指摘は採点が出てから直す
- [ ] **Step 3: マージの後** — マージは利用者が行う。#320 に完了のコメントを書き、閉じてよいかを利用者に聞く。本番への配布（#318〜この PR）を諮る
