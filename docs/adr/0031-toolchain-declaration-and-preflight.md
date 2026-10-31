# ADR-0031: 開発環境の版は 1 か所で宣言し、合わないときは検査の前に止める

- **ステータス**: Proposed（2026-10-31。採択は人が判断する。`docs/adr/0030` 決定 1）
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
- Chromium は、Playwright が探す置き場（`PLAYWRIGHT_BROWSERS_PATH`、未設定なら OS の既定）に、本体と
  headless shell の両方の要求 revision があるかを見る。**別の revision へのリンクで回避しない**（違う版のブラウザで試すことになる）
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
