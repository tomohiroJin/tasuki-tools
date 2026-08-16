# ADR-0006: テスト規約（検査は壊して確かめる）

- **ステータス**: Accepted（2026-08-10）
- **関連**: [#68](https://github.com/tomohiroJin/tasuki-tools/issues/68)（規範とアーキテクチャの確立、
  親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）/
  `docs/timer/adr/0009`（本 ADR の昇格元）/
  `.specify/memory/constitution.md` 原則 I（テスト駆動開発）・原則 VII（検査は壊して確かめる）/
  `scripts/audit-structure.mjs`（SC032 の機械検査）/
  [PR #62](https://github.com/tomohiroJin/tasuki-tools/pull/62)・
  [PR #64](https://github.com/tomohiroJin/tasuki-tools/pull/64)（恒真化を実際に踏んだ実績）

## 背景

`docs/timer/adr/0009` は timer 側で、148 テストファイルを対象に名前・構造・関心の
規約（G3）を定め、移行を完了させた。この規約のうち「仕様 ID を名前に含めない」
「前提の失敗はビルダーが throw する」といった移行の細目は timer 固有の作業記録
であり、全体へそのまま持ち出す性質のものではない。一方で、その規約を支える
**4 つの実践**は、timer に限らずプロジェクト全体でテストの信頼性を保つための
決定として独立に成立し、実際に運用実績も積み上がっている。

- **TDD（テスト先行）**は憲法原則 I としてすでに継承済みの決定であり、本 ADR は
  それと矛盾しない形でテスト規約全体の前提として位置づける。
- **Given/When/Then 構造**は timer で `// Given` `// When` `// Then` の区切りを
  付ける規約として運用され、`scripts/audit-structure.mjs`（SC032）が機械的に
  検査している。2026-08-10 時点で実行すると **1023/1051（97.3%）**。
  ただし**本 ADR 採択時点（2026-08-10）**の SC032 は `packages/timer-core` /
  `apps/timer-sync` / `apps/timer-web` の 3 パッケージのみを走査対象としており
  （同スクリプトの `runAudit()` を確認）、poker 系（`packages/poker-core` /
  `apps/poker-sync`）や `packages/protocol` はまだ対象外だった。
  **追記（2026-08-16）**: この状態は #135 / [ADR-0014](./0014-scan-target-integrity.md)
  で解消済み。現在の SC032 は宣言と理由つき除外で全パッケージを覆う。
- **新しい検査はわざと壊して赤を見る**は、timer の G5・G6 の新設テストで
  実践されてきた（例: `apps/timer-sync/test/error-code-coverage.test.ts` はソース走査の
  メタテスト）。
- **実装を書き換えたら変異で恒真化を確かめる**は、timer 由来の実践だが、
  実際に効果を示したのは poker 側の 2 件である。[PR #62](https://github.com/tomohiroJin/tasuki-tools/pull/62)
  （WS アダプタの `Bun.serve` 書き直し）では、`close()` の「2 秒以内に解決する」
  テストが実装の性質変化により**恒真の空検証**に化けていたことが敵対的レビューで
  見つかった。[PR #64](https://github.com/tomohiroJin/tasuki-tools/pull/64)
  （poker-sync への接続・フレーム層防御の追加）では、9 種の変異すべてを赤にする
  ところまでは確認したが、**設定値の境界**（`HEARTBEAT_MAX_MISSES=0`）は
  変異検査の枠外で見つかった実バグであり、「変異検査は実装がテストに気づかれるかしか
  見ず、文書化した意図との食い違いは検出できない」という教訓を残した。
  2 件とも、書き換え後に既存テストが守っているつもりの機構を直接検証できているかを
  変異で確かめる運用が必要であることを裏づけている。

これら 4 つを、timer の移行記録から切り離し、全体の運用規約として昇格する。

## 決定

**次の 4 点をプロジェクト全体のテスト規約とする。**

1. **TDD（テスト先行）**: Red-Green-Refactor サイクルに従う（MUST、憲法原則 I）。
   テストより先に実装コードを書かない。
2. **Given/When/Then 構造**: テスト本体を `// Given` `// When` `// Then` で
   区切る。本体が 2 行以下の自明なテストは対象外とする。この規約の遵守は
   `scripts/audit-structure.mjs`（SC032）で機械的に検査する。**本 ADR 採択時点で
   SC032 が走査するのは timer 3 パッケージのみであり、poker 系・`packages/protocol` へ
   走査対象を広げるかどうかは本 ADR では決めないとした**（別タスクの領分とする）。
   **追記（2026-08-16）**: この保留は #135 / [ADR-0014](./0014-scan-target-integrity.md)
   で決着した。現在の SC032 の走査対象は 10 パッケージ（src 9 / test 10）。
3. **新しい検査はわざと壊して赤を見る（MUST）**: 検査を追加したら、検査対象を
   意図的に壊し、その検査が赤くなることを確認してからコミットする。
4. **実装を書き換えたら変異で恒真化を確かめる（MUST）**: 既存の実装を書き換えた
   ときは、その挙動を守っているつもりの既存テストに変異（該当行の削除・反転・
   閾値の変更など）を当て、テストが赤くなることを確認する。閾値・回数を守る
   テストは、厳しくする方向・緩める方向の**両方**の変異を当てる。

**timer 固有の詳細**（148 ファイルの移行記録、`@requirements` JSDoc の書式、
FR-091〜099・FR-121〜123・SC-029〜032 という要求 ID との対応、
`permissions-differential.test.ts` 等の例外表）は、本 ADR では扱わない。
それらは引き続き `docs/timer/adr/0009` が正本として持つ。

## 影響

- 本決定は `.specify/memory/constitution.md` 原則 VII「検査は壊して確かめる」の
  根拠を記録するものである（TDD 自体の根拠は原則 I が既に持つ）。
- 4 実践のうち 1・3・4 は既にプロジェクト全体で運用されている実践の追認であり、
  新たな作業は発生しない。2（GWT 構造）は本 ADR 採択時点では timer 側でのみ SC032 で
  機械検査済みで、poker 側・`packages/protocol` には同種の機械検査がまだ無かった。
  追加は本 ADR の対象外とし、必要になった時点で別 Issue として扱うとした
  **（追記・2026-08-16: #135 / [ADR-0014](./0014-scan-target-integrity.md) が対象を
  10 パッケージへ広げ、この保留を解消した）**。
- **本 ADR の時点ではコード（`apps/` `packages/` `e2e/` `scripts/`）を
  変更しない。** `scripts/audit-structure.mjs` は読み取り実行のみで確認しており、
  改変していない。
