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
- **MUST**: `pnpm audit` を CI へ独立ジョブとして組み込み、深刻度 high 以上で
  ビルドを落とす。moderate 以下は出力に残すのみでビルドは落とさない。仕組み
  （待機期間）と検知（audit）を同時に入れないと、再発したことに気づけないため
- **MUST**: 自動更新 bot は Renovate を使う。`pnpm outdated -r` が20件を返す現状で
  bot が1件ずつPRを立てると溢れるため、`packageRules` によるグルーピングの
  表現力を主要因に選定した。Dependabot は追加導入なしで使えるが、まとめ方の
  表現力が劣るため却下した
- **MUST**: Renovate 側の待機期間は pnpm 側（7日）以上にする。下回らせると、
  bot が提案したPRのlockfileがpnpmの検証で常に弾かれ、bot PRが常に赤くなる
- **MUST NOT**: 自動マージしない。bot は更新の提案までを担い、取り込みは人が
  判断する。待機期間を入れておきながら、期間を過ぎたものを無検査で自動的に
  取り込むのでは防御の穴を自分で開けることになる

## 影響

- 導入時点（2026-08-11）で `postcss-selector-parser@7.1.5`
  （2026-08-07T09:32:20Z 公開）が待機期間 7 日未満で 1 件違反した。この版は
  2026-08-14T09:32Z に 7 日を超えるため、`minimumReleaseAgeExclude` へ期限つきで
  一時登録し、解除を #69 PR-2 の完了条件へ持ち越した。
  **解除は #126 で実施した（2026-08-16）。**#69・#113 はどちらも作業日が解除予定日
  より前で実行できず、宛先を独立した Issue へ移していた。除外リストは
  この 1 件だけだったため、`minimumReleaseAgeExclude` はキーごと削除した
- `allowBuilds` の棚卸し結果: `pnpm install --frozen-lockfile` の出力に
  ビルドスクリプト抑制のログは無く、現行の許可リスト（`esbuild` の 1 件のみ）以外に
  ブロックされているビルドスクリプトは無かった。変更は不要
- 将来、待機期間を 14 日・30 日へ引き上げる余地は残る。7 日で運用し、lockfile が
  一巡すれば違反件数は自然に減る。引き上げの判断は別 Issue とする
- **#70（段階 C）との境界**: `pnpm audit` の CI 組み込みは #69 で完了した。#70 側の
  該当項目は重複追加しない

## 追記（2026-08-15・#149）

### 推移依存の脆弱性を `overrides` で塞ぐ

`nanoid` の high 勧告（[GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)・
`<3.3.18` が対象）で `audit` ジョブが落ちた
（[#149](https://github.com/tomohiroJin/tasuki-tools/issues/149)）。31 経路すべてが
`postcss` 経由の開発時依存で、`pnpm audit --prod` は「脆弱性なし」のまま。
上の「決定」が想定していた**親パッケージの更新では解消しない**ことが実測で分かった
（`postcss` を 8.5.25 → 8.5.26 に上げても、要求が `^3.3.17` のため `nanoid` は 3.3.17 のまま）。

これは既存の決定を覆す追記ではない。`minimumReleaseAgeExclude`（**新しすぎる版を
例外的に取り込む**）が扱えない、**古すぎる版を選ばせない**という逆向きの操作について、
それまで規範が無かったため足す。

- **MUST**: 推移依存の脆弱性は、まず親パッケージの更新で解消するかを実際に試す。
  解消するならそちらを採る
- **MUST**: 親の更新で解消しない場合にのみ `pnpm-workspace.yaml` の `overrides` で
  下限を引き上げる。置き場は `minimumReleaseAge` と同じく同ファイルの 1 箇所のみとする
- **MUST**: `overrides` のキーは「名前@メジャー」で書き、値は `^` で下限を示す。
  キーを名前だけにする形・値を上限のない範囲（`>=x.y.z` 等）にする形はどちらも使わない。
  **狙っていないメジャーへ影響が漏れ、しかも `pnpm audit` は緑のままになるため**
  （両方とも実測。下記「影響」を参照）
- **MUST NOT**: `pnpm update -r <pkg>@<version>` で直そうとしない。同名パッケージが
  直接依存と推移依存の両方にいると区別せず、直接依存の宣言まで書き換える
- **MUST NOT**: `pnpm-lock.yaml` の版番号を手で書き換えない。ポリシー検査を素通りし、
  integrity ハッシュの不整合として実インストール時にだけ露見する
- **MUST**: 追加した `overrides` には、対象アドバイザリ・依存元・親の更新で解消しない
  理由をコメントで残す。**解除予定日は書かない**（`trustPolicyExclude` と同じく、
  日付では決まらないため）。削除できるかは、その行を外して
  `pnpm install --lockfile-only` を実行し、版が下限以上に留まるかで判断する

### 影響

- `"nanoid@3": "^3.3.18"` を追加した。差分は lockfile 3 行と設定のみで、直接依存の
  `nanoid@^6.0.1`（`apps/timer-sync` のルームコード生成）は変わらない
- 実測した却下案（いずれも実行して確認）:
  - `pnpm update -r nanoid@3.3.18` → `apps/timer-sync/package.json` の `nanoid` を
    `^6.0.1` から `^3.3.18` へ書き換えた
  - `pnpm update -r postcss` → `postcss` 8.5.26 が入るが `nanoid` は 3.3.17 のまま。
    `vite` 経由の `postcss@8.5.25` も別に残る
  - lockfile の版番号を直接置換 → `pnpm install --lockfile-only` も
    `✓ Lockfile passes supply-chain policies` を出して素通りし、
    `pnpm install --frozen-lockfile` で `ERR_PNPM_TARBALL_INTEGRITY` になった
- 書き方を崩した場合の実測（`pnpm audit --audit-level high` は**どちらも exit 0**）:
  - キーを名前だけにする（`"nanoid": "^3.3.18"`）→ 直接依存 `apps/timer-sync` の
    `nanoid` が lockfile 上で `^6.0.1` → `^3.3.18` になった。`package.json` は
    `^6.0.1` のまま変わらないため、差分では気づきにくい
  - 値を上限のない範囲にする（`"nanoid@3": ">=3.3.18"`）→ `postcss` の依存が
    `nanoid@6.0.1` に解決され、3.x が依存木から消えた
- 運用手順は [`docs/guides/development.md`](../guides/development.md) の
  「推移依存の脆弱性を overrides で塞ぐ」に置く
- **`nanoid` の high 勧告はこれで 2 件目**。1 件目（`>=3.3.17` で修正）は #69 が
  3.3.16 → 3.3.17 の更新で塞いだ。同じ依存元（`postcss`）で再発しうることを踏まえ、
  下限は固定値ではなく `^` で書いて後続のパッチ版を拾えるようにしている
