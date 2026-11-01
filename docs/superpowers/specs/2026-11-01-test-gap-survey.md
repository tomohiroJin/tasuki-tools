# いまのテストが守れていない穴を測る（#496）— 調査の記録

- **Issue**: [#496](https://github.com/tomohiroJin/tasuki-tools/issues/496)（親 [#495](https://github.com/tomohiroJin/tasuki-tools/issues/495)）
- **日付**: 2026-11-01

**実測時点**: main `177ee0e`（手書きの変異 494 件・テストファイル 571 本）

**前提となる規範**: [`docs/constitution.md`](../../constitution.md) 原則 II（技術選定は ADR を通す）/
IV（境界の型安全）/ VII（検査は壊して確かめる）/ X（抽象は実需で）/ XI（秘密と個人情報を持ち込まない）

**前提となる ADR**: [`docs/adr/0006`](../../adr/0006-test-conventions.md)（テスト規約）/
[`docs/adr/0029`](../../adr/0029-mutation-shards-in-ci.md)（変異検査の分け方）/
[`docs/adr/0030`](../../adr/0030-ai-driven-development-operations.md) 決定 4（測れなかったものは理由を書く）

**この文書の位置づけ**: #496 の測定結果の正本。Issue・PR へ表を転記せず、ここを参照する。
**この調査ではテスト・検査・依存を足していない。** 測るための道具（Stryker）は依存に足さず、作業用の一時ディレクトリに入れて
使い捨ての作業ツリーで流した。測るための小さなスクリプトは、測り直せるように
[`2026-11-01-test-gap-survey/`](./2026-11-01-test-gap-survey/README.md) に残した（検査ではない。CI にもつながない）。

## 0. まとめ

| 測ったもの | 結果 | 次の手 |
|---|---|---|
| 変異の密度 | 手書きの変異 494 件。ソースファイル 446 本のうち変異が当たるのは 149 本（33%）。**処理を持つのに変異が 1 つも無いファイルは 233 本**。`packages/protocol`・`packages/dev-hub-redirect`・`packages/sync-client` は宣言 0 件、`packages/rate-limit` は 1 件で `token-bucket.ts` に変異が無い | 自動の変異の結果と重ねて、rate-limit から手を入れる |
| 自動の変異の生存率 | core 9 パッケージで 4,452 件、生存と未到達 478 件（生存率 0〜23.3%）。tasuki-sync の境界 3 ファイルは 127 件中 6 件（4.7%）。**生き残りのうち振る舞いが変わるものは、上限・下限ちょうどの値と、既定値（1・0）でしか試していない演算に集まる**。拾った 100 件を製品のテストでも流すと、83 件は製品でも生き残り、15 件は tasuki-sync が落とした | 境界値の性質テスト・rate-limit の補強。自動の変異は CI の合否でなく定期の調査として ADR を通す |
| 順番依存と不安定さ | ランダムな順 3 回・同じ順 3 回 × 23 パッケージ（138 回・21 分）。**順番で落ちるのは timer-web の 1 件だけ**（[#499](https://github.com/tomohiroJin/tasuki-tools/issues/499)）。同じ順で揺れたテストは 0 件。E2E の `--repeat-each` は流せなかった | #499 で直す。ランダムな順は全件の段へ |
| 規約の守られ方 | `.only` 0・`.todo` 0・`.skip` 系 2（どちらも環境の条件つきの `skipIf`）。検証の無いテストは素朴に数えると 20 件だが、**1 件は数え違いで、残る 19 件はすべて補助関数・待ちの関数・型注釈が検証を持つ**。Given/When の区切りは SC032 で 65.9% | `.only` を止める検査は安いので入れる。検証の無いテストの検査は割に合わない |
| 境界の入力 | 本番と同じ入口で起こしたサーバーへ、7 つの受け口 × 494 通りの壊れた入力を手で投げた（91 秒）。**落ちる・例外が漏れる・ログに値が出る経路は 0 件** | ファジングの道具は今は入れない |

## 1. 変異の密度

### 1.1 測り方

宣言の表 `scripts/lib/mutation-declarations.mjs` の `MUTATIONS` と、各宣言のパッチ（`scripts/mutations/*.patch`）の
`+++ b/<path>` 行から、変異が当たるファイルを導いた（手で数えていない）。分母は各パッケージの `src/` の下の
`.ts` / `.tsx` / `.mjs`（テスト・`.d.ts`・設定を除く）。

- 所要: 0.07 秒（node でパッチを読むだけ）
- 「宣言の数」は `pkg` で数え、「パッチが当たる数」はパッチの対象ファイルで数える。両者がずれるのは、
  別のパッケージの宣言が利用側のテストで見ている場合（例: `packages/sync-client` は宣言 0 件だが、
  `apps/*-web` の宣言のパッチが 1 件当たる）
- `e2e`（13 件）・`scripts`（66 件）の宣言と、`index.html`・Caddy の設定などソースの外に当たるパッチ（26 ファイル）は表に入れていない
- **ファイル単位で見ている。** 1 件でも当たれば「当たる」に数えるので、大きなファイルの中の穴は見えない

### 1.2 結果

| パッケージ | 宣言の数 | パッチが当たる数 | ソース | 変異が当たる | 割合 |
|---|---:|---:|---:|---:|---:|
| `packages/agenda-core` | 11 | 11 | 9 | 3 | 33% |
| `packages/checkin-core` | 14 | 14 | 8 | 3 | 38% |
| `packages/dev-hub-redirect` | 0 | 0 | 1 | 0 | 0% |
| `packages/invite-ui` | 7 | 7 | 5 | 1 | 20% |
| `packages/markdown` | 4 | 4 | 3 | 2 | 67% |
| `packages/poker-core` | 21 | 22 | 12 | 6 | 50% |
| `packages/protocol` | 0 | 0 | 2 | 0 | 0% |
| `packages/rate-limit` | 1 | 1 | 5 | 1 | 20% |
| `packages/room-core` | 12 | 12 | 8 | 5 | 63% |
| `packages/roulette-core` | 31 | 31 | 11 | 6 | 55% |
| `packages/sync-client` | 0 | 1 | 9 | 1 | 11% |
| `packages/timer-core` | 27 | 28 | 12 | 5 | 42% |
| `packages/topic-core` | 1 | 2 | 9 | 2 | 22% |
| `packages/ui` | 7 | 7 | 0 | 0 | -（CSS のみ。変異は `tests/` と CSS に当たる） |
| `packages/web-kit` | 8 | 9 | 15 | 9 | 60% |
| `apps/agenda-web` | 28 | 29 | 30 | 11 | 37% |
| `apps/checkin-web` | 9 | 10 | 24 | 6 | 25% |
| `apps/landing` | 16 | 10 | 15 | 5 | 33% |
| `apps/poker-web` | 21 | 22 | 28 | 9 | 32% |
| `apps/roulette-web` | 60 | 60 | 32 | 19 | 59% |
| `apps/tasuki-sync` | 93 | 91 | 113 | 36 | 32% |
| `apps/timer-web` | 39 | 40 | 83 | 16 | 19% |
| `apps/topic-web` | 5 | 3 | 12 | 3 | 25% |

親 ISSUE の表（452 件）から、#487・#489・#494 の 3 本で 42 件増えている。偏りは変わっていない。

### 1.3 変異が 1 つも無いソースファイル

297 本。そのうち関数・アロー関数・クラスを持つ（型と定数だけではない）ものが 233 本。行数の多い順に並べ、
型と定数だけのファイルには「型/定数のみ」と書いた。全件は[付録 A](#付録-a-変異が-1-つも無いソースファイル)。

core と共有パッケージで目立つもの:

- **`packages/rate-limit/src/token-bucket.ts`（292 行）・`server-env.ts`（119 行）** — 流量の制限と、本番の
  防御を切り替える `NODE_ENV` の解釈。手書きの変異は `client-key.ts` の 1 件だけ。2 節の自動の変異でも生存率が高い
- **`packages/poker-core/src/protocol.ts`（299 行）**・**`packages/protocol/src/boundary.ts`（52 行）** — 境界の解析。
  ただし 2 節の自動の変異では `boundary.ts` は 11 件すべて殺された（テストは守れている。手書きの変異が無いだけ）
- **`packages/sync-client` の 7 本**（`resume-identity.ts` 164 行・`connection.ts` 133 行ほか） — 再接続と復帰。
  利用側（`apps/*-web`）の変異 1 件が当たるだけ
- **`packages/topic-core/src/topic-bank.ts`（191 行）・`topic.ts`・`validate.ts`** — 2 節で生存率 6.9%。テストは守れている

## 2. 自動で作った変異の生存率

### 2.1 道具の比較

| 候補 | vitest | bun test | 所要（今回） | 判断 |
|---|---|---|---|---|
| Stryker（`@stryker-mutator/core` 9.6.1 + `vitest-runner` 9.6.1） | 公式の runner あり。テストごとのカバレッジで、変異ごとに当たるテストだけを流す | runner なし。**`command` runner で `bun test` を変異ごとに丸ごと流す**（カバレッジの絞り込みが効かない） | core 9 パッケージ計 12.1 分（4 並列）。tasuki-sync の境界 3 ファイル 9.6 分 | 使える。今回はこれで測った |
| Stryker の `command` runner だけで全部 | 流せるが遅い | 上と同じ | — | vitest のパッケージには不要 |
| 手書きの変異（いまの `mutation-check.mjs`） | 使っている | 使っている | — | 狙った箇所は強い。網羅はしない |
| その他（mutode など） | 保守が止まっている | — | — | 候補にしない |

Stryker をそのまま使うときに踏んだこと（入れるときの子 ISSUE の材料）:

- TypeScript を Stryker の側から解決できないと、設定の書き換え（`TSConfigPreprocessor`）で `ERR_MODULE_NOT_FOUND` で止まる
- 隔離した写し（sandbox）では、`../../ui/src/tokens/fonts.css` のように**パッケージの外を相対パスで読むテスト**が
  `ENOENT` で落ち、最初の実行で止まる（checkin-core・agenda-core・roulette-core）。`inPlace: true`（作業ツリーを直接書き換えて戻す）で通した。
  手元の作業ツリーでは使えないので、使い捨ての作業ツリー（`git worktree`）で流した
- **依存には足していない**（原則 II）。一時ディレクトリへ `npm i` して、そこから起動した

### 2.2 流したコマンド

使い捨ての作業ツリー（`git worktree add --detach <tmp>/wt HEAD` → `pnpm install --frozen-lockfile`）の各パッケージで:

```json
{
  "testRunner": "vitest",
  "plugins": ["<tmp>/stryker/node_modules/@stryker-mutator/vitest-runner/dist/src/index.js"],
  "mutate": ["src/**/*.ts", "!src/**/*.d.ts", "!src/index.ts"],
  "coverageAnalysis": "perTest",
  "inPlace": true,
  "concurrency": 4,
  "timeoutMS": 10000
}
```

`node <tmp>/stryker/node_modules/@stryker-mutator/core/bin/stryker.js run stryker.survey.json`。
tasuki-sync は `"testRunner": "command"`・`"commandRunner": { "command": "bun test --timeout 15000 --bail" }`・
`"coverageAnalysis": "off"` で、`mutate` を境界の 3 ファイル（`src/adapters/ws/connection-gate.ts`・
`src/adapters/ws/tool-channel.ts`・`src/application/connection-errors.ts`）に絞った。全部にかけると
1 変異あたり約 40 秒 × 数千件で、一度だけの調査の枠を超えるため。

### 2.3 結果

| パッケージ | 変異 | 殺した | 時間切れ | 生存 | 未到達 | 生存率 | 所要 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `packages/room-core` | 412 | 306 | 10 | 96 | 0 | 23.3% | 281 秒 |
| `packages/rate-limit` | 332 | 258 | 0 | 63 | 11 | 22.3% | 28 秒 |
| `packages/timer-core` | 971 | 847 | 0 | 117 | 7 | 12.8% | 126 秒 |
| `packages/poker-core` | 905 | 823 | 2 | 62 | 18 | 8.8% | 67 秒 |
| `packages/agenda-core` | 484 | 441 | 4 | 39 | 0 | 8.1% | 71 秒 |
| `packages/topic-core` | 233 | 217 | 0 | 16 | 0 | 6.9% | 28 秒 |
| `packages/roulette-core` | 640 | 600 | 1 | 36 | 3 | 6.1% | 65 秒 |
| `packages/checkin-core` | 464 | 454 | 0 | 10 | 0 | 2.2% | 55 秒 |
| `packages/protocol` | 11 | 11 | 0 | 0 | 0 | 0.0% | 5 秒 |
| `apps/tasuki-sync`（境界 3 ファイル） | 127 | 121 | 0 | 6 | 0 | 4.7% | 574 秒 |

生存率 =（生存 + 未到達）÷（全件 − 型の誤り − 実行時の誤り）。どのパッケージでも型の誤り・実行時の誤りは 0 件。

**読むときの注意**: Stryker は**そのパッケージ自身のテストだけ**を流している。たとえば timer-core のスキーマ
（`schemas.ts`）は、実際には `apps/tasuki-sync` の境界のテストが守っている見込みが高い。core の数字は
「core のテストだけで守れているか」であって、「プロダクトとして守れているか」ではない。

### 2.4 生き残った変異の分け方

core 9 パッケージの生存と未到達 478 件を、変異の種類で分けた:

| 分類 | 件数 | 読み |
|---|---:|---|
| 条件・境界・演算（`>` ↔ `>=`・`&&` ↔ `||`・`-` ↔ `+`・条件を常に真/偽に） | 240 | **振る舞いが変わる。ここが本題** |
| 文字列・正規表現・表（room-core の見た目の似た文字の対応表・正規表現の錨など） | 158 | 半分ほどは等価に近い（文言・キャッシュ）。room-core の対応表 50 件と rate-limit の正規表現は振る舞いが変わる |
| スキーマ（`v.literal` の名前を空に・`v.object` を `{}` に） | 58 | core のテストでは見ていないが、境界のテスト（tasuki-sync）が守っている見込み。上の注意を参照 |
| 文言の表（`error-messages.ts`） | 22 | 等価に近い（空でない文言かどうかは見ている。中身は見ない） |

### 2.5 振る舞いが変わるのにテストが落ちないもの（拾ったもの）

行は 2026-11-01 の main。**どれも「その値ちょうど」か「既定値でしか試していない」形**に集まる。

**製品のテストでも生き残るかを流し直した**（#500 のレビューの指摘 1）。2.3 の数字は core のテストだけのものなので、
ここで拾った行の生き残り 100 件（Stryker の記録にある置き換えをそのまま使う）を 1 件ずつ入れ、
core のテスト（`pnpm exec vitest run --bail=1`）・`apps/tasuki-sync` のテスト（`bun test --timeout 15000 --bail`）・
その core を使う web（roulette-web・agenda-web・timer-web・poker-web）のテストを流した。使い捨ての作業ツリー 3 本で並べて
2,308 秒。製品のテストで落ちた 17 件は、負荷による揺れを除くため 1 本ずつ流し直し、17 件とも同じ結果になった。
道具は [`2026-11-01-test-gap-survey/`](./2026-11-01-test-gap-survey/README.md) の `recheck-list.mjs`・`recheck-run.mjs`。

| 結果 | 件数 |
|---|---:|
| 製品でも生き残る（**本当の穴**） | **83** |
| 製品のテスト（すべて tasuki-sync）で落ちる | 15 |
| core のテストを丸ごと流すと落ちる（Stryker の誤り。下の注） | 2 |

注: `agenda.ts:73` と `evolve.ts:476` の論理演算（`&&` → `||`）の 2 件は、Stryker が「生存」としたのに、core のテストを丸ごと流すと
落ちた。Stryker の「テストごとのカバレッジ」（`coverageAnalysis: "perTest"`）で流すテストを絞ったときに、殺すテストを外したと読める。
定期の調査にするとき（6.2 の F）は、生き残りを丸ごとの実行で確かめ直す段を入れる。

行ごとの結果（「製品」は tasuki-sync と利用側の web）。**太字が製品でも生き残る穴**、取り消し線が製品のテストで落ちるもの:

**上限・下限ちょうどの値**

- **`roulette-core/src/roulette.ts:123`・`:154`** — 輪の人数の上限 `> MAX_WHEEL` を `>= MAX_WHEEL` にしても落ちない（上限ちょうどの人数で回したテストが無い）。製品でも 2 件とも生き残る
- ~~`roulette-core/src/roulette.ts:153`~~ — 下限 `< 2` を `<= 2` にすると、tasuki-sync のテストが落とす（製品では守れている）
- **`roulette-core/src/roulette.ts:125`・`:158`・`:203`** — 止まる位置（`settle`）の範囲の両端。製品でも 7 件生き残る。~~`:87`~~ の 1 件だけは tasuki-sync が落とす
- `agenda-core/src/agenda.ts:117` — 期限で自動で次へ移る判断。~~`deadline > now` を `>=` に~~ すると tasuki-sync が落とす。**判断そのものを常に偽にする変異（1 件）は製品でも生き残る**
- **`agenda-core/src/agenda.ts:73`** — 飛ばした段の扱い（`i > idx && i < limit`）の両端と論理演算。製品でも 6 件生き残る（もう 1 件は上の注）
- **`timer-core/src/decide.ts:161`〜`:162`** — 参加者の上限 `>= MAX_MEMBERS` を `>` にしても、上限の検査を外しても、製品でも落ちない（5 件）
- **`timer-core/src/evolve.ts:474`・`:476`** — 席の移動（`member.move`）で、いまの運転手の位置をずらす判断の両端と論理演算。製品でも 6 件生き残る（もう 1 件は上の注）
- **`poker-core/src/card-game.ts:77`・`:81`・`:85`** — 捨て札の番号の範囲と、山札が尽きるときの両端。製品でも 9 件すべて生き残る
- **`apps/tasuki-sync/src/adapters/ws/tool-channel.ts:88`・`:137`** — 大きさの上限 `bytes > max` を `>=` にしても落ちない（**上限ちょうどの大きさのフレームを送ったテストが無い**。1 バイトの差で `MESSAGE_TOO_LARGE` になるかどうかが決まる）。もともと tasuki-sync のテストで測っている

**既定値（1・0）でしか試していない演算**

- ~~`rate-limit/src/token-bucket.ts:228`~~ — 補充の式 `経過秒 * refillPerSec` を `/` にすると、tasuki-sync のテスト（AI の解錠の枠・単調時計の差し替え）が落とす。rate-limit のテストは `refillPerSec = 1` でしか補充を見ていないが、製品では守れている
- **`rate-limit/src/token-bucket.ts:110`・`:136`** — 設定の検査（`refillPerSec <= 0` などで投げる）。製品でも 7 件生き残る
- **`rate-limit/src/token-bucket.ts:269`** — 掃除を始める境目 `>` ↔ `>=`。製品でも生き残る
- **`timer-core/src/break-policy.ts:68`** — 休憩までの交代回数 `totalSwitches - base.switches` を `+` にしても落ちない（基準が 0 のときしか試していない）。製品でも生き残る
- **`timer-core/src/aggregate.ts:269`・`roulette-core/src/roulette.ts:52`・`:200`・`:390`** — 時計のずれや開始時刻の符号（`now - startedAt` を `+`）。開始時刻が 0 のときしか試していないと等価になる。製品でも 6 件すべて生き残る

**安全に関わるもの**

- `rate-limit/src/server-env.ts:31` — ループバックの判定 `^127(...){3}$`。~~末尾の錨 `$` を外す~~・~~オクテットの範囲を崩す（3 件）~~ と tasuki-sync の設定のテスト（`127.0.0.256 は通さない` ほか）が落とす。**先頭の錨 `^` を外す（`1127.0.0.1` を通す形）と、`\d` を `\D` にする 3 件（`127.x.x.200`〜`249` や `127.x.x.100`〜`199` を通さなくなる形）は、製品でも生き残る**（4 件）
- `rate-limit/src/server-env.ts:76`〜`:80` — `NODE_ENV` の引用符を外す正規化。20 件のうち 7 件は tasuki-sync が落とす。**片側だけの引用符（`"production`）・空の引用符・大文字小文字をそろえる段など 13 件は製品でも生き残る**
- **`rate-limit/src/client-key.ts:87`〜`:159`** — IPv6 の `::` の展開と、転送ヘッダーからのアドレスの取り出し（クライアント鍵の束ね方）。**製品でも 15 件すべて生き残る**

**等価か、守る必要が薄いと判断したもの**（拾っていない）

- `room-core/src/display-name.ts` のキャッシュの大きさの判定（`:297`・`:312`）— 結果は変わらず、速さだけが変わる
- `connection-gate.ts:109`（`maxConnections !== undefined` を常に真に）— `undefined` との比較が偽になるので等価
- 文言の表（22 件）・`poker-core/src/index.ts` など再エクスポート

### 2.6 room-core の見た目の似た文字の対応表

`room-core/src/display-name.ts:132`〜`:143` の対応表（キリル文字・ギリシャ文字 → ラテン文字）は、
**対の 1 つずつを空にしても 50 件が生き残る**。テストは対応表から数文字を選んで試している。対応表の全件が
働いているかは見ていない。room-core の生存 96 件の半分ほど（50 件）がここ。

## 3. 順番依存と不安定さ

### 3.1 流したコマンド

各パッケージで、種 11・22・33 のランダムな順と、同じ順を 3 回:

```bash
# vitest のパッケージ
pnpm exec vitest run --sequence.shuffle --sequence.seed=<11|22|33>
pnpm exec vitest run
# apps/tasuki-sync（bun）
bun test --timeout 15000 --randomize --seed=<11|22|33>
bun test --timeout 15000
```

- 23 パッケージ × 6 回 = 138 回。**所要 1,271 秒（21 分）**。パッケージは 1 つずつ順に流した（並べて流すと、取り合いで揺れたのか順番で落ちたのかが分からなくなるため）
- `packages/ui` と `scripts/` の自己テストは `node --test` で、Node 22 にはランダムな順の指定が無い。**ランダムな順は測っていない**（同じ順の実行は `pnpm test` の通しで緑）

### 3.2 結果

| パッケージ | ランダムな順で緑 | 同じ順で緑 | 所要（6 回の計） |
|---|---:|---:|---:|
| `apps/timer-web` | **1/3** | 3/3 | 306 秒 |
| `apps/tasuki-sync` | 3/3 | 3/3 | 242 秒 |
| `apps/poker-web` | 3/3 | 3/3 | 109 秒 |
| `apps/roulette-web` | 3/3 | 3/3 | 93 秒 |
| `apps/agenda-web` | 3/3 | 3/3 | 92 秒 |
| `apps/landing` | 3/3 | 3/3 | 71 秒 |
| `apps/checkin-web` | 3/3 | 3/3 | 56 秒 |
| `apps/topic-web` | 3/3 | 3/3 | 44 秒 |
| `packages/web-kit` | 3/3 | 3/3 | 35 秒 |
| `packages/room-core` | 3/3 | 3/3 | 24 秒 |
| `packages/invite-ui` | 3/3 | 3/3 | 22 秒 |
| `packages/agenda-core` | 3/3 | 3/3 | 20 秒 |
| `packages/sync-client` | 3/3 | 3/3 | 20 秒 |
| `packages/timer-core` | 3/3 | 3/3 | 20 秒 |
| `e2e`（ハーネスの単体テスト） | 3/3 | 3/3 | 19 秒 |
| `packages/checkin-core` | 3/3 | 3/3 | 16 秒 |
| `packages/poker-core` | 3/3 | 3/3 | 15 秒 |
| `packages/roulette-core` | 3/3 | 3/3 | 14 秒 |
| `packages/topic-core` | 3/3 | 3/3 | 12 秒 |
| `packages/markdown` | 3/3 | 3/3 | 11 秒 |
| `packages/rate-limit` | 3/3 | 3/3 | 11 秒 |
| `packages/protocol` | 3/3 | 3/3 | 10 秒 |
| `packages/dev-hub-redirect` | 3/3 | 3/3 | 9 秒 |

**順番で落ちたテスト**（1 件。[#499](https://github.com/tomohiroJin/tasuki-tools/issues/499) に切った）:

- `apps/timer-web/test/ui/App.session-lost.test.tsx` の「やり直す導線がある」— 種 11・22 で落ちる（ファイル単体でも種 11・22・55 で再現、33・44 では通る）。
  `vi.mock` の工場で作った `navigateTo: vi.fn()` の呼び出しの記録が、前のテストから残る。`vitest.config.ts` の
  `restoreMocks: true` は `vi.fn()` の記録を消さない。`beforeEach` に `vi.clearAllMocks()` を足すと 3 つの種すべてで緑になることを確かめた（変更は戻した）
- 同じ形（`vi.mock` と `vi.fn(` を使い、記録を消す呼び出しが無い）のテストファイルが grep で 26 本ある。今回の種では落ちなかった

**同じ順で揺れたテスト**: 0 件。

### 3.3 E2E の `--repeat-each`（測れなかった）

E2E は流せなかった。宣言の Chromium（Playwright の revision 1248）がこの環境に無く、
`playwright install chromium` は取得先（`cdn.playwright.dev`）がネットワークの方針で拒まれた。
`scripts/check-toolchain.mjs e2e` が版の食い違いで止める（`docs/adr/0031`。別の revision へのリンクで回避することは禁じている）。
**E2E の不安定さは、版の揃う手元か CI で測り直す**（6 節の子 ISSUE の案 F）。

## 4. 規約の守られ方

### 4.1 流したもの

- TypeScript の構文木で `it` / `test` / `describe` の呼び出しを読み、本体の中を数える小さなスクリプト（1.4 秒・テストファイル 571 本・テスト 5,982 件）
- `node scripts/audit-structure.mjs` の SC032（Given/When の区切り）

### 4.2 結果

| 規約 | 数 | 読み |
|---|---:|---|
| `.only` | 0 | 守られている。ただし機械では止めていない（単体テストの lint に規則が無い。E2E の `forbidOnly` は CI のときだけ） |
| `.todo` | 0 | 同上 |
| `.skip` / `.skipIf` / `.fixme` | 2 | どちらも `apps/tasuki-sync/test/poker/guards.test.ts`（`:271`・`:284`）の `it.skipIf(EXTERNAL_IP === undefined)`。外向きのアドレスが無い環境では到達できないので飛ばす、という理由がテストに書いてある |
| 検証（`expect` / `assert`）を本体に持たないテスト | 20 | **19 件は検証を別の形で持つ**: 待ちの関数（`until` / `take` が時間切れで投げる）8 件・E2E の `expect*` 補助関数 7 件・型注釈が検証の本体のもの（`wire-types.test.ts`）3 件・性質テストの `run()` の中 1 件。残る 1 件（`apps/agenda-web/tests/saved-scenarios.test.ts:222`）は数え方の誤り（`it` という名前の変数の `.map` をテストと読んだ） |
| 本体に分岐（`if` / `switch`）を持つテスト | 185 | tasuki-sync 95・e2e 24・timer-core 15 が多い。待ちの述語の中の分岐も数えているので、実際の「テストの中の条件分岐」はこれより少ない |
| 本体に繰り返し（`for` / `while`）を持つテスト | 387 | 表を回す・種を回す（性質テスト）ものが大半 |
| 本体に待ち時間（`setTimeout` / `sleep` / `waitForTimeout`）を持つテスト | 21 | tasuki-sync の実ソケットのテスト 18・E2E 3。「これ以上は届かない」を確かめる観測の時間が大半 |
| Given/When の区切り（SC032） | 2403/3648（65.9%） | 機械の検査はある（目標 100%・下限なし） |

### 4.3 lint で止められるものと、自前の監査が要るもの

| 規約 | lint で止める | 自前の監査 | 判断 |
|---|---|---|---|
| `.only` の残り | vitest の lint プラグインの `no-focused-tests`（依存に足す。原則 II） | `audit-structure.mjs` に構文の検査を 1 つ足す（依存を足さない） | **採る**。どちらでも安い。bun のテストも同じ形（`it.only`）なので、構文で見る自前の検査で両方を覆える |
| 理由の無い `.skip` | `no-disabled-tests` | 同上 | **採る**（上と同じ検査で、理由のコメントを求める形） |
| 検証の無いテスト | `expect-expect`（補助関数の名前を許可の表に書く） | 補助関数の表が要る | **採らない**。19 件すべてが補助関数で検証していて、表を保つ手間が見つかる穴（0 件）に見合わない |
| テストの中の分岐 | `no-conditional-in-test` | — | **採らない**。待ちの述語・表を回すテストで正当に使っている。止めると書き方が不自然になる |
| 待ち時間 | — | 実ソケットのテストに限った例外の表 | **採らない**。21 件は観測の時間で、揺れも 0 件だった |
| Given/When | — | SC032 がある | 現状のまま |

## 5. 境界の入力

### 5.1 流したもの

本番と同じ入口（`bun apps/tasuki-sync/src/server.ts`）を子プロセスで起こし（`NODE_ENV=development`・
`HOST=127.0.0.1`・空いたポート）、標準出力と標準エラーを全部取りながら、7 つの受け口（ハブ・timer・poker・topic・
roulette・agenda・checkin）へ手で壊れた入力を投げた。各入力には目印の文字列を入れ、ログと応答に出るかを見た。

- 入力の種類（18 通り × 入室の前と後）: 空・壊れた JSON・`null`・配列・文字列・`1e309`・`true`・バイナリ・
  1 万段 / 10 万段の入れ子・`__proto__` / `constructor` を持つ JSON・孤立サロゲートと NUL・知らないコマンド・
  型の違う値・上限の手前（60KB）・上限の超過（70KB）・巨大な数
- 入室した後は、各受け口の**すべてのコマンド名**について 3 通り（中身なし・型の違う余分な値・5,000 件の配列）
- 各受け口で 500 フレームを一度に送る連打
- 受け口ごとに、終わったあと別の接続で `room.check` が返るか（サーバーが生きているか）を見た
- 計 494 通り。**所要 91 秒**

### 5.2 結果

- **サーバーが落ちた・未捕捉の例外になった: 0 件**。ログに `uncaught` / `unhandled-rejection` / `on-message-error` は出ていない
- **ログに目印が出た: 0 件**。ログは起動の 4 行と終了の 1 行だけ
- 壊れた JSON は `INVALID_JSON`、形の違いは `INVALID_COMMAND`（poker は `invalid-message`）、64KB 超は `MESSAGE_TOO_LARGE`（poker は `message-too-large`）を返し、接続を保つ
- 128KB を超えるフレーム（10 万段の入れ子・5,000 件の配列）は、Bun の `maxPayloadLength` がプロトコル層で切る（1006）。設定の docstring（`config.ts` の `maxFrameBytes`）に書かれた設計どおり
- 応答に目印が戻ったのは timer の 10 件で、いずれも**利用者が自分で入れた値が部屋の状態（snapshot）に入ったもの**（例: 引き継ぎのメモ）。漏れではない
- 気づいたこと（不具合ではない）:
  - timer 系のコマンドのスキーマは `v.object`（知らないキーは捨てて受け付ける）、poker は `v.strictObject`（知らないキーは `invalid-message`）。前方互換の扱いが受け口で違う。決まっているかどうかはこの調査では確かめていない
  - 流量の制限は入室の失敗（ルーム番号の総当たり）を数える。壊れたフレームの連打は制限されず、1 つずつにエラーを返す。500 フレームで遅れや切断は無かった

### 5.3 ファジングを足すかどうかの根拠

- 手で 494 通りを投げて、落ちる・漏れる経路は 0 件。境界の解析（`packages/protocol/src/boundary.ts`）は自動の変異 11 件をすべて殺す
- 穴として見つかったのは**上限ちょうどの大きさ**（2.5 節の `tool-channel.ts:88`・`:137`）だけで、これは例を 1 つ足せば塞がる。乱数で入力を作る道具は要らない

## 6. #495 の候補ごとの採否と、実装の子 ISSUE の案

### 6.1 採否

| 候補（#495） | 判断 | 根拠（この文書の節） | 置き場（#488 の段） |
|---|---|---|---|
| core の性質テスト | **採る**。roulette-core・agenda-core・timer-core（席の移動）から | 2.5: 生き残りが上限・下限ちょうどの値に集まる。性質テストは境界の両側を機械に選ばせられる | 速い段（種と回数を固定して数秒に収める）。回数を増やした実行は全件の段 |
| WebSocket の境界のファジング | **採らない**（今は） | 5.3: 494 通りで落ちる経路 0 件。穴は上限ちょうどの 1 つで、例を足せば塞がる。新しい受け口を足すときに 5.1 と同じ入力を投げ直す | — |
| 複数のクライアントの状態遷移テスト | **保留** | この調査では測っていない（根拠が無い）。性質テストの子 ISSUE の後に、生き残りが presence・再接続に残るかで決め直す | — |
| アクセシビリティ（axe） | **保留** | E2E を流せず、判断の材料が無い（3.3） | — |
| 見た目の比較・負荷試験 | **採らない**（#495 のとおり後回し） | — | — |
| 自動で作った変異の定期的な調査 | **採る**。CI の合否ではなく、定期の調査として | 2.3: core は全部で 12 分、テストの穴を手書きの変異より広く拾う。tasuki-sync は境界に絞れば 10 分。導入は ADR を通す（原則 II） | 全件の段の外（定期。結果は ISSUE と手書きの変異に起こす） |
| ランダムな順で繰り返す | **採る** | 3.2: 138 回で 1 件見つかった。同じ形の 26 本が残る | 全件の段（種を記録して流す） |
| ADR-0006 の規約の検査 | **一部採る**: `.only` と理由の無い `.skip` だけ | 4.3 | 速い段 |
| カバレッジの下限 | 現状のまま | 親 ISSUE の表は「3 パッケージ」とあるが、実際は core の 6 パッケージ（timer・room・topic・roulette・agenda・checkin）に `lines`・`branches` の下限がある。数字の訂正だけ | — |

### 6.2 実装の子 ISSUE の案

並びは着手の順の提案。B・D・F は #488（速い段・全件の段）の後がよい（#488 は tomohiroJin/tasuki-tools#497 でマージ済み。もう着手できる）。

- **A. 順番依存を直す** — [#499](https://github.com/tomohiroJin/tasuki-tools/issues/499)（切った）
- **B. ランダムな順を全件の段へ入れる** — vitest は `--sequence.shuffle`、bun は `--randomize`、種はログに出して再現できる形にする。
  `node --test` のパッケージ（`packages/ui`・`scripts/`）は対象外と書く。A の後
- **C. rate-limit の境界を補強する** — 2.5 で製品でも生き残った行に絞る: IPv6 の展開と転送ヘッダーからの取り出し（15 件）・
  `NODE_ENV` の引用符の正規化（13 件）・設定の検査（7 件）・ループバックの判定の先頭の錨とオクテットの範囲（4 件）・掃除の境目（1 件）。
  補充の式（`refillPerSec ≠ 1`）は tasuki-sync のテストが守っているので対象から外す。テストを足し、手書きの変異（宣言は今 1 件）を足す
- **D. core の性質テスト（境界値）** — 2.5 で製品でも生き残った行に絞る: roulette-core（輪の人数の上限・止まる位置の範囲・開始時刻の符号）・
  agenda-core（飛ばした段・期限の判断を常に偽にする形。期限ちょうどの `>=` と輪の人数の下限は tasuki-sync が守っている）・
  timer-core（席の移動と運転手の位置・参加者の上限・休憩の交代回数）・poker-core（捨て札の範囲・山札が尽きるとき）。fast-check はすでに依存にある（timer-core）。広げるだけなので ADR は要らない見込み。
  子 ISSUE の完了条件に「2.5 の該当行の自動の変異が、core のテストで殺される」を入れる（製品のテストに頼らず、規則の持ち主が守る）
- **E. 上限ちょうどの大きさのフレームの例を足す** — `tool-channel.ts:88`・`:137`。テスト 1〜2 件と手書きの変異 1 件。小さいので C か D に寄せてもよい
- **F. 自動の変異を定期の調査にする（ADR）** — Stryker の採否・置き場（定期のワークフローか手元のコマンドか）・
  sandbox で落ちるテスト（パッケージの外を相対パスで読む）の扱い・bun のパッケージの絞り方・
  生き残りを製品のテストと丸ごとの実行で確かめ直す段（2.5 の注）・結果を手書きの変異へ起こす手順。あわせて E2E の `--repeat-each` を版の揃う環境で測り直す
- **G. `.only` と理由の無い `.skip` を止める** — `audit-structure.mjs` に構文の検査を足す（依存を足さない）。
  わざと `.only` を置いて赤を見る（原則 VII）

## 7. 確かめられなかったこと

- **E2E の `--repeat-each`**: Chromium revision 1248 を取得できなかった（3.3）
- **`node --test` のパッケージのランダムな順**: Node 22 に指定が無い（3.1）
- **tasuki-sync 全体への自動の変異**: 境界の 3 ファイルに絞った（2.2）。apps の web にもかけていない
- **2.5 で拾わなかった生き残りが、製品のテストで殺されるか**: 2.5 の 100 件だけを製品のテストでも流した。スキーマ（58 件）・文字列と表（158 件）ほかは core のテストだけの数字のまま（2.3 の注意）
- **ランダムな順の種は 3 つだけ**: 26 本の同じ形のファイルは、別の種で落ちうる（3.2）

## 付録 A. 変異が 1 つも無いソースファイル

（行数の多い順。括弧は行数。「型/定数のみ」は関数・アロー関数・クラスを持たないファイル）

- **packages/agenda-core**（6 本・うち処理を持つ 2 本）: `src/types.ts`（70・型/定数のみ）、`src/scenario.ts`（57）、`src/index.ts`（50・型/定数のみ）、`src/limits.ts`（35・型/定数のみ）、`src/error-messages.ts`（33）、`src/errors.ts`（24・型/定数のみ）
- **packages/checkin-core**（5 本・うち処理を持つ 2 本）: `src/methods.ts`（62）、`src/index.ts`（35・型/定数のみ）、`src/types.ts`（31・型/定数のみ）、`src/error-messages.ts`（27）、`src/errors.ts`（21・型/定数のみ）
- **packages/dev-hub-redirect**（1 本・うち処理を持つ 1 本）: `src/index.ts`（72）
- **packages/invite-ui**（4 本・うち処理を持つ 2 本）: `src/use-copy-text.ts`（56）、`src/use-invite-qr.ts`（24）、`src/room-header-copy.ts`（20・型/定数のみ）、`src/index.ts`（5・型/定数のみ）
- **packages/markdown**（1 本・うち処理を持つ 0 本）: `src/index.ts`（7・型/定数のみ）
- **packages/poker-core**（6 本・うち処理を持つ 5 本）: `src/protocol.ts`（299）、`src/index.ts`（106・型/定数のみ）、`src/error-messages.ts`（57）、`src/deck.ts`（27）、`src/stats.ts`（24）、`src/playing-card.ts`（20）
- **packages/protocol**（2 本・うち処理を持つ 1 本）: `src/boundary.ts`（52）、`src/index.ts`（6・型/定数のみ）
- **packages/rate-limit**（4 本・うち処理を持つ 3 本）: `src/token-bucket.ts`（292）、`src/server-env.ts`（119）、`src/error-kind.ts`（54）、`src/index.ts`（30・型/定数のみ）
- **packages/room-core**（3 本・うち処理を持つ 2 本）: `src/index.ts`（59・型/定数のみ）、`src/departure.ts`（38）、`src/passphrase.ts`（25）
- **packages/roulette-core**（5 本・うち処理を持つ 3 本）: `src/types.ts`（130）、`src/limits.ts`（84）、`src/errors.ts`（64・型/定数のみ）、`src/index.ts`（46・型/定数のみ）、`src/error-messages.ts`（34）
- **packages/sync-client**（8 本・うち処理を持つ 7 本）: `src/resume-identity.ts`（164）、`src/connection.ts`（133）、`src/join-retry.ts`（50）、`src/backoff.ts`（49）、`src/index.ts`（47・型/定数のみ）、`src/connection-notice.ts`（44）、`src/invite-url.ts`（28）、`src/sync-url.ts`（25）
- **packages/timer-core**（7 本・うち処理を持つ 2 本）: `src/schemas.ts`（467・型/定数のみ）、`src/events.ts`（198・型/定数のみ）、`src/errors.ts`（185・型/定数のみ）、`src/wire.ts`（177・型/定数のみ）、`src/index.ts`（106・型/定数のみ）、`src/records.ts`（83）、`src/removal-notification.ts`（24）
- **packages/topic-core**（7 本・うち処理を持つ 5 本）: `src/topic-bank.ts`（191）、`src/topic.ts`（67）、`src/fallback.ts`（44）、`src/limits.ts`（37・型/定数のみ）、`src/validate.ts`（35）、`src/prompt.ts`（31）、`src/index.ts`（29・型/定数のみ）
- **packages/web-kit**（6 本・うち処理を持つ 2 本）: `src/sync/use-join-retry.ts`（86）、`src/reader/use-reader-drawer.ts`（33）、`src/sync/index.ts`（16・型/定数のみ）、`src/room/index.ts`（15・型/定数のみ）、`src/room/room-gate-copy.ts`（14・型/定数のみ）、`src/reader/index.ts`（6・型/定数のみ）
- **apps/agenda-web**（19 本・うち処理を持つ 17 本）: `src/copy.ts`（192）、`src/components/ProjectionView.tsx`（165）、`src/hooks/use-run-signals.ts`（163）、`src/components/StepEditorRow.tsx`（148）、`src/components/RunScreen.tsx`（146）、`src/platform/sound.ts`（133）、`src/components/SavedScenarioList.tsx`（129）、`src/components/ResetControl.tsx`（69）、`src/hooks/use-local-clock.ts`（58）、`src/components/RunControls.tsx`（52）、`src/hooks/use-sound-setting.ts`（52）、`src/sample-scenarios.ts`（40・型/定数のみ）、`src/components/SoundToggle.tsx`（35）、`src/server-message.ts`（28）、`src/router.ts`（27）、`src/components/TimeDigits.tsx`（25）、`src/App.tsx`（18）、`src/hooks/use-wall-clock.ts`（15）、`src/main.tsx`（11・型/定数のみ）
- **apps/checkin-web**（18 本・うち処理を持つ 16 本）: `src/hooks/use-checkin-sync.ts`（179）、`src/method-copy.ts`（170・型/定数のみ）、`src/components/RevealBoard.tsx`（124）、`src/components/CardFace.tsx`（63）、`src/copy.ts`（63）、`src/card-art/mood-start.tsx`（44）、`src/card-art/mood.tsx`（42）、`src/card-art/takeaway-goal.tsx`（41）、`src/card-art/next-meeting.tsx`（40）、`src/card-art/best-part.tsx`（39）、`src/card-art/role.tsx`（38）、`src/card-art/weather.tsx`（37）、`src/components/RoundDock.tsx`（36）、`src/server-message.ts`（33）、`src/card-art/takeaway-done.tsx`（32）、`src/router.ts`（27）、`src/App.tsx`（18）、`src/main.tsx`（13・型/定数のみ）
- **apps/landing**（10 本・うち処理を持つ 9 本）: `src/screens/CreateRoom.tsx`（117）、`src/ToolMark.tsx`（111）、`src/App.tsx`（109）、`src/hub/default-display-name.ts`（69）、`src/screens/RoomGone.tsx`（56）、`src/hub/departure.ts`（55）、`src/screens/Resuming.tsx`（44）、`src/screens/HistoryLink.tsx`（33）、`src/hub/room-param.ts`（25）、`src/main.tsx`（9・型/定数のみ）
- **apps/poker-web**（19 本・うち処理を持つ 17 本）: `src/components/playing-card/CourtFigure.tsx`（146）、`src/hooks/useRoomEntry.ts`（141）、`src/components/playing-card/PlayingCardSvg.tsx`（130）、`src/components/EstimateLog.tsx`（126）、`src/components/CurrentTopic.tsx`（81）、`src/components/playing-card/pip-layout.ts`（68）、`src/App.tsx`（64）、`src/components/RemovalConfirm.tsx`（62）、`src/join-retry-plan.ts`（61）、`src/card-table-copy.ts`（58）、`src/components/playing-card/suit-paths.tsx`（58）、`src/components/EstimateLogFoot.tsx`（53）、`src/components/CardHand.tsx`（49）、`src/components/ErrorNote.tsx`（43）、`src/components/PointsSelect.tsx`（43）、`src/spectator-copy.ts`（32）、`src/estimate-copy.ts`（30）、`src/main.tsx`（11・型/定数のみ）、`src/card-table-fallback-copy.ts`（6・型/定数のみ）
- **apps/roulette-web**（13 本・うち処理を持つ 12 本）: `src/copy.ts`（150）、`src/components/PeoplePanel.tsx`（112）、`src/wheel-labels.ts`（82）、`src/components/ModePanel.tsx`（80）、`src/hooks/use-regulars.ts`（53）、`src/components/GroupCard.tsx`（47）、`src/components/PickCountPicker.tsx`（35）、`src/server-message.ts`（28）、`src/router.ts`（27）、`src/components/SpinControls.tsx`（24）、`src/App.tsx`（18）、`src/easing.ts`（14）、`src/main.tsx`（11・型/定数のみ）
- **apps/tasuki-sync**（77 本・うち処理を持つ 54 本）: `src/config.ts`（206）、`src/application/presence.ts`（192）、`src/application/command-handlers/participant-remove.ts`（161）、`src/application/ai-limits.ts`（114）、`src/application/room-commands/preconditions.ts`（114）、`src/application/token-store.ts`（108）、`src/application/admin.ts`（106）、`src/application/command-handlers/room-create.ts`（100）、`src/application/log/vocabulary.ts`（93・型/定数のみ）、`src/application/build-domain-command.ts`（87）、`src/adapters/ws/heartbeat.ts`（86）、`src/server.ts`（84）、`src/application/poker-rate-limit-gate.ts`（83）、`src/application/room-reclaimer.ts`（83）、`src/application/schedule.ts`（78）、`src/application/initial-timer-state.ts`（74）、`src/application/normalize-command-names.ts`（72）、`src/application/rate-limit-gate.ts`（72）、`src/application/scheduler-sync.ts`（72）、`src/application/check-room.ts`（68）、`src/application/display-name-rule.ts`（68）、`src/adapters/ws/connection-data.ts`（66）、`src/adapters/ws/http-fallback.ts`（66）、`src/adapters/poker-ws-broadcaster.ts`（65）、`src/ports/poker-broadcaster.ts`（64・型/定数のみ）、`src/application/agenda-deadlines.ts`（63）、`src/application/tool-id.ts`（60・型/定数のみ）、`src/application/connection-errors.ts`（57）、`src/application/timer-seat-broadcast.ts`（55）、`src/application/command-handlers/room-passphrase-set.ts`（54）、`src/application/log/logger.ts`（51）、`src/application/room-commands/shuffle-order.ts`（50）、`src/listening-log.ts`（47）、`src/adapters/nanoid-code-gen.ts`（46）、`src/ports/server-topic-provider.ts`（43）、`src/application/roster-dto.ts`（37）、`src/application/command-handlers/time-ping.ts`（36）、`src/application/log/log-safe.ts`（36）、`src/ports/poker-round-store.ts`（36・型/定数のみ）、`src/ports/topic-server-msg.ts`（35・型/定数のみ）、`src/adapters/system-clock.ts`（33）、`src/adapters/client-key-safety.ts`（32）、`src/application/room-lookup.ts`（32）、`src/application/wire-config.ts`（29）、`src/adapters/in-memory-room-store.ts`（28）、`src/adapters/ws/ws-send.ts`（28）、`src/adapters/in-memory-timer-store.ts`（27）、`src/ports/checkin-server-msg.ts`（27・型/定数のみ）、`src/ports/roulette-server-msg.ts`（27・型/定数のみ）、`src/ports/agenda-server-msg.ts`（26・型/定数のみ）、`src/adapters/poker-in-memory-round-store.ts`（25）、`src/adapters/ws/error-log.ts`（25）、`src/adapters/in-memory-agenda-store.ts`（23）、`src/adapters/in-memory-checkin-store.ts`（23）、`src/adapters/in-memory-roulette-store.ts`（23）、`src/adapters/in-memory-topic-store.ts`（23）、`src/application/poker-error-text.ts`（23・型/定数のみ）、`src/ports/timer-store.ts`（22・型/定数のみ）、`src/ports/hub-broadcaster.ts`（21・型/定数のみ）、`src/adapters/console-log-sink.ts`（19）、`src/adapters/crypto-random-source.ts`（17）、`src/ports/broadcaster.ts`（17・型/定数のみ）、`src/ports/code-gen.ts`（17・型/定数のみ）、`src/ports/room-store.ts`（16・型/定数のみ）、`src/application/secure-compare.ts`（14）、`src/ports/monotonic-clock.ts`（14・型/定数のみ）、`src/ports/poker-id-gen.ts`（14・型/定数のみ）、`src/ports/wall-clock.ts`（14・型/定数のみ）、`src/ports/agenda-store.ts`（13・型/定数のみ）、`src/ports/checkin-store.ts`（13・型/定数のみ）、`src/ports/log-sink.ts`（13）、`src/ports/random-source.ts`（13・型/定数のみ）、`src/ports/roulette-store.ts`（13・型/定数のみ）、`src/ports/topic-store.ts`（13・型/定数のみ）、`src/application/room-commands/domain-command.ts`（12・型/定数のみ）、`src/adapters/poker-crypto-id-gen.ts`（11）、`src/adapters/performance-clock.ts`（7）
- **apps/timer-web**（67 本・うち処理を持つ 64 本）: `src/ui/Session.tsx`（550）、`src/ui/Lobby.tsx`（313）、`src/platform/sound.ts`（223）、`src/ui/components/NotifySettingsPanel.tsx`（200）、`src/ui/name-request.ts`（154）、`src/ui/Summary.tsx`（152）、`src/ui/components/CircularProgress.tsx`（144）、`src/sync/client.ts`（142）、`src/ui/components/EndSessionZone.tsx`（131）、`src/ui/components/SharedMemo.tsx`（131）、`src/ui/components/BreakSettings.tsx`（119）、`src/ui/useFocusTrap.ts`（119）、`src/ui/components/SelfDriverToggle.tsx`（118）、`src/ui/components/StatusStrip.tsx`（112）、`src/ui/components/SessionConfigPanel.tsx`（108）、`src/ui/components/RotationLineup.tsx`（107）、`src/prefs/local-prefs.ts`（96）、`src/ui/components/BreakOverlay.tsx`（96）、`src/ui/components/TeamOrbit.tsx`（90）、`src/ui/components/ConfirmDialog.tsx`（89）、`src/ui/primitives.tsx`（88）、`src/sync/use-join-deadline.ts`（87）、`src/ui/components/NotifySettings.tsx`（86）、`src/ui/rotation-status.ts`（81）、`src/sync/commands.ts`（80）、`src/records/indexeddb.ts`（79）、`src/ui/components/Tabs.tsx`（78）、`src/ui/SessionLost.tsx`（77）、`src/ui/components/TopicCard.tsx`（77）、`src/ui/break-view.ts`（75）、`src/ui/use-banner.ts`（64）、`src/ui/rotation-names.ts`（63）、`src/ui/session-start.ts`（60）、`src/platform/notify.ts`（59）、`src/ui/components/PassphrasePanel.tsx`（59）、`src/ui/use-countdown-tick.ts`（57）、`src/ui/participant-label.ts`（54）、`src/ui/use-top-band-height.ts`（52）、`src/ui/use-break-alert.ts`（51）、`src/platform/location.ts`（49）、`src/ui/use-breakpoint.ts`（48）、`src/ui/announce.ts`（47）、`src/ui/components/RemovalConfirmDialog.tsx`（47）、`src/ui/error-action.ts`（41）、`src/ui/use-discrete-announcement.ts`（40）、`src/ui/components/MiniButton.tsx`（37）、`src/ui/components/SwitchAlert.tsx`（37）、`src/ui/roster-order.ts`（36）、`src/sync/resume-identity.ts`（35）、`src/sync/sync-url.ts`（35）、`src/ui/use-notify-preferences.ts`（34）、`src/sync/clock-offset.ts`（33）、`src/ui/skip-reason-text.ts`（33・型/定数のみ）、`src/ui/use-latest-ref.ts`（32）、`src/ui/use-now-tick.ts`（31）、`src/ui/screen.ts`（30）、`src/ui/use-reduced-motion.ts`（28）、`src/records/persist.ts`（26）、`src/ui/format-time.ts`（26）、`src/ui/components/PresenceDot.tsx`（20）、`src/ui/presence.ts`（19）、`src/ui/components/NotifyHint.tsx`（18）、`src/ui/use-last-one-guard.ts`（18）、`src/ui/components/EmptyHint.tsx`（16）、`src/main.tsx`（14・型/定数のみ）、`src/ui/room-heading.ts`（14）、`src/sync/app-mode.ts`（13・型/定数のみ）
- **apps/topic-web**（9 本・うち処理を持つ 7 本）: `src/components/CurrentTopic.tsx`（249）、`src/hooks/use-topic-sync.ts`（132）、`src/components/TopicMaker.tsx`（127）、`src/copy.ts`（63・型/定数のみ）、`src/router.ts`（27）、`src/server-message.ts`（22）、`src/components/TopicSheet.tsx`（21）、`src/App.tsx`（18）、`src/main.tsx`（11・型/定数のみ）
