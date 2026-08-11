# ADR-0008: 依存の供給網対策

- **ステータス**: Accepted（2026-08-11）
- **関連**: [Issue #69](https://github.com/tomohiroJin/tasuki-tools/issues/69) / [スペック](../superpowers/specs/2026-08-10-dependency-supply-chain-design.md)

## 背景

npm パッケージの乗っ取り・改ざんによる供給網攻撃が続いている。公開直後の版を
即座に取り込まないことが有効な緩和策であり、それを人の注意力ではなく仕組みとして
入れる必要がある。

Issue #69 の本文は着手前の実測で事実誤認が 5 点見つかった（脆弱性件数・陳腐化件数・
`minimumReleaseAge` の置き場・`allowBuilds` のキー名・`docs/BACKLOG.md` の存在）。
実測の詳細と待機期間ごとの導入コスト（違反件数）はスペックの「実測で確認した前提」節を
数値の正本とし、本 ADR では転記しない。

## 決定

- **MUST**: 公開から 7 日未満（`minimumReleaseAge: 10080`）の版を `pnpm install` で
  取り込まない
- **MUST**: 設定の置き場は `pnpm-workspace.yaml` の 1 箇所のみとする。`.npmrc` には
  書かない（実測で無視されることを確認済み）
- **MUST NOT**: CI で `pnpm install --trust-lockfile` を使わない。lockfile は
  公開リポジトリで bot が更新を提案する対象であり、「信頼済み」の前提が成立しないため
- **MUST**: 緊急時の例外は `minimumReleaseAgeExclude` に対象パッケージだけを
  期限つきコメントで追記し、解消後に削除する。範囲を全体に広げる手段（環境変数での
  一時無効化・値の一時的な引き下げ等）は使わない
- **MUST**: インストール時のビルドスクリプト許可（`allowBuilds`）は現状維持とする。
  pnpm 10 系以降デフォルトでブロックされ、`esbuild: true` のみが既に許可されている。
  新たな許可制導入の決定は不要
- **MUST**: 仕組み（待機期間の強制）を脆弱性の解消より先に導入する。high の脆弱性
  （`nanoid`）は `postcss` 経由のビルド時依存で利用者へ配布されず、配布される
  `dompurify` は moderate であるため、「high を最優先で潰す」状況ではない

## 影響

- 導入時点（2026-08-11）で `postcss-selector-parser@7.1.5`
  （2026-08-07T09:32:20Z 公開）が待機期間 7 日未満で 1 件違反した。この版は
  2026-08-14T09:32Z に 7 日を超えるため、`minimumReleaseAgeExclude` へ期限つきで
  一時登録し、解除を #69 PR-2 の完了条件へ持ち越した
- `allowBuilds` の棚卸し結果: `pnpm install --frozen-lockfile` の出力に
  ビルドスクリプト抑制のログは無く、現行の許可リスト（`esbuild` の 1 件のみ）以外に
  ブロックされているビルドスクリプトは無かった。変更は不要
- 将来、待機期間を 14 日・30 日へ引き上げる余地は残る。7 日で運用し、lockfile が
  一巡すれば違反件数は自然に減る。引き上げの判断は別 Issue とする
