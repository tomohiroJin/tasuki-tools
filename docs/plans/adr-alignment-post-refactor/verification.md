# 検証記録: T009〜T012（横断検証）

**Issue:** [#33](https://github.com/tomohiroJin/tasuki-tools/issues/33) ・ **タスク:** [`tasks.md`](./tasks.md) ・ **記録日:** 2026-07-31

> T001〜T008（フェーズ0〜3）はすでに完了済み（コミット `e2e1a40` `caeb70b` `d74489d` `132284e`）。
> 本ファイルはフェーズ4（横断検証）T009〜T012 の実測コマンドと出力を、後から
> 「本当に検証したのか」を追跡できるようにするために記録するものである。

## T009 — 検証4: 相対リンクの解決可能性（SC-051）

実行コマンド（`tdd-mob-pro-timer/docs/adr/` を基準ディレクトリとして実行）:

```bash
cd tdd-mob-pro-timer/docs/adr
grep -oE '\]\(\./[^)]+\)' *.md | sed -E 's/^[^:]+:\]\(\.\///; s/\)$//' | sort -u | while read -r f; do
  test -f "$f" || echo "BROKEN LINK: $f"
done
```

**実測出力**: なし（0 行）。

**判定**: Green。`BROKEN LINK` が 0 件であることを確認した。ADR-0001・0002・0009 の編集後も
相互参照（例: ADR-0001 追記セクションが挙げる決定・根拠の記述）が壊れていない。

## T010 — 検証5: コード非変更の確認（FR-149）

実行コマンド:

```bash
git diff --stat main...HEAD -- tdd-mob-pro-timer/apps tdd-mob-pro-timer/packages
```

**実測出力**: なし（空）。

**判定**: Green。このブランチでコード側（`apps/`, `packages/`）に一切差分が無いことを確認した。

## T011 — ADR 配下の変更ファイルがちょうど3件であることの確認

実行コマンド:

```bash
git diff --stat main...HEAD -- tdd-mob-pro-timer/docs/adr
```

**実測出力**:

```
 tdd-mob-pro-timer/docs/adr/0001-monorepo-shared-core.md | 17 +++++++++++++++++
 tdd-mob-pro-timer/docs/adr/0002-decider-pure-domain.md  |  2 +-
 tdd-mob-pro-timer/docs/adr/0009-test-conventions.md     |  2 +-
 3 files changed, 19 insertions(+), 2 deletions(-)
```

**判定**: Green。変更のあったファイルは `0001-monorepo-shared-core.md`・
`0002-decider-pure-domain.md`・`0009-test-conventions.md` の3件のみであり、
`README.md` を含む他の ADR（0003〜0008・0010）には変更が及んでいない。
論点4・0005・0006・0003・0004・0007・0010 に対して本作業が何も変更していないこと
（スコープ外の遵守）を確認した。

## T012 — 3ファイルの最終差分の1件ずつの照合（全要件・統合ゲート）

実行コマンド:

```bash
git diff main...HEAD -- \
  tdd-mob-pro-timer/docs/adr/0001-monorepo-shared-core.md \
  tdd-mob-pro-timer/docs/adr/0002-decider-pure-domain.md \
  tdd-mob-pro-timer/docs/adr/0009-test-conventions.md
```

**実測差分**（要約。全文は上記コマンドの実行結果を参照）:

- `0009-test-conventions.md`: L3 のステータス行1行のみが
  `- **ステータス**: Accepted（一部実施中。移行は G3 バッチ単位で進行）` から
  `- **ステータス**: Accepted（移行完了・148 ファイル全件）` に変更されている。
  他の行に差分は無い。
- `0002-decider-pure-domain.md`: 「影響」節の「利点」内の1文のみが
  `サーバーとソロが同じ decide/evolve を呼ぶため挙動が一致する。` から
  `apps/sync と apps/web が同じ decide/evolve を共有するため挙動が一致する。` に
  変更されている。同節内の他の文（`now` の引数化・fast-check の記述、「代償」）、
  および「決定」節（採用背景・Decider パターンの採用そのもの）には差分が無い。
- `0001-monorepo-shared-core.md`: 既存の全行（背景・決定・影響、L1〜28）には
  削除・変更が無く、末尾に見出し `## 更新 (2026-07-31)` を持つ追記セクション
  （17行、すべて `+` 行）が新規追加されている。

**1件ずつの照合結果**:

| # | 照合項目 | 結果 |
|---|---|---|
| (i) | 0009 は1行のみ変更 | 合致（ステータス行のみ。`+1/-1`） |
| (ii) | 0002 は「利点」の1文のみ変更・「決定」節は無変更 | 合致（利点内1文のみ`+1/-1`。「決定」節に差分なし） |
| (iii) | 0001 は追加行のみで削除行が無く、追記セクションが末尾に独立して存在 | 合致（`17 insertions(+), 0 deletions(-)`。見出し`## 更新 (2026-07-31)`が末尾に独立） |

**判定**: Green。すべて満たしており、レビュー可能な状態として完了とする。

---

## 追加作業1: 関連ドキュメントの追随調査

ADR-0001・0002・0009 の3件を実態に合わせたことで、**他に「単に事実として偽になっている記述」が
残っていないか**を横断的に調査した。

### 調査コマンド

```bash
grep -n "0001\|0002\|0009" tdd-mob-pro-timer/docs/adr/README.md
grep -n "ソロ" tdd-mob-pro-timer/docs/ARCHITECTURE.md
grep -rln "ソロ" tdd-mob-pro-timer/docs README.md docs 2>/dev/null \
  | grep -v "docs/plans/archive" | grep -v "docs/superpowers"
grep -n "ソロ" tdd-mob-pro-timer/README.md
grep -n "ソロ" docs/BACKLOG.md
```

### 調査結果と判断

| ファイル | 状態 | 判断 |
|---|---|---|
| `tdd-mob-pro-timer/docs/adr/README.md` | 0001・0002・0009 の要約行は既に実態と一致（0009 は既に「移行完了」と記載済み。0001・0002 の要約行はソロモードに言及していない） | 変更不要（既に正しい。plan.md の想定どおり） |
| `tdd-mob-pro-timer/docs/ARCHITECTURE.md` | 現行アーキテクチャを説明する図と文章に「ソロは WS を通らない」「サーバーとソロモードの双方が使う」という、撤去済みのソロモードを前提にした記述が残存。`apps/web/src/solo` はコード上に存在せず、`apps/web` 配下に "solo" を含む実装コードも無いことを確認済み（Issue #28 完了）。ADR ではなく「現在のアーキテクチャ」を説明するドキュメントであるため、単なる事実の古さと判断 | **修正した**。図から「ソロは WS を通らない」の行を除去し、「core を front/server で共有」の説明文を「サーバー（`apps/sync`）と共有フロント（`apps/web`）の双方が使う」に書き換えた |
| `tdd-mob-pro-timer/README.md` | 「特徴」節に `**ソロモード**: サーバー・通信なしで完全ローカルに完結` という現在の製品機能としての記載、および `apps/web` の役割説明に「ソロモード」が残存。いずれも現在の製品を紹介する README であり、事実として偽 | **修正した**。「ソロモード」の特徴箇条書きを削除し、`apps/web` の役割説明から「ソロモード」を除去 |
| リポジトリルート `README.md`（`/workspaces/claym/local/Tasuki-wt/i33/README.md`） | 「ソロ」の出現なし | 対応不要 |
| `docs/BACKLOG.md` | 「ソロ」の出現なし | 対応不要 |
| `docs/plans/adr-alignment-post-refactor/{spec,plan,tasks}.md` | 「ソロ」の出現あり。ただし本タスク自身の設計文書であり、経緯を記述する内容（ADR-0001 と同様の性質） | 対応不要（本タスクの正本であり、変更すると T009〜T012 の前提が崩れる） |
| `docs/plans/host-spof-relaxation/{spec,plan,tasks}.md` | 「ソロモードの挙動を壊してはならない」「ソロモード（ローカル単独実行）は変更しない」等、Issue #22 当時のスコープ外条件としての記述 | **修正しなかった**。当時の計画・要件の記録であり、ADR 本体同様「過去の判断の記録」に該当すると判断。判断に迷う要素があるため、修正せず本報告で明示する |
| `docs/plans/tdd-mob-pro-timer/{spec,plan,tasks}.md` | 「ユーザーストーリー9 — 一人で練習（ソロモード）」等、当時実装されていた機能の要件・設計記録 | **修正しなかった**。プロダクト初期の設計正本であり、ソロモードが実在した時点の要件記録。ADR 同様「決定当時の思考の記録」を書き換えるべきでないという本タスクの原則に倣った。判断に迷う要素があるため、修正せず本報告で明示する |
| `docs/plans/tdd-mob-pro-timer-v2-experience/{plan,tasks}.md` | 「ソロモードは同じ decide/evolve をローカルで回す」「solo/local-engine.ts」等、v2 計画時点でソロモードが存在した前提の設計記述 | **修正しなかった**。同上（当時の設計判断の記録）。判断に迷う要素があるため、修正せず本報告で明示する |
| `docs/plans/archive/` `docs/superpowers/` | 対象外（ユーザー指示により触らない） | 調査対象から除外 |

**判断基準の適用**: 「現在のシステムの状態・機能を説明するドキュメント」（`ARCHITECTURE.md` の
現行構成図、製品 `README.md` の「特徴」節）は、ADR-0009 のステータス行や ADR-0002 の利点と同種の
「単に事実として偽になっている記述」であるため修正した。一方、`docs/plans/` 配下の
各 Issue の spec/plan/tasks は、その Issue が扱っていた時点の要件・設計の記録であり、
ADR-0001 と同種の「過去の判断の記録」に該当すると判断し、書き換えていない。
この区別が本タスクの FR-147 の精神（事実修正と経緯保存の区別）に沿うと判断したが、
`docs/plans/` 配下の扱いは仕様書に明記されていない拡張判断であるため、懸念点として報告する。

## 追加作業2: この検証記録自体について

本ファイル (`verification.md`) は `docs/plans/` 配下の新規ドキュメントであり、
`plan.md` が定めた「新規スクリプトファイルは作らない」という制約には抵触しない
（実行可能なコードではなく、実行済みコマンドと出力の記録）。

## 追加作業3: PR #38 敵対的レビュー指摘への対応（2026-07-31 再検証）

Issue #33 の PR #38 に対する敵対的レビューで3件の指摘（振り分け基準の未明文化・追記セクションの
冗長・ADR-0009 の「148 ファイル」の根拠不明）を受け、`spec.md`・`plan.md`・
`0001-monorepo-shared-core.md`・`0009-test-conventions.md` を修正した。以下は修正後の再検証。

### T013 — ADR-0001 の既存本文（1〜28行）が引き続き無変更であること（FR-143, SC-050 再確認）

実行コマンド:

```bash
python3 -c "
import subprocess
old = subprocess.run(['git','show','main:tdd-mob-pro-timer/docs/adr/0001-monorepo-shared-core.md'],
                      capture_output=True, text=True).stdout.splitlines()
new = open('tdd-mob-pro-timer/docs/adr/0001-monorepo-shared-core.md').read().splitlines()
print('main の 1-28 行と現在の 1-28 行が一致:', old[:28] == new[:28])
"
git diff main --stat -- tdd-mob-pro-timer/docs/adr/0001-monorepo-shared-core.md
```

**実測出力**:

```
main の 1-28 行と現在の 1-28 行が一致: True
 .../docs/adr/0001-monorepo-shared-core.md | 39 ++++++++++++++++++++++
 1 file changed, 39 insertions(+)
```

**判定**: Green。`main` 基準で **削除行数 0**（`39 insertions(+), 0 deletions(-)`）。
追記セクションの再構成（指摘1・2への対応）は既存本文を1文字も変更せず、末尾への追記のみで
行われている。

### T014 — 追記セクション内の相対リンク（spec.md への参照）が解決可能であること（SC-051 再確認）

実行コマンド:

```bash
cd tdd-mob-pro-timer/docs/adr
grep -oE '\]\(\.\./[^)]+\)|\]\(\./[^)]+\)' *.md | sed -E 's/^[^:]+:\]\(//; s/\)$//' | sort -u | while read -r f; do
  resolved=$(realpath -m "$f")
  test -f "$resolved" || echo "BROKEN LINK: $f -> $resolved"
done
```

**実測出力**: なし（0 行、`BROKEN LINK` 無し）。今回追加した
`../../../docs/plans/adr-alignment-post-refactor/spec.md` へのリンクを含め、
`tdd-mob-pro-timer/docs/adr/` 配下の全リンクが解決可能である。

### T015 — 指摘3: ADR-0009 の「148 ファイル」の根拠調査

**調査結果**:

- ADR-0009 本文の「移行状況の記録（FR-122）」パラグラフ（L63〜68）は「`test/support/` を除く
  実在 138 ファイル」＋「`test/support/` のヘルパ自身のテスト 5 ファイル」＝ **143** までしか
  明言しておらず、この段落だけを読むと「148」との差（5件）が本文から追えなかった
  （指摘3の内容と一致することを確認）。
- しかし同ファイル末尾の「G5・G6 で新設したテスト」節（L442〜459）に
  「実在 148 ファイルすべてが本 ADR に記録された。内訳: G3 のバッチ対象 138 ＋ 共有ヘルパ自身の
  テスト 5 ＋ G5/G6 の新設 5」という明示的な内訳が既に存在しており、148 の根拠自体は
  本文の別の箇所（末尾）に記載済みだった。
- 独立した根拠として `docs/plans/codebase-refactoring/baseline.md` L1013・L1019・L1056 に、
  同じ内訳（「対象テストファイル 148（G3 で 138 ファイルを全件書き換え）」「実在 148 ファイル
  すべてが記録された」）が ADR-0009 と別の場所で記録されている。

  ```bash
  grep -n "148" docs/plans/codebase-refactoring/baseline.md
  # 1013:テストの名前・構造・関心を 148 ファイル全件にわたって書き換え、
  # 1019:**実在 148 ファイルすべてが記録された**（機械的に突き合わせて過不足ゼロを確認）。
  # 1056:| 対象テストファイル | 148（G3 で 138 ファイルを全件書き換え） |
  ```

- 参考として、現在の実ファイル数を機械的に数えたところ、`test/support/` を除いて 149 件
  （`test/support/` 込みで 154 件）だった。ADR-0009 は G3〜G6 完了時点のスナップショット
  記録であり、その後に追加された可能性のあるテストファイルを継続的に追跡するものではない
  ため、この差分自体は 148 が誤りであることの根拠にはならないと判断した
  （ADR は「その時点の記録」であり、コードの現況を常に反映するライブ文書ではないため）。

  ```bash
  find packages/core/test apps/sync/test apps/web/test \
    \( -name '*.test.ts' -o -name '*.test.tsx' \) -not -path '*/support/*' | wc -l   # 149
  find packages/core/test apps/sync/test apps/web/test \
    -path '*/test/support/*' \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l   # 5
  ```

**判断**: 148 は **正しい**（本文末尾の内訳、および `baseline.md` という独立文書の双方で
138 + 5 + 5 = 148 の内訳が確認できた）。誤りではないため README.md 側の修正は不要
（README.md も既に「148 ファイル全件」であり、本体・インデックス間に矛盾は無い）。
対応として、本文中の「移行状況の記録（FR-122）」パラグラフに、143 から 148 への差分
（G5/G6 の新設 5 ファイル）を1文で補足し、末尾の内訳まで読まなくても数え方が追えるようにした
（`0009-test-conventions.md` L69〜71）。

### 再検証まとめ

| # | 検証項目 | 判定 |
|---|---|---|
| T013 | ADR-0001 既存本文（1〜28行）の削除行数が 0 | Green（0 deletions） |
| T014 | 追記セクション内の相対リンクが解決可能 | Green（BROKEN LINK 0件） |
| T015 | ADR-0009「148 ファイル全件」の根拠確認 | 148 は正しいと確認。本文に内訳を補足（README.md は変更不要） |
