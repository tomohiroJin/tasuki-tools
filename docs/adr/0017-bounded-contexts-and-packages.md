# ADR-0017: 文脈を 3 つに割り、メンバーシップを上流に置く

- **ステータス**: Accepted（2026-09-06）
- **関連**: [#95](https://github.com/tomohiroJin/tasuki-tools/issues/95) /
  [設計正本](../superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md) /
  [`docs/adr/0007`](./0007-abstraction-criteria.md)（抽象の導入基準）/
  [`docs/adr/0016`](./0016-core-domain-representation.md)（ドメインの表現は選択制）/
  `docs/constitution.md` 原則 VI（依存は内向き）・原則 X（抽象は実需で）

## 背景

`Participant` が `packages/timer-core/src/aggregate.ts` と `packages/poker-core/src/room.ts` に
二重定義されている。表示名の規約も `display-name.ts` と `NAME_MAX_LENGTH = 24` に分かれている。

これは症状であり、原因は**境界づけられた文脈が切られていない**ことである。timer と poker は
それぞれ独立した文脈でありながら、どちらも「メンバーシップ」という第三の文脈を各自で
抱え込んでいる。型を 1 つにまとめる共有カーネルを作ると、早晩「両方のツールが必要とするもの
置き場」に腐る。

実測の根拠は設計正本 §3 に置く。ここには決定だけを書く。

## 決定

### 決定 1: 文脈を 3 つに割る

- **メンバーシップ文脈** = `packages/room-core`。ルーム・参加者・表示名・在席
- **モブタイマー文脈** = `packages/timer-core`。セッション・時計・ローテーション・出題
- **見積もり文脈** = `packages/poker-core`。ラウンド・投票・統計

**ツールのドメインは参加者エンティティを持たない（MUST NOT）。** 必要な名簿の断片は
引数で受け取る。

### 決定 2: ツールのドメインは `room-core` に依存しない

`ParticipantId` は不透明な文字列として受け取る（**MUST**）。文脈をつなぐのは
アプリケーション層の責務である。

**アプリ層（`apps/*`）が `room-core` に依存するのは本決定の対象外**であり、許される。
禁じているのはツールの**ドメイン**が上流へ依存することである。

### 決定 3: 文脈間の整合は明示的なユースケースで合成する

イベントバスを導入しない（**MUST NOT**）。購読者が 2 つの段階で導入するのは
`docs/adr/0007` 基準 3 に反する。合成は 1 関数に集め、ツールを足すときに触る場所を
1 箇所に保つ。

### 決定 4: 依存の向きを許可リストで機械的に固定する

各パッケージが依存してよい先を表で持ち、**表に無い依存を拒否する**（**MUST**）。
判定は `package.json` の `dependencies` と `import` 文の**両方**を見る。
表の正本は `scripts/audit-dependency-direction.mjs` とする。**同スクリプトは S1（#242）で
新設するため、それまでの間は[設計正本](../superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md) D17 の表が
暫定の正本である。**

**期限つきの一時依存は、期限を表に書く。** 期限を過ぎた行の削除は、その段の DoD で確認する。

### 決定 5: `room-core` は直接遷移関数 ＋ `Result` を採る

`docs/adr/0016` 決定 1 が MUST とする「どちらを採ったかと理由の記録」がこれである。
メンバーシップにイベント履歴・再生・段階適用の要求は無く、Decider を採る根拠が無い
（`docs/adr/0007` 基準 3）。

## 影響

- `packages/room-core` が新設される。`display-name.ts` がそこへ移る
- `timer-core` / `poker-core` から参加者エンティティが消える（段階的に。設計正本 §7）
- `scripts/audit-dependency-direction.mjs` が新設され、CI の `quality` ジョブで走る
- 詳細な段階分割・実測・型定義は設計正本を参照する。**本 ADR に転記しない**

## 追記（2026-09-07・#242 / S1）

**決定 4 の暫定規定は解消した。** 決定 4 は「同スクリプトは S1（#242）で新設するため、
それまでの間は設計正本 D17 の表が暫定の正本である」としていたが、S1 で
`scripts/audit-dependency-direction.mjs` を新設した。**依存の向きの正本は同スクリプトの
`ALLOWED` である。** 設計正本 D17 の表は**最終形の目標**であり、現在の実体とは異なる
（例: `landing → room-core, protocol, sync-client, ui` は目標であって、S1 完了時点の実体は
`apps/landing: ["@tasuki/ui"]` である）。**現況を知りたいときは `ALLOWED` を見ること。**

**期限つき一時依存 `timer-core → room-core` の期限は 2 段に分かれる。**
混同しやすいので明示する（設計正本 §D17 の該当箇所に対応する）。

| 何を | いつ | 根拠 |
|---|---|---|
| 依存そのもの（`timer-core` が `room-core` を取り込むのをやめる） | **S4b**（#246）※下の改定を読むこと | timer-core から表示名の扱いが消える段 |
| `ALLOWED` からその行を削除する | **S4b**（#246） | 行が残っても検査は緑のままなので、S4b の DoD で確認する |

**検査は 4 つの経路を見る。** 決定 4 の本文は `package.json` と import 文の 2 つを挙げて
いるが、実装は次の 4 つを見る。3 つめまでを塞いでも、4 つめ（相対パスでの越境）が残ると
**規範を迂回する側だけが通る**（`@tasuki/room-core` と書けば赤いのに
`../../room-core/src/display-name.js` と書けば緑、という状態が実際にあった）。

1. 宣言と実体の全単射照合（`docs/adr/0014` 決定 1。権威は pnpm 自身）
2. `package.json` の依存宣言（`dependencies` と `devDependencies`）
3. 追跡下の `.ts` / `.tsx` の import 指定子（`src` に限らない。テストからの逆流も依存である）
4. 同じ import 文のうち、パッケージの外へ出る相対パス

## 改定（2026-09-10・#95 S4a） — 依存を外す期限を S4a から S4b へ送り直した

上の「期限つき一時依存の期限は 2 段に分かれる」表は、**依存そのものを外す段を S4a（#245）**
と書いていた。S4a を実施した時点の実体は次のとおりで、**依存は残っている**（2026-09-10 実測）。

- `packages/timer-core/package.json` の `dependencies` に `"@tasuki/room-core": "workspace:*"` がある
- `packages/timer-core/src/schemas.ts` が `normalizeDisplayName` を `@tasuki/room-core` から取り込む

S4a（#245）が外したのは**名簿そのもの**（`Participant` の保管）であって、
**境界での表示名の正規化**ではない。後者を外すには timer の wire 契約の検証を
どこへ置くかを決める必要があり、それは S4b（#246・在席と多接続の段）の範囲である。

**そこで上表の 1 行目を S4b へ直した**（`docs/adr/0002` の追記が許す、改定節つきの本文訂正）。
これで 2 行とも S4b になり、`scripts/audit-dependency-direction.mjs` の `ALLOWED` に付いた
注記「⏳ S4b で削除する」とも一致する。**決定 2・決定 4 そのものは変えていない** ——
一時依存であること、期限を書くこと、許可リストで機械的に固定することは同じである。

**期限が動いたので、S4b の DoD では次の 2 つを別々に確認すること。**
①`timer-core` が `room-core` を取り込まなくなったこと、②`ALLOWED` からその行が消えたこと。
①だけを済ませて②を忘れても検査は緑のままである（この表がもともと警告していた形）。

## 追記（2026-09-11・#95 S4b） — 期限つき一時依存 `timer-core → room-core` を解消した

**期限が来たので外した。** 上の改定が求めた 2 つを、どちらも実測で確認した（2026-09-11）。

| 何 | 実測 |
|---|---|
| ① `timer-core` が `room-core` を取り込まなくなった | `packages/timer-core/package.json` の `dependencies` から `"@tasuki/room-core"` を削除（`pnpm-lock.yaml` も更新）。`packages/timer-core` 配下に `@tasuki/room-core` の import は 0 件 |
| ② `ALLOWED` からその行が消えた | `scripts/audit-dependency-direction.mjs` の `"packages/timer-core"` は `[]` になった |

**外し方は「規約はメンバーシップ文脈に残し、適用する場所を移す」である。** 表示名の
正規化と上限は `@tasuki/room-core`（`display-name.ts`。`MAX_DISPLAY_NAME` と
`MAX_NFKC_EXPANSION` も timer-core からここへ移した）に置いたまま、それを**境界で適用する
関数**を合成ルートへ新設した（`apps/tasuki-sync/src/application/normalize-command-names.ts`。
`adapters/ws-adapter.ts` がパース直後に 1 度だけ呼ぶ）。timer の wire スキーマ
（`CommandSchema`）は表示名を素の文字列として受けるだけになった。

**利用者が受け取るフレームは変えていない。** 正規化の失敗は、スキーマが落としていたときと
同じ `INVALID_COMMAND`（同じ文言）で返る。移設で配線が死んでいないことは実 WS の検査
（`apps/tasuki-sync/test/live-ws.display-name.test.ts`）で見ており、**配線を切ると
そのうち 1 本が赤になることも確認した**（原則 VII）。

**破壊検証（設計正本 §6.3 の 3 通り）**も実施した。

1. `packages/timer-core` から `@tasuki/room-core` を import する → 赤
2. `package.json` にだけ書いて import しない → 赤
3. どちらもしない → 緑（対照）

決定 2・決定 4 そのものは変えていない。**表に期限つきの一時依存はもう 1 件も無い。**

## 追記（2026-09-25・#91 PR 3） — 文脈が 4 つになった

[#91](https://github.com/tomohiroJin/tasuki-tools/issues/91) で**お題の文脈** = `packages/topic-core`
（ルームごとのお題と、その生成の帳簿）が加わった。決定と理由は
[`docs/adr/0021`](./0021-topic-as-shared-context.md) にある。

**決定 1〜5 はそのまま当てはまる。** お題の文脈はツールのドメインと同格で、
`timer-core`・`poker-core` は `topic-core` に依存しない（`docs/adr/0021` 決定 1）。
お題のタイトルを timer の完成記録へ写す合成はアプリ層（`apps/tasuki-sync`）が行う（決定 3 の形）。
`topic-core` の表現の記録（`docs/adr/0016` 決定 1）は `docs/adr/0021` 決定 5 である。

**決定 1 がモブタイマー文脈に挙げた「出題」は、#91 PR 3 でお題の文脈へ移った。** `timer-core` から
お題の型・定型バンク・検証・プロンプトの組み立ては消え、`topic-core` が持つ。

決定 1 の見出しは「3 つに割る」のまま残す（決定当時の記録である）。**依存の向きの現況は、
決定 4 と 2026-09-07 の追記のとおり `scripts/audit-dependency-direction.mjs` の `ALLOWED` を見ること。**
ここへ表を写さない。

## 追記（2026-10-12・#94 PR 1） — 文脈を 5 つにする

[#94](https://github.com/tomohiroJin/tasuki-tools/issues/94) で**ルーレットの文脈** = `packages/roulette-core`
（入る人・一周の規則（#427 で撤回）・回転の帳簿）が加わった。決定と理由は
[`docs/adr/0026`](./0026-facilitator-roulette.md) にある。

**決定 1〜5 はそのまま当てはまる。** ルーレットの文脈はツールのドメインと同格で、**`room-core` を含むどの `@tasuki/*` にも
依存しない**（参加者 ID は不透明な文字列で、名簿の断片はアプリ層が引数で渡す・決定 2）。`timer-core`・`poker-core`・
`topic-core` は `roulette-core` に依存しない。名簿・お題・ルーレットの状態をつなぐ合成はアプリ層
（`apps/tasuki-sync`）が行う（決定 3 の形）。`roulette-core` の表現の記録（`docs/adr/0016` 決定 1）は
`docs/adr/0026` 決定 6 である。

決定 1 の見出しは「3 つに割る」のまま残す（決定当時の記録である）。**依存の向きの現況は
`scripts/audit-dependency-direction.mjs` の `ALLOWED` を見ること。** ここへ表を写さない。

## 追記（2026-10-20・#429 PR 1） — 文脈を 6 つにする

[#429](https://github.com/tomohiroJin/tasuki-tools/issues/429) で**進行タイマーの文脈** = `packages/agenda-core`
（シナリオの検証と展開・進行の遷移・見込みの計算）が加わった。決定と理由は
[`docs/adr/0027`](./0027-agenda-timer.md) にある。

**決定 1〜5 はそのまま当てはまる。** 進行タイマーの文脈はツールのドメインと同格で、**`room-core` を含むどの `@tasuki/*` にも
依存しない**（参加者を扱わない）。`timer-core`・`poker-core`・`topic-core`・`roulette-core` は `agenda-core` に依存しない。
在席の確認・お題の配信と進行の状態をつなぐ合成はアプリ層（`apps/tasuki-sync`。#429 の PR 2 で入れた）が行う（決定 3 の形）。
`agenda-core` の表現の記録（`docs/adr/0016` 決定 1）は `docs/adr/0027` 決定 7 である。

決定 1 の見出しは「3 つに割る」のまま残す（決定当時の記録である）。**依存の向きの現況は
`scripts/audit-dependency-direction.mjs` の `ALLOWED` を見ること。** ここへ表を写さない。

## 追記（2026-10-28・#406 段 1） — 文脈を 7 つにする

[#406](https://github.com/tomohiroJin/tasuki-tools/issues/406) で**会の始まりと終わりの札の文脈** = `packages/checkin-core`
（やり方の定義・札を出す／開く／もう一回の遷移・受け手ごとの投影・境界のスキーマ）が加わった。決定と理由は
[`docs/adr/0028`](./0028-checkin-cards.md) にある。

**決定 1〜5 はそのまま当てはまる。** この文脈はツールのドメインと同格で、**`room-core` を含むどの `@tasuki/*` にも
依存しない**（参加者 ID は不透明な文字列で、札を出す人の一覧はアプリ層が引数で渡す）。`timer-core`・`poker-core`・
`topic-core`・`roulette-core`・`agenda-core` は `checkin-core` に依存しない。名簿・在席・お題と札の状態をつなぐ合成は
アプリ層（`apps/tasuki-sync`。段 2 で入れる）が行う（決定 3 の形）。`checkin-core` の表現の記録（`docs/adr/0016` 決定 1）は
`docs/adr/0028` 決定 10 である。

決定 1 の見出しは「3 つに割る」のまま残す（決定当時の記録である）。**依存の向きの現況は
`scripts/audit-dependency-direction.mjs` の `ALLOWED` を見ること。** ここへ表を写さない。

## 追記（2026-11-14・#599） — テスト支援の共有先（Proposed）

- **この追記の状態**: **Proposed**。採択は人が決める（`docs/adr/0030` 決定 1）。採択されるまで、下の「決定」は効かない
- **関連**: [#599](https://github.com/tomohiroJin/tasuki-tools/issues/599)（親 #482）/
  [#594](https://github.com/tomohiroJin/tasuki-tools/issues/594)（写しを寄せる。この追記が前提）/
  [調査の記録](../superpowers/specs/2026-11-13-architecture-review-survey.md) 節 3.1・節 8 の 3 /
  [`docs/adr/0007`](./0007-abstraction-criteria.md)（抽象の導入基準）/
  [`docs/adr/0014`](./0014-scan-target-integrity.md)（走査対象は宣言と実体の照合で決める）/
  [`docs/adr/0026`](./0026-facilitator-roulette.md) 決定 1・[`docs/adr/0027`](./0027-agenda-timer.md)・[`docs/adr/0028`](./0028-checkin-cards.md)、本 ADR の追記（2026-10-12・2026-10-20・2026-10-28）（0026・0027・0028 は「`room-core` を含むどの `@tasuki/*` にも依存しない（MUST NOT）」、本 ADR の追記は同じことを「依存しない」と平叙で書く。その範囲を決まり 5 で絞る）

### 背景

テストの補助が、パッケージをまたいで写されている。数えたのは 2026-11-14・origin/main `882f7954` の追跡下のファイル。

| 写し | 本数 | 数えたコマンド | 持つ知識 |
|---|---|---|---|
| `tests/support/font-base.ts`（timer-web は `test/support/`） | 12 | `git ls-files \| grep -cE '/font-base\.ts$'` | 書体の常用の層（base）の範囲に字が収まるかの判定。12 本で 628 行（`wc -l`）。md5 は 3 通り（7＋4＋1）。違いは `fonts.css` への相対パスの深さと、web-kit 版の書き方（`/// <reference types="node" />` と注記のコメント 2 行・`baseFaces()` の結果を変数に出してループの外へ移したこと）など |
| `tests/support/scripted-web-socket.ts` | 5 | `git ls-files \| grep -cE '/scripted-web-socket\.ts$'` | 台本つきの偽の WebSocket。`export class ScriptedWebSocket` の 42 行（宣言の行から閉じ括弧まで。4 アプリは 2〜43 行目・web-kit は 5〜46 行目）が 5 本で同じ（md5 が一致）。4 アプリどうしは 1〜53 行目が同じ（`cmp`）。残りはアプリごとの固定データ。行数は 94・91・87・54・52（agenda-web・checkin-web・roulette-web・topic-web・web-kit。`wc -l`）。調査の記録の「25 行」は正規化後の数 |
| `tests/spacing-css.test.ts`（timer-web は `test/ui/`）の補助 | 4 | `git ls-files \| grep -cE '/spacing-css\.test\.ts$'` | CSS を字で読む補助（`read`・規則の切り出しなど）。検査の本体はアプリごとに別物 |

写す側の 12 パッケージは次のとおり（`scripted-web-socket.ts` と `spacing-css` の 9 本は、すべて `font-base.ts` を持つパッケージの中にある）。
apps が agenda-web・checkin-web・landing・poker-web・roulette-web・timer-web・topic-web、packages が agenda-core・checkin-core・invite-ui・roulette-core・web-kit。

どれも `docs/adr/0007` の基準 1（利用者 2 以上）と基準 2（20 行以上）を満たす同じ知識の写しで、片方を直し忘れても検査は緑のままである（調査の記録 節 3.1）。
寄せられない理由は**置き場が決まっていない**ことだった（調査の記録 節 8 の 3）。web-kit は `@types/node` を持たず、写しが node の型を自分で取っている。

**試験専用の置き場は、すでに 1 つある。** `packages/test-css`（`@tasuki/test-css`。#554・PR #559 で作った）である。この置き場の決定は、ADR には記録が無い（`git grep -n "test-css" -- docs/adr` は 0 件）。仕組みは次のとおりで、この追記はそれを前提にする。

- 中身は `.mjs` と、手で書いた型宣言 `.d.mts` だけ。読む側の型検査は `.d.mts` だけを見る。`package.json` の `exports` は `.` の 1 つだけ
- 読む側は `devDependencies` に `"@tasuki/test-css": "workspace:*"` と書く（いま packages/ui・apps/timer-web・apps/agenda-web の 3 つ）
- `scripts/audit-dependency-direction.mjs` の `TEST_ONLY` に載っていて、読む側の `tests/`・`test/` と e2e の外（設定ファイルを含む）から取り込むと、`ALLOWED` にあっても違反（`via: "試験専用"`）になる
- `scripts/audit-structure.mjs`・`scripts/audit-domain-side-effects.mjs`・`scripts/audit-log-hygiene.mjs` の `EXCLUDED_PACKAGES` に理由つきで載っている（TS を持たず、ドメインも副作用も無いため）

### 選択肢

| | (a) テスト支援のパッケージ（名は `test-support`）を `packages/` に新しく作る | (b) `packages/test-css` を広げる |
|---|---|---|
| 新しく作るもの | パッケージ 1 つ（決定 4 の表に行を足す。依存の向きは決定なので、表を広げる変更は人が通す） | なし。役割の説明を「試験の共有支援」に書き直す |
| 監査に載せる場所 | 走査の宣言を持つ 4 本（`audit-dependency-direction`・`audit-structure`・`audit-domain-side-effects`・`audit-log-hygiene`）すべてに新しい行。`TEST_ONLY` に 1 つ足す | 4 本とも行は増えない。3 本の除外の理由の文を書き直す |
| `ALLOWED` に足す読む側 | 上の 12 パッケージ（`@tasuki/test-support`） | 上の 12 から、すでに `@tasuki/test-css` を持つ timer-web・agenda-web を引いた 10（12 は `font-base.ts` を持つパッケージ。`scripted-web-socket.ts`・`spacing-css` を持つパッケージはその中に入るので、数は増えない） |
| 名前と中身 | 合う | `font-base`（`fonts.css` の `@font-face` を読む）と `spacing-css` の補助は CSS を読む知識で名前に合う。`scripted-web-socket` は合わない |
| 試験専用の置き場の数 | 2 つ（同じ仕組みを 2 か所で守る） | 1 つ |

### 勧め: (b) `packages/test-css` を広げる

1. **同じ仕組みの置き場を 2 つ持つ理由が無い。** (a) の利点は名前だけで、守る決まり（製品コードから読まない・devDependency だけ・node の型を読む側へ出さない）は (b) と同じである。置き場を 2 つにすると、決まりと監査の行を 2 か所で守ることになる（`docs/adr/0007` 基準 3・憲法 原則 X）
2. **CSS を読む知識が、すでに 2 か所に割れている。** `spacing-css` の補助は `@tasuki/test-css` の `rules` と同じ「CSS を字で読む」知識を別の形（セレクタを配列で持つ）で持っている。(a) にすると、CSS を読む知識が `test-css` と `test-support` の 2 つの置き場に分かれたまま残る
3. **`@types/node` の問題は、置き場の作りで消える。** node の API を使う書体の判定を `.mjs` に書き、型は `.d.mts` に書けば、読む側（web-kit を含む）は `@types/node` を足さなくてよい（下の決まり 4）。この作りは (a) でも同じだが、(b) なら既にある
4. **監査への反映が小さい。** (a) は走査の宣言を持つ 4 本の監査すべてに行が増える（足し忘れると宣言と実体の照合で赤くなる。`docs/adr/0014` 決定 1）。(b) は理由の文の書き直しで済む

**名前が中身に合わないこと（`scripted-web-socket`）は受け入れる。** 改名（例: `test-support`）はしない。`packages/test-css` のパスは変異のパッチ 5 本（`grep -l "packages/test-css" scripts/mutations/*.patch | wc -l`）が持っていて、改名するとそれらを作り直すことになる。改名の利点は名前だけで、その費用に見合わない。

### 決まり（採択されたら効く）

1. **製品コードから読まない（MUST NOT）。** 読んでよいのは、読む側のパッケージの `tests/`・`test/` の下と e2e だけ。いまの `TEST_ONLY` の検査がそのまま当たる。製品コードが自分の `tests/`・`test/` を相対パスで読む経路も、いまの検査が止める
2. **読む側は `devDependencies` にだけ書く（MUST）。** `dependencies`・`peerDependencies`・`optionalDependencies` に書くと、宣言の上では製品の依存と見分けがつかなくなる。**いまの監査はこれを見ていない**（`observe` は `dependencies` と `devDependencies` だけを読み、2 つを区別せずに集める。`peerDependencies`・`optionalDependencies` は読まない）。採択後に、この 3 つのどれかに書いたら赤くなる検査を足す（下の「監査への反映」）
3. **`@tasuki/test-css` 自身は `@tasuki/*` に依存しない（MUST）。** `ALLOWED` の `"packages/test-css": []` のまま保つ。書体の判定が読む `packages/ui/src/tokens/fonts.css` は、import でなくファイルとして読む（いまの 12 本の写しと同じ）。この読み方は依存の向きの監査の 4 つの経路の外にある。読む先が動いたときに赤くなるのは、`baseFaces()` が 3 面を返すことを見る試験（いま各アプリにある）である。**ただし、`@tasuki/ui` に依存しない読む側では、いまのままだと turbo のキャッシュで効かない。** `turbo.json` は `test` に `inputs` を書いておらず、既定の入力はそのパッケージの中のファイルである。`@tasuki/ui` に依存する読む側では、`@tasuki/ui#build` がスクリプトを持たなくてもタスクとしてグラフに入り（`dependsOn: ["^build"]`）、`fonts.css` を変えるとそのハッシュが変わるので、`test` のハッシュも変わる。依存しない読む側では、`fonts.css` はハッシュのどこにも入らず、キャッシュの緑が再生される。実測（2026-11-14・turbo 2.11.10・`turbo run test --dry=json` を 8 パッケージに絞って流し、`fonts.css` の末尾にコメントを 1 つ足す前と後でタスクのハッシュを比べた）: 変わったのは `@tasuki/ui#build` と、agenda-web・landing・poker-web の `test`。変わらなかったのは agenda-core・checkin-core・roulette-core・invite-ui・web-kit の `test`。写しを持つ残りの 4 アプリ（checkin-web・roulette-web・timer-web・topic-web）は測っていないが、`ALLOWED` で `@tasuki/ui` を許され依存しているので、測った 3 アプリと同じになるはずである（推測）。いまの写しでも、この 5 つは同じ穴を持つ。採択後の最初の PR で、読む側の `test` の入力に `fonts.css` を足す（足し方は下の「`fonts.css` を入力に足す場所」）。足したことは、同じ dry-run を `fonts.css` を 1 字変える前と後で流し、5 つの `test` のハッシュが変わることで確かめる（原則 VII）
4. **`@types/node` は読む側に求めない。** node の API（`node:fs` など）を使う補助（書体の判定。いまの `css-text.mjs` も同じ）は、実装を `.mjs` に書き、型を `.d.mts` に手で書く。`.d.mts` は node の型を出さない（引数・戻り値に node の型を使わない・`/// <reference types="node" />` を書かない）。web-kit の写しが持つ `/// <reference types="node" />` は、寄せると要らなくなる。**node の API を使わない補助は TypeScript（`.ts`）のまま置く。** 偽の WebSocket（`ScriptedWebSocket`）がこれに当たる。手で書く `.d.mts` は実装との照合が無く、食い違っても型検査が通る。`.ts` なら、ほかのワークスペースのパッケージ（`web-kit`・`invite-ui` など）と同じく `exports` から `.ts` を指し、読む側の型検査が中身まで見る。試験が書き戻す可変の `static instances`（各試験の `beforeEach` で `ScriptedWebSocket.instances = []` とする）も、`.ts` ならいまの宣言のまま型で守られる
5. **「どの `@tasuki/*` にも依存しない（MUST NOT）」は、製品の依存について言うものと読む。試験専用の `@tasuki/test-css` は除く。** agenda-core・checkin-core・roulette-core の試験が書体の判定を読むので、この 3 つの `ALLOWED` に `@tasuki/test-css` が入る。一方、`docs/adr/0026` 決定 1・`docs/adr/0027`・`docs/adr/0028` は、これらの core が「`room-core` を含むどの `@tasuki/*` にも依存しない（MUST NOT）」と書く。本 ADR の追記（2026-10-12・2026-10-20・2026-10-28）は、同じことを MUST NOT の語を付けずに「`room-core` を含むどの `@tasuki/*` にも依存しない」と書く。監査は `devDependencies` も依存に数える（`audit-dependency-direction.mjs` の `observe`）ので、devDependency にしても字面の上では MUST NOT に当たる。**この追記を採択することは、上の MUST NOT の範囲を「製品の依存（`src` と設定ファイルから読むもの・`dependencies`）」に絞り、`@tasuki/test-css` を試験から読むことだけを除く、と認めることを含む。** 除くのは名指しした `@tasuki/test-css` だけで、将来 `TEST_ONLY` に足すパッケージは含まない（足すなら改めて ADR を通す）。 採択する人は、0026・0027・0028 の該当の文と本 ADR の過去の追記も、この読みで読むことを認める（各 ADR は書き換えない。`docs/adr/0002` の追記のみの決まり）。絞ってよい理由: MUST NOT が守っているのは、ツールのドメインが他の文脈（名簿・お題など）の知識を取り込まないことである（決定 2）。`@tasuki/test-css` は文脈を持たず、決まり 1 によって `src` からは読めないので、文脈の知識は入らない。絞らずに 3 つの core だけ写しを残す道もあるが、それでは書体の判定の写しが 3 本残り、#594 の目的（判定を 1 か所にする）を果たせない。`ALLOWED` の各行のコメント「`@tasuki/*` に依存しない」は「製品コードは `@tasuki/*` に依存しない（試験だけが `@tasuki/test-css` を読む）」と書き直す。**ドメインでない読む側のうち、web-kit と invite-ui も同じ扱いにする。** どちらも書体の判定の写しを持つので、`ALLOWED` に `@tasuki/test-css` が入る。web-kit の行は `@tasuki/markdown`・`@tasuki/sync-client` を許す表であり、`@tasuki/*` に依存しないとは決めていない（`ALLOWED` のコメント・#369・#371）。足すのは試験の側の 1 行で、製品の依存は変わらない。invite-ui は `docs/adr/0020` が「ドメイン・同期クライアント・URL の組み立てには依存しない」と書き、`ALLOWED` の行は `[]` である。0020 が守るのは製品のコードの依存で、`@tasuki/test-css` はドメインでも同期でもない。上と同じく、この追記の採択は 0020 の依存の範囲を製品の依存に読むことを含む。ほかの読む側（apps の 5 つ）は `ALLOWED` に多くの `@tasuki/*` を持ち、足すことで決まりと食い違う文は無い
6. **判定を壊したら赤くなる試験が要る。** 寄せた判定は 1 つになるので、それを読む試験すべてが同じ判定に頼る。いま「外れる字を拾う」ことを確かめる試験（`outsideBase(['議論'])` が空でない、など）は agenda-web・checkin-web・landing にある（`git grep -n -A4 "outsideBase(" -- '*.test.ts' '*.test.tsx'` で読んだ範囲）。寄せたあとも、判定を壊すと赤くなることを #594 で確かめる（憲法 原則 VII）

#### `fonts.css` を入力に足す場所（決まり 3）

| | `globalDependencies` に足す | `test` の `inputs` に足す |
|---|---|---|
| 書き方 | `"globalDependencies": [..., "packages/ui/src/tokens/fonts.css"]` | 基底の `test` と、個別に定義した `<core>#test`（いま timer-core・room-core・topic-core・roulette-core・agenda-core・checkin-core の 6 つ）のそれぞれに `"inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/packages/ui/src/tokens/fonts.css"]`。`package#task` は基底を継承しないので、個別の定義にも書く |
| `fonts.css` を変えたときに外れるキャッシュ | **全パッケージの全タスク**（build・lint・typecheck を含む）。turbo の文書（`node_modules/turbo/docs/reference/configuration.mdx` の `globalDependencies` と `--affected` の注記）のとおり、`--affected` でも全タスクが選ばれる | 全パッケージの `test` だけ |
| 足し忘れの起きやすさ | 1 行で済む | 個別の `<core>#test` を足すたびに書く（書き忘れると、そのパッケージだけ穴に戻る） |

**勧め: `test` の `inputs` に足す。** `fonts.css` を変えたコミットは `git log --oneline origin/main -- packages/ui/src/tokens/fonts.css` で 3 件と少なく、どちらでも費用は小さい。それでも `inputs` を勧めるのは、外れるキャッシュを、`fonts.css` を読む試験に限れるからである（lint・typecheck・build は `fonts.css` を読まない）。足し忘れの弱さは、`<core>#test` を足すときに基底の `inputs` と同じ並びがあるかを、採択後の最初の PR の自己テスト（`turbo.json` を読む `node:test`）で見ることで補う。なお、CI は turbo のキャッシュを持ち越さない（`.github/workflows/` の `actions/cache` が持つのは E2E と Playwright の置き場だけ）。この穴が緑を再生するのは手元だけで、CI は毎回流し直す。このリポジトリは `--affected` を使っていない（`git grep -n "affected" -- .github package.json` で該当なし）。

### 監査への反映（(b) の場合）

| 監査 | 何を変えるか | いつ |
|---|---|---|
| `scripts/audit-dependency-direction.mjs` の `ALLOWED` | 読む側の行に `"@tasuki/test-css"` を足す。apps/checkin-web・apps/landing・apps/poker-web・apps/roulette-web・apps/topic-web・packages/agenda-core・packages/checkin-core・packages/invite-ui・packages/roulette-core・packages/web-kit の 10 行。実際に読む PR で、読む行だけ足す（使わない許可を先に置かない） | #594 |
| 同 `TEST_ONLY` | 変えない（`["@tasuki/test-css"]` のまま） | — |
| 同 `observe` と `findViolations` | `observe` に `peerDependencies`・`optionalDependencies` も読ませ、`TEST_ONLY` のパッケージを `dependencies`・`peerDependencies`・`optionalDependencies` のどれかに書いたら違反にする（決まり 2）。`devDependencies` に書いたものは今までどおり `ALLOWED` で裁く。自己テスト（`scripts/audit-dependency-direction.test.mjs`）に、3 つそれぞれに書いて赤・`devDependencies` に書いて緑の 4 本を足す。`peerDependencies`・`optionalDependencies` に書いた `TEST_ONLY` 以外の `@tasuki/*` も、`ALLOWED` で裁く対象に入る | 採択後の最初の PR |
| `scripts/audit-structure.mjs` の `EXCLUDED_PACKAGES` | `packages/test-css` の行は残す。理由の文の「CSS を字で読む小さな解析器」「`.mjs` と型宣言（`.d.mts`）だけ」を、試験の共有支援（CSS を読む・書体の判定・偽の WebSocket）と、製品コードを持たないことに書き直す。#594 で `.ts`（偽の WebSocket）が入ると「TS を持たない」は嘘になる。この 3 本の監査の除外は、除外したパッケージが走査対象を持つようになっても落ちない（宣言と実体の照合だけを見る）ので、理由の文は人が直す。同じく、`packages/test-css` は `lint` のスクリプトを持たないので、`.ts` を置くと lint の外に出る。#594 で `lint` を足すか、外に出ることを理由の文に書く | 採択後の最初の PR（文）・#594（`.ts` が入るとき、文がまだ合うかを見直す） |
| `scripts/audit-domain-side-effects.mjs`・`scripts/audit-log-hygiene.mjs` の `EXCLUDED_PACKAGES` | 同じく、理由の文だけを書き直す | 採択後の最初の PR |
| `turbo.json` の `test` と各 `<core>#test` の `inputs` | `"$TURBO_DEFAULT$"` と `"$TURBO_ROOT$/packages/ui/src/tokens/fonts.css"` を書く（決まり 3 の勧め）。並びがそろっていることを見る自己テストを足す | 採択後の最初の PR |
| `scripts/lib/shuffled-tests.test.mjs` | `packages/test-css` に `test` スクリプトを足したときだけ、対象外の一覧の期待を直す | 足すとき |

ISSUE の完了条件にある「`audit-structure` の対象に入る」は（この読み替えは `audit-structure` 側だけに当たる。`audit-dependency-direction` には `ALLOWED` の行として、いまも対象に入っている）、(b) では**宣言と実体の照合に、理由つきの除外として載っていること**を指す（`docs/adr/0014` 決定 1・決定 2）。すでに載っているので、理由の文を中身に合わせる。

(a) を採る場合は、上の各監査に新しいパッケージの行を足し（`ALLOWED` の `[]`・`TEST_ONLY`・3 本の `EXCLUDED_PACKAGES`）、読む側の 12 行に `@tasuki/test-support` を足す。決まり 1〜6 はそのまま当てる。

### 採択後の手順

1. **最初の PR（#599 の残り）**: `packages/test-css` の役割の説明（`package.json` と `.d.mts` の冒頭・`packages/ui/README.md` の該当の段落）と、3 本の監査の除外の理由を書き直す。`turbo.json` の `test` と各 `<core>#test` の `inputs` に `fonts.css` を足す（決まり 3）。`TEST_ONLY` を `dependencies`・`peerDependencies`・`optionalDependencies` に書いたら赤くなる検査を、先に落ちる自己テストを書いてから足す。壊して確かめる（憲法 原則 VII）:
   1. 製品コード（例: `apps/landing/src/` の 1 ファイル）から `@tasuki/test-css` を import する → 赤（`試験専用`）
   2. 読む側の `package.json` の `dependencies`・`peerDependencies`・`optionalDependencies` に書く → それぞれ赤（足した検査）
   3. `devDependencies` に書き、`tests/` からだけ読む → 緑（対照）
2. **#594（写しを寄せる）**: 3 つの写しを `packages/test-css/src/` へ移す。書体の判定は `.mjs` ＋ `.d.mts`、偽の WebSocket は `.ts`（決まり 4）。`spacing-css` の補助は、`read` が `node:fs` の `readFileSync` を使う（`apps/poker-web/tests/spacing-css.test.ts` の 5・10 行目）ので、決まり 4 のとおり `.mjs` ＋ `.d.mts` にする。`packages/test-css/package.json` の `exports` はいま `.` だけなので、移したものごとにサブパスの入口を足す（例: `./font-base`・`./scripted-web-socket`。`.mjs` には `types` と `default`、`.ts` には `.ts` を指す 1 行）。**`css-text.mjs` は書き換えず、新しいファイルとして足す。** `css-text.mjs` には変異のパッチ 5 本（`grep -l "css-text.mjs" scripts/mutations/*.patch`。m1303・m1307・m1308・m1313・m1324）が当たっていて、書き換えると当たらなくなる恐れがある。書き換えるしかないときは、5 本が当たるかを `git apply --check` で確かめ、当たらなければ作り直す（`docs/guides/procedures/mutations.md`）。読む側の `devDependencies` と `ALLOWED` を足して写しを消す。`spacing-css` の補助を既存の `rules` と 1 つにするか、別の関数として並べるかは、そこで決める（セレクタの持ち方が違う）。写しの場所を名指ししている文（`scripts/fonts/build-base-fonts.py` の docstring・`packages/ui/README.md` の `tests/support/font-base.ts`）も直す
3. **この追記を Accepted にするのは人**。採択の日付と判断した場所を、この節の「状態」の行に書く
