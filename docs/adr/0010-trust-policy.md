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
- 本設定が静かに効かなくなる経路が 3 つある。**除外リストに 2 つ**（版指定の退化・
  依存木から消えた版の除外行が残る）、**キーと値そのものに 1 つ**（`trustPolicy` の値や
  `pnpm-workspace.yaml` のキー名を誤ると、`no-downgrade` との完全一致判定のみで
  不正値の検証が無いため、無警告で検査が消える）。機械的な検査は
  [Issue #135](https://github.com/tomohiroJin/tasuki-tools/issues/135) で扱う
- ADR-0008 の決定はいずれも覆らない。本 ADR は 0008 を置換せず、併存する

## 追記（2026-09-03・#154）

### 静かに効かなくなる 3 経路に機械検査が付いた

上の「影響」が「機械的な検査は Issue #135 で扱う」と書いた 3 経路は、#135 の範囲から
外れて [#154](https://github.com/tomohiroJin/tasuki-tools/issues/154) へ切り出され、
そこで塞いだ。**この追記は決定を変えない。** 検査の追加であり、`trustPolicy` の運用も
除外の書き方も従来どおりである。

- **MUST**: `trustPolicyExclude` の各エントリは版を持つ（`名前@版`）。名前だけの形は
  以後そのパッケージの**全版**を無検査にする。pnpm はこれを「より広い除外」として
  正常に受け取り、警告も出さない
- **MUST NOT**: `trustPolicyIgnoreAfter` を置かない。公開からの経過時間で降格判定を
  無効化する鍵であり、本 ADR の決定を時間で空文化する。検査はこれを「未知のキー」とは
  別の理由として名指しで落とす
- **MUST**: 除外した版が依存木から消えたら行を消す。残すと、その版が別の依存元経由で
  再び現れたときに黙って免除を与える

検査は `scripts/audit-supply-chain-config.mjs`。**判定の権威は pnpm 自身**に置き、
`pnpm-workspace.yaml` を手で解析しない（`docs/adr/0014` D2）。設定のキーと値は
`pnpm config list --json` を 2 か所（リポジトリ直下と、同じ `packageManager` を書いた
素のディレクトリ）で走らせた差分から、除外が指す版の実在は `pnpm why` から取る。

### 版の妥当性は pnpm に任せる

`"semver@6.3"` のように版が不完全な形は、pnpm 自身が
`ERR_PNPM_INVALID_TRUST_POLICY_EXCLUDE` で落とす（実測）。**黙って通るのは版を
まったく持たない形だけ**なので、検査はそこだけを見る。版の妥当性を自前で判定すると
semver の解釈を自作再実装することになり、偽陽性の面が増える。

実測値と機序の正本は
[設計正本](../superpowers/specs/2026-09-03-supply-chain-config-integrity-design.md) とする。
