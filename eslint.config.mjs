/**
 * ESLint 設定（flat config・ワークスペース共通）
 *
 * 3パッケージ（core / sync / web）で1つの設定を共有する。各パッケージの lint スクリプトは
 * `eslint src` を実行し、ここのルールが適用される。ESLint 9 以降は flat config が既定で、
 * `--ext` フラグは廃止されているため、対象拡張子は files パターンで指定する。
 *
 * **型情報を要求するルール（typescript-eslint の typeChecked 系）は有効にしていない。**
 * 型の誤りは `pnpm typecheck`（tsc --noEmit）が既に全ファイルを検査しており、
 * lint 側で二重に型情報を読むとワークスペース全体の実行時間が数倍になる。
 * lint はここでは「型では拾えない書き方の問題」に絞る。
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    // ビルド成果物と依存は検査しない。
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // 未使用の識別子は削除する（coding-style.md「未使用のインポートは削除」）。
      // ただし `_` 始まりは「意図的に受け取るが使わない」の合図として許す
      // （分割代入で特定キーを除外する定型、catch の握り潰し等）。
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // `any` は禁止（coding-style.md）。unknown + 型ガードへ寄せる。
      // 導入時点で src・test とも 0 件だったため、警告ではなく error で固定する
      // （警告は exit code に影響せず「通った」の実質を失わせる）。
      "@typescript-eslint/no-explicit-any": "error",
      // var 禁止・const 優先（coding-style.md）。
      "no-var": "error",
      // ignoreReadBeforeAssign: 宣言と初回代入の間で読まれる変数は const にできない。
      // server.ts の wsAdapter がこれで、broadcaster のクロージャが代入前に参照する
      // （相互参照のための前方宣言）。const に直すと初期化順で壊れる。
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
    },
  },

  {
    // React はブラウザ側だけ。フックの依存配列の誤りは実行時バグに直結するため error。
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // 依存配列の漏れは実行時バグに直結するので error にする。警告のままだと
      // exit code 0 のままとなり、lint が通ったことが何も保証しなくなる。
      // 意図的に依存を省く箇所は個別に eslint-disable-next-line で理由を書くこと。
      "react-hooks/exhaustive-deps": "error",
    },
  },

  {
    // テストは `!` や重複定義など、本番コードでは避ける書き方を意図的に使う。
    files: ["**/test/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
