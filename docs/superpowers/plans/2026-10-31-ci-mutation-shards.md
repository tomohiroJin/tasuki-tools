# CI の待ち時間を短くする（#481）— 実装計画

**Goal:** PR の CI の全体時間を、変異の全件を毎回流したまま 10 分以内に収める。変異が増えても、行を足すだけで追いつける形にする。

**Architecture:** 変異検査（`scripts/mutation-check.mjs`）に 2 つの指定を足す。`--shard k/n`（全件を n 個に分けた k 番目）と
`--jobs m`（HEAD の写しの作業ツリーを m 個作り、普段の 1 回の実行をそれぞれで子として起こす）。分け方は 1 つの純粋関数
（`scripts/lib/mutation-partition.mjs`）にまとめ、両方が使う。CI は `mutation` ジョブを matrix で n 本起こし、集約の `mutation-all` で結果をまとめる。

**Tech Stack:** Node 22（`node --test`）・GitHub Actions・git worktree・pnpm（`--offline`）

**Spec:** [`docs/superpowers/specs/2026-10-31-ci-wait-design.md`](../specs/2026-10-31-ci-wait-design.md)（以下「設計」）・
決定は [`docs/adr/0029`](../../adr/0029-mutation-shards-in-ci.md)

- **日付**: 2026-10-31・**実測時点**: main `7ed5663`
- **枝**: `claude/funny-noether-yg6xcz`。PR は 1 本（下書き）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 分け方・`--shard`・`--jobs`・残骸・終了コードの判定は、自己テストを先に書いて赤を見てから実装する（Task 1〜3） |
| II. 技術選定は ADR を通す | 通過 | 新しい依存なし（git worktree と pnpm の `--offline` は既存の道具）。CI の形の決定を ADR 0029 に記録し、ADR 0009 に追記する（Task 5） |
| III. 揮発インメモリと単純運用 | 通過 | 製品の状態の持ち方に触れない。作業ツリーは一時ディレクトリに作って終わりに消す |
| IV. 境界の型安全 | 通過 | 引数（`--shard`・`--jobs`）は形と範囲を確かめ、外れたらロックより前に止める |
| V. 実画面検証 | 通過 | 画面に触れない。代わりに実経路として CI の実行（PR の push を 3 回以上）で全体時間とシャードの件数を確かめる（Task 6） |
| VI. 依存は内向き | 通過 | `scripts/lib/` の純粋関数を入口が使う形のまま。製品のパッケージには触れない |
| VII. 検査は壊して確かめる | 通過 | 変異 620〜627 を足す（Task 4）。CI の配線の自己テストは ci.yml を壊して赤を見る。集約のジョブはシャードを 1 つ落として赤を見る（Task 6） |
| VIII. 記録が正本 | 通過 | 実測は設計 §2・§8、決定は ADR 0029、使い方は `docs/guides/development.md` と `AGENTS.md` |
| IX. 小さく回す | 通過 | PR 1 本。ci（`pnpm test`）・e2e の短縮は範囲の外（設計 §3 の E） |
| X. 抽象は実需で | 通過 | 分け方を 1 つにまとめるのは、シャードとワーカーの 2 つの実需があるから。前回の所要時間から割り当てを決める仕組みは作らない |
| XI. 秘密と個人情報を持ち込まない | 通過 | 秘密・個人情報を扱わない。CI に新しい権限を足さない（`contents: read` のまま） |

**逸脱なし。**

## Global Constraints

- **CI で変異を絞り込まない**（ADR 0029 決定 1）。`--changed` を CI に書かない
- **安全機構（ロック・復元・マーカー・未コミット変更の検査）を作り直さない。** `--jobs` の子は普段の 1 回の実行そのもの
- 変異検査の入口（`scripts/mutation-check.mjs`）は汚れの検査が除外する場所なので、**そこを変異させない**（変異させたい判定は `scripts/lib/` に置く）
- 試験は `describe`・`test` を日本語で書く

## Tasks

- [x] **Task 1: 分け方**（`scripts/lib/mutation-partition.mjs`）— 対照の組にまとめ、重い組から軽い分け前へ配る。合わせると全件・重ならない・組を割らない・空を作らない・同じ入力から同じ結果
- [x] **Task 2: `--shard`**（`scripts/lib/mutation-select.mjs`）— `k/n` の解釈・範囲・他の選び方との混在の拒否・表題・緑の文言
- [x] **Task 3: `--jobs`**（`scripts/lib/mutation-parallel.mjs`・`scripts/mutation-check.mjs`）— ワーカーの割り当て（組の数で抑える）・残骸の判定・ワーカーごとの結果。入口は作業ツリーを作り、`--offline` で依存を入れ、子を起こし、終わり・シグナルで片づける。機構のファイルの導出を再帰にする
- [x] **Task 4: 変異 620〜627**（設計 §5.5）— すべて検出されることを `--id` で確かめる
- [x] **Task 5: CI と文書** — `mutation` ジョブ（matrix）と `mutation-all`、`quality` から変異検査を外す。CI の配線の自己テスト。ADR 0029・ADR 0009 の追記・ADR の索引・`docs/guides/development.md`・`AGENTS.md`
- [ ] **Task 6: CI で確かめる** — PR の CI を 3 回以上流し、全体時間が 10 分以内・シャードの件数の合計が全件・すべて検出を見る。集約のジョブが、シャードを 1 つ落とすと赤になることを見る（確かめたら戻す）

## 検証の実行時間の見積もり

| 検証 | 1 回 | 回数 | 小計 |
|---|---|---|---|
| scripts の自己テスト | 約 2 分 | 3〜4 回 | 約 8 分 |
| 手元の全件（直列と `--jobs 4` の比較） | 直列 約 25 分・並列 約 8 分（推測） | 各 1 回 | 約 35 分 |
| 変異 620〜627（`--id`） | 数秒 | 2 回 | 約 1 分 |
| CI（PR） | 約 6 分（推測） | 3〜4 回 | 約 25 分 |

**合計が 2 倍を超えたら、続ける前に利用者へ報告する。**
