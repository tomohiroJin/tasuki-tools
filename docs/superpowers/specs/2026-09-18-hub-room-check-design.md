# 玄関で名乗る前に、ルームが消えていることを知らせる（#274）— 設計正本

- **Issue**: [#274](https://github.com/tomohiroJin/tasuki-tools/issues/274)（親 [#95](https://github.com/tomohiroJin/tasuki-tools/issues/95)）
- **起点**: [#76](https://github.com/tomohiroJin/tasuki-tools/issues/76) J-1（名前を入れる前にルームの消滅が分かる）
- **関連**: [`docs/adr/0011`](../../adr/0011-threat-model-and-data-classification.md) 決定2（脅威モデル・存在秘匿） /
  [`docs/adr/0015`](../../adr/0015-web-layer-structure.md)・[`docs/adr/0019`](../../adr/0019-web-layer-scope-includes-landing.md)（Web の層構造。LP を含む） /
  [`docs/adr/0017`](../../adr/0017-bounded-contexts-and-packages.md)（文脈分割） /
  #95 設計正本 [`2026-09-06-shared-identity-and-rooms-design.md`](2026-09-06-shared-identity-and-rooms-design.md) §5.7 /
  #103 設計正本 [`2026-08-14-ip-rate-limit-design.md`](2026-08-14-ip-rate-limit-design.md) D3

## 1. 範囲

参加用 URL（`/?room=CODE`）で玄関を開いた人が、**名乗る前に**そのルームが見つからないことを
知れるようにする。

**「終了した」とは言わない。** 玄関は理由を知らない（§3.15・D10）。Issue の表題は「消えている」と
言うが、本設計が知らせるのは**不在**であって、その原因ではない。

#249（#95 S5c）で名乗る場所を玄関 1 つへ寄せた結果、#76 J-1 が持っていたこの性質の
持ち主が居なくなった。**機構が消えたのではなく、使い方が消えた**（§3.2）。

対象は玄関へ来る 2 つの経路である。**どちらも同じ症状を持ち、同じ画面へ落とす。**

| | 誰が | いまどうなるか |
|---|---|---|
| **経路1** | 招待リンクを初めて踏んだ人（端末に復帰の組が無い） | 名乗りフォームが出る。送信して初めて不在が分かる |
| **経路2** | 復帰の組を持つ人（ツールから戻った・ブックマーク） | 読み込み中 → `ROOM_NOT_FOUND` → **名乗りフォームが出る** |

**経路2 は Issue 本文が触れていないが、症状は同じである**（§2.3）。

### 本 Issue で扱わないもの

- **合言葉の要否を名乗る前に教えること。** 照会の答えは 2 値（見つからない／黙る）に留める。
  3 値化は `JoinRoom.tsx` が明文で持つ不変条件（「合言葉は求められたときだけ出す」）と
  その理由を書き換えることになり、#274 の射程を超える
- **参加した後にルームが消えた場合の挙動。** 選択画面（`choice`）の振る舞いは変えない（D6）
- **poker の `room-not-found` 画面の移設。** poker は参加**後**の消滅にも応える必要があり、
  玄関の画面では代替できない。触るのはコメント 1 箇所だけ（D7）
- **poker の `check-room` の仕様変更。** 関門を通す現在の扱いは正しい（D2）

## 2. Issue #274 本文との差異

### 2.1 参照している行番号が誤っている

本文は「`apps/poker-web/src/pages/RoomPage.tsx:116` のコメントが『#76 J-1 の性質は、
いまハブ側の宿題である』と書いており」とするが、そのコメントは **`:85`** にある。
`:116` は #103（IP 単位のレート制限）の説明で、無関係である。

### 2.2 「性質の持ち主が居なくなった」は機構については誤り

本文は #249 で「この性質の持ち主が居なくなった」とするが、**機構は現役である**（§3.2）。
失われたのは「名乗る前に尋ねる」という**使い方**だけで、サーバーの `handleCheckRoom` も
poker-web の `checkRoom` も生きている。

### 2.3 経路2 が漏れている

本文は経路1（名乗る必要がある人）だけを扱うが、経路2 も**消えたルームの参加フォームを
見せている**。こちらは照会を必要とせず、既に手元にある `ROOM_NOT_FOUND` を画面へ結ぶだけで
直る。本設計は両方を含める（D5）。

### 2.4 「存在秘匿との兼ね合いを先に決めること」は既に決着していた

本文は「poker の `checkRoom` が何を返していたかを実測してから設計する」とするが、
ADR 0011 決定2 の 2026-09-13（#95 S5b）追記が既に決着させている（§3.3）。実測の結果、
**その決着をハブへそのまま持ち込むと嘘をつく**ことが分かった（§3.4）。

## 3. 実測した事実（2026-09-18・main `decfcef`）

### 3.1 玄関は先に名乗らせている

`apps/landing/src/screens/JoinRoom.tsx` の `submit` は `displayName` が空なら送らず、
`error` は `onJoin` の応答でしか埋まらない。**不在を知る経路が送信の後にしかない。**

### 3.2 `check-room` の機構は生きている

- サーバー: `apps/tasuki-sync/src/application/poker-handlers.ts` の `handleCheckRoom`
- 契約: `packages/poker-core/src/protocol.ts`
- 利用側: `apps/poker-web/src/hooks/useSync.ts` と `RoomPage.tsx`
  （レート制限で弾かれた人が名前を持たないときの再照会）
- 検査: `apps/tasuki-sync/test/poker/check-room.test.ts`・同 `rate-limit.test.ts`・
  `test/live-ws.tool-entry.test.ts`

### 3.3 ADR 0011 は「`check-room` も同じ関門を通す」と決めている

決定2 の #95 S5b 追記に明文がある。

> **`check-room`（生死の問い合わせ）も同じ関門を通す。** 通さないと、保護ルームの生死を
> 答える神託になる。

実装も一致する。`handleCheckRoom` は `mayEnter(room, msg.roomId, undefined)` を通す。

### 3.4 その結果、`check-room` は保護ルームを「存在しない」と答える

`mayEnter` は `findResumableParticipant`（復帰の組）か `checkPassphrase(required, undefined)`
のどちらかが通ったときだけ true を返す（`application/room-entry.ts`）。合言葉つきルームへ
`undefined` を渡せば `PASSPHRASE_REQUIRED` で落ちる。

**したがって現在の `check-room` を玄関から流用すると、合言葉を持つ正規の招待客に
「このルームは存在しません」と答える。** #274 が直したい嘘を、より悪い嘘へ置き換える。

poker にとってこれは正しい。**poker の wire には合言葉の項目が無く**（ADR 0011 決定2
S5b 追記の 3）、poker からの新規参加はそもそも成立しないためである。**ハブは事情が違う。**

### 3.5 ハブは保護ルームの存在を既に開示している

`apps/tasuki-sync/src/application/join-room.ts` の合言葉の関門は、コードも文言も分けて返す。

| 状況 | code | 文言の正本 |
|---|---|---|
| ルームが無い | `ROOM_NOT_FOUND` | `join-room.ts` の `ROOM_NOT_FOUND_MESSAGE` |
| 在るが合言葉が要る | `PASSPHRASE_REQUIRED` | `@tasuki/timer-core` の文言表 |

**ハブから見て「存在秘匿」は保護ルームについて成立していない。** ハブは合言葉を送れるので、
これは欠陥ではなく意図された開示である（選択画面で合言葉を通す導線が正規の経路）。

**既存の検査がこれを固定している。** `apps/tasuki-sync/test/live-ws.hub.test.ts` の
「合言葉で保護された timer のルーム／ハブから合言葉なしで参加する」は、
返る `code` が `PASSPHRASE_REQUIRED` であることを明示的に期待している。

### 3.6 開いているルームの静かな存在確認は、いまも成立する

poker の入口（`/ws?tool=poker`）へ `check-room` を送れば、**副作用なしに**開いているルームの
存在を確かめられる（無音＝在る）。**玄関に照会を足しても、攻撃者が得られる情報は増えない。**

### 3.7 レート制限は IP 単位で、入口をまたいで同じバケツである

`application/rate-limit-gate.ts` の `shouldReject(connId, now)` は `keyOf(connId)` で
クライアント鍵（IP の HMAC・#103）へ引き直してから数える。引数名は `connId` だが**単位は接続ではない**。
ハブの `room.join` も poker の `check-room` も同じバケツを消費する。

### 3.8 `hub-handlers.ts` のコメントが実装と食い違っている

`handleJoin` のエラー分岐にこう書いてある。

> 選択画面から総当たりされたときに、「存在しないルーム」と「入れないルーム」を区別させない（ADR 0011）

**区別させている**（§3.5）。入口ごとの門（`tool-gate.ts`）が在った S4a 当時の
「入れないルーム＝そのツールの状態が無いルーム」を指した記述が、門の廃止後も残ったものと見られる。

### 3.9 玄関の画面分岐は純粋関数に切り出されている

`apps/landing/src/hub/hub-state.ts` の `screenFor` が `create` / `join` / `choice` / `resuming`
の 4 状態を返し、`App.tsx` はその分岐だけを持つ（ADR 0015 MUST 1・ADR 0019）。
**状態を 1 つ足す形で拡張できる。**

### 3.10 `ROOM_NOT_FOUND` の受け口は玄関に既に在る

`apps/landing/src/hub/use-hub-sync.ts` は `ROOM_NOT_FOUND` を受けたら
`clearResumeIdentity` で組を捨てる分岐を持っている。**経路1と経路2の合流点にできる。**

### 3.11 E2E で「ルームを消す」手立ては要らない

ルームが消える契機は 2 つある（アイドル回収・在室者 0）が、**どちらも使わずに済む。**
存在しなかったコードで `/?room=<でたらめ>` を開けば、サーバーは同じ経路
（`store.get` → `undefined`）を通る。

### 3.12 既存の E2E は壊れない

`?room=` を直に組み立てている箇所を全て見た。

| 箇所 | なぜ影響しないか |
|---|---|
| `e2e/specs/routing.spec.ts` | HTTP の `GET` のみ。WS を張らないので照会が走らない |
| `e2e/specs/poker.spec.ts`・`timer.spec.ts` | **わざと実在するルーム**を使う。照会は無音を返す |
| `e2e/specs/landing.spec.ts`（ハブへ繋がらない） | 接続が成立しないので照会は `pending` に積まれたまま。参加画面のまま変わらない |

`landing.spec.ts` には「**作り話のコードで代用すると、参加画面が出る条件（`?room=` が
あること）しか見ないテストになる**」という明記がある。この規律が結果的に本変更を守っている。

### 3.13 E2E の中でレート制限のバケツは実際に枯れる

`e2e/specs/timer.spec.ts` に実測がある。

> **このシナリオは入室の枠を、ページ 1 枚につき 1 つ余分に使う。** […]
> #103 以降その枠は **IP 単位**で、全 worker が 1 つのバケツを共有している。
> 枯れると返るのは `JOIN_RATE_LIMITED` で［…］クライアントは 2 秒前後から待ち直して入り直す

**timer はここから自力で回復する**（`join-retry.ts` が送り直す）。**照会に送り直しが無いと
回復しない** —— バケツが枯れている間は `gone` が永久に立たず、名乗りフォームが出たままになる。
E2E が不安定になるだけでなく、**同一 NAT の利用者が同時に踏んだ実運用でも性質が効かない**。

### 3.14 poker は既に「生死の照会」を送り直している

`apps/poker-web/src/pages/RoomPage.tsx` の再試行は、`planJoinRetry` で待ってから
「名前があれば入り直す。**無ければルームの生死だけを尋ね直す**」と分岐する。
**先例が同じリポジトリに在る。**

### 3.15 不在の文言は 3 つとも理由を断定していない

| 出所 | 文言 |
|---|---|
| `join-room.ts` の `ROOM_NOT_FOUND_MESSAGE` | 指定されたルームコードが**見つかりません** |
| poker の画面の見出し | ルームが**見つかりません** |
| timer の画面の見出し | セッションが**見つかりません** |

**玄関は入れない理由を知らない。** `ROOM_NOT_FOUND` が返る理由は「終了した」「最初から
存在しなかった（打ち間違い・壊れた転送）」「同期サーバーが再起動した（本番は揮発インメモリ）」
の 3 通りある。

## 4. 決定

### D1: ハブ専用の照会 `room.check` を新設する。poker の `check-room` は流用しない

形が違うためではなく、**関門の扱いが違うため**である（D2）。`HubCommand` に変種を 1 つ足す。

### D2: `room.check` は合言葉の関門を通さない

poker の `check-room` は通す（通さないと神託になる）。**ハブは通さない**（通すと §3.4 の嘘になる）。

理由は入口の能力の差にある。**poker は合言葉を送れないので、保護ルームは「入れない」。
ハブは合言葉を送れるので、保護ルームは「入れる」。** 生死の問いに対する正しい答えが
入口ごとに違うのであって、規律が緩んだのではない。開示水準はハブの `room.join` と同じに揃う（§3.5）。

**両方の実装の doc コメントに、相手を名指しして理由を書く。** 書かないと、次に読んだ者が
「片方に関門が無い」を欠陥と見て揃えに来る。

### D3: 答えは 2 値とする。**無いときだけ応える**

- 無い → `{ type: "error", code: "ROOM_NOT_FOUND", message }`
- 在る（保護されていても）→ **何も返さない**

`HubServerMsg` に新しい型を足さない。poker の `check-room` の「無いときだけ応える」形を引き継ぐ。

**無音の意味は「生きている」ではなく「生きている、または拒否された」である**（#103 以来の約束）。
外れる向きは**不在を断定しない側にしか倒れない**ので、嘘にはならない。

### D4: レート制限の判定は照会より前に置く

`join-room.ts` と同じ順序（#103 設計正本 D3）。逆にすると、残量が無いときに
`ROOM_NOT_FOUND` が返り、**攻撃者はトークンを消費せずに存在確認を続けられる**。

消費するのは**無かったときだけ**。正常な招待客はバケツを使わない。

### D5: 照会は「復帰の組を持たない人」だけが送る

組を持つ人（経路2）へは送らない。その人には `room.join` が同じ答えを返すので、
**送ればバケツを二重に使うだけ**である。両経路は受信側の `ROOM_NOT_FOUND` で合流する（§3.10）。

**再接続したら照会し直す。** 切断中にルームが終わっていることがあり、名乗りフォームの前で
待っている人はそれを知らない。組を持つ人に対する `resumeIfPossible()` と対になる扱いである。

### D6: 画面を 1 つ足す。判定は `joined` より後に置く

`screenFor` に `gone` を足す。順序は次のとおり。

```
code === null → 'create'
joined        → 'choice'
gone          → 'gone'
resuming      → 'resuming'
それ以外       → 'join'
```

**`gone` を `joined` より前に置かない。** 置くと「参加した後にルームが消えた」場合の
選択画面の振る舞いまで変わる。それは #274 の射程外である。

### D7: poker には手を入れない（コメント 1 箇所を除く）

`RoomPage.tsx` の「ハブ側の宿題である」は事実でなくなるので書き換える。
**完了形ではなく現在形で性質を書く**（規範文書が現況について嘘をつくのを避ける規律）。

### D8: `hub-handlers.ts` の食い違うコメント（§3.8）を本 PR で直す

実装は変えない。**コメントの書き換えだけ**である。本 PR は「ハブが存在について何を開示するか」を
扱い、ADR 0011 へ同じ論点の追補を書く。離すと片方だけが正しくなる。

### D9: 照会がレート制限で弾かれたら、待ってから送り直す

待ち方は既存の `joinRetryDelayMs`（`@tasuki/sync-client` の `join-retry.ts`）を使う。
**即時に送り直してはならない。**

送り直さないと、バケツが枯れている間は性質そのものが効かない（§3.13）。
**poker は既に同じことをしている**（§3.14）ので、ハブだけやらないと同じ性質の実装が
入口ごとに割れる。

**照会の返事か入室の返事かは `lastJoinRef.current` で見分ける。** `null` は「まだ名乗っていない」
＝照会しか送っていないことを意味する。エラーのフレームに相関の手がかりが無いための判別だが、
**送信した側の状態で決まるので曖昧さは無い**（経路2 の人は復帰の前に `lastJoinRef` が埋まる）。

### D10: 画面の見出しは「ルームが見つかりません」。理由を断定しない

**玄関は入れない理由を知らない**（§3.15）。「終了しています」と書くと、打ち間違いや
壊れた転送で来た人に嘘をつく。既存の 3 つの文言と揃え、本文の側で「終了したか、URL が
正しくない可能性がある」と幅を持たせる。

poker の画面と見出しが同じ文字列になるが、別ページなので検査は衝突しない。
**揃っていること自体に価値がある**（同じ出来事を 2 通りの言い方で呼ばない）。

## 5. 設計

### 5.1 wire（`packages/room-core/src/wire.ts`）

`HubCommand` に変種を足す。`HubServerMsg` は変えない。

```ts
| { command: "room.check"; code: string }
```

```ts
v.strictObject({ command: v.literal("room.check"), code: nonEmptyString }),
```

**ここだけ strict にする。** 余剰フィールドを拒むのは `docs/adr/0011` 決定2 の脅威 S3 が
MUST とする規律で、poker の `ClientMessage`（`packages/poker-core/src/protocol.ts`）は
既に `v.strictObject` で揃えてある。**同じファイルの `room.create` / `room.join` が
非 strict なのは古い取り決めの名残である** —— このファイル冒頭が挙げる非 strict の理由
（サーバーが項目を足したとき、古いクライアントがフレームごと捨てるのを避ける）は
**サーバーから画面へ送る `HubServerMsg` の話**であって、画面からサーバーへ送るコマンドには
当てはまらない。新設のこのコマンドには古いクライアントが居ないので、厳しい側から始める。
**あの 2 つを strict にするのは #274 の射程外**（申し送り）。

公開記号は増えない（`HubCommand` / `HubCommandSchema` は既に公開契約にある）。

### 5.2 サーバー（`apps/tasuki-sync/src/application/check-room.ts`・新設）

`joinRoom` と同じ形の判定を置く。WS を持ち込まずに単体で試せる。

```ts
export function checkRoom(deps, input): Result<undefined, ErrorCode> {
  const rateNow = performance.now();
  if (deps.rateLimitGate.shouldReject(input.connId, rateNow)) return err("JOIN_RATE_LIMITED");
  if (deps.store.get(input.code) === undefined) {
    deps.rateLimitGate.consume(input.connId, rateNow);
    return err("ROOM_NOT_FOUND");
  }
  return ok(undefined);
}
```

意識的に**やらない**こと。

- **`mayEnter` を通さない**（D2）
- **名簿に触らない。** `store.get` の読みだけ。接続を付けない・ツール状態を作らない・
  ラウンドを作らない（poker の `handleCheckRoom` が `detachFromCurrentRoom` を呼ばないのと同じ規律）
- **表示名の検証を通さない。** 名前を受け取らないコマンドである

`hub-handlers.ts` に `handleCheck` を足し、`handleMessage` の分岐を 3 つにする。
文言の引き方は `handleJoin` と同じ（`ROOM_NOT_FOUND_MESSAGE` / `errorMessageFor`）。

### 5.3 玄関のフック（`apps/landing/src/hub/use-hub-sync.ts`）

状態 `gone: boolean` を足す。

**送信** —— 接続の effect の中で、復帰の組を持たない人だけに送る。
`SyncConnection.send` は未接続でも `pending` へ積むので、接続の確立を待たない。

```ts
if (initialCode !== null && loadResumeIdentity(initialCode) === null) {
  send({ command: 'room.check', code: initialCode });
}
```

`onReconnected` でも同じ条件で送り直す（D5）。

**受信** —— 既存の `ROOM_NOT_FOUND` の分岐で `gone` を立て、**早期 return する**。

```ts
if (msg.code === 'ROOM_NOT_FOUND' && codeRef.current !== null) {
  clearResumeIdentity(codeRef.current);
  setGone(true);
  return;
}
```

早期 return するのは、`gone` 画面へ落ちる以上、参加画面用のエラー文言を残すと
**同じことを 2 通りの言い方で出す**ことになるためである。

`room.created` / `room.joined` を受けたら `gone` を降ろす（他の状態の初期化と揃える）。

**`JOIN_RATE_LIMITED` では `gone` を立てない。** 代わりに**待ってから照会を送り直す**（D9）。
既存の自動再試行の分岐は `lastJoinRef.current === null` で `setError` へ落ちているので、
そこを分ける。

```ts
if (msg.code === 'JOIN_RATE_LIMITED') {
  const attempt = (retryRef.current += 1);
  const delay = joinRetryDelayMs(attempt);
  const last = lastJoinRef.current;
  const target = codeRef.current;
  if (delay === null || target === null) { setError(msg.message); return; }
  setError(msg.message);
  setTimeout(() => {
    // `last === null` は「まだ名乗っていない」＝照会しか送っていない（D9）。
    if (last === null) send({ command: 'room.check', code: target });
    else send({ command: 'room.join', code: target, ...（既存の入室の送り直しのまま） });
  }, delay);
  return;
}
```

`retryRef` は入室の再試行と共有する。**照会と入室が同時に飛ぶことはない**（照会は名乗る前、
入室は名乗った後）うえ、`joinRoom` が呼ばれた時点で 0 に戻るためである。

### 5.4 画面（`apps/landing/src/screens/RoomGone.tsx`・新設）

`Resuming.tsx` と同じ骨格。`JoinRoom` からフォームだけを抜いた形になる。

- **見出しは「ルームが見つかりません」**（D10）。理由を断定しない
- 見出しの近くにルームコード（`hub-room-code`）—— どのリンクが死んでいるかを示す
- 本文で幅を持たせる（終了したか、URL が正しくない可能性がある）。
  `hub-notice` / `role="status"`。画面そのものが替わるので `role="alert"` にしない
- **戻る道**: 玄関（`/`）へ＝新しいルームを作る
- `HistoryLink roomCode={null}` —— ルームに入っていなくても端末の記録は見られる
- **`departure` の告知はここでは出さない**（`Resuming` と同じ扱い）。
  退出の告知と不在の告知を並べると冗長になる

意匠は #270 で整えた玄関に合わせ、**新しいクラスを作らない**（`page landing` /
`landing-hero` / `wordmark` / `hub-notice` を使い回す）。

### 5.5 規範文書

| 文書 | 何を書くか |
|---|---|
| `docs/adr/0011` 決定2 | ハブの照会は関門を通さない理由（D2）。⚠ **追記は末尾へ** |
| #95 設計正本 §5.7 | 画面の表に `gone` の行 |
| `hub-state.ts` の doc コメントの表 | 同じ行（§5.7 と対になっている） |
| `RoomPage.tsx` の入口コメント | 「宿題である」を現在形の性質へ書き換える（D7） |
| `hub-handlers.ts` の `handleJoin` | 食い違うコメントを実装に合わせる（D8・§3.8） |

## 6. 検証

### 6.1 EARS

| # | 振る舞い |
|---|---|
| **E1** | 利用者が参加用 URL で玄関を開いたとき、そのルームが存在しない場合、システムは名前の入力を求める前にそれを知らせること |
| **E2** | 端末に復帰の組を持つ利用者が参加用 URL で玄関を開いたとき、そのルームが存在しない場合、システムは名乗りフォームを出さずにそれを知らせること |
| **E3** | 玄関がルームの生死を尋ねたとき、そのルームが合言葉で保護されている場合、システムは「存在しない」と答えないこと |
| **E4** | 玄関がルームの生死を尋ねたとき、レート制限の残量が無い場合、システムはルームを照会しないこと |
| **E5** | 玄関がルームの生死を尋ねたとき、そのルームが存在する場合、システムは何も返さないこと |
| **E6** | 利用者がルームの不在を知らされたとき、システムは玄関へ戻る道を示すこと |
| **E7** | 玄関の照会がレート制限で拒否されたとき、システムはルームの不在を断定しないこと |
| **E8** | 端末に復帰の組を持つ利用者が参加用 URL で玄関を開いたとき、システムは生死の照会を送らないこと |
| **E9** | 玄関の照会がレート制限で拒否されたとき、システムは待ってから照会を送り直すこと |
| **E10** | 利用者にルームの不在を知らせるとき、システムはその理由を断定しないこと |

### 6.2 EARS と検査の対応

**完了条件の突合はこの表で行う**（主張ではなく手段を指定する）。

| EARS | 検査 |
|---|---|
| E1 | `apps/landing/tests/hub/use-hub-sync.test.tsx`（照会を送る・`gone` が立つ）＋ `hub-state.test.ts`（`gone` 画面へ落ちる）＋ E2E |
| E2 | `use-hub-sync.test.tsx`（組を持つ人が `ROOM_NOT_FOUND` で `gone` になる） |
| **E3** | `apps/tasuki-sync/test/live-ws.hub.test.ts`（**保護ルームを実プロトコル越しに照会して無音**）。⚠ **単体（`check-room.test.ts`）では見られない** —— `checkRoom` は合言葉を参照しないので、単体のこの主張は恒真になる。合言葉を掛ける経路は timer の `room.passphrase.set` なので、実 WS でしか組めない |
| E4 | `check-room.test.ts`（残量なしでストアを引かない） |
| E5 | `check-room.test.ts`＋`test/live-ws.hub.test.ts`（実プロトコルで無音） |
| E6 | `apps/landing/tests/hub/room-gone.test.tsx`（戻る道・フォームの不在） |
| E7 | `use-hub-sync.test.tsx`（`JOIN_RATE_LIMITED` では `gone` にならない） |
| E8 | `use-hub-sync.test.tsx`（組が在れば照会を送らない） |
| **E9** | `use-hub-sync.test.tsx`（`JOIN_RATE_LIMITED` の後、待ってから `room.check` を送り直す。**即時に送らないこと**も見る） |
| E10 | `room-gone.test.tsx`（見出しが理由を断定しない文言であること） |
| 契約 | `packages/room-core/tests/wire.test.ts`（`room.check` が通る・空の `code` は弾く） |

**E3 の 1 本が最も重い。** §3.4 の嘘を止めている唯一の検査であり、ここが恒真化すると
`mayEnter` を足したくなった者が黙って通せる。

### 6.3 破壊検証（DoD 3）

追加した検査ごとに、実装を壊して赤くなることを確かめてから戻す。

⚠ **入る前に `git status --porcelain` が空であることを見る**（`git checkout --` で未コミットの
実装を消した事故が過去に 4 度ある）。**壊して緑になったら手元を疑う。**

対照実行も置く —— 壊さずに緑になることを先に見る。

### 6.4 変異検査（DoD 4）

書き換える既存実装は `use-hub-sync.ts`・`hub-state.ts`・`hub-handlers.ts` の 3 つ。
**変異検査の後に `git status --porcelain` が空であることを確認する。**

### 6.5 E2E（DoD 2）

利用者の通る経路が変わるので**該当する**。**1 本**を `e2e/specs/landing.spec.ts` へ足す。

```
Given 存在しないルームコードの参加用 URL
When  玄関を開く
Then  名乗りフォームが出ないまま、見つからないことと戻る道が示される
```

- **ルームを消す必要はない**（§3.11）。存在しなかったコードで同じ経路を踏む
- **タグは既存の `@core` を使う。新しいタグを足さない**
  （`e2e/tests/spec-tags.test.ts` が本番へ漏れる事故を見張っている）
- ⚠ **このシナリオは入室の枠を 1 つ使う**（`room.check` は無かったときだけ消費する・D4）。
  `timer.spec.ts` が同じ性質を持つので、その doc コメントに倣って**ここにも書き残す**
- ⚠ **フォームの不在は「無いことの確認」なので空振りしやすい。**
  否定の判定だけに頼らず、**見出しが出ることを先に待ってから**フォームの不在を見る。
  待たずに不在だけを見ると、まだ描画されていないだけの画面に対して緑になる
- 経路2（復帰の組を持つ人）は単体テストで押さえる。E2E で作るには `localStorage` に
  死んだルームの組を仕込む必要があり、**得られるものに対して仕掛けが重い**

## 7. 残るリスクと申し送り

- **送り直しても枯れ続けていれば、照会は諦める**（D9・`joinRetryDelayMs` が `null` を返す）。
  そのとき利用者は名乗りフォームを見る。**不在を断定しない側にしか外れない**ので許容する。
  同一 NAT の利用者がバケツを共有する（#103）ため、消えたリンクを大勢が同時に踏むと起きうる
- **`retryRef` を入室の再試行と共有している**（5.3）。「照会と入室が同時に飛ばない」という
  前提に乗っており、その前提は `lastJoinRef` の埋まる順序が保っている。**順序を変えるときは
  ここが壊れる**
- **同じ「生死の照会」が 2 つになる**（poker の `check-room` とハブの `room.check`）。
  関門の扱いが逆なので、**片方に揃えようとする変更が将来必ず来る**。D2 の doc コメントと
  E3 の検査が防波堤である
- **3 値化（合言葉の要否を先に返す）は別 Issue にできる。** 本設計は 2 値で閉じており、
  `HubServerMsg` を変えていないので、足すときの土台は壊れていない
- **経路2 の `gone` は照会を必要としない。** 仮に `room.check` を将来やめても、経路2 の
  振る舞いは残る
- ⚠ **配布は同期サーバーが先。** `room.check` は画面 → サーバーの新しいコマンドで、
  玄関（`deploy.sh landing`）と同期サーバー（`deploy.sh timer`）は別々の配布である。
  **玄関を先に配ると、新しい玄関が旧サーバーへ `room.check` を送り、`INVALID_COMMAND`
  が返る** —— 招待リンクで来た全員（生きているルームの客も含む）が参加フォームに
  赤い文言を見る。**`deploy.sh timer` → `deploy.sh landing` の順で配ること。**
  `pnpm e2e:prod` の `@core #274` は両方が配られるまで必ず落ちるので、**検証は最後に回す**

## 8. 成果物

| 種別 | パス |
|---|---|
| 新設 | `apps/tasuki-sync/src/application/check-room.ts` |
| 新設 | `apps/landing/src/screens/RoomGone.tsx` |
| 新設 | `apps/tasuki-sync/test/check-room.test.ts` |
| 新設 | `apps/landing/tests/hub/room-gone.test.tsx` |
| 変更 | `packages/room-core/src/wire.ts` / `packages/room-core/tests/wire.test.ts` |
| 変更 | `apps/tasuki-sync/src/application/hub-handlers.ts` / `poker-handlers.ts`（コメント） |
| 変更 | `apps/tasuki-sync/test/live-ws.hub.test.ts` |
| 変更 | `apps/landing/src/hub/use-hub-sync.ts` / `hub-state.ts` / `App.tsx` |
| 変更 | `apps/landing/tests/hub/use-hub-sync.test.tsx` / `hub-state.test.ts` |
| 変更 | `apps/poker-web/src/pages/RoomPage.tsx`（コメント） |
| 変更 | `e2e/specs/landing.spec.ts`（シナリオを 1 本追加・`@core`） |
| 変更 | `docs/adr/0011-threat-model-and-data-classification.md` |
| 変更 | `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md` §5.7 |
