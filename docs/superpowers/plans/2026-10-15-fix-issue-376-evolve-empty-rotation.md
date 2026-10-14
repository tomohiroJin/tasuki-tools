# #376 evolve が輪を空にする MemberRemoved で currentIndex を NaN にする — 実装計画

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 1 人の輪に `MemberRemoved` を直接渡すテストで `NaN` の赤を見てから直す |
| II. 技術選定は ADR を通す | 該当なし | 新しい依存を足さない（性質のテストは timer-core が既に持つ `fast-check` を使う） |
| III. 揮発インメモリと単純運用 | 該当なし | 状態の持ち方に触れない |
| IV. 境界の型安全 | 該当なし | wire・コマンドの境界に触れない |
| V. 実画面検証 | 該当なし | `decide` が最後の 1 人の `member.remove` を拒み、`participant.remove` は繰り上げてから外すので、利用者の経路から輪が空になる `MemberRemoved` は届かない。経路の振る舞いは変わらない |
| VI. 依存は内向き | 該当なし | パッケージ間の依存を足さない |
| VII. 検査は壊して確かめる | 通過 | 直した分岐を外す変異 m220 を足し、新しいテストが殺すことを確かめる |
| VIII. 記録が正本 | 通過 | 不変条件を `SessionState.currentIndex` の docstring に書き、`NaN` を前提にした散文（`decide.ts`・`participant-remove.ts`・`docs/timer/ARCHITECTURE.md`）を直す |
| IX. 小さく回す | 通過 | PR 1 本。配布は伴わない |
| X. 抽象は実需で | 通過 | 新しい抽象を作らない |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密・個人情報を扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 前提の実測（2026-10-15）

- 1 人の輪（`anAggregate().withRotation("A")`）に `{ type: "MemberRemoved", index: 0 }` を `evolve` へ直接渡すと、
  `currentIndex` は `NaN`、`rotation.length` は 0 になる（本文どおり）
- 性質のテストの道具は既にある（`packages/timer-core` の devDependencies に `fast-check`）。決定的な擬似乱数を自作する必要はない
- #364 は `test/properties.test.ts` の「全てのコマンドを混ぜた列での不変条件（#364）」で、`decide` を通る列では輪が空にならないことを固定している。
  ただし同ファイルの `invariantViolations` の I2 は**輪が空のときを見ていない**（`rotation.length > 0` のときだけ判定する）
- 空の輪を前にした他のイベントは既に `NaN` を作らない（`nextEligibleIndex` は長さ 0 で 0 を返す・`MembersShuffled` は現ドライバーが居なければ 0・`SessionReset` は 0 から組む・`MemberAdded` は添字を動かさない）

## 決めること

**輪が空になる `MemberRemoved` で何を返すか → 集約を返し、`currentIndex = 0` にする。**

- `evolve` は全域関数（冒頭の注釈）で、`Result` を返さない。イベントを捨てる（集約をそのまま返す）と、
  イベントの再生で「外れたはずの席が残る」状態になり、イベントと集約が食い違う
- 「輪が空なら 0」は `nextEligibleIndex`（`aggregate.ts`）の `len === 0` の扱いと同じで、Issue の EARS の 1 行目の不変条件とも一致する
- `decide` の `BelowMinMembers` は残す（最後の 1 人が外れられないのは製品の決まり。evolve の破綻を防ぐためだけのガードではなくなる）

## タスク

1. 赤: `test/evolve.test.ts` に「1 人の輪から外すと `currentIndex` が 0・輪と担当回数が空」を足し、`NaN` で落ちるのを見る
2. 赤: `test/properties.test.ts` の `invariantViolations` の I2 を EARS の不変条件（空なら 0、それ以外は `0 ≤ i < len` の整数）に揃え、
   `evolve` へ**前提を満たしたイベントの任意の列**を直接流す性質を足す（輪が空になる `MemberRemoved` を含める）
3. 緑: `evolveMemberRemoved` で輪が空になるなら `currentIndex` を 0 にする
4. 散文を直す: `SessionState.currentIndex` の docstring に不変条件、`decide.ts`・`participant-remove.ts`（2 か所）・`apps/tasuki-sync/test/solo-leave.test.ts`・`docs/timer/ARCHITECTURE.md` の「evolve が破綻する／NaN に落ちる」。日付つきの設計正本・過去の計画は当時の記録なので直さない
5. 変異 m220（直した分岐を外す）を足し、`--id 220` で殺されることを見る（性質のテスト単独でも殺すことを手で確かめる）

## 検証の実行時間の見積もり

| 検証 | 見積もり |
|---|---|
| `pnpm --filter @tasuki/timer-core test`（型検査・lint を含めて） | 1 分 |
| `pnpm --filter @tasuki/sync test`（散文を直したファイルのパッケージ） | 2 分 |
| `pnpm test`（全体・ターボのキャッシュ可） | 5 分 |
| `node scripts/mutation-check.mjs --changed`（変異を足す前のコミットで。timer-core の変異だけが選ばれる） | 5 分 |
| `node scripts/mutation-check.mjs --id 220` | 1 分 |
| scripts の自己テスト | 2 分 |

変異を足すと `mutation-check.mjs` が差分に入り `--changed` が全件に倒れる（`docs/guides/development.md`）。
そのため `--changed` は変異を足す前のコミットで流し、足した変異は `--id 220` で単独に流す。
