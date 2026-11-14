# ADR-0016: ドメインの表現は選択制とし、揃える点を定める

- **ステータス**: Accepted（2026-08-17）
- **関連**: [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)（ADR に沿ったリファクタリング、
  親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）/
  [`docs/adr/0005`](./0005-result-and-boundary-validation.md)（Result と境界検証）/
  [`docs/adr/0007`](./0007-abstraction-criteria.md)（抽象の導入基準）/
  [`docs/timer/adr/0002`](../timer/adr/0002-decider-pure-domain.md)（timer が Decider を採った記録）/
  `docs/constitution.md` 原則 VI（依存は内向き）・原則 X（抽象は実需で）

## 背景

`packages/timer-core` と `packages/poker-core` は、どちらも `Result` を返す純粋
ドメインだが、表現が揃っていない（2026-08-17 実測）。

| | `packages/timer-core`（4,234 行 / 14 ファイル） | `packages/poker-core`（462 行 / 7 ファイル） |
|---|---|---|
| 状態遷移 | `decide(cmd, agg, now): Result<DomainEvent[], DomainError>` ＋ `evolve(agg, event, now): Aggregate` | `castVote(room, participantId, card): Result<Room, RoundError>` を含む 8 関数 |
| 中間表現 | `DomainEvent` を挟む | 挟まない |
| エラー型 | `{ type: "DuplicateName"; name: string }` 等。文言を持たず `displayMessageFor()` が生成 | `{ code: 'not-voting'; message: '現在は投票を受け付けていません' }` 等。文言を同梱 |
| `index.ts` | 公開記号を明示列挙 | `export * from './deck'` ほか 6 行 |
| 決定の記録 | [`docs/timer/adr/0002`](../timer/adr/0002-decider-pure-domain.md) | **ADR が 1 本も無い** |

**共通しているのは `Result` を返すこと（[`docs/adr/0005`](./0005-result-and-boundary-validation.md)）だけである。**

一方へ寄せる案は 2 つとも採らなかった。poker を Decider へ寄せる案は、poker の
ドメインが 462 行 / 8 遷移関数で、イベント履歴・再生の要求が現に無いため
[`docs/adr/0007`](./0007-abstraction-criteria.md) の基準 3（パターンは変更が現に困難な
ときに限る）を満たさない。timer を直接遷移へ寄せる案は、4,234 行の全面書き換えと
[`docs/timer/adr/0002`](../timer/adr/0002-decider-pure-domain.md) の `Superseded` を要し、
timer では Decider が現に効いている以上、後退である。

## 決定

### 決定 1: 表現は選択制とし、選択を記録する

- イベントの履歴・再生・段階適用が要るドメインは **Decider**（`decide` / `evolve`）を採る。
- 状態遷移だけで足りるドメインは **直接遷移関数 ＋ `Result`** を採る。
- **どちらを採ったかと、その理由を、そのアプリの ADR（`docs/<app>/adr/`）に記録する（MUST）。**

### 決定 2: どちらを採っても必ず揃える点

1. ドメイン操作の失敗は `Result<T, E>` で表す（**MUST**。[`docs/adr/0005`](./0005-result-and-boundary-validation.md) の再掲ではなく参照）。
2. `index.ts` は**公開記号を明示列挙**する。`export *` を使わない（**MUST NOT**）。

   **追記（2026-08-19・#168）**: 項目 2 の機械検査は `scripts/audit-public-surface.mjs` が持つ。
   **走査対象は `SCANNED_PACKAGES` の `entry` から導くため、`index.ts` に限らない**
   （アプリの `main.tsx` / `server.ts` も含む）。「エントリが `index.ts` のものだけ」という
   絞り込みを書くほうが腐りやすく、アプリのエントリに `export *` を置きたい理由も無いため、
   本決定より広い範囲を検査する。
3. ドメインエラーは**判別子（`type` または `code`）と機械可読な詳細のみ**を持つ。
   表示文言は文言生成関数が担う（**MUST**）。
4. ドメイン内で `Date.now()` / `Math.random()` を呼ばない（**MUST NOT**）。
   時刻・乱数は引数で注入する。

**3 の「文言生成関数」は core の外に出すという意味ではない。** timer の
`displayMessageFor()` は `@tasuki/timer-core` から export されている。poker も同様に
poker-core 内の別モジュールへ置き、同期サーバーは `code` から文言を引く。

## 影響

- **本 ADR の時点ではコード（`apps/` `packages/` `e2e/` `scripts/`）を変更しない。**
  適用は [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72) の各段で行う。
- 決定 2 の未達と宛先（2026-08-17 実測）:

  | 項目 | 現状 | 直す対象 | 宛先 |
  |---|---|---|---|
  | 1. `Result` | 両方準拠 | なし | — |
  | 2. `index.ts` の明示列挙 | timer 準拠 / poker 未 | `packages/poker-core/src/index.ts` 1 ファイル | #72 E6 |
  | 3. エラー型 | timer 準拠 / poker 未 | poker-core の `RoundError` `RoomError` と文言 6 箇所（`RoundError` 由来 5 ＋ `RoomError` 由来 1）、`apps/poker-sync/src/server.ts:244` `:333`、`apps/poker-web` | #72 E2 |
  | 4. `Date.now()` | poker 準拠 / timer 未 | `packages/timer-core/src/problem.ts:70` 1 箇所 | #72 E3 |

- **項目 3 を E2（poker-sync のポート/アダプタ再編）と同じ PR で行うのは、
  触るファイル群が同一だからである。** 分けると `apps/poker-sync/src/server.ts` を
  二度触ることになる（`docs/guides/pr-granularity.md`「分けた方が丁寧に見えるは
  理由にならない」）。
- 項目 3 の適用時、**WS で送る文字列は 1 文字も変えない**（振る舞い不変）。
- 決定 2 の項目 2・4 の機械検査は、それを消す Issue（E6・E3）が同じ PR で置く。
  **項目 3 の検査は E2 が置く**（`packages/poker-core` の**ドメインエラー型**（`RoundError` `RoomError`）に
  `message` フィールドが 0 件。WS プロトコルの `ProtocolError` や `ServerMessage` の `message` は対象外）。

## 追記（2026-08-18・#165 / #72 E2）

決定 2 の項目 3 について、上で E2 に割り当てた機械検査を
`scripts/audit-domain-error-shape.mjs` として置いた。CI の `quality` ジョブで走る。

**走査対象は `packages/poker-core` だけに留めず、`packages/timer-core` の
`DomainError` メンバーも含めた。** 上の未達表が項目 3 を「timer 準拠 / poker 未」と
採点している以上、timer も規範の適用範囲内であり、poker だけを見る検査にすると
**準拠と記録した側が崩れても緑になる**（`docs/adr/0014` が扱った「走査対象が片側だけ」と同じ形）。

検査が見ないものは同スクリプトの docstring に書いた。特に、対象の型は手書きで宣言しており、
**新しいドメインエラー型を足しても宣言に追記しない限り無検査**である。
宣言した型の改名・削除は検査が赤にする（静かな空振りは塞いである）。

## 追記（2026-08-18・#166 / #72 E3）

決定 2 の項目 4 について、E3 に割り当てた機械検査を
`scripts/audit-domain-side-effects.mjs` として置いた。CI の `quality` ジョブで走る。
`packages/timer-core/src/problem.ts:70` の `Date.now()` は引数注入へ替えて解消した。

**検査が見る語彙は、項目 4 の逐語（`Date.now()` / `Math.random()`）より広い。**
`new Date(` / `performance.now(` / `crypto.` / `process.env` を加えた 6 語である。
逐語の 2 語だけにすると `new Date().getTime()` や `crypto.randomUUID()` が
すり抜け、**対策が自分の塞ぐ欠陥と同じ欠陥を持つ**ことになる。

**項目 4 の趣旨は「ドメインが環境から直接値を読まない」ことであり、
検査の射程はこの趣旨に合わせてある。** 決定の文面（MUST NOT の対象）を
2 語から 6 語へ読み替えること。宣言した 2 パッケージ
（`packages/poker-core` `packages/timer-core`）は 2026-08-18 時点で 6 語すべて 0 件である。

## 追記（2026-09-01・#182）

決定 2 項目 2 は「`index.ts` は公開記号を明示列挙する」とだけ定めており、
**何を列挙するかを定めていなかった。** #168 が `export *` を明示列挙へ置き換えたとき、
index 経由の利用者が 1 人もいない記号がそのまま列挙へ残ったのはこのためである
（2026-09-01 の実測で `packages/poker-core` は 46 記号中、**製品コードからもテストからも
一度も取り込まれない記号が 14 件**。これに「テストからしか取り込まれない `ServerMessage`」を
足した 15 件が、下の「値 7 件・型 8 件」の内訳にあたる）。項目 2 に次を足す。

### 何を列挙するか

- **値（関数・定数）は、そのパッケージの外の製品コードが取り込むものだけを列挙する（MUST NOT）。**
  代わりの入口があるなら列挙しない。
- **型は、列挙した値の署名から到達できるなら列挙してよい（MAY）。**

**型を別扱いにするのは、型が取り込まれなくても契約の一部だからである。**
`createRoom(…, ids: ParticipantIds): Result<RoomUpdate, RoomError>` は型推論が効くので
誰も `ParticipantIds` を書かないが、注釈を書きたい利用者は名前を要求する。
値にはこの事情が無い。

**「外から取り込まれるか」だけを条件にするのは、テストからの参照を根拠に含めないという
FR-090 の延長である。** パッケージ内部の相対 import は index を通らないので、
列挙から落としても振る舞いは変わらない。将来外から使いたくなったら 1 行足せばよい。

### 機械検査 — SC-039④

`scripts/audit-structure.mjs` に `sc039dContractOnlyValues` を置いた。
`packages/` 層のエントリが列挙する**値**のうち、そのパッケージの外の製品コードから
一度も取り込まれないものの件数を測る。走査対象は `SCANNED_PACKAGES` から導き、
宣言と全単射で照合する（ADR-0014 の機構）。ADR-0009 D2 のとおり**測定値では落とさない**。

**型は数えない。** 「公開している値の署名から到達できるか」を機械で判定するには型解決が要り、
この検査の素朴さと引き換えになる（[`docs/adr/0014`](./0014-scan-target-integrity.md) が扱った
「賢い検査ほど穴が増える」と同じ判断）。型の妥当性はレビューが見る。

**この検査は SC-039③ とは別のことを測る。** ③ は宣言ファイルの `export` が要るかを見る。
④ はパッケージの公開面に載せる理由があるかを見る。実測では `computeStats` は
`snapshot.ts` が相対 import で使うので③では生きており、index 経由の利用者は
1 人もいないので④では死んでいた。**例外表（`SC039C_EXCEPTIONS`）が守っているのは
③の側であり、④の判断を先取りするものではない。**

検査が見ていないものは `sc039dContractOnlyValues` と `extractContractNames` の
docstring に書いた。特に、**index.ts に直接書いた宣言（`export const X = 1;`）は数えない**
（再エクスポート節だけを見る）。この書き方は緑へ倒れる経路である。

### 適用と未達（2026-09-01 実測）

`packages/poker-core` は値 7 件を列挙から落とし、型 8 件を理由つきで残した（#182）。
SC-039④ は 33 → 26 件。残りの内訳と宛先は次のとおり。

| パッケージ | 未達の値 | 宛先 |
|---|---|---|
| `packages/poker-core` | 0 | — |
| `packages/protocol` | 0 | — |
| `packages/rate-limit` | 2 | [#221](https://github.com/tomohiroJin/tasuki-tools/issues/221) |
| `packages/timer-core` | 24 | [#220](https://github.com/tomohiroJin/tasuki-tools/issues/220) |

**未決のものを例外表へ入れて 0 に見せることはしない**（#180 が SC-039③ で採ったのと同じ扱い）。
指標に出したまま残し、判断は上の Issue が持つ。

### SC-039③ の宛先を付け替えた

`SC039C_EXCEPTIONS` の docstring は長く「残りは #182 が扱う問いそのものである」と
書いていたが、**これは誤りだった**。③が測るのは宣言ファイルの `export` の要否であり、
#182 が扱ったのは公開面に載せる理由の有無（④）で、両者は独立している。
`stripNamedReexports` が index の再エクスポートを参照から外すため、
**index から記号を落としても③の件数は 1 件も動かない**（実測で 15 件のまま）。

#182 を閉じると③の問いが宛先を失うので、
[#223](https://github.com/tomohiroJin/tasuki-tools/issues/223) へ移し、docstring も直した。

## 追記（2026-09-02・#220）

`packages/timer-core` の 24 件を列挙から落とした。SC-039④ は 26 → **2 件**
（残りは `packages/rate-limit` の 2 件＝ #221）。型 26 件は 1 つも触っていない。

**24 件のうち 9 件は、外から現に使われている。** ただし取り込み口は `index.ts` ではなく
**モジュール単位のサブパス**（`@tasuki/timer-core/aggregate`）で、`apps/timer-web` が
上限値の定数（`MAX_DISPLAY_NAME` など）と `elapsedMs` `VALID_INTERVAL_MINUTES` を
そこから取っている（**`MAX_DISPLAY_NAME` は #95 S4b で `@tasuki/room-core` へ移した**ので、
いまの取り込み先はそちらである。ここは #220 実施時点の記録）。サブパスは index を通らないので、**index の列挙が使われた根拠に
ならない**（SC-039④ がサブパスを数えないのと同じ理由）。上の「代わりの入口があるなら
列挙しない」に当たるため落とした。**利用側は 1 ファイルも変えていない。**

残る 15 件は**パッケージの外の製品コードからの取り込みが無い**もので、SC-039④ が
数えるのはここである。ただし「どこからも取り込まれていない」わけではない —— **4 件
（`normalizeDisplayName` `RoomSchema` `MAX_DISPLAY_NAME` `DEFAULT_ERROR_MESSAGE`。
前 2 つと `MAX_DISPLAY_NAME` は #95 S1 / S4b で `@tasuki/room-core` へ移った）は
テストが index 経由で取り込んでいた**ので、取り込み口を宣言ファイルへ向け直している
（timer-core 自身の 3 本は相対 import、`apps/tasuki-sync` の 1 本はサブパス）。
テストからの参照を公開の根拠にしないのは FR-090 の延長であり、宣言側の `export` を守る
`SC039C_EXCEPTIONS`（③）とは独立した判断である。

**値を落とすと、その値を型の位置で使う署名が書けなくなることがある。**
`validateProblem` の失敗型は `v.ValiError<typeof ProblemSchema>` だったので、
`ProblemSchema`（値）を落とすと外から名前で書けなくなった。`ProblemValidationError`
という型別名を与えて解いた。逆に、参照していた唯一の値を落としたことで署名から到達
しなくなった型（`FallbackProblemEntry`）は列挙から外した。**上の「型は署名から到達
できるなら列挙してよい」は、値を落とす側にも読み替えが要る。**

⚠ **この型別名の追加で SC-039③ が 15 → 16 件へ増えた。**
`ProblemValidationError` は `problem.ts` の中でしか使われない公開記号だからである
（index の再エクスポートは③の参照根拠から外れる）。**index から記号を落とす操作自体は
③を動かさない**という 2026-09-01 の実測（下の節）と矛盾しない —— 動かしたのは
削除ではなく、新しく足した公開型のほうである。例外表へは入れない（未決を 0 に見せない
という #180 以来の扱い）。判断は SC-039③ を持つ [#223](https://github.com/tomohiroJin/tasuki-tools/issues/223) が引き取る。

**この付け替えの前提に誤りがあった。** `apps/tasuki-sync/tsconfig.json` は
「bun test はサブパスを解決できない」と書いていたが、2026-09-02 の実測（bun 1.3.14）で
解決できた。`paths` を存在しないディレクトリへ向けると落ちることまで確かめてある
（＝ bun は tsconfig の `paths` を実行時解決に使う）。

⚠ **ただし、同条件の直接測定が 2 件あって食い違っており、原因は特定できていない。**
`docs/superpowers/plans/2026-08-05-bun-test-migration.md` は
「`@tasuki/timer-core/evolve` を import するテストを足すと解決に失敗する」と記録している。
bun のバージョン文字列は当時と同じ 1.3.14、`paths` ブロックは未変更、`include` の射程も
無関係（対照実行で確認済み）。CI の bun は `bun-version: latest` で固定していないので、
**この解決挙動に依存しているテスト 1 本は、将来赤くなる可能性がある**。
経緯と対処は同 tsconfig と当該プランに残した。

## 追記（2026-09-02・#221）

`packages/rate-limit` の 2 件（`DEFAULT_SWEEP_THRESHOLD` `MAX_SWEEP_THRESHOLD`）を
列挙から落とした。**これで SC-039④ は全パッケージで 0 件**になり、上の「適用と未達」表の
宛先はすべて消化された。

どちらも掃除しきい値で、`createTokenBucketLimiter` の入力検証の中でしか使われず、
外の製品コードからの取り込みは 0 件だった。取り込んでいたのは
`packages/rate-limit/tests/token-bucket.test.ts` 1 本だけなので、宣言ファイルからの
相対 import へ替えた。**同じファイルに先例がある** —— `normalizeClientAddress` は
ADR-0012 D3 により index から公開せず、テストが `../src/client-key.js` から直接取る形で、
その理由が index の先頭にコメントとして書いてある。ただし**理由の重さは違う** ——
あちらは「生の IP を外へ出さない」という安全上の要請で、こちらは「利用者がいない」だけである。

⚠ **`packages/rate-limit` には代わりのサブパス入口が無い**（`package.json` の `exports` は
`"."` だけで、app 側にも `@tasuki/rate-limit/*` の配線は無い）。#220 の timer-core を
落とせた根拠は `@tasuki/timer-core/aggregate` という代替入口があったことなので、
**同じ「落とす」でも復帰の容易さが違う**。呼び出し側が `sweepThreshold` を設定から
受け取るようになったら列挙へ戻す —— その申し送りは `index.ts` のコメントに書いた。

**宣言側の `export` は残す。** 落とすと `1_000` / `1_000_000` がテストへ複製され、
値の変更を検知する検査が値の写しを検査するだけになる（#103 設計正本 D4）。
`SC039C_EXCEPTIONS`（③）が守っているのはこちらであり、④の判断とは独立している ——
実測でも **index から落として③の件数は動かなかった**。

## 追記（2026-09-02・#223）

**SC-039③ も型を数えるのをやめた。** ④で「型は数えない」と決めた理由（判定に型解決が要り、
検査の素朴さと引き換えになる）は、③にもそのまま当てはまる。

**やめた根拠は実測である。** ③が挙げていた 16 件のうち **11 件が型で、その 11 件すべてが
`index.ts` に載っている公開契約の型だった**（`ProtocolError` は `parseServerMessage` の
Result のエラー型、`ParticipantIds` は `createRoom` の引数型…）。上の「型は署名から到達
できるなら列挙してよい」で**残すと決めた当のもの**を、③が判定できないまま未達として
数え続けていたことになる。指標が読み手へ渡していたのは信号ではなく雑音だった。

**見なくなるもの**: `index.ts` にも載っていない、どこからも使われない公開型。
これは以後どの検査も見ない（④で受け入れたのと同じ受容。型の妥当性はレビューが見る）。

⚠ **「index に載らないから外へは出ない」とは言えない。** `packages/timer-core` は
`exports` マップを持たず、app 側の `tsconfig` が `@tasuki/timer-core/*` をワイルドカードで
通すため、**index に載っていないモジュールの `export type` もサブパスで名前ごと取り込める**
（#220 で配線を確かめた）。受容の根拠は「外へ出ないこと」ではなく、
**型の妥当性はレビューが見る**という④と同じ割り切りである。

### 残った値 5 件の判断

| 記号 | 判断 |
|---|---|
| `ClientMessageSchema` / `ServerMessageSchema` | **宣言の `export` を落とす**。取り込んでいるものがどこにも無かった（テストでの出現はコメント内だけ）。入口は `parseClientMessage` / `parseServerMessage` である |
| `snapshotFor` | **削除**。`createSnapshotBuilder(room)(viewerId)` への 1 行の委譲で、製品コードは 1 箇所も使わず、取り込んでいたのは自分のテスト 1 本だけだった。テストは公開入口を直接呼ぶ形へ変えた（検証している中身は同じ） |
| `ERROR_CODES` / `shouldAutoReveal` | **例外表へ理由つきで載せる**。前者は権威列挙の起点、後者は述語そのものの検証の土台で、どちらも落とすと検査が弱くなる |

これで **SC-039③・④ とも 0 件**になった。`SC039C_EXCEPTIONS` の docstring から、
未決の宛先として Issue を名指ししていた記述も消した（宛先はもう無い）。

**例外表に載せるのは値だけである。** 型を載せても③は最初から数えないので、
何も起きない例外が静かに増えるだけになる。**これは散文ではなく機構で止める** ——
`findStaleSymbolExceptions` が「型だけの例外」を腐りとして落とす（実測: 型を 1 件載せると
監査が exit 1 になる）。値が消えて同名の型だけが残った場合も落ちるので、後から値が
復活したときに例外が本物の検出を静かに握り潰す経路も塞がる。

## 追記（2026-09-25・#91 PR 3） — `packages/timer-core/src/problem.ts` を削除した

「影響」の未達表（2026-08-17 実測）の項目 4 と、上の追記（2026-08-18・#166 / #72 E3）が名指ししている
`packages/timer-core/src/problem.ts:70` は、**ファイルごと削除した**。
[#91](https://github.com/tomohiroJin/tasuki-tools/issues/91) PR 3 で timer のお題を撤去し、お題の型・定型バンク・
検証・プロンプトの組み立ては新しい文脈 `packages/topic-core` へ移ったためである
（[`docs/adr/0021`](./0021-topic-as-shared-context.md)）。同じ段で `problem-bank.ts` も消え、
上の追記（2026-09-02・#220）が名指しする `validateProblem` / `ProblemSchema` / `ProblemValidationError` /
`FallbackProblemEntry` も残っていない。

**表と追記は当時の実測・記録なので書き換えない**（`docs/adr/0002`）。

- **項目 4 の規律はそのまま新しい置き場へ引き継いだ。** 定型の選択（`topic-core` の `pickTopicFallback`）は
  時刻を引数で受け取り、`Date.now()` を呼ばない。`scripts/audit-domain-side-effects.mjs` の宣言に
  `packages/topic-core` がある（宣言の正本は同スクリプト）
- **決定 1 が MUST とする表現の記録**は、`topic-core` については `docs/adr/0021` 決定 5（直接遷移関数 ＋ `Result`）である

## 追記（2026-11-14・#600）— ID をブランド型にするか（Proposed）

- **この追記のステータス**: Proposed（採択は利用者。ADR 本体の Accepted は変わらない）
- **関連**: [#600](https://github.com/tomohiroJin/tasuki-tools/issues/600)（親 [#482](https://github.com/tomohiroJin/tasuki-tools/issues/482)）/
  [調査の記録](../superpowers/specs/2026-11-13-architecture-review-survey.md) 節 4.1・4.2・節 6 の C1・節 8 の #4 /
  [`docs/adr/0007`](./0007-abstraction-criteria.md) 基準 3 /
  [`docs/adr/0017`](./0017-bounded-contexts-and-packages.md) 決定 4 /
  `docs/constitution.md` 原則 IV・原則 X

### 問い

core・アプリケーション層・ポートの ID は、どれも `string` か `string` の別名である。
別名は型検査では `string` と同じなので、参加者 ID と接続 ID・ルームのコードを取り違えても型が通る。
これを型で止めるために ID をブランド型にするか、入れないならなぜかを決める。
原則 IV（境界の型安全）は wire の入口の検証を定めており、内側の ID の型は定めていない。
表現の決まりなので本 ADR に足す。

### 実測（2026-11-14・`882f7954`）

数えたコマンド: `node docs/superpowers/specs/2026-11-13-architecture-review-survey/c-contracts.mjs .`（exit 0・走査 164 ファイル）。
数は出力の `stringIds`・`aliasOfString`・`summary.stringIdsByPkgKind` から写した。調査の記録（節 4.1）と同じ数で、#590 のマージのあとも変わっていない。

**このスクリプトが拾うのは、名前が `id`・`…Id`・`…Ids` の ID だけである**（`ID_RE`。調査の記録の 4.1 も「`code`・`token`・`key` は拾わない」と書く）。
ルームのコードは名前が `roomCode` なので、202 には入っていない。そこで、スクリプトを作業ツリーの外へ写し、`ID_RE` の名前に `roomCode`・`roomCodes` を足して同じ引数で流した（下の表の「`roomCode` を含む」の列。exit 0）。
名前が `code` だけのもの（エラーの `code` と混ざる）は、どちらの列にも入れていない。

| 項目 | スクリプトのまま | `roomCode` を含む | 出どころ |
|---|---:|---:|---|
| `string`（別名を含む）の ID | 202 か所（引数 141・型の欄 61）・59 ファイル | 288 か所（引数 225・型の欄 63）・67 ファイル | `stringIds` の `kind` と `file` |
| うち名前が `connId`／`connIds` | 84 か所・27 ファイル | 同じ | `stringIds` の `param` |
| うち名前が `participantId` | 57 か所 | 同じ | 同上 |
| うち名前が `roomCode` | 0 | 86 か所・25 ファイル | 同上 |
| `string` の別名 | 6（`ParticipantId`・`ConnId`・`RoomCode`・`ToolId`（`packages/room-core/src/room.ts`）・`EntryId`（`packages/roulette-core/src/types.ts`）・`CardId`（`packages/checkin-core/src/methods.ts`）） | 同じ | `aliasOfString` |
| ブランド型の ID | 0 | 0 | — |
| 同じ関数に ID の引数が 2 つ以上並ぶもの | 6 | 15 | 下の表 |

関数の数え方: `stringIds` の引数を、関数名・ファイルが同じで行が近い（4 行以内）ものに束ね、2 つ以上のものを数えた。
名前のある組は 15 組で、型の宣言と実装の二重取り（`handleParticipantRemoved` の 190 行と 708 行）を 1 つと数えて 14 関数になる。
名前の無い組（関数名が `<anon>`）は 7 組あり、1 つずつ本物に当てて次のように扱った。

- **表に足した 1 関数**: `discardPokerVote: (roomCode: string, participantId: string) => void`。依存の型のプロパティとして書かれているのでスクリプトが名前を拾えない。
  同じ署名が `command-handlers/participant-remove.ts:56`・`handlers.ts:191`・`room-removal.ts:144` の 3 か所にあり、1 つと数えた
- **除いた 2 組（重複）**: `poker-commit-room-action.ts:153-155` と `poker-handlers.ts:166-168` の `removeFromRoom: (roomCode, actorId, targetId) => …`。依存の型のプロパティで、表の `removeFromRoom`（`handlers.ts`）と同じ関数の型である
- **除いた 2 組（誤検出）**: `participant-remove.ts:45/47`（`sendError(connId, …)` と `destroyRoom(roomCode)` の別々のプロパティ）と `destroy-room.ts:106/110`（`releaseRoom(roomCode)` と `createRoomDestroyer` の戻りの型の `roomCode`）。行が近いだけで、1 つの関数に ID が並んでいない

したがって表は 14 ＋ 1 ＝ 15 関数である。

| 関数 | 並ぶ ID | ブランド型で止まるか |
|---|---|---|
| `attach`・`detach`（`apps/tasuki-sync/src/ports/poker-broadcaster.ts`） | ルーム・参加者 | 止まる |
| `sendJoined`（`poker-handlers.ts`） | ルーム・参加者 | 止まる |
| `attachConnection`（`room.ts`） | 参加者・接続 | 止まる |
| `sendCurrent`（`agenda-broadcast.ts`・`checkin-broadcast.ts`・`roulette-broadcast.ts`・`topic-broadcast.ts` の 4 つ） | 接続・ルームのコード | 止まる（`roomCode` を含めたときだけ見える） |
| `handleParticipantRemoved`（`poker-handlers.ts`） | ルームのコード・参加者 | 同上 |
| `scheduleDriverAbsence`（`presence.ts`） | 参加者・ルームのコード | 同上 |
| `findResumeToken`（`token-store.ts`） | 参加者・ルームのコード | 同上 |
| `handleAiUnlock`（`topic-handlers.ts`） | 接続・ルームのコード | 同上 |
| `discardPokerVote`（`participant-remove.ts`・`handlers.ts`・`room-removal.ts` の依存の型。名前の無い組から足した） | ルームのコード・参加者 | 同上 |
| `removeFromRoom`（`handlers.ts`） | ルームのコード・参加者（する人）・参加者（される人） | ルームのコードと参加者の取り違えは止まる。する人とされる人の取り違えは止まらない |
| `removalNotificationFor`（`removal-notification.ts`） | 参加者（する人）・参加者（される人） | 止まらない |

15 関数のうち、ブランド型で全部止まるのは 13、一部だけ止まるのが 1（`removeFromRoom`）、止まらないのが 1（`removalNotificationFor`）である。
**止まらないのは、同じ種類の ID（参加者 ID どうし）が並ぶ所である。**

走査の外: 接続層（`apps/tasuki-sync/src/adapters`。`ws-adapter.ts` の `connId: string` ほか）と web アプリは数えていない。入れるならここも動く。

型で順序や出どころを守る形は、同期サーバーに既に 3 つある。どれも `unique symbol` の目印である
（`apps/tasuki-sync/src/application/` の `apply-room-level-event.ts` の `StateWithAggregate`・`log/log-safe.ts` の `LogSafe`・`timer-command-receiver.ts` の `TimerCommandReceiver`）。
`LogSafe` は `string & { readonly [logSafeBrand]: true }` で、文字列のブランド型そのものである。

### 取り違えの実害（履歴を引いた結果）

引いたもの: `git log -E --grep='^fix'`（本文に `fix` で始まる行を持つコミット 235 本）のうち、本文に `connId`・`participantId`・`roomCode`・`roomId`・「参加者 ID」・「接続 ID」・「ルームのコード」・「ID を」を含む 16 本を読んだ。
加えて `git log` の本文の「取り違」・「逆に渡」・「引数の順」・「固定値」・「表示名」、`gh issue list --state all --search '取り違え'`、`docs/` の「取り違」と「ブランド」を引いた。
これより外の語（例「入れ違い」「別人」）で書かれた記録は拾えていない。
下の `04d6440a` と `c4bc955b` は、最初の引き方では拾えず、敵対的レビューの指摘で見つけて本文を読んで確かめた（`04d6440a` は「participantId ではなく」と「表示名」が行をまたいでおり、行ごとの grep に当たらない）。

- **ID と ID の取り違え（参加者 ID と接続 ID など）で出た不具合の記録は、この範囲では 0 件。**
- **ID と表示名の取り違えは 3 件ある。製品の不具合は 1 件で、残る 2 件はテストの固定値の誤りである。**
  - `2e1f4f2c`（#22・2026-07-28・製品の不具合）。交代の輪（`rotation`）の中身を表示名から参加者 ID に替えたとき、
    `decideAddProxy` の重複名の確かめが ID と表示名を比べたままになり、同名の代理を足せた。コミットは「型は `string[]` のまま変わらないため、コンパイラも 1400 件のテストも検出できなかった」と書く。
    実機での確かめ（Playwright）で見つかった。同じコミットは、表示名を React の key にしていた退行も直している。
    **この 2 つは、ブランド型でも止まらない。** 直す前の形は `rotation.map((n) => n.toLowerCase())` で作った配列に `includes(trimmed.toLowerCase())` を当てていた。
    `toLowerCase()` は `string` を返すので、輪が `ParticipantId[]` でも目印はそこで外れる。React の key も `string` を受ける。
    作業ツリーの外に小さな `.ts` を書き、本体の `node_modules/.bin/tsc --noEmit --strict` で確かめた: 直す前の形は exit 0（通る）、対照として `rotation.includes(trimmed)`（`toLowerCase` を挟まない形）は exit 2（落ちる）
  - `04d6440a`（#276・2026-09-19・テストの固定値）。`Lobby.invite.test.tsx` の造作が、輪に参加者 ID ではなく表示名を入れていた。席が別人として同名判定に混ざっていた
  - `c4bc955b`（#95 S3・2026-09-09・テストの固定値）。`Session.restart`・`Session.handoff` のテストの固定値で、識別子と表示名が交差していた
  - テストの 2 件は、固定値をブランド型の作り手（例 `pid("p_alice")`）で書いていれば、表示名を ID の欄に入れた所で型で落ちる種類である。どちらも製品の不具合ではなく、テストを直した
- **取り違えを防ぐ手当は 2 回、手で打っている。**
  - `7689fb5e`（#95 S4b・PR #264）: `detachConnection` を `removeConnection`（接続 ID で外す）へ改名した。コミットは「引数がどちらも string で取り違えが型検査を通るため、旧名を残さない」と書く。
    改名で古い呼び出しをコンパイルで落とした（R4 の計画 `docs/superpowers/plans/2026-10-13-refactor-r4-invariants.md` はこれを S4a と書くが、改名したコミットは S4b である）
  - S4b の計画（`docs/superpowers/plans/2026-09-11-shared-identity-s4b-identity-and-presence.md`）は「最大の危険」として、`connId` を読む約 200 か所に名簿の接続 ID と接続そのものの ID が混ざることを挙げ、「置換ではなく 1 箇所ずつ意味を見て直す」とした
- **一度、見送っている。** #360 の R4（2026-10-13）は「room-core の ID をブランド型にする」をやらないことにした。理由は「同期サーバーの全体に広がる」「取り違えは関数名で既に防いでいる」「`docs/adr/0007` 基準 3」
  （`docs/superpowers/plans/2026-10-13-refactor-r4-invariants.md` の「やらないこと」・`docs/superpowers/specs/2026-10-13-large-refactoring-design.md`）。この判断のあとに、ID の取り違えの不具合は記録されていない

### 入れる場合の形

**形は、名前を鍵にした構造の目印を勧める。** 具体的には valibot の `Brand`（`type ParticipantId = string & v.Brand<"ParticipantId">`）か、
同じ性質を持つ字面の目印（`string & { readonly __brand: "ParticipantId" }`）。`unique symbol` は文脈をまたぐ ID には使わない。

- **`unique symbol` は宣言ごとに別の型になる。** 文脈どうしは依存しない（`docs/adr/0017` 決定 4。`scripts/audit-dependency-direction.mjs` の `ALLOWED` で `room-core`・`roulette-core`・`checkin-core` ほかは `[]`）。
  `room-core` の `ParticipantId` を `roulette-core` は取り込めないので、各文脈が自分の目印を宣言することになり、互いに代入できない。
  文脈をつなぐアプリ層の全部に `as` が要り、調査が既に問題にしている `as T`（節 6 の C5）が増える。
  `LogSafe` などの 3 つは同期サーバーの中だけで閉じているので、この問題が無い
- **名前を鍵にした目印は、同じ名前なら別のパッケージで宣言しても同じ型になる。** 依存を足さずに文脈をまたげる。
  valibot の `Brand` を使えば、wire の入口のスキーマ（`v.pipe(v.string(), v.minLength(1), v.brand("ParticipantId"))`）が `as` 無しでブランド型を返す。
  core のうち valibot に依存していないのは `sync-client` だけ（ID の欄は 1）。ただし、valibot の目印は `BrandSymbol`（`unique symbol`）を鍵にしており、
  版が 2 つ入ると記号が割れて代入できなくなる（いまのロックは 1 版）。同じ版でも、型の宣言は `index.d.mts` と `index.d.cts` で別々に `BrandSymbol` を宣言している（本体の `node_modules` の valibot 1.5.0 で確かめた）。
  ESM と CJS の宣言が混ざる解決になると同じことが起きうる（未測）。この心配を避けたいなら字面の目印にする
- 字面の目印は valibot に依らないが、入口のスキーマの出力に `as` が 1 か所ずつ要る

**ブランド型を付ける場所（作る口）は次に限る。** 内側の関数は付いた値を受け渡すだけにする。

1. **wire の入口**: valibot のスキーマ（`packages/room-core/src/wire.ts`・`packages/timer-core/src/schemas.ts`・`packages/poker-core/src/protocol.ts` など、クライアントが ID を送ってくる欄）
2. **ID を採番する口**: `apps/tasuki-sync/src/adapters/nanoid-code-gen.ts`（参加者 ID・ルームのコード）・`poker-crypto-id-gen.ts`・`ws-adapter.ts` の接続 ID
3. **ストア**: ポートの鍵の型をブランド型にする。読み出しはブランド型を返す（ストアに入るのは 1・2 で付いた値だけ）

`as` で付ける口は 2 だけにする。`LogSafe` と同じく、`as` を使ってよいファイルを監査で縛るかは段の 1 本目で決める。
テストは ID を字面で書く（例 `"p_alice"`）ので、テスト用の小さな作り手（例 `pid("p_alice")`）を通す書き換えが要る。件数は未測。

### 別名 6 つの扱い（入れる場合）

| 別名 | 扱い | 理由 |
|---|---|---|
| `ParticipantId` | ブランド型にする | 取り違えの危険の中心（接続 ID・ルームのコード・表示名と並ぶ） |
| `ConnId` | ブランド型にする | 名前の数が最多（84 か所）。S4b が「最大の危険」と書いた。作る口が `ws-adapter.ts` の 1 か所で、wire から来ない |
| `RoomCode` | ブランド型にする | 名前が `roomCode` の所が 86 か所。上の 15 関数のうち 13 で接続 ID か参加者 ID と並ぶ（名前が `roomId` のものを含む）。wire からも来る |
| `ToolId` | 別名のまま | `room-core` は「中身を解釈しない」と決めている（`room.ts` の注記）。綴りの正本は同期サーバーの `tool-id.ts`（#590）で、型を締めるならそちらの字面の共用体にする |
| `EntryId` | `ParticipantId \| GuestId` にする | 参加者 ID かゲストの ID（`g-` で始まる）。名前を鍵にした目印なら `roulette-core` が `room-core` に依存せず `ParticipantId` を書ける。ただし `roulette-core/src/types.ts` は「この文脈は参加者 ID の中身を解釈しない」と注記している。目印を書くのは中身を解釈することではないが、`room-core` と同じ名前の約束を持つことになる。入れるならこの注記も書き直す |
| `CardId` | 別名のまま | 人の ID と並ぶ引数が無い。値はやり方ごとの閉じた集合（`METHODS`）で、締めるなら字面の共用体が先。ただし `packages/checkin-core/src/types.ts` の `cards: ReadonlyMap<string, CardId>`（参加者 ID を鍵、札を値に持つ形）は鍵と値がどちらも `string` で、ここだけは取り違えが型を通る |

### 段の切り方（入れる場合）

ISSUE の案（`room-core` → `roulette-core` → …）は、**パッケージの順ではそのまま切れない。**
`room-core` の関数の ID をブランド型にすると、それを呼ぶ同期サーバーが `string` を渡している所が全部コンパイルで落ちる
（`@tasuki/room-core` の字面を含む製品のファイルは 95、うち同期サーバー 47。`git grep -l '@tasuki/room-core' -- apps packages` からテストと `package.json`・`.md` を除いて数えた）。
そこで、**ID の種類ごとに、作る口から使う側へ**流す。1 段 = 1 PR（`docs/adr/0013`）。

1. `ConnId`（作る口が 1 つ・wire から来ない。`room-core` の `attachConnection`・`removeConnection`・`findParticipantByConnId` と同期サーバーの接続 ID の引数）
2. `RoomCode`（採番の口と wire の入口）
3. `ParticipantId`（採番の口 2 つと wire の入口 3 つ。`timer-core` の交代の輪を含む）
4. `roulette-core` の `EntryId`
5. 残る core（`poker-core`・`checkin-core`・`agenda-core` の `id`／`stepId` など）

どの段を終えても、参加者 ID どうしが並ぶ所（`removeFromRoom` のする人とされる人・`removalNotificationFor`）は型では止まらない。
引数を名前つきの 1 つのオブジェクトにするかは、この追記の範囲外とする。

### 変異の作り直しの見込み

数え方: `scripts/mutations/*.patch` の `+++ b/` の行を集め、ID のあるファイルに当たるパッチと、そのうち差分の範囲（`@@ -a,b`）が ID の注釈の行（`stringIds` と `aliasOfString` の行番号）にかかるものを数えた（全 1,046 本）。
2 つの列は上の実測の 2 つの列（59 ファイル・67 ファイル）に対応する。

| 範囲 | スクリプトのまま: ファイルに当たる | うち ID の行にかかる | `roomCode` を含む: ファイルに当たる | うち ID の行にかかる |
|---|---:|---:|---:|---:|
| 全部 | 188 | 15 | 195 | 18 |
| `room-core` | 10 | 1（`m397`） | 12 | 2（`m397`・`m601`） |
| `roulette-core` | 27 | 0 | 27 | 0 |

ID の行にかかる本数（`roomCode` を含めて 18）は当たらなくなる見込みが高い。名前が `code` だけの ID まで含めればさらに増える（未測）。残りは、作る口や呼び出し側を書き換えた結果、前後の行がずれたときだけ当たらなくなる。
本当の数は、各段で `docs/guides/procedures/mutations.md` の全件の当たり確認を流して数える。ブランド型は実行時に何もしないので、作り直したパッチが壊す振る舞いは変わらない。

### 入れない場合の理由

- **実需の記録が無い。** ID と ID の取り違えで出た不具合は、引いた範囲で 0 件。原則 X と `docs/adr/0007` 基準 3 は「変更が現に困難になっている事実」を求める。
  記録にある製品の不具合 1 件（`2e1f4f2c`）は ID と表示名の取り違えで、しかも `toLowerCase()` で目印が外れる形だったので、ブランド型でも止まらなかった（上の tsc の確かめ）。
  ブランド型で止まる種類はテストの固定値の誤り 2 件（`04d6440a`・`c4bc955b`）だけで、どちらもテストを直して済んでいる
- **同じ問いを 1 か月前に見送っている**（R4）。その後、前提（同期サーバーの全体に広がる・関数名で防いでいる）は変わっていない
- **量が大きい。** `roomCode` を含めて 67 ファイル・288 か所に加えて、接続層・web アプリ・テストの字面・変異の作り直しが動く。5 段の PR になり、そのあいだ #482 のほかの子（#591 の `createSyncServer` の分割・#596 の契約の型など）と同じファイルで衝突する
- **止められるのは一部。** ID が並ぶ 15 関数のうち、参加者 ID どうしが並ぶ所（`removeFromRoom` の一部・`removalNotificationFor`）は止まらない。
  記録にある製品の不具合 1 件のように、`toLowerCase()` などで `string` に戻した値どうしを比べる形も止まらない

### 勧め: 今は入れない（Rejected を勧める）。決め直す条件を残す

利用者の物差しに照らすと次のとおり。

| 物差し | 入れたとき | 判断 |
|---|---|---|
| 読みやすい | 署名が意味を持つ。ただし別名で既に名前は読める | 少し良くなる |
| 足すのが速い | 道具を足すたびに、作る口とテストの作り手を通す手間が増える | 少し悪くなる |
| 続けられる | `as` の口を縛る監査が 1 つ増える。valibot の版が割れると型が壊れる | 変わらないか少し悪くなる |
| バグが減る | 種類の違う ID の取り違えは型で落ちる。ただし過去の記録では、その種類の不具合は 0 件。記録にある製品の不具合 1 件はブランド型でも止まらない形で、止まるのはテストの固定値の誤り 2 件だけ | 見込みはあるが、実績が無い |

効くのが「バグが減る」の 1 つで、その根拠が予測に留まる。原則 X「抽象は実需で」と `docs/adr/0007` 基準 3 に照らして、今は入れないことを勧める。
別名 6 つは名前の手がかりとして今のまま残す。

**決め直す条件**（どれか 1 つで、この追記を下敷きに起こし直す）:

1. 種類の違う ID の取り違えで、不具合が 1 件でも記録された（fix のコミットか ISSUE）
2. 新しい種類の ID が、既存の ID と同じ関数の引数に並ぶ形で増える（例: ゲストの ID が `roulette-core` の外へ広がる）
3. ID の引数を広く書き換える変更を別の理由で行う（#95 S4b のような同一性の作り直し）。書き換える費用をすでに払うので、そのときに上の「入れる場合の形」と段の 1 本目を一緒に入れる

