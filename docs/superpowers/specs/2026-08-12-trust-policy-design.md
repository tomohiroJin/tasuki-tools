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

**違反が 1 件で打ち切られていないことの確認**: pnpm が最初の違反で検証を止めるなら、
`semver@6.3.1` の陰に別の違反が隠れうる。`semver@6.3.1` だけを除外した実行が
終了コード 0 で完了したため、**現行 lockfile に他の違反は無い**と言える。

検証結果は `~/.cache/pnpm/lockfile-verified.jsonl` に
「lockfile のハッシュ＋ポリシー」を鍵として記録される。**ポリシーを変えると鍵が変わり、
再検証が走る。** CI には pnpm のキャッシュが無い（`actions/cache` の対象は Caddy と
Playwright のみ）ため、CI では検証キャッシュが効かない。

### CI が実際に払うコスト

**上の秒数は overlay（`/home/vscode/tasuki-work`）での実測。CI での実測は本 Issue の
PR（#137、run [31602504474](https://github.com/tomohiroJin/tasuki-tools/actions/runs/31602504474)）
で取得した。**`pnpm-workspace.yaml` の変更は依存を伴うコード変更として扱われ、
`ci` / `e2e` / `quality` / `audit` の 4 ジョブすべてで `pnpm install --frozen-lockfile`
が走った。各ジョブのログで `Verifying lockfile against supply-chain policies (447 entries)...`
から次の `Progress: resolved 1, ...`（検証完了・依存解決の開始）までの秒数を計測すると、
4 ジョブとも **7.8〜7.9 秒**で揃った。

| ジョブ | 検証（Verifying → 最初の Progress） | pnpm 自己申告（`447 entries in N s`） | install 全体（`Done in`） |
|---|---|---|---|
| `audit` | 7.775 秒 | 7.7 秒 | 10.4 秒 |
| `ci` | 7.932 秒 | 7.8 秒 | 10.9 秒 |
| `quality` | 7.886 秒 | 7.8 秒 | 11.7 秒 |
| `e2e` | 7.835 秒 | 7.7 秒 | 12.1 秒 |

pnpm 自己申告は 1 桁精度（小数第 1 位）のログしか出さないため、ジョブ間の 0.1〜0.2 秒の
差はこの列では解像できない。

pnpm 自身の申告どうしで揃えると、overlay 6.9 秒に対し CI は 7.7〜7.8 秒で **1 割ほど CI が
高い**。install 全体では overlay 7〜9 秒に対し CI 10.4〜12.1 秒だが、差の大部分は検証以外
（node / corepack の準備・リンク）である。検証コストの水準は同じ帯に収まっている。

さらに、#70 で入れたジョブの絞り込みにより **`pnpm install` はすべて条件付きステップ**である
（`.github/workflows/ci.yml`）。無条件に 4 ジョブが払うわけではない。

| 変更の種類 | install が走るジョブ | 追加コスト |
|---|---|---|
| 文書のみ | **なし** | **0** |
| コード変更（依存は据え置き） | `ci` / `e2e` / `quality` の 3 つ | 並列なので最長経路（`ci`。実測 121〜133 秒）への上乗せ 1 回分 |
| コード変更＋依存変更 | 上記に `audit` を加えた 4 つ | 同上（`audit` は 7〜13 秒の短いジョブなので臨界経路にならない） |

`ci` / `e2e` / `quality` の install は `if: steps.scope.outputs.code == 'true'`、
`audit` の install は `if: steps.scope.outputs.deps == 'true'` で守られている。
`docs` ジョブは install しない（ステップを直接確認した）。

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

**この偽陽性は時間で解消しない。** 6.3.1 の公開日は動かないため、待っても消えない。
`minimumReleaseAgeExclude`（期限つき）とは性質が異なる。ただし `@babel/core` が
`semver@7` へ上がるなどして 6.3.1 が依存木から消えれば、除外は不要になる（D4）。

### この検査がどれだけ効くか

lockfile の全 447 エントリについて、登録所の単一版ドキュメントから証跡を集計した。

| 証跡 | 件数 |
|---|---|
| `trustedPublisher` | 128 |
| `stagedPublish` | 21 |
| `provenance` | 2 |
| なし | 296 |

**151 件（33.8%）が降格検知の対象**になる。npm の provenance 普及に伴い、この割合は今後上がる。

**この 151 件は下限である。** 判定は「対象版より前に公開された同一パッケージの版」の証跡と
比べるため、**現在の版に証跡が無くても、過去のいずれかの版が持っていれば対象になる**
（`semver` がまさにこの形で、現在の 6.3.1 に証跡は無いが 7.5.x が持っていたため判定された）。
上の集計は現在の版が証跡を持つ数を数えたものなので、実際の保護対象はこれ以上ある。

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
したがって **`trustPolicyIgnoreAfter` を 10080 以下にすると、install しうる版がほぼすべて
検査対象から外れる。**

厳密には例外が 1 つある。`minimumReleaseAgeExclude` に登録されたパッケージは待機期間を
免除されるため、公開から 7 日未満でも install されうる。そこだけは
`trustPolicyIgnoreAfter: 10080` でも検査対象に残る。ただし現在の除外は 1 件
（`postcss-selector-parser`、2026-08-14 に解除予定）だけであり、**検査が実質的に
何も判定しなくなるという結論は変わらない。**

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
`trustPolicy` は待機期間と直交する防御である。コストは除外 1 行と、install が走る CI ジョブ
（文書のみの PR では 0 個）での検証時間に収まる。

### D2. `trustPolicyIgnoreAfter` は使わない

`minimumReleaseAge` 以下の値にすると検査が 1 件も判定しなくなり、検証コストだけが残る。
「静かに効かなくなる検査」を自分で作ることになるため、値を問わず使わない。

### D3. 除外は `名前@版` で書く

名前だけで除外すると、以後そのパッケージの**全版**が無検査になる。実際の乗っ取りは
新しい版で起きるため、名前単位の除外は防御をそのパッケージについて完全に無効化する。

### D4. 除外には「なぜ偽陽性と判断したか」の根拠をコメントで残す。期限は書かない

`trustPolicyExclude` の除外は時間では解消しない（公開日は動かないため）。
`minimumReleaseAgeExclude` の「解除予定日を書き、解除を完了条件に含める」作法をここへ
持ち込むと、来ない期限を待つ約束になる。代わりに、**旧系列の保守版であることを
登録所のメタデータで確認した記録**を残す。

**ただし「恒久」ではない。** 除外した版が依存木から消えれば（例: `@babel/core` が
`semver@7` へ上がる）、その行は無効なゴミになる。**期限も検査も無いため、消し忘れに
気づく契機がゼロである。** さらに悪いことに、放置された行はその版が将来また現れたときに
黙って免除を与える。この経路の始末は D7 で #135 へ申し送る。

### D5. 違反を見て反射的に除外へ足さない

違反は「旧系列の保守版（偽陽性）」と「本物の乗っ取り」を区別しない。除外へ足す前に、
当該版より前に公開された版の証跡を登録所で確認し、偽陽性である根拠を得る。
手順はガイドに書く。

### D6. ADR は新規に 0010 を起こす。0008 へは追記しない

`docs/adr/README.md` が「ADR は不変の記録」と定めているため。0008 の決定は覆らないので
`Superseded` ではなく、0010 から 0008 を参照する（0008 には追記しない。ADR は不変の記録の
ため）。0008 の読者は `docs/adr/README.md` の一覧から 0010 に辿れる。

### D7. 本設定が静かに効かなくなる 3 経路の機械的な検査は #135 へ申し送る

次の 3 つは、いずれも「検査が何も検証しなくなるのに緑のまま」という同じ性質を持つ。
**1・2 は除外リストの経路、3 はキーと値そのものの経路**で、原因は別である。

1. **版指定の退化**: `trustPolicyExclude` の行が `名前@版` ではなく `名前` だけになると、
   そのパッケージの全版が無検査になる（D3）
2. **死んだ除外行の残留**: 除外した版が依存木から消えても行が残り、将来その版が
   再び現れたときに黙って免除する（D4）
3. **設定キー・値の綴り誤り**: `trustPolicy` の値や `pnpm-workspace.yaml` のキー名を
   誤ると、pnpm はそれを検証せず、無警告で検査そのものが消える（下の小節で実測）

いずれも検査する仕組みは有効だが、#135 が「検査が静かに効かなくなる 4 経路」を扱う
Issue であり、同じ性質の 5〜7 本目としてそちらへ寄せる。検査の仕組みを 1 か所に
まとめ、本 Issue で新規スクリプトと CI 配線を起こす過剰を避ける。#135 は #72 の前に着手する。

#### 実測で確認した前提（綴り誤りの経路）

`/tmp` 配下の複製で `trustPolicy: no-downgrade` を `trustPolicy: no-downgrad`
（末尾の `e` 落ち）に書き換え、`trustPolicyExclude` の除外行を無効化してから
`node_modules` と検証キャッシュを消して `pnpm install --frozen-lockfile` を実行した。

結果は終了コード 0 で、ログは `✓ Lockfile passes supply-chain policies (447 entries in
2.8s)` だった。`Verifying lockfile against supply-chain policies (447 entries)...` の行も
件数もそのまま出る。正しい綴りのまま同じ除外を無効化した対照実験では
`[ERR_PNPM_TRUST_DOWNGRADE]` で落ちることを確認済みなので、差は綴りだけである。
pnpm 11.5.0 の実装（`trustCheckActive = opts.trustPolicy === "no-downgrade"`）が
完全一致判定のみで、未知の値やキー名を検証しないことによる。

### D8. Renovate の PR が降格判定で赤くなったときも D5 の手順を通す

ADR 0008 は「Renovate 側の待機期間を pnpm 側（7 日）以上にする」を決めているが、
**`trustPolicy` には Renovate 側の対応物が無い。** bot は降格を予見できないため、
提案した更新が降格判定に当たれば PR は赤くなる。

これは不具合ではなく**信号**である。赤くなったら D5 の手順（当該版より前の版の証跡を
登録所で確認する）を通し、偽陽性なら除外を足して取り込み、そうでなければ更新を見送る。
Renovate 側の設定でこの赤を消そうとしない。

### D9. 変更は 1 PR にまとめる

憲法 原則 IX「小さく回す」は「**1 PR は 1 つの論理的変更に留める（MUST）**」と定めており、
PR の本数は規定していない。DoD ガイドにも分割数の規定は無い。

本変更は「`trustPolicy` を採用する」という**1 つの決定**を、設定・ADR・ガイドの 3 か所へ
記録するものであり、1 つの論理的変更にあたる。3 つに割ると、どれか 1 つだけが main に
入った中間状態（設定はあるが根拠の記録が無い、等）が生じ、かえって原則に反する。
#119（PR の粒度の見直し）が提起した「小さな PR の固定費が実装コストを上回る」問題にも合う。

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

# 降格判定の偽陽性に対する除外。公開日は動かないため待っても解消せず、
# minimumReleaseAgeExclude の「期限つき」とは性質が異なる。解除予定日は書かない。
# ただし当該版が依存木から消えたらこの行は不要になる（残すと将来その版を黙って免除する）。
# 必ず「名前@版」で書く。名前だけにすると以後その名前の全版が無検査になる。
trustPolicyExclude:
  # semver@6.3.1（2023-07-10T22:38:41Z 公開）は 6.x 系の保守版で証跡を持たない。
  # その公開日より前に 7.5.1〜7.5.4 が provenance 付きで出ているため降格と判定される、
  # 設計上の偽陽性。依存元は @babel/core（eslint-plugin-react-hooks 経由の開発時依存）。
  - "semver@6.3.1"
```

### `docs/adr/0010-trust-policy.md`（新規）

Nygard 形式（背景 / 決定 / 影響 / ステータス）。決定として **D1〜D5 と D8** を
MUST / MUST NOT で書く（D6・D7・D9 は「どこに記録するか」「どこへ申し送るか」
「PR をどう割るか」という進め方の判断なので、ADR ではなく本スペックに留める）。
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
- **既存の「違反時に取れる手は 3 つ」が `trustPolicy` には当てはまらないこと。**
  同ガイドは待機期間の違反に対して「待つ / 期限つき除外 / 全面再解決」を挙げているが、
  降格判定の偽陽性は**待っても解消せず、`pnpm clean --lockfile` での全面再解決でも
  解消しない**（公開日が動かないため）。取れる手は「除外する」か「依存の版を変える」の
  2 つだけである。これを書かないと、読者が無効な手を選ぶ
- **Renovate の PR が赤くなったときの扱い**（D8）

## 検証

新しい検査を足すため、DoD 項目 3「わざと壊して赤くなることを確認した」に従う。
確認は `node_modules` を全削除してから `pnpm install --frozen-lockfile` で行う
（`node_modules` が最新だと「Already up to date」で短絡して検証が走らない。ガイド既述）。

| 壊し方 | 期待 | ブレスト中 | 最終形に対して |
|---|---|---|---|
| `trustPolicyExclude` の行を消す | install が落ちる（`ERR_PNPM_TRUST_DOWNGRADE`） | 実測済み | **再実行済み**（Task 1 Step 2） |
| 除外を `"semver@9.9.9"` に差し替える | install が落ちる（版指定が効いている証明） | 実測済み | **再実行済み**（Task 1 Step 5） |
| `trustPolicy` の行を消す | install が通る | 実測済み | **再実行済み**（Task 1 Step 1 のベースライン） |
| `trustPolicyIgnoreAfter: 10080` を足す | install が通ってしまう（採用しない根拠） | 実測済み | **行わない**（下記） |
| `trustPolicy` を `no-downgrad` に誤記する | install が通ってしまう（D7 の 3 経路目） | — | **実測済み**（D7 の小節） |

**最終形の設定に対して改めて実行する**方針を採った（設定の文言を書き直した後に空振りして
いないことを確かめるため）。ただし `trustPolicyIgnoreAfter: 10080` だけは再実行していない。
**採用しない設定を最終形へ入れて試す意味が無い**ためで、ブレスト中の実測（違反が消えて
終了コード 0 になる）が採否の根拠としては足りている。

`trustPolicy` の行を消したときに install が通ることは、Task 1 Step 1 のベースライン
（設定を入れる前の実行が終了コード 0）で確かめている。

## 影響と非対象

- CI の待ち時間が伸びる。**文書のみの PR では 0**、コード変更では install が走る
  3〜4 ジョブが検証を払う（「CI が実際に払うコスト」節。実測は本 Issue の PR #137 で行った）
- 登録所からメタデータを取得できないと install が落ちる（fail-closed）
- 今後、依存の更新で新たな偽陽性が出うる。D5 の手順で 1 件ずつ判断する
- **Renovate の PR が降格判定で赤くなる経路が増える**（D8）。Renovate 側に対応する
  設定は無いため、赤は信号として扱う
- 除外行は時間で解消せず、依存木から対象版が消えても残る。始末は #135（D7）
- **非対象**: 本設定が静かに効かなくなる 3 経路（除外リストに 2 つ・キーと値に 1 つ）の
  機械的な検査（→ #135・D7）。
  `pnpm` 自体の更新（11.5.0 → 11.21.0 が出ていることを install 時に確認したが、
  本 Issue の範囲外。Renovate の提案に委ねる）
