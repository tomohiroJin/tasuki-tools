# セキュリティガイド

## このガイドの位置づけ

**「今日どう書くか」の正本はこのガイドです。** 何を守るか（データ 4 分類・脅威モデル
S1〜S13）は [`docs/adr/0011`](../adr/0011-threat-model-and-data-classification.md)、
どう守るか（ログ・秘密・開示の決定 D1〜D12）は
[`docs/adr/0012`](../adr/0012-logging-secrets-and-disclosure.md) が定めています。
決定の根拠・数値・理由はそちらを読んでください。このガイドは根拠を繰り返さず、
手順とコード例だけを持ちます（`docs/adr/0002` の三層構造・二重正本の禁止）。

対象は主に `apps/timer-sync`（ログ経路が実装済み）です。`apps/poker-sync` も
同じ規範に従いますが、ログ経路の移行は本ガイド執筆時点で未着手です。

## 新しい値を足すときの手順

新しい入力・保持・出力を設計するときは、次の順で決めます（憲法 原則 XI、
[`docs/adr/0011`](../adr/0011-threat-model-and-data-classification.md) 決定1 MUST）。

1. **分類を決める。** [`docs/adr/0011`](../adr/0011-threat-model-and-data-classification.md)
   決定1 の 4 分類（秘密 / 資格情報 / 個人に紐づく / 公開可）のどれに当たるかを最初に
   決めます。どれにも明確に当てはまらない値は、より厳しい分類（秘密に近い側）を
   仮に割り当てます。
2. **分類の扱いに従う。** 秘密・資格情報・個人に紐づく情報は、ログ・snapshot・
   永続化へ出しません。公開可の値だけが制約なく出せます（表の詳細は同 ADR 決定1）。
3. **ログへ出す必要があるなら相関 ID を使う。** 資格情報（ルームコード・
   `resumeToken` など）や個人に紐づく情報（IP アドレス）をログの中で追跡したい
   場合は、値そのものではなく `RefEncoder` が発行する相関 ID を使います
   （下記「ロガの使い方」）。部分表示（先頭 N 文字など）は採りません
   （[`docs/adr/0012`](../adr/0012-logging-secrets-and-disclosure.md) 決定 D2）。

## ロガの使い方

制御されたロガ 1 本（`apps/timer-sync/src/application/log/logger.ts`）が
`apps/timer-sync` の出力口です。実際の書き出しは `LogSink`（アダプタ）へ委ね、
本番は唯一の実出力口 `apps/timer-sync/src/adapters/console-log-sink.ts` を使います。

```typescript
import { createLogger } from "./application/log/logger.js";
import { consoleLogSink } from "./adapters/console-log-sink.js";

const logger = createLogger(consoleLogSink);

logger.info("reclaimed", { room: refEncoder.room(code), idleMs });
logger.warn("ai.skip", {
  room: refEncoder.room(roomCode),
  req: refEncoder.request(requestId),
  reason: AI_SKIP_REASONS[acquired.reason],
});
```

`Logger` は `info` / `warn` / `error` の 3 段のみで、`event`（文字列）と、任意の
`fields: Record<string, LogField>` を取ります。`event` はコード側で決め打つ短い
識別子（`"reclaimed"` `"ai.skip"` 等）で、`journalctl -u tasuki-sync | grep <event>`
で追える形にします。

**`LogField` は `number | boolean | LogSafe` だけを受け付け、生の `string` は
含みません**（`apps/timer-sync/src/application/log/log-safe.ts`）。文字列を出したい
場合は、次のいずれかを経由します。

- **ルームコード**は `refEncoder.room(code)`、**`requestId`** は
  `refEncoder.request(id)` を通す
  （`apps/timer-sync/src/application/log/ref-encoder.ts` の `RefEncoder`）。
  種別ごとに名前空間が分かれた相関 ID（`r_xxxxxxxx` / `q_xxxxxxxx`）を返します。
  `RefEncoder` はプロセス起動ごとのランダムなソルトから作るので、
  `createRefEncoder(salt)` で 1 度だけ組み立てて使い回します。
- **決まった語彙**（AI 生成のスキップ理由・失敗理由など）は
  `apps/timer-sync/src/application/log/vocabulary.ts` の定数
  （`AI_SKIP_REASONS` / `AI_FAILURE_REASONS`）を引きます。
- **既定値どおりかどうか**のような、値そのものではなく真偽で足りる情報は
  `boolean` のまま渡します（例: `logger.info("admin", { enabled: config.adminToken !== undefined })`）。
  運用者が env で設定した自由文字列（`host` 等）は、値をそのまま出さず
  「既定から外れているか」を真偽値にして出す設計にします。

### 新しい語彙を足すとき

ログへ出したい固定文字列（新しい理由コードなど）が増えたら、
`apps/timer-sync/src/application/log/vocabulary.ts` に定数として足します。
呼び出し側は定数を引くだけにして、`publicText()` の呼び出し自体は増やしません。

### 例外: 例外オブジェクトの分類名

`publicText()` は本来 `vocabulary.ts` の中でのみ呼びます（下記「やっては
いけないこと」）。唯一の例外が、捕捉した例外オブジェクトの**分類名**
（`err.name`。`TypeError` のような固定のクラス名で、内容は含まない）を出す
箇所です。`apps/timer-sync/src/server.ts` と
`apps/timer-sync/src/adapters/ws-adapter.ts` がこの形を採っています。

```typescript
logger.error("uncaught", { name: publicText(err.name) }); // log-hygiene:allow 例外の分類のみ
```

この形を使うときは、必ず `// log-hygiene:allow <理由>` を同じ行に付けます。
理由なしに `publicText()` を呼び出し箇所へ増やさないでください。

## やってはいけないこと

- **`publicText()` を `vocabulary.ts` の外で呼ぶ。**
  （唯一の例外は上記「例外オブジェクトの分類名」。それ以外は `vocabulary.ts` に
  定数として足す）
- **`console` を直接呼ぶ。** 実出力口は
  `apps/timer-sync/src/adapters/console-log-sink.ts` の 1 箇所だけです。
  それ以外から `console.log` / `console.warn` / `console.error` を呼びません
  （[`docs/adr/0012`](../adr/0012-logging-secrets-and-disclosure.md) 決定 D1）。
- **`as LogSafe` で直接キャストする。** `LogSafe` は型の壁であり、抜け道は
  `publicText()` の 1 関数に集約します。`as LogSafe` を書いた時点でその壁は
  意味を失います。
- **部分表示でマスクする。** ルームコードの先頭数文字だけを出す、のような
  「一部だけなら安全」という判断は採りません。推測困難な部分が元々狭いため、
  数文字の露出で探索空間が縮みます（[`docs/adr/0012`](../adr/0012-logging-secrets-and-disclosure.md)
  決定 D2）。追跡が要るなら相関 ID を使います。
- **例外の `message` をログへ出す。** 例外メッセージは資格情報や内部状態を
  含みうる自由文です。出してよいのは `err.name` のような分類名だけです
  （上記「例外オブジェクトの分類名」）。利用者へ返すエラーも同様にエラーコードと
  固定文言のみで構成し、例外メッセージ・スタックトレースを含めません
  （同 ADR 決定 D5）。

## 秘密を比較するとき

秘密・資格情報を比較する処理（管理トークン・AI 解錠合言葉など）は、必ず
`constantTimeEqual`（`apps/timer-sync/src/application/secure-compare.ts`）を使います。
`===` による通常の文字列比較はタイミングサイドチャネルの対象になります。

```typescript
import { constantTimeEqual } from "./secure-compare.js";

const matched = constantTimeEqual(provided, expected);
```

長さが違う場合は比較そのものを行わず即 `false` を返す実装になっています
（`timingSafeEqual` は長さ不一致で例外を投げるため）。

## レビュー時のチェックリスト

ログ・秘密の扱いに関わる差分をレビューするときは、次の 5 項目を確認します。

1. [ ] **新しい値の分類を決めたか。** 追加された入力・保持・出力が
   [`docs/adr/0011`](../adr/0011-threat-model-and-data-classification.md) 決定1 の
   4 分類のどれかに位置づけられているか。
2. [ ] **`LogField` に生の `string` を渡していないか。** ロガの呼び出しに、
   `refEncoder` を通していない `string` や `publicText()` の新規呼び出しが
   紛れ込んでいないか。
3. [ ] **`console` の直接呼び出しが増えていないか。**
   `apps/timer-sync/src/adapters/console-log-sink.ts` 以外に `console.*` が
   追加されていないか。
4. [ ] **例外の扱いが正しいか。** ログや利用者向けエラーへ `message` や
   スタックトレースを出していないか。出してよいのは分類名（`err.name`）と
   固定のエラーコードだけか。
5. [ ] **秘密の比較に `===` を使っていないか。** 秘密・資格情報の比較箇所は
   すべて `constantTimeEqual` を経由しているか。

## 関連

- 何を守るか: [`docs/adr/0011`](../adr/0011-threat-model-and-data-classification.md)（脅威モデルとデータ分類）
- どう守るか: [`docs/adr/0012`](../adr/0012-logging-secrets-and-disclosure.md)（ログ・秘密・開示の取り扱い）
- 書き分けの規則: [`docs/adr/0002`](../adr/0002-document-system-three-layers.md)（文書体系の三層構造）
- 憲法 原則 XI（秘密と個人情報を持ち込まない）: `.specify/memory/constitution.md`
