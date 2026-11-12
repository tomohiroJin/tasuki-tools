# アーキテクチャと設計原則の観点で直す前に測る（#587）— 調査の記録

> マージ後の節は書き換えない。後から分かったことは末尾の補遺の節に書き、置き換えた古い節の末尾に改定の印を足す（`docs/guides/design-doc-revision.md`）。

- **Issue**: [#587](https://github.com/tomohiroJin/tasuki-tools/issues/587)（親 [#482](https://github.com/tomohiroJin/tasuki-tools/issues/482)）
- **日付**: 2026-11-13
- **計画**: [`../plans/2026-11-13-architecture-review-survey.md`](../plans/2026-11-13-architecture-review-survey.md)

**実測時点**: main `df9b4f5e`（2026-11-13）

**前提となる規範**: [`docs/constitution.md`](../../constitution.md) 原則 IV（境界の型安全）/ VI（依存は内向き）/ X（抽象は実需で）

**前提となる ADR**: [`docs/adr/0004`](../../adr/0004-ports-and-adapters.md)（ポートとアダプタ）/ [`docs/adr/0005`](../../adr/0005-result-and-boundary-validation.md)（Result と境界の検証）/ [`docs/adr/0007`](../../adr/0007-abstraction-criteria.md)（抽象の導入基準）/ [`docs/adr/0013`](../../adr/0013-pr-granularity.md)（PR の粒度）/ [`docs/adr/0016`](../../adr/0016-core-domain-representation.md)（core ドメインの表現）/ [`docs/adr/0017`](../../adr/0017-bounded-contexts-and-packages.md)（境界づけられた文脈とパッケージ）/ [`docs/adr/0030`](../../adr/0030-ai-driven-development-operations.md) 決定 4（測れなかったものは理由を書く）

**物差し**: 新しい原則を持ち込まず、上の決まりと [`docs/guides/architecture.md`](../../guides/architecture.md) の対応表に照らして測る。一般の原則と決まりが食い違う箇所は節 8「決まりを変える候補」に書き、直す候補には入れない（原則 II）。

**利用者の目標（効果の物差し）**: 次の開発が楽になるか。4 つに分ける —— **読みやすい**（構造とテストが読める）・**足すのが速い**（新しい道具・やり方・デッキを足すとき触る場所が少ない）・**続けられる**（持続的に開発できる）・**バグが減る**。

**この文書の位置づけ**: #587 の測定結果の正本。Issue・PR へ表を転記せず、ここを参照する。
**この調査ではコード・テスト・検査・依存を直していない・足していない。** 測るためのスクリプトは、測り直せるように
[`2026-11-13-architecture-review-survey/`](./2026-11-13-architecture-review-survey/README.md) に残した（検査ではない。CI にもつながない）。

## 0. まとめ

（Task E で書く）

## 1. アーキテクチャ・依存の向き・開放閉鎖（A）

（Task A の report-a.md から畳む）

## 2. 拡張の試算の基準値（A）

（Task A の report-a.md から畳む）

## 3. 同じ知識の写し（B）

（Task B の report-b.md から畳む）

## 4. 契約と副作用（C）

（Task C の report-c.md から畳む）

## 5. 大きさ・命名・死んだコード・テストの形（D）

（Task D の report-d.md から畳む）

## 6. 一覧（効果 × 直す量）

（Task E で書く）

## 7. 次の子 ISSUE の切り方の提案

（Task E で書く）

## 8. 決まりを変える候補

（Task E で書く）

## 9. 監査の候補

（Task E で書く）

## 10. 測れなかったもの

（Task E で書く）
