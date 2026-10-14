# 大規模リファクタリング（#360）— 設計正本

- **Issue**: [#360](https://github.com/tomohiroJin/tasuki-tools/issues/360)（epic）・子 Issue #361〜#372
- **日付**: 2026-10-13

**実測時点**: main `e9180c9`（#94 PR 2 と lockfile の修正 #359 の後）

**前提となる規範**: [`docs/constitution.md`](../../constitution.md) 原則 I（TDD）/ IV（境界の型安全）/
VI（依存は内向き）/ VII（検査は壊して確かめる）/ VIII（記録が正本）/ IX（小さく回す）/ X（抽象は実需で）

**前提となる ADR**: [`docs/adr/0004`](../../adr/0004-sync-server-ports-and-adapters.md)（ポート/アダプタ）/
[`docs/adr/0005`](../../adr/0005-result-and-boundary-validation.md)（`Result` と境界検証）/
[`docs/adr/0007`](../../adr/0007-abstraction-criteria.md)（抽象の導入基準）/
[`docs/adr/0013`](../../adr/0013-pr-granularity.md)（PR の粒度）/
[`docs/adr/0015`](../../adr/0015-web-layer-structure.md)（web 層の責務分離）/
[`docs/adr/0016`](../../adr/0016-core-domain-representation.md)（ドメインの表現）/
[`docs/adr/0017`](../../adr/0017-bounded-contexts-and-packages.md)（文脈とパッケージ・依存の許可表）/
[`docs/adr/0020`](../../adr/0020-invite-browser-operations.md)（招待のブラウザ操作）/
[`docs/adr/0021`](../../adr/0021-topic-as-shared-context.md)（お題・Markdown）/
[`docs/adr/0022`](../../adr/0022-ui-components-layer.md)（部品層）

**型にした先例**: [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)（新しい ADR に沿って振る舞いを変えずに直したエピック）・
[#321 の設計正本](./2026-09-29-timer-without-tailwind-design.md)（見た目を変えないことを、基準と並べた比較で合否にした）

**この文書の位置づけ**: エピック全体の設計の正本はこの文書である。**実測の数字と行番号は各子 Issue の本文が持つ**ので、
ここへは転記しない。子 Issue ごとの実装計画は、着手のときにその時点の main を測って
`docs/superpowers/plans/YYYY-MM-DD-refactor-rN-<topic>.md` に書く（§8）。

## 1. 目的

機能追加（#91・#95・#316・#321・#94）が続いて落ちた読みやすさを取り戻す。
**利用者から見える振る舞い（画面・URL・プロトコル・ログの形）は変えない。**

利用者の言葉（2026-10-12）: DRY・SOLID・デザインシステム・DbC に対応し、DDD とクリーンアーキテクチャに注意し、
クリーンコードにする。振る舞いは変えない。TDD で安全に進める。変更中の機能への影響を小さくする。

## 2. 方針: 制御はコードで行う

**利用者の判断（2026-10-13）**: 設計と計画は行う。ただし、決まりごとを**文書に書いて守らせるのではなく、
コードで守らせる**のを基本にする。

| 置き場 | 持つもの |
|---|---|
| 型 | 不変条件・契約・境界（ブランド型・スキーマから導いた型・`Result` のエラーの union） |
| テスト | 振る舞いの仕様（Given/When/Then。`docs/adr/0006`）。特性テストが「変えない」の正本になる |
| 構造監査（`scripts/audit-*`） | 依存の向き・層の境界・トークンの使い方など、型では止められない決まり |
| 文書（この設計正本・計画・ADR） | **なぜそうするか**と、**どう進めるか**。守らせる仕組みそのものは持たない |

**設計で決めたことのうち機械で守れるものは、同じ PR で型・テスト・検査にする（MUST）。**
文書にしか無い決まりは、いずれ黙って破られる（#155・#165 の憲法の参照の数え違いが実例）。
§5 の各項に「守らせるコード」の列を置くのはこのためである。

## 3. 観点の読み替え

利用者の挙げた観点を、このリポジトリの規範の上で読む（`docs/guides/architecture.md`「一般的な方法論との対応」）。

| 観点 | 読み方 | このエピックでの主な対象 |
|---|---|---|
| DRY | **知識の重複**に限る。抽出は呼び出し 2 箇所以上・20 行以上（部品層は 20 行の基準を当てない） | 接続層のエラーの語彙（#362）・参加の流れ（#366）・同期フック（#369）・Markdown の描画（#371） |
| SOLID | S と D は層の分離、O と I はポートの設計。パターンは変更が現に難しいときだけ | `ws-adapter.ts`（#368）・`makeHandlers`（#366）・依存の袋（#367） |
| DbC | 事前条件は境界の検証、不変条件は型、失敗は `Result`。ドメインは投げない | 手書きの型（#363）・不変条件（#364） |
| DDD | ドメインは純粋。文脈の境界（`docs/adr/0017`）と用語を守る | Command の集合（#363）・room-core の `Result`（#364） |
| クリーンアーキテクチャ | 依存は内向き。web は純粋判断・同期フック・画面 | ポート（#367）・画面の判断（#370） |
| デザインシステム | トークン・要素・部品の 3 層へ寄せる | 表示部品（#371）・余白と押せる大きさ（#372） |
| クリーンコード | 名前で意図が分かる・関数が 1 つのことをする・同名の別物を作らない | 全子 Issue。60 行を超える関数の数を前後で測る |

## 4. 振る舞いを保つ方法

### 4.1 「変えない」の定義

| 面 | 変えないとは | 確かめるもの |
|---|---|---|
| プロトコル | 送るフレームの JSON（キー・値・エラーコード・文言）が同じ | 実 WS 越しのテスト（`apps/tasuki-sync/test/live-ws.*`）・E2E |
| ドメイン | 同じ入力に同じ `Result` | 既存の単体テスト・変異検査 |
| 画面 | DOM（役割・ラベル）と見た目が同じ | 画面のテスト・基準と並べたスクリーンショット（§4.4）・E2E |
| ログ | 出す項目と伏せる項目が同じ | `audit-log-hygiene.mjs`・ログのテスト |
| 検査 | 検出件数・メッセージ・終了コードが同じ | 変更前後で全検査を流した出力の差分 |

### 4.2 TDD の回し方（リファクタリングの場合）

1. **特性テストを足す（緑で入る）。** 移す前の振る舞いを固定する。ここでのテストは「いまの振る舞い」を書くので最初から緑になる。
   **緑で入ったテストは、壊して赤くなることを確かめる**（原則 VII。実装を 1 行変えて赤を見てから戻す、
   または変異のパッチを足す）。確かめないと、恒真のテストで「変えていない」と言うことになる
2. **構造を変える。** 1 コミットは 1 つの移動か 1 つの置き換えにする。各コミットで全テストが緑
3. **新しく切り出した純粋関数・ユースケースには、その単位のテストを先に書く**（赤 → 緑）。
   画面の中にあった判断を出す（#370）ときは、出した先の関数のテストを先に書いてから移す
4. **構造の変更と振る舞いの変更を同じコミットに混ぜない。** 振る舞いの疑いは直さずに Issue にする（#373〜#378 が実例）

### 4.3 変異検査

コードを動かすと、`scripts/mutations/` のパッチが当たらなくなる。**ID を変えずに当て直す**（手順は
[`2026-10-12-facilitator-roulette.md`](../plans/2026-10-12-facilitator-roulette.md) §5: 触るファイルの
パッチを `grep -l` で引き、`git apply --check` で 1 本ずつ確かめる）。テストのファイルを動かしたら、
宣言の `tests` のパスも直す。新しい ID は、着手の時点の最大の番号の次から、子 Issue の計画で確保する。

### 4.4 画面の比較

web に触れる子 Issue（#369〜#372）は、#321 の比べ方を使う: 基準のコミットに固定したビルドと、作業中のビルドを
同じ状態で並べてスクリーンショットを撮り、差が 0 件であることを合否にする。#321 PR 4 で撤去した仕組みを
戻すか作り直すかは、最初に触る #369 の計画で決める。**合否は比較のテストが出し、台帳（例外の記録）は計画に置く。**

## 5. 目標の構造

各項の「守らせるコード」は、その子 Issue の PR に入れる。既にある検査で足りるものは名前だけを挙げる。

### 5.1 scripts（#361）

- `scripts/lib/import-specifiers.mjs` を新設し、「何を import とみなすか」と「`.js` を `.ts` へ読み替える解決」を 1 つにする。
  使う側は `audit-structure`・`audit-dependency-direction`・`audit-timer-classes`・`audit-web-sync-boundary`・`audit-assembly-wiring`
- 走査対象の一覧（`SCANNED_PACKAGES`・`hasScanTarget`・`listWebAppDirs`）を `scripts/lib/` へ移し、スクリプト同士の import をなくす
- 大きな 2 本（`audit-structure.mjs`・`mutation-check.mjs`）は、出力を変えない範囲で検査の群ごとに分けるかを計画で決める

| 決まり | 守らせるコード |
|---|---|
| スクリプトは互いを import しない（共有は `scripts/lib/` だけ） | `scripts/*.mjs` から `./audit-*` への import を拒むテストを足す（置き場は計画で決める） |
| import の解析は 1 つ | 上の項で、`scripts/lib/import-specifiers.mjs` 以外に import の正規表現を置くと落ちる形にできるかを計画で確かめる |

> **追記（2026-10-13・R1 の計画 [`2026-10-13-refactor-r1-scripts.md`](../plans/2026-10-13-refactor-r1-scripts.md)）**: 上の 3 点は、測ると成り立たなかった。
>
> - **import の抽出は 1 つにしない。** 3 つの抽出は意味がわざと違う（越境を広く拾う・行単位でコメントも読む・到達性のために拾う）。1 つにすると検査が弱まる。解決（`.js` → `.ts`）の重なりは 6 行で、`docs/adr/0007` 基準 2 に満たない
> - **`SCANNED_PACKAGES`・`listWebAppDirs` は `lib/` へ移さない。** 宣言を移すと、`scan-target-wiring.test.mjs` が複製を書き換えて壊す対象を失う。スクリプト同士の取り込みは、許可表を持つテスト（`scripts/script-imports.test.mjs`）で明示して残す
> - 代わりに、`audit-structure.mjs` の指標の判定を `scripts/lib/structure/` へ移す。`mutation-check.mjs` の分割は #94 PR 3 とぶつかるので、別の子 Issue（#380）に出す
>
> 決まりを守らせるコードは「スクリプト同士の取り込みは許可表にあるものだけ」の 1 つになった。

### 5.2 接続層の契約（#362）

`packages/protocol` に、どのツールでも同じ意味を持つ接続層の契約を集める。

```text
packages/protocol/src/
  boundary.ts             （既存）parseBoundaryMessage
  connection-errors.ts    （新）接続層のエラーコード 5 種と文言・段階からコードへの対応
  error-frame.ts          （新）エラーフレームのスキーマを作る関数（ツールのコードの union を引数に取る）
```

ツール固有のエラーコードと文言は各 core に残す。`audit-domain-error-shape.mjs`（core のエラー型が文言を持たない）とは
ぶつからない —— 文言は `error-messages.ts` に置く既存の形を変えない。

| 決まり | 守らせるコード |
|---|---|
| 接続層のエラーの文言は 1 か所 | 各 core・sync が `@tasuki/protocol` から取る。写しが残っていないことを、文言の文字列で引く単体テストで確かめる（同じ文字列が protocol 以外の `src` に無い） |
| フレームの形は変わらない | 実 WS 越しのテストで、エラーフレームを文字列のまま比べる |

> **追記（2026-10-13・R2 の計画 [`2026-10-13-refactor-r2-connection-errors.md`](../plans/2026-10-13-refactor-r2-connection-errors.md)）**: 上の構造は、測ると成り立たなかった。
>
> - **core は `@tasuki/protocol` に依存できない。** 依存の許可表は topic-core・roulette-core・timer-core を `[]` にしている（`docs/adr/0017` 決定 1・2）。広げると構造監査を緩めることになる
> - **`packages/protocol` は、コードも文言も決め打ちしない設計である**（`boundary.ts` の注記。poker は json と schema を 1 つのコードに畳む）。段からコードへの対応は、timer の系統の決めごととして同期サーバーに置く
> - **エラーフレームのスキーマ 5 つは、わざと形が違う**（前方互換で任意のコードを通す timer・ハブ・poker と、既知のコードだけを通すお題・ルーレット）。1 つにしない
>
> そこで正本は `apps/tasuki-sync/src/application/connection-errors.ts` に置く。正本を取り込めない core の写しは、同期サーバーのテストで一致を固定する。守らせるコードは次の 2 つになった。
>
> - 「core の写しが正本と一致する」
> - 「同期サーバーの中に写しが残っていない」

### 5.3 スキーマと型（#363）

**型はスキーマから導く。** 既にある 2 つの手本のどちらかに寄せる。

- 出力の型をそのまま使う所: `type X = v.InferOutput<typeof XSchema>`（poker の形）
- 手書きの型を残したい所（doc コメントを型に付けたいなど）: `const XSchema: v.GenericSchema<X> = …`（room-core の形）

リテラルの union（部屋の段階・セッションの操作など）は、`as const` の配列を 1 つ置き、型とスキーマ（`v.picklist`）の両方をそこから作る。
`DecideCommand` は `Command` から `Extract` で導き、`build-domain-command.ts` は検証済みの型を受け取る。

| 決まり | 守らせるコード |
|---|---|
| 型とスキーマが一致する | 上の書き方そのもの（ずれると型検査が落ちる）。書き換える前に `expectTypeOf` の等価テストを置き、今の一致を確かめる |
| 検証済みの値を確かめ直さない | `build-domain-command.ts` の引数の型。`as` の件数を前後で PR に書く |

> **追記（2026-10-13・R3 の計画 [`2026-10-13-refactor-r3-schema-types.md`](../plans/2026-10-13-refactor-r3-schema-types.md)）**: 上の方針は、測って次のように変えた。
>
> - **手書きの型とスキーマは、いまは食い違っていない**
>   - topic・roulette は厳密に等しい
>   - timer の `Room` は、任意項目の `\| undefined` の 1 点だけが違う
> - **型は導き直さず、型の正本は手書きの型に置く。** 導くと timer の任意項目の型が変わり、`v.exactOptional` へ替えると実行時に受け付ける値が変わる。手書きの型は項目ごとの説明も持っている。等しさは、各 core のテストに置く型のテスト（双方向の等しさ）で守る。`GenericSchema<T>` の注釈は一方向しか見ないので採らない
> - **`DecideCommand` は `Command` から導かない。** ドメインのコマンドで、wire に無い値（`order`・`ineligible`・`index`・`topicTitle`）をサーバーが埋める。`build-domain-command.ts` は wire → ドメインの翻訳として残し、引数を検証済みの型にする
> - **セッションの操作の集合は 2 つある**（wire の 7 つ・ドメインの 5 つ）。1 つにはせず、wire の集合を「ドメインの 5 つ ＋ 受けるが扱わない 2 つ」と組む
>
> 守らせるコードは、次の 3 つになった。
>
> - 「手書きの型とスキーマの等しさの型のテスト」
> - 「翻訳の表の特性テスト」
> - 「`RoomScopedCommand` の型のまま運ぶ引数」

### 5.4 不変条件（#364）

- `roulette-core` の `draw.ts` は `Result` を返す（ドメインは投げない）
- `timer-core` の完成記録の ID は、生成器を引数で受け取る（モジュールの状態を持たない）
- `room-core` の遷移は `Result` を返す（`docs/adr/0017` 決定 5 にコードを合わせる。2026-10-13 の判断）。
  黙って何もしない失敗（知らない参加者・知らない接続）をエラーの union に出す。呼び出し側は失敗のとき今と同じく何もしない
- `IntervalMinutes` へは、確かめてから狭める関数を通す
- `rotation` と `driverCounts` を 1 つの席の配列に畳むかは計画で決める（プロトコルの形に出ているなら畳まない）

| 決まり | 守らせるコード |
|---|---|
| ドメインは投げない | `audit-domain-error-shape.mjs` に `throw` の検出を足すかを計画で決める（足すなら壊して赤を確かめる） |
| ドメインはモジュールの状態を持たない | `audit-domain-side-effects.mjs` にトップレベルの `let` の検出を足すかを計画で決める |
| room-core の失敗は型に出る | 戻り値の型 |

> **追記（2026-10-13・R4 の計画 [`2026-10-13-refactor-r4-invariants.md`](../plans/2026-10-13-refactor-r4-invariants.md)）**: 計画で、次のように決めた。
>
> - **`throw` とトップレベルの `let` は、`audit-domain-side-effects.mjs` で拒む。** 上の表は `audit-domain-error-shape.mjs` を候補に挙げていたが、字面でドメインの `src` を見る既存の検査に足す方が素直である（ドメインの宣言の一覧も同じものを使える）
> - **roulette の `throw` は、前例（`INVALID_SETTLE`）と同じ形で `INVALID_RANDOM` の `Result` にする。** 同期サーバーが `INTERNAL_ERROR` に読み替えるので、wire の応答は変わらない
> - **記録の ID は、生成器（`createRecordIdGenerator`）を注入する。** 状態は同期サーバーの組み立てが持ち、ID の形は変えない
> - **`as IntervalMinutes` は、リセットを秒のまま組むことで要らなくする**
> - **`rotation` と `driverCounts` は畳まない**（wire・端末の保存形式・画面まで動く）。長さがそろうことを性質のテストで守る
> - **room-core の ID のブランド型は見送る**（同期サーバーの全体に広がる。取り違えは関数名で既に防いでいる）
>
> **追記（2026-10-13・R4 の実施）**: 上の 2 点を改めた。
>
> - **roulette の乱数源の契約違反でも、ログは今と同じに保つ。** `Result` にすると、接続層が残していた `on-message-error name=RangeError` が消える。ログが消えるのは振る舞いの変更なので（§4.1）、ハンドラが同じ行を残す。前例の `INVALID_SETTLE` には記録の抜けがあり、#382 に分けた
>   - **追記（2026-10-15・#382）**: この記録の抜けは #382 で塞いだ。`INVALID_SETTLE` も `roulette-random-violation reason=invalid-settle` を error で残し、`INVALID_RANDOM` にも同じイベントを足した
> - **room-core の失敗の枝は、代理を外すとき（`participant-remove.ts`）に届く。** 名簿の中身は前と同じで、ほかの呼び出しは届かない

### 5.5 同期サーバーのアプリケーション層（#366）

新しく置くもの（名前は仮。計画で決める）:

```text
apps/tasuki-sync/src/application/
  room-lookup.ts          接続 ID からルームを引く問い合わせ（ツールで絞る版を含む）。走査はここだけ
  join-tool-room.ts       topic・roulette（と、合えば hub）の参加の流れ。ツール ID と配信先を引数に取る
  reply-failure.ts        失敗の返し方（fail / failJoin / sendError の 6 つを 1 つに）
  tool-state.ts           「状態を取り出し、無ければ初期値を入れる」と「保存してから配信する」
  room-commands/          handleRoomCommand をコマンドごとの事前条件と事後処理の表に分けたもの
```

`makeHandlers`（timer）からは、スケジューラの突き合わせと並び替えの生成を出す。
**poker の参加と作成は寄せない**（部屋 ID がぶつかったときの方針が違う。直すのは #375 の後）。

| 決まり | 守らせるコード |
|---|---|
| 接続からルームを引く走査は 1 か所 | `room-lookup.ts` の単体テスト。`store.list()` を呼ぶ場所を `audit-assembly-wiring.mjs` の流儀で数える検査を足すかを計画で決める |
| ハンドラは使う依存だけを受け取る | 依存の型（`Pick` か小さなインタフェース）。#367 と合わせて行う |

> **追記（2026-10-13・R6 の実施 [`2026-10-13-refactor-r6-sync-application.md`](../plans/2026-10-13-refactor-r6-sync-application.md)）**:
>
> - **走査の写しは、同期サーバーのテスト（`test/room-lookup-sources.test.ts`）が拒む。** 構造監査ではなく、#362 の文言の写しの検査と同じ形にした
> - **参加のユースケースは hub・topic・roulette の 3 つが使う**（hub も同じ流れだった）。timer の参加は流れが違うので使わない
> - **`reply-failure.ts`・`tool-state.ts` は作らなかった**（2026-10-13 の利用者の了承）。失敗の補助は送る口と型がそれぞれ違い、保存して配る補助は中身が違う。重なっていた知識（参加の失敗の文言・topic の初期値）だけを 1 つにした
> - **`room-commands/` は 4 つのモジュールになった**（事前条件・サーバーが埋める値・事後処理・並び替え）。スケジューラの突き合わせは `scheduler-sync.ts`

### 5.6 ポート（#367）

- 時計: 壁時計と単調時計を名前で分ける（`WallClock` / `MonotonicClock`。`poker-` の接頭辞を外す）
- タイマー（`setTimeout` / `setInterval`）のポートは、差し替えるテストを同じ PR に置く場合だけ足す（`docs/adr/0007` 追記 2026-08-17）
- `LogSink` / `Logger` は `ports/` へ移す
- timer の `Broadcaster` と `HubBroadcaster` のアダプタを `adapters/` へ出し、`create-sync-server.ts` は組み立てだけにする
- 同じ名前の別物（`Broadcaster`・`HandlerDeps`・`makeHandlers`・`RateLimitGate`・`RoomState`）を区別する名前にする

| 決まり | 守らせるコード |
|---|---|
| アプリケーション層は大域の時計・乱数を呼ばない | `audit-domain-side-effects.mjs` の対象に `apps/tasuki-sync/src/application` を足すかを計画で決める（足すなら壊して赤を確かめる） |
| 組み立ては 1 か所 | `audit-assembly-wiring.mjs`（既存） |

> **追記（2026-10-13・R7 の実施 [`2026-10-13-refactor-r7-ports.md`](../plans/2026-10-13-refactor-r7-ports.md)）**:
>
> - **アプリケーション層の大域の時計・乱数は、同期サーバーのテスト（`test/application-globals.test.ts`）が拒む。** `audit-domain-side-effects.mjs` の対象にはしなかった（あちらは `new Date(` や `throw` も拒み、アプリケーション層には当てはまらない）
> - **タイマーのポートは足さなかった。** 差し替えるテストは bun の偽のタイマーで書けている（`docs/adr/0007` 追記 2026-08-17 の条件を満たさない）
> - **`ServerTopicProvider` は `Result` にしなかった。** 想定外の例外を隔離する経路が残るので、契約が 2 通りになる
> - **依存の袋は細くしなかった。** 実測で全ての項目を使っていた
> - **同じ名前の別物は poker 側を改めた**（`PokerBroadcaster`・`PokerHandlerDeps`・`makePokerHandlers`・`PokerHandlers`・`PokerRoomState`。`RateLimitGate` は #366 で `PokerRateLimitGate`）

### 5.7 `ws-adapter.ts`（#368）

```text
apps/tasuki-sync/src/adapters/ws/
  ws-adapter.ts           組み立て（下の部品を束ねる）
  connection-gate.ts      ?tool= の判定・Origin・クライアント鍵・接続数・知らないツール
  heartbeat.ts            ping/pong
  tool-channel.ts         ツールごとの受け口の定義（大きさの上限・解析・振り分け・エラーフレーム）
  ws-sender.ts            型引数つきの send / broadcast
  http-fallback.ts        管理用の経路・426
```

4 つの `handleXMessage` は `tool-channel.ts` の定義 1 つにまとめる。**新しいツールを足すときに触るのは定義の表 1 行**になる
（開放閉鎖）。timer の名前の正規化はアプリケーション層へ戻す。

| 決まり | 守らせるコード |
|---|---|
| 入場の可否が弱まらない | `test/ws-adapter.*.test.ts` の既存のテスト（Origin・接続数・大きさ・知らないツール）。分ける前に表にして欠けを足す |
| アダプタは業務の検証をしない | `normalizeCommandNames` の import 元。`audit-dependency-direction.mjs` の層の規則で拒めるかを計画で確かめる |

> **追記（2026-10-13・R8 の実施 [`2026-10-13-refactor-r8-ws-adapter.md`](../plans/2026-10-13-refactor-r8-ws-adapter.md)）**:
>
> - **`ws-adapter.ts` は今の場所に残し、部品だけを `adapters/ws/` に置いた**（上の絵と違う。テスト・変異のパッチ・検査の許可表・コメントがこのパスを指すため）。部品は上の 5 つに、`connection-data.ts`（接続ごとの値）と `error-log.ts`（ログへ出す例外の分類）を足した 7 つ。`ws-sender.ts` は `ws-send.ts`
> - **新しいツールを足すときに触るのは、受け口の表（`buildChannels`）の 1 行と `?tool=` の許可リスト**
> - **アダプタが業務の検証をしないことは、層の検査では拒めなかった**（`audit-dependency-direction.mjs` はパッケージの単位）。アダプタがアプリケーション層から取り込んでよいものを、テスト（`test/adapter-imports.test.ts`）の許可表で固定した。正規化を飛ばす配線は、timer の受け口のブランド型で型検査が落とす
> - **`process.exit(1)` は組み立て（`server.ts`）へ移した。** アダプタは `ServerStartError` を投げる
> - timer だけが reject でログを残さないこと・内部エラーの文言が違うこと（#381）は、変えずに固定した

### 5.8 web の共有の層（#369・#370・#371）

**React の共有パッケージを 1 つ新設する**（2026-10-13 の判断。名前は計画で決める。例: `packages/web-kit`）。

- 置くもの: 参加のやり直しのフック（純粋な計画は `sync-client` に残す）・Markdown の React の描画・お題の引き出しの開閉とフォーカスを戻すフック
- 依存してよい先: `react`（peer）・`@tasuki/markdown`・`@tasuki/sync-client`。**ドメインの core には依存しない**
- 外部の依存は増えない（React は既に各 web アプリの依存）ので、原則 II の ADR は要らない。
  `docs/adr/0021` 決定 7（`@tasuki/markdown` は React を知らない）とは食い違わない —— 描画は新しいパッケージが持つ
- **招待の表示の構造は各画面に残す**（`docs/adr/0020` 決定は「表示の構造・スタイルは各画面が持つ」）。共有するのは文言だけにするかを #371 の計画で決める

画面の判断（#370）は、各アプリの純粋判断の `.ts` へ出す（`session-view.ts` など）。新しいパッケージへは出さない（呼び出しは 1 アプリだけなので、`docs/adr/0007` 基準 1）。

| 決まり | 守らせるコード |
|---|---|
| 新しいパッケージの依存の向き | `scripts/audit-dependency-direction.mjs` の `ALLOWED` に 1 行足す（`docs/adr/0017` 決定 4 の形。表に無い依存は落ちる） |
| 画面は同期クライアントを直接読まない | `audit-web-sync-boundary.mjs`（既存）。新しいパッケージを同期フックの側として扱うかを計画で決める |
| WS の URL・接続状態の型は 1 か所 | `sync-client` から取る。写しが無いことを、`location.protocol === 'https:'` で引く検査かテストで確かめるかを計画で決める |

> **追記（2026-10-14・R9 の実施 [`2026-10-14-refactor-r9-sync-hooks.md`](../plans/2026-10-14-refactor-r9-sync-hooks.md)）**:
>
> - **パッケージは `@tasuki/web-kit`。同期の部品は入口 `@tasuki/web-kit/sync` に分けた**（`useJoinRetry`・`useToolRoomSync`）。Markdown の描画（#371）は別の入口に置く。同期の入口は同期フックの側として扱い、お題・ルーレットの画面が直接読まないことをテストで固定した
> - **WS の URL と接続状態の型は `sync-client` の 1 つ**（`buildSyncUrl`・`ConnectionStatus`）。写しは `audit-web-sync-boundary.mjs` の検査 4 が拒む。timer の画面の帯の状態の型は `StatusStripState` に改名した（別の意味の型）
> - **お題・ルーレットは `useToolRoomSync` の上に作り直した。** 玄関・timer は混雑のやり直しの回数とタイマーだけを `useJoinRetry` に寄せ、失敗の仕分けはアプリに残した（玄関はまだ部屋に居ない・timer は `ui/error-action.ts`）
> - **poker の入り直しは `useJoinRetry` に寄せていない。** 待ちが拒否 1 回に結び付いてエラーの変化で畳まれ、案内も名前の有無で変わるため（寄せると振る舞いが変わる）。画面（`RoomPage.tsx`）の効果は同期フックの側の `useRoomEntry` へ移した
> - timer の同期フック（835 行）は、入口・答えの期限・画面の操作をサブフックとモジュールに分けた（611 行）

### 5.9 デザインシステム（#371・#372）

- 押せる大きさのトークン（例: `--tap-target: 2.75rem`）を `packages/ui` のトークン層に足す（2026-10-13 の判断）
- 余白と角丸は、**トークンとちょうど同じ値だけ**を置き換える。刻みに無い値は今のまま残す
- 隠し文字は `packages/ui` に置き、3 つの写しを置き換える

| 決まり | 守らせるコード |
|---|---|
| トークンの値 | `packages/ui/tests` で値を固定する |
| トークンと同じ値を直書きしない | `audit-ui-components.mjs` に「既存のトークンと同じ値の余白・角丸・押せる大きさの直書き」を拒む規則を足す（刻みに無い値は対象外）。壊して赤を確かめる |

## 6. 順番

```text
波 0（今すぐ）  #361 scripts ─┐
               #362 契約 ────┼─→ #378（文言の句点）
               #363 型 ──────┼─→ #377（合言葉の上限）
               #364 不変条件 ┼─→ #376（evolve の NaN）
               #365 片付け ──┘
波 1（今すぐ）  #366 アプリケーション層 ─→ #375（コードの衝突）
               #367 ポート
               #368 ws-adapter（#362・#363・#367 の後）
── #94 PR 3 のマージ ──
波 2           #369 同期フック → #370 画面の判断 → #374（ナビ）
               #371 表示部品 → #372 トークン
               #373（ゲストの名前の上限）
```

- 同じファイルと変異の ID に触る子 Issue は並べずに順番に進める（#316 と同じ扱い）
- #94 PR 3 が触る場所（`apps/roulette-web/**`・`packages/ui/README.md`・`packages/ui/src/tokens/palette.css`・
  `docs/guides/{architecture,development}.md`・`e2e/specs/{roulette,buttons}.spec.ts`）には、波 2 まで触らない
- 振る舞いを変える修正（#373〜#378）は、同じファイルに触るリファクタリングの後に入れる。
  リファクタリングで純粋関数や 1 つの置き場ができてからの方が、修正が 1 か所で済む

## 7. 退けた案

| 案 | 退けた理由 |
|---|---|
| X1. 一度に書き直す（ブランチを長く持つ） | 進行中の機能（#94）とぶつかり続ける。revert の単位が大きすぎる（`docs/adr/0013` 理由 1） |
| X2. 同期サーバーの汎用の枠組み（`sync-kit` の再来）を作り、timer・poker・topic・roulette を全部載せる | 呼び出しの形がツールごとに違い、共通にできる知識は §5.5 の 4 つに限られる。#20 で一度見送った判断と同じ（`docs/adr/0007`） |
| X3. timer と poker のハンドラを 1 つにまとめる | poker は独立したラウンドの帳簿を持ち、部屋 ID の方針も違う（#375）。まとめると条件分岐が増えるだけ |
| X4. 決まりごとをガイドに書き足して守らせる | 文書だけの決まりは黙って破られる（§2）。守らせるのは型・テスト・検査にする |
| X5. 振る舞いの疑いを、見つけたその場で直す | 「変えない」の確かめ方（§4.1）が成り立たなくなる。疑いは Issue にした（#373〜#378） |

## 8. 計画の置き方

- 子 Issue ごとに、**着手のときに**実装計画を `docs/superpowers/plans/YYYY-MM-DD-refactor-rN-<topic>.md` に書く
  （この文書の時点で 12 本を書かないのは、波 1・波 2 の着手時には main が動いていて、行番号と変異のパッチが古くなるため）
- 計画には `## Constitution Check` を置く（[`docs/guides/plan-writing.md`](../../guides/plan-writing.md)・`scripts/audit-plan-gate.mjs`）
- 計画に書くこと: 着手時点の実測（子 Issue の数字の更新）・特性テストの一覧（どの振る舞いをどのテストで固定するか）・
  コミットの順番・§5 の「計画で決める」の答え・変異の ID の当て直しと新しい ID・確かめる手順
- 計画で決めた答えのうち、この文書の §5 を変えるものは、この文書へ追記する（日付つき）

## 9. 決めたこと（記録）

| 日付 | 決めたこと | 決めた人 |
|---|---|---|
| 2026-10-12 | 振る舞いの疑い 6 件は、このエピックでは直さずに別の Issue にする（#373〜#378） | 利用者 |
| 2026-10-13 | 設計と計画は行う。ただし決まりごとは文書ではなくコードで守らせるのを基本にする（§2） | 利用者 |
| 2026-10-13 | React の共有パッケージを 1 つ新設する。依存の向きは `ALLOWED` で固定する（§5.8） | 利用者の方針に沿って起票者が提案 |
| 2026-10-13 | 押せる大きさのトークンを `packages/ui` に足し、テストで固定する（§5.9） | 同上 |
| 2026-10-13 | room-core の遷移を `Result` にし、`docs/adr/0017` 決定 5 にコードを合わせる（§5.4） | 同上 |
| 2026-10-13 | roulette の乱数源の契約違反を `Result` にしても、ログ（`on-message-error name=RangeError`）は今と同じに保つ（§5.4。ログが消えるのは振る舞いの変更） | 利用者 |
| 2026-10-13 | 定型バンクの `languages` は、省略可能にせず欄ごと外す（#365。全件が同じ値で、出し分けの実需が無い） | 利用者 |
