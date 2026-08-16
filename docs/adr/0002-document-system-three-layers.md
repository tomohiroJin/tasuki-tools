# ADR-0002: 文書体系の三層構造

- **ステータス**: Accepted（2026-08-09）
- **関連**: [#68](https://github.com/tomohiroJin/tasuki-tools/issues/68)（規範とアーキテクチャの確立、
  親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）/
  [#78](https://github.com/tomohiroJin/tasuki-tools/issues/78)（ADR 0001、横断 ADR の先行新設）/
  `docs/adr/README.md`（採番規約の申し送り元）/
  `docs/timer/adr/0010-design-doc-source.md`（本 ADR が置換する宣言）

## 背景

Tasuki には判断の拠りどころが揃っていない。ADR は timer の 10 件
（`docs/timer/adr/0001`〜`0010`）と横断の 1 件（`docs/adr/0001`、#78 で先行新設）に
分かれており、どちらを見ればよいかは `docs/adr/README.md` の申し送りでしか分からない。
同ファイルは #78 の時点で自ら次のように申し送っている。

> ADR のテンプレートと採番規約の統一は #68 の宿題です。

規範文書 `docs/constitution.md` にも、現状と矛盾する条項が残っている。
`constitution.md:97` には「既存の timer（`packages/timer-core` / `apps/timer-*`）には
手を入れない（MUST NOT）」という条項が実在するが、これは #78 で timer 側のデザインを
作り直した現状と矛盾する。

設計文書（spec / plan）の置き場も、宣言と実態が乖離している。timer ADR 0010
（`docs/timer/adr/0010-design-doc-source.md`）は「正本は `docs/plans/`、
`docs/superpowers/` は移行前の履歴アーカイブ」と宣言し、`docs/superpowers/` 側は
「以降更新されていない」と述べている。しかし #73 の E2E 設計
（`docs/superpowers/specs/2026-08-07-e2e-foundation-design.md`、main に収録済み）や、
本 Issue #68 自身のスペック（`docs/superpowers/specs/2026-08-09-governance-and-docs-design.md`、
PR #99）も `docs/superpowers/specs/` に新規作成しており、この前提はもう事実でない。
`docs/superpowers/` への新規作成は現に続いている。

`docs/` 全体も `plans/` `superpowers/` `adr/` `experiments/` 等が混在し、どれが
現行の正本か文書構造だけからは読み取れない状態にある。

## 決定

### 1. 三層構造を採る

文書を変更頻度で 3 つの層に分ける。

| 層 | 役割 | 変更の重さ |
|---|---|---|
| **憲法**（`docs/constitution.md`） | 「何を守るか」の宣言。原則は各数行 | めったに変えない。改版は ADR を伴う |
| **ADR**（`docs/adr/` ほか） | 「なぜそう決めたか」の不変の記録 | 追記のみ。覆すときは Superseded |
| **ガイド**（`docs/guides/`） | 「今日どう書くか」の手引き | 育ち続ける。ADR の改版なしに更新してよい |

### 2. 書き分けの規則

- **決定の中身と根拠は ADR に書く。手順・例・チェックリストはガイドに書く。**
- 両方に跨る内容は、片方に書き、もう片方からは参照する。**二重正本を作らない。**
- ガイドの中身（例: DoD の項目）は ADR の改版なしに育ててよい。**「DoD を運用する」という
  決定自体**を覆すときだけ ADR を書く。DoD の項目の追加・削除自体はガイドの更新のみで行う。

### 3. 採番規約

- 横断的な判断は `docs/adr/` に置き、`0001` からの連番で採番する。
- アプリ固有の判断は `docs/<app>/adr/`（例: `docs/timer/adr/`）に置き、置き場ごとに
  独立して採番する。
- 参照するときは必ず置き場つきで書く（例: `docs/adr/0005`）。置き場を省いた
  「ADR 5」のような参照は行わない。

これは `docs/adr/README.md` が #78 の時点ですでに実践していた規約の追認である。
同ファイルの「ADR のテンプレートと採番規約の統一は #68 の宿題」という申し送りを、
本 ADR とテンプレート（`docs/adr/template.md`）の追加で解消する。

### 4. 設計文書（spec / plan）の置き場

新規の機能設計文書（spec / plan）は `docs/superpowers/` に日付つきのファイル名
（例: `2026-08-09-<topic>.md`）で置く。これは現行のスキル運用（`superpowers:*`）の
出力先を追認するものであり、新しい規則を課すものではない。

`docs/plans/`（`spec-plan-tasks` スキルによる SDD: Specification-Driven Development の
成果物一式）は、今後は SDD 期の記録として扱う。新規の設計文書をここへ追加することは
規定しない。

**本 ADR は timer ADR 0010（`docs/timer/adr/0010-design-doc-source.md`）の
全体向け宣言を置換する。** 0010 は「正本は `docs/plans/`」と全体に向けて宣言していたが、
これは横断 ADR の置き場がまだ無かった時期に、アプリ固有の置き場（`docs/timer/adr/`）で
書かれた宣言であり、背景で述べたとおり現行運用（`docs/superpowers/` への新規作成が
続いている実態）と乖離していた。横断 ADR の置き場ができた今、本 0002 がその宣言の
後継となる。**0010 の本文は削除しない。**先頭に本 ADR への昇格注記を足すのみとする
（注記の追加は本 ADR の後続タスクで行う）。

### 5. 憲法改版時のチェック項目

憲法（`docs/constitution.md`）を改版する際のチェック項目に、
**AGENTS.md の憲法見出しの同期確認**を含めることを MUST とする。AGENTS.md は
憲法の見出しのみを転記した薄い複製を持つ設計であるため、憲法側の見出しが変わった
ときにドリフトしないよう、改版のたびに両者を突き合わせる。

## 影響

- 既存の `docs/plans/` `docs/superpowers/` `docs/poker/` `docs/timer/experiments/` は
  **移動しない**（物理的な整理は #71 の領分）。本 ADR は位置づけの宣言に留める。
- アプリケーションコード（`apps/` `packages/` `e2e/` `scripts/`）への変更は無い。
- timer ADR 0010 は本 ADR（0002）へ置換されるが、本文に昇格注記を足す作業自体は
  #68 の後続タスクで行う。timer ADR 0006・0009 も同様に横断 ADR（0005・0006、
  #68 の後続タスクで新設）へ昇格する予定だが、その内容・注記の追加は本 ADR の対象外。
- `docs/README.md`（文書地図）は、本 ADR が定めた三層構造と置き場の宣言を踏まえて
  新設する（#68 の別タスク）。

## この ADR で決めないこと

- ADR 0003〜0007 の内容そのもの（アジャイル運用の形式化・同期サーバーのポート/アダプタ
  構成・境界の型安全・テスト規約・抽象の導入基準）→ #68 の後続タスク（PR-3）
- 憲法本体の書き直し → #68 の後続タスク（PR-2）
- `docs/plans/` `docs/superpowers/` の物理的な整理・統合 → #71
