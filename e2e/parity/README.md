# 基準と並べる比較（#321）

timer から Tailwind を外す間だけ置く比較の仕組み。**PR 4 の通しの比較の後で消す**（設計正本 §5.1）。
消すときは、関連する箇所を一覧で持たず **`git grep -n parity` で引き直して**消す（このディレクトリのほかに、
`e2e/tests/` の自己テスト・`e2e/tsconfig.json` の include・`e2e/package.json` の lint の引数・`.gitignore` などに在る）。
消した後に再現するときは、台帳に書いた比較の仕組みの SHA で `git checkout <SHA> -- e2e/parity` する。

## 基準の dist を作る（1 回だけ）

基準の SHA は `base-dist.ts` の `BASE_SHA` の 1 か所に置く。読み込みの時点で、渡した dist がブランチの
timer-web の dist でないこと・dist を含む作業ツリーの HEAD が基準であること・`index.html` が参照する資産が
基準のものであることを確かめ、違えば止まる。

```bash
git worktree add ~/.cache/tasuki-parity/base-ba9249d ba9249d
cd ~/.cache/tasuki-parity/base-ba9249d && pnpm install --frozen-lockfile
pnpm exec turbo run build --filter @tasuki/timer-web
```

## 流す

```bash
cd e2e
TASUKI_E2E_TARGET=local \
TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist \
pnpm exec playwright test -c parity/parity.config.ts
```

### 対照実行（基準同士）

```bash
cd e2e
TASUKI_E2E_TARGET=local \
TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist \
pnpm exec playwright test -c parity/parity.control.config.ts
```

- ブランチの側にも基準の dist を配り、基準同士を比べる。差が出たら状態の作り方か読み方の揺れ（`noise.ts` に理由つきで名指しするか、状態を決定的にする）
- 行頭に `[対照実行]` と出て、`out/<状態>/summary.json` の `control` が `true` になる。**対照実行は設定ファイルで選ぶ。** 環境変数では切り替えない（以前の `TASUKI_PARITY_CONTROL` が立っていると、取り残しとみなして止まる）

- **`-u`（`--update-snapshots`）を付けない。** 付けると基準の画像がブランチの画像で上書きされるので、各テストの先頭で止まる
- **`--ignore-snapshots` も付けない**（画素を比べずに緑になるので、各テストの先頭で止まる）
- 基準側の要約（状態ごと・幅ごとの要素数・動きの件数・キーフレームの名前・操作の種類ごとの件数・skipped の名前）を
  期待値（`expected/base-summary.json`）と突き合わせる。違えば赤（両側で同じように空になっても緑にしないため）
- turbo を経由しない（strict env に阻まれる）。WSLg では `WAYLAND_DISPLAY` が要る
- 8787・18080 を使う。終わったら `ss -tlnp | grep -E ':(8787|18080)\b'` が空であることを見る
- 結果は比較の出力置き場 out/（このディレクトリの中・無視している）。**正本は台帳**（`docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`）

**ビルドの切り替え（`TASUKI_TIMER_UNLAYERED` / `TASUKI_TIMER_CSS_UNMINIFIED`）は下の 2 つの設定ファイルが自分で立てる。**
シェルに残っていると、通常の比較・対照実行（`parity.config.ts`）・`pnpm e2e`（`e2e/playwright.config.ts`）・`deploy/deploy.sh` は
取り残しとみなして止まる（`harness/parity-build-switches.ts`。囲い無し・最小化しない CSS を通常の比較で緑にしない・本番へ配らない）。
`summary.json` の `control` / `unlayered` / `usage` で、どの種類で流した出力かを見分ける（`run-mode.ts`。`metadata` と project の名前が食い違えば止まる）。

### 囲いを外した一時ビルド

```bash
cd e2e
TASUKI_E2E_TARGET=local \
TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist \
pnpm exec playwright test -c parity/parity.unlayered.config.ts
```

- ブランチの timer を、入口（`apps/timer-web/src/index.css`）の `@import … layer(timer)` から `layer(timer)` を外してビルドし、基準と比べる（設計正本 D3）。レイヤーを外しても見た目が変わらないことを PR 4 より前に確かめる
- 残してよい差は、親を先に移したとき、レイヤー外になった親の `:where(.x > :not(:last-child))` が、まだ Tailwind のままの子の margin に勝つ型だけ（既知の偽陽性）。ほかの差は直す
- 設定ファイルが `TASUKI_TIMER_UNLAYERED=1` を立て、`globalSetup` のビルドが turbo 経由で受け取る（`turbo.json` の `@tasuki/timer-web#build` の `env`）。切り替えの本体は `apps/timer-web/vite-timer-css.ts`。**`layer(timer)` の `@import` が 0 本ならビルドが止まる**（外し損ねた普通のビルドを比べて緑にしない）
- 行頭に `[囲いを外した一時ビルド]` と出て、`out/<状態>/summary.json` の `unlayered` が `true` になる。**流した後は dist が一時ビルドのまま残る**ので、次の比較の `globalSetup` が既定のビルドへ戻す（turbo のキャッシュは環境変数で鍵が分かれている）

### 規則の使用状況（E8）

```bash
cd e2e
TASUKI_E2E_TARGET=local \
TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist \
pnpm exec playwright test -c parity/parity.usage.config.ts
```

流した**直後に**（dist が最小化しないビルドのうちに）、当たりを束ねて照合する:

```bash
cd e2e
TASUKI_PARITY_USAGE_CHECK=1 pnpm exec vitest run tests/usage-summary.test.ts
```

- ブランチの timer を、CSS の最小化（Vite の `build.cssMinify`）と Tailwind の最適化（`@tailwindcss/postcss` の `optimize`）を止めてビルドする。足した CSS の規則が実行中に 1 回以上当たるかを、ソースの規則と鍵で突き合わせる（E8）
- 設定ファイルが `TASUKI_TIMER_CSS_UNMINIFIED=1` を立てる。渡り方は上と同じ
- 行頭に `[規則の使用状況]` と出て、`summary.json` の `usage` が `true` になる。ブランチの側で、ページを開いた直後（最初の遷移より前）から操作の書き出しの後まで CDP の規則の使用状況を取り（`usage.ts`）、`out/<キー>/usage.json` に当たった規則の鍵と世代を書く。**追跡より前に読み込んだ `<link>` の CSS の当たりは返らない**（実測）ので、目印が見えてから始めると全部「当たらなかった」になる。前の実行の `usage.json` はテストの先頭で消す
- 数えるのは timer のビルドの CSS（`/timer/assets/*.css`）のシートの当たりだけ。撮影が差し込む一時の `<style>` など別のシートで同じ鍵が当たっても数えない。対象のシートが 1 本でなければ止まる（遷移・再読み込みの前の文書のシートは数えない）
- **全件を流す**（`-g` で絞らない）。照合（`usage-summary.ts` の `collectUsage`）は、期待値の JSON の全キーの `usage.json` が揃い、世代が揃い、`-dirty` でなく、いまの HEAD と同じであることを断定してから束ねる
- **分母**は `git ls-files 'apps/timer-web/src/styles/*.css'` のうち `base.css`（PR 1 で移しただけ）と `reset.css`（PR 4）を除いたもの。`@keyframes` の中の段は数えない（キーフレームは比較の本体が突き合わせる）。分母が空なら赤（空振りを緑にしない）
- **鍵**は `@layer` を除いた祖先の at-rule とセレクタ（空白を畳む）。ビルドは `@layer timer` の囲いを足すがソースには無いので、`@layer` は鍵に入れない。分母の鍵がビルドの CSS にちょうど 1 回ずつ現れること（0 回なら写し損ね、2 回以上なら鍵で見分けられない）も断定する。ソースの中で鍵が重複したら止まる
- 「当たった」はセレクタが一致したことで、宣言が勝ったことではない（効いているかは比較と除去検査が見る）
- **当たらなかった規則の扱い**:
  - 撮っていない状態で当たる規則なら、目録（`states.ts`）に状態を足す（期待値の作り直しが要る）
  - どの状態でも当たらない「死んだ CSS」なら、規則を消す
  - 状態を作れない（ハーネスで再現できない）なら、勝手に除外せず利用者に報告する
- **dist の CSS は `assets/index-*.css` の glob ではなく `index.html` が参照するものを読む。** turbo はキャッシュから dist を戻すとき古い資産を消さないので、切り替えを行き来すると別のビルドの CSS が同じ場所に残る（実測）。参照が 1 本でなければ、最小化されていれば（100 行未満）止まる

## 除去検査（基準で効いていないクラス）

```bash
cd e2e
TASUKI_E2E_TARGET=local \
TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist \
pnpm exec playwright test -c parity/parity.removal.config.ts
```

- 基準のページでクラスを 1 つずつ外し、計算済みスタイルが変わらないものを dead とする（`removal.parity.ts`）。PR 2・3 で「写さないクラス」を決めるのに使う
- **既定の比較（上の「流す」）には含めない**（所要時間は台帳）。この設定でだけ流す
- 結果は状態ごとに `out/removal/<状態>.json`。**読むときは `removal-summary.ts` の `loadRemovalProbe` を通す**（目録の状態が欠けていれば止まる。写さないのは、どの状態でも alive にも undecided にも出ない組だけ）
- 結果には世代（HEAD の SHA。作業ツリーが汚れていれば `-dirty` つき）が入り、`loadRemovalProbe` は全状態の世代が揃っていなければ止まる（`-g` で一部だけ流し直したら、全状態を流し直す）
- 作業ツリーが汚れたまま（世代が `-dirty`）流した結果も、`loadRemovalProbe` は止める（未コミットの別々の変更で流した結果は、どちらも `<SHA>-dirty` になって見分けられない）。コミットしてから全状態を流し直す
- 流した後に、既知の答え 5 件（`removal-summary.ts` の `KNOWN_ANSWERS`）を出力に当てる。5 行とも `OK` であること:

```bash
cd e2e
TASUKI_PARITY_REMOVAL_CHECK=1 pnpm exec vitest run tests/removal-summary.test.ts --reporter=verbose
```

## 期待値を作り直す（基準側の要約）

期待値は基準（固定）の要約なので、ふだんは作り直さない。作り直すのは、目録（`states.ts`）や書き出し方を変えたときと、
初めて作るときだけ。**この手順の外で `expected/` を書き換えない。**

1. 作業ツリーが clean であることを見る（`git status --porcelain` が空）。世代が `-dirty` だと 4 が止まる
2. **`cd e2e && rm -rf parity/out` で前の出力を消す**（前の世代の要約が残っていると 4 が止まる）
3. 上の「流す」を全件流す（各テストが `out/<状態>/base-expectation.json` に基準側の要約を、隣の
   `base-expectation.meta.json` に世代と下限を書く。期待値と食い違う・期待値が無いテストは赤になるが、要約は書かれる）。
   目録を変えた後で読み込みが止まるときは、`git rm e2e/parity/expected/base-summary.json` で消し、**その削除（と目録の変更）を
   コミットしてから 1 からやり直す**（消しただけでは作業ツリーが dirty になり、4 が必ず止まる）
4. `cd e2e && node --experimental-strip-types parity/expected.ts`（`out/` の要約を束ねて `expected/base-summary.json` を書く。
   `--repeat-each` の置き場 `-r<n>` は読まない）。世代が揃わない・下限（どの幅でも要素数が目録の `minElements` 以上・
   動きの件数が 1 以上）を下回る・dirty なら、何も書かずに止まる
5. `git diff e2e/parity/expected/` で、変わったのが変えた所だけであることを読む
6. もう一度「流す」を全件流し、全件緑であることを見てからコミットする

## 何を比べるか

設計正本 §5 を読むこと。ここに写さない。
