# #496 の調査で流したスクリプト

[`../2026-11-01-test-gap-survey.md`](../2026-11-01-test-gap-survey.md) の測定を、測り直せるように残したもの。
**検査ではない**（CI にも `pnpm test` にもつながない。#496 のスコープ外）。6.2 の F（自動の変異の定期調査）や、
新しい受け口を足すとき（5.3 の条件）に使い直す。

どれもリポジトリのルートを引数で受け取り、結果は標準出力か、渡したディレクトリへ書く。リポジトリの中には書かない
（`stryker-run.sh` と `recheck-run.mjs` は使い捨ての作業ツリーを書き換えて戻す）。

| ファイル | 節 | 使い方 | 所要（2026-11-01） |
|---|---|---|---|
| `density.mjs` | 1 | `node density.mjs <ルート> > density.json` | 0.07 秒 |
| `stryker-run.sh` | 2.2 | `bash stryker-run.sh <Stryker の置き場> <作業ツリー> <結果の置き場> topic-core room-core …` | 5〜281 秒/パッケージ |
| `stryker-summary.mjs` | 2.3〜2.5 | `node stryker-summary.mjs <結果の置き場>`（Stryker の JSON から生存率と生き残りの一覧） | 1 秒未満 |
| `recheck-list.mjs` | 2.5 | `node recheck-list.mjs <結果の置き場> > recheck-list.json`（2.5 で拾った行の生き残りを、正確な置き換えつきで取り出す） | 1 秒未満 |
| `recheck-run.mjs` | 2.5 | `node recheck-run.mjs recheck-list.json <作業ツリー> <分割の番号> <分割の数> <出力の .jsonl> <bun の実行ファイル>`（変異を入れて core・tasuki-sync・利用側の web のテストを流し、戻す） | 2.5 を参照 |
| `order.sh` | 3 | `bash order.sh <ルート> <結果の置き場>` | 1,271 秒 |
| `conventions.mjs` | 4 | `node conventions.mjs <ルート> > conventions.json` | 1.4 秒 |
| `boundary.ts` | 5 | `bun boundary.ts <ルート> > boundary.json`（本番と同じ入口を子プロセスで起こして壊れた入力を投げる。終わると止める） | 91 秒 |

`conventions.mjs` は呼び出しの形だけで `it` / `test` を見分けるので、`it` という名前の変数を拾うことがある（4.2 の 20 件目）。
