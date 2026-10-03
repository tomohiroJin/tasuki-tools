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
- 基準側の要約（状態ごと・幅ごとの要素数・動きの件数・キーフレームの名前・操作の種類ごとの件数・skipped の名前）を
  期待値（`expected/base-summary.json`）と突き合わせる。違えば赤（両側で同じように空になっても緑にしないため）
- turbo を経由しない（strict env に阻まれる）。WSLg では `WAYLAND_DISPLAY` が要る
- 8787・18080 を使う。終わったら `ss -tlnp | grep -E ':(8787|18080)\b'` が空であることを見る
- 結果は比較の出力置き場 out/（このディレクトリの中・無視している）。**正本は台帳**（`docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`）

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
- 流した後に、既知の答え 5 件（`removal-summary.ts` の `KNOWN_ANSWERS`）を出力に当てる。5 行とも `OK` であること:

```bash
cd e2e
TASUKI_PARITY_REMOVAL_CHECK=1 pnpm exec vitest run tests/removal-summary.test.ts --reporter=verbose
```

## 期待値を作り直す（基準側の要約）

期待値は基準（固定）の要約なので、ふだんは作り直さない。作り直すのは、目録（`states.ts`）や書き出し方を変えたときと、
初めて作るときだけ。**この手順の外で `expected/` を書き換えない。**

1. 上の「流す」を全件流す（各テストが `out/<状態>/base-expectation.json` に基準側の要約を書く。期待値と食い違う・
   期待値が無いテストは赤になるが、要約は書かれる）。目録を変えた後で読み込みが止まるときは、先に
   `expected/base-summary.json` を消してから流す
2. `cd e2e && node --experimental-strip-types parity/expected.ts`（`out/` の要約を束ねて `expected/base-summary.json` を書く。
   `--repeat-each` の置き場 `-r<n>` は読まない）
3. `git diff e2e/parity/expected/` で、変わったのが変えた所だけであることを読む
4. もう一度「流す」を全件流し、全件緑であることを見てからコミットする

## 何を比べるか

設計正本 §5 を読むこと。ここに写さない。
