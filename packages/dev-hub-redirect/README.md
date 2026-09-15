# @tasuki/dev-hub-redirect

**dev サーバー専用**の Vite プラグイン（`apply: "serve"`）。timer / poker の dev サーバーを
直接開いたときに起きる無限リロードを止める（#95 S5c 追補・#249）。

玄関のポート（`HUB_PORT`）の正本もここに置く。timer / poker / landing の 3 つの
`vite.config.ts` が同じ値を参照するため、パッケージにして 1 箇所に持たせている
（ルート直下に置いていた頃は、どのパッケージの tsconfig の射程にも入らず
`pnpm typecheck` が落ち、パッケージ外を相対パスで取り込むため
`scripts/audit-dependency-direction.mjs` も落ちた）。

**本番ビルドには影響しない。** 理由と仕組みは `src/index.ts` の docstring にある。
