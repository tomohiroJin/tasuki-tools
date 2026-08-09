# ADR-0003: アジャイル運用の形式化

- **ステータス**: Accepted（2026-08-10）
- **関連**: [#68](https://github.com/tomohiroJin/tasuki-tools/issues/68)（規範とアーキテクチャの確立、
  親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）/
  `docs/adr/0002`（書き分けの規則: 決定は ADR、手順・項目はガイド）/
  `docs/guides/definition-of-done.md`（DoD 項目の正本、後続タスクで新設）/
  `docs/guides/ears-writing.md`（EARS 記法の書き方、後続タスクで新設）/
  `docs/retrospectives/`（振り返りの記録先、後続タスクで新設）

## 背景

Tasuki はソロ + AI エージェントの体制で開発している。チーム開発を前提にした
アジャイルの儀式（スプリント計画・デイリー・レトロスペクティブの定例会）を
そのまま持ち込む相手がいない一方、運用が緩みすぎると次の 3 つの問題が実際に
起きている。

1. **バックログの二重管理。** `docs/BACKLOG.md` は 2026-06 時点の台帳で、
   完了・保留・TODO の項目が GitHub Issues とは別に手で維持されている。
   しかも同ファイルにはタスクの記録だけでなく「公開範囲の方針」「デプロイ運用メモ」
   という生きた方針文書が同居しており、正本がどちらか読み取れない。
2. **完了の基準が揃っていない。** 「テストが緑」「typecheck が通った」だけで
   完了と報告し、実画面での確認や文書への反映が漏れる、という失敗を過去に
   繰り返している（原則 V「実画面検証」が既に対処しているのは実行時の話で、
   PR をマージしてよい基準そのものは明文化されていない）。
3. **振り返りが揮発する。** epic や大きめの Issue を終えたときの教訓は、
   AI エージェントのセッション記憶にしか残らない。セッションが切り替われば
   その教訓は失われ、同じ罠を踏み直すことになる。

## 決定

ソロ + AI という体制に合わせて、アジャイル運用の形式だけを次のとおり定める。
**期間で区切るイベント（スプリント）は設けない。** 変更の単位は Issue と PR
であり、暦日での計画・締め切りは持ち込まない。

1. **Definition of Done（DoD）をすべての Issue / PR に適用する（MUST）。**
   DoD を満たすまでマージしない。DoD の項目そのものは本 ADR では定めない。
   項目の正本は `docs/guides/definition-of-done.md` に置き、ADR の改版を
   経ずに育てる（`docs/adr/0002` の書き分け規則のとおり、ここで決めるのは
   「DoD を運用する」という決定そのものであり、項目の追加・削除はガイドの
   更新のみで行う）。
2. **機能系 Issue の「振る舞い」節は EARS 記法で書く（MUST）。**
   調査・chore 系の Issue には強制しない。書き方の手引きは
   `docs/guides/ears-writing.md` に置く。
3. **バックログは GitHub Issues に一本化する（MUST）。**
   `docs/BACKLOG.md` は廃止する。同ファイルに同居していた「生きた方針文書」の
   部分は、廃止に先立って該当する場所（ADR・ガイド・Issue のいずれか）へ
   移してから消す。
4. **epic・大きめの Issue の完了時には振り返りを記録する（MUST）。**
   記録先は `docs/retrospectives/YYYY-MM-DD-<topic>.md` とする。
5. **スプリント（期間で区切る計画単位）は設けない。**
   計画・進捗の単位は Issue・PR のみとする。

## 影響

- `.github/ISSUE_TEMPLATE/` に機能系（EARS の「振る舞い」節を促す構成）と
  作業系のテンプレートを新設する（PR-4）。
- `.github/pull_request_template.md` に DoD チェックリストを転記した
  PR テンプレートを新設する（PR-4）。
- `docs/BACKLOG.md` は本 ADR が定めた一本化の方針に従い、生存項目を
  Issues へ移した上で解体する（PR-6）。
- 本 ADR の時点ではコード（`apps/` `packages/` `e2e/` `scripts/`）・
  `docs/BACKLOG.md` そのものへの変更は行わない。上記の適用作業は後続の
  PR で行う。
