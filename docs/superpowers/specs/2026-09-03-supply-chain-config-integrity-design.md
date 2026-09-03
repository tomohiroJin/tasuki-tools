# pnpm 供給網設定の退化を検出する（#154）— 設計正本

- **Issue**: [#154](https://github.com/tomohiroJin/tasuki-tools/issues/154)
- **日付**: 2026-09-03
- **前提となる規範**: [`docs/adr/0008`](../../adr/0008-dependency-supply-chain.md)（待機期間・overrides）/
  [`docs/adr/0010`](../../adr/0010-trust-policy.md)（信頼証跡の降格拒否。決定 D7 が本件を割り当てていた）/
  [`docs/adr/0014`](../../adr/0014-scan-target-integrity.md)（走査対象の健全性。特に **D2「実体の権威はツール自身」**・
  決定 6「走査量を必ず出す」・決定 8「0 件ガード」）/ 憲法 原則 VII（検査は壊して確かめる）
- **この文書の位置づけ**: **実測値・決定の正本はこの文書**。Issue 本文・PR へ表を転記せず、ここを参照する。

## 1. 範囲

[#135 の設計正本](2026-08-16-scan-target-integrity-design.md) §1 が「別 Issue（B群）」として
切り出した 4 経路（⑤⑥⑦⑫）を扱う。

| 経路 | 内容 | 出典 |
|---|---|---|
| ⑤ | `trustPolicyExclude` の版指定が「名前だけ」へ退化すると全版が無検査になる | #116 |
| ⑥ | 除外した版が依存木から消えても行が残り、将来その版を黙って免除する | #116 |
| ⑦ | `pnpm-workspace.yaml` のキー名・値の綴り誤りで検査が無警告で消える | #116 |
| ⑫ | 供給網ポリシーの検証が短絡して走らないまま緑になる | #126 |

### 本 Issue で扱わないもの

| 対象 | 理由 | 行き先 |
|---|---|---|
| 露出した既存違反の是正 | 現時点で違反は 0 件。是正対象が無い | — |
| `minimumReleaseAge` の値の引き上げ（14 日・30 日） | ADR 0008「影響」が別 Issue と決めている | 別 Issue |
| Renovate 側の待機期間との突合 | bot 設定はこのリポジトリの検査対象外 | — |

## 2. Issue #154 本文との差異

**本文の実測は 2026-08-16 のもので、3 点が現在と食い違う。**

| Issue 本文の記述 | 実測（2026-09-03・main `06c9b40`・pnpm 11.5.0） |
|---|---|
| `overrides` は **1 件**（`"nanoid@3": "^3.3.18"`）。⑤ と同型の退化面が 1 つ増えている | **0 件。キーごと存在しない**（#199 / 2026-08-30 で削除済み）。E1 の `overrides` 半分は**現時点で対象が空**の検査になる |
| ⑫ の機序は `~/.cache/pnpm/lockfile-verified.jsonl` の**キャッシュ**。鍵が変わらないと飛ぶ | **短絡は 2 段あり、キャッシュは 2 段目**。1 段目の `optimisticRepeatInstall` はキャッシュの読み書きより手前で return する（§3.2） |
| （記載なし） | **CI では検証が現に走っている**。ただし**走ったことを確かめている主体がいない**（§3.3） |

`minimumReleaseAgeExclude` がキーごと存在しないこと・`trustPolicyExclude` が
`"semver@6.3.1"` の 1 件であること・`packageManager` が `pnpm@11.5.0` であることは本文どおりだった。

## 3. 実測した事実（2026-09-03・main `06c9b40`）

### 3.1 ⑤ が黙って通る形は「版がまったく無い形」だけ

pnpm 11.5.0 の `parseVersionPolicyRule` は、エントリに `@` が無ければ
`{ packageName, exactVersions: [] }` を返す。`evaluateVersionPolicy` は
`exactVersions.length === 0` のとき `true`（＝そのパッケージの全版を免除）を返し、
`failIfTrustDowngraded` はその `true` で早期 return する。警告は出ない。

一方、**版が不完全な形は pnpm 自身が落とす**。`"semver@6.3"` で実測:

```
[ERR_PNPM_INVALID_TRUST_POLICY_EXCLUDE] Invalid value in trustPolicyExclude:
Invalid versions union. Found: "semver@6.3". Use exact versions only.
```

`parseExactVersionsUnion` が `semver.valid()` で厳密版だけを受け、それ以外は
`createExcludePolicy` が `PnpmError` に包んで投げるためである。
また名前に `*` を含む形は、版と併記した場合のみ `NAME_PATTERN_IN_VERSION_UNION` で落ちる
（`"*"` 単独は「全パッケージの全版を免除」として黙って通る）。

**したがって検査が塞ぐべきは「版を持たないエントリ」だけで足りる。**
版の妥当性を自前で検証すると、pnpm が既に落とす形を二重に判定することになり、
semver の前段解釈を自作再実装する（偽陽性の面が増える）。

### 3.2 ⑫ の短絡は 2 段ある。キャッシュは 2 段目

`corepack pnpm install --frozen-lockfile --virtual-store-dir=.pnpm-virtual` で実測:

| 実行 | 所要 | `✓ Lockfile passes supply-chain policies` | キャッシュへの書き込み |
|---|---|---|---|
| そのまま | 0.5s | **出ない** | 無し |
| `~/.cache/pnpm/lockfile-verified.jsonl` を削除してから同じ実行 | 0.5s | **出ない** | **無し（ファイルが再生成されない）** |
| `--config.optimistic-repeat-install=false` を付ける | 14.5s | `(445 entries in 14.5s)` | 1 件 |
| 同じものをもう一度 | 1.5s | 出ない | 既存 1 件のまま |

1 段目は `installDeps` の先頭にある。`optimisticRepeatInstall`（既定 **true**）が有効で
更新系のフラグが無いとき、`checkDepsStatus` が最新と判定した時点で `Already up to date` を
出して **return** する。これはストア生成（`createStoreController`）より手前で、
検証器（`resolutionVerifiers`）が作られる前なので、**キャッシュを消しても走らない**。

2 段目が Issue 本文の言う検証キャッシュで、`verifyLockfileResolutions` の中にある。

**「キャッシュを消せば再検証される」は誤り**であり、`docs/guides/development.md` と
既存の記録はこの点を書き換える。手元で強制するには
`--config.optimistic-repeat-install=false` が要る（キャッシュが残っていれば併せて消す）。

### 3.3 CI では検証が走っている。ただし誰も確かめていない

main の run [33697032958](https://github.com/tomohiroJin/tasuki-tools/actions/runs/33697032958) のログに
`✓ Lockfile passes supply-chain policies (445 entries in …)` が **ci / quality / e2e の 3 ジョブ**で出ている。
新規チェックアウトでは `node_modules` が無く `checkDepsStatus` が最新と判定しないため、
1 段目の短絡が成立しないからである。

**問題は、その行が出たことを検査している主体がいないことである。** 次のいずれでも
CI は緑のまま検証をやめる:

- `node_modules` を CI キャッシュへ載せる（1 段目が成立する）
- `--trust-lockfile` が紛れ込む（ADR 0008 の MUST NOT だが、機械検査は無い）
- pnpm 側の既定が変わる

### 3.4 設定のキー集合は pnpm 自身から導出できる

`pnpm config list --json` は **未知のキーも未知の値もそのまま出力する**。
`thisKeyDoesNotExist: 42` と `trustPolicy: no-downgrad` を置いた対照で確認した。

リポジトリ直下と、**同じ `packageManager` を書いた素のディレクトリ**の 2 か所で走らせ、
「リポジトリ側にしか無いキー」「値が違うキー」を取ると、実測で
`allowBuilds, minimumReleaseAge, packages, trustPolicy, trustPolicyExclude` の
**5 件ちょうど**が得られた。これは `pnpm-workspace.yaml` の中身と一致する。

素のディレクトリ側に出るのは `@jsr:registry` / `json` / `registry` / `userAgent` の 4 件で、
`packageManager` を写さないと `userAgent` に pnpm の版が載って差分に紛れる。

### 3.5 除外が指す版の実在も pnpm 自身から取れる

`pnpm why semver -r --json` はトップレベルに
`{ name, version, path, dependents }` の配列を返す（実測で `semver@6.3.1` と `semver@7.8.5` の 2 件）。
依存木に無い名前では `[]` を返す。

### 3.6 `scripts/` は変異検査で守れる

`mutation-check.mjs` の対応表は既に `pkg: "scripts"` を 2 件持つ（id 14・15）。
#135 の設計正本 §7 が申し送った「`detectRunner` が `package.json` 依存」という制約は
**解消済み**である。本 Issue の検査も変異検査で守れる。

## 4. 決定

### D1: 権威は pnpm 自身。設定ファイルを手で解析しない

ADR-0014 D2 は **`pnpm-workspace.yaml` を手で解析してはならない（MUST NOT）** と定める。
本検査もこれに従い、次の 3 つを権威にする。

| 見たいこと | 権威 |
|---|---|
| `pnpm-workspace.yaml` が持ち込むキーと値 | `pnpm config list --json` の 2 か所差分（§3.4） |
| 除外が指す版が依存木にあるか | `pnpm why <名前> -r --json`（§3.5） |
| 供給網ポリシーの検証が走ったか | `pnpm install` の出力に現れる `✓ …passes supply-chain policies (N entries` の行 |

**副産物**: 2 か所差分は「`pnpm-workspace.yaml` 以外の場所（`.npmrc` 等）から供給網設定が
入る」経路も未知キーとして捉える。ADR 0008 の「設定の置き場は `pnpm-workspace.yaml` の
1 箇所のみ」という MUST に、初めて機械検査が付く。

### D2: キーは presence（必須・任意・禁止）で宣言し、両方向で照合する

`diffTargets` と同じ「宣言と実体の全単射」に倒すが、**除外リストは空になるのが正しい状態**
なので、単純な全単射にはできない。`trustPolicyExclude` を必須にすると、最後の除外が
不要になって行ごと消したときに赤くなる（#126 が `minimumReleaseAgeExclude` で、
#199 が `overrides` で実際に通った道である）。

| presence | キー | 根拠 |
|---|---|---|
| **必須** | `packages` / `allowBuilds` / `minimumReleaseAge` / `trustPolicy` | 消えると防御が消える。`allowBuilds` は ADR 0008 が現状維持を MUST としている |
| **任意** | `trustPolicyExclude` / `minimumReleaseAgeExclude` / `overrides` | 空・不在が正しい状態でありうる。**あれば書式を検査する** |
| **禁止** | `trustPolicyIgnoreAfter` | 経過時間で降格検査を無効化する鍵。ADR 0010 の決定を時間で空文化する |

宣言に無いキーはすべて未知として落とす（⑦）。**禁止キーは「未知」と別に名指しする** —
未知として落とすだけでは「知らない鍵が増えた」としか読めず、なぜ駄目かが伝わらない。

### D3: 版の妥当性は pnpm に任せ、検査は「版を持たないこと」だけを見る

§3.1 のとおり。**検査が semver を解釈しない。** 例外は名前に含まれる `*` で、
これは版を持たない形と同じく「意図より広い免除」なので同じ問題として落とす。

### D4: 死んだ除外は「依存木に無い」で判定する。lockfile を読まない

`pnpm-lock.yaml` の `packages:` 節を読めば同じ判定はできるが、生成物の字句解析を
自作することになり D1 に反する。`pnpm why` を使う（§3.5）。

**制約**: `pnpm why` と `pnpm config list` は `pnpm install` 済みを要求する。したがって
この検査は `docs` ジョブからは呼べない（ADR-0014 D2 が `check-links` に課したのと同じ制約）。

### D5: ⑫ は CI が実際に走らせる install を包んで判定する

検査スクリプトが自前で `--config.optimistic-repeat-install=false` 付きの install を
走らせる形も採れるが、それが確かめるのは**合成した経路**であって、CI が現に通る経路ではない。
`node_modules` を CI キャッシュへ載せた瞬間に「合成側は緑・実経路は無検証」になる。

**CI の install そのものを薄いラッパで包み、`✓ …passes supply-chain policies (N entries` が
出なければ落とす。** 追加の install は走らせないので CI 時間はほぼ増えない。

**包むのは `quality` ジョブ 1 つだけにする。** 4 ジョブすべてを包むと同じ判定が 4 重になり、
壊れたときにどれが本体か分からなくなる。1 回の CI につき 1 つの目撃者があれば足りる。

### D6: ラッパの名前を `audit-` で始めない

`scripts/scan-target-wiring.test.mjs` は `git ls-files 'scripts/audit-*.mjs'` から導出して
**すべての `audit-*.mjs` を複製して実行する**（走査量を名乗ることを確かめるため）。
ラッパを `audit-` で始めると、自己テストのたびに実インストールが走る。

## 5. 設計

### 5.1 `scripts/audit-supply-chain-config.mjs`（⑤⑥⑦）

```
main()
  ├ deriveWorkspaceSettings(repoRoot)        # pnpm config list --json ×2（§3.4）
  ├ checkKeyMembership(keys, SETTINGS)       # 未知・必須欠落・禁止（純粋関数）
  ├ checkValues(config, SETTINGS)            # 値の妥当性（純粋関数）
  ├ checkExclusionFormat(entries)            # ⑤（純粋関数）
  ├ checkOverrideFormat(overrides)           # ADR 0008 の書式（純粋関数）
  └ findDeadExclusions(entries, resolver)    # ⑥（純粋関数。解決は注入）
```

判定はすべて純粋関数、I/O と `process.exit` は `main()` に置く（既存の検査と同じ設計方針）。
走査量 `[audit-supply-chain-config] 走査対象: 設定キー N 件 / 除外 M 件 / overrides P 件` を
成否によらず必ず出す（ADR-0014 決定 6）。

**0 件ガードの対象は「設定キー」だけにする**（決定 8）。除外と overrides は
0 件が正しい状態でありうるため、ここに 0 件ガードを掛けると D2 と矛盾する。

### 5.2 `scripts/install-with-supply-chain-check.mjs`（⑫）

`pnpm install --frozen-lockfile` を子プロセスで起動し、出力をそのまま流しながら
`Lockfile … passes supply-chain policies (N entries in …` を探す。

| 状況 | 終了コード |
|---|---|
| install 自体が失敗 | 子プロセスの終了コードをそのまま返す（install の失敗を検証の失敗にすり替えない） |
| install は成功したが検証の行が無い | 1（2 段の短絡を名指しして説明する） |
| 行はあるが件数が 0 | 1 |
| 行があり件数が 1 以上 | 0 |

**`--config.optimistic-repeat-install=false` を内部で付けない。** 付けると
D5 の「実経路を判定する」が崩れる。手元で `node_modules` が温まった状態で走らせると
落ちるが、それは「検証が走っていない」という正しい報告である。

### 5.3 CI からの結線

`quality` ジョブのみ:

```yaml
- run: node scripts/install-with-supply-chain-check.mjs   # 既存の pnpm install を置き換える
- run: node scripts/audit-supply-chain-config.mjs         # 他の audit と並べる
```

`ci` / `audit` / `e2e` ジョブの install は素のまま。

## 6. 検証

### 6.1 EARS（Issue #154 の完了条件に対応）

- **E1** WHEN `trustPolicyExclude` / `minimumReleaseAgeExclude` のエントリが版を持たない、
  または `overrides` のキー・値が ADR 0008 の書式でない、THE 検査 SHALL 非ゼロで終了し、当該エントリを名指しする。
- **E2** WHEN 除外エントリが指す版が依存木に存在しない、THE 検査 SHALL 非ゼロで終了し、死んだエントリを名指しする。
- **E3** WHEN `pnpm-workspace.yaml` に未知のキー・禁止キー・必須キーの欠落、
  または既知キーの不正な値がある、THE 検査 SHALL 非ゼロで終了し、当該キー・値を名指しする。
- **E4** WHEN CI の `pnpm install` で供給網ポリシーの検証が走らなかった、THE 検査 SHALL 非ゼロで終了する。
- **E5** WHEN 上記いずれかの検査を壊す、THE CI SHALL 赤くなる（憲法 原則 VII の破壊検証で確認する）。

### 6.2 破壊検証の手順

**壊す前に必ずコミットする**（#135 で `git checkout -- <file>` が未コミットの実装ごと消した）。
各項目で**対照実行（壊さずに緑になること）を先に取る**。

| # | 壊し方 | 期待 |
|---|---|---|
| 1 | `pnpm-workspace.yaml` の `trustPolicyExclude` を `"semver"` へ退化させる | E1 で赤 |
| 2 | `trustPolicyExclude` を依存木に無い版（`"semver@6.0.0"`）にする | E2 で赤 |
| 3 | `trustPolicy` を `no-downgrad` にする | E3 で赤 |
| 4 | 未知キー `thisKeyDoesNotExist: 42` を足す | E3 で赤 |
| 5 | `trustPolicyIgnoreAfter: 1` を足す | E3（禁止キー）で赤 |
| 6 | `overrides` に `"nanoid": "^3.3.18"`（名前だけ）を足す | E1 で赤 |
| 7 | ラッパに検証済みの出力を食わせず、短絡した出力を食わせる | E4 で赤 |

### 6.3 変異検査

`scripts/mutations/` へ 2 件足す。どちらも `pkg: "scripts"`（§3.6）。

| 変異 | 期待して落ちるテスト |
|---|---|
| 除外の書式検査（版を持たないエントリの検出）を削る | `audit-supply-chain-config.test.mjs` |
| 検証済みの行を探す判定を「常に見つかった」にする | `install-with-supply-chain-check.test.mjs` |

### 6.4 単体テスト

`scripts/audit-supply-chain-config.test.mjs` と
`scripts/install-with-supply-chain-check.test.mjs`。どちらも `node --test` で、
`scripts/list-scan-targets.mjs script-tests` が `scripts/*.test.mjs` から**導出**するので
登録作業は要らない（#135 経路⑬の対策がそのまま効く）。

`scripts/scan-target-wiring.test.mjs` には配線テストを足す（対照実行つき）。

## 7. 残るリスクと申し送り

| 項目 | 内容 |
|---|---|
| `"*"` 単独の除外 | 版を持たない形として落ちるが、`*` を含む名前パターン全般を禁じてはいない |
| 目撃者は 1 ジョブ | `quality` を消すと E4 の判定も消える。ジョブの存在自体は検査していない |
| `overrides` と `minimumReleaseAgeExclude` は現在空 | 書式検査は走るが、守る対象がまだ無い |
| pnpm の出力文言への依存 | `passes supply-chain policies` の文言が変われば E4 は偽陰性ではなく**赤**になる（安全側） |
| `pnpm why` の所要 | 除外 1 件あたり 1 回。エントリが増えれば線形に伸びる |

## 8. 成果物

| 種別 | 対象 |
|---|---|
| 新規 | `scripts/audit-supply-chain-config.mjs` / `scripts/audit-supply-chain-config.test.mjs` / `scripts/install-with-supply-chain-check.mjs` / `scripts/install-with-supply-chain-check.test.mjs` |
| 変更 | `.github/workflows/ci.yml` / `scripts/scan-target-wiring.test.mjs` / `scripts/mutation-check.mjs` |
| 追加 | `scripts/mutations/` へ 2 件 |
| 追記 | `docs/adr/0008`（末尾へ）/ `docs/adr/0010`（末尾へ）/ `docs/guides/development.md`（⑫ の訂正） |
| 振り返り | `docs/retrospectives/2026-09-03-issue-154-supply-chain-config-integrity.md` |

**PR は 1 本**（ADR 0013 の既定「1 Issue = 1 PR」）。
