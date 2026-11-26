# ADR-0031: 開発環境の版は 1 か所で宣言し、合わないときは検査の前に止める

- **ステータス**: Accepted（2026-11-01。利用者が PR tomohiroJin/tasuki-tools#492 で採択。`docs/adr/0030` 決定 1 のとおり人が判断した）
- **関連**: [#487](https://github.com/tomohiroJin/tasuki-tools/issues/487)（親 [#483](https://github.com/tomohiroJin/tasuki-tools/issues/483)） /
  [ADR-0030](./0030-ai-driven-development-operations.md)（決定 2「どこで開発しても同じ検査が同じ条件で流れる」・影響 2） /
  [ADR-0008](./0008-dependency-supply-chain.md)（依存の固定） /
  [ADR-0009](./0009-ci-scope-and-checks.md)（検査の配置） /
  [ADR-0014](./0014-scan-target-integrity.md)（走査対象の健全性）

## 背景

2026-10-30〜31 のクラウドのセッションで、検査が「環境の差」で落ちる・流せない形を 4 つ観測した（#487）。

1. `package.json` の `engines` は `node >=22.22.2` だが、環境は 22.22.0 だった。pnpm の警告だけで先へ進んだ
2. Playwright が要求する Chromium の revision（1248）と、入っている版（1243）が違った。
   E2E のハーネスの検査（当時の `browsers.ts`）は止めたが、直し方は示さなかった。しかも `PLAYWRIGHT_BROWSERS_PATH` が
   未設定なら何も見なかった。シンボリックリンクで回避した
3. Caddy を取れない環境では E2E が流せないが、curl の失敗しか出なかった
4. 変異検査が環境の Bun（1.4.4。宣言は 1.4.3）で無関係のテスト（`ws-adapter.message.test.ts:863`）を落として止まった

版の宣言は散らばっていた。Node は `engines` と CI の `node-version: 22`（下限と違う版）、Bun は CI の
`bun-version` 4 か所、Caddy は `e2e/harness/paths.ts`（CI が sed で読む）。手元と devcontainer が Bun と
Caddy の版を知る手段は、CI の YAML を読むことだけだった。

## 決定

### 1. どの版も 1 か所にだけ書く

| 道具 | 正本 | 比べ方 |
|---|---|---|
| Node | `toolchain.json` の `node` | 宣言以上・同じ major |
| Bun | `toolchain.json` の `bun` | 完全一致 |
| Caddy | `toolchain.json` の `caddy` | 完全一致 |
| pnpm | `package.json` の `packageManager` | 完全一致 |
| Chromium | `e2e/package.json` の `@playwright/test`（revision はこの版に 1 対 1） | revision の置き場の実在 |

- **MUST**: CI・E2E のハーネス・手元の検査は、版を上の正本から**読む**。写さない
  （CI は `toolchain.json` を jq で読み、`setup-node`・`setup-bun`・Caddy のキャッシュの鍵へ渡す）
- **MUST NOT**: pnpm と Chromium を `toolchain.json` に書かない。道具自身が正本を読む
  （corepack は `packageManager` を、Playwright は自分の版から revision を決める）ので、写すと 2 か所になる
- Node だけを「以上」で比べる。`engines` が範囲で、手元の Node を patch まで揃えさせるのは重い。
  **CI は宣言の版（下限）そのもので流す**。下限で通ることを CI が保証し、それより新しい同じ major は手元で許す
- Bun と Caddy は本番と同じ版に固定する（`deploy/README.md` の「Bun を上げる」「Caddy を上げる」）

### 2. 検査を始める前に比べ、合わなければ始めない

- **MUST**: `pnpm test`・`pnpm e2e`・変異検査（`scripts/mutation-check.mjs`）・E2E のハーネスは、検査を始める前に
  `scripts/check-toolchain.mjs <段>` を通す。合わなければ、**どの道具が・宣言と環境のどの版で・どう揃えるか**を出して
  非ゼロで終わる
- 段ごとに見る道具: `test`・`mutation` は Node・pnpm・Bun、`e2e` はそれに Chromium と Caddy を足す
- Chromium は、Playwright が探す置き場に、本体と headless shell の両方の要求 revision があるかを見る。
  置き場は **Playwright と同じ規則で解く**（`PLAYWRIGHT_BROWSERS_PATH` と `npm_config_…` の別名・`0` は playwright-core の中・
  未設定なら OS の既定）。置き場や revision を決められないときは、比べずに通さず止める。
  **別の revision へのリンクで回避しない**（違う版のブラウザで試すことになる）
- 「完全一致」は付記も含めて一致すること。`1.4.3-canary.1` や `1.4.3+abc` は 1.4.3 ではない（Node の「以上」も、付記つきの版は止める）
- Caddy は、まだ取得していないだけなら止めない（ハーネスが宣言の版を取得し、公式の checksums と照合する）。
  **取得できなければ、ハーネスは起動せず、何が無く、どう入れるかを示す**
- **MUST NOT**: 版の比較を飛ばす指定（環境変数・引数）を置かない。置くと、それを付けたまま検査を弱めることになる
  （`docs/adr/0030` 決定 1 の MUST NOT）

### 3. 宣言と、それを読む側のずれを検査で捕まえる

- **MUST**: `scripts/audit-toolchain.mjs`（CI の `docs` ジョブ）が次を見る。①宣言が読める
  ②workflow の `setup-node`・`setup-bun`・Caddy のキャッシュの鍵が `steps.toolchain.outputs.*` を指し、参照より前に
  `toolchain.json` を読む段がある ③workflow と `e2e/harness/*.ts` のコメントの外に宣言の版の文字列が無い
  ④`engines.node` が `>=` と宣言の下限 ⑤`@playwright/test` と `playwright-core` が同じ x.y.z
- 環境の版は見ない（それは決定 2 の役目）。workflow は行で読む（追加依存は禁止）

### 退けた案

| 案 | 退けた理由 |
|---|---|
| 道具ごとの版ファイル（`.node-version`・`.bun-version`）に分ける | 「1 か所」にならない。Caddy を置く慣習のファイルも無い |
| pnpm・Playwright の版も `toolchain.json` に書く | 道具自身が読むのは `packageManager` と `e2e/package.json`。写しが 1 つ増えるだけになる |
| `package.json` の `devEngines` で宣言する | pnpm が runtime の取得まで受け持つ挙動を持ち込むことになる（技術選定の変更。原則 II）。Caddy は書けない |
| Node も完全一致にする | 手元の Node を patch ごとに入れ替えさせる重さに見合う不具合が観測されていない（観測は下限割れ） |
| 合わないときに警告だけ出して進む | #487 の 1 がまさにこの形で、気づかれないまま進んだ |
| 比較を飛ばす環境変数を用意する | 決定 2 の MUST NOT |

## 影響

- `toolchain.json` を足し、CI の `node-version: 22`・`bun-version: 1.4.3`・`e2e/harness/paths.ts` の `CADDY_VERSION` の直書きを、
  そこから読む形にした。**CI の Node は 22 系の最新から 22.22.2（宣言の下限）に変わる**
- E2E のハーネスの `browsers.ts` を廃し、Chromium の検査を `scripts/check-toolchain.mjs` へ移した
- Renovate は Bun を `toolchain.json` から拾う（`renovate.json` の `customManagers`。承認制の規則はそのまま当たる）。
  Node の下限と Caddy は今までどおり手で上げる（Node を上げるときは `engines.node` も同じ PR で上げる。ずれは決定 3 が捕まえる）
- **devcontainer の定義はリポジトリに無い**（2026-10-31）。devcontainer が版を `toolchain.json` から読むようにするのは、
  定義をリポジトリに置くときに行う。それまでは、devcontainer の中でも決定 2 の比較が検査の前に止める
- 環境の版が宣言と違う手元では、`pnpm test` が始まらなくなる。揃え方は止まったときの出力に出る

## 追記（2026-11-19・#441・Accepted）

上の「影響」の「Node の下限と Caddy は今までどおり手で上げる」のうち、**Node は変わった**（本文は記録なので書き換えない）。

- Node を 26 系の LTS（26.13.1）へ移した。`toolchain.json` の `node` と `package.json` の `engines.node`（`>=26.13.1`）を同じ版にしてある
- Renovate は `toolchain.json` の `node` と `engines.node` を、**同じ PR で**追う（`renovate.json` の `customManagers`・独立した群 `Node`）。
  片方だけ上がると決定 3 の検査が赤くなるため、2 つを 1 つの PR にしてある
- patch・minor も含めて Dependency Dashboard での承認制（Bun と同じ。下限が上がると決定 2 の事前の検査が手元の古い Node を止めるので、手元を入れ替える準備ができてから承認する）。Renovate の `node` の versioning は LTS に入った系列だけを安定版と見るので、LTS に入るまで提案されない
- Caddy は今までどおり手で上げる
- 根拠: ISSUE #441 のコメント（2026-10-25。「26 系へ固定したあとは、その版を Renovate が追う」）

## 追記（2026-11-26・#674・Accepted）

- **ステータス**: Accepted（2026-11-27。利用者が会話で採択した。`docs/adr/0030` 決定 1 のとおり人が判断した。実装は PR #695）

E2E の一部を WebKit（iPhone の端末）でも流す。招待は QR を読んで iOS の Safari で開くことが多いが、Chromium だけでは
iOS での崩れを配る前に拾えない（#674）。決めることの 1〜5 は、利用者が推奨どおりと決めた（2026-11-26・ISSUE #674 のコメント issuecomment-7195264125 に記録）。

- **段を足す**: `scripts/check-toolchain.mjs` に `e2e-webkit` の段（Node・pnpm・Bun・WebKit・ffmpeg・Caddy）を足す。
  WebKit の正本は Chromium と同じ `e2e/package.json` の `@playwright/test`（revision は playwright-core の `browsers.json`。
  `toolchain.json` には書かない・決定 1 の MUST NOT に WebKit も含める）。見るのは置き場の `webkit-<revision>` の実在だけで、
  OS の依存（GTK・GStreamer ほか）は見ない（Chromium と同じく、道具が正しく動くかは見ない）
- **`e2e` の段は WebKit を見ない**。WebKit は OS の依存を入れるのに sudo が要り、手元で揃わないことがある。
  WebKit が無いだけで Chromium の E2E を止めない
- WebKit の `browsers.json` は macOS 14 向けの差し替え（`revisionOverrides`）を持つ（Playwright 1.65）。差し替えの名前が
  すべて `mac` で始まり、macOS でなければ既定の revision を探す。それ以外は決定 2 どおり、比べずに通さず止める
- **入口**: `pnpm e2e:webkit`（`TASUKI_E2E_BROWSER=webkit`）。1 回の実行で流すのはどちらか一方のブラウザ（`e2e/harness/browser.ts`）。
  知らない値は Chromium に読み替えずに止める。本番の E2E（`pnpm e2e:prod`）は WebKit で流さない（#674 のスコープ外）
- **流す範囲（決めること 1）**: `@core`（各道具の主な流れ）と `@webkit`（玄関・幅の狭い画面の配置とボタン・招待の手動コピー・
  poker の手で選ぶ欄）。`@smoke`（HTTP の応答だけ）は流さない。全件は流さない（試走で 18 件・1 ワーカー約 5 分。
  全件は Chromium で約 360 件あり、同じ割合なら 1 時間を超える）。範囲を広げるときは、spec に `@webkit` を付ける
- **端末（決めること 2）**: `devices['iPhone 15']`（タッチ・狭い幅）だけ。Desktop Safari は流さない
- **1 ワーカーで流す**。WebKit の描画が重なると Check-in Cards とルーレットが時間切れになった（#674 の試走・PR #694）
- **CI**: `e2e` と並列の別ジョブ `e2e-webkit`。準備の段は `e2e` の写しで、ずれは `scripts/e2e-webkit-workflow.test.mjs` が捕まえる。
  `e2e` に足すと臨界経路が伸びる（`e2e` は約 10.5 分・最長の変異のシャードは約 13.5 分。2026-11-25 の main）
- **手元で流せないとき（決めること 4）**: WebKit の E2E は CI に任せてよい。`pnpm check:full` は CI から `pnpm e2e:webkit` を導くので、
  WebKit が無い手元ではその 1 本が止まる。止まった道具と理由は、終わりの報告の「確かめられなかったこと」に書く（`docs/adr/0033` と同じ扱い）
- **WebKit で落ちた spec（決めること 5）**: 直すのを基本にする。WebKit で飛ばす・緩めるのは検査を弱める変更なので、1 本ずつ人の承認を得る
  （`docs/adr/0030` 決定 1）
- 根拠: ISSUE #674・PR #694（試走で見つかった失敗の直し）
