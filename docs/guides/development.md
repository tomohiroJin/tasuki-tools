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
  # nanoid@3 は GHSA-2v37-7h3g-55p8（high・<3.3.18 が対象）を踏む。
  # 依存元は postcss で、postcss 8.5.26 の要求が `^3.3.17` のため上げても解消しない。
  "nanoid@3": "^3.3.18"
```

#### 使う前に確かめること

**まず親を更新して解消するかを実際に試します。** 解消するならそちらが本筋で、
`overrides` は要りません。

```bash
pnpm update -r <親パッケージ> --lockfile-only
grep -n "<対象パッケージ>" pnpm-lock.yaml   # 版が上がったか
git checkout -- .                            # 確認だけなら戻す
```

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

```bash
# overrides の当該行を外してから
pnpm install --lockfile-only
grep -n "<対象パッケージ>" pnpm-lock.yaml
```

lockfile の版が下限以上に留まる（＝親の要求だけで足りる）なら、その行は削除できます。
版が下がるなら、まだ必要です。**残したまま放置すると、将来その範囲を黙って固定し続けます。**

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
rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules
pnpm install --frozen-lockfile
```

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

`pnpm test` は turbo 経由で 10 パッケージ（`@tasuki/timer-core` `@tasuki/timer-web`
`@tasuki/timer-sync` `@tasuki/poker-core` `@tasuki/poker-web` `@tasuki/poker-sync`
`@tasuki/landing` `@tasuki/protocol` `@tasuki/ui` `@tasuki/e2e`）のテストを実行し、
2026-08-10 時点で**全 1,970 件**が緑になります（コンテナのファイルシステム上・
コールド実行で約 30 秒）。

### 9p 越しでは実行しない

devcontainer を **Windows / WSL のマウント（`/workspaces` など 9p 越しのパス）** で開いている場合、
リポジトリをコンテナ側のファイルシステム（`/home/vscode` 配下など）へクローンし、**そちらで検査を回してください。**
テストランナーは大量のファイルを読むため、9p 越しだと I/O がすべてプロトコル越しになり桁違いに遅くなります。

| 実行場所 | キャッシュ | `pnpm test` の所要 |
|---|---|---|
| 9p マウント上 | 10 件中 1 件ヒット | **22 分 38 秒** |
| コンテナのファイルシステム上 | **0 件ヒット（`--force`）** | **28.3 秒** |

いずれも 2026-08-09 の実測（[#84](https://github.com/tomohiroJin/tasuki-tools/issues/84)）。
**キャッシュが冷たい側が約 48 倍速い**ので、差はキャッシュではなくファイルシステムに由来します。
参考までに CI（GitHub Actions）の `ci` ジョブは 2 分 5 秒で、こちらも毎回コールドです
（ワークフローは turbo のキャッシュを永続化していません）。

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
node scripts/audit-log-hygiene.mjs               # ログ衛生（走査対象のずれ・走査 0 件は合否を持つ。ADR-0012 D1）
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

**依存の脆弱性検査（`pnpm audit`）は上記に含まれません。** CI の独立ジョブ
（`audit`）で自動実行され、high 以上の脆弱性で落ちます（決定は
[`docs/adr/0008`](../adr/0008-dependency-supply-chain.md)）。手動での実行は
確認したいときのみで構いません（`pnpm audit`）。

**変異検査は作業ツリーが汚れていると実行できません。** `mutation-check.mjs` は
対象箇所を意図的に壊して既存テストが赤くなるかを確認する仕組みのため、
コミットされていない変更が残っていると自分の変更なのか検出漏れなのか
区別できず、実行前に working tree のクリーンさを要求します。先にコミットしてから
走らせてください。

### 新しいパッケージを足すと検査が赤くなる

構造監査（`scripts/audit-structure.mjs`）とログ衛生（`scripts/audit-log-hygiene.mjs`）は、
走査対象を `SCANNED_PACKAGES` / `EXCLUDED_PACKAGES` として**宣言**し、実行時に
workspace の実体（`pnpm -r list --depth -1 --json`）と全単射で照合します
（決定は [`docs/adr/0014`](../adr/0014-scan-target-integrity.md)）。したがって、
`packages/` や `apps/` 配下に新しいパッケージを足すと、宣言に足すまで両方の検査が
非ゼロで終了します。

正しい直し方は次のどちらかです。

- **走査対象に入れる**: `SCANNED_PACKAGES` に `{ pkg, src, test, entry }`（構造監査）
  または `pkg`（ログ衛生）を追記する
- **理由つきで除外する**: `EXCLUDED_PACKAGES` に、なぜ検査しないかの理由とともに追記する
  （例: `packages/ui` は src・tests とも TS を 1 つも持たないため除外）

**「宣言から消す」で赤を消してはいけません。** 落ちているのは検査対象が見つからない
ことそのものであり、対象を宣言から外せば検査は通りますが、そのパッケージは
以後どちらの検査にも一切引っかからなくなります。これは #135 が塞いだ「新設パッケージが
黙って対象外になる」経路を、宣言を削ることで自ら再現する行為です。除外する場合も
必ず理由を書き、`EXCLUDED_PACKAGES` から漏らさないでください。

shellcheck・自己テスト（`node --test`）の対象は宣言ではなく `git ls-files` からの
導出（`scripts/list-scan-targets.mjs`）です。`scripts/` 配下に `*.sh` や `*.test.mjs` を
置けば自動で対象に入るため、こちらは追記の必要がありません。

リンク検査（`scripts/check-links.mjs`）は追跡下の `*.md` を `LIVE_DOCS` と
`DORMANT_DOCS` の宣言へ全分割します。新しいディレクトリに文書を置いたときの扱いは
同スクリプト内のコメントを参照してください。

## CI

`.github/workflows/ci.yml` は 5 つのジョブを持ちます。

| ジョブ | 中身 | 走らせる条件 |
|---|---|---|
| `ci` | typecheck / lint / test / build | コードに関わる変更（`*.md` 以外が 1 つでもある） |
| `quality` | 構造監査・ログ衛生・自己テスト・変異検査・shellcheck | 同上 |
| `docs` | リンク検査 | **常時** |
| `audit` | `pnpm audit` | 依存の変更（`pnpm-lock.yaml` / `pnpm-workspace.yaml` / `package.json`） |
| `e2e` | E2E | コードに関わる変更 |

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
