# アーキテクチャと設計原則の観点で直す前に測る（#587）— 調査の記録

> マージ後の節は書き換えない。後から分かったことは末尾の補遺の節に書き、置き換えた古い節の末尾に改定の印を足す（`docs/guides/design-doc-revision.md`）。

- **Issue**: [#587](https://github.com/tomohiroJin/tasuki-tools/issues/587)（親 [#482](https://github.com/tomohiroJin/tasuki-tools/issues/482)）
- **日付**: 2026-11-13
- **計画**: [`../plans/2026-11-13-architecture-review-survey.md`](../plans/2026-11-13-architecture-review-survey.md)

**実測時点**: main `df9b4f5e`（2026-11-13）

**前提となる規範**: [`docs/constitution.md`](../../constitution.md) 原則 IV（境界の型安全）/ VI（依存は内向き）/ X（抽象は実需で）

**前提となる ADR**: [`docs/adr/0004`](../../adr/0004-sync-server-ports-and-adapters.md)（ポートとアダプタ）/ [`docs/adr/0005`](../../adr/0005-result-and-boundary-validation.md)（Result と境界の検証）/ [`docs/adr/0007`](../../adr/0007-abstraction-criteria.md)（抽象の導入基準）/ [`docs/adr/0013`](../../adr/0013-pr-granularity.md)（PR の粒度）/ [`docs/adr/0016`](../../adr/0016-core-domain-representation.md)（core ドメインの表現）/ [`docs/adr/0017`](../../adr/0017-bounded-contexts-and-packages.md)（境界づけられた文脈とパッケージ）/ [`docs/adr/0030`](../../adr/0030-ai-driven-development-operations.md) 決定 4（測れなかったものは理由を書く）

**物差し**: 新しい原則を持ち込まず、上の決まりと [`docs/guides/architecture.md`](../../guides/architecture.md) の対応表に照らして測る。一般の原則と決まりが食い違う箇所は節 8「決まりを変える候補」に書き、直す候補には入れない（原則 II）。

**利用者の目標（効果の物差し）**: 次の開発が楽になるか。4 つに分ける —— **読みやすい**（構造とテストが読める）・**足すのが速い**（新しい道具・やり方・デッキを足すとき触る場所が少ない）・**続けられる**（持続的に開発できる）・**バグが減る**。

**この文書の位置づけ**: #587 の測定結果の正本。Issue・PR へ表を転記せず、ここを参照する。
**この調査ではコード・テスト・検査・依存を直していない・足していない。** 測るためのスクリプトは、測り直せるように
[`2026-11-13-architecture-review-survey/`](./2026-11-13-architecture-review-survey/README.md) に残した（検査ではない。CI にもつながない）。

## 0. まとめ

4 本（A: アーキテクチャと拡張の試算・B: DRY・C: DbC と関数型・D: クリーンコードと単一責任）を別の作業ツリーで並列に測り、まとめ役が本体の作業ツリーでスクリプトを流し直して件数を突き合わせた（すべて一致）。「目で」の項目は各本 3 件ずつ現物で確かめた。

| 測ったもの | 結果 | 次の手 |
|---|---|---|
| 依存の向き（A） | 辺 5,242 本。既存の監査が止める形は 0 件。**監査の外で層の規則に反する辺は 79 本**。うち 62 本は「画面がドメインの型・関数を読む」で、対応表に無いが全アプリが読んでいる（決まりの側が古い）。残り 17 本が直す候補: 内側が画面の型を読む 4・application→adapters 1・純粋判断→sync-client 4・純粋判断→protocol 4・`timer-core/aggregate` への入口外の参照 4 | 節 7 の案 3（層の逆流）。対応表の改訂は節 8 |
| 拡張の試算（A・直す前の基準値） | **道具 139**（code 33・test 97・docs 9。本体は別に 71）・**やり方 31**（5・21・5・0）・**デッキ 15**（5・2・8・0。デッキの抽象は無い）。PR #460（199 ファイル）・#466（20 ファイル）と並べると、試算は「語を知っている場所」の上限で、書体のサブセットの連鎖（woff2・`fonts.css`）は語で引けない | 直したあと同じスクリプトで測り直す。節 7 の案 1・2・4 が道具・やり方の数字を下げる |
| 開放閉鎖（A・目で） | 道具を足すと手で 1 行足す場所が同期サーバーに 5 か所（`connection-gate`・`ws-adapter`・`topic-broadcast`・`tool-id`/`vocabulary`・`create-sync-server`）と landing に 1 か所（`tools.ts`）＋監査の許可リスト 7 本。やり方は `CardFace.tsx` の `switch` が `default: null` で足し忘れが静かに通る。`Record<MethodId, …>` で網羅を型に強制している良い例が同じアプリにある | 節 7 の案 1・2・4 |
| 同じ知識の写し（B） | **ソースどうしの 20 行以上の写しは 0 件**（#371・#470 の成果）。テストの写しが 10 塊で、最大は書体の base 層の判定 `font-base.ts` 12 か所（12 ファイル合計 628 行）、次に `scripted-web-socket.ts` 5 か所・`spacing-css.test.ts` の補助 4 か所。ソースの写しは 20 行未満（4 アプリの `copy.ts` の文言・4 つの core の `error-messages.ts` と同期サーバーの `connection-errors.ts`）で ADR 0007 基準 2 の下 | 節 7 の案 5（テスト支援の置き場は ADR が先）。文言の写しは節 8 |
| 契約と副作用（C） | ドメインの `throw`・最上位の `let`・`as any`・`@ts-ignore` は **0**。ID は 202 か所すべて `string`（ブランド型 0・別名 6）。同じ型の ID が 2 つ並ぶ関数 6。非 null 断定 `!` 17・`as T` 23（仕分け未）。最上位の `const` の可変な `Map` が 1（`display-name.ts:283`。監査の外）。前提をコメントだけで守る関数 9（目で）。性質テストは 6 ファイル（#496 の実測時点 `177ee0e` は timer-core の 2 ファイル。#527・#528・#529・#530 で 4 本増えた） | 節 7 の案 7。ブランド型は ADR（節 8）。監査は節 9 |
| 大きさ・命名・死んだコード・テストの形（D） | ソース 478 本 44,332 行・テスト側 646 本 107,759 行（2.4 倍）。400 行超 16 本。責務が 2 つ以上の部品・フック・ハンドラ 9 本（`use-timer-sync.ts` 6 責務・`makePokerHandlers` 1 関数 540 行・`createSyncServer` 1 関数 470 行ほか）。死んだ export は値で 5 件、`export` が余計なもの 191 件。命名の揺れ 3 組（参加者・玄関・回）。docstring のずれ 2・作業番号の残り数ファイル。E2E の 100 行超のケース 3 本。Given/When の区切り 58.1%（#496 は 65.9%。分母に `.mjs` の自己テストが入った） | 節 7 の案 2・6・8。Given/When の下限は節 9 |

**既知の値の訂正**: 計画に書いた「PR #460 は 100 ファイル」は `gh pr view --json files` の打ち切りで、実際は **199**（`changedFiles`・`git show --stat 4ed78e21` が一致）。「`checkin` を含むファイル 115」は元のコマンドが残っておらず再現できない。計画の訂正の文に書いた母集合（拡張子を絞った `git grep -lw`）で引くと 74 で、115 にもならない。試算（139）とは比べられない。どちらも計画の表に訂正の印を付けた。

## 1. アーキテクチャ・依存の向き・開放閉鎖（A）

実測時点: `f4ffbb96`（main `df9b4f5e` の上に #587 の計画と骨組みを載せた枝 `wt/587-a`。コードは `df9b4f5e` と同じ）・2026-11-13。
直さず・足さず、測って並べただけです。数はすべてスクリプトの出力（同じ入力で 2 回流して `diff` が空）で、「目で」と書いた項目だけが人が読んだものです。

4 つの目標の略称: **読** = 読みやすい / **速** = 足すのが速い / **続** = 続けられる / **バ** = バグが減る。


### 1.1 測り方

- コマンド: `node docs/superpowers/specs/2026-11-13-architecture-review-survey/a-dependency-edges.mjs .`（所要 約 5 秒。母集合は `git ls-files` の `.ts` `.tsx` `.mjs` 1,287 ファイル。調査のディレクトリ `2026-11-13-architecture-review-survey/` 自身は除く）
- 辺 5,242 本（`@tasuki/*` 671・相対 2,752・外部 1,819）。出力は `{edges, violations, summary}`。
- 既存の監査 `node scripts/audit-dependency-direction.mjs`（所要 約 7 秒）は緑（25 パッケージ / 1,138 ファイル。監査は `.js` なども数えるので母集合が違う）。
- **`covered: true`（監査が止めるはずのもの）は 0 件**。スクリプトは監査の `ALLOWED`（許可表）を読み込んで同じ判定（`@tasuki/*` の向き・パッケージの外へ出る相対パス・試験専用の私的パッケージ）を辺ごとに当てており、監査が緑であることと矛盾しない。層の判定を誤っていれば、ここが 0 にならない。
- `covered: false`（監査の外・層の規則で見つけたもの）は 79 辺（内訳は 1.3 の表。`summary.byRule` で再現）。

### 1.2 層の判定の規則（パスの規則・まとめ役の裏取り用）

判定は `layerOf(ファイル)`。上から順に当たったものを採る。テスト（`*.test.*` `*.spec.*`・`test/` `tests/` `e2e/` 配下）は層 `test` とし、**層の規則では裁かない**（監査と同じ向きの判定だけ受ける）。

| 層 | パスの規則 | 依存してよい層（`docs/guides/architecture.md` の対応表から） |
|---|---|---|
| domain | `packages/*-core`・`packages/room-core` | なし（`poker-core` だけ protocol） |
| protocol | `packages/protocol` | なし |
| rate-limit / sync-client / ui / invite-ui / markdown / dev-hub / test-css | 同名の `packages/*` | なし（`web-kit` 以外は他の層に依存しない） |
| web-kit/sync・room・reader | `packages/web-kit/src/{sync,room,reader}/` | sync と room は `sync-client`、reader は `markdown` |
| sync/ports | `apps/tasuki-sync/src/ports/` | domain |
| sync/application | `apps/tasuki-sync/src/application/` | domain・protocol・sync/ports・rate-limit |
| sync/adapters | `apps/tasuki-sync/src/adapters/` | 上のすべて（domain・protocol・ports・application・rate-limit） |
| sync/assembly | `apps/tasuki-sync/src/` 直下 | すべて（組み立て。`audit-assembly-wiring` の管轄） |
| web/screen | `vite.config.ts` を持つ `apps/*` の `src/**/*.tsx` | web/hook・web/pure・web-kit/reader・web-kit/room・invite-ui・ui |
| web/hook | 同 `src/**/*.ts` で、パスに `sync/` か `hooks/` を含む、またはファイル名が `use-`・`use` + 大文字で始まる | domain・protocol・web/pure・sync-client・web-kit（sync/room/reader）・markdown・invite-ui（対応表の「上のすべて」をこう読んだ。**ここは読み方の判断**） |
| web/pure | 同 `src/**/*.ts` のうち上のどれでもないもの | domain |
| web/config | `vite.config.ts` など、`src/` の外の web アプリのファイル | すべて |

同じ層・同じパッケージの中の import は常に可。対応表に「ドメインへ依存」と書かれていない層（web/screen→domain など）は、**そのまま表どおりに**違反として数えた（1.5 を見よ）。

**対応表の中の食い違い（判定の前提）**: `docs/guides/architecture.md` の対応表の「アダプタ」行は、置き場に `apps/*-sync/src/adapters` と並べて「web アプリ」を挙げ、依存してよいものを「上のすべて」（ドメイン・プロトコル契約・ポート・アプリケーション・`packages/rate-limit`）とする。同じ表の「web の画面」行はドメインを挙げず、「web の純粋判断」行は「ドメインの型のみ」とする。web アプリのファイルについて、表の行どうしで答えが割れている。**画面→ドメインの 62 辺を違反と数えたのは、「web の画面」行だけを読んだ判断**で、「アダプタ」行を web アプリ全体に当てる読みなら違反にならない。その読みでは A1 の 4 辺（純粋判断・同期フック→画面）も同じ層の中の import になり違反でなくなる（純粋判断→protocol の 4 辺も同じ。読み方の判断なので、決まりを変える候補として 1.4・節 8 #1 に送った）。
入口の判定: `@tasuki/<pkg>/<sub>` は、その package の `package.json` の `exports`（`main` だけの package は `.` のみ）に無ければ `deep-import`。

### 1.3 違反（監査の外）の一覧

コマンド・所要・実測時点は 1.1 のとおり。**画面→同期クライアント（`@tasuki/sync-client`・`@tasuki/web-kit/sync`）・同期フック→core の内部ファイル（相対）・アプリ間の相対参照はいずれも 0 件**（見つけに行って無かった。`screens-do-not-import-sync-client` のテストと合う）。

| 場所 | 観点 | 何が問題か | 直すと何がよくなるか | 直す量 |
|---|---|---|---|---|
| `apps/timer-web/src/ui/Summary.tsx`（型 `EndType`）を `records/persist.ts:10`・`sync/snapshot-intents.ts:30`・`sync/use-timer-sync.ts:53` が読む。`ui/connection-status.ts:6` は `ui/components/StatusStrip.tsx` の型 `StatusStripState` を読む（4 辺・全部 `import type`） | 層の向き（記録・同期フック・純粋判断→画面） | 型の定義が画面の `.tsx` にあるため、内側の層が外側の画面を import している。画面を消す・分けるとき内側が巻き込まれる | 読（依存の向きが表と合う）・続 | 5（定義を移す純粋ファイル 1 + 読む 4。`Summary.tsx`・`StatusStrip.tsx` を含む） |
| `apps/tasuki-sync/src/application/log/vocabulary.ts:12`（`AcceptedProtocol` を `adapters/ws/connection-gate.ts` から `import type`） | 層の向き（application→adapters） | 内向きの依存（憲法 VI）が型 1 本だけ逆。型は `connection-gate.ts` が `tool-id.ts`（application）の値から作るので、置き場を application に寄せられる | 読・続 | 2〜3 |
| 純粋判断 → `@tasuki/protocol`: `apps/{agenda,checkin,roulette,topic}-web/src/server-message.ts`（`agenda` 9・`checkin` 12・`roulette` 9・`topic` 9 行目付近）4 辺 | 層の向き（表は「純粋判断はドメインの型のみ」） | 4 アプリの `server-message.ts` が同じ形で protocol を読む。表と実体のどちらかが古い（決まりを変える候補にも入れた） | 読 | 0（表を直す）または 4 |
| 純粋判断 → `@tasuki/sync-client`: `apps/poker-web/src/join-retry-plan.ts:13`（値）・`room-view.ts:6`・`roulette-web/src/roulette-view.ts:37`・`topic-web/src/topic-view.ts:7`（型） | 層の向き（純粋判断が同期クライアントを知る） | 表は同期クライアントを「同期フックだけが読む」と定める。`join-retry-plan.ts` は値の import | 読・バ | 4 |
| `@tasuki/timer-core/aggregate`（`exports` に無い内部ファイルの直接参照）: `apps/tasuki-sync/src/application/timer-snapshot-dto.ts:127`・`apps/timer-web/src/ui/Session.tsx:10`・`ui/components/SessionConfigPanel.tsx:8`・`ui/components/SharedMemo.tsx:18`（4 辺） | 公開の入口を迂回 | `packages/timer-core/package.json` に `exports` が無く（`main` のみ）、入口外の参照は `apps/timer-web/vite.config.ts:22` の alias が支えている。サーバー側の解決経路は未確認。コメントは「列挙済み」と言うが宣言はここにしか無い | 続・バ（解決経路が 2 つに割れている） | 5 前後（`index.ts` へ出すか `exports` を宣言する 1〜2 + 4） |
| 画面 → ドメイン（表に無い）: 62 辺（値 29・型 33・54 ファイル。アプリ別: agenda-web 10（値 5・型 5）・checkin-web 7（4・3）・landing 3（3・0）・poker-web 14（5・9）・roulette-web 8（5・3）・timer-web 17（5・12）・topic-web 3（2・1）） | 決まりと実体の差 | 表は画面が読めるものにドメインを挙げていない。実体は全アプリで読んでいる。**ここは「決まりを変える候補」**（1.4）として扱い、直す候補には入れない | — | — |

### 1.4 決まりを変える候補（直す候補には入れない）

| 場所 | 一般の原則 | このリポジトリの決まり | 食い違いの中身 |
|---|---|---|---|
| `docs/guides/architecture.md` の web の画面の行 | 画面（表示）がドメインの型・関数を読むのは普通 | 「同期フック・純粋判断・reader・room・invite-ui・ui のみ」（ドメイン無し） | 実体は 54 ファイルが読む（値 29・型 33）。表を実体に合わせる（画面→ドメインの型を許す）か、画面専用の型を純粋判断に写すかの選択。後者は写しが増える（憲法 X） |
| 同 web の純粋判断の行 | 通信の形（protocol）を検める純粋関数は純粋判断に置いてよい | 「ドメインの型のみ」 | `server-message.ts` が protocol を読む（4 アプリ）。表に protocol を足す選択肢もある |
| 同 アダプタの行（置き場に「web アプリ」） | 一つの表の行どうしは同じファイルに同じ答えを出す | 「`apps/*-sync/src/adapters`・web アプリ」は「上のすべて」（ドメインを含む）に依存してよい | 「web の画面」「web の純粋判断」の行と食い違う。アダプタ行を web アプリ全体に当てれば、上の 2 行の 62 辺・4 辺は違反でない。どちらの行が正しいかを決めないと、層の監査（節 9 の候補 1）の物差しが定まらない |

### 1.5 測れなかったもの・限界

- import の抽出は正規表現（コメントを落とし、`import … from`・副作用 import・`export … from`・動的 `import()` を拾う）。`require` と `.css` の `@import` は見ていない（`.css` は走査対象外）。
- 層の判定はパスだけで決めた。web/hook と web/pure の線は名前の規則（`sync/`・`hooks/`・`use`）なので、`use-` で始まらない同期ロジックが web/pure に入る誤りがありうる（逆も）。web/pure 絡みの違反（11 辺）は、ファイルの中身までは読んでいない（名前の規則の誤りの可能性が残る。`server-message.ts` ほかは名前から純粋判断と見た）。
- テスト・`e2e/` は層で裁いていない（監査の向きの判定だけ受けた）。テストが内側の層の私的な部分を読むかどうかは見ていない。
- 循環依存（ファイル単位）は数えていない。

### 1.6 開放閉鎖の分岐（目で）

**「目で」**: Step 3 の当たりファイルを読んで拾った。分岐は「道具・やり方・デッキの種類が増えるたびに、手で 1 行足す場所」。

| 場所 | 観点 | 何が問題か | 直すと何がよくなるか | 直す量 |
|---|---|---|---|---|
| 目で: `apps/tasuki-sync/src/adapters/ws/connection-gate.ts:16,52-58` | 道具の種類で `if` の連なり | 道具ごとに `if (declared === TOOL_X) return TOOL_X;` を足し、型 `Protocol` の共用体（16 行目）も手で足す。足し忘れは `"unknown"` に落ちて静かに通る（型検査は拾わない） | 速・バ（`tool-id.ts` の一覧から導出すれば 2 か所が 0 に） | 1〜2 |
| 目で: `apps/tasuki-sync/src/adapters/ws-adapter.ts:104,222-224` | 道具ごとのチャンネル | 道具を足すたびに `options.<tool>` の型と `rawTextChannel(...)` の行を足す（道具 6 つ分が並ぶ） | 速 | 1（同ファイル内 2 か所） |
| 目で: `apps/tasuki-sync/src/application/topic-broadcast.ts:25-33`（`TOPIC_RECIPIENT_TOOLS`） | 道具の一覧 | 手で足す配列。**足し忘れると、その道具にお題が届かない**（TS は拾わない） | バ・速 | 1 |
| 目で: `apps/tasuki-sync/src/application/tool-id.ts:44-50`・`log/vocabulary.ts:88-90` | 道具の種類の列挙 | 定数と語彙の 2 か所に同じ綴りが並ぶ | 速 | 2 |
| 目で: `apps/tasuki-sync/src/create-sync-server.ts:46-48,127,162-163,300-303,467-510,573` | 道具ごとの組み立て | 道具ごとに import・ストア・配信・ハンドラ・猶予・破棄の 6〜8 か所を手で足す。577 行のファイルに道具が並ぶ（ソースの行数上位 4 位） | 速・読 | 1（8 か所） |
| 目で: `apps/landing/src/tools.ts:15,70-74` | 道具の一覧 | `id` の共用体（15 行目）と配列の要素を足す。`dev-hub-redirect/src/index.ts:6,9,22` のコメントは道具名を列挙（文言の更新漏れ） | 速 | 1〜2 |
| 目で: `scripts/audit-structure.mjs:122,145`・`audit-log-hygiene.mjs:65,71`・`audit-web-sync-boundary.mjs:181` ほか audit 7 本 | 検査の対象の許可リスト | 道具ごとに手で足す（足し忘れは「検査が 0 件」で落ちるものもあるが、全部ではない） | 続 | 7 |
| 目で: `apps/checkin-web/src/components/CardFace.tsx:26-45`（`Art` の `switch (method)`）・`:21-22`（`method === 'focus'`）・`reveal-view.ts:31`（`NUMERIC_METHODS`） | やり方の種類で分岐 | やり方ごとに絵のコンポーネントを `case` で選ぶ。`default: return null` なので足し忘れは**札が絵なしで出る**（型は拾わない）。`focus` だけ数字の割り方が違う特例がある | バ・速 | 3（絵のファイル 1 + この 2 か所） |
| 目で: `apps/checkin-web/src/method-copy.ts:25`・`packages/checkin-core/src/methods.ts:41`（`Record<MethodId, …>`） | やり方の種類の表 | **こちらは型が網羅を強制する**（足し忘れはコンパイルで落ちる）。良い例で、`CardFace.tsx` の `switch` もこの形に寄せられる | バ | — |
| 目で: `apps/poker-web/src/components/CardHand.tsx:25`・`packages/poker-core/src/estimate-log.ts:46`・`deck.ts:4,13` | デッキ | 山は定数 `FIBONACCI_DECK` 1 つ（`Card` は `number` / `question` / `coffee` の 3 種）。山を差し替える口が無く、`coffee` の種類を直接読む場所が 29 ファイル（`round.ts:320`・`protocol.ts:23` ほか。`git grep -l "'coffee'\|\"coffee\"\|☕" -- apps packages scripts e2e` で数えた参考値） | 速（#92 を始めるなら先にここ） | 試算 15 + 参照 29 |

### 1.7 測れなかったもの（A）

- 循環依存・ファイル単位の逆流（層をまたがない相対 import の向き）・`.css` の `@import` は未測。
- `deck`・`method` の試算は「識別子 1 つ（method は `weather`、deck は値の列）」の語で引く。**別の id・別の値だけを知っている場所**（例: `mood-start` の絵、`CardHand` の `?`・コーヒーの記号）は拾えない。#466 との比較でその漏れを 10 ファイル確認した。
- tool の既知の値 115 は、元のコマンドが残っておらず再現できない。計画の訂正の文に書いた母集合（拡張子を絞った `git grep -lw`）で引くと 74 で、115 にもならない（2.2）。
- 試算は「語を含む」=「触る可能性がある」であり、触る必要の有無は PR との照合（2.3）でしか確かめていない。

## 2. 拡張の試算の基準値（A）


### 2.1 測り方

- コマンド: `node docs/superpowers/specs/2026-11-13-architecture-review-survey/a-extension-cost.mjs . tool|method|deck`（所要 tool 約 15 秒・method/deck 各 約 10〜15 秒。母集合は `git ls-files` の全追跡ファイル。バイナリは中身を読まず名前だけ）。実測時点は上と同じ。
- 4 欄の分け方: **docs** = `docs/` 配下か `.md`。**asset** = 画像・フォント（woff2 ほか）。**test** = `*.test.*` `*.spec.*`・`test/` `tests/` `e2e/` 配下・`scripts/mutations/`（変異パッチ）・`scripts/lib/mutation-declarations*`。**code** = 残り（設定・配備ファイル・`package.json`・`pnpm-lock.yaml` を含む）。
- 当たった行の種類（reason）は行ごとの規則（優先順: 文書 > import > ルーティング > 設定の値 > 文言 > 識別子）。ひとつのファイルが複数当たる場合は `/` でつなぐ。**ヒューリスティックなので、種類の数は参考**。
- 調査用の文書（`docs/superpowers/*/2026-11-13-architecture-review-survey*`）は母集合から外した（語を含み、数を歪める）。

### 2.2 試算 3 つ（件数）

| 試算 | 何を足すと仮定 | 触る場所（ファイル数） | code | test | docs | asset | 備考 |
|---|---|---|---|---|---|---|---|
| tool | 新しい道具（`checkin` を単語で含む、`apps/checkin-web`・`packages/checkin-core`・`docs/` の外） | **139** | 33 | 97 | 9 | 0 | 本体は別に `apps/checkin-web` 52・`packages/checkin-core` 19。test 97 のうち 52 は変異パッチ（`scripts/mutations/`）。パッチ・`pnpm-lock.yaml` を除くと 86。綴りの揺れ（`TOOL_CHECKIN`・`CHECKIN_…`）は単語では当たらず、別に 8（code 2・test 6）ある |
| method | やり方を 1 つ足す（`METHOD_IDS`（先頭 id `weather`）を識別子として含む） | **31** | 5 | 21 | 5 | 0 | 内訳 `apps/checkin-web` 13・`apps/tasuki-sync` 2（テスト）・`packages/checkin-core` 8（src 3・tests 5）・docs 5（`docs/` 4・`deploy/README.md`）・`scripts/` 3（`lib/mutation-declarations.mjs`・`m504`・`m803` のパッチ）＝ 31 |
| deck | 札の山を 1 つ足す（`FIBONACCI_DECK` または値の列を含む） | **15** | 5 | 2 | 8 | 0 | code は `poker-core/src/deck.ts`・`estimate-log.ts`・`index.ts`・`poker-web/.../CardHand.tsx`・`scripts/audit-structure.mjs`。**デッキの抽象は無く**（#92 未着手）、値を知っている場所が触る場所 |

**既知の値との突き合わせ**（Step 4）:
- method: 31 ≥ 9 で合う。`METHOD_IDS` を持つ `apps/`・`packages/` の 9 ファイル（checkin-core の src 3・tests 2、checkin-web の src 1・tests 3）はすべて含まれる。
- deck: 15 ≥ 5 で合う。`FIBONACCI_DECK` の 5 ファイルはすべて含まれる。
- tool: **139。既知の値 115（上限の目安）と合わない**。同じ範囲を `git grep -l -w checkin -- . ':!apps/checkin-web' ':!packages/checkin-core' ':!docs'` と `grep -rl -w`（`node_modules` `.git` を除く）で引き直すと、`f4ffbb96`・`df9b4f5e` のどちらでも 139 で、スクリプトの 139 とファイルの集合まで一致する（`LC_ALL=C sort` して `diff` が空）。**115 は元のコマンドが残っておらず再現できない。** 計画の訂正の文に書いた母集合（拡張子を `.ts` `.tsx` `.mjs` `.yml` `.json` `.sh` に絞った `git grep -lw checkin`）で引くと **74** で、115 にもならない。試算（139）とは比べられない。
- 「落ちた既知のファイル」は無い。

### 2.3 実例 PR との並置（Step 5）

- **既知の値の修正**: `gh pr view 460 --json files` は **100 件で打ち切られる**（`changedFiles` は 199）。既知の値の「PR #460 は 100 ファイル」は切れた値だった。`git show --name-only --format= 4ed78e21`（#460 のマージコミット）で 199 ファイル。#466 の 20 ファイルは `git show` と `gh` が一致（`9e9b8db9`）。
- **PR #460（tool の初回）**: 199 ファイル = `apps/checkin-web` 51・`packages/checkin-core` 19（本体 70）・docs 9・本体と docs の外 120（`apps/tasuki-sync` 34・`apps/landing` 10・`scripts/mutations` 39・`scripts/` のその他 10・`e2e` 11・`packages/ui` 5・`deploy` 6 ほか）。4 欄では code 80・test 101・docs 15・asset 3。
  - tool の試算が拾った外側: 120 のうち 99。**拾えなかった 21**: 変異パッチ 7（`m159`・`m160`・`m36`・`m439`・`m441`・`m80`・`m91`。語を含まない・綴りの揺れ）・フォントと CSS の波及 10（`apps/landing/src/index.css`・`ToolMark.tsx`・`tests/support/font-base.ts`・`tests/tools-copy-fits-font-base.test.ts`・`packages/ui/src/fonts/zkgn-*-base.woff2` 3・`tokens/fonts.css`・`scripts/fonts/build-base-fonts.py`・`e2e/specs/landing-design.spec.ts`。字を足すとサブセットを作り直す連鎖）・`timer-ws-broadcaster.ts` とそのテスト（語を持たない波及）・`topic-broadcast.ts`・`config.ts`（`TOOL_CHECKIN`・`checkinRevealGraceMs` の綴り）。
  - 試算が拾ったのに #460 が触っていない 40: 後続の PR で足した場所（`packages/web-kit/src/room`・`room-core` の `room-route`・`e2e/specs/block-gaps` ほか）と、変異パッチ 20（語を含むが #460 の差分に無いもの。後で足されたものが多いと見るが、作られた時期は未確認）・`deploy/agenda`・`deploy/roulette` の NOTES（他の道具の文書が checkin に触れる）。
- **PR #466（method の追加）**: 20 ファイル = code 8・test 7（変異パッチ 1 を含む）・docs 2・asset 3（woff2）。method の試算 31 のうち #466 と重なるのは 10。
  - #466 が触れて試算が拾えなかった 10: `card-art/mood-start.tsx`・`MethodPicker.tsx`・`reveal-view.ts`・`packages/checkin-core/src/checkin.ts`（先頭 id `weather` を持たず、追加した id を持つ）、`packages/ui/src/fonts/zkgn-{400,500,700}-base.woff2`・`tokens/fonts.css`・`README.md`（札の文字を増やすとフォントのサブセットが変わる連鎖。試算の語では引けない）、`m501-...patch`。
  - 試算が拾ったが #466 は触らない 21: 検査を厚く持つテスト・変異パッチ・docs（追加した id の文字列を持たない固定データ）。**試算は「語を知っている場所」の上限で、「必ず触る場所」ではない**。
- 4 欄で並べると、#466 の実際は code 8・test 7・docs 2・asset 3 で、試算（method）は code 5・test 21・docs 5・asset 0。**asset（フォント）と code の一部は語で引けず、逆に test は多めに出る**。

### 2.4 触るファイルの一覧

JSON はリポジトリの外に残した（置き場は README のとおり、リポジトリの中に `tmp/` を作らない）。再現: `node …/a-extension-cost.mjs . method > <リポジトリの外>/ext-method.json`。主な塊（tool, 外側 139）:

| 塊 | ファイル数 | 例（行） |
|---|---|---|
| `apps/tasuki-sync` | 30（code 13・test 17） | `src/adapters/ws/connection-gate.ts:16,58`・`src/application/tool-id.ts:50`・`src/create-sync-server.ts:46-48,127,300-303,467-510`・`src/adapters/ws-adapter.ts:104,224`・`src/application/log/vocabulary.ts:90`・`package.json:17` |
| `scripts/mutations`（パッチ） | 52 | 語（`checkin`）を文脈に含むパッチ |
| `scripts/` のその他 | 11（audit の許可リスト 7・`mutation-weights.mjs`・`mutation-declarations.mjs`・テスト 2） | `audit-structure.mjs:122,145`・`audit-log-hygiene.mjs:65,71`・`audit-web-sync-boundary.mjs:181`・`audit-dependency-direction.mjs:105` |
| `e2e` | 14 | `harness/paths.ts:46,63`・`package.json`・`specs/*.spec.ts` 8 |
| `apps/landing` | 6 | `src/tools.ts:15,70-74`・`vite.config.ts:13` ほか |
| `packages/*`（web-kit 7・ui 3・dev-hub-redirect 2・room-core 2） | 14 | 文言の列挙（「agenda・checkin・roulette・topic」）が多い |
| `deploy` | 8 | `caddy/tasuki.conf:19`・`checkin/app.env`・`checkin/caddy/70-checkin.conf` |
| ほか | 4 | `turbo.json:38`・`pnpm-lock.yaml`・`README.md`・`apps/agenda-web/tests` |

## 3. 同じ知識の写し（B）

- 実測時点: `f4ffbb96`（枝 `wt/587-b`。コードは main `df9b4f5e` と同じ）
- スクリプト: `b-duplicates.mjs`（node 標準だけ。母集合は `git ls-files` の `.ts`/`.tsx` 1,124 ファイル。`.d.ts` は除く）
- 流したもの: `node b-duplicates.mjs . > tmp/dup-1.json`（当時はリポジトリの中の `tmp/` に出したが、README のとおり外へ出す）と同じものをもう 1 回 → `diff` が空（同じ出力）。所要は 1 回 約 4 秒
- 正規化: trim・空行・コメント行・`import` / `export … from` 行・`}` `)` だけの行を落とす。窓は正規化後の連続 20 行、重なる窓は 1 塊に連結
- 件数（スクリプトが数えた）: **塊 10・名前 28・文言と定数 268（定数 5・文言 263）**。塊は **すべてテスト**（ソースどうしの 20 行以上の写しは 0 件）。内訳はテスト・パッケージをまたぐ 3・テスト・同一パッケージ内 7

### 3.1 塊（20 行以上の写し。全 10 件を表にした）

判断の欄: 写し＝同じ知識を複数が持つ。ADR 0007 基準 1（利用者 2 以上）・基準 2（20 行以上）は、すべての行がテストの利用者を数えて満たす。

| # | 場所 | 観点 | 何が問題か | 直すと何がよくなるか | 直す量 | 寄せると何が減るか | ADR 0007 | 寄せる／寄せない |
|---|---|---|---|---|---|---|---|---|
| 1 | `tests/support/font-base.ts` 12 か所（agenda-web・checkin-web・landing・poker-web・roulette-web・timer-web・topic-web の各 tests、agenda-core・checkin-core・invite-ui・roulette-core の tests、web-kit の tests）。**既知の写し（書体の base 層の判定）。スクリプトが検出した** | 写し（知識が同じ） | base 層の判定（元の行で 11〜51 行目の 41 行。正規化後は各ファイル 29 行（web-kit は 14〜44 行目・22 行）で、一致した塊の長さはスクリプトの `lines` で 22 行）を 12 か所が持つ。md5 は 3 通り（7＋4＋1）。違いは `fonts.css` への相対パスの深さだけで、web-kit のみ `faces` を変数に出し `/// <reference types="node" />` を足している。web-kit の注記が「共有化は別（今回はしない）」と書く | バグが減る（判定を直すとき 12 か所を直す。1 つ忘れても検査は緑のまま古い判定で通る）・足すのが速い（新アプリを足すとき 13 個目をコピー） | 12 → 1（12 ファイル合計 628 行の写しが 1 か所）。ただし置き場が要る（テスト用の共有先は今ない。`@types/node` を持たない web-kit が障害と注記にある） | 利用者 12・塊 22 行（正規化後）→ 満たす | **寄せる候補**。新しいファイルを足す扱い（置き場は Ask first）。書体の判定の中身は変わらない | 約 13（共有先 1＋写し 12） |
| 2 | `tests/support/scripted-web-socket.ts` 5 か所（agenda-web・checkin-web・roulette-web・topic-web・web-kit） | 写し | 先頭の 25 行（WS の台本つきの偽物）が 5 か所で同じ。残りはアプリごとの状態の固定データ（md5 は 5 通り） | 続けられる（WS の台本の作りを直すとき 5 か所）・バグが減る | 5 → 1。固定データの部分は各アプリに残る | 利用者 5・25 行 → 満たす | **寄せる候補**（web-kit の `tests` から出す入口が要る）。#463-C では触れていない | 約 6 |
| 3 | `tests/spacing-css.test.ts` 4 か所（agenda-web・poker-web・roulette-web・timer-web） | 写し（CSS を読む補助 `read`・`rulesOf` 等。9〜74 行目の 44 行） | 補助部分だけが同じ。`it(...)` の中身（検査する規則）はアプリごとに違う → **補助が写しで、検査本体は意図した別物** | 続けられる（CSS の読み方を直すとき 4 か所） | 4 → 1（補助だけ） | 利用者 4・44 行 → 満たす | 寄せる候補（優先は低い。`packages/test-css` が既にある。そこへ補助を移せるかは未確認）。**目で: `packages/test-css` が既存の置き場の候補** | 約 5 |
| 4 | `apps/poker-web/tests/room-page-*.test.tsx` 6 ファイル（22 行） | テストの前提の組み立て | 画面を出す前の設定が 6 か所で同じ | 読みやすい（テストが本題に集中する） | 6 → 1 | 利用者 6・22 行 → 満たす | 同一パッケージ内。寄せる候補（`tests/support` にビルダーを置く） | 約 7 |
| 5 | `apps/timer-web/test/ui/Session.invite.test.tsx` と `Session.topic.test.tsx`（37 行）・`App.connection.autodismiss.test.tsx` と `App.connection.test.tsx`（30 行） | 同上 | 同じ前提の組み立て | 読みやすい | 2〜3 | 各 2 利用者・37／30 行 → 満たす | 寄せる候補（低） | 各 2 |
| 6 | `apps/tasuki-sync/test/live-ws.join-entries.test.ts` と `live-ws.passphrase-limit.test.ts`（26 行） | 同上 | 実 WS 試験の前提 | 読みやすい | 2 | 2 利用者・26 行 → 満たす | 寄せる候補（低。`test/support/live-sync-server.ts` が 1,068 行あり、足すなら先にそちらの整理と合わせる） | 2〜3 |
| 7 | `apps/roulette-web/tests/` の multi-pick・press・stop-style（21 行）、`apps/poker-web/tests/` の current-topic・room-page-layout（22 行）、`apps/landing/tests/hub/` の resume-screen・use-hub-sync（21 行） | 同上 | 同じ前提 | 読みやすい | 各 2〜3 | 21〜22 行・利用者 2〜3 → 基準の下限すれすれ | **寄せない**（下限すれすれで、間接参照の読みにくさが写しの重さを上回る恐れ。基準 2 を満たす最小の例として記録） | — |

「写し」と「意図した並行」の分け方: 塊 1・2・3 は同じ**知識**（判定・台本の作り・CSS の読み方）で、片方だけ直すと食い違う。塊 3 の検査本体と 2 の固定データは形だけ似た別の知識なので、写しから外した。

### 3.2 名前（`export function`／`export const`。28 件。パッケージ・アプリをまたぐ同名。ソースのみ）

スクリプトが出した全件を判定した（目で判定。根拠は最右欄）。

| 名前（場所） | 判定 | 根拠 | 寄せる？ |
|---|---|---|---|
| `parseRoute`・`redirectTo`（agenda・checkin・roulette・topic の `router.ts`、poker の `router.ts`、timer・landing の `redirectTo`） | **#470 で寄せた残り**。各 `router.ts` は 26 行で、BASE を渡す結線と `location.replace` だけを残す | 解析は `@tasuki/room-core` に寄せ済み。`redirectTo` 1 行（4〜5 か所）は 20 行に遠く満たない。poker の `parseRoute` は旧リンクの救済を持ち別の知識、timer の `hubRoomPath` は形が違う（`architecture.md`） | 寄せない（基準 2。`redirectTo` は `vi.mock` の差し替え口でもあるため） |
| `App`（6 アプリ） | 意図した並行 | 各アプリの最上位。名前だけ一致 | 対象外 |
| `usePrefersReducedMotion`（`apps/timer-web/src/ui/use-reduced-motion.ts` と `packages/web-kit/src/room/use-prefers-reduced-motion.ts`） | 写し（購読の書き方が違う 27／24 行） | `architecture.md` に「書き方が違うので寄せていない」と書いてある。本体は十数行 | 寄せない（基準 2。20 行未満）。注: 既存の記述どおり |
| `buildSyncUrl`（timer-web と `packages/sync-client`。目で: timer-web の `SYNC_PATH` も同名だが `export { SYNC_PATH }` の再 export で、スクリプトの出力には無い） | 写しではない | timer 側は sync-client の薄い包み（`buildToolSyncUrl` を呼ぶだけ）。#369 で寄せ済み | 対象外 |
| `arcPath`・`polar`（agenda-web `dial-geometry.ts`・roulette-web `wheel-geometry.ts`） | 意図した並行（同じ式の核＋違う知識） | `polar` は 3 行の同じ式だが、中心（agenda は `DIAL_CENTER` を足す・roulette は原点）と戻り値の型が違う。`arcPath` は 1 本の弧と扇形で別物 | 寄せない（基準 2。核の 3 行のみ） |
| `installAudioUnlock`・`scheduleTones`（agenda-web と timer-web の `platform/sound.ts`） | 部分的な写し | `installAudioUnlock` は 15 行ほどで、agenda は `data-sound-toggle` の除外を持ち別物。`scheduleTones` は音列の予約で、agenda 側は `resume` を待つ。両者は別々に育った | 寄せない（基準 2・知識が分岐済み）。ただし `sound.ts` は 132／222 行で、中の共通部分の量は未計測 |
| `CurrentTopic`（poker-web と topic-web）・`CLOSE`・`READ_MORE` | 画面の部品と文言。**写しの疑い（目で）** | 文言の定数が同名。コンポーネントの中身の一致は 20 行の窓では出なかった（窓の外） | 寄せない（20 行の窓に出ない） |
| `Stage`（roulette-web・timer-web） | 意図した並行 | 別の画面の部品 | 対象外 |
| `DEFAULT_ERROR_TEXT`・`PAGE_HEADING`・`CLOSE_BUTTON`・`RETRY_WAITING_TEXT`・`RETRY_EXHAUSTED_TEXT`（各アプリの `copy.ts`） | 文言の写し（3.3 に続く） | agenda・checkin・roulette・topic の 4 アプリが同じ文を持つ（3.3） | 3.3 |
| `DEFAULT_ERROR_MESSAGE`（poker-core・timer-core）・`CURRENT_VERSION`・`MIGRATIONS`（agenda-web と roulette-web の `storage/`） | 意図した並行 | 保存の版の数は別々の保存形式の版で、同じ値でも知識が違う | 対象外 |
| `applyAutoReveal`・`setSpectator`（checkin-core と poker-core） | 意図した並行（形が似た別の型） | `setSpectator` は先頭 8 行が似るが、状態の型（`CheckinState`／`Round`）と後半（札／票）が別。`applyAutoReveal` は別実装 | 寄せない |
| `SPECTATE`（`apps/checkin-web/src/copy.ts:49`・`apps/poker-web/src/spectator-copy.ts:8`） | 文言の写し（3.3 に続く） | どちらも `'見学する'`。2 アプリが同じ文を別々に持つ | 3.3 |
| `canOperate`（roulette-web・topic-web） | 写し（3 行） | `status === 'open' && joined`。3 行 | 寄せない（基準 2） |
| `prune`・`seatsOf`・`toView` | 意図した並行 | 名前だけ一致 | 対象外 |

### 3.3 文言と定数（263＋5 件。2 ユニット以上に出るもの。テスト・e2e を含む）

「文言」263 件のうち、ソースが 2 ファイル以上に出るのは 32 件。残りはテスト・e2e が本番の文言を引いて突き合わせているもの（本番の文言をテストが期待値として持つのは意図）。

| 場所 | 観点 | 何が問題か | 直すと何がよくなるか | 直す量 | ADR 0007 | 寄せる／寄せない |
|---|---|---|---|---|---|---|
| `copy.ts` × 4（agenda-web・checkin-web・roulette-web・topic-web）の `DEFAULT_ERROR_TEXT`「操作を完了できませんでした」・`RETRY_WAITING_TEXT`・`RETRY_EXHAUSTED_TEXT`（各 1 行・3 定数） | 文言の写し（接続の告知。#471・#472 は告知と門を `@tasuki/web-kit/room` に寄せたが、この 3 つは残った） | 4 アプリが同じ文を持つ。1 つ直して 3 つ忘れると、アプリごとに言い方が違う（poker・timer は別の言い方で既に違う。`混み合っています…`） | バグが減る・足すのが速い（新アプリが `copy.ts` に 3 行を写す） | 5〜6 | 利用者 4。ただし各 1 行・計 3 行 → **基準 2（20 行未満）を満たさない** | 寄せない（基準 2）。ただし「知識の重複」（ADR 0007 影響欄）の定義には当たるので、**決まりを変える候補**として 3.4 に書く |
| `*-core/src/error-messages.ts` 4 か所（agenda・checkin・roulette・topic。`error-messages.ts` は 6 つの core にあるが、poker・timer の分は別の文）＋`apps/tasuki-sync/src/application/connection-errors.ts`: `INVALID_JSON`・`INVALID_COMMAND`・`MESSAGE_TOO_LARGE`・`INTERNAL_ERROR`・`NOT_IN_ROOM`（agenda・checkin・roulette・topic の core 各 5 行） | 文言の写し | 4 つの core とサーバーが同じ 4〜5 文を持つ。agenda-core のコメントが「`MESSAGE_TOO_LARGE` / `INTERNAL_ERROR` は同期サーバーの正本と同じ文にする」と書き、**写しであることを自分で認めている** | バグが減る（片方を直して食い違う）。ただしコメントの約束は人が守る | 約 6 | 利用者 5（4 つの core とサーバー）。1 つあたり 4〜5 行 → 基準 2 を満たさない | 寄せない（基準 2。core がプロトコルの語彙に依存しないよう、他の core を読まない境界を持つ設計と衝突する恐れ。**未確認**）。**決まりを変える候補**にも載せる |
| `packages/invite-ui/src/room-header-copy.ts` と `apps/landing/src/screens/RoomChoice.tsx`（QR の文言 5 文） | 文言の写し | landing が `invite-ui` の文言を写している | バグが減る | 2 | 利用者 2。計 5 行 → 基準 2 を満たさない | 寄せない（基準 2）。目で: landing が同じ値を `invite-ui` から import できるかは未確認 |
| `apps/checkin-web/src/copy.ts:49` と `apps/poker-web/src/spectator-copy.ts:8` の `SPECTATE`（`見学する`） | 文言の写し | 2 アプリが同じ文を別々に持つ。片方だけ言い換えると食い違う | バグが減る | 2 | 利用者 2・1 行 → 満たさない | 寄せない（基準 2） |
| `apps/poker-web/src/join-retry-plan.ts` と `apps/timer-web/src/sync/use-timer-sync.ts`（`混み合っています…`・`混雑が続いています…`） | 写し | 2 ユニットが同じ 2 文 | バグが減る | 2 | 利用者 2・2 行 → 満たさない | 寄せない（基準 2）。同じ #147 由来。4 アプリの文言（上の行）とは別の文なので、**文言が 2 系統に割れている**ことを記録 |
| `apps/agenda-web/src/copy.ts` と `apps/timer-web/…`: `一時停止しました`・`再開しました`・`保存しました` | 写し（意図した並行の疑い） | 画面の読み上げの文 | 読みやすい | 2〜3 | 各 1 行 | 寄せない |
| 数値の定数（5 件）: `CURRENT_VERSION=1`（agenda と roulette の保存形式の版）・`MIN=60_000`・`SEC=1000`・`NOW=1_000_000`・`T0=1_000_000`（テストの時刻） | 意図した並行 | 値が同じでも別の知識（保存の版・テストの時刻の固定値）。`MIN`・`SEC` は時間の単位の定数で、`packages/` のどこかに正本があるかは未確認 | — | — | — | 寄せない |

### 3.4 決まりを変える候補（直す候補には入れない）

- **ADR 0007 基準 2（20 行未満は抽出しない）と「知識の重複」の定義の食い違い**。ADR の「影響」欄は DRY を「コードの見た目の重複ではなく知識の重複」に限って適用するとし、同じ知識を独立に持って一方が古くなり得る場合に適用するとする。3.3 の文言の写し（4 アプリの `DEFAULT_ERROR_TEXT` など、core の `error-messages.ts` の 4〜5 文）は**知識の重複だが 20 行に満たない**ので、基準 2 は「寄せない」と言い、知識の定義は「寄せる」と言う。文言（1 行の定数）に基準 2 を当てるか、デザインシステムの部品（ADR 0022 決定 2 で ADR-0007 基準 2 を当てないと決め、それを ADR 0007 の追記（2026-09-27・#320）が指す）と同様に当てない扱いにするかを人が決める。
- **テスト支援の共有先が無い**: 3.1 の塊 1・2・3 は寄せ先の置き場が無いことが原因で、`web-kit` が `@types/node` を持たない制約が注記に残る。「テスト用の共有パッケージを作る」は `CLAUDE.md` の Ask first（新しいパッケージ）に当たり、置くなら ADR を通す（憲法 II）。

### 3.5 数のまとめ（スクリプトの出力から）

- 20 行以上の写し: ソースどうし 0・テストどうし 10 塊（パッケージをまたぐ 3・同一パッケージ 7）。塊が少なく全件を表にした
- 最大: `font-base.ts` 12 か所（塊 22 行（正規化後）・12 ファイル合計 628 行の写し）。次が `scripted-web-socket.ts` 5 か所・`spacing-css.test.ts` の補助 4 か所
- ソースの写しは 20 行未満に分かれている（`router.ts` 26 行・`copy.ts` の定数など）。これは #371・#470 が寄せた結果で、残りは ADR 0007 基準 2 の下に収まっている

### 3.6 測れなかったもの（B）

- 20 行未満の写し（短い関数・定数）の総量: 窓を 20 行に固定したので出ない。名前と文言の節は名前・文字列の一致で拾ったが、**関数の中身が同じで名前が違う写し**は拾えない
- 窓をまたぐ 20 行未満の部分的な写し（`sound.ts` の共通部分、`CurrentTopic` の中身）は量を出していない
- `.tsx` の JSX の写し（20 行の窓は拾うが、属性の並びの違いで外れる）と `.css`・`.mjs`（`scripts/`）は対象外（`.mjs` は BRIEF の拡張子に入るが、task-B の指定どおり `.ts`/`.tsx` だけにした）
- 寄せたときの型・依存の向きの検査（`audit-structure`）への影響は流していない

## 4. 契約と副作用（C）

測る役 C。コード・テスト・監査は直していない。実測時点: `f4ffbb96`（枝 `wt/587-c`・2026-11-13）。

### 4.0 流したもの

| コマンド | 所要 | 結果 |
|---|---:|---|
| `node docs/superpowers/specs/2026-11-13-architecture-review-survey/c-contracts.mjs .`（2 回） | 3.2 秒（user 0.2 秒） | 2 回の出力の `diff` は空。走査 164 ファイル（`git ls-files` の `.ts`/`.tsx`/`.mjs`。対象は core 7 パッケージ・room-core・protocol・sync-client の `src` と `apps/tasuki-sync/src/{application,ports}`。走査対象の下にあるテストファイルは 0 件） |
| `node scripts/audit-domain-side-effects.mjs` | 1 秒未満 | exit 0（8 パッケージ・72 ファイル・禁止語彙 0 件） |
| `node scripts/audit-domain-error-shape.mjs` | 1 秒未満 | exit 0（14 型・6 ファイル） |
| `node docs/superpowers/specs/2026-11-01-test-gap-survey/conventions.mjs .` | 0.06 秒で失敗 | **流せなかった**: この作業ツリーに `typescript` が入っていない（`Cannot find module 'typescript'`）。依存を入れない決まりなので止めた。下の 4.3 は代わりに `git grep` で数えた |

既存の監査との矛盾: **なし**。`covered: true` の項目（監査が止める字面が core の `src` に在る）は 0 件で、`throw`・`let`・`Date.now(` ほかは core 側で 0 件、監査の「OK（0 件）」と合う。字面の 4 件（`new Date(`・`crypto.`×2・`performance.now(`）はすべて `apps/tasuki-sync`（監査が対象外と宣言したアプリ層）で、`covered: false`。

### 4.1 結果の要約（`c-contracts.mjs` の `summary`）

| 項目 | 数 | 読み |
|---|---:|---|
| `string` の ID の引数 | 141（core 5 パッケージ 31（checkin 2・poker 9・room 11・roulette 2・timer 7）・application 99・ports 11） | **ブランド型は 0**。`type ParticipantId = string` のような別名が 6（`CardId`・`ParticipantId`・`ConnId`・`RoomCode`・`ToolId`・`EntryId`）で、別名は型検査では `string` と同じ（取り違えを止めない） |
| ID の型の欄（interface・型リテラル内） | 61 | 同上の形。引数ではないので別に数えた |
| アプリケーション層の `throw`（コード） | **0** | 層によらず全体で 0。`throw` の字面は application の docstring・コメントに 4 件だけ。ADR 0005 の「境界で Result」は守られている |
| ドメインの `throw` | 0 | 既存の監査（`FORBIDDEN_PATTERNS` の `throw`）が止めている |
| 最上位の `let` | 0 | 同上（監査が止める） |
| 最上位の `const` の集合を変更しているもの | 1 | `packages/room-core/src/display-name.ts:283` の `skeletonCache`（`Map`・上限 512・純関数の結果のメモ）。**監査は `let` と `throw` の字面しか見ないので、この形は見ない** |
| 引数の破壊的変更 | 0 | 字面の近似では 0。`.push` が 6 行ある（下）が、いずれも局所の配列に見える（目で） |
| `as unknown as`／`as any`／`@ts-ignore`／`@ts-expect-error` | 0／0／0／0 | 抜け道は無い |
| 非 null 断定 `!` | 17 | 9 ファイル・6 か所。poker-core 7（3 ファイル）・room-core 3（2）・application 3（1）・agenda-core 2（1）・timer-core 1（1）・topic-core 1（1） |
| 型アサーション `as T`（`as const` を除く） | 23 | 16 ファイル。application 15（9 ファイル。`apply-room-level-event` 3・`build-domain-command` 3・`log/ref-encoder` 2・`wire-config` 2 ほか）・timer-core 3（2）・poker-core 2（2）・roulette-core・sync-client・topic-core 各 1（各 1）。import / export の宣言（複数行を含む）の中の `X as Y` は数えない（直す前の数え方は複数行の `import type { Participant as MembershipParticipant, … }` の 7 行を数えて 30 だった。節 10） |

`.push` が出た 6 行: `shuffle-order.ts:46`・`roster-dto.ts:21`・`roulette-handlers.ts:240`・`display-name.ts:204,205`・`room.ts:176`（局所の配列と読めた。引数名の字面には当たっていない）。

#### `string` の ID のパッケージごとの件数（引数／型の欄）

| パッケージ | 引数 | 型の欄 | 代表例 |
|---|---:|---:|---|
| `apps/tasuki-sync/src/application` | 99 | 19 | `handleCommand(connId)`・`removeFromRoom(actorId, targetId)`（`handlers.ts`）・`handleParticipantRemoved(roomCode, participantId)`（`poker-handlers.ts`） |
| `apps/tasuki-sync/src/ports` | 11 | 0 | `attach(roomId, participantId)`／`detach(...)`（`poker-broadcaster.ts`）・`sendTo(connId)` |
| `packages/room-core` | 11（別名 7） | 6 | `attachConnection(id, connId)`・`findParticipant(id)`（`room.ts`） |
| `packages/poker-core` | 9 | 4 | `castVote(voterId)`（`round.ts`）・`exchangeCards(playerId)`（`card-game.ts`） |
| `packages/timer-core` | 7 | 17 | `removalNotificationFor(actorParticipantId, targetParticipantId)`・`decideRename(participantId)` |
| `packages/checkin-core` | 2 | 3 | `toView(viewerId)`・`setSpectator(participantId)` |
| `packages/roulette-core` | 2（別名 2） | 4 | `setIncluded(id)`・`removeGuest(id)` |
| `packages/agenda-core`・`topic-core`・`protocol`・`sync-client` | 0 | 7・0・0・1 | — |

同じ関数に ID が 2 つ以上同じ型で並ぶもの（取り違えても型で止まらない）: 6 関数（`removeFromRoom`・`sendJoined`・`attach`・`detach`・`attachConnection`・`removalNotificationFor`）。**出どころ（目で）**: `stringIds` の引数を関数名で束ねると 2 件以上の組は 15（無名を除く）。そこから、同名の型の宣言と実装の二重取り（`handleMessage`・`handleJoin` など）や、別々の関数が同じ名前を持つだけのものを手で除いた値で、スクリプトの出力そのものではない。

**検出の規則と取りこぼしの見込み**: コメント・文字列・テンプレートを空白にしてから、名前が `id` か `…Id`／`…Ids` で型が `string`（`string[]` 含む）か「`type X = string`」の別名の `名前: 型` を拾う。直近の囲みが `(` なら引数、`{` なら型の欄。(1) 分割代入の引数（`({ roomId }: { roomId: string })`）は型の欄に入る。(2) 名前が `id` と無関係な ID（`code`・`token`・`key`）は拾わない。(3) 型を変数に挟んだ形（`type P = { roomId: string }` を別の場所で使う）は型の欄に数えるだけ。(4) 関数名の推定は直前の識別子で、無名は `<anon>`。(5) 正規表現リテラルがある行は文字列の読み飛ばしを誤ることがある。多くの場合 **過少** に数える側に倒れる。

### 4.2 一覧（5 欄）

| 場所 | 観点 | 何が問題か | 直すと何がよくなるか | 直す量 |
|---|---|---|---|---|
| 全 core・application・ports の ID（上の 141 引数・61 欄。別名は `room-core/src/room.ts:32-36`・`roulette-core/src/types.ts:10`・`checkin-core/src/methods.ts:33`） | DbC・関数型 | ID はすべて `string` か `string` の別名。`participantId` と `connId`・`roomCode` を取り違えても型は通る（ISSUE の「境界の型安全」は wire の外までは届いていない）。`apply-room-level-event.ts:41` の `unique symbol` の目印は、**型で順序を守る実例が既にある**ことを示す | **バグが減る**（取り違えがコンパイルで落ちる）。読みやすい（シグネチャが意味を持つ） | 大: 型の導入は `room-core`・`roulette-core` から数ファイル。全面は 50 ファイル超（連鎖）。ADR（原則 II・IV）が要る見込み |
| `room-core/src/display-name.ts:283` | 関数型 | 最上位の `const skeletonCache = new Map` が書き換わる。純関数のメモで上限 512・値は純粋なので誤りにはならないが、`audit-domain-side-effects` は `let` と `throw` の字面しか見ないので、この形は監査の外 | 続けられる（「core は状態を持たない」の例外を 1 件に保つ）。見つけやすさだけで直す必要は薄い | 小: 1 ファイル（直さず例外として宣言する形も可） |
| `apps/tasuki-sync/src/ports/poker-broadcaster.ts`（`attach`・`detach`）・`handlers.ts removeFromRoom`・`removal-notification.ts` | DbC | 同じ型の ID が 2 つ並ぶ関数 6 つ。引数の順序が前提（口頭・型の外） | バグが減る（上の ID の型と同じ手当で足りる） | 小: 6 関数と呼び出し側。ID の型を入れるときに一緒に |
| 17 箇所の `!`（`poker-core/src/card-game.ts:90,171,171`・`estimate-log.ts:68,69`・`spread.ts:35,36`・`room-core/src/display-name.ts:218,219`・`participant-label.ts:50`・`agenda-core/src/agenda.ts:90,170`・`timer-core/src/evolve.ts:503`・`topic-core/src/fallback.ts:36`・`shuffle-order.ts:17,17,46`） | DbC | 「ここは未定義にならない」を断定で書いている。前提（長さ・範囲）は型にもテストの題にも書かれていないものが多い（目で: `spread.ts:35,36` は `NUMBER_CARD_VALUES[step]!`、`estimate-log.ts:68,69` は `head!`。`noUncheckedIndexedAccess` は有効（`tsconfig.base.json:12`）なので、添字・先頭要素の非空という前提を `!` で押し通している） | バグが減る（前提が壊れたとき `undefined` が遠くへ運ばれる）。型側（非空の配列型）かガードに寄せるか決める | 中: 6 か所（application と 5 つの core）・9 ファイル |
| 23 箇所の `as T`（application 15。`apply-room-level-event.ts`・`build-domain-command.ts`・`log/ref-encoder.ts`・`wire-config.ts` ほか） | DbC | 境界を越えた値を型で言い切る箇所。検証済みの値への型の付け替え（境界の valibot 後）と、未検証のものとを字面では区別できない | 読みやすい（どれが安全かが分かる）。バグが減る | 大: 16 ファイル（application 9・ほか 7）。まず目で仕分け（未実施） |
| 前提をコメントだけで守る関数（目で。下の 4.4） | DbC | 「呼び出し側が先に通すこと」「`now` は単調時計であること」といった前提が型にもテストの題にも無い | バグが減る（誤用が型・実行時検査で止まる）。読みやすい | 小〜中: 項目ごと 1〜3 ファイル |

### 4.3 性質テスト（fast-check／`fc.`）

`fast-check` の import か `fc.` を持つテストファイルを `git ls-files` の全テストから数えた（`c-contracts.mjs` の `propertyTests`）。

| パッケージ | ファイル | 備考 |
|---|---:|---|
| `packages/timer-core` | 3 | `bounds.properties.test.ts`・`properties.test.ts`・`driver-switch-equivalence.test.ts`（`fc.assert`/`fc.property` は 16+14+2 件） |
| `packages/roulette-core` | 1 | `roulette-bounds.test.ts`（#527。12 件） |
| `packages/agenda-core` | 1 | `agenda-bounds.test.ts`（#529。4 件） |
| `packages/poker-core` | 1 | `card-game-bounds.test.ts`（#530。4 件） |
| 合計 | 6 | `room-core`・`checkin-core`・`topic-core`・`tasuki-sync` は 0 |

#496 の文書（`docs/superpowers/specs/2026-11-01-test-gap-survey.md`）との突き合わせ: 4 節に性質テストの件数の表は無い。6.1（`:357`・`:383`）は「fast-check はすでに依存にある（timer-core）」と書き、採否は「roulette-core・agenda-core・timer-core から採る」。4.2 の表に「性質テストの `run()` の中 1 件」の記述がある。**#496 の実測時点 `177ee0e` では timer-core の 2 ファイル（`driver-switch-equivalence.test.ts`・`properties.test.ts`）。#522 の子 4 件（#527 roulette-core・#528 timer-core の `bounds.properties.test.ts`・#529 agenda-core・#530 poker-core）で 4 ファイル増え、いまは 6 ファイル**（`git grep -lE "from ['\"]fast-check['\"]|\bfc\." <rev> -- '*.test.ts'` を `177ee0e` と HEAD で流し、増えた 4 本を `gh pr view <番号> --json files` で PR に当てた）。`conventions.mjs` は fast-check を数えない道具で、かつ今回は流せなかった。`room-core`（#522 の `display-name` の反証探索は例の生成であり `fast-check` ではない）には無い。

### 4.4 目で拾った項目（目で）

| 場所 | 何が前提か | 型・テストにあるか |
|---|---|---|
| `apps/tasuki-sync/src/application/rate-limit-gate.ts:16-23`・`poker-rate-limit-gate.ts:26-31` | `shouldReject`/`consume` の `now` は**単調時計**でなければならない（壁時計を渡してはいけない）。契約を守る責務は呼び出し元 | 型は `number`。壁時計と単調時計は同じ型なので混ぜても通る。ブランド型（`MonotonicMs`）なら止まる |
| `apps/tasuki-sync/src/application/room-entry.ts:60-68` | 合言葉の関門は「**復帰が成立した人を呼び出し側が先に通す**こと」 | 順序は型に無い。`apply-room-level-event.ts` の `StateWithAggregate` と同じ手が使える |
| `apps/tasuki-sync/src/application/poker-handlers.ts:432-440` | join 完了処理の順序の不変条件: socket 登録 → 接続状態更新 → joined 送信 → 保管と配信 | コメントのみ。ライブの試験が間接的に見る（要確認） |
| `apps/tasuki-sync/src/application/poker-handlers.ts:702-707` | `handleParticipantRemoved` は名簿を**呼び出し側が更新し終えた後**に呼ぶ | コメントのみ |
| `apps/tasuki-sync/src/application/topic-generation.ts:112` | `cancel` は帳簿を触らない。次の状態は呼び出し側が書く | コメントのみ |
| `apps/tasuki-sync/src/application/normalize-command-names.ts:22-32` | 失敗は呼び出し側が `INVALID_COMMAND` へ合流させる。単体テストからハンドラを直接呼ぶ経路は正規化を通らない | ライブ試験 `live-ws.display-name.test.ts` が見ると書いてある |
| `packages/room-core/src/display-name.ts:252-262` | 正規化後は空文字がありうる。**空の可否は呼び出し側で判定する**。NFKC の冪等性 | 冪等性はテスト（反証探索）にある。空の可否は型に無い（正規化の戻り値は `string`） |
| `apps/tasuki-sync/src/application/room-removal.ts:60-74` | 「rotation を空にしない」ガードは**部屋に人が残る前提**の不変条件。ソロの部屋の退出だけ緩めている | テストにある（#79・#376）。`timer-core` の席の配列は `NonEmpty` 型ではない（`git grep NonEmpty` 0 件）。不変条件は実行時のガードと例のテストだけで、性質テスト化の候補 |
| `packages/room-core/src/room.ts:21-23` | presence の値域に `"idle"` は無いが wire の契約には残っている | 型の値域は狭い。wire のスキーマは広いまま（意図して緩い） |

### 4.5 決まりを変える候補（直す候補には入れない）

- 「境界の型安全（原則 IV）」は wire の入口の検証（valibot）を指す。**内側の ID をブランド型にする**のは憲法の範囲外の拡張で、ADR（原則 II）を通す案件になる。決まりとして変えるなら先に ADR 0016（core ドメインの表現）への追記が要る。
- `audit-domain-side-effects` の「最上位の `let` が無いこと」は、最上位の `const` の可変な集合（`skeletonCache` 型）を許す。決まりを広げるか、例外として宣言するかは利用者の判断。

### 4.6 測れなかったこと（C）

- `conventions.mjs`（#496 の道具）の流し直し: `typescript` が未導入で `Cannot find module`。依存を入れない決まりのため止めた。性質テストは自前の字面で数えた（上）。
- 型アサーション 23 件・`!` 17 件の安全／危険の仕分け: 件数と場所だけ。目での仕分けは未実施。
- `.push` 6 行が局所の配列かどうかは行の周辺を読んだ範囲での判断（全関数の読みはしていない）。

## 5. 大きさ・命名・死んだコード・テストの形（D）

- 実測時点: `f4ffbb96`（枝 `wt/587-d`・追跡ファイル下の `.ts`/`.tsx`。`.mjs` は対象外）
- 数え方: スクリプト `d-size.mjs`・`d-dead-exports.mjs`（node 標準ライブラリのみ・母集合は `git ls-files`）。**行数は `wc -l` と同じ（改行の数。空行とコメントを含む）**
- 「目で」と印のある項目は手で読んで拾ったもの（スクリプトでは数えていない）

### 5.0 流したコマンドと所要

| コマンド | 所要（実時間） | 結果 |
|---|---|---|
| `node d-size.mjs .`（2 回） | 4.4 秒 | 2 回の出力が一致（`cmp`）。追跡下の `.ts`/`.tsx` 1,124 ファイル（ソース 478・テスト側 646） |
| `node d-dead-exports.mjs .`（2 回） | 5.1 秒 | 2 回の出力が一致。export 1,992 件のうち「自分以外のコードに現れない」196 件 |
| `node 2026-11-01-test-gap-survey/conventions.mjs <主の作業ツリー>` | 11.7 秒 | 下の「#496 の流し直し」 |

既知の値との突き合わせ: ソースの行数の上位 8 本は **748・701・603・577・562・551・535・520 で既知の値の表と一致**（`poker-handlers.ts`・`handlers.ts`・`use-timer-sync.ts`・`create-sync-server.ts`・`RosterPanel.tsx`・`ws-adapter.ts`・`Session.tsx`・`evolve.ts`）。`apps/tasuki-sync/test/support/live-sync-server.ts` 1,068 も一致。パッケージごとの `apps/tasuki-sync` 10,745 は一致。`timer-web` 8,153・`agenda-web` 3,922・`roulette-web` 3,486・`packages/timer-core` 2,910・`poker-web` 2,726 は既知の値（8,065・3,873・3,441・2,890・2,661）より多いが、既知の値は `src/` 配下だけで、こちらはパッケージ直下の設定ファイル（`vite.config.ts`・`vitest.config.ts` など）を含むため。`src/` だけに絞ると `timer-web` 8,065・`agenda-web` 3,873・`roulette-web` 3,441・`packages/timer-core` 2,890（差は `vitest.config.ts`）・`poker-web` 2,661 に一致する（`git ls-files '<pkg>/src/*.ts' '<pkg>/src/*.tsx'` からテストを除いて `wc -l` で確認。timer-core は CSS が無く `src/` の全ファイルでも 2,890 で一致するが、他の 4 つは CSS を含み一致しない）。

### 5.1 大きさ

#### パッケージごと（ソース行数の降順・上位 12）

| パッケージ | ソース行 | ソース本数 | テスト側の行 | テスト本数 | うち支援（`test/support` 等）の行 |
|---|---:|---:|---:|---:|---:|
| apps/tasuki-sync | 10,745 | 113 | 31,701 | 150 | 2,404 |
| apps/timer-web | 8,153 | 86 | 16,720 | 133 | 515 |
| apps/agenda-web | 3,922 | 34 | 5,073 | 31 | 233 |
| apps/roulette-web | 3,486 | 34 | 5,632 | 30 | 147 |
| packages/timer-core | 2,910 | 13 | 5,084 | 26 | 233 |
| apps/poker-web | 2,726 | 30 | 4,823 | 37 | 110 |
| apps/checkin-web | 1,677 | 26 | 1,885 | 20 | 143 |
| apps/landing | 1,525 | 17 | 3,623 | 26 | 52 |
| packages/poker-core | 1,432 | 13 | 2,686 | 15 | 0 |
| apps/topic-web | 1,038 | 14 | 1,919 | 14 | 106 |
| packages/roulette-core | 1,009 | 12 | 2,247 | 15 | 66 |
| packages/room-core | 946 | 9 | 1,312 | 7 | 0 |

ソース全体は 478 ファイル 44,332 行。400 行超は 16 本、300 行超は 25 本。テスト側は 646 ファイル 107,759 行（ソースの約 2.4 倍）。

#### ソースの上位 15 本

| 行 | ファイル | useState / useEffect / useRef / useCallback | export |
|---:|---|---|---:|
| 748 | `apps/tasuki-sync/src/application/poker-handlers.ts` | – | 5 |
| 701 | `apps/tasuki-sync/src/application/handlers.ts` | – | 7 |
| 603 | `apps/timer-web/src/sync/use-timer-sync.ts` | 10 / 1 / 4 / 0 | 3 |
| 577 | `apps/tasuki-sync/src/create-sync-server.ts` | – | 2 |
| 562 | `apps/timer-web/src/ui/components/RosterPanel.tsx` | 5 / 2 / 0 / 0 | 1 |
| 551 | `apps/tasuki-sync/src/adapters/ws-adapter.ts` | – | 5 |
| 535 | `apps/timer-web/src/ui/Session.tsx` | 1 / 0 / 0 / 0 | 1 |
| 520 | `packages/timer-core/src/evolve.ts` | – | 2 |
| 466 | `packages/timer-core/src/schemas.ts` | – | 5 |
| 442 | `apps/landing/src/hub/use-hub-sync.ts` | 9 / 2 / 3 / 5 | 3 |
| 432 | `apps/agenda-web/src/components/ScenarioBuilder.tsx` | 5 / 4 / 5 / 0 | 1 |
| 432 | `packages/timer-core/src/decide.ts` | – | 1 |
| 420 | `apps/roulette-web/src/roulette-view.ts` | – | 28 |
| 420 | `packages/roulette-core/src/roulette.ts` | – | 15 |
| 414 | `packages/timer-core/src/aggregate.ts` | – | 30 |

フックの数は呼び出しの形（`useEffect(`・`useState<` など）で数え、import の行は数えない。`useEffect` が 4 つ以上のファイルは 3 本: `useRoomEntry.ts`（poker-web・140 行で 7 個）・`ScenarioBuilder.tsx` 4・`use-run-signals.ts`（agenda-web・162 行）4。直す前の数え方（語の出現。import の行と docstring の言及を足していた）では 7 本で、ほかに `use-hub-sync.ts`・`use-timer-sync.ts`・`RegularsSection.tsx`・`ParticipantList.tsx`（poker-web・169 行）が入っていた。呼び出しで数えると 2・1・3・3 個（節 10）。

### 5.2 直す候補の一覧（目で拾ったもの）

観点の欄: 単一責任 / クリーンコード。目標の略: 読=読みやすい・速=足すのが速い・続=続けられる・バグ=バグが減る。

| 場所 | 観点 | 何が問題か | 直すと何がよくなるか | 直す量 |
|---|---|---|---|---|
| `apps/timer-web/src/sync/use-timer-sync.ts`（目で。`handleRoom` :249・`handleError` :324〜460・`useEffect` :581） | 単一責任 | 1 つのフックが少なくとも 6 つの責務を持つ: (1) WS 接続の保持と再接続 (2) 受けた snapshot の画面状態への反映（`handleRoom` が `decideSnapshotIntents` の結果を 5 種類 switch） (3) エラー種別ごとの処理（`handleError` だけで約 136 行） (4) 入室の再試行と期限（`useJoinRetry`・`useJoinDeadline`） (5) 完成記録の IndexedDB への保存（`persistRecordIfComplete`・:306 付近） (6) 復帰用の識別子の保存（`saveResumeIdentity`・`pendingResumeRef`）。state 10・ref 4 を 1 スコープで共有し、docstring の「handlersRef の作法」が前提として要る。`use-timer-entry`・`use-join-deadline` へ既に分けた先例はある（#369） | 読・バグ（ref の取り違えが起きる範囲が狭まる） | 1〜3（新しいフック 2 本ほど） |
| `apps/landing/src/hub/use-hub-sync.ts`（目で。`useEffect` :241〜395 の約 155 行） | 単一責任 | 玄関のフックが、接続・メッセージの種類ごとの状態反映（`setRoster`・`setJoined`・`setNeedsPassphrase`・`setGone` など、9 個ある state の多く）・URL の書き換え（`window.history.replaceState` :241 起点で +44 付近）・復帰・混雑の再試行を 1 つの effect に持つ。state 9・effect 2・callback 5（effect は 2 つだが、:241 の 1 つが約 155 行で上の責務を抱える） | 読・バグ | 1〜2 |
| `apps/tasuki-sync/src/application/poker-handlers.ts`（目で。`makePokerHandlers` :207〜748・1 関数 約 540 行） | 単一責任 | 1 つの組み立て関数の中に、(1) 参加者の写し（`showsInPoker`・`fragmentsOf` :248・:268） (2) 状態の保管と確定（`loadState`・`commit` :288・:317） (3) 制限時間の予約（`armGameTimer` :331） (4) 部屋の作成・参加・確認の 3 つのユースケース（`handleCreateRoom` :489・`handleJoinRoom` :542〜672 の約 130 行・`handleCheckRoom` :672） (5) 切り離しと退出の後始末（`detachFromCurrentRoom` :392・`handleParticipantRemoved` :708）が並ぶ。入室系の 3 つを別ファイルへ出せる境目（`admit`・`completeJoin`）が既にある | 読・速 | 2〜3 |
| `apps/tasuki-sync/src/application/handlers.ts`（目で。`makeHandlers` :228〜640・約 410 行） | 単一責任 | 1 つの関数に、状態の読み書き（`loadState`・`commit` :305・:331）・コマンドの振り分け（`handleCommand` :351・`handleRoomCommand` :419）・ドメインコマンドの準備（`prepareDomainCommand` :484）・退出（`removeFromRoom` :521）・セッションの通知文（`announceSessionNotice` :565）・接続の開閉（:597・:607）・ルームの解放（:612）が同居する。`command-handlers/` に既に分けた先例がある | 読・速 | 2〜3 |
| `apps/tasuki-sync/src/create-sync-server.ts`（目で。`createSyncServer` :110〜577・1 関数 約 470 行） | 単一責任 | 配線（組み立て）だけの関数だが、timer・ハブ・お題・ルーレット・進行タイマー・チェックイン・poker の 7 系統と時計・ログ・レート制限を 1 関数で順序に依存して組む。ファイル自身の docstring が「順序と受け渡しに暗黙の前提がいくつもある」（前方参照・TDZ 回避）と認めている。ツールを足すたびにこの 1 関数が伸びる | 速・続 | 2〜4（ツール別の組み立て関数へ） |
| `apps/tasuki-sync/src/adapters/ws-adapter.ts`（目で。`send*`／`broadcast*` :380〜450） | クリーンコード | `sendHub`・`sendTopic`・`sendRoulette`・`sendAgenda`・`sendCheckin`（と `broadcast*`）が、ツールを足すたびに 2 メソッドずつ増える並び。`buildChannels`（:184）の `rawTextChannel` 5 行も同じ形の繰り返し | 速 | 1〜2 |
| `apps/timer-web/src/ui/components/RosterPanel.tsx`（目で。1 コンポーネント約 480 行） | 単一責任 | 1 つのコンポーネントが、行の表示・改名の入力と検証・退出の確認・並べ替え・代理追加の入力・ドライバー一覧と見学一覧の 2 つのセクションを持つ（`useId` 2 個・`useEffect` 2 個・`useReducer`）。行（`:328〜440`）を 1 つのコンポーネントに切り出せる境目がある | 読 | 1〜3 |
| `apps/agenda-web/src/components/ScenarioBuilder.tsx`（目で。`useEffect` 4・`useRef` 5） | 単一責任 | 進行表の下書き（`useScenarioDraft` :73）・組み立て画面・サンプルのメニュー（`SampleMenu` :317・`useEffect` 3 つ・ref 4 つで焦点を管理）が 1 ファイルにある。`SampleMenu` は別ファイルにできる | 読 | 1 |
| `apps/roulette-web/src/components/RegularsSection.tsx`（目で。`useState` 9・`useEffect` 3） | 単一責任 | 「いつもの顔ぶれ」の一覧・保存フォーム・検証（`validate` :79）・入力の state が 1 コンポーネントに集まる。state 9 個はフォームを 1 つの reducer／サブコンポーネントにまとめる目安 | 読 | 1〜2 |
| `apps/poker-web/src/hooks/useRoomEntry.ts`（目で。140 行・`useEffect` 7・`useRef` 5） | 単一責任 | 140 行に effect が 7 個。入口の判断が effect の連鎖で表現されている（密度は本パッケージの最大）。依存の配列と ref の取り違えが起きやすい形 | バグ・読 | 1 |
| `apps/timer-web/src/ui/Session.tsx` / `RosterPanel.tsx` の docstring | クリーンコード | `RosterPanel.tsx` 冒頭が `T057: FR-046,047,048,050,051,052,061 (US9)` `Task 6:` という作業中の番号のまま。`handlers.ts`・`ws-adapter.ts` の冒頭にも `T034, T036 …`・`T040: FR-013` が残る。現在の仕様書・ADR では引けない可能性が高い（目で。引けるかは未確認） | 読 | 数ファイル（コメントのみ） |
| コメントと実装のずれ（目で）: `apps/tasuki-sync/src/application/poker-handlers.ts` 冒頭 | クリーンコード | 冒頭の docstring は「`create-room` / `join-room` / `check-room` と、それらが共用する切り離し・join 完了処理を持つ」と書くが、実際には名簿の写し・状態の確定・制限時間の予約（`armGameTimer`）・退出の後始末（`handleParticipantRemoved`）も持つ。docstring の範囲が実体より狭い | 読 | 1（コメント） |
| コメントと実装のずれ（目で）: `apps/tasuki-sync/src/adapters/ws-adapter.ts` :8 | クリーンコード | 見出しが「5 つのメッセージ層を 1 本の待ち受けで捌く」だが、`buildChannels`（:184〜228）の鍵は `timer`・`hub`・`topic`・`roulette`・`agenda`・`checkin`・`poker` の **7 つ**。ツールを足すたびに数字が古くなる | 読 | 1（コメント） |
| 命名の揺れ（目で。`git grep -w` で裏取り）: 「席／参加者」 | クリーンコード | 用語集の「参加者」を指す語が `participant`・`member`・`seat`・`Occupant` に割れる。型は `Participant` が `packages/room-core/src/room.ts:39` と `packages/timer-core/src/wire.ts:46` に**別々に**あり、`Member` が `packages/roulette-core/src/types.ts:18`、`Occupant` が `apps/tasuki-sync/src/application/timer-snapshot-dto.ts:154`、`Seat` が `timer-core/wire.ts:71`（ローテーションの 1 席）と `apps/roulette-web/src/wheel-labels.ts:29`（円盤の 1 区画・別の意味）と checkin の `SeatInput`・`SeatView` に別の意味で出る。`-w` でファイル数を数えると `participants` 198 本・`members` 79 本・`seats` 67 本（それぞれ `.ts`/`.tsx`・e2e を含む） | 読・バグ（取り違え） | 型の整理は 3〜5。語の使い分けを用語集へ書くだけなら 1 |
| 命名の揺れ（目で）: 「玄関」 | クリーンコード | 用語集の玄関が、アプリ名 `apps/landing`、プロトコルとコードの `hub`（`HubServerMsg`・`connectHub`・`hubPathFor`）、`entry`（`useTimerEntry`・`useRoomEntry`・`room-entry.ts`）に割れる。`Lobby`（timer の待機画面）は別の概念で、語が近い。語としての「玄関」は識別子に出てこない | 読 | 語の対応表を用語集へ足すなら 1 |
| 命名の揺れ（目で）: 「回」 | クリーンコード | 用語集の「回」にあたるものが、poker は `round`、timer は `session`、ルーレットは `spin`（`seq`）、checkin は回の番号 `seq`、agenda は `run`（`use-run-signals`）と、ツールごとに別の語。意味が違うので統一すべきとは限らない | 読 | 変えるなら大きい。用語集へ対応表を置くだけなら 1 |

### 5.3 死んだ export（`d-dead-exports.mjs`）

方法: 追跡下の `.ts`/`.tsx` の `export function／const／let／class／type／interface／enum` の名前のうち、**自分以外の追跡ファイル（`.ts`/`.tsx`/`.mjs`/`.cjs`/`.js`）のどこにも識別子として現れない**もの。エントリ（`index.ts`・`main.tsx`・`server.ts`・`vite.config.ts`・`*.d.ts`）の export と `scripts/` 配下の export は対象外。参照の側には `scripts/`・`e2e/`・テストも含む。`export { a, b }`・`export default`・`export *` は拾っていない。文書（`.md`）とJSON の参照は含めない。**`scripts/audit-public-surface.mjs` は `export *` の有無を見る検査で、死んだ export は見ていない**（#587 本文の「結果を引く」は読み違い）。

| 区分 | 件数 | 備考 |
|---|---:|---|
| export の総数（対象ファイル） | 1,992 | |
| 自分以外のどこにも出ない（死んだ export） | **196** | うち型（`type`／`interface`）158・値 38 |
| 　ソース側 | 149 | |
| 　テスト・`e2e` の支援側 | 47 | |
| 参照がテストだけ（本番コードは使っていない） | 293 | 「死んだ」には数えない。本番の公開面として要るかの目安 |
| 参照が `index.ts` の再 export とテストだけ | 38 | 同上。パッケージの入口に出ているが使う人がいない |

死んだ 196 件の内訳（パッケージごと）:

| 場所 | 件数 |
|---|---:|
| apps/tasuki-sync | 84 |
| apps/timer-web | 29 |
| e2e（`support`・`harness`・`fixtures`） | 25 |
| apps/roulette-web | 13 |
| apps/agenda-web | 12 |
| apps/landing | 11 |
| apps/poker-web | 8 |
| packages/poker-core | 5 |
| apps/checkin-web | 4 |
| apps/topic-web | 2 |
| packages/checkin-core・markdown・room-core | 各 1 |

**誤検出の疑い（印）**:

- **ほとんどは「同じファイルの中では使っている」export**（196 件中 191 件。`selfUses` が 1 以上）。本当に誰も使っていないのは次の **5 件だけ**（値で、同じファイルの中でも 0 回）:
  - `apps/timer-web/src/platform/sound.ts:202` `playSwitchChime`
  - `apps/tasuki-sync/test/support/room-view.ts:54` `hasNoOwner`
  - `e2e/harness/paths.ts:78` `CADDY_APPS_DIR`
  - `e2e/support/checkin.ts:45` `openCheckinFromHub`
  - `packages/checkin-core/tests/support/fixtures.ts:7` `trio`
- 残り 191 件は「export を外せば済む」類（`export` が余計）。型（158 件）は特に、`export` を足すのが習慣になっている可能性が高い。
- **型だけの export**（158 件）は、型の位置で外部が `import type` していなくても、宣言ファイルの公開面（`.d.ts` へ出る型）として意図して置いてある場合がある。判断は個別に要る。
- 動的な参照（文字列で名前を引く・`import()` の分割代入）や、文書の中の言及は見ていない（`.md` は参照に含めない）。`scripts/` 以外の `.mjs` が名前で引く場合は拾う。
- 本番のコードの値の定数・関数の死んだ export の一覧はスクリプトの出力の `deadExports`（リポジトリの外に流し直して見る）。テスト支援の `export` が使われなくなっているものは 47 件。

| 場所 | 観点 | 何が問題か | 直すと何がよくなるか | 直す量 |
|---|---|---|---|---|
| 上記の 5 件（値で誰も使わない） | クリーンコード | 使われない関数・定数が残っている | 読・続（読む量が減る） | 5 ファイル |
| 型の過剰な export 158 件・値の過剰な export 33 件（同じファイル内だけで使う） | クリーンコード | 公開面が実際の依存より広い。`apps/tasuki-sync` に 84 件 | 読・続（公開面が実際の依存と一致する）。ただし、外す価値は低く機械的 | 約 80 ファイル |
| 参照がテストだけの export 293 件 | クリーンコード | 本番コードから使われない公開関数がテストのために置かれている可能性（要判断） | 読 | 不明（個別の判断が要る） |

### 5.4 テストの形

#### #496 の道具（`conventions.mjs`）の流し直し

2026-11-01 の値（4.2 の表）との比較。主の作業ツリー（同じ main `df9b4f5e` から枝を切った状態）を `conventions.mjs` の読み先にした（作業ツリー `wt/587-d` には `node_modules` が無く、`typescript` を読めないため。読むだけ）。

| 規約 | 2026-11-01 | いま（流し直し） | 差し引き後 |
|---|---:|---:|---:|
| テストファイル | 571 | 658 | |
| テスト | 5,982 | 6,983 | |
| `.only` | 0 | 0 | |
| `.skip`／`.skipIf`／`.fixme` | 2 | 3 | |
| `.todo` | 0 | 0 | |
| 検証を本体に持たないテスト | 20 | 26 | **25**（`apps/agenda-web/tests/saved-scenarios.test.ts:222` の `it` という名前の変数の `.map` を誤って拾った 1 件を差し引いた。#496 4.2 の「残る 1 件」と同じ） |
| 本体に分岐を持つテスト | 185 | 236 | |
| 本体に繰り返しを持つテスト | 387 | 589 | |
| 本体に待ち時間を持つテスト | 21 | 55 | |
| Given/When の区切り | 2,403/3,648（65.9%） | 2,658/4,577（58.1%） | |

読み: 11-01 より `.mjs` の自己テスト（`scripts/`）を含む対象が増えたため、件数は単純に比べられない（`conventions.mjs` は `.mjs` のテストも拾い、`d-size.mjs` は `.ts`/`.tsx` だけ）。**Given/When の区切りの比率が 65.9% から 58.1% に下がった**のは数字の上での後退（分母は 3,648 から 4,577 へ増加）。`.skip` は 2 から 3 に増えた（3 件目は `docs/superpowers/specs/2026-11-01-test-gap-survey/axe-trial.spec.ts:60`。製品のテストではない）。`.only`・`.todo` は 0 のまま。

#### ここで新たに数えたもの（`d-size.mjs`・`.ts`/`.tsx` の `*.test.*`／`*.spec.*` 572 本・5,193 ケース）

「ケース」は行頭の `it(`／`test(`（`.each`・`.skip` など修飾つきを含み、`describe`・`step`・フック類を除く）。`conventions.mjs` の 6,983 より少ないのは、`.mjs` を含めていないことと、行頭にない呼び出しを数えていないため。ケースの終わりは「同じインデントの `}` で始まる行」で判断する簡便法なので、**最長の値は目安**（`layout.spec.ts:798` の 238 行は手で読んで 1 つの `test` と確認した）。

最長のケース（行）: 

| 行 | 場所 |
|---:|---|
| 238 | `e2e/specs/layout.spec.ts:798` |
| 169 | `e2e/specs/buttons.spec.ts:469` |
| 110 | `e2e/specs/header-and-dock.spec.ts:650` |
| 90 | `apps/tasuki-sync/test/live-ws.protocol.test.ts:36` |
| 89 | `apps/tasuki-sync/test/poker/create-sync-server.substitution.test.ts:293` |

ケースの長さの分布: 中央値 15 行（ファイルごとの最長ケースの中央値）。60 行を超えるファイルは 8、100 行を超えるのは 3 本（すべて E2E）。**単体のテストはほぼ短く、長いのは実画面を 1 本の流れで見る E2E**。

補助の厚さ（`test/support`・`tests/support`・`e2e/support` の追跡下の `.ts`／`.tsx`）: 56 ファイル 7,310 行。上位は `apps/tasuki-sync/test/support/live-sync-server.ts` 1,068・`e2e/support/contrast.ts` 639・`e2e/support/block-gaps.ts` 495・`e2e/support/a11y.ts` 471・`apps/tasuki-sync/test/support/room-builder.ts` 419・`e2e/support/roulette.ts` 327・`e2e/support/poker.ts` 308・`e2e/support/timer.ts` 266。`tasuki-sync` の支援が 2,404 行で最多。

| 場所 | 観点 | 何が問題か | 直すと何がよくなるか | 直す量 |
|---|---|---|---|---|
| `e2e/specs/layout.spec.ts:798`（238 行）・`buttons.spec.ts:469`（169 行）・`header-and-dock.spec.ts:650`（110 行） | クリーンコード | 1 つの `test` が 100 行を超え、複数の画面を 1 本の流れで見る（コメントに「ルーム枠が逼迫していたので 1 室で全てを見る」と理由はある・#387 で枠は広げた）。失敗したとき、どの画面で落ちたかが 1 つの題名から読めない | 読・バグ（失敗の特定が早い） | 3 |
| `apps/tasuki-sync/test/support/live-sync-server.ts`（1,068 行・export 14） | 単一責任 | テスト支援としては最大（ソースの最大 748 行より大きい）。実サーバーの起動・接続・待ちの補助・各ツール用の送受信を 1 ファイルに持つ | 読・続 | 1〜3 |
| Given/When の区切り 58.1%（11-01 は 65.9%） | クリーンコード | 規約（ADR-0006）の遵守率が下がっている。機械の検査（SC032）はあるが下限が無い | 読 | 検査の変更を伴う（この調査では直さない） |

### 5.5 測れなかったもの・注意（D）

- **「責務が 2 つ以上」は目で拾った**（上位 15 本と、直す前の数え方で `useEffect` が 4 つ以上と出たフック・部品 7 本の構造を `grep` で読み、冒頭と代表の箇所を読んだ。呼び出しで数え直すと 4 つ以上は 3 本だが、読んだ範囲と責務の判断は変わらない）。全文を読んではいない。ファイルごとの責務の数は、読み手によって数え方が変わる。
- **命名の揺れ**は用語集の語に対して識別子の別名を `git grep -w` で拾った目視の判断。「別の意味で出る」ものの区別は代表の型の定義を読んで確かめたが、全使用箇所は見ていない。
- **コメントと実装のずれ**は上位 15 本のうち 5 本（`handlers.ts`・`ws-adapter.ts`・`create-sync-server.ts`・`poker-handlers.ts`・`evolve.ts`）の冒頭と、`use-timer-sync.ts` の本体の一部しか読んでいない。残りは未読。
- 死んだ export は `.ts`/`.tsx` の `export <宣言>` の形だけ。`export { … }`・`export default`・文字列での参照・`.md`/JSON の参照は見ていない。
- `d-size.mjs` のテストの「最長のケース」はインデントで終わりを探す簡便法。`it(` が行頭にない書き方（`it.each(...)(`・1 行に複数）は数えない。
- 型だけの export の外部参照のうち、`import type` が `.d.ts` 経由で効くもの（公開面として意図したもの）は区別していない。
- `.skip` が 3 件に増えた件（11-01 は 2 件）の 3 件目は `docs/superpowers/specs/2026-11-01-test-gap-survey/axe-trial.spec.ts:60`（製品のテストではない。節 10）。
- `d-dead-exports.mjs` は識別子の字句を本文全体（コメントを含む）から取るので、**コメントの中でだけ名前を言う export も参照に数える**。その export は「死んでいない」に倒れる（死んだ export を過少に数える側）。
- `conventions.mjs` を流すとき、作業ツリー `wt/587-d` には `node_modules` が無いので主の作業ツリーを読み先にした。`wt/587-d` の HEAD（`f4ffbb96`）と主の作業ツリーの内容の差（`docs/` だけの差）は件数に影響しないと見ているが、追跡外のファイルを `readdirSync` が拾った可能性は残る（`conventions.mjs` は `git ls-files` ではなく歩く）。

## 6. 一覧（効果 × 直す量）

**尺度**。効果は 2 つで表す: **目標**（4 つのうち効くものの数。読 = 読みやすい・速 = 足すのが速い・続 = 続けられる・バ = バグが減る）と **範囲**（同じ直しが要る場所の数、または触るファイル数が減る見込み）。直す量は触るファイル数で **S（5 未満）／M（5〜15）／L（16 以上）**。**並びは目標の数の降順 → 範囲の降順 → 量の昇順**。範囲は「範囲」欄の数で比べる（「道具 7 系統 × 8 か所」は 56、「やり方 8」は 8、「1 フック」「1 関数」は 1、「15＋29」は 44、「2〜3」「4〜6」のような幅は下限）。量が「S／M」のように 2 つ並ぶものは小さい方（S）で比べる。同じ順位はもとの番号の順。**節 8 の判断を待つものは末尾にまとめる**（A3・A6・B7・C1。直すかどうか・ADR を入れるかが節 8 の判断で決まる）。その中も同じ規則で並べる。B1・B2 は置き場だけが節 8 の判断を待ち、直すこと自体は決まっているので本体の順に入れた。番号は節 1〜5 の本（A〜D）と通し番号。

| # | 場所 | 観点 | 何が問題か | 目標 | 範囲 | 量 | 出どころ |
|---|---|---|---|---|---|---|---|
| A11 | `apps/tasuki-sync/src/create-sync-server.ts`（1 関数 約 470 行・道具ごとに 6〜8 か所） | 開放閉鎖・単一責任 | 道具を足すたびにこの 1 関数へ import・ストア・配信・ハンドラ・猶予・破棄を手で足す。順序の前提を docstring が認めている | 速・読・続 | 道具 7 系統 × 8 か所 | M | 節 1.6・節 5.2 |
| D13 | 命名の揺れ 3 組（参加者: `participant`/`member`/`seat`/`Occupant`。玄関: `landing`/`hub`/`entry`。回: `round`/`session`/`spin`/`seq`/`run`） | クリーンコード | 用語集の語に対し識別子が割れる。「回」は意味が違うので統一すべきとは限らない | 読・バ | 198 ファイル（`participants`） | S（用語集に対応表）／M（型の整理） | 節 5.2 |
| D15 | `export` が余計なもの 191 件（型 158・値 33。`apps/tasuki-sync` 84） | クリーンコード | 公開面が実際の依存より広い。外す価値は低く機械的 | 読・続 | 80 ファイル | L（優先は低い） | 節 5.3 |
| C5 | `as T` 23 か所（application 15） | DbC | 検証済みの値への付け替えと未検証のものが字面で区別できない | 読・バ | 16 ファイル | L | 節 4.2 |
| B1 | `tests/support/font-base.ts` 12 か所（12 ファイル合計 628 行） | DRY | base 層の判定の写し。1 つ直し忘れても検査は緑のまま | バ・速 | 12 か所 | M（決まり次第: 置き場） | 節 3.1 |
| C6 | 前提をコメントだけで守る関数 9（`rate-limit-gate.ts` の単調時計・`room-entry.ts` の順序・`poker-handlers.ts` の join の順序と名簿の更新・`topic-generation.ts`・`normalize-command-names.ts`・`display-name.ts` の空文字・`room-removal.ts` の非空・`room.ts` の presence） | DbC | 前提が型にもテストの題にも無い | バ・読 | 9 か所 | S（各 1〜3） | 節 4.4 |
| A14 | `apps/checkin-web/src/components/CardFace.tsx:21-45`・`reveal-view.ts:31` | 開放閉鎖 | やり方ごとの `switch` が `default: return null`。足し忘れは札が絵なしで出る。`Record<MethodId, …>` の良い例が同じアプリにある | 速・バ | やり方 8 | S | 節 1.6 |
| A7 | `apps/tasuki-sync/src/adapters/ws/connection-gate.ts:16,52-58` | 開放閉鎖 | 道具ごとの `if` の連なりと `Protocol` の共用体を手で足す。足し忘れは `"unknown"` に落ちて静かに通る | 速・バ | 道具 7 | S | 節 1.6 |
| A9 | `apps/tasuki-sync/src/application/topic-broadcast.ts:25-33` | 開放閉鎖 | 手で足す配列。足し忘れると、その道具にお題が届かない | 速・バ | 道具 7 | S | 節 1.6 |
| B2 | `tests/support/scripted-web-socket.ts` 5 か所（先頭 25 行） | DRY | WS の台本の作りの写し | 続・バ | 5 か所 | M（決まり次第: 置き場） | 節 3.1 |
| D14 | 値で誰も使わない export 5 件（`playSwitchChime`・`hasNoOwner`・`CADDY_APPS_DIR`・`openCheckinFromHub`・`trio`） | クリーンコード | 死んだコード | 読・続 | 5 | M | 節 5.3 |
| A4 | 純粋判断→`@tasuki/sync-client` 4 辺（`poker-web/src/join-retry-plan.ts` は値の import） | 依存の向き | 表は同期クライアントを「同期フックだけが読む」と定める | 読・バ | 4 辺 | S | 節 1.3 |
| A1 | `apps/timer-web/src/ui/Summary.tsx`・`StatusStrip.tsx` の型を `records/persist.ts`・`sync/snapshot-intents.ts`・`sync/use-timer-sync.ts`・`ui/connection-status.ts` が読む（4 辺） | 依存の向き | 内側が画面の `.tsx` の型を import。画面を分けると内側が巻き込まれる | 読・続 | 4 辺 | M | 節 1.3 |
| A5 | `@tasuki/timer-core/aggregate` への入口外の参照 4 辺（`timer-snapshot-dto.ts`・`Session.tsx`・`SessionConfigPanel.tsx`・`SharedMemo.tsx`）。`timer-core` に `exports` が無く vite の alias が支える | 公開の入口 | 解決経路が 2 つに割れている。サーバー側の解決は未確認 | 続・バ | 4 辺 | M | 節 1.3 |
| D16 | `e2e/specs/layout.spec.ts:798`（238 行）・`buttons.spec.ts:469`（169 行）・`header-and-dock.spec.ts:650`（110 行） | クリーンコード | 1 つの `test` が複数の画面を見る。落ちた画面が題名から読めない | 読・バ | 3 | S | 節 5.4 |
| A2 | `apps/tasuki-sync/src/application/log/vocabulary.ts:12`（`AcceptedProtocol` を adapters から `import type`） | 依存の向き | 内向きの依存が型 1 本だけ逆。置き場を application へ寄せられる | 読・続 | 1 辺 | S | 節 1.3 |
| D1 | `apps/timer-web/src/sync/use-timer-sync.ts`（603 行・state 10・ref 4） | 単一責任 | 接続・snapshot の反映・エラー種別の処理（136 行）・再試行・IndexedDB への保存・復帰の識別子の 6 責務 | 読・バ | 1 フック | S | 節 5.2 |
| D2 | `apps/landing/src/hub/use-hub-sync.ts`（442 行・effect 155 行） | 単一責任 | 接続・state 9 個の反映・URL の書き換え・復帰・再試行が 1 つの effect に | 読・バ | 1 フック | S | 節 5.2 |
| D3 | `apps/tasuki-sync/src/application/poker-handlers.ts`（`makePokerHandlers` 1 関数 約 540 行） | 単一責任 | 名簿の写し・保管と確定・制限時間・入室 3 ユースケース・退出の後始末が 1 関数に。境目（`admit`・`completeJoin`）は既にある | 読・速 | 1 関数 | S | 節 5.2 |
| D4 | `apps/tasuki-sync/src/application/handlers.ts`（`makeHandlers` 約 410 行） | 単一責任 | 読み書き・振り分け・準備・退出・通知文・開閉・解放が同居。`command-handlers/` に分けた先例がある | 読・速 | 1 関数 | S | 節 5.2 |
| D10 | `apps/poker-web/src/hooks/useRoomEntry.ts`（140 行に effect 7） | 単一責任 | 入口の判断が effect の連鎖。依存配列と ref の取り違えが起きやすい | 読・バ | 1 フック | S | 節 5.2 |
| D17 | `apps/tasuki-sync/test/support/live-sync-server.ts`（1,068 行・export 14） | 単一責任 | テスト支援としては最大。起動・接続・待ち・各道具の送受信が 1 ファイル | 読・続 | 1 | S | 節 5.4 |
| A15 | poker のデッキ（`FIBONACCI_DECK` 1 つ。`coffee` を直接読む場所 29 ファイル） | 開放閉鎖 | 山を差し替える口が無い。#92（T シャツサイズ）を始めるなら先にここ | 速 | 15＋29 | L（振る舞いを変える #92 の前提。#482 の範囲外） | 節 1.6 |
| C4 | 非 null 断定 `!` 17 か所（6 か所: application と 5 つの core） | DbC | 添字・先頭要素の非空という前提を `!` で押し通す（`noUncheckedIndexedAccess` は有効） | バ | 9 ファイル | M | 節 4.2 |
| A8 | `apps/tasuki-sync/src/adapters/ws-adapter.ts:104,184-228,380-450` | 開放閉鎖 | 道具ごとに `options.<tool>`・`rawTextChannel`・`send*`/`broadcast*` を 2 メソッドずつ足す | 速 | 道具 7 | S | 節 1.6・節 5.2 |
| A13 | `scripts/audit-*.mjs` の許可リスト 7 本 | 開放閉鎖 | 道具ごとに手で足す。足し忘れは「0 件」で落ちるものと落ちないものがある | 続 | 7 | M | 節 1.6 |
| B4 | `apps/poker-web/tests/room-page-*.test.tsx` 6 本（22 行） | DRY（テスト） | 画面を出す前の設定が同じ | 読 | 6 | M | 節 3.1 |
| C3 | 同じ型の ID が 2 つ並ぶ関数 6（`removeFromRoom`・`attach`/`detach`・`attachConnection`・`removalNotificationFor`・`sendJoined`） | DbC | 引数の順序が前提（型の外） | バ | 6 関数 | M | 節 4.2 |
| B3 | `tests/spacing-css.test.ts` の補助 4 か所（44 行） | DRY | CSS を読む補助の写し。`packages/test-css` が置き場の候補 | 続 | 4 | M | 節 3.1 |
| D11 | `RosterPanel.tsx`・`handlers.ts`・`ws-adapter.ts` 冒頭の作業番号（`T057: FR-046…`） | クリーンコード | 現在の仕様書・ADR で引けない番号が残る | 読 | 3（名を挙げた `RosterPanel.tsx`・`handlers.ts`・`ws-adapter.ts`。ほかは未確認） | S | 節 5.2 |
| A10 | `apps/tasuki-sync/src/application/tool-id.ts:44-50`・`log/vocabulary.ts:88-90` | 開放閉鎖 | 道具の列挙が 2 か所に同じ綴りで並ぶ | 速 | 2 | S | 節 1.6 |
| A12 | `apps/landing/src/tools.ts:15,70-74`・`dev-hub-redirect/src/index.ts` のコメント | 開放閉鎖 | `id` の共用体と配列を足す。コメントの道具名の列挙が古くなる | 速 | 2 | S | 節 1.6 |
| B5・B6 | timer-web の `Session.*.test.tsx`・`App.connection.*.test.tsx`、tasuki-sync の `live-ws.*.test.ts` の前提の組み立て | DRY（テスト） | 同じ前提が 2〜3 本 | 読 | 2〜3 | S（優先は低い） | 節 3.1 |
| D12 | `poker-handlers.ts` 冒頭の docstring（範囲が狭い）・`ws-adapter.ts:8`（「5 つの層」が実際 7） | クリーンコード | コメントと実装のずれ | 読 | 2 | S | 節 5.2 |
| C2 | `packages/room-core/src/display-name.ts:283`（`skeletonCache`） | 関数型 | 最上位の `const` の `Map` が書き換わる。純関数のメモで害は無いが監査の外 | 続 | 1 | S（宣言するだけでも可） | 節 4.2 |
| D7 | `apps/timer-web/src/ui/components/RosterPanel.tsx`（約 480 行） | 単一責任 | 行の表示・改名・退出・並べ替え・代理追加・2 つのセクション。行を切り出せる境目がある | 読 | 1 | S | 節 5.2 |
| D8 | `apps/agenda-web/src/components/ScenarioBuilder.tsx`（`SampleMenu` :317） | 単一責任 | 下書き・組み立て・サンプルのメニューが 1 ファイル | 読 | 1 | S | 節 5.2 |
| D9 | `apps/roulette-web/src/components/RegularsSection.tsx`（state 9） | 単一責任 | 一覧・保存フォーム・検証・入力の state が集まる | 読 | 1 | S | 節 5.2 |
| C1 | ID の型 202 か所（引数 141・型の欄 61）がすべて `string` か別名 | DbC | `participantId` と `connId`・`roomCode` を取り違えても型が通る | バ・読 | 50 ファイル超 | L（決まり次第: ADR） | 節 4.2 |
| B7 | 4 アプリの `copy.ts` の文言 3 定数・4 つの core の `error-messages.ts` と同期サーバーの `connection-errors.ts` の 4〜5 文・`invite-ui` と landing の QR の文言 | DRY | 知識の重複だが各 1 行で ADR 0007 基準 2 の下 | バ・速 | 4〜6 | 決まり次第（節 8） | 節 3.3 |
| A3 | 純粋判断→`@tasuki/protocol` 4 辺（4 アプリの `server-message.ts`） | 依存の向き | 表と実体のどちらかが古い | 読 | 4 | 決まり次第（節 8） | 節 1.3 |
| A6 | 画面→ドメイン 62 辺（54 ファイル・全アプリ） | 依存の向き | 対応表に無いが、実体は全アプリが読む | — | 62 辺 | 決まり次第（節 8） | 節 1.3 |

## 7. 次の子 ISSUE の切り方の提案

前提: 1 子 ISSUE = 振る舞いを変えない PR 1 本（ADR 0013）。各 PR で既存のテスト・E2E・変異検査が通り、変異の作り直しで検出力を落とさない。順序は「効果 × 直す量」の上から、ただし**決まりを待つもの（節 8）はその ADR が先**。案は節 6 の項目を同じ PR に束ねられる単位でまとめたもので、案の番号は節 6 の並びそのものではなく、前提の順（案 1 の列挙の正本 → 案 2 の組み立ての分割）を優先した。拡張の試算は、直したあとに節 2 のスクリプトを同じ引数で流し直して、欄ごとに比べる。

| 案 | 含める項目 | 中身 | 量 | 変異 | 下がる見込みの数字 | 順序の根拠 |
|---|---|---|---|---|---|---|
| 1. 同期サーバーの道具の列挙を 1 か所から導く | A7・A9・A10・A12 | `tool-id.ts` の一覧を正本にし、`connection-gate` の `Protocol` と `if` の連なり・`TOPIC_RECIPIENT_TOOLS`・`vocabulary.ts` の綴りをそこから導く。landing の `tools.ts` の `id` の共用体も `as const` の配列から導く | S | `connection-gate` 周りの変異は作り直し | 道具の試算 code 33 → 29 前後。足し忘れが型で落ちる | 効果 2 目標 × 道具 7 系統・量 S。節 6 の最上位 A11（案 2）の前提になる。先に列挙を 1 つにしてから案 2 に入ると、組み立ての分割で触る場所が減る |
| 2. `createSyncServer` を道具ごとの組み立てに分ける | A11・A8・D3・D4 の一部 | 道具ごとの組み立て関数（ストア・配信・ハンドラ・猶予・破棄）を `create-sync-server.ts` から出す。`ws-adapter` のチャンネルと `send*`/`broadcast*` を道具の表から導く。`audit-assembly-wiring` が組み立ての集約を見ているので、分けた先を監査の対象に入れる | M | `create-sync-server` の変異は作り直し | 道具の試算 code 29 → 25 前後（`create-sync-server` の 8 か所が 1 か所に） | 案 1 の上に載せる。1 PR が大きくなるなら「組み立ての分割」と「ws-adapter のチャンネル」で 2 つに割る |
| 3. 層の逆流を直す | A1・A2・A4・A5 | 画面の型（`EndType`・`StatusStripState`）を純粋判断へ移す。`AcceptedProtocol` を application へ。`join-retry-plan.ts` の sync-client の値の import を同期フックへ。`timer-core` に `exports` を宣言し `aggregate` の入口外参照を `index.ts` 経由に（vite の alias を消せるか確かめる） | M | 変更先に変異があれば作り直し | 違反 17 辺 → 0 | 効果 2 目標。決まりを待たない 17 辺だけ。62 辺（A6）と `server-message.ts`（A3）は節 8 の改訂のあと。**同じ PR で節 9 の候補 1（層の向きの監査）を足す**と、戻りを止められる |
| 4. checkin のやり方の分岐を `Record` に寄せる | A14 | `CardFace.tsx` の `switch` と `reveal-view.ts` の `NUMERIC_METHODS` を `Record<MethodId, …>` に寄せ、足し忘れがコンパイルで落ちる形にする | S | `m501` ほか checkin-web の変異を確かめる | やり方の試算 code 5 → 4 前後。足し忘れが型で落ちる | 効果 2 目標・量 S。#406 の第 2 段（やり方を足す）の前に |
| 5. テスト支援の写しを寄せる | B1・B2・B3 | `font-base.ts` 12 か所・`scripted-web-socket.ts` 5 か所・`spacing-css` の補助 4 か所を 1 か所へ。**置き場（テスト用の共有パッケージか `packages/test-css` の拡張）は ADR が先**（節 8 の候補 3）。`web-kit` が `@types/node` を持たない制約も ADR で決める | M | テスト側の変更なので変異の宣言（テストの位置）がずれる。`--changed` で確かめる | 新しいアプリを足すとき写す数 12 → 0 | 効果 2 目標 × 12 か所。ADR のあと |
| 6. 大きなフック・部品を責務で分ける（web 側） | D1・D2・D10・D7・D8・D9 | `use-timer-sync.ts`（6 責務。`use-timer-entry` と同じ型で 2 本ほど出す）・`use-hub-sync.ts`（URL の書き換えと復帰を出す）・`useRoomEntry.ts`（effect の連鎖を純粋判断へ）・`RosterPanel.tsx` の行・`SampleMenu`・`RegularsSection` のフォーム | S × 6 | フックの変異は作り直し（`use-timer-sync` は変異が多い。`--pkg` で確かめる） | 直接は下がらない（読みやすさ） | 効果 2 目標だが範囲は各 1。**1 フック = 1 PR** にし、`use-timer-sync.ts` から。`handlers.ts`・`poker-handlers.ts` の分割は案 2 に含める |
| 7. 契約を型とテストの題に移す | C6・C5・C4・C3・C2 | 前提のコメント 9 件を、型（`StateWithAggregate` と同じ順序の目印・非空の配列）かテストの題へ。`as T` 23 と `!` 17 を仕分ける（検証済みの値への付け替えか未検証かを記録するだけで、振る舞いは変えない）。`skeletonCache` を例外として宣言するか監査の字面に足す。**未検証のものをガード（早期の戻り・Result）にするのは、壊れた入力のときの振る舞いを変えうるので、この案に入れず振る舞いを変える変更として別に起こす** | M | 仕分けだけなら変異は要らない。型・テストの題に移したものは変異を確かめる | 直接は下がらない（バグが減る） | 効果 2 目標。ブランド型（C1）は ADR のあと（節 8 の候補 4）で、この案では触らない |
| 8. クリーンコードの小物 | D11・D12・D13（用語集）・D14・D16・D17 | 作業番号の docstring を現在の参照に・`ws-adapter.ts:8` の数・`poker-handlers.ts` の冒頭・用語集に語の対応表・死んだ export 5 件・E2E の 3 本を画面ごとに割る・`live-sync-server.ts` を分ける | S | E2E の 3 本は変異の宣言（E2E 13 件）を確かめる | — | 効果は読みやすさ中心。**文書だけの項目（docstring・用語集）は 1 PR に束ね、E2E と `live-sync-server.ts` は別の PR** |

**含めないもの**: C1（ブランド型）と A6・A3（対応表）・B7（文言）は節 8 の判断が先。A15（デッキ）は #92 の前提で振る舞いを変える。D15（余計な export 191）は価値が低く、案 8 のあとに残れば lint の規則で止める方が安い（節 9 の候補 5）。

## 8. 決まりを変える候補

一般の原則とこのリポジトリの決まりが食い違った箇所。直す候補には入れず、ADR の改訂か追記として別に起こす（原則 II）。

| # | 決まり | 食い違いの中身 | 選択肢 |
|---|---|---|---|
| 1 | `docs/guides/architecture.md` の対応表「web の画面」の行 | 表は画面が読めるものにドメインを挙げないが、実体は全アプリの 54 ファイルがドメインの型・関数を読む（値 29・型 33）。純粋判断の行も「ドメインの型のみ」だが 4 アプリの `server-message.ts` が protocol を読む。**表の中でも食い違う**: 「アダプタ」行は置き場に「web アプリ」を含み、依存してよいものを「上のすべて」（ドメインを含む）とする。62 辺を違反と数えたのは「画面」行だけを読んだ判断（1.2） | (a) 表を実体に合わせる（画面→ドメインの型と値、純粋判断→protocol を許す）。(b) 画面専用の型を純粋判断に写す（写しが増え、憲法 X と衝突）。(c) アダプタ行の読みに合わせて画面行を直す（アダプタ行の「web アプリ」を残すなら、画面行・純粋判断行の「依存してよいもの」をそれに揃える。外すなら、アダプタ行の置き場から「web アプリ」を消す）。**(a) を勧める**（(c) でアダプタ行を残す読みと結果は同じ）。改訂は ADR 0015（web 層の構造）の追記 |
| 2 | ADR 0007 基準 2（20 行未満は抽出しない）と「知識の重複」の定義 | 4 アプリの `copy.ts` の文言 3 定数・4 つの core（agenda・checkin・roulette・topic）の `error-messages.ts` と同期サーバーの `connection-errors.ts` の 4〜5 文は、知識の重複だが各 1 行。基準 2 は「寄せない」、知識の定義は「寄せる」と言う。agenda-core のコメントは「同期サーバーの正本と同じ文にする」と写しを自認している | (a) 文言（1 行の定数）に基準 2 を当てない例外を ADR 0007 に追記（前例: ADR 0022 決定 2（デザインシステムの部品には ADR-0007 基準 2 を当てない）と、それを指す ADR 0007 の追記（2026-09-27・#320））。(b) 現状維持（写しを許し、コメントの約束で守る）。core が他の core を読まない境界を保つなら、文言の正本は `packages/protocol` 側になる |
| 3 | テスト支援の共有先が無い（`CLAUDE.md` の Ask first: 新しいパッケージ） | `font-base.ts`・`scripted-web-socket.ts`・`spacing-css` の補助の置き場が無い。`web-kit` は `@types/node` を持たず、`packages/test-css` は CSS の検査専用 | (a) テスト用の共有パッケージ（例: `packages/test-support`）を ADR で起こす。(b) `packages/test-css` を「テストの共有支援」に広げる。どちらも ADR 0017（パッケージ）の追記 |
| 4 | 原則 IV「境界の型安全」の範囲 | 原則は wire の入口（valibot）を指し、内側の ID の型は範囲外。ID 202 か所が `string` で取り違えが型で止まらない。`apply-room-level-event.ts` の `unique symbol` の目印は型で順序を守る実例 | ブランド型の ID を ADR 0016（core ドメインの表現）の追記で決める。入れるなら `room-core`・`roulette-core` から段階的に。入れないなら理由を残す |
| 5 | `audit-domain-side-effects` の「最上位の `let` が無いこと」 | 最上位の `const` の可変な集合（`skeletonCache`）を許す。純関数のメモで害は無い | (a) 字面を `new Map`/`new Set` の最上位の `const` に広げ、例外を宣言で持つ。(b) 現状維持。ADR 0016 の追記か、監査のコメントで決める |

## 9. 監査の候補

機械で止められる規則の破れ。既存の audit-* と同じ作り（無状態・許可リストへ倒す）で足す。ここでは候補を書くだけ（足すのは子 ISSUE）。

| # | 止めるもの | いま何件当たるか | 作り | 対応する案 |
|---|---|---|---|---|
| 1 | 層の向き（web 層と sync の層）: 内側→画面の `.tsx`・application→adapters・純粋判断→`sync-client`・`exports` に無い入口への参照 | 17 辺（62 辺は節 8 の候補 1 の判断のあと） | `a-dependency-edges.mjs` の `layerOf` と許可表を `audit-dependency-direction.mjs` に足す（同じパスの規則。web/hook と web/pure の線は名前の規則なので許可リストで倒す） | 案 3 と同じ PR |
| 2 | 道具の列挙の不整合: `tool-id.ts` の一覧と、`connection-gate`・`TOPIC_RECIPIENT_TOOLS`・`ws-adapter` のチャンネル・landing の `tools.ts`・audit の許可リスト 7 本の集合が一致する | 列挙の置き場 12 か所（節 1.6） | 一覧の正本を 1 つにしたあと、残る列挙（audit の許可リスト）を正本と突き合わせる監査。案 1・2 で列挙そのものが減れば不要になる部分がある | 案 1・2 のあと |
| 3 | core の最上位の `const` の可変な集合（`new Map`・`new Set`・配列） | 1 件（`display-name.ts:283`） | `audit-domain-side-effects.mjs` の字面に足し、例外は宣言で持つ | 節 8 の候補 5 の判断のあと |
| 4 | Given/When の区切りの下限（SC032 は比率を出すが下限が無い） | 58.1%（#496 は 65.9%） | 基準値と比べる形（後退したら落ちる。`[local-check]` の「合否の無い指標」と同じ作り） | 案 8 と別に |
| 5 | 値の死んだ export（`export` された関数・定数が自分以外のどこにも出ない） | 5 件 | `d-dead-exports.mjs` の値の部分を監査に。型の export は見ない（公開面として意図した型がある） | 案 8 のあと |
| 6 | やり方・道具の種類で分岐する `switch` の `default: return null` | 1 件（`CardFace.tsx`） | TypeScript の網羅チェック（`satisfies never` か `Record`）に寄せれば監査は要らない。lint の `switch-exhaustiveness-check` で代えられる | 案 4 で消える |

## 10. 測れなかったもの

- **依存の向き**: `require`・`.css` の `@import`・循環依存・ファイル単位の逆流（層をまたがない相対 import）は未測。web/hook と web/pure の線は名前の規則で、違反 11 辺の中身は読んでいない。テスト・`e2e/` は層で裁いていない。`timer-core/aggregate` のサーバー側の解決経路は未確認
- **拡張の試算**: 「語を知っている場所」の上限であり、「必ず触る場所」ではない。書体のサブセットの連鎖（woff2・`fonts.css`・`build-base-fonts.py`）と綴りの揺れ（`TOOL_CHECKIN`）は語で引けない（#460 で 21・#466 で 10 ファイル）。やり方・デッキは識別子 1 つで引いた。既知の値 115 は元のコマンドが残っておらず再現できない。計画の訂正の文に書いた母集合（拡張子を絞った `git grep -lw`）で引くと 74 で、115 にもならない。試算（139）とは比べられない
- **写し**: 20 行未満の写しの総量・名前が違う同じ中身・JSX の属性の並びの違い・`.css` と `.mjs` は未測。`sound.ts` の共通部分と `CurrentTopic` の中身の量は未計測。寄せたときの `audit-structure` への影響は流していない
- **契約**: `as T` 23・`!` 17 の安全／危険の仕分けは未実施。`.push` 6 行は周辺を読んだ範囲の判断。C の作業ツリーでは `conventions.mjs` が流せなかった（`typescript` 未導入。まとめ役が本体で流し、D と同じ数を得た。11.7 秒）
- **大きさ・命名**: 責務の数は上位 15 本と、直す前の数え方で effect 4 つ以上と出た 7 本を読んだ範囲。コメントのずれは 5 本の冒頭だけ。死んだ export は `export <宣言>` の形だけ（`export { … }`・`export default`・文字列での参照は見ていない）。型だけの export のうち公開面として意図したものは区別していない。「最長のケース」はインデントの簡便法
- **#496 との比較**: `conventions.mjs` は `git ls-files` でなくディレクトリを歩くので、`.mjs` の自己テスト（`scripts/`）と `docs/` に残った使い捨ての spec を拾う。`.skip` の 3 件目は `docs/superpowers/specs/2026-11-01-test-gap-survey/axe-trial.spec.ts:60`（製品のテストではない）。Given/When の比率の分母も同じ理由で増えており、#496 の数と単純には比べられない
- **並列の運び**: 4 本は同じ `f4ffbb96`（コードは main `df9b4f5e` と同じ）で測った。まとめ役の流し直しも本体の同じ HEAD。所要は A 20 分・B 13 分・C 15 分・D 14 分（並列。壁時計で約 20 分）
- **数え方の直し（`/code-review 589` の指摘）**: 2 本のスクリプトの数え方を直して数え直した。(1) `d-size.mjs` のフックの数は語の出現（`\buseEffect\b`）で数えていて、`import { useEffect } from "react"` の行と docstring の言及まで足していた。呼び出しの形で数え、import の行を落とすようにした。`useEffect` 4 つ以上は 7 本 → 3 本になり、5.1・5.2・節 6 の数を写し直した。(2) `c-contracts.mjs` の `as T` は行頭が import / export の行だけを除いていて、複数行の `import type { Participant as MembershipParticipant, … }` の中の 7 行を数えていた。import / export の宣言を空白にしてから数えるようにし、30 件・20 ファイル → 23 件・16 ファイル（application 22 → 15）になった。ほかの 4 本のスクリプトは同じ指摘で中を整えた（テストの判定の正規表現を 6 本で揃えたなど）が、出力は直す前と同じだった
