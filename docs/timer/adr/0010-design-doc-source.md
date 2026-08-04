# ADR-0010: 設計文書の正本は `docs/plans/`（`docs/superpowers/` は移行前の履歴アーカイブ）

- **ステータス**: Accepted
- **関連**: `../../../docs/plans/codebase-refactoring/spec.md`（FR-112）,
  `../../../docs/plans/codebase-refactoring/tasks.md`（T059）
- **スコープ**: どちらが正本かの記録のみを扱う。**両系統の内容の統廃合・移動は本 ADR の対象外**
  （FR-112 は「正本の記録」のみを要求し、内容の書き換えは求めていない）。

## 背景

リポジトリ直下（`/workspaces/claym/local/Tasuki`、`tdd-mob-pro-timer/` の一つ上の階層）の
`docs/` に、設計文書が 2 系統で併存している。

- `docs/plans/` — 24 ファイル（実測 `find docs/plans -name '*.md' | wc -l`）
- `docs/superpowers/` — 43 ファイル（実測 `find docs/superpowers -name '*.md' | wc -l`）

計 67 ファイル。実測時点でどちらが最新の判断かをファイル名だけからは判別できず、
両者を横断して探す必要があった（設計判断を追うコストが上がっていた）。

両系統は生まれた経緯が異なる。

- **`docs/superpowers/`**: `superpowers:brainstorming` / `superpowers:writing-plans` 等の
  スキルワークフローが生成する、日付接頭辞のファイル名（例:
  `2026-06-10-v2.2-phase1-tabbed-lobby.md`）による `plans/`（実装計画）と `specs/`（要件/設計）の
  ペア形式。機能・修正の単位が細かく、実装直前に書かれる。相互参照は文中の Markdown リンクや
  「正本spec: `docs/superpowers/specs/...`」という自己言及で行う。**2026-06-02〜2026-07-25** の
  日付が付き、以降更新されていない（`tdd-mob-pro-timer` の初期〜v2.2/v2.3 期の記録）。
- **`docs/plans/`**: `spec-plan-tasks` スキル（SDD: Specification-Driven Development）による
  `spec.md`（EARS 記法の受け入れ基準）/ `plan.md`（技術設計）/ `tasks.md`（実行タスク）の三点セット。
  機能単位のディレクトリを持ち（例: `docs/plans/codebase-refactoring/`）、要件の識別子
  （`FR-xxx` / `SC-xxx` / `US-x`）で追跡可能な形に構造化されている。**本 Issue #28
  （コードベースの構造是正）自身の spec/plan/tasks もここに置かれている**。

`docs/plans/tdd-mob-pro-timer-v2-experience/`（ステータス: Implemented）は、
`docs/superpowers/plans|specs/2026-06-10〜2026-06-25` の一連の v2.2 系ファイルが実装した
「v2 体験作り直し」を、事後に SDD 形式へ整理し直した上位仕様である。同じ主題が両系統に
存在する数少ない例だが、内容は矛盾ではなく**粒度が異なる**（`docs/plans/` 側が要件・成果の
概観、`docs/superpowers/` 側がフェーズごとの実装計画の明細）。

## 決定

**`docs/plans/` を設計文書の正本とする。** `docs/superpowers/` は
SDD 形式（`spec-plan-tasks`）へ移行する前に作られた設計文書の**履歴アーカイブ**として扱う。

具体的な規則:

1. **`docs/plans/<機能名>/` に `spec.md` が存在する機能について、判断の根拠は `docs/plans/` 側を見る。**
   `docs/superpowers/` に同名・類似主題の文書があっても、参照は `docs/plans/` を優先する
   （前述の v2-experience が該当する）。
2. **`docs/plans/` に対応する項目が無い機能は、`docs/superpowers/` の記述が唯一の記録であり、
   その範囲では実質的な正本として扱う。** 移行済みでない過去の設計判断を辿る手段として、
   削除・非推奨化はしない。
3. **今後の新規の設計文書は `docs/plans/` に `spec-plan-tasks` の形式で作成する。**
   `docs/superpowers/` への新規追加は行わない（ワークフローとしての `superpowers:*` スキル自体を
   禁止するものではないが、その出力を正本文書として置く先は `docs/plans/` にする）。
4. 本 ADR は**記録のみ**であり、既存 67 ファイルの内容修正・移動・統合は行わない
   （spec.md の定めるスコープ外）。将来的に統廃合する場合は、本 ADR とは別の変更単位で行う。

## 影響

- **利点**: 「どちらを見ればよいか」がファイルパスから機械的に判断できるようになる
  （`docs/plans/<機能名>/` があればそれが正本、無ければ `docs/superpowers/` を履歴として参照）。
  新規の設計文書の置き場所に迷わなくなる。
- **代償**: `docs/superpowers/` の 43 ファイルは今後も残り続け、`docs/plans/` と重複する主題
  （v2-experience）については二重に文書が存在する状態が解消されない。本 ADR はこれを
  「正本はどちらか」を明示することで許容する（内容の統廃合は別スコープ）。
- 本 ADR は `docs/plans/codebase-refactoring/spec.md` の FR-112（設計文書はどの体系が正本かを
  記録しなければならない）を満たす。
