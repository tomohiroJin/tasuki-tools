# ADR-0003: サーバー→クライアントの `error` フレームを前方互換にする

- **ステータス**: Accepted（2026-08-31）
- **関連**: [#214](https://github.com/tomohiroJin/tasuki-tools/issues/214)（本 ADR の作業。
  [`0002`](./0002-discarded-frame-disclosure.md) からの切り出し）/
  [`docs/adr/0005`](../../adr/0005-result-and-boundary-validation.md)（Result と境界検証）/
  [`docs/timer/adr/0006`](../../timer/adr/0006-result-and-boundary-validation.md)（timer 側の同じ問題への決定）

## 背景

`ServerMessageSchema` の `error` は `v.strictObject` と `v.picklist(ERROR_CODES)` で
書かれており、**サーバーが少しでも新しいものを送ると、フレームを丸ごと捨てる**。

poker の `error` フレームは、次の 2 つの**唯一の引き金**である。

- 消えたルームのリンクを開いたときの案内（[#76](https://github.com/tomohiroJin/tasuki-tools/issues/76) J-1・`room-not-found`）
- 混雑で入室を拒まれたときの自動再試行（[#147](https://github.com/tomohiroJin/tasuki-tools/issues/147)・`rate-limited`）

`0002` で**捨てたことは伝わる**ようになったが、元の用は果たされない。利用者に見えるのは
「同期できていません」の告知だけで、参加ボタンを押しても何も起きない。

### 実測（2026-08-31）

`error` フレームに何を足すと捨てられるかを、poker と timer の両方で測った。

| 入力（`error` フレーム） | poker（現状） | timer |
|---|---|---|
| 既知 `code` | 通る | 通る |
| **未知 `code`** | **捨てる** | 通る |
| **既知 `code` ＋ 余剰キー** | **捨てる** | 通る |
| 空 `code` | 捨てる | 捨てる |

**timer 側に同じ穴は無い。** `ServerMsgSchema` の `ErrorMsg` は `v.object` と
`nonEmptyString` で書かれており、未知のコードも余剰キーも通す。未知のコードは
`displayMessageFor()` が既定文言へ畳む。**#214 が「timer 側にも同じ穴があるか実測せよ」と
申し送っていた件は、これで解決とする。**

実測は poker 側で 2 つの経路を明らかにした。**#214 の本文は前者しか挙げていなかった。**

1. **未知の `code`。** `ERROR_CODES` は既に 2 度増えている（#63・#103）。サーバーが
   新しい `code` を返し、ブラウザが古いバンドルを掴んでいると起きる。デプロイ直後に
   開きっぱなしのタブがこの状態になりうる。
2. **既知の `code` ＋ 余剰キー。** `v.strictObject` は宣言されていないキーを拒む。
   サーバーが `error` に任意フィールドを 1 つ足しただけで、**古いバンドルは
   `room-not-found` すら受け取れなくなる。**

## 決定

**`error` フレームだけを前方互換にし、未知のコードは境界で畳む。**

### 1. 緩めるのは `error` フレームだけ

```ts
v.object({                                  // strictObject → object
  type: v.literal('error'),
  code: v.pipe(v.string(), v.minLength(1)), // picklist(ERROR_CODES) → 非空文字列
  message: v.string(),
}),
```

`joined` / `room-state` は `v.strictObject` のまま**厳格に保つ**。この 2 つは画面の
描画に使う値をそのまま運ぶため、型が緩むと画面のロジックが壊れやすい。
**同じ前方互換の穴はこの 2 つにもある**（サーバーが `room-state` に新しいフィールドを
足すと、古いバンドルは全部捨てて画面が固まる）が、`error` とは別に計るべきものとして
[#216](https://github.com/tomohiroJin/tasuki-tools/issues/216) へ申し送る。

**空の `code` は引き続き捨てる。** 意味を持たない値まで通す理由がなく、timer も同じ判定である。

> **これは `0002` の「影響」節の「共有パッケージは変更しない」を覆す。**
> あちらは「落ちた項目の経路で選り分けない」という決定の帰結として共有パッケージに
> 触れずに済んだだけで、契約そのものを据え置くと決めたわけではない。
> 本 ADR は経路を使わない点では `0002` 決定 2 を踏襲しており、**契約の側を広げる**。

> **これは既存の決定も覆す。** `packages/poker-core/tests/protocol.test.ts` の
> 「異常系: ERROR_CODES に無いコードは err になる（**画面が知らないコードを
> 受け取らない**）」は、未知のコードを拒むことを意図した検査だった。
> **その意図は「画面が知らないコードで専用の処理をしない」ことで満たせる**（決定 2）。
> フレームごと捨てる必要はない。検査は前方互換を確かめるものへ書き換える。

### 2. 未知の `code` は境界で `null` に畳む

`code` を素の文字列にすると、`RoomPage.tsx` にある 4 つの
`sync.error?.code === 'room-not-found'` などが**綴りを誤っても型検査を通る**ようになる。
そこで境界で畳む。

```ts
// poker-core
export function isKnownErrorCode(code: string): code is ErrorCode

// useSync
export interface SyncError {
  /** サーバーが増やした未知のコードは null（意味を知らないので専用の扱いはしない） */
  code: ErrorCode | null;
  message: string;
}
```

**`ERROR_CODES` と `ErrorCode` は残す。** 役割が「受信を検証する集合」から
「**サーバーが送るコードの正本**であり、既知判定の集合」へ変わるだけである。

この畳み込みによって **`RoomPage.tsx` は 1 行も変わらない。** 未知のコードは `null` に
なるので専用画面にも再試行にも入らず、汎用のエラー表示だけが出る。
**未知のコードで専用画面や再試行を動かそうとはしない** —— 意味を知らないコードから
利用者への案内を推測すれば、無関係な対処へ誘導することになる（`0002` 決定 1 と同じ理由）。

### 3. 表示はサーバーの `message`。空のときだけ既定文言

poker はもともとサーバーが送った `message` をそのまま描いている（timer は逆に
`code` からクライアント側の文言を引き当てる）。**未知のコードでもこれを変えない。**
未知のコードの意味を知っているのはサーバーだけであり、古いバンドルにとって
`message` は唯一の情報源である。クライアント側の固定文言へ畳むと、サーバーが
用意した正確な案内を捨てることになる。

`message` は React が描くのでエスケープされる（`.claude/rules/security.md` の XSS 対策）。

ただし `v.string()` は空文字を許すため、**空の `message` だとエラー表示が空の箱になる**。
境界で既定文言へ逃がす。既定文言は `packages/poker-core/src/error-messages.ts` に置く
（timer-core の `DEFAULT_ERROR_MESSAGE` と同じ位置づけ）。

### 4. 送信側は縛ったまま

`apps/poker-sync` の `sendError(code: ErrorCode, ...)` は変えない。**受信側が広く受ける
ことと、送信側が好き勝手に送ってよいことは別である。** 新しいコードを足すときは
`ERROR_CODES` に加える手順を保つ（そうしないと `error-messages.ts` や
`contracts/ws-protocol.md` との対応が切れる）。

## 影響

- `packages/poker-core/src/protocol.ts`（契約）と `error-messages.ts`（既定文言）、
  `apps/poker-web/src/hooks/useSync.ts`（畳み込み）が変わる。
  **`RoomPage.tsx` と `apps/poker-sync` は変わらない。**
- **未知の `code` を持つ `error` では、`0002` の `stale` 告知が出なくなる**
  （捨てなくなるため）。`0002` 決定 2 の実測表にある「未知の `code` を持つ `error`」の
  行は、本決定の後は再現しない。**表の結論（経路では選り分けられない）は残る 3 行で
  保たれる**ため、`0002` には注記だけを入れて表は残す。
- `docs/poker/specs/001-planning-poker-mvp/contracts/ws-protocol.md` に
  前方互換の但し書きを足す。
- 公開 URL・正常時の画面の挙動は変えない。

## 残っている問題（本決定の範囲外）

- **`joined` / `room-state` は前方互換ではない。** 決定 1 のとおり
  [#216](https://github.com/tomohiroJin/tasuki-tools/issues/216) で扱う。
