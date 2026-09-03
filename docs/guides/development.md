# 開発ガイド

## このガイドの位置づけ

**起動・テスト・検査の手順の正本はこのガイドです。** 書き分けの規則は
[`docs/adr/0002`](../adr/0002-document-system-three-layers.md)（文書体系の三層構造）を
参照してください。

## 前提

- **Node.js 22 以上**（pnpm 11.5.0 が `node:sqlite` を使うため、20 では起動しません）
- pnpm 11.5.0（`packageManager` 宣言に従うので `corepack enable` でよい）
- **Bun** — 同期サーバーの起動と `apps/poker-sync` のテスト・ビルドに必要

```bash
corepack enable
pnpm install
```

## まとめて起動

```bash
pnpm dev     # turbo が全アプリの dev を並列起動する
```

起動したら **<http://localhost:5175/>（玄関 LP）を開いてください。**
ここが本番と同じ入口で、札をクリックすれば各ツールへ移動できます。

### 玄関から通しで使う

**<http://localhost:5175/> を入口にすると、本番と同じ形で 3 系統を行き来できます。**
LP の dev サーバーが本番の Caddy と同じ役割を担い、`/timer/` と `/poker/` を
それぞれの dev サーバーへ転送します（WebSocket も通します）。

| 入口 | 到達先 |
|---|---|
| <http://localhost:5175/> | 玄関 LP |
| <http://localhost:5175/timer/> | timer（札をクリックしても移動する） |
| <http://localhost:5175/poker/> | poker（同上） |
| `/timer/ws`・`/poker/ws` | 各同期サーバー |

各ツールの dev サーバー（:5173 / :5174）を直接開いても動きます。そちらは
そのツールだけを触るとき向けで、**玄関からの導線を確かめるなら :5175 を使ってください。**

本番の Caddy 設定そのものを検証したいときは、リバースプロキシを立てて
`deploy/*/caddy/*.conf` の断片をそのまま使えます。手順は
[`deploy/caddy/README.md`](../../deploy/caddy/README.md)、実例は
[`docs/superpowers/specs/2026-08-05-s4-url-relocation-design.md`](../superpowers/specs/2026-08-05-s4-url-relocation-design.md)
にあります。

## 個別起動

Tasuki は **5 つのプロセス**（web 3 + 同期サーバー 2）で構成されます。
用途に応じて必要なものだけ起動してください。

| プロセス | コマンド | 開く URL |
|---|---|---|
| 玄関 LP | `pnpm --filter @tasuki/landing dev` | <http://localhost:5175/> |
| timer の画面 | `pnpm --filter @tasuki/timer-web dev` | <http://localhost:5173/timer/> |
| timer の同期サーバー | `pnpm --filter @tasuki/timer-sync dev` | （:8787・画面から使う） |
| poker の画面 | `pnpm --filter @tasuki/poker-web dev` | <http://localhost:5174/poker/> |
| poker の同期サーバー | `pnpm --filter @tasuki/poker-sync dev` | （:3311・画面から使う） |

各アプリは本番と同じ `base` で配信されます。ブラウザで `http://localhost:5173/` のように
base を省いて開いた場合は、Vite が **302 で `/timer/` へリダイレクト**するので表示できます。
ただし `curl` など**リダイレクトを追わないクライアントでは 302 のまま**なので、
動作確認では末尾のパスまで指定してください。

同期サーバーを起動していないと、画面は開けても**ルームの作成・参加ができません**。
timer なら timer-sync、poker なら poker-sync が対になります。

> ポートが埋まっていると Vite は次の空きポートへ逃げます。起動時のログに出る URL が正です。
>
> `pnpm dev` は `--continue` 付きで動くので、**1 つ失敗しても残りは起動します**。
> ただし同期サーバーが `EADDRINUSE` で落ちていても画面は開けてしまい、
> **ルームを作ろうとして初めて気づく**ことになります。起動ログにエラーが出ていないか
> 確認してください。古い開発サーバーが残っている場合は先に片付けます。
>
> ```bash
> ss -tlnp | grep -E ':(8787|3311|517[3-5])'   # 誰が掴んでいるか
> ```

## 依存の更新

公開直後の版（7 日未満）は `pnpm install` の段で拒否されます
（`pnpm-workspace.yaml` の `minimumReleaseAge`。判断の根拠は
[`docs/adr/0008`](../adr/0008-dependency-supply-chain.md)）。

### 通常の更新

```bash
pnpm outdated -r   # 全プロジェクトを見る。ルートのみの pnpm outdated は実行時依存を取りこぼす
pnpm update <pkg>  # 宣言済み semver 範囲内で更新
```

### 緊急の脆弱性修正を待機期間中に取り込む例外手順

7 日未満の版をどうしても取り込む必要がある場合のみ、対象パッケージだけを
`minimumReleaseAgeExclude` で除外します。

```yaml
# pnpm-workspace.yaml
minimumReleaseAgeExclude:
  # 【期限つき】GHSA-xxxx-xxxx-xxxx の修正取り込みのため一時除外。
  # 解除予定: 2026-08-17（当該版が公開から 7 日を超える日）
  - "dompurify"
```

- 除外は**特定パッケージのみ**に絞る。`pnpm install --trust-lockfile` で
  検証を全体的に切ることはしない
- **理由・対象アドバイザリ・解除予定日をコメントに残す**
- **解除を完了条件に含める**（消し忘れると恒久設定になる）

### 推移依存の脆弱性を overrides で塞ぐ

**親パッケージを更新しても脆弱な版が選ばれ続けるとき**だけ、`overrides` で
下限を引き上げます（判断の根拠は
[`docs/adr/0008`](../adr/0008-dependency-supply-chain.md)）。

前節の `minimumReleaseAgeExclude` とは目的が違います。あちらは「新しすぎる版を
例外的に取り込む」ため、こちらは「古すぎる版を選ばせない」ためのものです。

```yaml
# pnpm-workspace.yaml
overrides:
  # <対象パッケージ>@<メジャー> は <アドバイザリ ID>（<深刻度>・<対象範囲>）を踏む。
  # 依存元は <親パッケージ> で、<親を更新しても解消しない理由>。
  "<名前>@<メジャー>": "^<下限>"
```

**このリポジトリには現在 `overrides` を 1 件も置いていません。** 唯一あった
`"nanoid@3": "^3.3.18"` は [#199](https://github.com/tomohiroJin/tasuki-tools/issues/199)
で削除しました（捨てて解き直すと override 無しでも `postcss` が `nanoid@3.3.18` を選ぶ）。
**上は書式の例であって、実在の設定の写しではありません。**

#### 使う前に確かめること

**まず親を更新して解消するかを実際に試します。** 解消するならそちらが本筋で、
`overrides` は要りません。

**この確認は `package.json` を書き換えます。手元の変更を先にコミットしてください。**
手順の最後で書き換わったファイルを HEAD へ戻すためです。

```bash
pnpm update -r <親パッケージ> --lockfile-only
git status --short                              # 何が書き換わったかを先に見る
grep -nE "^  <対象パッケージ>@" pnpm-lock.yaml   # 版が上がったか

# 確認だけなら、書き換わったファイルだけを指定して戻す
git checkout -- pnpm-lock.yaml <書き換わった package.json>
```

**`pnpm update -r <親パッケージ> --lockfile-only` は `package.json` も書き換えます。**
`--latest` もバージョン指定も付けていなくても起きます。実測（2026-08-28）では
`pnpm update -r postcss --lockfile-only` が `apps/timer-web/package.json` の
`"postcss": "^8.5.25"` を `"^8.5.26"` へ書き換えました。`apps/timer-web` は `postcss` を
直接依存として宣言しているため、**推移依存を確かめるつもりでも直接依存の宣言が動きます**。
だから `grep` より先に `git status --short` を見ます。

**`git checkout -- .` で戻さないでください。** 作業ツリー全体を HEAD へ戻す操作で、
確認のための一時変更だけでなく**進行中の未コミットの変更まで消えます**
（[振り返り](../retrospectives/2026-08-11-issue-69-supply-chain.md)の「罠 3」に
記録された事故そのものです。同じ振り返りの「罠 4」は `git checkout main -- .` で
**コミット済み**の差分が巻き戻った別の事故で、ここでの話ではありません）。
ファイルを指定しても HEAD へ戻る点は変わらないので、
**確認を始める前にコミットしておくこと**が前提になります。

**`pnpm update -r <pkg>@<version>` で直そうとしないでください。** 同名パッケージが
直接依存と推移依存の両方にいると区別せず、**直接依存の宣言まで書き換えます**
（`nanoid` で実際に `apps/timer-sync` の `^6.0.1` が `^3.3.18` に書き換わりました）。

**lockfile の版番号を手で書き換えるのも不可です。** `pnpm install --lockfile-only` も
供給網ポリシー検査も素通りしますが（`✓ Lockfile passes supply-chain policies` が出ます）、
integrity ハッシュが古いままなので実インストールで `ERR_PNPM_TARBALL_INTEGRITY` になります。

#### 書き方

**キーと値のどちらを崩しても、狙っていないメジャーへ影響が漏れます。** どちらも
`nanoid` で実際に再現しました。

- **キーは「名前@メジャー」で書く**（`"nanoid@3"`）。名前だけ（`"nanoid"`）にすると
  **直接依存の宣言まで書き換わります**。実測では `apps/timer-sync` の `nanoid` が
  lockfile 上で `^6.0.1` → `^3.3.18` になり、ルームコード生成が 3.x に落ちました。
  `package.json` は `^6.0.1` のまま変わらないため、差分を見ても気づきにくい形です
- **値は `^` で下限を示す。** 上限のない範囲（`>=3.3.18` 等）にすると
  **その範囲に入る別メジャーが選ばれます**。実測では `"nanoid@3": ">=3.3.18"` にした結果、
  `postcss` の依存が `nanoid@6.0.1` に解決され、3.x が依存木から消えました
- **どちらの誤りも `pnpm audit` は緑になります。** 脆弱な版が消えたことは確かなので、
  audit だけでは検出できません。**lockfile の該当箇所を目で確かめてください**
- **対象アドバイザリ・依存元・親を更新しても解消しない理由をコメントに残す**

#### 削除の条件

**解除予定日は書きません。** 親パッケージの要求が上がる日は決まっていないためです。
`trustPolicyExclude` と同じく、条件で判断します。

**判定は `pnpm-lock.yaml` と `node_modules` を捨てて解き直して行います。** 「当該行を外して
`pnpm install --lockfile-only` を実行し、版が下がるか見る」という素朴な手順では判定できません。
知りたいのは「今の lockfile に載っている版」ではなく「**この行が無いときに解決器が選ぶ版**」
なのに、pnpm は前回の結果を引き継げる材料が残っている限り引き継ぐからです。

**pnpm は前回の結果を 2 段構えで引き継ぎます。**

1. **`pnpm-lock.yaml` を残すと**、そこに載っている版が要求範囲を満たす限り、その版を
   選び直しません（`Progress: resolved …` は出ますが、載っている版がそのまま残ります）。
   当該パッケージだけでなく**依存木全体が凍結されます**。実測では、`"nanoid@3": "^3.3.18"`
   を外して実行しても `nanoid@3.3.18` のまま据え置かれ、同時に `postcss` も `8.5.25` の
   ままでした（捨てて解き直すと `8.5.26` が選ばれます）。`pnpm dedupe --lockfile-only` も
   同じです。**親の版が動けば親が要求する範囲も動く**ので、木を凍結したままでは
   「この行が無いときに選ばれる版」は分かりません
2. **`pnpm-lock.yaml` だけ消して `node_modules` を残すと**、pnpm は
   `node_modules/.pnpm/lock.yaml`（前回のインストールが何を展開したかの記録）を
   代わりに読みます。**`pnpm-workspace.yaml` を編集していなければ**、消したはずの
   `pnpm-lock.yaml` はそこから**バイト単位で復元され、解決が 1 件も走りません**。
   **編集していれば解決自体は走りますが、その記録を土台にするので木は凍結されたまま
   です。** 実測では、`"nanoid@3": "^3.3.18"` を外して `pnpm-lock.yaml` だけ消すと
   `Progress: resolved …` は出るのに `postcss` は `8.5.25` のままで、生成された
   lockfile は**何も捨てずに実行したときと md5 が一致**しました。
   `node_modules/.pnpm/lock.yaml` まで消すと解決が走り `8.5.26` になります。
   **この段は「解決が走ったかどうか」では見分けられません**

**据え置きが起きるかどうかは `overrides` の書き方で決まり、手順の側からは見分けられません。**
下限が親の要求範囲の**内側**にあるとき（#199 で削除するまでこのリポジトリにあった
`"nanoid@3": "^3.3.18"` がそう。`postcss` の要求は `^3.3.17`）は、行を外しても lockfile の
版がそのまま有効なので据え置かれ、判定は必ず「削除できる」側に倒れます。**外側**へ引き上げているときは据え置きが成立せず
再解決が走ります（検証用に `"is-arrayish@0": "^0.3.4"` を足して実測。依存元 `error-ex` の
要求は `^0.2.1` なので、行を外すと `0.3.4` が無効になり `0.2.1` へ落ちました）。
**同じ手順が、対象によって測ったり測らなかったりします。**

`node_modules` を消す理由は、後述の[ローカル確認時の注意](#ローカル確認時の注意)と同じ
「**残っていると pnpm が前回の結果を引き継ぐ**」です。あちらは供給網検証の短絡、
こちらは解決の引きずりで、現れ方だけが違います。

```bash
# 0. 前提: 判定に使う 2 ファイルに未コミットの変更が無いこと（出力が空であること）
#    手順 7 でこの 2 ファイルを HEAD へ戻すため、先に手元の変更をコミットしておく
git status --porcelain -- pnpm-workspace.yaml pnpm-lock.yaml

# 1. overrides の当該行を 1 行だけ消す（エディタで編集）

# 2. lockfile と node_modules を捨てる。bash -c で包むのは意図的（下の注記を参照）
bash -c 'set -euo pipefail
rm -rf pnpm-lock.yaml node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules'

# 3. 捨て残しの検査。1 つでも残っていると pnpm は前回の結果を引き継ぎ、以降が
#    測定にならない。非 0 で止まったら先へ進まず、手順 2 をやり直す
bash -c 'set -euo pipefail
for p in pnpm-lock.yaml node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules; do
  if [ -e "$p" ]; then echo "捨て残し: $p"; exit 1; fi
done
echo "捨て残しなし"'

# 4. 全体を解決し直す
pnpm install --lockfile-only

# 5. 消し忘れ検知: 外した行が lockfile 冒頭の overrides に残っていたら、手順 1 が
#    効いていない（外し損ねか、別の行を消した）。手順 1 へ戻る
grep -n "^  <外した overrides のキー>:" pnpm-lock.yaml   # 何も出ないこと（例: nanoid@3:）

# 6. 作り直した lockfile で、対象メジャーに選ばれた版を見る。メジャーの直後に `\.`
#    を置くのは、別メジャーの行と冒頭の overrides の転記行を除くため
grep -nE "^  <対象パッケージ>@<対象メジャー>\." pnpm-lock.yaml   # 例: nanoid@3\.

# 7. 作業ツリーを戻し、node_modules を入れ直す
git checkout -- pnpm-workspace.yaml pnpm-lock.yaml
pnpm install --frozen-lockfile
```

- 選ばれた版が**下限以上**なら、その行は削除できます（親の要求だけで足ります）
- 選ばれた版が**下限未満**なら、まだ必要です。これは**親の要求範囲が下限より上の版を
  選べない**とき、つまり `overrides` を置いた理由がまだ生きているときに起きます
- **1 件も出ないときは判定できません。** 対象メジャーが依存木にいないということなので、
  行を戻して何が起きたかを確かめてください

**手順 6 のパターンでメジャーまで指定するのは、同名で別メジャーが同居するからです。**
`nanoid` は直接依存の 6.x（`apps/timer-sync`）と推移依存の 3.x が同居しており、
`^  nanoid@[0-9]` は**両方のメジャーの行**を返します（判定中は lockfile 冒頭の
`overrides:` の転記行も混ざります）。**大きいほうのメジャーを読んで
`6.0.1 >= 3.3.18` と判断し、誤って削除する経路**が開きます。`^  nanoid@3\.` なら
対象メジャーの行だけになります。**行数は依存木と判定の途中かどうかで動くので、
ここには書きません**（数えるなら自分の lockfile で数えてください）。

**`pnpm-lock.yaml` が出来ていることは、解き直した証拠になりません。** `node_modules` を
残したまま実行すると、消した lockfile は `node_modules/.pnpm/lock.yaml` から作り直されます
（`pnpm-workspace.yaml` を編集していなければ、実測でコミット済みのものとバイト単位で
同一でした）。ファイルの有無ではなく、手順 3 で確かめてください。

**手順 3 がこの節の検査の本体です。** 手順 2 が効いていない実行（飛ばした・zsh でグロブが
不一致になって不発だった）は、ここで非 0 になって止まります。**それ以外の見分け方は
どれも当てになりません。**

- **「解決が走ったか」では見分けられません。** `pnpm-lock.yaml` だけ消した実行は、解決を
  走らせたうえで凍結された木をそのまま返します（上記 2）
- **`✓ Lockfile passes supply-chain policies` の行の有無でも見分けられません。** 同じ
  lockfile を 2 回目に通すと検証キャッシュに当たり、**この行が出なくなります**（実測。
  [ローカル確認時の注意](#ローカル確認時の注意)と同じキャッシュです）

**手順 2・3 を `bash -c` で包んでいるのは意図的です。** この環境の既定シェル（zsh）は
`apps/*/node_modules` が 1 つも無いとき `no matches found` で止まり、**`rm` を 1 つも
実行しません**（`pnpm-lock.yaml` も残ります）。`--lockfile-only` は `node_modules` を
作らないので、**手順 4 を一度通した直後や新規クローン直後は必ずこの状態です**。実測では
zsh が exit 1 で何も消さず、bash では同じ行が全部消しました。同じ理由で
[検査系](#検査系)のコマンドも `bash -c` で包んでいます。

**捨てる範囲で答えが変わることは実測で確認しています**（2026-08-29・
pnpm 11.5.0 / Node v22.23.2。リポジトリの複製と pnpm のキャッシュを隔離した環境で、
捨てる範囲だけを変えて実行）。`postcss` は `overrides` を置いていないパッケージですが、
**lockfile が指す版（`8.5.25`）と解決器が今選ぶ版がずれている**ため、凍結された木が
どこまで凍結されたままかがそのまま出ます。

| 捨てたもの | 前回の結果 | `postcss` に選ばれた版 |
| --- | --- | --- |
| 何も捨てない（素朴な手順） | **引き継ぐ**（木ごと据え置き） | `8.5.25`（lockfile の版そのまま） |
| `pnpm-lock.yaml` だけ | **引き継ぐ**（`node_modules/.pnpm/lock.yaml` から） | `8.5.25` |
| `pnpm-lock.yaml` と `node_modules` | 引き継がない | **`8.5.26`** |

上 2 行は、生成された `pnpm-lock.yaml` の md5 まで一致しました（`"nanoid@3"` を外した
実行で計測）。**この 2 つは結果で区別できません。**

**上の手順が両側へ分岐することは実測で確認しています**（手順 0〜7 を通しで 2 回）。当時
実在した `"nanoid@3": "^3.3.18"` を外して通すと `nanoid@3.3.18` が選ばれ、下限以上なので
「削除できる」側（この判定にもとづき #199 で削除しました）。検証用に足した `"is-arrayish@0": "^0.3.4"` を外して通すと `0.2.1` が
選ばれ、下限未満なので「まだ必要」側です。**手順 3 は、手順 2 を飛ばした実行と zsh で
手順 2 を実行した実行のどちらでも非 0 で止まり、正しく通した実行では通りました。**

**ただしこの節の版番号は測った日の値で、依存木が動けば変わります。**
**転記した数字を信じず、削除する時点で自分で測り直してください。**
併せて `pnpm audit` が緑であることを確認します。

**残したまま放置すると、将来その範囲を黙って固定し続けます。**

### 信頼証跡の降格拒否

`trustPolicy: no-downgrade` により、**過去により強い信頼証跡（provenance / trusted
publisher / staged publish）を持っていたパッケージが、証跡の弱い版・無い版を出したとき**、
`pnpm install` が拒否します（判断の根拠は
[`docs/adr/0010`](../adr/0010-trust-policy.md)）。

待機期間との違いは**公開日に関係なく効く**ことです。待機期間は「7 日以内に発覚した改ざんを
避ける」防御で、それを過ぎた改ざんは通します。

**判定は公開日だけで行われ、semver の系列を見ません。** 新しい系列が証跡を持ち始めた後に
公開された旧系列の保守版は、必ず降格と判定されます。

#### 違反が出たときの判断手順

`ERR_PNPM_TRUST_DOWNGRADE` が出たら、**除外へ足す前に**偽陽性か本物かを判断します。

```bash
# 1. 当該版の証跡を見る
curl -s https://registry.npmjs.org/<pkg>/<version> \
  | jq '{npmUser: ._npmUser, provenance: (.dist.attestations.provenance != null)}'

# 2. その版より前に公開された版の証跡を見る（公開日の昇順）
curl -s https://registry.npmjs.org/<pkg> | jq -r --arg v "<version>" '
  .time as $t | .versions | to_entries
  | map(select($t[.key] != null and $t[.key] < $t[$v]))
  | sort_by($t[.key])[]
  | "\($t[.key])\t\(.key)\t\(
      if .value._npmUser.approver then "stagedPublish"
      elif (.value._npmUser.trustedPublisher and .value.dist.attestations.provenance) then "trustedPublisher"
      elif .value.dist.attestations.provenance then "provenance"
      else "-" end)"'
```

- **偽陽性**: 当該版が旧系列の保守版で、より新しい系列が先に証跡つきで公開されていた
- **本物を疑う**: 当該版が最新系列の新しい版なのに証跡が消えた → 乗っ取りの可能性

**待機期間の違反で使える「待つ」「全面再解決」はここでは効きません。** 公開日は動かないため、
時間が経っても `pnpm clean --lockfile` を実行しても判定は変わりません。取れる手は
**「除外する」か「依存の版を変える」の 2 つだけ**です。

#### 偽陽性と判断したときの除外

```yaml
# pnpm-workspace.yaml
trustPolicyExclude:
  # semver@6.3.1（2023-07-10T22:38:41Z 公開）は 6.x 系の保守版で証跡を持たない。
  # その公開日より前に 7.5.1〜7.5.4 が provenance 付きで出ているため降格と判定される、
  # 設計上の偽陽性。依存元は @babel/core（eslint-plugin-react-hooks 経由の開発時依存）。
  - "semver@6.3.1"
```

- **必ず「名前@版」で書く。** 名前だけにすると、以後そのパッケージの全版が無検査になります
- **偽陽性と判断した根拠をコメントに残す**（どの版が先に証跡を持っていたか）
- **解除予定日は書きません。** 公開日は動かないので時間では解消しません。ただし
  **その版が依存木から消えたら行を削除してください**（残すと、将来その版が再び現れたときに
  黙って免除を与えます）
- **`trustPolicyIgnoreAfter` は使いません。** `minimumReleaseAge`（7 日）以下の値にすると、
  install しうる版がほぼすべて検査対象から外れ、検証コストだけが残ります（ADR 0010）

#### Renovate の PR が赤くなったとき

Renovate 側に `trustPolicy` に対応する設定はありません。bot は降格を予見できないため、
提案した更新が降格判定に当たれば PR が赤くなります。**これは不具合ではなく信号です。**
上の判断手順を通し、偽陽性なら除外を足して取り込み、そうでなければ更新を見送ってください。
**Renovate の設定でこの赤を消そうとしないでください。**

### ローカル確認時の注意

`node_modules` が最新のとき、pnpm は「Already up to date」で短絡し**供給網検証を
走らせません**。ローカルで違反件数を確認するときは、必ず先に `node_modules` を
消してから `pnpm install --frozen-lockfile` を実行してください。

```bash
bash -c 'set -euo pipefail
rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules'
pnpm install --frozen-lockfile
```

**ここも `bash -c` で包みます。** 理由は[削除の条件](#削除の条件)と同じで、既定シェル
（zsh）では `apps/*/node_modules` が 1 つも無いときに `rm` が 1 つも実行されません。
消したつもりで `node_modules` が残ると、`pnpm install --frozen-lockfile` は
「Already up to date」で短絡し、**確認したかった検証を走らせないまま緑になります**。

**lockfile もポリシー（`pnpm-workspace.yaml` の設定）も変えずに再検証したいときは、
検証キャッシュも消してください。**

```bash
rm -f ~/.cache/pnpm/lockfile-verified.jsonl
```

pnpm は「lockfile のハッシュ＋ポリシー」を鍵に検証結果をキャッシュします。`node_modules` を
消してもこのキャッシュは残るため、鍵が変わっていないと**検証を飛ばして緑になります**。
検証が実際に走ったかどうかは `Verifying lockfile against supply-chain policies` の行が
出ているかで判断してください。

**ただしこの行は `minimumReleaseAge` だけでも出ます。`trustPolicy` が効いていることは、
除外行を一時的に外すと `ERR_PNPM_TRUST_DOWNGRADE` で落ちることで確かめてください。**

CI は毎回フレッシュな checkout なのでこの短絡は起きません。**この罠にかかるのは
ローカルでの確認作業だけです。**

#### 短絡は 2 段ある（2026-09-03・#154 で実測して書き足し）

上の 2 つ（`node_modules` と検証キャッシュ）は**別々の短絡**で、順番があります。
`pnpm install --frozen-lockfile` で実測した結果は次のとおりです。

| 実行 | 所要 | `✓ Lockfile passes supply-chain policies` |
|---|---|---|
| そのまま | 0.5s | 出ない |
| 検証キャッシュ**だけ**を消してから | 0.5s | **出ない**（キャッシュが再生成もされない） |
| `--config.optimistic-repeat-install=false` を付ける | 14.5s | 出る（445 entries） |
| 同じものをもう一度 | 1.5s | 出ない（ここで初めてキャッシュに当たる） |

**「検証キャッシュを消せば再検証される」は誤りです。** 1 段目（`optimisticRepeatInstall`。
既定で有効）は `Already up to date` を出して**検証器を作るより手前で return** するため、
キャッシュを読みも書きもしません。`node_modules` を消す手順が効くのは、
この 1 段目を成立させないからです。

**`node_modules` を消さずに済ませたいときは、1 段目を直接切ってください。**

```bash
# 1 段目だけを切る（2 段目のキャッシュに当たると、それでも行は出ません）
pnpm install --frozen-lockfile --config.optimistic-repeat-install=false

# 2 段とも切る（lockfile もポリシーも変えずに再検証したいとき）
rm -f ~/.cache/pnpm/lockfile-verified.jsonl
pnpm install --frozen-lockfile --config.optimistic-repeat-install=false
```

**この確認は CI では自動で行われます。** `quality` ジョブの install は
`node scripts/install-with-supply-chain-check.mjs` 経由で走り、検証の行が出なければ
落ちます（#154）。`node_modules` を CI キャッシュへ載せる・`--trust-lockfile` が
紛れ込む、といった変更で**CI が緑のまま検証をやめる**経路をここで塞いでいます。

### CI での扱い

CI の `pnpm install --frozen-lockfile` は `--trust-lockfile` を付けません。
lockfile の検証を常に効かせるためです（決定は ADR 0008）。

**`--trust-lockfile` は lockfile 検証を丸ごと飛ばします。** 待機期間
（`minimumReleaseAge`）だけでなく、**降格判定（`trustPolicy`）も同時に無効になります**
（pnpm 11.5.0 は両方を同じ検証段で回すため）。片方だけ残す手段はありません。

**待機期間の違反**が出たときに取れる手は次の 3 つに限られます。「違反したエントリだけを
古い版へ解決し直す」手段は存在しません（検証が解決より先に走るため）。降格判定
（`ERR_PNPM_TRUST_DOWNGRADE`）の場合は上の「信頼証跡の降格拒否」を参照してください。

1. **待つ**: 当該版が公開から 7 日を超えるのを待つ（最も安全）
2. **期限つき除外**: 上記の例外手順を使う
3. **全面再解決**: `pnpm clean --lockfile && pnpm install`（lockfile 全体の diff になるため単独 PR にする）

### Renovate が立てた PR の扱い

`renovate.json` により、Renovate が更新を提案します（minor/patch は PR を自動作成、
major は Dependency Dashboard の Issue に提示。決定は ADR 0008）。

- **自動マージはしません。** 取り込みは人が判断します。CI が緑であることを
  確認してからマージしてください
- Renovate 側の待機期間は pnpm 側（7 日）以上に設定してあります。下回らせると
  bot の PR が pnpm の検証で常に赤くなります
- **降格判定（`ERR_PNPM_TRUST_DOWNGRADE`）で赤くなった場合の扱いは別です。**
  Renovate 側に `trustPolicy` に対応する設定は無く、bot は降格を予見できません。
  上の「信頼証跡の降格拒否」の「Renovate の PR が赤くなったとき」を参照してください
- **Renovate の有効化にはリポジトリ管理者による GitHub App の許可が別途必要です。**
  `renovate.json` をコミットするだけでは動きません

## テスト

単一の pnpm workspace + turbo。ルートで全ツールをまとめて検証できます。

```bash
pnpm test        # 全パッケージのテスト
pnpm typecheck
pnpm lint
pnpm build

# 4 つまとめて回す
pnpm turbo test typecheck lint build

# 単一アプリだけを対象にする
pnpm turbo run build --filter=@tasuki/timer-web
```

**対象パッケージはここに並べません。** `pnpm test` の実体は `turbo run test` で、
turbo は `pnpm-workspace.yaml` の `packages` からパッケージを導出し、
`test` スクリプトを持つものをすべて走らせます。
**パッケージを足せば宣言なしで対象に入るため、この節に追記は要りません。**

**テストの件数も書きません。数えるなら実行してください。**

```bash
pnpm turbo test --dry=text   # 実行せずに対象と走るタスクを一覧する
pnpm turbo test --force      # キャッシュを無効にして実際に走らせる
```

**`--force` を付けない実行で件数を数えてはいけません。** 変更が無いと turbo は
キャッシュから出力を再生し（`>>> FULL TURBO`）、テストを 1 件も走らせないまま
前回の件数をそのまま表示します。

**turbo が最後に出す `Tasks: N successful` の N はパッケージ数ではありません。**
`test` は `dependsOn: ["^build"]` を持つため（`turbo.json`）、依存パッケージの
`build` タスクが同じ数に混ざります。パッケージ数を見たいときは `--dry=text` の
`Running test in N packages` の行を読んでください。

所要時間は実行環境で桁が変わります。実測値は下の[効果](#効果)を参照してください。

### 9p 越しで実行するときは依存の実体を逃がす（任意）

devcontainer を **Windows / WSL のマウント（`/workspaces` など 9p 越しのパス）** で開いている場合、
そのままでは検査が桁違いに遅くなります。テストランナーは大量のファイルを読むため、
9p 越しだと I/O がすべてプロトコル越しの往復になるためです。

**遅さの原因は依存の実体であって、リポジトリのソースではありません。**
読まれるファイルのほとんどは `node_modules` に入った依存の実体で、これは
`pnpm-lock.yaml` から再生成できます。そこで **ソースは 9p 上に置いたまま、
依存の実体だけをコンテナのファイルシステムへ逃がします。**

**この設定は任意（opt-in）です。** 既定では何も変わらないので、9p 越しでない環境と
CI は以下を一切気にする必要がありません。

```bash
# 一度だけ: 逃がし先を作り、ワークスペース直下から symlink を張る
# 逃がし先は「チェックアウトごとに別のディレクトリ」にすること（下記 5 を参照）
mkdir -p ~/.pnpm-virtual/tasuki
ln -s ~/.pnpm-virtual/tasuki .pnpm-virtual

# 既存の node_modules を消してから、フラグ付きで入れ直す
rm -rf node_modules
pnpm install --virtual-store-dir=.pnpm-virtual
```

`.pnpm-virtual` は相対パスなので、symlink を張った人だけ実体がリンク先へ置かれます。

効いたかどうかは、**所要時間ではなく実体の位置で確認してください。**

```bash
readlink .pnpm-virtual                  # 逃がし先が出る
find node_modules -type f | wc -l       # 桁違いに減っていれば実体が移っている
```

#### 落とし穴 5 つ

いずれも実測で確かめたものです。

1. **`pnpm install` は `node_modules` があると置き場所の変更を無視して即終了します。**
   フラグを足しても何も起きません。**必ず `rm -rf node_modules` してから**入れ直します。
2. **掃除した後に素の `pnpm install` を打つと既定へ戻ります。**
   しかも古い `.pnpm-virtual` がそのまま取り残されます（実体が二重に残る）。
   `rm -rf node_modules` の後は必ずフラグを付けてください。
   戻してよい場合は `.pnpm-virtual` も一緒に消します。
3. **`.gitignore` の `.pnpm-virtual` に末尾スラッシュを付けてはいけません。**
   付けるとディレクトリ限定になり、ここで張る **symlink には当たりません**。
4. **このコマンドを `package.json` のスクリプトに包んではいけません。**
   `pnpm run` の中で `pnpm install` を呼ぶと `--virtual-store-dir` が無視され、
   **黙って既定の配置になります**（実測。`"install:9p": "pnpm install --virtual-store-dir=.pnpm-virtual"`
   を作って試したところ、逃がし先 0 ファイル・`node_modules` に全量が入った）。
   シェルから直接打つか、`pnpm run` を挟まないシェルスクリプトから呼んでください
   （`.sh` ファイルから呼ぶ形は実測で動くことを確認済み）。
5. **チェックアウトを複数持つなら、逃がし先もチェックアウトごとに分けてください。**
   同じ逃がし先を 2 つのチェックアウトで共有すると、後から `pnpm install` した側の
   内容で上書きされます。依存が同一のうちは動きますが（実測）、
   ブランチ間で依存が食い違うと壊れます。

#### 効果

| 実行場所 | `pnpm test` の所要 | 測定日 |
|---|---|---|
| 9p マウント上（逃がさない） | **20 分超**（3 回とも） | 2026-08-27 |
| 9p マウント上（**ソースは 9p のまま・実体だけ逃がす**） | **35 秒** | 2026-08-27 |
| コンテナのファイルシステム上（ソースごと移す） | 34 秒 | 2026-08-27 |

いずれも turbo のキャッシュを無効化（`--force`）した実測です。
**ソースごとコンテナへ移しても、実体だけ逃がした場合とほとんど変わりません。**
ソースを 9p に残せば、コンテナを作り直しても作業内容は失われません。
逃がした実体が消えても入れ直せば戻ります。

古い測定として、2026-08-09 の [#84](https://github.com/tomohiroJin/tasuki-tools/issues/84) では
9p 上で 22 分 38 秒・コンテナのファイルシステム上で 28.3 秒でした。当時の結論は
「リポジトリごとコンテナ側へクローンする」でしたが、上の手順により
**ソースを移さずに同じ速度が得られます。**

### 9p 上では大文字小文字が区別されない

9p マウントは大文字小文字を区別しません（`Foo.txt` と `foo.txt` が同一視されます）。
コンテナのファイルシステムと CI は区別します。**つまり import の綴りが実ファイルと
大小で食い違っていても 9p 上では緑になり、CI で落ちます。**
9p 上の緑は CI の緑を保証しません。

## E2E

本番と同一の Caddy 断片・実ビルド成果物・実 sync サーバーをローカルに立ち上げ、
`/`・`/timer/`・`/poker/` の 3 系統が外から見て正しく振る舞うことを確認します。

```bash
pnpm build            # web アプリのビルドが必要（^build として依存）
pnpm e2e              # ローカル環境に立てて全シナリオを実行
pnpm e2e --grep @smoke   # @smoke タグのシナリオだけ実行
```

**`pnpm dev` と同時には実行できません。** Caddy（`18080`）と timer-sync（`8787`）・
poker-sync（`3311`）を実際に起動するため、`pnpm dev` と同じポートを共有します。
`pnpm dev` を止めてから `pnpm e2e` を実行してください。

異常終了（SIGKILL など）で残骸が残った場合は、次回起動時の `preflight` が検出して
落とすので、その指示に従って手動で撤去します（`sudo rm -rf /etc/caddy/tasuki` 等）。

シナリオ・タグの一覧、本番向け実行（`pnpm e2e:prod`）、終了後の確認コマンド、
異常終了時の詳しい復旧手順は [`e2e/README.md`](../../e2e/README.md) を参照してください
（詳細の正本はそちらです。ここでは二重管理しません）。

## 検査系

**すべて CI の `quality` / `docs` ジョブで自動実行されます**（[`docs/adr/0009`](../adr/0009-ci-scope-and-checks.md) D1）。
手元で先に確かめたいときは次を叩きます。

```bash
node scripts/audit-structure.mjs                 # 構造監査（走査対象のずれ・走査 0 件は合否を持つ。ADR-0009 D2 の例外・ADR-0014 決定 7・決定 8）
node scripts/audit-log-hygiene.mjs               # ログ衛生（検査の中身は ADR-0012 D1。走査対象のずれ・走査 0 件が合否を持つ根拠は ADR-0014 決定 7・決定 8）
node scripts/audit-assembly-wiring.mjs           # 組み立ての集約（同期サーバーのエントリが create-sync-server.ts を経由するか。ADR-0004 決定 4）
node scripts/audit-domain-error-shape.mjs        # ドメインエラー型の形（core のエラー型が message フィールドを持たないか。ADR-0016 決定 2 項目 3）
node scripts/audit-domain-side-effects.mjs       # ドメインの副作用（core が Date.now() 等を直接呼ばないか。ADR-0016 決定 2 項目 4）
node scripts/audit-web-sync-boundary.mjs         # web 層の同期境界（画面が同期クライアントを直接 import しないか。ADR-0015 MUST 2）
node scripts/audit-public-surface.mjs            # 公開面（エントリが export * を使っていないか。ADR-0016 決定 2 項目 2）
node scripts/audit-supply-chain-config.mjs       # pnpm 供給網設定の退化（除外の版指定・死んだ除外行・未知のキーと値。ADR-0008 / ADR-0010）
node scripts/mutation-check.mjs                  # 変異検査
node scripts/check-links.mjs                     # リンク検査

# 自己テスト（対象は git から導出。scripts/*.test.mjs 全件）
bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'

# shellcheck（対象は git から導出。グロブ直書きではない）
bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs shell)"; shellcheck -x --source-path=deploy --severity=warning $targets'
```

**下 2 つを `bash -c` で包んでいるのは意図的です。** 対象を変数へ受けて未クォートで
渡す形は bash の単語分割に依存しており、この環境の既定シェル（zsh）では変数が
分割されずファイル名 1 つとして扱われて失敗します。CI は `shell: bash` で
同じ形を走らせています（`set -euo pipefail` により、対象の列挙が非ゼロで
終わればそこで止まります）。

**自己テスト・shellcheck の対象はハードコードではなく `scripts/list-scan-targets.mjs`
（`git ls-files` からの導出）です。** CI（`.github/workflows/ci.yml`）もこの形で
呼び出しています。個別のテストファイル名やグロブを直書きすると、新設したテストや
サブディレクトリに置いたスクリプトが対象から漏れます（#135 経路④・⑬。
決定は [`docs/adr/0014`](../adr/0014-scan-target-integrity.md)）。

**リンク検査の走査対象は「追跡下 ∪（未追跡かつ gitignore 対象外）」です。**
新しく作った文書は `git add` する前でも走査対象に入り、その文書自身が持つ
リンク切れは検出されます。**ただし存在判定（あるパスがリンク先として実在するか
の確認）は追跡下のみのままです。** そのため、新しく作った文書「へ向けた」リンクは、
`git add` するまでは他のファイルからも自分自身からも解決できず、「参照先が
ありません」と出ます（`git add` すれば解消します）。決定は
[`docs/adr/0014`](../adr/0014-scan-target-integrity.md) D4。

**`scripts/audit-supply-chain-config.mjs` は `pnpm install` 済みであることを要求します。**
設定のキーと値は `pnpm config list --json`、除外が指す版の実在は `pnpm why` から取るためです
（`pnpm-workspace.yaml` を手で解析しない。[`docs/adr/0014`](../adr/0014-scan-target-integrity.md) D2）。
`docs` ジョブのように install を走らせない場所からは呼べません。

**供給網ポリシーの検証が実際に走ったことは、CI の install 自体が確かめます。**
`quality` ジョブの install は `node scripts/install-with-supply-chain-check.mjs` 経由で走り、
`✓ Lockfile passes supply-chain policies (N entries in …)` が出なければ落ちます（#154）。
このラッパを手元で直接叩くと、`node_modules` が温まっている限り**落ちるのが正常**です
（下の[ローカル確認時の注意](#ローカル確認時の注意)を参照）。

**依存の脆弱性検査（`pnpm audit`）は上記に含まれません。** CI の独立ジョブ
（`audit`）で自動実行され、high 以上の脆弱性で落ちます（決定は
[`docs/adr/0008`](../adr/0008-dependency-supply-chain.md)）。手動での実行は
確認したいときのみで構いません（`pnpm audit`）。

**変異検査は作業ツリーが汚れていると実行できません。** `mutation-check.mjs` は
対象箇所を意図的に壊して既存テストが赤くなるかを確認する仕組みのため、
コミットされていない変更が残っていると自分の変更なのか検出漏れなのか
区別できず、実行前に working tree のクリーンさを要求します。先にコミットしてから
走らせてください。

**変異検査の対象はパッケージに限りません。`scripts/` 配下の検査本体も対象です**
（#174）。変異ごとのランナーは対象ディレクトリの `package.json` の `scripts.test` から
判定しますが、**`package.json` を持たないディレクトリは `node --test` を既定にします**。
`scripts/` がそれにあたり、以前はここで例外になって検査本体の自己テストだけが
変異検査の外にありました。対象を足すときにディレクトリ名で分岐を増やす必要は
ありません（判定は `scripts/mutation-check.mjs` の `detectRunner`、その自己テストは
`scripts/mutation-check.test.mjs`）。

### 検査スクリプトを新しく足すとき

**末尾の起動判定は共有ヘルパを使ってください**（#197）。

```js
import { isDirectRun } from "./lib/direct-run.mjs";

// …

if (isDirectRun(import.meta.url, process.argv[1])) main();
```

`process.argv[1] === fileURLToPath(import.meta.url)` のような**文字列比較で書いては
いけません**。ESM ローダーは `import.meta.url` を実体パス（symlink 解決後）へ
正規化する一方、`process.argv[1]` は起動時に指定されたパスのまま残ります。
そのため symlink 経由（`node <symlink>`）で起動すると両者が一致せず、`main()` が
一度も呼ばれないまま**標準出力・標準エラーとも空で exit 0** になります。
「検査が何も実行せずに緑で終わる」という、憲法 原則 VII が最も嫌う形です。

このリポジトリは親プロジェクト側から `scripts/` を symlink で参照しうるため、
踏んだ瞬間に**全検査が無警告で空振り**します（#197 の時点では 10 本が該当）。

判定は `scripts/lib/direct-run.mjs` の 1 か所だけに置きます。各スクリプトへ
同じ式を写すと、直すときに片側だけが直ります（実際、#174 で
`scripts/mutation-check.mjs` だけを直したときに残り 10 本が取り残されました）。
`scripts/entry-point-wiring.test.mjs` が、`scripts/` 直下の検査スクリプトを
**git から導出して**、実際に symlink 経由で起動し直接起動と同じ結果になることを
確かめます。新しく足したスクリプトが古い書き方を持ち込めば、そこで落ちます。

### 新しいパッケージを足すと検査が赤くなる

構造監査（`scripts/audit-structure.mjs`）とログ衛生（`scripts/audit-log-hygiene.mjs`）は、
走査対象を `SCANNED_PACKAGES` / `EXCLUDED_PACKAGES` として**宣言**し、実行時に
workspace の実体（`pnpm -r list --depth -1 --json`）と全単射で照合します
（決定は [`docs/adr/0014`](../adr/0014-scan-target-integrity.md)）。したがって、
`packages/` や `apps/` 配下に新しいパッケージを足すと、宣言に足すまで両方の検査が
非ゼロで終了します。

正しい直し方は次のどちらかです。

- **走査対象に入れる**: `SCANNED_PACKAGES` に `{ pkg, src, test, entry }`（構造監査）
  または `pkg`（ログ衛生）を追記する。**`src` / `test` / `entry` に書けるのは
  ディレクトリ名・ファイル名か `null`（そのディレクトリを持たない）だけです。**
  空文字列を書くと「パッケージ直下」を指す形になり、走査対象を静かに 1 つ失うため、
  構造監査が「走査対象の宣言が不正です」で落とします（ADR-0014 決定 9）
- **理由つきで除外する**: `EXCLUDED_PACKAGES` に、なぜ検査しないかの理由とともに追記する
  （例: `packages/ui` は src・tests とも TS を 1 つも持たないため除外）

**「宣言から消す」で赤を消してはいけません。** 落ちているのは検査対象が見つからない
ことそのものであり、対象を宣言から外せば検査は通りますが、そのパッケージは
以後どちらの検査にも一切引っかからなくなります。これは #135 が塞いだ「新設パッケージが
黙って対象外になる」経路を、宣言を削ることで自ら再現する行為です。除外する場合も
必ず理由を書き、`EXCLUDED_PACKAGES` から漏らさないでください。

### ディレクトリを移設・改名すると検査が赤くなる

パッケージ名だけでなく、**宣言から導出される走査ディレクトリの実在**も検査します
（`packages/<pkg>/src` や、構造監査が見る `test` ディレクトリ・エントリポイント）。
`packages/<pkg>/src` を `packages/<pkg>/source` へ改名すると、パッケージ名は workspace に
残っているため全単射照合は通りますが、実在確認が次の形で落とします。

```
[audit-log-hygiene] 走査対象の宣言が実体とずれています
  宣言にあるが実在しない: packages/protocol/src    ← 移設したなら宣言を直す
  現在の走査対象: 8 パッケージ / 118 ファイル
```

直し方は移設に合わせて宣言を直すことです。**走査量の行も一緒に読んでください。**
実在確認を通った対象だけを数えているので、この例の「8 パッケージ」は 1 つ失った
ことを示しています。

この検査が無かったころは、1 パッケージ分の `src` を失っても走査量が減らないまま
（他パッケージ分でファイル数が非ゼロなので 0 件ガードにも掛からず）緑になりました
（Issue #158。決定の根拠は [`docs/adr/0014`](../adr/0014-scan-target-integrity.md) 決定 1・
決定 9）。

**ドメインエラー型を改名・削除しても検査が赤くなります。**
`scripts/audit-domain-error-shape.mjs` は core のドメインエラー型を
`DOMAIN_ERROR_TARGETS` として**ファイル名と型名で宣言**し、宣言した型宣言が実在するか
までを見ます（[`docs/adr/0016`](../adr/0016-core-domain-representation.md) 決定 2 項目 3）。
型を改名したら宣言も直してください。**赤を消すために宣言から消さないこと** — 消した型は
以後どれだけ文言を持たせても検出されません。新しいドメインエラー型を足したときも宣言へ
追記します（WS プロトコルの `ProtocolError` や `ServerMessage` は**対象外**です。
これらは `message` を持つのが正しく、宣言へ入れると誤検出になります）。

**`packages/` 配下へパッケージを足すと、SC-039②③④ の照合先にも入ります。**
構造監査の SC-039②③（生きたモジュールの中の死んだ公開データ・公開記号）は、
照合先を `SCANNED_PACKAGES` のうち `packages/` 層で `src` を持つ宣言から導きます
（[`docs/adr/0014`](../adr/0014-scan-target-integrity.md) 追記・#180）。参照元は層を問わず、
`src` と `entry` を持つ宣言すべての到達可能なファイルです（テストは含めません。FR-090）。
**SC-039④（公開契約に載っているだけの値）の照合先は、同じ宣言の `entry` そのもの**
（＝ `packages/<pkg>/<src>/<entry>`）です。走査量は次の 1 行で名乗ります。

```
[audit-structure] SC-039②③ の走査対象: 照合先 4 パッケージ / 29 ファイル、参照元 9 パッケージ / 191 ファイル、公開契約 4 ファイル
```

宣言から導いた一覧と、実際に組み立てた一覧が食い違うと落ちます。**照合はパッケージ単位と
ファイル単位の両方で行います。** パッケージ単位だけだと、「そのパッケージは残るが特定の
ファイルだけが集合から抜ける」狭め方が素通りするためです（実測で exit 0 でした）。
**`src` を宣言したのに `entry` を書かないと落ちます** — その形は SC-027 の測定対象からも
SC-039 の参照元からも静かに外れるためです（外れても走査量は他パッケージ分で非ゼロのまま
なので、0 件ガードでは捕まりません）。

**`index.ts` に載せる記号には条件があります（SC-039④）。**
値（関数・定数）は、そのパッケージの**外の製品コード**が取り込むものだけを列挙します。
型は、列挙した値の**署名から到達できる**なら、取り込まれていなくても列挙してよい
（[`docs/adr/0016`](../adr/0016-core-domain-representation.md) 追記 2026-09-01・#182）。
**SC-039④ が数えるのは値だけです** — 型が署名から到達できるかの判定には型解決が要り、
検査の素朴さと引き換えになるためです。型の妥当性はレビューが見ます。
判定は `index.ts` の書き方だけで行うので、`export type { … }` かインラインの `type` を
書き忘れた型は値として数えられます（過剰報告＝赤へ倒れます）。

**サブパスから取り込まれている値は、`index.ts` に載せません。**
`@tasuki/timer-core/aggregate` のようなモジュール単位の入口は `index.ts` を通らないため、
**外から使われていても index の列挙が使われた根拠にはなりません**。SC-039④ がサブパスの取り込みを数えないのはこのためで、「代わりの入口が
あるなら列挙しない」に当たります（#220 で `packages/timer-core` の上限値の定数が
これに該当しました。利用側は 1 ファイルも変えずに列挙だけを落としています）。

⚠ **サブパスを新しく使うときは、配線が揃っているかを先に見てください。**
`apps/timer-web` は `vite.config.ts` と `vitest.config.ts` の alias で解決しますが、
**並んでいるのは 8 モジュールだけ**です。一方 `tsconfig.json` の `paths` は
`@tasuki/timer-core/*` のワイルドカードなので、alias の無いモジュールを timer-web から
取り込むと **`pnpm typecheck` は緑のまま、`pnpm build` と `pnpm test` だけが落ちます**。
alias は 2 つの設定へ同時に足してください。`apps/timer-sync`（bun）は tsconfig の
`paths` で解決しますが、**その挙動には未解決の食い違いがあります**（同ファイルの注意書き）。

**SC-039③ と SC-039④ は別のことを測ります。** ③は宣言ファイルの `export` が要るか、
④は公開面に載せる理由があるかです。**どちらも型は数えません**（#223。判定に型解決が要り、
検査の素朴さと引き換えになるため。③は 2026-09-02 まで型を数えており、挙がっていた件数の
大半が「公開契約に載せると決めた型」でした）。`index.ts` から記号を落としても**③の件数は動きません**
（再エクスポートは参照の根拠から外しているため）。逆に、③の例外表
（`SC039C_EXCEPTIONS`）に載っている記号でも、④の判断は別に必要です。

**SC-039③ が新しく記号を検出しても、構造監査は緑（exit 0）のままです。**
測定値は合否を持ちません（[`docs/adr/0009`](../adr/0009-ci-scope-and-checks.md) D2）。
落ちるのは計測器のほう（走査範囲のずれ・0 件・例外表の腐り）だけです。検出された記号を
`SC039C_EXCEPTIONS` へ逃がすのは、**その公開を失うと検査そのものが弱くなるときだけ**に
してください。「まだ決めていない」は理由になりません（例外へ入れた瞬間に指標が 0 へ戻り、
判断すべき対象が見えなくなります）。

**ドメインが環境から値を直読みしたら検査が赤くなります。**
`scripts/audit-domain-side-effects.mjs` は `DOMAIN_PACKAGES` として宣言した core の
`src/` に、`Date.now(` / `Math.random(` / `new Date(` / `performance.now(` / `crypto.` /
`process.env` が字面として現れないことを見ます
（[`docs/adr/0016`](../adr/0016-core-domain-representation.md) 決定 2 項目 4）。
**コメント行も読みます** — 「無いこと」を求める検査は読み飛ばすと緑に倒れるためで、
core の docstring にこれらの語を書くこともできません（「現在時刻」等と書いてください）。
時刻・乱数・環境変数は引数で注入し、読み取りはアダプタ（境界）へ置きます。
**赤を消すために `EXCLUDED_PACKAGES` へ逃がさないこと** — 逃がした対象は以後どれだけ
副作用を持ち込んでも検出されません。宣言を 1 行移すだけで全単射照合も 0 件ガードも
自己テストも素通りし、ドメインの半分が黙って無検査になります（気づく手掛かりは走査量の
出力が「2 パッケージ」から減ることだけです）。
**禁止語彙の正本は同スクリプトの `FORBIDDEN` 配列です。** 上に並べた 6 語も
[`docs/adr/0016`](../adr/0016-core-domain-representation.md) の記載も手書きの写しなので、
7 語目が入ると黙って古くなります。実際に何を見ているかは正本で確かめてください。

**この検査は「足りる」とは言いません。** `globalThis["Date"].now()` のような
計算プロパティや `const D = Date; D.now()` のような別名束縛はすり抜けます。
純粋性を見ているのではなく、字面を見ているだけです。

shellcheck・自己テスト（`node --test`）の対象は宣言ではなく `git ls-files` からの
導出（`scripts/list-scan-targets.mjs`）です。`scripts/` 配下に `*.sh` や `*.test.mjs` を
置けば自動で対象に入るため、こちらは追記の必要がありません。

リンク検査（`scripts/check-links.mjs`）は追跡下の `*.md` を `LIVE_DOCS` と
`DORMANT_DOCS` の宣言へ全分割します。新しいディレクトリに文書を置いたときの扱いは
同スクリプト内のコメントを参照してください。

**現役の規範文書（`LIVE_DOCS`）では、インラインコードに書いたリポジトリ内のパスも
検査します。拡張子の有無は問いません**（#156）。ディレクトリ参照
（`apps/poker-sync/src/adapters`）も、`path:line` 表記の**行番号が対象ファイルの
行数を超えていないか**も見ます。次の 3 つは対象外です。

- グロブ・変数展開・メタ変数を含むもの（`packages/*/src`・`apps/${APP}/dist`・
  `packages/<pkg>/src`）。**任意の名前を表したいときは `<…>` で書いてください**
- `docs/adr/0002` のような **ADR 番号の接頭辞**。ディレクトリではなく
  「その番号で始まる ADR が実在するか」で解決します（番号が飛べば赤になります）
- 例外表（`MISSING_PATH_EXCEPTIONS` / `STALE_LINE_REF_EXCEPTIONS`）に理由つきで
  登録したもの。**一度も赤を抑えなかったエントリは検査が落とします**

相対リンクの側では、ネストした角括弧（`[![alt](img.png)](link.md)`）の外側と、
題名つきリンク（`[a](./a.md "title")`）も検査対象です。

## CI

`.github/workflows/ci.yml` は次のジョブを持ちます。

| ジョブ | 中身 | 走らせる条件 |
|---|---|---|
| `ci` | typecheck / lint / test / build | コードに関わる変更（`*.md` 以外が 1 つでもある） |
| `quality` | [検査系](#検査系)の全項目 | 同上 |
| `docs` | リンク検査 | **常時** |
| `audit` | `pnpm audit` | 依存の変更（`pnpm-lock.yaml` / `pnpm-workspace.yaml` / `package.json`） |
| `e2e` | E2E | コードに関わる変更 |

**`docs` 行は列挙のままにしています。** `docs` ジョブが走らせるのはリンク検査 1 本だけで、
「検査系」節には `quality` が走らせないもの（リンク検査自身を含む）も並んでいます。
`docs` 行を `quality` と同じ形へ倒すと実態より広い範囲を指してしまい、かえって誤りに
なるためです（#175）。

判定は `scripts/ci-scope.mjs` が行い、`$GITHUB_OUTPUT` へ `code` と `deps` を書きます。
**判定できないときは全部走らせます（fail-open）。**

### 必須チェックが永久待ちにならない理由

絞り込みは **(a) 常にジョブを起動し、ステップ単位の `if:` で早期成功させる形**を採っています。
`on.push.paths` でジョブ自体を起動させない (b) の形は採りません。

(b) を採ると、そのチェックを必須（required status check）に指定した瞬間、対象外のパスしか
触らない PR が「チェック待ち」で永久にマージできなくなります。GitHub がスキップされた
ワークフローを「成功」ではなく「未報告」として扱うためです。

(a) ではジョブが常に `success` を報告するので、この事故が原理的に起きません。
決定の記録は [`docs/adr/0009`](../adr/0009-ci-scope-and-checks.md) の D4 にあります。

## 関連

- 書き分けの規則: [`docs/adr/0002`](../adr/0002-document-system-three-layers.md)（文書体系の三層構造）
- E2E の詳細（シナリオ・タグ・復旧手順）: [`e2e/README.md`](../../e2e/README.md)
- 本番 Caddy 設定の検証手順: [`deploy/caddy/README.md`](../../deploy/caddy/README.md)
