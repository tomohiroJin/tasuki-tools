# #587 の調査で流したスクリプト

[`../2026-11-13-architecture-review-survey.md`](../2026-11-13-architecture-review-survey.md) の測定を、測り直せるように残したもの。
**検査ではない**（CI にも `pnpm test` にもつながない。#587 のスコープ外）。直したあとに同じ物差しで測り直すときに使う。

どれもリポジトリのルートを第 1 引数で受け取り、結果は標準出力へ JSON で書く。**パスの引数は相対パスでよい**。
走査の母集合は `git ls-files`（この環境の FS は大文字小文字を区別しないので `readdirSync` で歩かない）。拡張子はスクリプトごとに違う:
`a-dependency-edges.mjs` は `.ts` `.tsx` `.mjs`、`a-extension-cost.mjs` は全追跡ファイル（バイナリは名前だけ）、`b-duplicates.mjs` と `d-size.mjs` は `.ts` `.tsx`、
`c-contracts.mjs` は core・protocol・sync-client と同期サーバーの application・ports の `.ts` `.tsx` `.mjs`、`d-dead-exports.mjs` は export の側が `.ts` `.tsx`・参照の側が `.ts` `.tsx` `.mjs` `.cjs` `.js`。
`a-dependency-edges.mjs`・`a-extension-cost.mjs`・`d-dead-exports.mjs` は、このディレクトリ（`2026-11-13-architecture-review-survey*`）を母集合から外す（スクリプト自身の語・変数名を数えると、マージ後の木で基準値がずれる）。
**結果の置き場はリポジトリの外を渡す**（作業ツリーの中に `tmp/` を作ると、変異検査が「未コミットの変更」として止まる）。
node 標準ライブラリだけで動く（依存を入れずに流せる）。

| ファイル | 節 | 使い方 | 所要（2026-11-13・本体の作業ツリーで流し直した値） |
|---|---|---|---|
| `a-dependency-edges.mjs` | 1 | `node a-dependency-edges.mjs <ルート> > edges.json`（import の辺・層の判定・監査の外の違反。`summary.byRule` に内訳） | 約 5 秒 |
| `a-extension-cost.mjs` | 2 | `node a-extension-cost.mjs <ルート> tool\|method\|deck > ext-<試算>.json`（触る場所のファイル一覧と 4 欄の合計。直したあと同じ引数で流し直して比べる） | 10〜15 秒／試算 |
| `b-duplicates.mjs` | 3 | `node b-duplicates.mjs <ルート> > dup.json`（20 行の窓の塊・同名の export・文言と定数） | 約 4 秒 |
| `c-contracts.mjs` | 4 | `node c-contracts.mjs <ルート> > c.json`（`string` の ID・`throw`・可変の状態・型の抜け道・性質テスト。`summary` に集計） | 約 3 秒 |
| `d-size.mjs` | 5 | `node d-size.mjs <ルート> > size.json`（行数・フックの数・テストのケース） | 約 4 秒 |
| `d-dead-exports.mjs` | 5 | `node d-dead-exports.mjs <ルート> > dead.json`（`deadExports`・`weakExports`） | 約 5 秒 |

#496 の道具（`../2026-11-01-test-gap-survey/conventions.mjs`）は `typescript` を読むので、依存の入った作業ツリーで流す（約 12 秒）。
