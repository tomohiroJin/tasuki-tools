# 接続の帯と一言を部品層へ寄せる（#320 PR 2）実装計画

> **作業者へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: 部品層に**接続の告知の帯**（`.ui-banner`）と**一言**（`.ui-note`）を置き、poker・お題ツール・玄関の写しをこの部品へ置き換える。
帯とエラーを表示した状態の文字が AA を満たすことを E2E で固定する（正本 §8 E8）。

**方式**: 部品は PR 1 と同じく `.ui-` で始まるクラスだけで書いた素の CSS（`@layer` 不使用）。値の出発点はお題ツールの帯と
`--rose-pale`（正本 D6「告知・一言の値」）。一言は**色だけ**を持ち、字の大きさ・余白・並びは画面に残す（正本 D4・D7）。
帯は `<div>` から `<p>` に替え、既存の文字の走査（`scanContrast`）の対象に入れる。

**技術**: 素の CSS / React（各アプリのマークアップのクラスだけを替える）/ Playwright（E2E・`routeWebSocket` でフレームを差し込む）

**設計正本**: `docs/superpowers/specs/2026-09-27-ui-components-layer-design.md`（**計画は正本に従属する。両方を読むこと**）。
この計画は正本 §7 の **PR 2** だけを扱う。PR 1 の計画（`docs/superpowers/plans/2026-09-27-ui-components-pr1-field.md`）と
PR 1 が入った main（`c3cba25`）の現物を見て書いた。

## この計画で決めたこと（正本に無い細部）

レビューはここを最初に見る。いずれも正本の D 番号に照らして決めた。

| # | 決定 | 根拠 |
|---|---|---|
| P1 | **帯の位置（`position: sticky; top: 0; z-index: 10`）は部品が持つ** | 地を不透明にする理由が「貼りついた帯の下を内容が通る」ことそのもの（正本 §2.1 の「写っている知識」）。位置と地を別の場所に置くと、片方だけ直ったときに透ける。D4 の「配置は画面」の例外として README に書く |
| P2 | **一言は色だけを持つ**（`.ui-note` = `--ivory-dim`・`.ui-note--error` = `--rose-pale`） | 字の大きさ・余白は画面ごとに違い（玄関は `--font-size-sm`、お題ツール・poker は本文の大きさ）、揃えると正本 D7 の PR 2 の行に無い見た目の変化が出る。写っている知識は「エラーの色が felt-700 の上で AA を割る」だけ（正本 §2.1） |
| P3 | **待ちの一言の置き方（`.loading-note` の余白と中央寄せ）は画面に残す** | 置き方は配置（正本 D4）。色だけを部品へ移す |
| P4 | **帯は `<p>` にする**（いまは `<div>`） | `scanContrast` の走査対象は `button, a, h1〜h3, label, p, span` で、`<div>` の帯は表示しても測られない。走査対象を広げると timer の既存の走査（`sr-only` の `role="status"` など）が巻き込まれる。帯の `<p>` の既定の余白は部品の `margin: 0` で消す |
| P5 | **「再接続しています」の帯は「同期できていません」の帯で代わりに測る** | 同じクラス（修飾なし）で見た目は同じ。再接続中は失敗が 3 回で「繋がらない」へ移り、測っている間に状態が変わる。「同期できていません」は契約に合わないフレームを 1 通差し込むだけで留まる |
| P6 | **poker の `.error-note` の枠と地（生の `rgba`）は poker に残す** | 正本 §2.1「PR 2 では一言の色だけを揃え、枠は poker 固有に残す」。生の色は PR 5 で仕分ける |
| P7 | 変異は `mutation-check.mjs` に**登録しない**。Task 6 で手で壊して赤を見る | 新しい守りは E2E だけで、`mutation-check.mjs` は Playwright を流さない（登録は `vitest` / `node --test` の単位）。PR 1 の Task 10 と同じ扱い |
| P8 | **帯の修飾 `.unreachable` は部品の修飾 `.ui-banner--unreachable` に吸収する** | 正本 D3 の「既存のアプリの修飾（`.unreachable` など）は変えない」は、アプリに残る規則の修飾を指す。帯は規則ごと部品へ移るので、修飾も部品の命名（D3 の例 `.ui-banner--unreachable`）に移る（最終レビューの指摘で追記） |

**正本 D7 の表に無い見た目の変化**（利用者の確認が要る。Task 7 で並べて見せる）:

- poker の帯の字が 0.8rem → `--font-size-sm`（お題ツールの帯と同じ）、余白が `0.45rem 1rem` → `--space-2 --space-4`、`backdrop-filter: blur` が消える
- お題ツールの**入室を待つ画面**の混雑の知らせ（クラスの無い `<p role="status">`）が `--ivory` → `--ivory-dim`（入室後の画面の同じ知らせ `.topic-notice` と揃う）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。
様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 2 で E2E を先に書き、main のマークアップのまま赤を見てから Task 3〜5 で置き換える。Task 1 の検査（死んだ部品）も赤から始まる |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | CSS とマークアップのクラスのみ。配布は epic の区切りで利用者に諮る（この PR では配らない） |
| IV. 境界の型安全 | 該当なし | 境界を越えるデータを扱わない（E2E が差し込むフレームは既存の境界検証を通る側の形） |
| V. 実画面検証 | 通過 | Task 7 で正本 D7 の PR 2 の行と上の「表に無い変化」を main と並べて撮り、Chrome で目視する |
| VI. 依存は内向き | 該当なし | ドメインに触れない |
| VII. 検査は壊して確かめる | 通過 | Task 2 の赤（main のまま）・Task 6 の破壊検証 4 本 |
| VIII. 記録が正本 | 通過 | 部品の一覧と使い方は `packages/ui/README.md`。ADR 0022 は PR 5 で実施状況を追記する（正本 §7）ので、この PR では触らない。**この計画に数値の正本を作らない** |
| IX. 小さく回す | 通過 | PR 2 は帯と一言だけ。分割の理由は正本 §7 |
| X. 抽象は実需で | 通過 | `.ui-banner` は poker とお題ツール、`.ui-note` は 3 アプリ、`.ui-note--error` は 3 アプリ、`.ui-banner--unreachable` は poker とお題ツールが使う。死んだ部品は検査が落とす |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密も個人情報も扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない（P1 の「位置を部品が持つ」は D4 の適用の細部で、README に理由つきで書く）。

## 全体の制約

- **ブランチ**: `feature/issue-320-pr2-banner-note`（main `c3cba25` から切った。この計画のコミットを含んだまま PR 2 にする）
- **破壊検証の前に `git status --porcelain` が空であることを見る**（`git checkout --` で未コミットの実装を消す事故を 4 度踏んでいる）
- **コミットしたらすぐ push する**
- **本番へ配布しない**
- 部品のセレクタは `.ui-` で始まるクラスだけ。修飾は `.ui-<部品>--<変化>`。`@layer` を使わない（正本 D3・D5）
- 部品の CSS に `outline` 系を書かない・つまみ（`--*`）を宣言しない・生の色を書かない（正本 D4・D6・D11）
- **部品の CSS のコメントに `font-size:` と `font:` の字面を書かない**（`packages/ui/tests/typography-scale.test.mjs` がコメントの中も宣言と誤認して赤になる）
- timer は触らない（timer の告知は Tailwind で組んであり #321 で扱う）
- 画面の CSS に残すクラスの規則から**色の宣言を消す**。残すと、画面の CSS は部品より後に読まれるので同じ詳細度で部品の色に勝つ（正本 D5）
- scripts の自己テストは **bash** で回す（zsh は偽の赤を出す）
- E2E が同期サーバーの起動で即死したら、headroom のプロキシが 8787 を持っていないかを先に疑う。利用者の `pnpm run dev` が 8787 を掴んでいたら、止めずに聞く
- コメント・docstring は日本語。「なぜ」を書く。決定は完了形で書かない

## Review Focus

仕様が含意するが、どのタスクの単体テストも直接は叩かない失敗の型。レビューで最初に見る。

1. **帯が走査に入らない**（`<div>` のまま・別の要素に替わる）→ Task 2 の E2E が「`--rose-pale` on `--felt-950` の組を測ったこと」を `expectReadable` の固定する組で見る。Task 6 の破壊検証 4 で赤を確かめる
2. **画面の CSS の後勝ちで部品の色が潰れる**（`.hub-error { color }` などの消し忘れ）→ Task 2 の E2E が計算後の色を `--rose-pale` と比べる。Task 6 の破壊検証 3
3. **「繋がらない」と「再接続・同期できていない」の区別が消える**（修飾クラスの付け忘れ）→ Task 2 の E2E が字の太さと下線の太さを両方の状態で比べる。Task 6 の破壊検証 2
4. **帯を `<p>` にしたことで既定の段落の余白が出て、帯が上端から浮く** → Task 2 の E2E が帯の `margin-top` を `0px` と比べる
5. **片方のアプリにしか当たらない部品・修飾が残る** → Task 1 の検査（死んだ部品。正本 D11 の 6）。Task 1 で赤、Task 3〜5 で緑になる

---

### Task 1: 部品層に帯と一言を置く

**Files:**
- Create: `packages/ui/src/components/banner.css`
- Create: `packages/ui/src/components/note.css`
- Modify: `packages/ui/src/components/index.css`
- Modify: `packages/ui/README.md`（「部品層」の表と使い方）

**Interfaces:**
- Produces: クラス `.ui-banner`・`.ui-banner--unreachable`・`.ui-note`・`.ui-note--error`。Task 3〜5 がマークアップに当て、Task 2 の E2E が計算後の値を測る

- [ ] **Step 1: 帯の部品を書く**

`packages/ui/src/components/banner.css`:

```css
/* ============================================================
   Tasuki UI — 接続の告知の帯（#320・ADR 0022）
   画面の上端に貼りつき、同期サーバーとの接続の具合を 1 行で知らせる。`<p>` に当てる
   （文字の走査の対象に入れるため。`<div>` は走査されない）。
   繋がらない（戻る見込みが無い）ときは `.ui-banner--unreachable` を重ねる。

   **上端に貼りつく位置も部品が持つ**（配置は画面が持つ、の例外）。地を不透明にする理由が
   「貼りついた帯の下を内容が通る」ことそのものなので、位置と地を別の場所に置くと、
   片方だけ直ったときに帯が透けて読めなくなる。
   ============================================================ */

.ui-banner {
  box-sizing: border-box;
  position: sticky;
  top: 0;
  z-index: 10;
  /* `<p>` の既定の余白を消す。残すと帯が上端から浮き、上に内容が覗く。 */
  margin: 0;
  padding: var(--space-2) var(--space-4);
  /* 地は不透明にする。半透明の赤（`--rose-tint` / `--rose-veil`）では、下を象牙の札が通ると読めず、
     卓の上でも繋がらない側が約 4.2:1 まで落ちて AA を割った（お題ツールで実測）。 */
  background: var(--felt-950);
  border-bottom: 1px solid var(--rose-edge);
  color: var(--rose-pale);
  font-size: var(--font-size-sm);
  text-align: center;
}

/* 繋がらないことは「切れて戻る途中」より強く出す。色だけに頼らず、下線と字の太さでも区別する。 */
.ui-banner--unreachable {
  border-bottom-color: var(--rose-bright);
  border-bottom-width: 2px;
  font-weight: 700;
}
```

- [ ] **Step 2: 一言の部品を書く**

`packages/ui/src/components/note.css`:

```css
/* ============================================================
   Tasuki UI — 一言（#320・ADR 0022）
   待ち・知らせ・エラーを 1 文で伝える段落。エラーは `.ui-note--error` を重ねる。
   **色だけを持つ。** 字の大きさ・余白・並びは画面が持つ（待ちの一言は卓の中央に、
   フォームのエラーは欄の下に、と置き方が画面ごとに違う）。
   ============================================================ */

.ui-note {
  color: var(--ivory-dim);
}

/* エラーは `--rose-pale`（felt-700 の上で約 5.91:1）。`--rose-bright` は面の最も明るい felt-700 の上で
   約 3.55:1 と AA を割る（玄関のエラーがこれだった）。エラーは不透明な地を持たない場所
   （`<main>` の直下・フォームの中）にも出るので、最も明るい面で足りる色にする。 */
.ui-note--error {
  color: var(--rose-pale);
}
```

- [ ] **Step 3: まとめ読みに足す**

`packages/ui/src/components/index.css` の `@import './field.css';` の後に 2 行を足す:

```css
@import './field.css';
@import './banner.css';
@import './note.css';
```

- [ ] **Step 4: 検査が「死んだ部品」を出すことを見る**

Run: `node scripts/audit-ui-components.mjs; echo "exit=$?"`
Expected: `exit=1`。`[死んだ部品]` が `.ui-banner`・`.ui-banner--unreachable`・`.ui-note`・`.ui-note--error` の 4 行（まだどのアプリも使っていない）。
`[部品の CSS]` の行は 0 件（出たら部品の CSS の約束を破っている。直してから進む）

- [ ] **Step 5: 書体の大きさの検査と lint を通す**

Run:
```bash
corepack pnpm --filter @tasuki/ui test
corepack pnpm --filter @tasuki/ui lint
```
Expected: どちらも PASS。`typography-scale` が赤なら、コメントに `font-size:` の字面を書いていないかを見る

- [ ] **Step 6: README の部品の表と使い方を直す**

`packages/ui/README.md` の「部品層（`components/`・ADR 0022）」の表を次に置き換える:

```markdown
| 部品 | 当てる要素 | つまみ |
|---|---|---|
| `.ui-input` | `<input>`・`<textarea>`（1 行・複数行の欄） | `--ui-field-bg` |
| `.ui-select` | `<select>`（一覧は `base-select` でページの中に描く） | `--ui-field-bg`・`--ui-field-hover` |
| `.ui-banner` | 接続の告知の帯の `<p>`。繋がらないときは `.ui-banner--unreachable` を重ねる | なし |
| `.ui-note` | 待ち・知らせ・エラーの一言の `<p>`。エラーは `.ui-note--error` を重ねる | なし |
```

同じ節の「**使い方**」の箇条の末尾に 2 項目を足す:

```markdown
- **帯は上端に貼りつく位置まで部品が持ちます**（配置は画面が持つ、の例外）。地を不透明にする理由が
  「貼りついた帯の下を内容が通る」ことなので、位置と地を分けると片方だけ直ったときに透けます。
  帯は `<p>` に当てます（`<div>` は E2E の文字の走査に入りません）
- **一言は色だけを持ちます。** 字の大きさ・余白・中央寄せなどは画面のクラスで書き、**画面のクラスに色を書きません**
  （画面の CSS は部品より後に読まれるので、同じ詳細度で部品の色に勝ちます）
```

- [ ] **Step 7: コミットする**

```bash
git add packages/ui/src/components packages/ui/README.md
git commit -m "feat: 部品層に接続の告知の帯と一言を置く（#320 PR 2）"
git push -u origin feature/issue-320-pr2-banner-note
```

（この時点の CI は `audit-ui-components` が死んだ部品で赤。Task 5 の終わりで緑になる）

---

### Task 2: 帯と一言を表示させて測る E2E を書き、main のマークアップのまま赤を見る

**Files:**
- Create: `e2e/specs/notices-a11y.spec.ts`

**Interfaces:**
- Consumes: `e2e/support/a11y.ts` の `expectReadable`・`pairKey`・`resolveColors`・`scanContrast`（既存）、
  `e2e/support/poker.ts` の `createRoom(page, name): Promise<string>`（既存・玄関でルームを作って poker を開く）、
  `e2e/support/topic.ts` の `openTopicTool(page, name): Promise<string>`（既存・玄関でルームを作ってお題ツールを開く）
- Produces: なし（E2E のみ）

- [ ] **Step 1: E2E を書く**

`e2e/specs/notices-a11y.spec.ts`:

```ts
/**
 * 接続の告知の帯と一言（エラー）が読めること（#320 PR 2・設計正本 §8 E8）。
 *
 * **タグを付けない（`local` 専用）。** 理由は `timer-a11y.spec.ts` と同じ（見るのはスタイルの健全性）。
 *
 * 帯とエラーは、ほかの走査のどのシナリオでも表示されない（設計正本 §3）。ここで表示させて測る。
 * 表示させる手段は `routeWebSocket` だけで、**製品コードにテスト用の経路は作らない**（`poker.spec.ts` と同じ）:
 *
 * - **繋がらない**: そのページのツールの WS を成立させない。`everConnected` が false のまま失敗が増え、
 *   最初から「繋がらない」帯が出る
 * - **同期できていない**: 実サーバーへ中継しつつ、契約に合わないフレームを 1 通差し込む。
 *   「再接続しています」と同じ見た目（修飾の無い帯）で、こちらは状態が留まるので測れる
 *   （再接続中は失敗が 3 回で「繋がらない」へ移り、測っている間に変わる）
 * - **エラー**: 同じ中継で、未知のコードの `error` を 1 通差し込む。文は空白だけにして、
 *   画面の既定の文（書体の常用の層に収まる）を出させる
 *
 * **色は計算後の値で比べる。** AA を満たすかだけを見ると、部品を当て忘れて `--ivory-dim` になっても
 * 緑になる（どちらも読める）。当てたかどうかで値が分かれる局面に判定を置く。
 */
import type { Locator, Page, WebSocketRoute } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { expectReadable, pairKey, resolveColors, scanContrast } from '../support/a11y';
import { createRoom } from '../support/poker';
import { openTopicTool } from '../support/topic';

type Tool = 'poker' | 'topic';

/** 画面の既定のエラーの文（poker の `DEFAULT_ERROR_MESSAGE`・お題ツールの `DEFAULT_ERROR_TEXT`）。 */
const ERROR_TEXT = '操作を完了できませんでした';
const STALE = /同期できていません/;
const UNREACHABLE = /同期サーバーに接続できません/;

/** 未知のコードの `error`。文を空白だけにして、画面の既定の文を出させる。 */
const UNKNOWN_ERROR = { type: 'error', code: 'E2E_UNKNOWN', message: ' ' };

function toolSocket(tool: Tool): RegExp {
  return new RegExp(`/ws\\?.*\\btool=${tool}\\b`);
}

/** そのページのツールの WS を成立させない（`poker.spec.ts` の `syncServerIsDown` と同じ形）。 */
async function toolSyncIsDown(page: Page, tool: Tool): Promise<void> {
  await page.routeWebSocket(toolSocket(tool), (ws) => {
    void ws.close();
  });
}

/**
 * そのページのツールの WS を実サーバーへ中継し、**ページへフレームを差し込む口**を返す。
 *
 * 口は接続が張られてから埋まる。**中継はツールを開く前に掛けること**（掛ける前に張られた接続は掴めない）。
 */
async function relayToolSync(page: Page, tool: Tool): Promise<(frame: unknown) => void> {
  let client: WebSocketRoute | null = null;
  await page.routeWebSocket(toolSocket(tool), (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => ws.send(message));
    client = ws;
  });
  return (frame) => {
    // 掴めていないまま進むと、下の判定は差し込んでいない画面を見る
    expect(client, '中継が接続を掴んでいない').not.toBeNull();
    client!.send(JSON.stringify(frame));
  };
}

/** 帯と一言の見た目のうち、判定が分岐を見る値。 */
async function paintOf(locator: Locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      color: s.color,
      background: s.backgroundColor,
      weight: s.fontWeight,
      underline: s.borderBottomWidth,
      position: s.position,
      marginTop: s.marginTop,
    };
  });
}

test.describe('接続の帯と一言が読める（WCAG AA・#320 E8）', () => {
  test('Given poker のルーム / When エラーと「同期できていません」を出す / Then 帯は貼りついた不透明な地で、エラーは淡い赤で、すべて AA を満たす', async ({
    page,
  }) => {
    // Given: 中継を掛けてからルームを作る（作る途中で poker の接続が張られる）
    const inject = await relayToolSync(page, 'poker');
    await createRoom(page, 'notice-poker');
    const [rosePale, felt950] = await resolveColors(page, ['--rose-pale', '--felt-950']);

    // When その1: 未知のコードのエラーを届ける
    inject(UNKNOWN_ERROR);
    const error = page.getByRole('alert').filter({ hasText: ERROR_TEXT });
    await expect(error, 'エラーの一言').toBeVisible();
    // Then その1: エラーの字は --rose-pale（部品を当て忘れると --ivory-dim、写しが残ると生の色）
    expect((await paintOf(error)).color, 'エラーの字の色').toBe(rosePale);

    // When その2: 契約に合わないフレームを届ける
    inject({ type: 'room-state' });
    const banner = page.getByRole('status').filter({ hasText: STALE });
    await expect(banner, '同期できていない帯').toBeVisible();
    // Then その2: 帯は上端に貼りつき、不透明な地で、細い下線（繋がらない帯と区別がつく側）
    const paint = await paintOf(banner);
    expect(paint).toMatchObject({ color: rosePale, background: felt950, underline: '1px', position: 'sticky', marginTop: '0px' });
    expect(paint.weight, '繋がらない帯と同じ太字になっている').not.toBe('700');

    // Then その3: 画面の文字がすべて読め、帯の字（--rose-pale on --felt-950）を測ったことを固定する
    expectReadable(await scanContrast(page, 10), 8, [pairKey(rosePale!, felt950!)]);
  });

  test('Given poker の同期サーバーへ繋がらない / When 開く / Then 繋がらない帯は太い下線と太字で区別され、AA を満たす', async ({
    page,
  }) => {
    // Given: 玄関で名乗ってルームに入る（同一性が無いと poker は玄関へ送り返す）
    await createRoom(page, 'notice-poker-down');
    // When: poker の接続だけを成立させないようにして、開き直す
    await toolSyncIsDown(page, 'poker');
    await page.reload();
    const [rosePale, felt950] = await resolveColors(page, ['--rose-pale', '--felt-950']);

    const banner = page.getByRole('alert').filter({ hasText: UNREACHABLE });
    await expect(banner, '繋がらない帯').toBeVisible();
    // Then その1: 色だけでなく、下線と字の太さでも区別されている
    expect(await paintOf(banner)).toMatchObject({
      color: rosePale,
      background: felt950,
      weight: '700',
      underline: '2px',
      position: 'sticky',
      marginTop: '0px',
    });
    // Then その2: 読める（入室を待つ画面は要素が少ないので下限を下げる）
    expectReadable(await scanContrast(page, 1), 1, [pairKey(rosePale!, felt950!)]);
  });

  test('Given お題ツール / When エラーと「同期できていません」を出す / Then 帯は貼りついた不透明な地で、エラーは淡い赤で、すべて AA を満たす', async ({
    page,
  }) => {
    // Given: 中継を掛けてからお題ツールを開く（玄関の接続は掴まない。`tool=topic` だけ）
    const inject = await relayToolSync(page, 'topic');
    await openTopicTool(page, 'notice-topic');
    const [rosePale, felt950] = await resolveColors(page, ['--rose-pale', '--felt-950']);

    // When その1: 未知のコードのエラーを届ける
    inject(UNKNOWN_ERROR);
    const error = page.getByRole('alert').filter({ hasText: ERROR_TEXT });
    await expect(error, 'エラーの一言').toBeVisible();
    expect((await paintOf(error)).color, 'エラーの字の色').toBe(rosePale);

    // When その2: 契約に合わないフレームを届ける（`topic` の形にも、ハブの応答の形にも合わない）
    inject({ type: 'topic' });
    const banner = page.getByRole('status').filter({ hasText: STALE });
    await expect(banner, '同期できていない帯').toBeVisible();
    const paint = await paintOf(banner);
    expect(paint).toMatchObject({ color: rosePale, background: felt950, underline: '1px', position: 'sticky', marginTop: '0px' });
    expect(paint.weight, '繋がらない帯と同じ太字になっている').not.toBe('700');

    // Then: 画面の文字がすべて読め、帯の字を測ったことを固定する
    expectReadable(await scanContrast(page, 5), 5, [pairKey(rosePale!, felt950!)]);
  });

  test('Given お題ツールの同期サーバーへ繋がらない / When 開く / Then 繋がらない帯は太い下線と太字で区別され、AA を満たす', async ({
    page,
  }) => {
    // Given: お題ツールを一度開いて、端末に同一性を残す
    await openTopicTool(page, 'notice-topic-down');
    // When: お題ツールの接続だけを成立させないようにして、開き直す
    await toolSyncIsDown(page, 'topic');
    await page.reload();
    const [rosePale, felt950] = await resolveColors(page, ['--rose-pale', '--felt-950']);

    const banner = page.getByRole('alert').filter({ hasText: UNREACHABLE });
    await expect(banner, '繋がらない帯').toBeVisible();
    expect(await paintOf(banner)).toMatchObject({
      color: rosePale,
      background: felt950,
      weight: '700',
      underline: '2px',
      position: 'sticky',
      marginTop: '0px',
    });
    expectReadable(await scanContrast(page, 1), 1, [pairKey(rosePale!, felt950!)]);
  });

  test('Given 玄関のハブへ繋がらない / When 玄関を開く / Then 告知（エラーの一言）は淡い赤で、AA を満たす', async ({
    page,
  }) => {
    // Given: ハブの接続だけを成立させない（`landing.spec.ts` の `hubSyncIsDown` と同じ形）
    await page.routeWebSocket(
      (url) => url.pathname === '/ws' && !url.searchParams.has('tool'),
      (ws) => {
        void ws.close();
      },
    );
    // When
    await page.goto('/');
    const [rosePale] = await resolveColors(page, ['--rose-pale']);

    const notice = page.getByRole('alert').filter({ hasText: UNREACHABLE });
    await expect(notice, '繋がらないことの告知').toBeVisible();
    // Then その1: 字は --rose-pale（写しの --rose-bright は、羅紗の最も明るい停止点 felt-700 の上で AA を割る）
    expect((await paintOf(notice)).color, '玄関のエラーの字の色').toBe(rosePale);
    // Then その2: 画面の文字がすべて読める
    expectReadable(await scanContrast(page, 5), 5, []);
  });
});
```

- [ ] **Step 2: 型検査と lint を通す**

Run:
```bash
corepack pnpm --filter @tasuki/e2e typecheck
corepack pnpm --filter @tasuki/e2e lint
```
Expected: どちらも PASS（`client!` の非 null 断言は `poker-a11y.spec.ts` の `gold!` と同じ扱い。lint が拒むなら `if (client === null) throw new Error(…)` に替える）

- [ ] **Step 3: main のマークアップのまま流し、赤の理由を記録する**

Run: `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/notices-a11y.spec.ts; cd ..`
Expected: **5 件とも FAIL**。理由の見込み:
- poker 2 件: 帯の背景が半透明の生の色（`background` が `felt950` と一致しない）・エラーの色が `#f0b5a4`
- お題ツール 2 件: 帯が `<div>` で走査に入らず、固定する組（`--rose-pale` on `--felt-950`）が「測っていない」に出る
- 玄関 1 件: エラーの色が `--rose-bright`（色の比較で落ちる。走査まで進めば AA も割る見込み）

**見込みと違う理由で落ちたら止めて原因を調べる**（前提の作り方が壊れている —— 例: 中継が接続を掴めていない、
お題ツールの「繋がらない」が玄関へ送り返される）。**見込みどおりの理由で落ちたことを、各テストの失敗の 1 行目で確かめる**。
緑になったものがあれば、その判定は実装の違いを見ていない（恒真）。止めて判定を直す

- [ ] **Step 4: コミットする**

```bash
git add e2e/specs/notices-a11y.spec.ts
git commit -m "test: 接続の帯と一言を表示させて測る E2E を足す（#320 PR 2）"
git push
```

---

### Task 3: poker の帯と一言を部品へ置き換える

**Files:**
- Modify: `apps/poker-web/src/App.tsx`（`RedirectingView` の `loading-note`・`banner` の `<div>`）
- Modify: `apps/poker-web/src/components/ErrorNote.tsx:35`
- Modify: `apps/poker-web/src/pages/RoomPage.tsx:38`（`JoiningView` の混雑の知らせ）
- Modify: `apps/poker-web/src/index.css`（冒頭の注釈・`.loading-note`・「接続バナー」の節）

**Interfaces:**
- Consumes: Task 1 の `.ui-banner`・`.ui-banner--unreachable`・`.ui-note`・`.ui-note--error`

- [ ] **Step 1: マークアップにクラスを当てる**

`apps/poker-web/src/App.tsx` の `RedirectingView`:

```tsx
      <p className="loading-note ui-note" role="status">
```

同じファイルの `banner`（`<div` から `</div>` まで）を置き換える:

```tsx
  const banner = notice.kind !== 'none' && (
    <p
      className={`ui-banner${notice.kind === 'unreachable' ? ' ui-banner--unreachable' : ''}`}
      role={notice.kind === 'unreachable' ? 'alert' : 'status'}
    >
      {notice.text}
    </p>
  );
```

`apps/poker-web/src/components/ErrorNote.tsx` 35 行目:

```tsx
    <p className="error-note ui-note ui-note--error" role="alert">
```

`apps/poker-web/src/pages/RoomPage.tsx` 38 行目（`JoiningView` の `notice`）:

```tsx
        <p className="error-note ui-note ui-note--error" role="status">
```

- [ ] **Step 2: CSS から写しを消す**

`apps/poker-web/src/index.css`:

冒頭の注釈の「ここには poker 固有のもの（席・投票・結果・接続バナー）だけを置く。」を次に置き換える:

```css
   ここには poker 固有のもの（席・投票・結果）だけを置く。接続の告知の帯と一言の色は部品層（ADR 0022）が持つ。
```

`.loading-note` の規則から `color: var(--ivory-dim);` の行を消し、直前の注釈を次に置き換える:

```css
/* 玄関へ送り返している間の一言（#95 S5c 追補）。卓の上で控えめに置く。色は部品（`.ui-note`）が持つ。 */
```

「`/* ---------- 接続バナー ---------- */`」の節を次のとおりにする:
- 見出しの注釈を `/* ---------- エラーの一言の枠（色は部品の .ui-note--error が持つ） ---------- */` に置き換える
- `.error-note` の規則から `color: #f0b5a4;` の行を消す（枠と地の `rgba` は残す。正本 §2.1）
- `.connection-banner { … }` と、その後の注釈つきの `.connection-banner.unreachable { … }` を**丸ごと消す**

Run: `git grep -n -E "connection-banner|f0b5a4|f5c2c2" -- apps/poker-web`
Expected: 0 件

- [ ] **Step 3: 単体テスト・型検査・lint を通す**

Run:
```bash
corepack pnpm --filter @tasuki/poker-web test
corepack pnpm --filter @tasuki/poker-web typecheck
corepack pnpm --filter @tasuki/poker-web lint
```
Expected: すべて PASS。クラス名や `<div>` をテストが名指ししていて落ちたら、期待を新しいクラス・`<p>` へ直す（振る舞いのテストは変えない）

- [ ] **Step 4: poker の E2E が緑になることを見る**

Run: `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/notices-a11y.spec.ts -g 'poker'; cd ..`
Expected: poker の 2 件が PASS

- [ ] **Step 5: コミットする**

```bash
git add apps/poker-web
git commit -m "refactor: poker の接続の帯と一言を部品層へ寄せる（#320 PR 2）"
git push
```

---

### Task 4: お題ツールの帯と一言を部品へ置き換える

**Files:**
- Modify: `apps/topic-web/src/screens/TopicRoom.tsx:28-32,56,57,76,77`
- Modify: `apps/topic-web/src/components/LoadingView.tsx:7`
- Modify: `apps/topic-web/src/components/CurrentTopic.tsx:25,32`
- Modify: `apps/topic-web/src/index.css`（`.loading-note`・`.topic-empty, .topic-notice`・`.topic-error`・「接続の告知」の節）

**Interfaces:**
- Consumes: Task 1 の `.ui-banner`・`.ui-banner--unreachable`・`.ui-note`・`.ui-note--error`

- [ ] **Step 1: マークアップにクラスを当てる**

`apps/topic-web/src/screens/TopicRoom.tsx` の `banner` を置き換える:

```tsx
  const banner = notice.kind !== 'none' && (
    <p className={`ui-banner${notice.kind === 'unreachable' ? ' ui-banner--unreachable' : ''}`} role={notice.kind === 'unreachable' ? 'alert' : 'status'}>
      {notice.text}
    </p>
  );
```

同じファイルの入室を待つ画面（56・57 行目）:

```tsx
          {sync.retryNotice && <p className="ui-note" role="status">{sync.retryNotice}</p>}
          {sync.error && <p className="ui-note ui-note--error" role="alert">{sync.error}</p>}
```

入室後の画面（76・77 行目）:

```tsx
        {sync.retryNotice && <p className="topic-notice ui-note" role="status">{sync.retryNotice}</p>}
        {sync.error && <p className="ui-note ui-note--error" role="alert">{sync.error}</p>}
```

`apps/topic-web/src/components/LoadingView.tsx` 7 行目:

```tsx
      <p className="loading-note ui-note" role="status">
```

`apps/topic-web/src/components/CurrentTopic.tsx` 25 行目と 32 行目:

```tsx
        <p className="topic-notice ui-note" role="status">
```

```tsx
          <p className="topic-empty ui-note">{EMPTY_TEXT}</p>
```

- [ ] **Step 2: CSS から写しを消す**

`apps/topic-web/src/index.css`:

- `.loading-note` の規則から `color: var(--ivory-dim);` の行を消し、直前の注釈を
  `/* 遷移中・参加中の一言。卓の上で控えめに置く（poker-web と同じ置き方）。色は部品（`.ui-note`）が持つ。 */` に置き換える
- `.topic-empty, .topic-notice { … }` から `color: var(--ivory-dim);` の行を消す（`margin: 0;` は残す）
- `.topic-error` の注釈（「`.topic-error` も `<main>` 直下で…」の 4 行）と `.topic-error { … }` を**丸ごと消す**
  （知識は部品の `note.css` の注釈へ移った）
- 「`/* ---------- 接続の告知（poker-web と同じ役割。…） ---------- */`」の節（見出し・注釈・`.connection-banner { … }`・
  注釈つきの `.connection-banner.unreachable { … }`）を**丸ごと消す**

Run: `git grep -n -E "connection-banner|topic-error" -- apps/topic-web`
Expected: 0 件

- [ ] **Step 3: 単体テスト・型検査・lint を通す**

Run:
```bash
corepack pnpm --filter @tasuki/topic-web test
corepack pnpm --filter @tasuki/topic-web typecheck
corepack pnpm --filter @tasuki/topic-web lint
```
Expected: すべて PASS。クラス名や `<div>` をテストが名指ししていて落ちたら、期待を新しいクラス・`<p>` へ直す（振る舞いのテストは変えない）

- [ ] **Step 4: お題ツールの E2E が緑になることを見る**

Run: `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/notices-a11y.spec.ts -g 'お題ツール'; cd ..`
Expected: お題ツールの 2 件が PASS

- [ ] **Step 5: コミットする**

```bash
git add apps/topic-web
git commit -m "refactor: お題ツールの接続の帯と一言を部品層へ寄せる（#320 PR 2）"
git push
```

---

### Task 5: 玄関の一言を部品へ置き換える

**Files:**
- Modify: `apps/landing/src/screens/CreateRoom.tsx`・`apps/landing/src/screens/JoinRoom.tsx`（`hub-notice`・`hub-error`）
- Modify: `apps/landing/src/screens/Resuming.tsx`・`apps/landing/src/screens/RoomGone.tsx`・`apps/landing/src/screens/RoomChoice.tsx`
- Modify: `apps/landing/src/index.css`（`.hub-error`・`.hub-notice`・`.hub-invite-status`）

**Interfaces:**
- Consumes: Task 1 の `.ui-note`・`.ui-note--error`

- [ ] **Step 1: マークアップにクラスを当てる**

`apps/landing/src/screens/` 配下で、次の置き換えを**すべての出現**に行う:

- `className="hub-error"` → `className="hub-error ui-note ui-note--error"`
- `className="hub-notice"` → `className="hub-notice ui-note"`
- `className="hub-invite-status"` → `className="hub-invite-status ui-note"`

Run: `git grep -n -E 'className="hub-(error|notice|invite-status)"' -- apps/landing/src`
Expected: 0 件（置き換え漏れが無い）

Run: `git grep -c -E 'ui-note' -- apps/landing/src/screens`
Expected: `CreateRoom.tsx`・`JoinRoom.tsx`・`Resuming.tsx`・`RoomGone.tsx`・`RoomChoice.tsx` の 5 ファイルが出る

- [ ] **Step 2: CSS から色を消す**

`apps/landing/src/index.css`:

- `.hub-error { … }` から `color: var(--rose-bright);` の行を消す
- `.hub-notice { … }` から `color: var(--ivory-dim);` の行を消す
- `.hub-invite-status { … }` から `color: var(--ivory-dim);` の行を消す

3 つとも字の大きさ（`--font-size-sm`）と余白は残す（正本 D7 に字の大きさの変化は無い。P2）。
`.hub-error` の直前に次の 1 行の注釈を足す:

```css
/* 一言の色は部品（`.ui-note` / `.ui-note--error`）が持つ。ここに色を書くと、後に読まれるこちらが勝って部品の色を潰す。 */
```

Run: `git grep -n -E "rose-bright" -- apps/landing/src`
Expected: 一言の色としての出現は 0 件（ほかの用途で残っていれば、その行が一言でないことを確かめる）

- [ ] **Step 3: 単体テスト・型検査・lint を通す**

Run:
```bash
corepack pnpm --filter @tasuki/landing test
corepack pnpm --filter @tasuki/landing typecheck
corepack pnpm --filter @tasuki/landing lint
```
Expected: すべて PASS

- [ ] **Step 4: E2E と検査が緑になることを見る**

Run:
```bash
cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/notices-a11y.spec.ts; cd ..
node scripts/audit-ui-components.mjs; echo "exit=$?"
```
Expected: E2E は 5 件とも PASS。検査は `exit=0`（Task 1 の死んだ部品 4 行が消えた）

- [ ] **Step 5: 既存の変異パッチがまだ当たることを見る**

製品コードを触ると、その行を文脈に持つ変異パッチが当たらなくなる。`mutation-check.mjs` は当たらないパッチで止まり、
**以降の変異が全部無検査になる**（`pnpm test` にも E2E にも出ない。#276 で 2 度踏んだ）。

Run: `for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NG: $p"; done`
Expected: `NG:` の行が出ない。出たら、そのパッチの文脈行を今のコードに合わせて当て直し、**変異の中身（壊している箇所）は変えない**。
当て直したパッチは `node scripts/mutation-check.mjs` の該当の 1 件が赤を出すことを `git apply` → そのパッチの `tests` を流す → `git apply -R` で確かめる
（`mutation-check.mjs` は id で絞れない。`--help` を渡しても全件を走らせる）

- [ ] **Step 6: 消したクラス名の名指しが残っていないかを見る**

Run: `git grep -n -E "connection-banner|topic-error|\.loading-note の色|接続バナー" -- apps packages e2e docs/guides`
Expected: 0 件。出たら注釈・文書を今の形に直す（設計正本・過去の計画・ADR は当時の記録なので直さない）

- [ ] **Step 7: コミットする**

```bash
git add apps/landing scripts/mutations
git commit -m "refactor: 玄関の一言を部品層へ寄せ、エラーの色を --rose-pale に揃える（#320 PR 2）"
git push
```

---

### Task 6: 壊して赤を見る（破壊検証・コミットしない）

各項目の前に `git status --porcelain` が空であることを見る。壊したファイルは、赤を見たら `git checkout -- <そのファイル>` で戻し、
もう一度 `git status --porcelain` が空であることを見る。

Run（各項目の確認に使う）: `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/notices-a11y.spec.ts; cd ..`

- [ ] **Step 1: 帯の地を半透明に戻す**

`packages/ui/src/components/banner.css` の `.ui-banner` の `background: var(--felt-950);` を `background: var(--rose-tint);` に替える。
Expected: 帯を見る 4 件が FAIL（`background` の比較と、固定する組の「測っていない」）

- [ ] **Step 2: 繋がらない帯の修飾を外す**

`apps/poker-web/src/App.tsx` の `' ui-banner--unreachable'` を `''` に替える。
Expected: 「poker の同期サーバーへ繋がらない」が FAIL（`weight` と `underline`）

- [ ] **Step 3: 玄関のエラーの色の写しを戻す**

`apps/landing/src/index.css` の `.hub-error { … }` に `color: var(--rose-bright);` を足す。
Expected: 「玄関のハブへ繋がらない」が FAIL（色の比較）

- [ ] **Step 4: 帯を `<div>` に戻す**

`apps/topic-web/src/screens/TopicRoom.tsx` の帯の `<p` と `</p>` を `<div` と `</div>` に替える。
Expected: 「お題ツール / When エラーと…」が FAIL（固定する組の「測っていない」）。`margin-top` は `<div>` でも `0px` なので、
**赤を出すのは走査の固定の側であること**を失敗の 1 行目で確かめる

- [ ] **Step 5: 結果を記録する**

4 項目の「壊し方・落ちたテスト・失敗の 1 行目」を PR 本文の「テスト方法」に書く。**緑のまま通った項目があれば、その判定は恒真なので直す**

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
node scripts/audit-plan-gate.mjs
node scripts/check-links.mjs
corepack pnpm audit --audit-level high
```
Expected: すべて緑。自己テストは `# fail 0` だけ。`NG:` の行は出ない。**`| tail` や `| head` で終了コードを隠さない**

- [ ] **Step 2: 構造監査の SC の行を main と並べる**

`SCRATCH` には実行するセッションのスクラッチパッドのディレクトリを入れる（リポジトリの中に置かない）。

Run:
```bash
git worktree add "$SCRATCH/main-wt" main
node scripts/audit-structure.mjs > "$SCRATCH/sc-branch.txt"
(cd "$SCRATCH/main-wt" && node scripts/audit-structure.mjs) > "$SCRATCH/sc-main.txt"
diff "$SCRATCH/sc-main.txt" "$SCRATCH/sc-branch.txt"
```
Expected: 差は走査量の件数（ファイルが増えた分）だけ。指標の値が後退していれば、原因を PR 本文に書く。
（main の worktree は依存を入れ直す必要がある。`audit-structure.mjs` が依存無しで走らなければ、その旨を記録して次へ進む）

- [ ] **Step 3: E2E を全部流す**

Run: `corepack pnpm e2e`
Expected: 全件 PASS（既存の `poker.spec.ts`・`landing.spec.ts` の告知のシナリオは `role` で掴んでいるので、`<div>` → `<p>` の影響を受けない）

- [ ] **Step 4: 見た目の変わる画面を main と並べて撮る**

main の worktree とこのブランチの両方で dev サーバーを立て、Playwright（MCP）で次を 360px と 1280px で撮る
（帯とエラーは Task 2 と同じく `routeWebSocket` で出す）:
- poker: 繋がらない帯（入室を待つ画面）・同期できていない帯とエラー（ルーム画面。帯が貼りついたまま、下をお題の象牙の札が通るところまでスクロールしたものも撮る —— 正本 D6 の「札の上は測っていない」の実測）
- お題ツール: 繋がらない帯・同期できていない帯とエラー
- 玄関: 繋がらないときの作成画面（エラーの一言）・選択画面のコピーの結果の一言

撮ったものはスクラッチパッドの `shots/` に置く（コミットしない）。
Expected: 差は次のものだけ —— 正本 D7 の PR 2 の行（玄関のエラーが淡くなる・poker の帯とエラーの字が不透明なトークンになる）と、
この計画の「正本 D7 の表に無い見た目の変化」の 2 項目。**それ以外の差が出たら止める**

終わったら dev サーバーを止め、`git worktree remove` で main の worktree を片付ける（ポートを掴んだままにしない）

- [ ] **Step 5: 利用者に Chrome での目視を頼む**

利用者に撮影の対と「正本 D7 の表に無い見た目の変化」の 2 項目を見せ、受け入れるかを聞く。受け入れないものがあれば、
その変化を画面のクラスへ戻す（例: poker の帯の字の大きさを poker の CSS に `/* ui-exempt: */` なしで書ける形で残す）かを相談する

---

### Task 8: PR を作り、レビューを通す

- [ ] **Step 1: PR を作る**

Run:
```bash
gh pr create --base main --title "feat: 接続の帯と一言を部品層へ寄せる（#320 PR 2）" --body-file <本文のファイル>
```

本文（`## 概要`・`## 変更内容`・`## テスト方法` の形。`Closes` は書かない —— #320 は epic で PR 5 まで続く。**地の文にも閉鎖キーワードを書かない**）に次を含める:
- 設計正本・この計画・ADR 0022 へのリンク
- この計画の「この計画で決めたこと」P1〜P8 の要約
- 見た目が変わる画面（正本 D7 の PR 2 の行と、表に無い 2 項目）と、Task 7 の撮影の要約・利用者の目視の結果
- Task 6 の破壊検証の結果
- 既知の見逃し: 一言のクラス名の写し（画面のクラスに色を書き戻す形）は検査に出ない（ADR 0022 決定 6）。E2E の色の比較が見るのは、表示させた 5 つの場面だけ

- [ ] **Step 2: 文脈を共有しない `/code-review` を PR 番号を明示して通す**

指摘は採点が出てから直す（採点の間に直さない）。直したら push し、Task 7 Step 1 を流し直す。

- [ ] **Step 3: マージの後に記録を直す**

マージは利用者が行う。マージの後、#320 に PR 2 の進捗コメントを書く（PR 3 の計画は PR 2 が入った main の現物を見てから書く）
