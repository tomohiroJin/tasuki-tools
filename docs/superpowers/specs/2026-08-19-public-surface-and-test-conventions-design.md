# 設計: 公開面とテスト規約の未達を解消する（#72 E6 / #168）

- **日付**: 2026-08-19
- **Issue**: [#168](https://github.com/tomohiroJin/tasuki-tools/issues/168)（親: [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72) の **E6**）
- **前提**: E1（#72）・E2（#165）・E3（#166）・E4（#167）が完了済み
- **危険度**: **中〜高**（パッケージの公開面を縮める。振る舞いは 1 つも変えない）

## 概要

構造監査の未達指標（SC029・SC030・SC031・SC032・SC039③）を 0 にし、
[`docs/adr/0016`](../../adr/0016-core-domain-representation.md) 決定 2 の項目 2
（`index.ts` は公開記号を明示列挙する。`export *` を使わない）を解消する。

公開面（誰が何を使えるか）とテスト規約（名前・前提・区切り）は別の話題に見えるが、
どちらも「実装の外から見える面」を規範へ寄せる作業であり、E2・E4 がテストを
書き換えた後でなければ二度手間になるため、同じ段に置く。

**利用者から見える振る舞い・公開 URL・WS プロトコルは 1 文字も変えない。**
変えるのはパッケージ内部の `export` 修飾子、テストの名前とコメント、検査スクリプトである。

## 実測（2026-08-19・main `7820cdb`）

すべて実行して数えた。**この節がこの作業における数値の正本**とし、
PR 本文・コミットメッセージ・振り返りはここを参照する（数値を転記しない）。

| 指標 | 意味 | 現状 | 目標 |
|---|---|---|---|
| SC029 | `it`/`test` 名に仕様 ID を含むもの | 15 | 0 |
| SC030 | `it`/`test` 名が内部の呼び出しを述べるもの | 4 | 0 |
| SC031 | 前提段階に置かれた `expect(...isOk()).toBe(true)` | 3 | 0 |
| SC032 | 本体 3 行以上のテストのうち `// Given` と `// When` を持つ割合 | 1157/1432（80.8%） | 1432/1432 |
| SC039③ | `packages/timer-core/src` の公開記号のうち製品から参照されないもの | 34 | 0（例外 4 件を明示） |
| — | `packages/poker-core/src/index.ts` の `export *` | 7 行 | 0 行 |

### Issue 本文の数値のうち、実測と食い違うもの

| #168 本文 | 実測 |
|---|---|
| SC030 = 3 | **4** |
| SC032 = 1132/1345（84.2%） | **1157/1432（80.8%）** |
| `export *` は **6 行** | **7 行**（`deck` `error-messages` `protocol` `room` `round` `snapshot` `stats`） |

**#168 の完了条件のうち 1 つは達成不能である。**
`grep -rn "export \*" packages/*/src apps/*/src` が 0 件、という条件は
`packages/timer-core/src/index.ts:4` の**コメント文中**に `export *` の文字列があるため
（T055 の由来を説明する docstring）、コードから `export *` が消えても 8 行を返す。
Issue 本文の訂正が要る（D8）。

## 背景

### SC039③ の 34 記号は 2 種類に分かれる

`packages/timer-core/src` の外から `import` されているかを、複数行 `import` も含めて数えた。

| 区分 | 件数 | 内訳 |
|---|---|---|
| どこからも `import` されていない | 28 | `events.ts` の 24 インターフェース、`errors.ts` の `Unauthorized` / `PhaseConflict` / `InvalidIndex` / `InputLimitExceeded` |
| テストだけが `import` している | 6 | `DEFAULT_ERROR_MESSAGE` / `SYNC_ERROR_CODES` / `countManagers` / `SessionConfigSchema` / `RoomSchema` / `ServerMsgSchema` |

28 件は `DomainEvent` / `DomainError` の合併型に畳まれており、利用側は
`{ type: "SessionStarted", now }` のリテラルで書く。個々の名前を必要としていない。

6 件は FR-090（テストからの参照は生存の根拠に含めない）により、規範上は非公開化の対象になる。

### SC029/030/031 の規範は timer 限定のまま、検査だけが全体へ広がっている

[`docs/adr/0006`](../../adr/0006-test-conventions.md) は
「`FR-091〜099`・`SC-029〜032` という要求 ID との対応、例外表は本 ADR では扱わない。
それらは引き続き `docs/timer/adr/0009` が正本として持つ」と明記している。
一方 #135 / [`docs/adr/0014`](../../adr/0014-scan-target-integrity.md) が構造監査の走査対象を
全パッケージへ広げたため、timer 限定の規約が poker / protocol / rate-limit へ機械適用されている。

未達の分布がそれを示す。

| 指標 | timer 系 | timer 以外 |
|---|---|---|
| SC029（15） | timer-sync 7 | poker-core 3・rate-limit 4・poker-sync 1 |
| SC030（4） | timer-sync 1・timer-web 3 | 0 |
| SC031（3） | 0 | poker-core 2・protocol 1 |

SC032 については同じ食い違いが 2026-08-16 に ADR-0006 への追記で決着している。
SC029/030/031 にも同じ扱いを与える（D5）。

## 決定

### D1: 参照されていない 28 記号を非公開にする

`events.ts` の 24 インターフェースと `errors.ts` の 4 インターフェースから `export` を外し、
`packages/timer-core/src/index.ts` の `export type { … }` からも落とす。
合併型 `DomainEvent` / `DomainError` は公開したままにする。

**実測で安全を確認済み（2026-08-19・実際に適用して測定）**:

| 確認したこと | 結果 |
|---|---|
| `tsc --project packages/timer-core/tsconfig.json`（`declaration: true`） | 緑。`dist/events.d.ts` は非 export の `interface` として正しく出力される |
| `apps/timer-sync` / `apps/timer-web` の `tsc --noEmit` | 緑 |
| `packages/timer-core` の全テスト | 31 ファイル・691 件が緑 |
| SC039③ | 34 → 6 |

`tsc` が本当に走っていることは、`events.ts` にわざと型エラーを入れて
`error TS2322` が出ることで確かめた（**コマンドが空振りしていない証拠**）。

### D2: テストだけが使う 6 記号のうち 2 件を非公開にし、テストを公開 API 経由へ寄せる

| 記号 | 置き換え先 | 根拠 |
|---|---|---|
| `countManagers` | `canDemote` | `canDemote` は `wouldKeepAtLeastOneManager` 経由で `countManagers` を使う。「host/editor を数え viewer と代理を数えない」は `canDemote` の可否として観測できる |
| `SessionConfigSchema` | `CommandSchema` | `schemas.ts:118` が `config.set` の `config` を `v.partial(SessionConfigSchema)` として持つ。`CommandSchema` は製品（`ws-adapter.ts:413`）が使う |

### D3: 検査の土台になっている 4 記号は例外表へ載せる

| 記号 | 土台である根拠 |
|---|---|
| `SYNC_ERROR_CODES` | `apps/timer-sync/test/error-code-coverage.test.ts` が「ソースと双方向に照合済みの権威列挙」として起点にしている。失うと手で保守する集合に戻り、PR #34 のレビューで塞いだ穴が再び開く |
| `ServerMsgSchema` | `apps/timer-sync/test/live-ws.protocol.test.ts` が実 WS の全フレームを突き合わせる契約 |
| `RoomSchema` | `packages/timer-core/test/ai-unlock.test.ts` がスキーマの `entries` を直接検査している。公開 API 経由では書けない |
| `DEFAULT_ERROR_MESSAGE` | 既定文言の正本。落とすと 3 ファイルへ文言リテラルが複製される |

**例外表を入れる以上、SC039③ の実測値は 0 にならない。**
0 になるのは例外を除外した表示値である。完了条件は
「**例外表に載る 4 件を除いて 0**」と読む。この読み替えを PR 本文にも書く。

### D4: 例外表は両方向に腐り止めを入れる

`{ file, name, reason }` の 3 つ組で持ち、次の 2 つで落とす。

1. 例外に挙げた `file` に その `name` の公開宣言が**無い**とき
   （記号が消えたのに例外が残る／同名の別記号を静かに覆うのを防ぐ）
2. 例外に挙げた記号が製品コードから**参照されるようになった**とき
   （例外が不要になったことを検出する）

判定は既存の `findMissingPaths` / `diffTargets` と同じ形にし、新しい判定機構を増やさない。
理由（`reason`）は必須とする（`EXCLUDED_PACKAGES` と同じ作法）。

### D5: SC029/030/031 の規範を ADR-0006 へ昇格する

ADR-0006 の「決定」へ 2 項を足す。

- **テストの名前**: 仕様 ID・内部の関数名・「〜が呼ばれる」を含めない。
  仕様 ID は `describe` 直上の `@requirements` JSDoc に置く（timer FR-092/093/094 の昇格）
- **前提の失敗**: 前提の構築に失敗したらビルダーが `throw` する。
  前提段階に `expect` を置かない（FR-096 の昇格）

`docs/timer/adr/0009` には「規範としては ADR-0006 へ昇格した。本 ADR は 148 ファイルの
移行記録として残る」旨を追記する。**件数は転記しない**（ADR-0014 の方針）。

### D6: SC031 の 3 件は冗長な検証を落として解消する

3 件はいずれも「前提のガード」ではなく、**テスト対象そのものの検証**である。

```
packages/poker-core/tests/room.test.ts:22   createRoom(...)   ← createRoom が対象
packages/poker-core/tests/room.test.ts:58   joinRoom(...)     ← joinRoom が対象
packages/protocol/tests/boundary.test.ts:13 parseBoundaryMessage(...) ← 対象
```

SC031 は「そのテスト内により後ろに `expect` があるか」で前提と検証を見分けており、
この 3 件はその近似が外した側にある。しかし規範（FR-096）が求める姿は同じで、
`expect(result.isOk()).toBe(true)` を落として `result._unsafeUnwrap()` に任せれば足りる。
**`_unsafeUnwrap()` は Err で throw する**ことを neverthrow 8 系で実測済みなので、
失敗の signal は失われない。

### D7: 機械検査を 2 本新設する

**① エントリに `export *` が無いことを検査する**

走査対象は `SCANNED_PACKAGES` の `entry` から導く。
`packages/*-core/src/index.ts` という glob では書かない — パッケージが増減するたびに
検査側の列挙が腐るためである（#175 で CI ジョブ表に対して行ったのと同じ判断）。
判定前に `stripStringsAndComments` を通し、docstring 中の `export *` を誤検出しない。

対象は 9 エントリ（`src` と `entry` の両方を持つ宣言）で、
**ADR-0016 決定 2-2 が言う `index.ts` より広い**。狭める規則（`entry` が `index.ts` のものだけ、等）を
書くほうが腐りやすいため、広いまま採る。この判断は ADR-0016 へ追記する。

試作で赤 → 緑 → 赤を確認済み（現行 main で 7 行を検出 → 明示列挙後に 0 件 → 巻き戻して再び 7 行）。

**② SC039③ の例外表の健全性検査**（D4）

### D8: `#168` 本文の完了条件を訂正する

`grep -rn "export \*" packages/*/src apps/*/src` が 0 件、という条件を
「新設する機械検査 ① が緑」へ差し替える。理由（docstring に当たる）をコメントで残す。

## 触れる範囲

```
packages/timer-core/src/events.ts          24 インターフェースの export を外す
packages/timer-core/src/errors.ts          4 インターフェースの export を外す
packages/timer-core/src/participants.ts    countManagers の export を外す
packages/timer-core/src/schemas.ts         SessionConfigSchema の export を外す
packages/timer-core/src/index.ts           30 記号を列挙から落とす
packages/timer-core/test/participants.test.ts          canDemote 経由へ
packages/timer-core/test/schemas.problem-enabled.test.ts  CommandSchema 経由へ
packages/poker-core/src/index.ts           export * 7 行 → 43 記号の明示列挙
scripts/audit-structure.mjs                例外表と健全性検査を足す
scripts/audit-public-surface.mjs   新設    export * の検査
scripts/audit-public-surface.test.mjs 新設
.github/workflows/ci.yml                   quality ジョブへ 1 ステップ追加
docs/adr/0006-test-conventions.md          決定を 2 項追加
docs/adr/0016-core-domain-representation.md  検査の射程を追記
docs/timer/adr/0009-test-conventions.md    昇格した旨を追記
docs/guides/development.md                 検査の一覧へ 1 本追加
テスト 60 ファイル                          区切りコメントと名前の修正
```

## 完了条件（EARS と検査の対応表）

| # | EARS | 検査 |
|---|---|---|
| 1 | 構造監査を実行したとき、SC029 は 0 を報告する | `node scripts/audit-structure.mjs` |
| 2 | 構造監査を実行したとき、SC030 は 0 を報告する | 同上 |
| 3 | 構造監査を実行したとき、SC031 は 0 を報告する | 同上 |
| 4 | 構造監査を実行したとき、SC032 は 100% を報告する | 同上 |
| 5 | 構造監査を実行したとき、SC039③ は 0 を報告する（例外表の 4 件を除く） | 同上 |
| 6 | 走査対象のエントリに `export *` があるとき、公開面検査は非ゼロで終了する | `node scripts/audit-public-surface.mjs` |
| 7 | 例外表の記号が実在しないか、製品から参照されているとき、構造監査は非ゼロで終了する | `node scripts/audit-structure.mjs` |
| 8 | `@tasuki/poker-core` の利用者が従来の記号を import したとき、型検査は通る | `pnpm typecheck` |
| 9 | すべてのテストが緑である | `pnpm test` |

## 何を見ていないか

- **型検査は `index.ts` の列挙漏れを捕まえない。** `computeStats` を明示列挙から落としても
  全パッケージが緑になることを実測した（内部の `snapshot.ts` が直接 import しており、
  index 経由の利用者がいないため）。明示列挙の網羅性は 43 記号を機械生成して担保し、
  型検査を根拠にしない
- **SC039 の走査は `packages/timer-core` 1 パッケージ限定**。poker-core の公開面は測っていない
- **`poker-core` の 43 記号のうち 14 記号は index 経由の利用者がゼロ**。明示列挙化はこれを
  そのまま写すので、死んだ公開面は残る（切り出し ①）
- 区切りコメントの**中身の妥当性**は機械判定できない。SC032 は `// Given` と `// When` の
  存在しか見ない
- **検査を 1 本足すと 4 箇所を触る**（`scripts/*.mjs`・`scripts/*.test.mjs`・`.github/workflows/ci.yml`・
  `docs/guides/development.md` の「検査系」節）。このうち自己テストだけが git から導出され、
  残り 3 箇所は手で書く。**4 箇所が揃っているかを見る検査は存在しない**（実測）。
  #175 が機構へ倒したのは CI ジョブ表の `quality` 行であって、「検査系」節の列挙ではない。
  本作業では 4 箇所すべてを触り、`ci.yml` へ入れた新ステップが**実際に落ちること**を
  ブランチの CI で確認する（「検査は存在するが実経路では効いていない」を避ける）

## スコープ外（切り出す）

| # | 内容 |
|---|---|
| ① | SC039 の走査を `packages/timer-core` 以外へ広げる（#135 が他指標で解消した狭さの残余） |
| ② | `ServerMsgSchema` が製品の実経路に配線されていない（サーバーは送信メッセージを検証していない） |
| ③ | `poker-core` の index 経由で誰も使わない 14 記号の扱い（① が入れば機械的に見える） |

## 敵対的検証で壊れた主張（2026-08-19）

**SC032 の分母定義を「物理行」から「トップレベルの文」へ変える案を出したが、却下した。**

| 出した主張 | 実測 |
|---|---|
| 46 件が対象外になる | 不足は 275 → 199（76 減） |
| 分母 1432 → 1386 前後 | 分母 1432 → 1279（153 減）。**分子も 77 減る** |

さらに副作用が 2 つあった。

- **`it.each` の 41 件中 35 件が分母から落ちる。** `it.each([...])(` の引数行が最小字下げに
  なるため「文 = 0」と判定される
- **区切り済みなのに落ちる 77 件に、34 行のテストが 2 件・26 行が 2 件**含まれる

賢い判定を足すほど穴が増える例であり、これは検査の弱体化にあたる。
**SC032 は検査に手を入れず、275 件すべてに区切りを入れる。**

## 関連

- [`docs/adr/0006`](../../adr/0006-test-conventions.md)（テスト規約。D5 で改版）
- [`docs/adr/0014`](../../adr/0014-scan-target-integrity.md)（走査対象の健全性。D7 の作法の出所）
- [`docs/adr/0016`](../../adr/0016-core-domain-representation.md)（core の表現。決定 2-2 が本作業の出所）
- [`docs/timer/adr/0009`](../../timer/adr/0009-test-conventions.md)（timer のテスト規約。D5 で追記）
- [E1 の設計正本](./2026-08-17-adr-alignment-e1-design.md)（#72 を 5 部分系へ分けた決定）
