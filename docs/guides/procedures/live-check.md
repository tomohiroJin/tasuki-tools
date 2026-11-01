# 実画面で確かめる

## いつ使うか・拠り所

画面・同期の振る舞いを、ユニットテストの外の**実経路**で確かめるときに使います。

- テストが緑・型検査が通るだけで完了と言わない。利用者が通る経路（実画面・実プロトコル）で確かめる（MUST。憲法 原則 V・DoD 5）
- ユニットテストが拾えないもの（レイアウト崩れ・アセットのパス・実配信の問題）は実経路で補う（同）
- 起動のコマンドとポートの正本は [`docs/guides/development.md`](../development.md) の「まとめて起動」「個別起動」。ここはその使い方の手順

残したい確認は、手で測って終わりにせず E2E にします（DoD 2。`e2e/README.md`）。この手順は、E2E を書く前の探りと、
E2E が見ない見た目の確認と、敵対的レビューでの比較（[敵対的レビュー](./adversarial-review.md) 手順 3・4）に使います。

## 1. ポートが空いているかを確かめる

開発用のポートは固定です。玄関 `5175`、各ツール `5173`・`5174`・`5176`〜`5179`、同期サーバー `8787`、E2E の Caddy `18080`。

```bash
ss -tlnp | grep -E ':(8787|517[3-9]|18080)\b'
```

- **何も出なければ進む。**
- **自分が前に起動したものが残っていたら止める**（`ss -tlnp` の pid を見て、自分のものだけを止める）
- **別のセッション・別のエージェント・人が使っていたら、止めない。** 同じ機械で同時に 2 組は起動できない
  （同期サーバーも E2E のハーネスもポートを固定で使う。#486）。空くのを待つか、別の機械・コンテナで行う
- **埋まったまま起動しない。** 各ツールの Vite は埋まっていると黙って次のポートへ逃げるが、玄関の転送先は固定のポートなので、
  **玄関から開いた画面が別のセッションのサーバーにつながり、他人のコードを測ることになる**。同期サーバーは `EADDRINUSE` で落ちるが、
  画面は開けてしまう（`docs/guides/development.md`「個別起動」）

## 2. 起動する

全部を起動するか、玄関・同期サーバー・確かめたいツールの 3 つだけを起動します。どちらもバックグラウンドで動かし、ログをファイルへ残します。

```bash
pnpm dev > /tmp/tasuki-dev.log 2>&1 &
```

```bash
pnpm --filter @tasuki/sync dev > /tmp/tasuki-sync.log 2>&1 &
pnpm --filter @tasuki/landing dev > /tmp/tasuki-landing.log 2>&1 &
pnpm --filter @tasuki/roulette-web dev > /tmp/tasuki-roulette.log 2>&1 &
```

- 起動したら、ログにエラーが無いこと・**ログに出た URL のポートが手順 1 の固定のポートと同じ**ことを確かめる
- 同期サーバーが立ったかは `ss -tlnp | grep ':8787\b'` で見る

## 3. 玄関から開く

**入口は必ず <http://localhost:5175/>（玄関）。** 各ツールの dev サーバーを直接開くと、玄関への送り返しと base のリダイレクトが噛み合って
再読み込みが止まりません（`docs/guides/development.md`「玄関から通しで使う」）。

玄関でルームを作り、札からツールへ入ります。2 人目は招待の URL から入ります。操作の書き方（ボタンの名前・入り方）は、
**`e2e/support/` の補助関数と `e2e/specs/` の既存の spec を写します**（例: `e2e/support/roulette.ts` の `openRouletteTool`・`joinRouletteTool`）。
ここに画面の文言を写すと、画面を変えるたびにずれます。

## 4. Playwright で測る

目で見て「大丈夫そう」で終えず、数で確かめます。測るスクリプトは**リポジトリの外の作業用のディレクトリ**に置き、コミットしません。
Playwright は `e2e` パッケージの依存（`@playwright/test`）を使います。ブラウザが無い・版が合わないときは、
`pnpm --filter @tasuki/e2e exec playwright install chromium` で入れるか、入れられない環境なら「確かめられなかったこと」に書きます（#487）。

```js
// <作業用のディレクトリ>/measure.mjs — node <作業用のディレクトリ>/measure.mjs <リポジトリの絶対パス>
import { createRequire } from "node:module";
import path from "node:path";

const repo = process.argv[2];
const require = createRequire(path.join(repo, "e2e", "package.json"));
const { chromium } = require("@playwright/test");

const browser = await chromium.launch();
for (const width of [320, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto("http://localhost:5175/");
  // ここでルームを作ってツールへ入る（手順 3）
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${width}px: 横のはみ出し ${overflow}px`);
  await page.screenshot({ path: `/tmp/tasuki-${width}.png`, fullPage: true });
  await page.close();
}
await browser.close();
```

よく測るもの:

| 確かめたいこと | 測り方 |
|---|---|
| 狭い幅で横にはみ出さない | `scrollWidth - clientWidth` が 0 |
| 要素が重ならない・切れない | `locator.boundingBox()` の矩形どうしの交差・親の矩形からのはみ出し |
| 幅の段で並びが変わる | 段の境目（`40rem`・`64rem`・`90rem`。`docs/adr/0025` 決定 1）の前後の幅で `boundingBox()` を比べる |
| 文字が読める | 計算済みの色（`getComputedStyle`）からコントラスト比を出す（`e2e/support/a11y.ts` の補助関数が使える） |
| キーボードで使える | `page.keyboard.press("Tab")` の後の `document.activeElement` と、フォーカスの輪が見えるか |
| 動きを減らす設定 | `page.emulateMedia({ reducedMotion: "reduce" })` の後で同じ操作をする |
| 同期が届く | `browser.newContext()` を 2 つ作り、片方の操作がもう片方の画面に出るまでの時間と中身 |
| 同期の中身 | `page.on("websocket")` でフレームを読む（`e2e/support/ws-frames.ts` が例） |

撮った画面は自分で開いて見ます。数で測れない見た目（揃い・余白の感じ）は、撮った画面を添えて人に判断を頼みます。

## 5. 報告する

報告の「確かめたこと」に、**起動したもの・開いた経路・幅・測った値**を書きます（`docs/adr/0030` 決定 4）。

```markdown
## 確かめたこと
- 玄関（:5175）からルームを作り roulette へ入った。320px・1280px で横のはみ出し 0px
- 2 つのコンテキストで回し、両方の画面に同じ結果が出た（3 回）

## 確かめられなかったこと
- 実機の iOS Safari（手元に無い）
```

撮った画面はコミットしません。PR に添えるときは PR のコメントか本文に貼ります。

## 6. 後片付け

起動したものは使い終わったら止めます（`AGENTS.md`「環境について」）。

```bash
ss -tlnp | grep -E ':(8787|517[3-9]|18080)\b'
```

自分が起動したものが残っていたら、その pid を止めてから、もう一度確かめます。別の人のものは止めません。
