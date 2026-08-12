# trustPolicy（信頼証跡の降格拒否）の採用 — 設計ドキュメント

**日付:** 2026-08-12
**対象:** リポジトリ全体（`pnpm-workspace.yaml` / `docs/adr` / `docs/guides`）
**ステータス:** 承認済み（ブレスト合意）
**Issue:** [#116](https://github.com/tomohiroJin/tasuki-tools/issues/116)（親エピック [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67) 段階 B）
**前提:** [`docs/adr/0008`](../../adr/0008-dependency-supply-chain.md)（依存の供給網対策）/
[2026-08-10-dependency-supply-chain-design.md](./2026-08-10-dependency-supply-chain-design.md)

**このスペックが数値の正本です。** ADR・ガイド・Issue コメントへ実測値を転記しません
（同じ表を複数の文書へ書いて件数が食い違った過去があるため）。

## 背景と目的

#69 で `minimumReleaseAge`（公開から 7 日未満の版を拒否する待機期間）を導入した。
これは「乗っ取りが発覚するまで取り込みを遅らせる」防御であり、**7 日以内に発覚しなかった
改ざんは通す**。pnpm 11.5.0 はもう 1 つの対策として `trustPolicy` を持ち、こちらは公開日に
関係なく「信頼証跡の降格」を検知する。両者は直交するため、#69 のスコープ外として #116 へ
切り出されていた。

本設計は `trustPolicy: no-downgrade` を採用し、その運用規律を定める。

## 実測で確認した前提

すべて 2026-08-12 に `main = 1bbde74` の作業ツリー（`/home/vscode/tasuki-work`）で計測した。
pnpm は `11.5.0`（`package.json` の `packageManager`）。

### 機序（pnpm 本体のコードを読んで確認）

`pnpm.mjs` に埋め込まれた `resolving/npm-resolver/lib/trustChecks.js` の
`failIfTrustDowngraded` が判定の本体である。

1. 対象版の公開日時を取り、**それより前に公開された同一パッケージの全版**から
   最も強い信頼証跡を求める（`detectStrongestTrustEvidenceBeforeDate`）
2. 対象版の証跡がそれより弱い、または無い場合に `ERR_PNPM_TRUST_DOWNGRADE` で落とす

証跡の強さは `TRUST_RANK` で定義され、強い順に次の 3 段階。

| 証跡 | 判定条件（`getTrustEvidence`） |
|---|---|
| `stagedPublish` | `_npmUser.approver` が存在する |
| `trustedPublisher` | `_npmUser.trustedPublisher` かつ `dist.attestations.provenance` |
| `provenance` | `dist.attestations.provenance` のみ |

**判定は公開日だけで行われ、semver の系列を見ない。** pnpm 自身のエラーヒントにも
`Trust checks are based solely on publish date, not semver.` と明記されている。
このため、新しい系列が証跡を持ち始めた後に公開された**旧系列の保守版は必ず偽陽性になる**。

### 適用コスト

`pnpm-workspace.yaml` へ `trustPolicy: no-downgrade` を仮に入れ、
`node_modules` を全削除してから `pnpm install --frozen-lockfile` を実行した。

| 条件 | 結果 |
|---|---|
| 違反件数 | **447 エントリ中 1 件**（`semver@6.3.1`） |
| ベースライン（設定なし・`node_modules` 削除済み） | 1.5 秒 |
| `trustPolicy` 有効（検証キャッシュも冷たい） | **7〜9 秒**（4 回の実行。増分は +5.5〜7.5 秒） |
| `trustPolicy` 有効（検証キャッシュが有効） | 1.4 秒（ベースラインと同等） |

冷たい実行で pnpm は lockfile の検証を `447 entries in 6.9s` と報告した。増分のほぼ全部が
この検証である。

検証結果は `~/.cache/pnpm/lockfile-verified.jsonl` に
「lockfile のハッシュ＋ポリシー」を鍵として記録される。**ポリシーを変えると鍵が変わり、
再検証が走る。** CI には pnpm のキャッシュが無い（`actions/cache` の対象は Caddy と
Playwright のみ）ため、**CI では毎回この 6.9 秒を払う**。

`pnpm install --frozen-lockfile` を実行する CI ジョブは 4 つ（`ci` / `audit` / `e2e` /
`quality`）。`docs` ジョブは install しない。ジョブは並列に走るので、待ち時間への影響は
最長経路（`ci`。実測 121〜133 秒）への +6 秒前後になる。

### 唯一の違反は設計上の偽陽性だった

`semver@6.3.1` は 2023-07-10T22:38:41Z 公開の 6.x 系保守版で、証跡を持たない。
その公開日より前に、次の 4 版が `provenance` 付きで公開されている。

| 版 | 公開日時 | 証跡 |
|---|---|---|
| 7.5.1 | 2023-05-12T16:39:41Z | provenance |
| 7.5.2 | 2023-06-15T20:26:11Z | provenance |
| 7.5.3 | 2023-06-22T21:53:19Z | provenance |
| 7.5.4 | 2023-07-07T21:10:32Z | provenance |

依存元は `@babel/core` と `@babel/helper-compilation-targets`
（いずれも `eslint-plugin-react-hooks` 経由の開発時依存）で、利用者へ配布されない。

**この偽陽性は時間で解消しない。** 6.3.1 の公開日は動かないため、除外は恒久的になる。
`minimumReleaseAgeExclude`（期限つき）とは性質が異なる。

### この検査がどれだけ効くか

lockfile の全 447 エントリについて、登録所の単一版ドキュメントから証跡を集計した。

| 証跡 | 件数 |
|---|---|
| `trustedPublisher` | 128 |
| `stagedPublish` | 21 |
| `provenance` | 2 |
| なし | 296 |

**151 件（33.8%）が降格検知の対象**になる。残り 296 件は元々証跡を持たないため、
この検査は何も判定しない。npm の provenance 普及に伴い、この割合は今後上がる。

### 除外は版単位で書ける

`trustPolicyExclude` は `名前` と `名前@版` の両方を受け付ける
（`failIfTrustDowngraded` の先頭で `excludeResult === true` と
`Array.isArray(excludeResult) && excludeResult.includes(version)` の 2 経路を持つ）。

`"semver@6.3.1"` を除外すると通り、`"semver@9.9.9"` に差し替えると再び落ちることを
実測した。**版指定は本当に効いている。**

### 罠: `trustPolicyIgnoreAfter` は検査を無力化する

`trustPolicyIgnoreAfter`（分）は「**公開から N 分より古い版は検査しない**」設定である
（`minutesSincePublish > trustPolicyIgnoreAfter` なら判定を飛ばす）。

`minimumReleaseAge: 10080`（7 日）により、そもそも公開から 7 日未満の版は install できない。
したがって **`trustPolicyIgnoreAfter` を 10080 以下にすると、install しうるすべての版が
検査対象から外れる。**

`trustPolicyIgnoreAfter: 10080` で実測したところ、`semver@6.3.1` の違反が消えて
終了コード 0 になった。**検証には 8 秒かかっており、コストを払ったまま 1 件も判定していない。**
この設定は使わない。

### 登録所の不調は install の失敗になる（fail-closed）

`runTrustCheck` はメタデータの取得に失敗すると、その例外を `uncheckable("trustPolicy", ...)`
という理由の違反として返す。登録所が不調のとき install が落ち、CI が赤くなる経路が 1 本増える。
黙って検査を素通りするよりは安全側だが、CI が赤くなる原因が 1 つ増えることは記録しておく。

## 決定

### D1. `trustPolicy: no-downgrade` を採用する

待機期間 7 日は「遅らせる」だけで、7 日以内に発覚しなかった改ざんは取り込んでしまう。
乗っ取りの典型（盗んだトークンで、CI を経由せず＝証跡なしに publish される）を即座に弾く
`trustPolicy` は待機期間と直交する防御であり、コストは除外 1 行と CI の +6 秒前後に収まる。

### D2. `trustPolicyIgnoreAfter` は使わない

`minimumReleaseAge` 以下の値にすると検査が 1 件も判定しなくなり、検証コストだけが残る。
「静かに効かなくなる検査」を自分で作ることになるため、値を問わず使わない。

### D3. 除外は `名前@版` で書く

名前だけで除外すると、以後そのパッケージの**全版**が無検査になる。実際の乗っ取りは
新しい版で起きるため、名前単位の除外は防御をそのパッケージについて完全に無効化する。

### D4. 除外には「なぜ偽陽性と判断したか」の根拠をコメントで残す。期限は書かない

`trustPolicyExclude` の除外は恒久的である（公開日は動かないため時間で解消しない）。
`minimumReleaseAgeExclude` の「解除予定日を書き、解除を完了条件に含める」作法をここへ
持ち込むと、来ない期限を待つ約束になる。代わりに、**旧系列の保守版であることを
登録所のメタデータで確認した記録**を残す。

### D5. 違反を見て反射的に除外へ足さない

違反は「旧系列の保守版（偽陽性）」と「本物の乗っ取り」を区別しない。除外へ足す前に、
当該版より前に公開された版の証跡を登録所で確認し、偽陽性である根拠を得る。
手順はガイドに書く。

### D6. ADR は新規に 0010 を起こす。0008 へは追記しない

`docs/adr/README.md` が「ADR は不変の記録」と定めているため。0008 の決定は覆らないので
`Superseded` ではなく、Related として相互参照する。

### D7. 除外が名前単位に退化する経路の機械的な検査は #135 へ申し送る

「`trustPolicyExclude` の各行が版指定になっているか」を検査する仕組みは有効だが、
#135 が「検査が静かに効かなくなる 4 経路」を扱う Issue であり、同じ性質の 5 本目として
そちらへ寄せる。検査の仕組みを 1 か所にまとめ、本 Issue で新規スクリプトと CI 配線を
起こす過剰を避ける。#135 は #72 の前に着手する。

### D8. 変更は 1 PR にまとめる

設定 6 行・ADR 1 本・ガイド 1 節で、DoD の多くは「該当なし」になる。憲法 原則 IX
「小さく回す」も DoD も PR の本数を規定していない。#119（PR の粒度の見直し）が提起した
「小さな PR の固定費が実装コストを上回る」問題にも合う。

## 変更内容

### `pnpm-workspace.yaml`

`minimumReleaseAgeExclude` の下に追記する。

```yaml
# 信頼証跡（provenance / trusted publisher / staged publish）の降格を拒否する。
# 乗っ取り（盗んだトークンで、CI を経由せず＝証跡なしに publish される）を、
# 公開から 7 日を過ぎていても弾く。待機期間とは直交する防御。
# 判定は公開日のみで行われ semver の系列を見ないため、旧系列の保守版は偽陽性になる。
# 判断の根拠は docs/adr/0010、運用手順は docs/guides/development.md を参照。
trustPolicy: no-downgrade

# 恒久的な除外（公開日は動かないため時間では解消しない）。
# minimumReleaseAgeExclude の「期限つき」とは性質が異なる。解除予定日は書かない。
# 必ず「名前@版」で書く。名前だけにすると以後その名前の全版が無検査になる。
trustPolicyExclude:
  # semver@6.3.1（2023-07-10T22:38:41Z 公開）は 6.x 系の保守版で証跡を持たない。
  # その公開日より前に 7.5.1〜7.5.4 が provenance 付きで出ているため降格と判定される、
  # 設計上の偽陽性。依存元は @babel/core（eslint-plugin-react-hooks 経由の開発時依存）。
  - "semver@6.3.1"
```

### `docs/adr/0010-trust-policy.md`（新規）

Nygard 形式（背景 / 決定 / 影響 / ステータス）。決定として D1〜D5 を MUST / MUST NOT で書く。
**実測値は転記せず、本スペックを数値の正本として参照する**（0008 と同じ扱い）。
`docs/adr/README.md` の一覧へ 1 行追加する。

### `docs/guides/development.md`

「依存の更新」節に小節「信頼証跡の降格拒否」を追加する。既存の
「緊急の脆弱性修正を待機期間中に取り込む例外手順」と同じ形式で、次を書く。

- 何を拒否するか（1〜2 文）と、待機期間との違い
- **違反が出たときの判断手順**: 当該版の公開日時を調べ、それより前に公開された版に
  より強い証跡があるかを登録所のメタデータで確認する。旧系列の保守版なら偽陽性、
  そうでなければ乗っ取りを疑う
- 偽陽性と判断したときの除外の書き方（版指定・根拠コメント・期限は書かない）
- `trustPolicyIgnoreAfter` を使わない理由

## 検証

新しい検査を足すため、DoD 項目 3「わざと壊して赤くなることを確認した」に従う。
確認は `node_modules` を全削除してから `pnpm install --frozen-lockfile` で行う
（`node_modules` が最新だと「Already up to date」で短絡して検証が走らない。ガイド既述）。

| 壊し方 | 期待 | 状態 |
|---|---|---|
| `trustPolicyExclude` の行を消す | install が落ちる（`ERR_PNPM_TRUST_DOWNGRADE`） | 実測済み |
| 除外を `"semver@9.9.9"` に差し替える | install が落ちる（版指定が効いている証明） | 実測済み |
| `trustPolicy` の行を消す | install が通る | 実測済み |
| `trustPolicyIgnoreAfter: 10080` を足す | install が通ってしまう（採用しない根拠） | 実測済み |

いずれもブレスト中に実測済みだが、**最終形の設定に対して改めて実行する**（設定の文言を
書き直した後に空振りしていないことを確かめるため）。

## 影響と非対象

- CI の 4 ジョブが各 +6 秒前後。ジョブは並列なので待ち時間への影響は最長経路への +6 秒前後
- 登録所からメタデータを取得できないと install が落ちる（fail-closed）
- 今後、依存の更新で新たな偽陽性が出うる。D5 の手順で 1 件ずつ判断する
- **非対象**: 除外が版指定であることの機械的な検査（→ #135）。
  `pnpm` 自体の更新（11.5.0 → 11.21.0 が出ていることを install 時に確認したが、
  本 Issue の範囲外。Renovate の提案に委ねる）
