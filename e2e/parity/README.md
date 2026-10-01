# 基準と並べる比較（#321）

timer から Tailwind を外す間だけ置く比較の仕組み。**PR 4 の通しの比較の後で消す**（設計正本 §5.1）。
消した後に再現するときは、台帳に書いた比較の仕組みの SHA で `git checkout <SHA> -- e2e/parity` する。

## 基準の dist を作る（1 回だけ）

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
- **既定の比較（上の「流す」）には含めない**（約 25 分かかる）。この設定でだけ流す
- 結果は状態ごとに `out/removal/<状態>.json`。**読むときは `removal-summary.ts` の `loadRemovalProbe` を通す**（目録の状態が欠けていれば止まる。写さないのは、どの状態でも alive にも undecided にも出ない組だけ）

## 何を比べるか

設計正本 §5 を読むこと。ここに写さない。
