# ADR-0010: trustPolicy による信頼証跡の降格拒否

- **ステータス**: Accepted（2026-08-12）
- **関連**: [Issue #116](https://github.com/tomohiroJin/tasuki-tools/issues/116) /
  [ADR-0008](./0008-dependency-supply-chain.md) /
  [スペック](../superpowers/specs/2026-08-12-trust-policy-design.md)

## 背景

ADR-0008 で `minimumReleaseAge`（公開から 7 日未満の版を拒否する待機期間）を導入した。
これは「乗っ取りが発覚するまで取り込みを遅らせる」防御であり、**7 日以内に発覚しなかった
改ざんは通す**。

pnpm 11.5.0 の `trustPolicy` は、公開日に関係なく「信頼証跡の降格」を検知する。
過去により強い証跡（staged publish / trusted publisher / provenance）を持っていた
パッケージが、証跡の弱い版・無い版を出したときに install を拒否する。盗んだトークンで
CI を経由せず publish する乗っ取りの典型を、公開から時間が経っていても弾ける。
待機期間とは直交する防御である。

判定の機序・適用コスト・保護対象の件数はスペックを数値の正本とし、本 ADR では転記しない。

## 決定

- **MUST**: `pnpm-workspace.yaml` で `trustPolicy: no-downgrade` を有効にする
- **MUST NOT**: `trustPolicyIgnoreAfter` を使わない。この設定は「公開から N 分より古い版は
  検査しない」を意味するため、`minimumReleaseAge`（7 日）以下の値にすると、install しうる
  版がほぼすべて検査対象から外れる。**検証コストを払ったまま何も判定しない状態**になる
- **MUST**: `trustPolicyExclude` は `名前@版` の形式で書く。名前だけの除外はしない
  （以後そのパッケージの全版が無検査になり、乗っ取りが起きる新しい版も素通りする）
- **MUST**: 除外には**偽陽性と判断した根拠**（どの版が先に証跡を持っていたか）をコメントで
  残す。**解除予定日は書かない**。公開日は動かないため時間では解消せず、
  `minimumReleaseAgeExclude` の期限つき例外とは性質が異なる
- **MUST**: 除外した版が依存木から消えたら、その行を削除する。残すと将来その版が
  再び現れたときに黙って免除を与える
- **MUST NOT**: 違反を見て反射的に除外へ足さない。当該版より前に公開された版の証跡を
  登録所で確認し、旧系列の保守版（偽陽性）か、証跡が消えた最新版（乗っ取りの疑い）かを
  判断してから決める。手順は [`docs/guides/development.md`](../guides/development.md)
- **MUST**: Renovate の PR が降格判定で赤くなったときも同じ判断手順を通す。`trustPolicy` に
  対応する Renovate 側の設定は無く、bot は降格を予見できない。赤は不具合ではなく信号として
  扱い、Renovate の設定で消そうとしない

## 影響

- 導入時点で降格と判定されたのは `semver@6.3.1` のみだった。6.x 系の保守版であり、
  その公開日より前に 7.x 系が provenance つきで公開されていたことによる設計上の偽陽性
  （pnpm の判定は公開日だけで行われ semver の系列を見ない）。版指定で除外した
- CI で `pnpm install` が走るジョブは lockfile の検証時間を追加で払う。#70 の絞り込みにより
  install は条件付きステップなので、**文書のみの PR では増分が無い**
- 登録所からメタデータを取得できないと、pnpm はそれを違反として扱い install を落とす
  （fail-closed）。CI が赤くなる原因が 1 つ増えることを受け入れる
- 除外リストが静かに効かなくなる経路が 2 つある（版指定の退化・依存木から消えた版の
  除外行が残る）。機械的な検査は
  [Issue #135](https://github.com/tomohiroJin/tasuki-tools/issues/135) で扱う
- ADR-0008 の決定はいずれも覆らない。本 ADR は 0008 を置換せず、併存する
