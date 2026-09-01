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

## 追記（2026-09-02・#220）

`packages/timer-core` の 24 件を列挙から落とした。SC-039④ は 26 → **2 件**
（残りは `packages/rate-limit` の 2 件＝ #221）。型 26 件は 1 つも触っていない。

**24 件のうち 9 件は、外から現に使われている。** ただし取り込み口は `index.ts` ではなく
**モジュール単位のサブパス**（`@tasuki/timer-core/aggregate`）で、`apps/timer-web` が
上限値の定数（`MAX_DISPLAY_NAME` など）と `elapsedMs` `VALID_INTERVAL_MINUTES` を
そこから取っている。サブパスは index を通らないので、**index の列挙が使われた根拠に
ならない**（SC-039④ がサブパスを数えないのと同じ理由）。上の「代わりの入口があるなら
列挙しない」に当たるため落とした。**利用側は 1 ファイルも変えていない。**

残りは、取り込み元がどこにも無い 13 件（いずれもパッケージ内部では使われており、
死んだコードではない）と、テストだけが取り込む 2 件
（`SYNC_ERROR_CODES` `DEFAULT_ERROR_MESSAGE`）である。後者はテストの取り込み口を
サブパスへ替えた —— テストからの参照を公開の根拠にしないのは FR-090 の延長であり、
宣言側の `export` を守る `SC039C_EXCEPTIONS`（③）とは独立した判断である。

**この付け替えの前提に誤りがあった。** `apps/timer-sync/tsconfig.json` は
「bun test はサブパスを解決できない」と書いていたが、2026-09-02 の実測（bun 1.3.14）で
解決できた。`paths` を存在しないディレクトリへ向けると落ちることまで確かめてある
（＝ bun は tsconfig の `paths` を実行時解決に使う）。記述は同ファイルで直した。

### SC-039③ の宛先を付け替えた

`SC039C_EXCEPTIONS` の docstring は長く「残りは #182 が扱う問いそのものである」と
書いていたが、**これは誤りだった**。③が測るのは宣言ファイルの `export` の要否であり、
#182 が扱ったのは公開面に載せる理由の有無（④）で、両者は独立している。
`stripNamedReexports` が index の再エクスポートを参照から外すため、
**index から記号を落としても③の件数は 1 件も動かない**（実測で 15 件のまま）。

#182 を閉じると③の問いが宛先を失うので、
[#223](https://github.com/tomohiroJin/tasuki-tools/issues/223) へ移し、docstring も直した。
